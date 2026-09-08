import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { requireUser, requireAdmin, SessionError } from "@/lib/session";
import { toSystemUser } from "@/lib/user-mapper";
import { appRoleToDb } from "@/lib/role-map";
import type { SystemUser } from "@/lib/mock";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  let body: Partial<SystemUser> & { verifyEmail?: string; verifyName?: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return Response.json({ ok: false, error: "사용자를 찾을 수 없습니다." }, { status: 404 });

  // 비밀번호"만" 바꾸는 요청(app/find-password — 로그인 전)은 이메일+이름 일치를 서버에서도
  // 다시 확인하고 통과시킨다. 그 외 필드를 바꾸려면 로그인된 사용자여야 한다.
  const isPasswordOnlyReset =
    Object.keys(body).every((k) => ["password", "verifyEmail", "verifyName"].includes(k)) && !!body.password;

  // 하이웍스 메일 연동 정보"만" 바꾸는 요청은 계정 주인 본인이면 관리자가 아니어도 허용한다
  // (역할·상태 등 다른 필드가 섞여 있으면 아래에서 관리자 검증으로 떨어진다).
  const isHiworksOnlyUpdate =
    Object.keys(body).length > 0 &&
    Object.keys(body).every((k) => k === "hiworksEmail" || k === "hiworksMailPassword");

  if (isPasswordOnlyReset) {
    const emailOk = body.verifyEmail?.trim().toLowerCase() === target.email.toLowerCase();
    const nameOk = body.verifyName?.trim() === target.name.trim();
    if (!emailOk || !nameOk) {
      return Response.json({ ok: false, error: "본인 확인 정보가 일치하지 않습니다." }, { status: 403 });
    }
  } else {
    try {
      const actor = await requireUser();
      const isSelf = actor.userId === id;
      if (actor.role !== "SYSTEM_ADMIN" && !(isSelf && isHiworksOnlyUpdate)) {
        throw new SessionError("시스템 관리자만 사용할 수 있습니다.", 403);
      }
    } catch (err) {
      if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
      throw err;
    }
  }

  const beforeSnapshot = { name: target.name, email: target.email, role: target.role, status: target.status };

  // 하이웍스 메일 계정 정보는 VIEWER(=mock의 조회전용)에게는 변경 의미가 없어 조용히 무시한다
  // (기존 lib/store.ts updateUserHiworksCredentials와 동일한 정책).
  const skipHiworks = target.role === "GENERAL" && (body.hiworksEmail !== undefined || body.hiworksMailPassword !== undefined);

  const updated = await prisma.user.update({
    where: { id },
    data: {
      name: body.name ?? undefined,
      email: body.email ?? undefined,
      role: body.role ? appRoleToDb(body.role) : undefined,
      status: body.status ?? undefined,
      phone: body.phone !== undefined ? body.phone : undefined,
      hiworksEmail: !skipHiworks && body.hiworksEmail !== undefined ? body.hiworksEmail : undefined,
      hiworksMailPassword: !skipHiworks && body.hiworksMailPassword !== undefined ? body.hiworksMailPassword : undefined,
      passwordHash: body.password ? await bcrypt.hash(body.password, 10) : undefined,
    },
  });

  // 변경이력은 클라이언트 record()가 /api/audit-log로 남긴다(중복 방지).
  return Response.json({ ok: true, user: toSystemUser(updated) });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  try {
    await requireAdmin();
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return Response.json({ ok: false, error: "사용자를 찾을 수 없습니다." }, { status: 404 });

  await prisma.user.delete({ where: { id } });
  // 변경이력은 클라이언트 record()가 /api/audit-log로 남긴다(중복 방지).
  return Response.json({ ok: true });
}
