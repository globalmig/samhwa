import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { initialWriteAccess, type Role } from "./mock";
import { dbRoleToApp } from "./role-map";

const SESSION_COOKIE = "samhwa_session";
const SESSION_DAYS = 7;

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

export async function createSessionCookie(payload: SessionPayload) {
  const token = await new SignJWT({ ...payload })
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

export async function getSessionUser(): Promise<SessionPayload | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (typeof payload.userId !== "string" || typeof payload.email !== "string" || typeof payload.role !== "string") {
      return null;
    }
    return { userId: payload.userId, email: payload.email, role: payload.role };
  } catch {
    return null;
  }
}

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

// [권한 설정](/admin/permissions)의 writeAccess는 화면에서 편집한 값이 브라우저 메모리에만
// 있고 서버로 저장되지 않는다(lib/store.ts의 pageAccess/writeAccess는 순수 클라이언트 상태) —
// 그래서 지금까지 API 라우트들은 canEdit* 버튼을 숨기는 것 말고는 아무것도 강제하지 않았고,
// 로그인만 했으면(role 무관) 개발자도구로 직접 요청을 보내 매출발행·삭제·수금수정이 가능했다.
// 서버가 참조할 수 있는 값은 lib/mock.ts의 initialWriteAccess(화면에서 편집하기 전의 기본값)뿐이라
// 이걸 기준으로 막는다 — 실제로도 지금까지 이 기본값 밖에 존재한 적이 없으므로 정상 사용에는
// 영향이 없다.
/** 특정 기능(domain)에 대한 쓰기 권한이 있는지 서버에서도 강제한다 — 없으면 403.
 *  한 API가 여러 화면(다른 canWrite 도메인)에서 공유되는 경우 domains에 배열로 넘기면
 *  그중 하나만 만족해도 통과한다(예: 세금계산서는 /tax-invoices에서도, 수수료청구관리
 *  화면의 "매출발행"에서도 건드릴 수 있다). */
export async function requireWriteAccess(domains: string | string[]): Promise<SessionPayload> {
  const user = await requireUser();
  const appRole = dbRoleToApp(user.role) as Role;
  if (appRole === "ADMIN") return user; // 시스템 관리자는 항상 모든 권한을 가진다(lib/store.ts ensureAdminIncluded와 동일한 원칙)
  const list = Array.isArray(domains) ? domains : [domains];
  const allowed = list.some((domain) => (initialWriteAccess[domain] ?? []).includes(appRole));
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
