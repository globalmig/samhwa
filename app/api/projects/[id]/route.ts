import { prisma } from "@/lib/db";
import { requireUser, SessionError } from "@/lib/session";
import { toProject } from "@/lib/project-mapper";
import type { Project } from "@/lib/mock";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  let actor;
  try {
    actor = await requireUser();
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
  ] as const;
  const nextExtra = { ...prevExtra };
  for (const key of extraKeys) {
    if (key in body) nextExtra[key] = (body as Record<string, unknown>)[key];
  }

  const startYear = body.startDate ? new Date(body.startDate).getUTCFullYear() : undefined;
  const endYear = body.endDate ? new Date(body.endDate).getUTCFullYear() : undefined;

  const updated = await prisma.project.update({
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

  await prisma.auditLog.create({
    data: {
      userId: actor.userId,
      action: "UPDATE",
      resourceType: "project",
      resourceId: id,
      oldValues: JSON.stringify({ projectNumber: before.projectNumber, projectName: before.projectName }),
      newValues: JSON.stringify({ projectNumber: updated.projectNumber, projectName: updated.projectName }),
    },
  });

  return Response.json({ ok: true, project: toProject(updated) });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  let actor;
  try {
    actor = await requireUser();
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

  await prisma.$transaction([
    prisma.paymentHistory.deleteMany({ where: { receivableId: { in: receivableIds } } }),
    prisma.taxInvoiceHistory.deleteMany({ where: { taxInvoiceId: { in: taxInvoiceIds } } }),
    prisma.settlementHistory.deleteMany({ where: { settlementId: { in: settlementIds } } }),
    prisma.receivable.deleteMany({ where: { projectTermInstitutionId: { in: ptiIds } } }),
    prisma.taxInvoice.deleteMany({ where: { projectTermInstitutionId: { in: ptiIds } } }),
    prisma.claim.deleteMany({ where: { projectTermInstitutionId: { in: ptiIds } } }),
    prisma.termFee.deleteMany({ where: { projectTermInstitutionId: { in: ptiIds } } }),
    prisma.unclaimedFee.deleteMany({ where: { projectTermInstitutionId: { in: ptiIds } } }),
    prisma.settlement.deleteMany({ where: { projectTermInstitutionId: { in: ptiIds } } }),
    prisma.projectTermInstitution.deleteMany({ where: { id: { in: ptiIds } } }),
    prisma.projectTerm.deleteMany({ where: { projectId: id } }),
    prisma.termFeeCalc.deleteMany({ where: { projectId: id } }),
    prisma.projectIssue.deleteMany({ where: { projectId: id } }),
    prisma.project.delete({ where: { id } }),
  ]);

  await prisma.auditLog.create({
    data: { userId: actor.userId, action: "DELETE", resourceType: "project", resourceId: id, oldValues: JSON.stringify({ projectNumber: target.projectNumber, projectName: target.projectName }) },
  });

  return Response.json({ ok: true });
}
