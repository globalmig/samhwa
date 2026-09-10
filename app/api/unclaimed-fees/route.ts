import { prisma } from "@/lib/db";
import { requireUser, requireWriteAccess, SessionError } from "@/lib/session";
import { toUnclaimedFee, MOCK_TO_DB_STATUS } from "@/lib/unclaimed-fee-mapper";
import { getOrCreatePti } from "@/lib/pti-helper";
import { writeAuditLog } from "@/lib/audit";
import type { UnclaimedFee } from "@/lib/mock";

export const runtime = "nodejs";

const INCLUDE = { projectTermInstitution: { include: { projectTerm: { include: { project: true } }, institution: true } } } as const;

export async function GET() {
  try {
    await requireUser();
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }
  const rows = await prisma.unclaimedFee.findMany({ include: INCLUDE });
  return Response.json({ ok: true, unclaimedFees: rows.map(toUnclaimedFee) });
}

export async function POST(request: Request) {
  let actor;
  try {
    actor = await requireWriteAccess(["unclaimed", "fees"]);
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }

  let body: Omit<UnclaimedFee, "id">;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }
  if (!body.projectNumber || !body.leadInstitutionId) {
    return Response.json({ ok: false, error: "과제번호, 주관기관은 필수입니다." }, { status: 400 });
  }

  const project = await prisma.project.findUnique({ where: { projectNumber: body.projectNumber } });
  if (!project) return Response.json({ ok: false, error: "과제를 찾을 수 없습니다." }, { status: 404 });

  const ptiId = await getOrCreatePti(prisma, project.id, body.termNumber, body.leadInstitutionId, "MAIN", BigInt(Math.round(body.amount)), body.termYear);

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.unclaimedFee.create({
      data: {
        projectTermInstitutionId: ptiId,
        fiscalYear: body.termYear,
        billedFee: BigInt(Math.round(body.amount)),
        actuallyBilled: BigInt(0),
        unclaimedAmount: BigInt(Math.round(body.amount)),
        cumulativeUnclaimed: BigInt(Math.round(body.amount)),
        status: MOCK_TO_DB_STATUS[body.status] ?? "UNCLAIMED",
      },
      include: INCLUDE,
    });
    const afterFee = toUnclaimedFee(row);
    await writeAuditLog(tx, {
      actorUserId: actor.userId,
      entityType: "unclaimed",
      entityId: row.id,
      entityLabel: `${afterFee.projectNumber} · ${afterFee.leadInstitutionName}`,
      action: "CREATE",
    });
    return row;
  });

  return Response.json({ ok: true, unclaimedFee: toUnclaimedFee(created) });
}
