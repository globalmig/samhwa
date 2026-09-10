import { prisma } from "@/lib/db";
import { requireUser, SessionError } from "@/lib/session";
import { writeAuditLog } from "@/lib/audit";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  let actor;
  try {
    actor = await requireUser();
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }

  const target = await prisma.notice.findUnique({ where: { id } });
  if (!target) return Response.json({ ok: false, error: "공지사항을 찾을 수 없습니다." }, { status: 404 });

  // "notices" 쓰기 권한 도메인이 아니라, 화면(app/notices/[id]/page.tsx)과 동일한 규칙을 그대로
  // 서버에서도 강제한다 — 시스템 관리자이거나 본인이 작성한 공지만 삭제할 수 있다(다른 역할이 나중에
  // "공지사항 게시" 권한을 잃어도, 그 전에 자기가 올린 글은 여전히 지울 수 있어야 하므로 도메인
  // 권한이 아니라 작성자 본인 여부로 판단한다).
  if (actor.role !== "SYSTEM_ADMIN" && target.authorId !== actor.userId) {
    return Response.json({ ok: false, error: "이 작업을 수행할 권한이 없습니다." }, { status: 403 });
  }

  await prisma.$transaction(async (tx) => {
    await tx.notice.delete({ where: { id } });
    await writeAuditLog(tx, {
      actorUserId: actor.userId,
      entityType: "notice",
      entityId: target.id,
      entityLabel: target.title,
      action: "DELETE",
    });
  });

  return Response.json({ ok: true });
}
