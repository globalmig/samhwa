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

export function getClientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}
