import { prisma, withDbWriteSlot } from "@/lib/db";
import { requireUser, requireWriteAccess, SessionError } from "@/lib/session";
import { toProject } from "@/lib/project-mapper";
import { writeAuditLog } from "@/lib/audit";
import type { Project } from "@/lib/mock";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireUser();
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }
  const rows = await prisma.project.findMany({ orderBy: { createdAt: "asc" } });
  return Response.json({ ok: true, projects: rows.map(toProject) });
}

export async function POST(request: Request) {
  let actor;
  try {
    actor = await requireWriteAccess(["fees", "projects"]);
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }

  let body: Omit<Project, "id">;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }
  if (!body.projectNumber || !body.projectName) {
    return Response.json({ ok: false, error: "과제번호, 과제명은 필수입니다." }, { status: 400 });
  }

  const startYear = body.startDate ? new Date(body.startDate).getUTCFullYear() : new Date().getUTCFullYear();
  const endYear = body.endDate ? new Date(body.endDate).getUTCFullYear() : startYear;

  const created = await withDbWriteSlot(() => prisma.$transaction(async (tx) => {
    const row = await tx.project.create({
      data: {
        projectNumber: body.projectNumber,
        projectName: body.projectName,
        projectType: body.projectType ?? "GENERAL",
        agency: body.agency ?? null,
        fundingAgencyId: body.agencyId || null,
        settlementType: body.autonomySettlementType ?? "위탁정산",
        startYear,
        endYear: endYear >= startYear ? endYear : startYear,
        totalTerms: body.totalTerms ?? 1,
        status: body.status ?? "ACTIVE",
        createdBy: actor.userId,
        extraData: JSON.stringify({
          firstStartDate: body.firstStartDate, finalEndDate: body.finalEndDate,
          stageStartDate: body.stageStartDate, stageEndDate: body.stageEndDate,
          annualFinancials: body.annualFinancials, usageReportDeadline: body.usageReportDeadline,
          agencyAssignedAt: body.agencyAssignedAt, internalAssignedAt: body.internalAssignedAt,
          projectCategory: body.projectCategory, researchLead: body.researchLead,
          researchLeadEmail: body.researchLeadEmail, researchLeadOverrides: body.researchLeadOverrides,
          projectCode: body.projectCode, termCodes: body.termCodes, projectDivision: body.projectDivision,
          billingType: body.billingType, agreementType: body.agreementType, stages: body.stages,
          autonomySettlementType: body.autonomySettlementType, programType: body.programType,
          assignedManagerPrimary: body.assignedManagerPrimary,
          assignedManagerPrimaryHistory: body.assignedManagerPrimaryHistory,
          assignedManagerPrimaryUserId: body.assignedManagerPrimaryUserId,
          assignedManager: body.assignedManager, assignedManagerHistory: body.assignedManagerHistory,
          assignedManagerUserId: body.assignedManagerUserId,
          currentTerm: body.currentTerm ?? 1, leadInstitutionId: body.leadInstitutionId,
          leadInstitutionName: body.leadInstitutionName, totalBudget: body.totalBudget ?? 0,
          govGrant: body.govGrant, privateCash: body.privateCash, privateInKind: body.privateInKind,
        }),
      },
    });
    await writeAuditLog(tx, {
      actorUserId: actor.userId,
      entityType: "project",
      entityId: row.id,
      entityLabel: toProject(row).projectName,
      action: "CREATE",
    });
    return row;
  }));

  return Response.json({ ok: true, project: toProject(created) });
}
