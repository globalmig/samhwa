import { prisma } from "@/lib/db";
import { requireWriteAccess, SessionError } from "@/lib/session";
import { toSettlement, MOCK_TO_DB_STATUS } from "@/lib/settlement-mapper";
import { writeAuditLog } from "@/lib/audit";
import type { Settlement } from "@/lib/mock";

export const runtime = "nodejs";

const INCLUDE = { projectTermInstitution: { include: { projectTerm: { include: { project: true } }, institution: true } } } as const;

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  let actor;
  try {
    actor = await requireWriteAccess("settlements");
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }

  let body: Partial<Settlement>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }

  const before = await prisma.settlement.findUnique({ where: { id }, include: INCLUDE });
  if (!before) return Response.json({ ok: false, error: "정산 내역을 찾을 수 없습니다." }, { status: 404 });

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.settlement.update({
      where: { id },
      data: {
        settlementAmount: body.settlementAmount !== undefined ? BigInt(Math.round(body.settlementAmount)) : undefined,
        additionalAmount: body.additionalAmount !== undefined ? BigInt(Math.round(body.additionalAmount)) : undefined,
        feeAmount: body.feeAmount !== undefined ? BigInt(Math.round(body.feeAmount)) : undefined,
        scheduledAmount: body.scheduledAmount !== undefined ? BigInt(Math.round(body.scheduledAmount)) : undefined,
        paidAmount: body.status === "PAID" && body.scheduledAmount !== undefined ? BigInt(Math.round(body.scheduledAmount)) : undefined,
        outstandingAmount: body.status === "PAID" ? BigInt(0) : undefined,
        settlementDate: body.paidAt !== undefined ? (body.paidAt ? new Date(body.paidAt) : null) : undefined,
        status: body.status !== undefined ? MOCK_TO_DB_STATUS[body.status] ?? undefined : undefined,
      },
      include: INCLUDE,
    });
    const afterSettlement = toSettlement(row);
    await writeAuditLog(tx, {
      actorUserId: actor.userId,
      entityType: "settlement",
      entityId: row.id,
      entityLabel: `${afterSettlement.projectNumber} · ${afterSettlement.institutionName}`,
      action: "UPDATE",
      before: toSettlement(before) as unknown as Record<string, unknown>,
      after: afterSettlement as unknown as Record<string, unknown>,
    });
    return row;
  });

  return Response.json({ ok: true, settlement: toSettlement(updated) });
}
