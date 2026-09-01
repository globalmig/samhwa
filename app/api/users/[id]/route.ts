import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { requireAdmin, SessionError } from "@/lib/session";
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

  let actorId: string | null = null;
  if (isPasswordOnlyReset) {
    const emailOk = body.verifyEmail?.trim().toLowerCase() === target.email.toLowerCase();
    const nameOk = body.verifyName?.trim() === target.name.trim();
    if (!emailOk || !nameOk) {
      return Response.json({ ok: false, error: "본인 확인 정보가 일치하지 않습니다." }, { status: 403 });
    }
  } else {
    try {
      actorId = (await requireAdmin()).userId;
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

  await prisma.auditLog.create({
    data: {
      userId: actorId,
      action: "UPDATE",
      resourceType: "user",
      resourceId: id,
      oldValues: JSON.stringify(beforeSnapshot),
      newValues: JSON.stringify({ name: updated.name, email: updated.email, role: updated.role, status: updated.status }),
    },
  });

  return Response.json({ ok: true, user: toSystemUser(updated) });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  let actor;
  try {
    actor = await requireAdmin();
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return Response.json({ ok: false, error: "사용자를 찾을 수 없습니다." }, { status: 404 });

  await prisma.user.delete({ where: { id } });
  await prisma.auditLog.create({
    data: { userId: actor.userId, action: "DELETE", resourceType: "user", resourceId: id, oldValues: JSON.stringify({ name: target.name, email: target.email }) },
  });

  return Response.json({ ok: true });
}
