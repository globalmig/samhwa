import { prisma } from "@/lib/db";
import { requireUser, SessionError } from "@/lib/session";
import { toFeeInvoiceTemplate } from "@/lib/notice-template-mapper";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;
  try {
    await requireUser();
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

  // 변경이력은 클라이언트 record()가 /api/audit-log로 남긴다(중복 방지).
  return Response.json({ ok: true, template: toFeeInvoiceTemplate(updated) });
}
