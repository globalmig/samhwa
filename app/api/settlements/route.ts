import { prisma } from "@/lib/db";
import { requireUser, SessionError } from "@/lib/session";
import { toSettlement, MOCK_TO_DB_STATUS } from "@/lib/settlement-mapper";
import { getOrCreatePti } from "@/lib/pti-helper";
import type { Settlement } from "@/lib/mock";

export const runtime = "nodejs";

const INCLUDE = { projectTermInstitution: { include: { projectTerm: { include: { project: true } }, institution: true } } } as const;

export async function GET() {
  const rows = await prisma.settlement.findMany({ include: INCLUDE });
  return Response.json({ ok: true, settlements: rows.map(toSettlement) });
}

export async function POST(request: Request) {
  let actor;
  try {
    actor = await requireUser();
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

  const ptiId = await getOrCreatePti(prisma, project.id, 1, body.institutionId, body.isLead ? "MAIN" : "PARTICIPATING", BigInt(Math.round(body.settlementAmount)));

  const created = await prisma.settlement.create({
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

  // 변경이력은 클라이언트 record()가 /api/audit-log로 남긴다(중복 방지).
  return Response.json({ ok: true, settlement: toSettlement(created) });
}
