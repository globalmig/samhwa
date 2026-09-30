import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { cache } from "react";
import { prisma } from "./db";

const SESSION_COOKIE = "samhwa_session";
const SESSION_DAYS = 7;

// ============================================================
// 세션 사용자 짧은 TTL 캐시
// ============================================================
// react의 cache()는 같은 서버 요청 안에서만 중복 조회를 막아준다 — 브라우저가 페이지 하나를 열며
// 쏘는 수십 개의 개별 API fetch(lib/store.ts의 hydrateXxx들)는 각각 별도 요청이라 매번 이 DB
// 조회가 새로 실행돼, 대시보드처럼 fetch가 몰리는 화면에서 세션 확인만으로 DB 왕복이 수십 번
// 쌓이는 게 로딩 지연의 큰 원인이었다. userId 기준으로 "진행 중인 조회(Promise)" 자체를 프로세스
// 메모리에 잠깐 들고 있다가 재사용한다 — 값이 아니라 Promise를 캐싱하는 게 핵심이다: 페이지 로드
// 직후 20개 넘는 fetch가 거의 동시에 도착하면, 첫 조회가 아직 끝나기도 전에 나머지가 전부 캐시를
// 스치듯 지나가며 각자 새 조회를 또 쏘는 문제가 있었다(값만 캐싱하면 조회가 끝나기 전까지는
// 캐시가 비어 있으므로) — DB 커넥션 풀(기본 10개)이 동시에 20여 개의 세션 조회만으로 고갈돼
// "Timed out fetching a new connection from the connection pool" 에러가 모든 API를 연쇄로
// 500(빈 응답 바디)으로 실패시켰다. Promise를 즉시(await 전에) 캐시에 넣어두면 뒤이어 도착하는
// 호출들은 새 쿼리를 쏘지 않고 이미 진행 중인 같은 Promise를 그대로 기다린다.
// sessionVersion 비교(정지·비밀번호 변경·권한 변경 시 즉시 로그아웃)는 여전히 매 호출 JWT
// 클레임과 비교하므로 안전하지만, 그 판단에 쓰는 DB 쪽 user.status/sessionVersion 값 자체가 최대
// SESSION_USER_CACHE_TTL_MS만큼 최신이 아닐 수 있다 — 즉 관리자가 계정을 정지하거나 권한을
// 바꿔도 이 시간만큼은 기존 세션이 유효한 것처럼 보일 수 있다(기존엔 즉시 반영이었음, 위 주석 및
// lib/db.ts의 globalForPrisma 패턴과 동일한 이유로 dev HMR에도 캐시가 초기화되지 않도록
// globalThis에 보관).
const SESSION_USER_CACHE_TTL_MS = 5000;

interface CachedSessionUser {
  id: string;
  email: string;
  role: string;
  status: string;
  sessionVersion: number;
}

interface SessionUserCacheEntry {
  promise: Promise<CachedSessionUser | null>;
  expiresAt: number;
}

const globalForSession = globalThis as unknown as { sessionUserCache?: Map<string, SessionUserCacheEntry> };
const _sessionUserCache: Map<string, SessionUserCacheEntry> = globalForSession.sessionUserCache ?? new Map();
if (process.env.NODE_ENV !== "production") {
  globalForSession.sessionUserCache = _sessionUserCache;
}

function getCachedSessionUser(userId: string): Promise<CachedSessionUser | null> {
  const cached = _sessionUserCache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.promise;

  const promise = prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, role: true, status: true, sessionVersion: true },
  });
  // 응답 전엔 expiresAt을 Infinity로 둔다 — 조회 자체가 SESSION_USER_CACHE_TTL_MS보다 오래 걸리는
  // 상황(하필 커넥션 풀이 이미 붐빌 때 벌어지기 쉽다)에서 TTL이 먼저 끝나 아직 진행 중인 조회를
  // 두고 또 다른 중복 조회를 쏘면, 막으려던 문제를 그 순간에 오히려 더 키운다. 응답을 받은
  // 뒤에야 진짜 TTL을 카운트하기 시작한다.
  const entry: SessionUserCacheEntry = { promise, expiresAt: Infinity };
  _sessionUserCache.set(userId, entry);
  promise.then(
    () => { entry.expiresAt = Date.now() + SESSION_USER_CACHE_TTL_MS; },
    () => {
      // 조회가 실패하면(DB 커넥션 문제 등) 실패한 Promise를 계속 재사용하지 않도록 즉시 캐시에서
      // 비워 다음 호출이 바로 재시도하게 한다 — 이 사이 더 새 항목으로 교체됐다면 그건 건드리지 않는다.
      if (_sessionUserCache.get(userId) === entry) _sessionUserCache.delete(userId);
    }
  );
  return promise;
}

function secretKey() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET 환경변수가 설정되지 않았습니다.");
  return new TextEncoder().encode(secret);
}

export interface SessionPayload {
  userId: string;
  email: string;
  role: string;
}

/** JWT에는 사용자 식별자와 세션 버전만 담는다 — email·role 등 계정 상태는 매 요청마다
 *  DB에서 새로 조회한다(아래 getSessionUser). 그래야 정지·권한 변경·비밀번호 변경이
 *  토큰 만료(7일)를 기다리지 않고 즉시 반영된다. */
interface SessionClaims {
  userId: string;
  sessionVersion: number;
}

export async function createSessionCookie(userId: string, sessionVersion: number) {
  const token = await new SignJWT({ userId, sessionVersion } satisfies SessionClaims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secretKey());

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

async function verifySessionClaims(): Promise<SessionClaims | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (typeof payload.userId !== "string" || typeof payload.sessionVersion !== "number") {
      return null;
    }
    return { userId: payload.userId, sessionVersion: payload.sessionVersion };
  } catch {
    return null;
  }
}

/** 요청마다 DB에서 계정 상태·권한·세션 유효성을 다시 검증한다(React cache()로 같은
 *  요청 안에서는 한 번만 조회). 계정이 비활성화됐거나, sessionVersion이 발급 당시와
 *  달라졌다면(비밀번호 변경·정지·권한 변경으로 lib/session.ts 밖에서 증가시킨 경우)
 *  토큰이 아직 만료 전이어도 즉시 로그아웃 상태로 취급한다. */
export const getSessionUser = cache(async (): Promise<SessionPayload | null> => {
  const claims = await verifySessionClaims();
  if (!claims) return null;

  const user = await getCachedSessionUser(claims.userId);
  if (!user || user.status !== "ACTIVE") return null;
  if (user.sessionVersion !== claims.sessionVersion) return null;

  return { userId: user.id, email: user.email, role: user.role };
});

/** API 라우트에서 로그인 여부를 강제할 때 사용 — 없으면 401을 던진다. */
export async function requireUser(): Promise<SessionPayload> {
  const user = await getSessionUser();
  if (!user) {
    throw new SessionError("로그인이 필요합니다.", 401);
  }
  return user;
}

/** 사용자 계정 생성·수정·삭제 등 시스템 관리자 전용 API에서 사용 — 로그인은 했지만 관리자가
 *  아니면 403을 던진다. role은 세션에 DB 표기(SYSTEM_ADMIN)로 저장돼 있다(lib/role-map.ts 참고). */
export async function requireAdmin(): Promise<SessionPayload> {
  const user = await requireUser();
  if (user.role !== "SYSTEM_ADMIN") {
    throw new SessionError("시스템 관리자만 사용할 수 있습니다.", 403);
  }
  return user;
}

// [권한 설정](/admin/permissions) 화면에서 편집한 값은 RolePermission 테이블(role_permissions)에
// 저장된다 — 화면의 useCanWrite()도 결국 이 테이블에서 내려받은 값(app/api/role-permissions)을
// 읽는다. 서버 쪽 강제도 하드코딩된 기본값이 아니라 이 테이블을 그대로 조회해야, 관리자가 화면에서
// 권한을 회수했을 때 API도 즉시 같은 정책을 따른다(보안 조치, 2026-09-10 — 과거엔 여기서
// lib/mock.ts의 initialWriteAccess를 참조해, 화면에서 권한을 바꿔도 서버는 초기값 그대로였다).
/** 특정 기능(domain)에 대한 쓰기 권한이 있는지 서버에서도 강제한다 — 없으면 403.
 *  한 API가 여러 화면(다른 canWrite 도메인)에서 공유되는 경우 domains에 배열로 넘기면
 *  그중 하나만 만족해도 통과한다(예: 세금계산서는 /tax-invoices에서도, 수수료청구관리
 *  화면의 "매출발행"에서도 건드릴 수 있다). */
export async function requireWriteAccess(domains: string | string[]): Promise<SessionPayload> {
  const user = await requireUser();
  if (user.role === "SYSTEM_ADMIN") return user; // 시스템 관리자는 항상 모든 권한을 가진다(lib/store.ts ensureAdminIncluded와 동일한 원칙)
  const list = Array.isArray(domains) ? domains : [domains];
  const allowed = await prisma.rolePermission.findFirst({
    where: { role: user.role, resourceType: "FEATURE", action: "WRITE", resourceKey: { in: list }, isAllowed: true },
  });
  if (!allowed) {
    throw new SessionError("이 작업을 수행할 권한이 없습니다.", 403);
  }
  return user;
}

export class SessionError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}
