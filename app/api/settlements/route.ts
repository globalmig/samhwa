import { prisma } from "@/lib/db";
import { requireUser, requireWriteAccess, SessionError } from "@/lib/session";
import { toSettlement, MOCK_TO_DB_STATUS } from "@/lib/settlement-mapper";
import { getOrCreatePti } from "@/lib/pti-helper";
import { writeAuditLog } from "@/lib/audit";
import type { Settlement } from "@/lib/mock";

export const runtime = "nodejs";

const INCLUDE = { projectTermInstitution: { include: { projectTerm: { include: { project: true } }, institution: true } } } as const;

export async function GET() {
  try {
    await requireUser();
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }
  const rows = await prisma.settlement.findMany({ include: INCLUDE });
  return Response.json({ ok: true, settlements: rows.map(toSettlement) });
}

export async function POST(request: Request) {
  let actor;
  try {
    actor = await requireWriteAccess("settlements");
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }

  let body: Omit<Settlement, "id">;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }
  if (!body.projectNumber || !body.institutionId) {
    return Response.json({ ok: false, error: "과제번호, 참여기관은 필수입니다." }, { status: 400 });
  }

  const project = await prisma.project.findUnique({ where: { projectNumber: body.projectNumber } });
  if (!project) return Response.json({ ok: false, error: "과제를 찾을 수 없습니다." }, { status: 404 });

  const ptiId = await getOrCreatePti(prisma, project.id, 1, body.institutionId, body.isLead ? "MAIN" : "PARTICIPATING", BigInt(Math.round(body.settlementAmount)), body.termYear);

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.settlement.create({
      data: {
        projectTermInstitutionId: ptiId,
        settlementAmount: BigInt(Math.round(body.settlementAmount)),
        additionalAmount: BigInt(Math.round(body.additionalAmount)),
        feeAmount: BigInt(Math.round(body.feeAmount)),
        scheduledAmount: BigInt(Math.round(body.scheduledAmount)),
        paidAmount: body.status === "PAID" ? BigInt(Math.round(body.scheduledAmount)) : BigInt(0),
        outstandingAmount: body.status === "PAID" ? BigInt(0) : BigInt(Math.round(body.scheduledAmount)),
        settlementDate: body.paidAt ? new Date(body.paidAt) : null,
        status: MOCK_TO_DB_STATUS[body.status] ?? "SCHEDULED",
        createdBy: actor.userId,
      },
      include: INCLUDE,
    });
    const afterSettlement = toSettlement(row);
    await writeAuditLog(tx, {
      actorUserId: actor.userId,
      entityType: "settlement",
      entityId: row.id,
      entityLabel: `${afterSettlement.projectNumber} · ${afterSettlement.institutionName}`,
      action: "CREATE",
    });
    return row;
  });

  return Response.json({ ok: true, settlement: toSettlement(created) });
}
