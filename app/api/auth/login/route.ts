import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { createSessionCookie } from "@/lib/session";
import { toSystemUser } from "@/lib/user-mapper";

// bcryptjs + Prisma(sqlserver)는 Node 런타임이 필요하다.
export const runtime = "nodejs";

interface LoginBody {
  email: string;
  password: string;
}

export async function POST(request: Request) {
  let body: LoginBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }

  const { email, password } = body;
  if (!email || !password) {
    return Response.json({ ok: false, error: "이메일과 비밀번호를 입력해주세요." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
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
    return Response.json({ ok: false, error: "이메일 또는 비밀번호가 올바르지 않습니다." }, { status: 401 });
  }

  await createSessionCookie({ userId: user.id, email: user.email, role: user.role });
  const updated = await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

  return Response.json({ ok: true, user: toSystemUser(updated) });
}
