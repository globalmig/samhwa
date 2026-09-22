import { Prisma } from "@prisma/client";
import { prisma, withDbWriteSlot, withDeadlockRetry, describeDbWriteError } from "@/lib/db";
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

  let created;
  try {
    // 엑셀 대량 업로드로 여러 신규 과제가 동시에 생성될 때, 감사로그(audit_log) 같은 공유 테이블에
    // 대한 잠금 경합을 SQL Server가 데드락으로 판단해 트랜잭션을 강제 종료시킬 수 있다(P2034,
    // 과제 삭제에서 겪은 것과 같은 패턴) — withDeadlockRetry로 재시도한다.
    created = await withDbWriteSlot(() => withDeadlockRetry(() => prisma.$transaction(async (tx) => {
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
            agencyAssignedAt: body.agencyAssignedAt, agencyAssignedAtHistory: body.agencyAssignedAtHistory,
            internalAssignedAt: body.internalAssignedAt, internalAssignedAtHistory: body.internalAssignedAtHistory,
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
    })));
  } catch (err) {
    // 과제번호 유니크 제약 위반 — 두 사용자가 겹치는 엑셀을 동시에 업로드했거나, 이 브라우저가
    // 들고 있던 과제 목록이 오래돼(재조회 없이 세션 내내 유지) 이미 서버에 있는 과제를 "신규"로
    // 오인한 경우다. 실패로 끝내는 대신 기존 과제를 그대로 돌려줘, 호출자가 그 과제에 이어서
    // 참여기관 등을 붙일 수 있게 한다 — getOrCreatePti(lib/pti-helper.ts)와 같은 방식.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const existing = await prisma.project.findUnique({ where: { projectNumber: body.projectNumber } });
      if (existing) return Response.json({ ok: true, project: toProject(existing) });
    }
    console.error("과제 생성 실패:", err);
    return Response.json({ ok: false, error: describeDbWriteError(err, "과제를 생성하지 못했습니다.") }, { status: 500 });
  }

  return Response.json({ ok: true, project: toProject(created) });
}
