import { prisma } from "@/lib/db";
import { requireWriteAccess, SessionError } from "@/lib/session";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };
type Extra = { manualOverride?: boolean };

// deleteProjectTerms(lib/store.ts)의 DB판 — 과제 하나를 통째로 지우지 않고 특정 연차(들)의
// 수수료·세금계산서·미청구·미수금 데이터만 지운다. CONFIRMED/BILLED/manualOverride인 연차는
// 건드리지 않는다(로컬 로직과 동일한 잠금 규칙).
export async function POST(request: Request, { params }: Params) {
  const { id: projectId } = await params;
  let actor;
  try {
    actor = await requireWriteAccess("projects-delete");
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }

  let body: { termNumbers: number[] };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }
  const termSet = new Set(body.termNumbers ?? []);
  if (termSet.size === 0) return Response.json({ ok: true, deletedTermNumbers: [] });

  const terms = await prisma.projectTerm.findMany({
    where: { projectId, termNumber: { in: [...termSet] } },
    include: { institutionLinks: { include: { termFee: true } } },
  });

  const isLocked = (extraData: string | null) => {
    const extra: Extra = extraData ? JSON.parse(extraData) : {};
    return !!extra.manualOverride;
  };

  const deletableTermIds: string[] = [];
  const deletableTermNumbers: number[] = [];
  for (const term of terms) {
    const hasDeletable = term.institutionLinks.some(
      (pti) => pti.termFee && pti.termFee.status !== "CONFIRMED" && pti.termFee.status !== "BILLED" && !isLocked(pti.termFee.extraData)
    );
    if (hasDeletable) {
      deletableTermIds.push(term.id);
      deletableTermNumbers.push(term.termNumber);
    }
  }
  if (deletableTermIds.length === 0) return Response.json({ ok: true, deletedTermNumbers: [] });

  const ptiIds = terms
    .filter((t) => deletableTermIds.includes(t.id))
    .flatMap((t) => t.institutionLinks.map((l) => l.id));

  await prisma.$transaction(async (tx) => {
    const receivables = await tx.receivable.findMany({ where: { projectTermInstitutionId: { in: ptiIds } }, select: { id: true } });
    const receivableIds = receivables.map((r) => r.id);
    await tx.paymentHistory.deleteMany({ where: { receivableId: { in: receivableIds } } });
    await tx.receivable.deleteMany({ where: { projectTermInstitutionId: { in: ptiIds } } });
    await tx.taxInvoice.deleteMany({ where: { projectTermInstitutionId: { in: ptiIds } } });
    await tx.claim.deleteMany({ where: { projectTermInstitutionId: { in: ptiIds } } });
    await tx.termFee.deleteMany({ where: { projectTermInstitutionId: { in: ptiIds } } });
    await tx.unclaimedFee.deleteMany({ where: { projectTermInstitutionId: { in: ptiIds } } });
    await tx.termFeeCalc.deleteMany({ where: { projectId, termNumber: { in: deletableTermNumbers } } });
  });

  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (project) {
    const extra = project.extraData ? (JSON.parse(project.extraData) as { currentTerm?: number }) : {};
    if (extra.currentTerm !== undefined && deletableTermNumbers.includes(extra.currentTerm)) {
      const remaining = await prisma.termFee.findMany({
        where: { projectTermInstitution: { projectTerm: { projectId } } },
        include: { projectTermInstitution: { include: { projectTerm: true } } },
      });
      const remainingTermNumbers = remaining.map((r) => r.projectTermInstitution.projectTerm.termNumber);
      extra.currentTerm = remainingTermNumbers.length > 0 ? Math.max(...remainingTermNumbers) : 1;
      await prisma.project.update({ where: { id: projectId }, data: { extraData: JSON.stringify(extra) } });
    }
  }

  await prisma.auditLog.create({
    data: {
      userId: actor.userId,
      action: "DELETE",
      resourceType: "projectTerms",
      resourceId: projectId,
      oldValues: JSON.stringify({ deletedTermNumbers: deletableTermNumbers }),
    },
  });

  return Response.json({ ok: true, deletedTermNumbers: deletableTermNumbers });
}
