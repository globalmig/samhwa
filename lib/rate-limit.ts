/**
 * 로그인 시도 제한(계정/IP 기준) — 메모리 기반. nssm으로 단일 Node 프로세스만 떠 있는
 * 배포 구조라 인스턴스 간 공유는 필요 없지만, 서버 재시작 시 카운터는 초기화된다.
 */

interface Attempt {
  count: number;
  windowStart: number;
  lockedUntil?: number;
}

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const LOCK_MS = 15 * 60 * 1000;

const store = new Map<string, Attempt>();

const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, a] of store) {
    if ((a.lockedUntil ?? 0) < now && now - a.windowStart > WINDOW_MS) {
      store.delete(key);
    }
  }
}, 10 * 60 * 1000);
cleanupTimer.unref();

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
}

export function checkLoginRateLimit(key: string): RateLimitResult {
  const now = Date.now();
  const a = store.get(key);
  if (a?.lockedUntil && a.lockedUntil > now) {
    return { allowed: false, retryAfterSeconds: Math.ceil((a.lockedUntil - now) / 1000) };
  }
  return { allowed: true };
}

export function recordLoginFailure(key: string): RateLimitResult {
  const now = Date.now();
  let a = store.get(key);
  if (!a || now - a.windowStart > WINDOW_MS) {
    a = { count: 0, windowStart: now };
  }
  a.count += 1;
  if (a.count >= MAX_ATTEMPTS) {
    a.lockedUntil = now + LOCK_MS;
  }
  store.set(key, a);
  if (a.lockedUntil && a.lockedUntil > now) {
    return { allowed: false, retryAfterSeconds: Math.ceil((a.lockedUntil - now) / 1000) };
  }
  return { allowed: true };
}

export function resetLoginRateLimit(key: string) {
  store.delete(key);
}

// 로그인 잠금과 별개로 "1시간에 N건까지" 같은 단순 횟수 제한이 필요한 곳(메일 발송 등)에서 쓰는
// 슬라이딩 윈도우 카운터 — 매번 DB에 COUNT 쿼리를 날리는 대신 메모리에서 O(1)로 처리한다.
interface QuotaWindow {
  count: number;
  windowStart: number;
}

const quotaStore = new Map<string, QuotaWindow>();

const quotaCleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, w] of quotaStore) {
    if (now - w.windowStart > 60 * 60 * 1000) quotaStore.delete(key);
  }
}, 10 * 60 * 1000);
quotaCleanupTimer.unref();

/** key에 대해 windowMs 동안 maxCount번까지만 true(허용)를 반환한다. 호출할 때마다 1건씩 소모한다. */
export function consumeQuota(key: string, windowMs: number, maxCount: number): boolean {
  const now = Date.now();
  let w = quotaStore.get(key);
  if (!w || now - w.windowStart > windowMs) {
    w = { count: 0, windowStart: now };
  }
  w.count += 1;
  quotaStore.set(key, w);
  return w.count <= maxCount;
}

// X-Forwarded-For/X-Real-IP는 리버스 프록시가 실제 클라이언트 접속 주소로 덮어써야만 믿을 수
// 있다. deploy.bat/nssm 구성을 보면 이 앱은 IIS·nginx 없이 `next start`가 직접 요청을 받으므로
// 이 헤더는 클라이언트가 임의로 지정할 수 있다 — 그대로 신뢰하면 요청마다 다른 값을 보내 IP 기준
// 로그인 잠금을 무한정 우회하거나, 반대로 남의 IP를 넣어 그 IP를 잠글 수 있다. 실제로 신뢰 가능한
// 프록시 뒤에 배포하게 되면 TRUST_PROXY_HEADERS=1로 명시적으로 켠다.
export function getClientIp(request: Request): string | null {
  if (process.env.TRUST_PROXY_HEADERS !== "1") return null;
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();
  return null;
}
