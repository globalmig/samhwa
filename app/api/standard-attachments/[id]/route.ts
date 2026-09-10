import { prisma } from "@/lib/db";
import { requireWriteAccess, SessionError } from "@/lib/session";
import { toStandardAttachment } from "@/lib/notice-template-mapper";
import { writeAuditLog } from "@/lib/audit";
import type { StandardAttachment } from "@/lib/mock";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  let actor;
  try {
    // 양식관리 화면("standard-attachments")뿐 아니라, 공문 발송 모달(DispatchModal, "emails")에서도
    // 발송 직전 첨부파일을 그 자리에서 교체할 수 있다.
    actor = await requireWriteAccess(["standard-attachments", "emails"]);
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }
  let body: Partial<Omit<StandardAttachment, "id">>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }

  const before = await prisma.standardAttachment.findUnique({ where: { id } });
  if (!before) return Response.json({ ok: false, error: "첨부서류를 찾을 수 없습니다." }, { status: 404 });

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.standardAttachment.update({
      where: { id },
      data: {
        name: body.name ?? undefined,
        fileDataUrl: body.fileDataUrl !== undefined ? body.fileDataUrl : undefined,
        enabledByCategory: body.enabledByCategory !== undefined ? JSON.stringify(body.enabledByCategory) : undefined,
      },
    });
    await writeAuditLog(tx, {
      actorUserId: actor.userId,
      entityType: "standardAttachment",
      entityId: row.id,
      entityLabel: row.name,
      action: "UPDATE",
      before: toStandardAttachment(before) as unknown as Record<string, unknown>,
      after: toStandardAttachment(row) as unknown as Record<string, unknown>,
    });
    return row;
  });
  return Response.json({ ok: true, attachment: toStandardAttachment(updated) });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  let actor;
  try {
    actor = await requireWriteAccess("standard-attachments");
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }
  const target = await prisma.standardAttachment.findUnique({ where: { id } });
  if (!target) return Response.json({ ok: false, error: "첨부서류를 찾을 수 없습니다." }, { status: 404 });

  await prisma.$transaction(async (tx) => {
    await tx.standardAttachment.delete({ where: { id } });
    await writeAuditLog(tx, {
      actorUserId: actor.userId,
      entityType: "standardAttachment",
      entityId: target.id,
      entityLabel: `${target.name} 삭제`,
      action: "DELETE",
    });
  });
  return Response.json({ ok: true });
}
