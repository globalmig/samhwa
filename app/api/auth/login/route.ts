import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { createSessionCookie } from "@/lib/session";
import { toSystemUser } from "@/lib/user-mapper";
import { verifyTurnstileToken } from "@/lib/turnstile";
import { checkLoginRateLimit, recordLoginFailure, resetLoginRateLimit, getClientIp } from "@/lib/rate-limit";

// bcryptjs + Prisma(sqlserver)는 Node 런타임이 필요하다.
export const runtime = "nodejs";

// 로그인 요청 본문(이메일+비밀번호+캡차 토큰)은 이 이상 커질 이유가 없다.
const MAX_BODY_BYTES = 5 * 1024;
const MAX_EMAIL_LENGTH = 255; // prisma schema User.email과 동일
const MAX_PASSWORD_LENGTH = 200;
const MAX_TOKEN_LENGTH = 4096;

interface LoginBody {
  email?: unknown;
  password?: unknown;
  turnstileToken?: unknown;
}

function lockedResponse(retryAfterSeconds: number) {
  const minutes = Math.ceil(retryAfterSeconds / 60);
  return Response.json(
    { ok: false, error: `로그인 시도가 너무 많습니다. ${minutes}분 후 다시 시도해주세요.` },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
  );
}

export async function POST(request: Request) {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (contentLength > MAX_BODY_BYTES) {
    return Response.json({ ok: false, error: "요청이 너무 큽니다." }, { status: 413 });
  }

  let body: LoginBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }

  const { email, password, turnstileToken } = body;
  if (
    typeof email !== "string" ||
    typeof password !== "string" ||
    !email ||
    !password ||
    email.length > MAX_EMAIL_LENGTH ||
    password.length > MAX_PASSWORD_LENGTH
  ) {
    return Response.json({ ok: false, error: "이메일과 비밀번호를 입력해주세요." }, { status: 400 });
  }
  if (typeof turnstileToken !== "string" || !turnstileToken || turnstileToken.length > MAX_TOKEN_LENGTH) {
    return Response.json({ ok: false, error: "보안 확인을 완료해주세요." }, { status: 400 });
  }

  // 계정 단위·IP 단위로 각각 제한한다 — 계정 하나를 노리는 크리덴셜 스터핑과, 한 IP가 여러
  // 계정을 순회하며 시도하는 브루트포스를 모두 막기 위함(lib/rate-limit.ts 참고).
  const emailKey = `email:${email.trim().toLowerCase()}`;
  const ipKey = `ip:${getClientIp(request)}`;
  const emailLimit = checkLoginRateLimit(emailKey);
  const ipLimit = checkLoginRateLimit(ipKey);
  if (!emailLimit.allowed || !ipLimit.allowed) {
    return lockedResponse(Math.max(emailLimit.retryAfterSeconds ?? 0, ipLimit.retryAfterSeconds ?? 0));
  }

  // Turnstile 검증은 반드시 서버에서 한다 — 클라이언트에서만 검증하면 /api/auth/login을
  // 직접 호출해 캡차 자체를 우회할 수 있다.
  const turnstileOk = await verifyTurnstileToken(turnstileToken);
  if (!turnstileOk) {
    recordLoginFailure(ipKey);
    return Response.json({ ok: false, error: "보안 확인에 실패했습니다. 다시 시도해주세요." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    const result = recordLoginFailure(emailKey);
    recordLoginFailure(ipKey);
    if (!result.allowed) return lockedResponse(result.retryAfterSeconds!);
    return Response.json({ ok: false, error: "이메일 또는 비밀번호가 올바르지 않습니다." }, { status: 401 });
  }
  if (user.status === "PENDING") {
    return Response.json({ ok: false, error: "가입 승인 대기 중인 계정입니다. 시스템 관리자 승인 후 로그인할 수 있습니다." }, { status: 403 });
  }
  if (user.status === "INACTIVE") {
    return Response.json({ ok: false, error: "비활성화된 계정입니다. 관리자에게 문의하세요." }, { status: 403 });
  }

  const validPassword = await bcrypt.compare(password, user.passwordHash);
  if (!validPassword) {
    const result = recordLoginFailure(emailKey);
    recordLoginFailure(ipKey);
    if (!result.allowed) return lockedResponse(result.retryAfterSeconds!);
    return Response.json({ ok: false, error: "이메일 또는 비밀번호가 올바르지 않습니다." }, { status: 401 });
  }

  resetLoginRateLimit(emailKey);
  resetLoginRateLimit(ipKey);
  await createSessionCookie(user.id, user.sessionVersion);
  const updated = await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  return Response.json({ ok: true, user: toSystemUser(updated) });
}
