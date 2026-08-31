import { prisma } from "@/lib/db";
import { requireUser, SessionError } from "@/lib/session";
import { groupPtisToMembers } from "@/lib/project-member-mapper";
import { getOrCreatePti } from "@/lib/pti-helper";
import type { ProjectMember } from "@/lib/mock";

export const runtime = "nodejs";

const PTI_INCLUDE = { projectTerm: { include: { project: true } }, institution: true } as const;

export async function GET() {
  const rows = await prisma.projectTermInstitution.findMany({ include: PTI_INCLUDE });
  return Response.json({ ok: true, members: groupPtisToMembers(rows) });
}

export async function POST(request: Request) {
  let actor;
  try {
    actor = await requireUser();
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }

  let body: Omit<ProjectMember, "id">;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }
  if (!body.projectId || !body.institutionId) {
    return Response.json({ ok: false, error: "과제, 참여기관은 필수입니다." }, { status: 400 });
  }

  const role = body.role === "LEAD" ? "MAIN" : "PARTICIPATING";
  const sharedExtra = {
    feeRate: body.feeRate, calculatedFee: body.calculatedFee, institutionGrade: body.institutionGrade,
    gradeOverrides: body.gradeOverrides, contactName: body.contactName, contactEmail: body.contactEmail,
    contactPhone: body.contactPhone, recipientOverrides: body.recipientOverrides,
    settlementType: body.settlementType, settlementTypeOverrides: body.settlementTypeOverrides,
    exemptRefGrade: body.exemptRefGrade, role: body.role,
  };

  if (body.annualBudgets && body.annualBudgets.length > 0) {
    for (const ab of body.annualBudgets) {
      const budget = BigInt(Math.round(ab.cashBudget + ab.inKindBudget));
      const ptiId = await getOrCreatePti(prisma, body.projectId, ab.termNumber, body.institutionId, role, budget);
      await prisma.projectTermInstitution.update({
        where: { id: ptiId },
        data: {
          extraData: JSON.stringify({
            ...sharedExtra, cashBudget: ab.cashBudget, inKindBudget: ab.inKindBudget,
            termStartDate: ab.termStartDate, termEndDate: ab.termEndDate, auditFirm: ab.auditFirm,
          }),
        },
      });
    }
  } else {
    const project = await prisma.project.findUnique({ where: { id: body.projectId } });
    const extra = project?.extraData ? (JSON.parse(project.extraData) as { currentTerm?: number }) : {};
    const budget = BigInt(Math.round(body.budget ?? 0));
    const ptiId = await getOrCreatePti(prisma, body.projectId, extra.currentTerm ?? 1, body.institutionId, role, budget);
    await prisma.projectTermInstitution.update({
      where: { id: ptiId },
      data: { extraData: JSON.stringify({ ...sharedExtra, cashBudget: body.cashBudget ?? body.budget, inKindBudget: body.inKindBudget ?? 0 }) },
    });
  }

  await prisma.auditLog.create({
    data: { userId: actor.userId, action: "CREATE", resourceType: "projectMember", resourceId: body.institutionId, newValues: JSON.stringify({ projectId: body.projectId, institutionId: body.institutionId }) },
  });

  const rows = await prisma.projectTermInstitution.findMany({
    where: { institutionId: body.institutionId, projectTerm: { projectId: body.projectId } },
    include: PTI_INCLUDE,
  });
  const [member] = groupPtisToMembers(rows);
  return Response.json({ ok: true, member });
}
