import { prisma } from "@/lib/db";
import { requireUser, SessionError } from "@/lib/session";
import { toFeeInvoiceTemplate } from "@/lib/notice-template-mapper";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;
  let actor;
  try {
    actor = await requireUser();
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }

  const target = await prisma.feeInvoiceTemplate.findUnique({ where: { id } });
  if (!target) return Response.json({ ok: false, error: "템플릿을 찾을 수 없습니다." }, { status: 404 });

  const updated = await prisma.$transaction(async (tx) => {
    await tx.feeInvoiceTemplate.updateMany({ where: { category: target.category, NOT: { id } }, data: { isDefault: false } });
    return tx.feeInvoiceTemplate.update({ where: { id }, data: { isDefault: true } });
  });

  await prisma.auditLog.create({ data: { userId: actor.userId, action: "UPDATE", resourceType: "feeInvoiceTemplate", resourceId: id, newValues: JSON.stringify({ setDefault: true }) } });
  return Response.json({ ok: true, template: toFeeInvoiceTemplate(updated) });
}
