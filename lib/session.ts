import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { cache } from "react";
import { prisma } from "./db";

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

  const user = await prisma.user.findUnique({ where: { id: claims.userId } });
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
