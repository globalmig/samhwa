import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { requireAdmin, SessionError } from "@/lib/session";
import { toSystemUser } from "@/lib/user-mapper";
import { appRoleToDb } from "@/lib/role-map";
import type { SystemUser } from "@/lib/mock";

export const runtime = "nodejs";

// 인증 없이도 조회 가능하게 둔다 — app/find-id, app/find-password가 로그인 전 상태에서
// 이름/이메일로 계정을 찾아야 하고(지금 mock 방식도 클라이언트 번들에 전체 유저 목록이 그대로
// 실려있어 이보다 더 개방적이었음), 비밀번호 해시 등 민감정보는 toSystemUser()가 애초에 내려주지 않는다.
export async function GET() {
  const users = await prisma.user.findMany({ orderBy: { createdAt: "asc" } });
  return Response.json({ ok: true, users: users.map(toSystemUser) });
}

export async function POST(request: Request) {
  let body: Omit<SystemUser, "id">;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }
  if (!body.name || !body.email || !body.role) {
    return Response.json({ ok: false, error: "이름, 이메일, 역할은 필수입니다." }, { status: 400 });
  }
  if (!body.password) {
    return Response.json({ ok: false, error: "비밀번호는 필수입니다." }, { status: 400 });
  }

  // 회원가입(로그인 안 된 상태)은 role=VIEWER, status=PENDING 자기등록만 허용한다 (app/signup/page.tsx).
  // 그 외(관리자가 admin/users 화면에서 직접 계정을 만드는 경우)는 시스템 관리자여야 한다.
  const isSelfRegistration = body.role === "VIEWER" && body.status === "PENDING";
  if (!isSelfRegistration) {
    try {
      await requireAdmin();
    } catch (err) {
      if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
      throw err;
    }
  }

  const existing = await prisma.user.findUnique({ where: { email: body.email } });
  if (existing) {
    return Response.json({ ok: false, error: "이미 등록된 이메일입니다." }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(body.password, 10);
  const created = await prisma.user.create({
    data: {
      name: body.name,
      email: body.email,
      role: appRoleToDb(body.role),
      status: body.status ?? "ACTIVE",
      passwordHash,
      hiworksEmail: body.hiworksEmail ?? null,
      hiworksMailPassword: body.hiworksMailPassword ?? null,
      phone: body.phone ?? null,
    },
  });

  // 변경이력은 클라이언트 record()가 /api/audit-log로 남긴다(중복 방지).
  return Response.json({ ok: true, user: toSystemUser(created) });
}
