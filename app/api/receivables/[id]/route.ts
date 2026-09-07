import { prisma } from "@/lib/db";
import { requireWriteAccess, SessionError } from "@/lib/session";
import { toReceivable, MOCK_TO_DB_STATUS } from "@/lib/receivable-mapper";
import type { Receivable } from "@/lib/mock";

export const runtime = "nodejs";

const INCLUDE = { projectTermInstitution: { include: { projectTerm: { include: { project: true } }, institution: true } }, paymentHistories: true } as const;

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  let actor;
  try {
    actor = await requireWriteAccess(["receivables", "fees-sales", "fees"]);
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }

  let body: Partial<Receivable>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }

  const before = await prisma.receivable.findUnique({ where: { id } });
  if (!before) return Response.json({ ok: false, error: "미수금을 찾을 수 없습니다." }, { status: 404 });

  const updated = await prisma.receivable.update({
    where: { id },
    data: {
      billedAmount: body.billedAmount !== undefined ? BigInt(Math.round(body.billedAmount)) : undefined,
      collectedAmount: body.paidAmount !== undefined ? BigInt(Math.round(body.paidAmount)) : undefined,
      outstandingAmount: body.receivableAmount !== undefined ? BigInt(Math.round(body.receivableAmount)) : undefined,
      dueDate: body.dueDate !== undefined ? new Date(body.dueDate) : undefined,
      status: body.status !== undefined ? MOCK_TO_DB_STATUS[body.status] ?? undefined : undefined,
      isLongOverdue: body.status !== undefined ? body.status === "OVERDUE" : undefined,
    },
  });

  if (body.paidAmount !== undefined && body.paidAmount > Number(before.collectedAmount) && body.paidAt) {
    await prisma.paymentHistory.create({
      data: { receivableId: id, paymentDate: new Date(body.paidAt), paymentAmount: BigInt(Math.round(body.paidAmount - Number(before.collectedAmount))) },
    });
  }

  await prisma.auditLog.create({
    data: { userId: actor.userId, action: "UPDATE", resourceType: "receivable", resourceId: id, newValues: JSON.stringify({ status: updated.status }) },
  });

  const full = await prisma.receivable.findUniqueOrThrow({ where: { id }, include: INCLUDE });
  const invMap = new Map((await prisma.taxInvoice.findMany({ select: { projectTermInstitutionId: true, invoiceNumber: true } })).map((i) => [i.projectTermInstitutionId, i.invoiceNumber]));
  return Response.json({ ok: true, receivable: toReceivable(full, invMap) });
}
