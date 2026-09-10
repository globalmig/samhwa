import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireWriteAccess, SessionError } from "@/lib/session";
import { groupPtisToMembers } from "@/lib/project-member-mapper";
import { getOrCreatePti } from "@/lib/pti-helper";
import { writeAuditLog } from "@/lib/audit";
import type { ProjectMember } from "@/lib/mock";

export const runtime = "nodejs";

const PTI_INCLUDE = { projectTerm: { include: { project: true } }, institution: true } as const;

type Params = { params: Promise<{ id: string }> };
type SharedExtra = Record<string, unknown>;

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  let actor;
  try {
    // 과제상세 수정("projects")뿐 아니라, 수수료청구관리 RCMS 엑셀 일괄등록("fees")과 수행기관관리의
    // 정산면제리스트 일괄반영("institutions", ExemptionListUploadModal → applyInstitutionGradeToProjects)도
    // 이 라우트로 참여기관 등급 등을 갱신한다.
    actor = await requireWriteAccess(["projects", "fees", "institutions"]);
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }

  let body: Partial<ProjectMember>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }

  const anchor = await prisma.projectTermInstitution.findUnique({ where: { id }, include: PTI_INCLUDE });
  if (!anchor) return Response.json({ ok: false, error: "참여기관 정보를 찾을 수 없습니다." }, { status: 404 });

  const projectId = anchor.projectTerm.projectId;
  const institutionId = anchor.institutionId;
  const siblings = await prisma.projectTermInstitution.findMany({
    where: { institutionId, projectTerm: { projectId } },
    include: PTI_INCLUDE,
  });
  const [beforeMember] = groupPtisToMembers(siblings);

  const sharedKeys = [
    "feeRate", "calculatedFee", "institutionGrade", "gradeOverrides", "contactName", "contactEmail",
    "contactPhone", "recipientOverrides", "settlementType", "settlementTypeOverrides", "exemptRefGrade", "role",
  ] as const;
  const hasSharedPatch = sharedKeys.some((k) => k in body);
  const newRole = body.role !== undefined ? (body.role === "LEAD" ? "MAIN" : "PARTICIPATING") : undefined;

  const member = await prisma.$transaction(async (tx) => {
    if (hasSharedPatch || newRole) {
      for (const row of siblings) {
        const rowExtra: SharedExtra = row.extraData ? JSON.parse(row.extraData) : {};
        const nextExtra = { ...rowExtra };
        for (const key of sharedKeys) {
          if (key in body) nextExtra[key] = (body as Record<string, unknown>)[key];
        }
        await tx.projectTermInstitution.update({
          where: { id: row.id },
          data: { extraData: JSON.stringify(nextExtra), role: newRole ?? undefined },
        });
      }
    }

    if (body.annualBudgets && body.annualBudgets.length > 0) {
      const role = newRole ?? anchor.role;
      for (const ab of body.annualBudgets) {
        const budget = BigInt(Math.round(ab.cashBudget + ab.inKindBudget));
        const ptiId = await getOrCreatePti(tx, projectId, ab.termNumber, institutionId, role, budget, ab.termYear);
        const row = await tx.projectTermInstitution.findUniqueOrThrow({ where: { id: ptiId } });
        const rowExtra: SharedExtra = row.extraData ? JSON.parse(row.extraData) : {};
        await tx.projectTermInstitution.update({
          where: { id: ptiId },
          data: {
            projectBudget: budget,
            extraData: JSON.stringify({
              ...rowExtra, cashBudget: ab.cashBudget, inKindBudget: ab.inKindBudget,
              termStartDate: ab.termStartDate, termEndDate: ab.termEndDate, auditFirm: ab.auditFirm,
            }),
          },
        });
      }
    } else if (body.budget !== undefined || body.cashBudget !== undefined || body.inKindBudget !== undefined) {
      // annualBudgets 없이 단일 예산만 바뀐 경우 — 기존 대표 행(anchor)의 예산만 갱신
      const rowExtra: SharedExtra = anchor.extraData ? JSON.parse(anchor.extraData) : {};
      await tx.projectTermInstitution.update({
        where: { id: anchor.id },
        data: {
          projectBudget: body.budget !== undefined ? BigInt(Math.round(body.budget)) : undefined,
          extraData: JSON.stringify({
            ...rowExtra,
            cashBudget: body.cashBudget !== undefined ? body.cashBudget : rowExtra.cashBudget,
            inKindBudget: body.inKindBudget !== undefined ? body.inKindBudget : rowExtra.inKindBudget,
          }),
        },
      });
    }

    const updatedRows = await tx.projectTermInstitution.findMany({
      where: { institutionId, projectTerm: { projectId } },
      include: PTI_INCLUDE,
    });
    const [afterMember] = groupPtisToMembers(updatedRows);

    await writeAuditLog(tx, {
      actorUserId: actor.userId,
      entityType: "projectMember",
      entityId: id,
      entityLabel: `${afterMember.projectNumber} · ${afterMember.institutionName}`,
      action: "UPDATE",
      before: beforeMember as unknown as Record<string, unknown>,
      after: afterMember as unknown as Record<string, unknown>,
    });

    return afterMember;
  });

  return Response.json({ ok: true, member });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  let actor;
  try {
    actor = await requireWriteAccess("projects");
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }

  const anchor = await prisma.projectTermInstitution.findUnique({ where: { id }, include: PTI_INCLUDE });
  if (!anchor) return Response.json({ ok: false, error: "참여기관 정보를 찾을 수 없습니다." }, { status: 404 });

  const siblings = await prisma.projectTermInstitution.findMany({
    where: { institutionId: anchor.institutionId, projectTerm: { projectId: anchor.projectTerm.projectId } },
    select: { id: true },
  });
  const ptiIds = siblings.map((s) => s.id);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.projectTermInstitution.deleteMany({ where: { id: { in: ptiIds } } });
      await writeAuditLog(tx, {
        actorUserId: actor.userId,
        entityType: "projectMember",
        entityId: anchor.id,
        entityLabel: `${anchor.projectTerm.project.projectNumber} · ${anchor.institution.institutionName}`,
        action: "DELETE",
      });
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && (err.code === "P2003" || err.code === "P2014")) {
      return Response.json(
        { ok: false, error: "이 참여기관은 연차수수료·미수금·세금계산서·정산 등에서 이미 참조 중이라 삭제할 수 없습니다." },
        { status: 409 }
      );
    }
    throw err;
  }

  return Response.json({ ok: true });
}
