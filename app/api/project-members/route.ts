import { prisma, withDbWriteSlot } from "@/lib/db";
import { requireUser, requireWriteAccess, SessionError } from "@/lib/session";
import { groupPtisToMembers } from "@/lib/project-member-mapper";
import { getOrCreatePti } from "@/lib/pti-helper";
import { writeAuditLog } from "@/lib/audit";
import type { ProjectMember } from "@/lib/mock";

export const runtime = "nodejs";

const PTI_INCLUDE = { projectTerm: { include: { project: true } }, institution: true } as const;

export async function GET() {
  try {
    await requireUser();
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }
  const rows = await prisma.projectTermInstitution.findMany({ include: PTI_INCLUDE });
  return Response.json({ ok: true, members: groupPtisToMembers(rows) });
}

export async function POST(request: Request) {
  let actor;
  try {
    // 과제상세의 참여기관 추가("projects" 권한)뿐 아니라 수수료청구관리의 RCMS 엑셀 일괄등록
    // ("fees" 권한)도 참여기관을 새로 만든다.
    actor = await requireWriteAccess(["projects", "fees"]);
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

  const member = await withDbWriteSlot(() => prisma.$transaction(async (tx) => {
    if (body.annualBudgets && body.annualBudgets.length > 0) {
      for (const ab of body.annualBudgets) {
        const budget = BigInt(Math.round(ab.cashBudget + ab.inKindBudget));
        const ptiId = await getOrCreatePti(tx, body.projectId, ab.termNumber, body.institutionId, role, budget, ab.termYear);
        await tx.projectTermInstitution.update({
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
      const project = await tx.project.findUnique({ where: { id: body.projectId } });
      const extra = project?.extraData ? (JSON.parse(project.extraData) as { currentTerm?: number }) : {};
      const budget = BigInt(Math.round(body.budget ?? 0));
      const ptiId = await getOrCreatePti(tx, body.projectId, extra.currentTerm ?? 1, body.institutionId, role, budget);
      await tx.projectTermInstitution.update({
        where: { id: ptiId },
        data: { extraData: JSON.stringify({ ...sharedExtra, cashBudget: body.cashBudget ?? body.budget, inKindBudget: body.inKindBudget ?? 0 }) },
      });
    }

    const rows = await tx.projectTermInstitution.findMany({
      where: { institutionId: body.institutionId, projectTerm: { projectId: body.projectId } },
      include: PTI_INCLUDE,
    });
    const [createdMember] = groupPtisToMembers(rows);

    await writeAuditLog(tx, {
      actorUserId: actor.userId,
      entityType: "projectMember",
      entityId: createdMember.id,
      entityLabel: `${createdMember.projectNumber} · ${createdMember.institutionName}`,
      action: "CREATE",
    });

    return createdMember;
  }));

  return Response.json({ ok: true, member });
}
