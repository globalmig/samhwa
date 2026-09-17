import { prisma, withDbWriteSlot, withDeadlockRetry, describeDbWriteError } from "@/lib/db";
import { requireUser, requireWriteAccess, SessionError } from "@/lib/session";
import { groupPtisToMembers } from "@/lib/project-member-mapper";
import { getOrCreatePti } from "@/lib/pti-helper";
import { withMemberLock } from "@/lib/project-member-patch";
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
    leadName: body.leadName, leadEmail: body.leadEmail, leadOverrides: body.leadOverrides,
  };

  // 새로 만드는 참여기관도 결국 (institutionId, projectId) 기준 PTI 행 집합을 건드리므로,
  // applyProjectMemberPatch(PATCH·bulk-patch)·DELETE와 같은 락을 써야 한다 — 안 그러면 같은 기관을
  // 방금 생성하면서(이 요청) 동시에 다른 요청이 patch/delete하면 서로 다른 순서로 행을 잠가
  // 데드락(P2034)·트랜잭션 타임아웃(P2028)을 일으킬 수 있다. lib/project-member-patch.ts
  // withMemberLock 주석 참고. 이건 같은 (institutionId, projectId)끼리의 경합만 막아주므로,
  // 서로 다른 참여기관을 동시에 여러 건 만들 때(엑셀 대량 업로드) 감사로그 등 공유 테이블에서
  // 생기는 데드락은 withDeadlockRetry로 재시도한다.
  let member;
  try {
    member = await withDbWriteSlot(() => withMemberLock(`${body.institutionId}:${body.projectId}`, () => withDeadlockRetry(() => prisma.$transaction(async (tx) => {
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
    }))));
  } catch (err) {
    console.error("참여기관 생성 실패:", err);
    return Response.json({ ok: false, error: describeDbWriteError(err, "참여기관을 생성하지 못했습니다.") }, { status: 500 });
  }

  return Response.json({ ok: true, member });
}
