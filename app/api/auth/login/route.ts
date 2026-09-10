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

// Content-Length 헤더는 클라이언트가 생략하거나(예: chunked transfer-encoding) 거짓으로 보낼 수
// 있어 그 값만으로는 413을 보장할 수 없다 — 실제로 읽은 바이트 수를 스트림 단계에서 직접 센다.
async function readBodyWithLimit(request: Request, maxBytes: number): Promise<string | null> {
  const reader = request.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let text = "";
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return text;
}

export async function POST(request: Request) {
  const rawBody = await readBodyWithLimit(request, MAX_BODY_BYTES);
  if (rawBody === null) {
    return Response.json({ ok: false, error: "요청이 너무 큽니다." }, { status: 413 });
  }

  let body: LoginBody;
  try {
    body = JSON.parse(rawBody);
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
  // 계정을 순회하며 시도하는 브루트포스를 모두 막기 위함(lib/rate-limit.ts 참고). 신뢰 가능한
  // 프록시가 없어 클라이언트 IP를 알 수 없는 배포에서는 ipKey 없이 이메일 기준 제한만 적용한다.
  const emailKey = `email:${email.trim().toLowerCase()}`;
  const clientIp = getClientIp(request);
  const ipKey = clientIp ? `ip:${clientIp}` : null;
  const emailLimit = checkLoginRateLimit(emailKey);
  const ipLimit = ipKey ? checkLoginRateLimit(ipKey) : { allowed: true };
  if (!emailLimit.allowed || !ipLimit.allowed) {
    return lockedResponse(Math.max(emailLimit.retryAfterSeconds ?? 0, ipLimit.retryAfterSeconds ?? 0));
  }

  // Turnstile 검증은 반드시 서버에서 한다 — 클라이언트에서만 검증하면 /api/auth/login을
  // 직접 호출해 캡차 자체를 우회할 수 있다.
  const turnstileOk = await verifyTurnstileToken(turnstileToken);
  if (!turnstileOk) {
    if (ipKey) recordLoginFailure(ipKey);
    return Response.json({ ok: false, error: "보안 확인에 실패했습니다. 다시 시도해주세요." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    const result = recordLoginFailure(emailKey);
    if (ipKey) recordLoginFailure(ipKey);
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
    if (ipKey) recordLoginFailure(ipKey);
    if (!result.allowed) return lockedResponse(result.retryAfterSeconds!);
    return Response.json({ ok: false, error: "이메일 또는 비밀번호가 올바르지 않습니다." }, { status: 401 });
  }

  resetLoginRateLimit(emailKey);
  if (ipKey) resetLoginRateLimit(ipKey);
  await createSessionCookie(user.id, user.sessionVersion);
  const updated = await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  return Response.json({ ok: true, user: toSystemUser(updated) });
}
