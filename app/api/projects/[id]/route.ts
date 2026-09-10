import { prisma } from "@/lib/db";
import { requireWriteAccess, SessionError } from "@/lib/session";
import { toProject } from "@/lib/project-mapper";
import { writeAuditLog } from "@/lib/audit";
import type { Project } from "@/lib/mock";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  let actor;
  try {
    actor = await requireWriteAccess(["projects", "fees", "fees-info-edit"]);
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }

  let body: Partial<Project>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }

  const before = await prisma.project.findUnique({ where: { id } });
  if (!before) return Response.json({ ok: false, error: "과제를 찾을 수 없습니다." }, { status: 404 });

  const prevExtra = before.extraData ? (JSON.parse(before.extraData) as Record<string, unknown>) : {};
  const extraKeys = [
    "firstStartDate", "finalEndDate", "stageStartDate", "stageEndDate", "annualFinancials", "usageReportDeadline",
    "agencyAssignedAt", "internalAssignedAt", "projectCategory", "researchLead", "researchLeadEmail",
    "researchLeadOverrides", "projectCode", "termCodes", "projectDivision", "billingType", "agreementType",
    "stages", "autonomySettlementType", "programType", "assignedManagerPrimary", "assignedManagerPrimaryHistory",
    "assignedManagerPrimaryUserId", "assignedManager", "assignedManagerHistory", "assignedManagerUserId",
    "currentTerm", "leadInstitutionId", "leadInstitutionName", "totalBudget",
    "govGrant", "privateCash", "privateInKind",
  ] as const;
  const nextExtra = { ...prevExtra };
  for (const key of extraKeys) {
    if (key in body) nextExtra[key] = (body as Record<string, unknown>)[key];
  }

  const startYear = body.startDate ? new Date(body.startDate).getUTCFullYear() : undefined;
  const endYear = body.endDate ? new Date(body.endDate).getUTCFullYear() : undefined;

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.project.update({
      where: { id },
      data: {
        projectNumber: body.projectNumber ?? undefined,
        projectName: body.projectName ?? undefined,
        projectType: body.projectType ?? undefined,
        agency: body.agency !== undefined ? body.agency : undefined,
        fundingAgencyId: body.agencyId !== undefined ? body.agencyId || null : undefined,
        settlementType: body.autonomySettlementType ?? undefined,
        startYear: startYear ?? undefined,
        endYear: endYear ?? undefined,
        totalTerms: body.totalTerms ?? undefined,
        status: body.status ?? undefined,
        extraData: JSON.stringify(nextExtra),
      },
    });
    const afterProject = toProject(row);
    await writeAuditLog(tx, {
      actorUserId: actor.userId,
      entityType: "project",
      entityId: row.id,
      entityLabel: afterProject.projectName,
      action: "UPDATE",
      before: toProject(before) as unknown as Record<string, unknown>,
      after: afterProject as unknown as Record<string, unknown>,
    });
    return row;
  });

  return Response.json({ ok: true, project: toProject(updated) });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  let actor;
  try {
    actor = await requireWriteAccess("projects-delete");
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }

  const target = await prisma.project.findUnique({ where: { id } });
  if (!target) return Response.json({ ok: false, error: "과제를 찾을 수 없습니다." }, { status: 404 });

  const terms = await prisma.projectTerm.findMany({ where: { projectId: id }, select: { id: true } });
  const termIds = terms.map((t) => t.id);
  const ptis = await prisma.projectTermInstitution.findMany({ where: { projectTermId: { in: termIds } }, select: { id: true } });
  const ptiIds = ptis.map((p) => p.id);
  const receivables = await prisma.receivable.findMany({ where: { projectTermInstitutionId: { in: ptiIds } }, select: { id: true } });
  const receivableIds = receivables.map((r) => r.id);
  const taxInvoices = await prisma.taxInvoice.findMany({ where: { projectTermInstitutionId: { in: ptiIds } }, select: { id: true } });
  const taxInvoiceIds = taxInvoices.map((t) => t.id);
  const settlements = await prisma.settlement.findMany({ where: { projectTermInstitutionId: { in: ptiIds } }, select: { id: true } });
  const settlementIds = settlements.map((s) => s.id);

  await prisma.$transaction(async (tx) => {
    await tx.paymentHistory.deleteMany({ where: { receivableId: { in: receivableIds } } });
    await tx.taxInvoiceHistory.deleteMany({ where: { taxInvoiceId: { in: taxInvoiceIds } } });
    await tx.settlementHistory.deleteMany({ where: { settlementId: { in: settlementIds } } });
    await tx.receivable.deleteMany({ where: { projectTermInstitutionId: { in: ptiIds } } });
    await tx.taxInvoice.deleteMany({ where: { projectTermInstitutionId: { in: ptiIds } } });
    await tx.claim.deleteMany({ where: { projectTermInstitutionId: { in: ptiIds } } });
    await tx.termFee.deleteMany({ where: { projectTermInstitutionId: { in: ptiIds } } });
    await tx.unclaimedFee.deleteMany({ where: { projectTermInstitutionId: { in: ptiIds } } });
    await tx.settlement.deleteMany({ where: { projectTermInstitutionId: { in: ptiIds } } });
    await tx.projectTermInstitution.deleteMany({ where: { id: { in: ptiIds } } });
    await tx.projectTerm.deleteMany({ where: { projectId: id } });
    await tx.termFeeCalc.deleteMany({ where: { projectId: id } });
    await tx.projectIssue.deleteMany({ where: { projectId: id } });
    await tx.project.delete({ where: { id } });

    await writeAuditLog(tx, {
      actorUserId: actor.userId,
      entityType: "project",
      entityId: target.id,
      entityLabel: target.projectName,
      action: "DELETE",
    });
  });

  return Response.json({ ok: true });
}
