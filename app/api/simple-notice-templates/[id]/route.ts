import { prisma } from "@/lib/db";
import { requireWriteAccess, SessionError } from "@/lib/session";
import { toSimpleNoticeTemplate } from "@/lib/notice-template-mapper";
import { writeAuditLog } from "@/lib/audit";
import type { SimpleNoticeTemplate } from "@/lib/mock";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  let actor;
  try {
    actor = await requireWriteAccess("notice-templates");
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }
  let body: Partial<{ name: string; content: SimpleNoticeTemplate }>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }

  const before = await prisma.simpleNoticeTemplate.findUnique({ where: { id } });
  if (!before) return Response.json({ ok: false, error: "템플릿을 찾을 수 없습니다." }, { status: 404 });

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.simpleNoticeTemplate.update({
      where: { id },
      data: { name: body.name ?? undefined, content: body.content !== undefined ? JSON.stringify(body.content) : undefined },
    });
    await writeAuditLog(tx, {
      actorUserId: actor.userId,
      entityType: "simpleNoticeTemplate",
      entityId: row.id,
      entityLabel: `${row.name} 수정`,
      action: "UPDATE",
      before: toSimpleNoticeTemplate(before) as unknown as Record<string, unknown>,
      after: toSimpleNoticeTemplate(row) as unknown as Record<string, unknown>,
    });
    return row;
  });
  return Response.json({ ok: true, template: toSimpleNoticeTemplate(updated) });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  let actor;
  try {
    actor = await requireWriteAccess("notice-templates");
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }
  const target = await prisma.simpleNoticeTemplate.findUnique({ where: { id } });
  if (!target) return Response.json({ ok: false, error: "템플릿을 찾을 수 없습니다." }, { status: 404 });
  if (target.isDefault) return Response.json({ ok: false, error: "대표양식은 삭제할 수 없습니다. 다른 템플릿을 먼저 대표로 지정해주세요." }, { status: 409 });

  await prisma.$transaction(async (tx) => {
    await tx.simpleNoticeTemplate.delete({ where: { id } });
    await writeAuditLog(tx, {
      actorUserId: actor.userId,
      entityType: "simpleNoticeTemplate",
      entityId: target.id,
      entityLabel: `${target.name} 삭제`,
      action: "DELETE",
    });
  });
  return Response.json({ ok: true });
}
