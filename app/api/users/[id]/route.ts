import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { requireUser, requireAdmin, SessionError } from "@/lib/session";
import { toSystemUser } from "@/lib/user-mapper";
import { appRoleToDb } from "@/lib/role-map";
import { writeAuditLog } from "@/lib/audit";
import type { SystemUser } from "@/lib/mock";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  let body: Partial<SystemUser>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) return Response.json({ ok: false, error: "사용자를 찾을 수 없습니다." }, { status: 404 });

  // 보안 조치(2026-09-10): 과거에는 password만 담긴 요청(app/find-password — 로그인 전)을
  // 이메일+이름 일치만으로 통과시켰으나, /api/users가 이름·이메일을 인증 없이 노출하는 것과
  // 결합되면 임의 계정(관리자 포함)의 비밀번호를 탈취할 수 있어 해당 분기를 제거했다.
  // 정식 재설정 절차(이메일 인증 링크 등)가 마련되기 전까지 비밀번호 변경은 시스템 관리자만
  // 수행할 수 있다.

  // 하이웍스 메일 연동 정보"만" 바꾸는 요청은 계정 주인 본인이면 관리자가 아니어도 허용한다
  // (역할·상태 등 다른 필드가 섞여 있으면 아래에서 관리자 검증으로 떨어진다).
  const isHiworksOnlyUpdate =
    Object.keys(body).length > 0 &&
    Object.keys(body).every((k) => k === "hiworksEmail" || k === "hiworksMailPassword");

  let actor;
  try {
    actor = await requireUser();
    const isSelf = actor.userId === id;
    if (actor.role !== "SYSTEM_ADMIN" && !(isSelf && isHiworksOnlyUpdate)) {
      throw new SessionError("시스템 관리자만 사용할 수 있습니다.", 403);
    }
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }

  // 하이웍스 메일 계정 정보는 VIEWER(=mock의 조회전용)에게는 변경 의미가 없어 조용히 무시한다
  // (기존 lib/store.ts updateUserHiworksCredentials와 동일한 정책).
  const skipHiworks = target.role === "GENERAL" && (body.hiworksEmail !== undefined || body.hiworksMailPassword !== undefined);

  const nextRole = body.role ? appRoleToDb(body.role) : undefined;
  // 비밀번호 변경·계정 상태 변경(정지 등)·권한 변경 시 기존에 발급된 세션 JWT(최대 7일 유효)를
  // 즉시 무효화한다 — sessionVersion을 올리면 requireUser()가 다음 요청부터 로그아웃 처리한다
  // (lib/session.ts getSessionUser 참고). 그대로 두면 계정을 정지해도 이미 로그인된 세션으로
  // 만료 전까지 계속 접근할 수 있었다.
  const revokeSessions =
    !!body.password ||
    (body.status !== undefined && body.status !== target.status) ||
    (nextRole !== undefined && nextRole !== target.role);

  const passwordHash = body.password ? await bcrypt.hash(body.password, 10) : undefined;

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.user.update({
      where: { id },
      data: {
        name: body.name ?? undefined,
        email: body.email ?? undefined,
        role: nextRole,
        status: body.status ?? undefined,
        phone: body.phone !== undefined ? body.phone : undefined,
        hiworksEmail: !skipHiworks && body.hiworksEmail !== undefined ? body.hiworksEmail : undefined,
        hiworksMailPassword: !skipHiworks && body.hiworksMailPassword !== undefined ? body.hiworksMailPassword : undefined,
        passwordHash,
        sessionVersion: revokeSessions ? { increment: 1 } : undefined,
      },
    });
    const afterUser = toSystemUser(row);
    // toSystemUser()가 애초에 passwordHash/hiworksMailPassword를 내려주지 않으므로 이 diff에는
    // 비밀번호류가 절대 섞이지 않는다 — 그래도 changedFields를 직접 넘기지 않고 diff를 맡기는 이유는
    // "비밀번호가 바뀌었다"는 사실조차 기록에 남기지 않기 위함(요건: 비밀번호·인증 토큰은 기록에서 제외).
    await writeAuditLog(tx, {
      actorUserId: actor.userId,
      entityType: "user",
      entityId: row.id,
      entityLabel: afterUser.name,
      action: "UPDATE",
      before: toSystemUser(target) as unknown as Record<string, unknown>,
      after: afterUser as unknown as Record<string, unknown>,
    });
    return row;
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

  await prisma.$transaction(async (tx) => {
    await tx.user.delete({ where: { id } });
    await writeAuditLog(tx, {
      actorUserId: actor.userId,
      entityType: "user",
      entityId: target.id,
      entityLabel: target.name,
      action: "DELETE",
    });
  });

  return Response.json({ ok: true });
}
