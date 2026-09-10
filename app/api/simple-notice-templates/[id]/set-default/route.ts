import { prisma } from "@/lib/db";
import { requireWriteAccess, SessionError } from "@/lib/session";
import { toSimpleNoticeTemplate } from "@/lib/notice-template-mapper";
import { writeAuditLog } from "@/lib/audit";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
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

  const updated = await prisma.$transaction(async (tx) => {
    await tx.simpleNoticeTemplate.updateMany({ where: { category: target.category, NOT: { id } }, data: { isDefault: false } });
    const row = await tx.simpleNoticeTemplate.update({ where: { id }, data: { isDefault: true } });
    await writeAuditLog(tx, {
      actorUserId: actor.userId,
      entityType: "simpleNoticeTemplate",
      entityId: row.id,
      entityLabel: `${row.name} 대표양식으로 지정`,
      action: "UPDATE",
      changedFields: { isDefault: { before: false, after: true } },
    });
    return row;
  });

  return Response.json({ ok: true, template: toSimpleNoticeTemplate(updated) });
}
