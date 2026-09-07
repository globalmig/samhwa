import { prisma } from "@/lib/db";
import { requireWriteAccess, SessionError } from "@/lib/session";
import { toTaxInvoice, MOCK_TO_DB_STATUS } from "@/lib/tax-invoice-mapper";
import type { TaxInvoice } from "@/lib/mock";

export const runtime = "nodejs";

const INCLUDE = { projectTermInstitution: { include: { projectTerm: { include: { project: true } }, institution: true } } } as const;

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  let actor;
  try {
    actor = await requireWriteAccess(["tax-invoices", "fees-sales"]);
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }

  let body: Partial<TaxInvoice>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }

  const before = await prisma.taxInvoice.findUnique({ where: { id } });
  if (!before) return Response.json({ ok: false, error: "세금계산서를 찾을 수 없습니다." }, { status: 404 });

  const updated = await prisma.taxInvoice.update({
    where: { id },
    data: {
      invoiceNumber: body.invoiceNumber ?? undefined,
      issueDate: body.issuedAt !== undefined ? new Date(body.issuedAt) : undefined,
      supplyAmount: body.supplyAmount !== undefined ? BigInt(Math.round(body.supplyAmount)) : undefined,
      taxAmount: body.taxAmount !== undefined ? BigInt(Math.round(body.taxAmount)) : undefined,
      totalAmount: body.totalAmount !== undefined ? BigInt(Math.round(body.totalAmount)) : undefined,
      status: body.status !== undefined ? MOCK_TO_DB_STATUS[body.status] ?? undefined : undefined,
      cancelledAt: body.status === "CANCELED" ? new Date() : undefined,
    },
    include: INCLUDE,
  });

  await prisma.auditLog.create({
    data: {
      userId: actor.userId,
      action: "UPDATE",
      resourceType: "taxInvoice",
      resourceId: id,
      oldValues: JSON.stringify({ invoiceNumber: before.invoiceNumber }),
      newValues: JSON.stringify({ invoiceNumber: updated.invoiceNumber }),
    },
  });

  return Response.json({ ok: true, taxInvoice: toTaxInvoice(updated) });
}
