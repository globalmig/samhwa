import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireUser, SessionError } from "@/lib/session";
import { groupPtisToMembers } from "@/lib/project-member-mapper";
import { getOrCreatePti } from "@/lib/pti-helper";
import type { ProjectMember } from "@/lib/mock";

export const runtime = "nodejs";

const PTI_INCLUDE = { projectTerm: { include: { project: true } }, institution: true } as const;

type Params = { params: Promise<{ id: string }> };
type SharedExtra = Record<string, unknown>;

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  let actor;
  try {
    actor = await requireUser();
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

  const sharedKeys = [
    "feeRate", "calculatedFee", "institutionGrade", "gradeOverrides", "contactName", "contactEmail",
    "contactPhone", "recipientOverrides", "settlementType", "settlementTypeOverrides", "exemptRefGrade", "role",
  ] as const;
  const hasSharedPatch = sharedKeys.some((k) => k in body);
  const newRole = body.role !== undefined ? (body.role === "LEAD" ? "MAIN" : "PARTICIPATING") : undefined;

  if (hasSharedPatch || newRole) {
    for (const row of siblings) {
      const rowExtra: SharedExtra = row.extraData ? JSON.parse(row.extraData) : {};
      const nextExtra = { ...rowExtra };
      for (const key of sharedKeys) {
        if (key in body) nextExtra[key] = (body as Record<string, unknown>)[key];
      }
      await prisma.projectTermInstitution.update({
        where: { id: row.id },
        data: { extraData: JSON.stringify(nextExtra), role: newRole ?? undefined },
      });
    }
  }

  if (body.annualBudgets && body.annualBudgets.length > 0) {
    const role = newRole ?? anchor.role;
    for (const ab of body.annualBudgets) {
      const budget = BigInt(Math.round(ab.cashBudget + ab.inKindBudget));
      const ptiId = await getOrCreatePti(prisma, projectId, ab.termNumber, institutionId, role, budget);
      const row = await prisma.projectTermInstitution.findUniqueOrThrow({ where: { id: ptiId } });
      const rowExtra: SharedExtra = row.extraData ? JSON.parse(row.extraData) : {};
      await prisma.projectTermInstitution.update({
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
    await prisma.projectTermInstitution.update({
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

  await prisma.auditLog.create({
    data: { userId: actor.userId, action: "UPDATE", resourceType: "projectMember", resourceId: id, newValues: JSON.stringify({ projectId, institutionId }) },
  });

  const updatedRows = await prisma.projectTermInstitution.findMany({
    where: { institutionId, projectTerm: { projectId } },
    include: PTI_INCLUDE,
  });
  const [member] = groupPtisToMembers(updatedRows);
  return Response.json({ ok: true, member });
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

  const anchor = await prisma.projectTermInstitution.findUnique({ where: { id }, include: { projectTerm: true } });
  if (!anchor) return Response.json({ ok: false, error: "참여기관 정보를 찾을 수 없습니다." }, { status: 404 });

  const siblings = await prisma.projectTermInstitution.findMany({
    where: { institutionId: anchor.institutionId, projectTerm: { projectId: anchor.projectTerm.projectId } },
    select: { id: true },
  });
  const ptiIds = siblings.map((s) => s.id);

  try {
    await prisma.projectTermInstitution.deleteMany({ where: { id: { in: ptiIds } } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && (err.code === "P2003" || err.code === "P2014")) {
      return Response.json(
        { ok: false, error: "이 참여기관은 연차수수료·미수금·세금계산서·정산 등에서 이미 참조 중이라 삭제할 수 없습니다." },
        { status: 409 }
      );
    }
    throw err;
  }

  await prisma.auditLog.create({
    data: { userId: actor.userId, action: "DELETE", resourceType: "projectMember", resourceId: id, oldValues: JSON.stringify({ institutionId: anchor.institutionId }) },
  });

  return Response.json({ ok: true });
}
