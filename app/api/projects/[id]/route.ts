import { prisma, withDbWriteSlot, withDeadlockRetry, describeDbWriteError } from "@/lib/db";
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

  const updated = await withDbWriteSlot(() => prisma.$transaction(async (tx) => {
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
  }));

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

  // PATCH(withDbWriteSlot)와 달리 이 삭제는 연결 테이블을 10곳 넘게 순차 조회·삭제하는 무거운
  // 작업이라, 동시성 제한과 에러 처리 없이는 일괄삭제 시 원격 DB 커넥션 풀이 고갈돼 일부 요청이
  // 원인 불명의 빈 500으로 실패한다(엑셀 대량 업로드에서 겪은 것과 같은 문제 — describeDbWriteError
  // 참고). 프론트(deleteProject)는 실패 응답을 받으면 로컬 상태를 되돌리므로, 이 안에서 던지는
  // 예외가 빈 500이 아니라 파싱 가능한 에러 응답으로 나가야 그 되돌림이 실제로 일어난다.
  //
  // withDbWriteSlot으로 동시 실행 개수를 제한해도(P2024 대응) 과제별 삭제 대상 행 자체는 서로
  // 겹치지 않기 때문에, 여러 과제를 동시에 지울 때 SQL Server가 같은 테이블의 잠금 경합을 데드락으로
  // 판단해 트랜잭션을 강제 종료시키는 경우(P2034)가 남는다 — withDeadlockRetry로 감싸 자동 재시도한다.
  try {
    await withDbWriteSlot(async () => {
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

      await withDeadlockRetry(() => prisma.$transaction(async (tx) => {
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
      }));
    });
  } catch (err) {
    console.error("과제 삭제 실패:", err);
    return Response.json({ ok: false, error: describeDbWriteError(err, "과제를 삭제하지 못했습니다.") }, { status: 500 });
  }

  return Response.json({ ok: true });
}
