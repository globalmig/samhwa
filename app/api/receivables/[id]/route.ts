import { prisma } from "@/lib/db";
import { requireWriteAccess, SessionError } from "@/lib/session";
import { toReceivable, MOCK_TO_DB_STATUS } from "@/lib/receivable-mapper";
import { writeAuditLog } from "@/lib/audit";
import type { Receivable } from "@/lib/mock";

export const runtime = "nodejs";

// project/institution은 toReceivable(lib/receivable-mapper.ts)이 실제로 쓰는 필드만 select한다 —
// project 전체(특히 extraData)를 매 행마다 통째로 끌고 오면 채권이 쌓일수록 이 API가 느려진다.
const INCLUDE = {
  projectTermInstitution: {
    include: {
      projectTerm: { include: { project: { select: { projectNumber: true, projectName: true } } } },
      institution: { select: { institutionName: true } },
    },
  },
  paymentHistories: true,
} as const;

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

  const before = await prisma.receivable.findUnique({ where: { id }, include: INCLUDE });
  if (!before) return Response.json({ ok: false, error: "미수금을 찾을 수 없습니다." }, { status: 404 });

  // tax_invoices 테이블 전체가 아니라 이 채권과 같은 참여기관(PTI) 것 하나만 조회한다.
  const invMap = new Map((await prisma.taxInvoice.findMany({
    where: { projectTermInstitutionId: before.projectTermInstitutionId },
    select: { projectTermInstitutionId: true, invoiceNumber: true },
  })).map((i) => [i.projectTermInstitutionId, i.invoiceNumber]));

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.receivable.update({
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
      await tx.paymentHistory.create({
        data: { receivableId: id, paymentDate: new Date(body.paidAt), paymentAmount: BigInt(Math.round(body.paidAmount - Number(before.collectedAmount))) },
      });
    }

    const full = await tx.receivable.findUniqueOrThrow({ where: { id }, include: INCLUDE });
    const afterReceivable = toReceivable(full, invMap);
    await writeAuditLog(tx, {
      actorUserId: actor.userId,
      entityType: "receivable",
      entityId: row.id,
      entityLabel: `${afterReceivable.projectNumber} · ${afterReceivable.leadInstitutionName}`,
      action: "UPDATE",
      before: toReceivable(before, invMap) as unknown as Record<string, unknown>,
      after: afterReceivable as unknown as Record<string, unknown>,
    });
    return full;
  });

  return Response.json({ ok: true, receivable: toReceivable(updated, invMap) });
}
