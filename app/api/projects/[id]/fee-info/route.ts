import { Prisma } from "@prisma/client";
import { prisma, withDbWriteSlot, withDeadlockRetry, describeDbWriteError } from "@/lib/db";
import { requireWriteAccess, SessionError } from "@/lib/session";
import { writeAuditLog } from "@/lib/audit";
import { toProject } from "@/lib/project-mapper";
import { groupPtisToMembers } from "@/lib/project-member-mapper";
import { PTI_INCLUDE } from "@/lib/project-member-patch";
import { buildFeeInfoPatches, FEE_INFO_FIELDS, type FeeInfoEditRequest } from "@/lib/fee-info-edit";
import { isValidDateStr } from "@/lib/utils";

export const runtime = "nodejs";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const actor = await requireWriteAccess(["fees", "fees-info-edit"]);
    const { id } = await params;
    let body: FeeInfoEditRequest;
    try { body = await request.json(); } catch { throw new SessionError("잘못된 요청입니다.", 400); }
    if (!body || !Number.isInteger(body.termNumber) || body.termNumber < 1 ||
      typeof body.memberId !== "string" || typeof body.feeId !== "string" ||
      !body.changes || typeof body.changes !== "object" || Array.isArray(body.changes) ||
      Object.entries(body.changes).some(([key, value]) => !FEE_INFO_FIELDS.includes(key as typeof FEE_INFO_FIELDS[number]) || typeof value !== "string")) {
      throw new SessionError("수정할 정보가 올바르지 않습니다.", 400);
    }
    for (const key of ["docRequestDate", "docReplyDate", "registeredAt", "agencyAssignedAt"] as const) {
      const value = body.changes[key];
      if (value) {
        const date = new Date(`${value}T00:00:00Z`);
        if (!isValidDateStr(value) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
          throw new SessionError("날짜 형식이 올바르지 않습니다.", 400);
        }
      }
    }

    // 세 요청을 따로 저장하면 일부만 성공해도 창이 닫혔다. 읽기·변경·감사이력을 한 트랜잭션으로 묶는다.
    const patches = await withDbWriteSlot(() => withDeadlockRetry(() => prisma.$transaction(async (tx) => {
      const row = await tx.project.findUnique({ where: { id }, include: { fundingAgency: true } });
      if (!row) throw new SessionError("과제를 찾을 수 없습니다. 새로고침 후 다시 시도해주세요.", 404);
      const project = toProject(row);
      const terms = await tx.projectTerm.findMany({ where: { projectId: id }, select: { termNumber: true } });
      if (body.termNumber !== project.currentTerm && !terms.some((t) => t.termNumber === body.termNumber)) {
        throw new SessionError("수정할 연차가 없습니다. 새로고침 후 다시 시도해주세요.", 409);
      }
      const split = row.fundingAgency?.noticeRecipientScope === "LEAD_AND_PARTICIPANTS";
      const needsMember = body.changes.recipientName !== undefined || body.changes.recipientEmail !== undefined ||
        (split && body.changes.researchLeadEmail !== undefined);
      const anchor = needsMember && body.memberId
        ? await tx.projectTermInstitution.findUnique({ where: { id: body.memberId }, include: PTI_INCLUDE }) : null;
      if (needsMember && (!anchor || anchor.projectTerm.projectId !== id)) {
        throw new SessionError("참여기관 정보를 찾을 수 없습니다. 새로고침 후 다시 시도해주세요.", 409);
      }
      const siblings = anchor ? await tx.projectTermInstitution.findMany({
        where: { institutionId: anchor.institutionId, projectTerm: { projectId: id } }, include: PTI_INCLUDE,
      }) : [];
      const [member] = groupPtisToMembers(siblings);
      const needsFee = ["docRequestDate", "docReplyDate", "auditFirm"].some((key) => key in body.changes);
      const inspectFee = needsFee || (split && needsMember && !!body.feeId);
      const fee = inspectFee && body.feeId ? await tx.termFee.findUnique({
        where: { id: body.feeId }, include: { projectTermInstitution: { include: { projectTerm: true } } },
      }) : null;
      if (inspectFee && (!fee || fee.projectTermInstitution.projectTerm.projectId !== id || fee.projectTermInstitution.projectTerm.termNumber !== body.termNumber)) {
        throw new SessionError("수정할 연차수수료를 찾을 수 없습니다. 새로고침 후 다시 시도해주세요.", 409);
      }
      if (split && anchor && fee && anchor.institutionId !== fee.projectTermInstitution.institutionId) {
        throw new SessionError("선택한 연차의 참여기관이 변경되었습니다. 새로고침 후 다시 시도해주세요.", 409);
      }
      const changes = buildFeeInfoPatches(project, member, body.termNumber, terms.map((t) => t.termNumber), split, body.changes);
      if (Object.keys(changes.project).length) {
        await tx.project.update({ where: { id }, data: { extraData: JSON.stringify({ ...JSON.parse(row.extraData || "{}"), ...changes.project }) } });
        await writeAuditLog(tx, { actorUserId: actor.userId, entityType: "project", entityId: id, entityLabel: project.projectName, action: "UPDATE",
          before: project as unknown as Record<string, unknown>, after: { ...project, ...changes.project } as unknown as Record<string, unknown> });
      }
      if (member && Object.keys(changes.member).length) {
        for (const sibling of siblings) {
          await tx.projectTermInstitution.update({ where: { id: sibling.id }, data: {
            extraData: JSON.stringify({ ...JSON.parse(sibling.extraData || "{}"), ...changes.member }),
          } });
        }
        await writeAuditLog(tx, { actorUserId: actor.userId, entityType: "projectMember", entityId: body.memberId,
          entityLabel: `${project.projectNumber} · ${member.institutionName}`, action: "UPDATE",
          before: member as unknown as Record<string, unknown>, after: { ...member, ...changes.member } as unknown as Record<string, unknown> });
      }
      if (fee && needsFee) {
        const extra = JSON.parse(fee.extraData || "{}");
        await tx.termFee.update({ where: { id: fee.id }, data: { extraData: JSON.stringify({ ...extra, ...changes.fee }) } });
        await writeAuditLog(tx, { actorUserId: actor.userId, entityType: "termFee", entityId: fee.id,
          entityLabel: `${project.projectNumber} · ${body.termNumber}연차`, action: "UPDATE", before: extra, after: { ...extra, ...changes.fee } });
        if (body.changes.auditFirm !== undefined) {
          // 재계산과 엑셀 내보내기는 PTI의 연차별 회계법인명을 우선한다. 수수료 행만 고치면 옛 값으로 돌아간다.
          const pti = fee.projectTermInstitution;
          const ptiExtra = JSON.parse(pti.extraData || "{}");
          await tx.projectTermInstitution.update({ where: { id: pti.id }, data: { extraData: JSON.stringify({
            ...ptiExtra, ...(member?.institutionId === pti.institutionId ? changes.member : {}), auditFirm: body.changes.auditFirm,
          }) } });
          changes.annualAuditFirm = { institutionId: pti.institutionId, termNumber: body.termNumber, auditFirm: body.changes.auditFirm };
          await writeAuditLog(tx, { actorUserId: actor.userId, entityType: "projectMember", entityId: pti.id,
            entityLabel: `${project.projectNumber} · ${body.termNumber}연차`, action: "UPDATE",
            changedFields: { auditFirm: { before: ptiExtra.auditFirm, after: body.changes.auditFirm } } });
        }
      }
      return changes;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10_000, timeout: 30_000 })));
    return Response.json({ ok: true, patches });
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    console.error("과제 정보수정 저장 실패:", err);
    return Response.json({ ok: false, error: describeDbWriteError(err, "정보를 저장하지 못했습니다. 입력 내용을 확인하고 다시 시도해주세요.") }, { status: 500 });
  }
}
