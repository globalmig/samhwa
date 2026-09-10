import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireWriteAccess, SessionError } from "@/lib/session";
import { toFeePolicy, MOCK_TO_DB_STATUS, type FeePolicyWithRelations } from "@/lib/fee-policy-mapper";
import { writeAuditLog } from "@/lib/audit";
import type { FeePolicy } from "@/lib/mock";

export const runtime = "nodejs";

const INCLUDE = { budgetRules: true, exemptGrades: true } as const;

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  let actor;
  try {
    actor = await requireWriteAccess("company-class");
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }

  let body: Partial<FeePolicy>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }

  const before = await prisma.feePolicy.findUnique({ where: { id }, include: INCLUDE });
  if (!before) return Response.json({ ok: false, error: "수수료 정책을 찾을 수 없습니다." }, { status: 404 });

  const updated = await prisma.$transaction(async (tx) => {
    await tx.feePolicy.update({
      where: { id },
      data: {
        policyName: body.name ?? undefined,
        description: body.description !== undefined ? body.description : undefined,
        status: body.status ? MOCK_TO_DB_STATUS[body.status] ?? undefined : undefined,
        effectiveFrom: body.effectiveFrom !== undefined ? (body.effectiveFrom ? new Date(body.effectiveFrom) : null) : undefined,
        effectiveTo: body.effectiveTo !== undefined ? (body.effectiveTo ? new Date(body.effectiveTo) : null) : undefined,
        fundingAgencyId: body.agencyId !== undefined ? body.agencyId : undefined,
        versionLabel: body.version !== undefined ? body.version : undefined,
        standardRate: body.standardRate ?? undefined,
        coInstAddonMethod: body.coInstAddonMethod ?? undefined,
        coInstFirstRate: body.coInstFirstRate !== undefined ? body.coInstFirstRate : undefined,
        coInstAdditionalRate: body.coInstAdditionalRate !== undefined ? body.coInstAdditionalRate : undefined,
        exemptionMode: body.exemptionMode ?? undefined,
        exemptCustomRate: body.exemptCustomRate !== undefined ? body.exemptCustomRate : undefined,
        defaultSettlementType: body.defaultSettlementType !== undefined ? body.defaultSettlementType : undefined,
        feeBasis: body.feeBasis ?? undefined,
        hasAutonomyTrack: body.hasAutonomyTrack !== undefined ? body.hasAutonomyTrack : undefined,
        annualBillingRate: body.annualBillingRate ?? undefined,
        minimumFee: body.minimumFee !== undefined ? (body.minimumFee == null ? null : BigInt(Math.round(body.minimumFee))) : undefined,
        perInstitutionMinimumFee: body.perInstitutionMinimumFee !== undefined ? (body.perInstitutionMinimumFee == null ? null : BigInt(Math.round(body.perInstitutionMinimumFee))) : undefined,
        excludeLeadFromCalc: body.excludeLeadFromCalc !== undefined ? body.excludeLeadFromCalc : undefined,
        calcMode: body.calcMode !== undefined ? body.calcMode : undefined,
        programType: body.programType !== undefined ? body.programType : undefined,
        legacyTransitionNote: body.legacyTransitionNote !== undefined ? body.legacyTransitionNote : undefined,
      },
    });

    // 구간표/면제등급이 요청에 포함돼 있으면 기존 것을 전부 지우고 새로 쓴다 (mock의 배열 통째 교체와 동일한 시맨틱)
    if (body.feeRateBrackets !== undefined) {
      await tx.feePolicyBudgetRule.deleteMany({ where: { policyId: id } });
      for (const [i, br] of body.feeRateBrackets.entries()) {
        await tx.feePolicyBudgetRule.create({
          data: { policyId: id, budgetMin: BigInt(Math.round(br.minAmount)), budgetMax: br.maxAmount == null ? null : BigInt(Math.round(br.maxAmount)), baseAmount: BigInt(Math.round(br.baseFee)), priority: i },
        });
      }
    }
    if (body.exemptGrades !== undefined) {
      await tx.feePolicyExemptGrade.deleteMany({ where: { policyId: id } });
      for (const grade of body.exemptGrades) {
        await tx.feePolicyExemptGrade.create({ data: { policyId: id, grade } });
      }
    }

    const full = await tx.feePolicy.findUniqueOrThrow({ where: { id }, include: INCLUDE });
    const afterPolicy = toFeePolicy(full as FeePolicyWithRelations);
    await writeAuditLog(tx, {
      actorUserId: actor.userId,
      entityType: "feePolicy",
      entityId: id,
      entityLabel: afterPolicy.name,
      action: "UPDATE",
      before: toFeePolicy(before as FeePolicyWithRelations) as unknown as Record<string, unknown>,
      after: afterPolicy as unknown as Record<string, unknown>,
    });
    return full;
  });

  return Response.json({ ok: true, policy: toFeePolicy(updated as FeePolicyWithRelations) });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  let actor;
  try {
    actor = await requireWriteAccess("company-class");
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }

  const target = await prisma.feePolicy.findUnique({ where: { id } });
  if (!target) return Response.json({ ok: false, error: "수수료 정책을 찾을 수 없습니다." }, { status: 404 });

  try {
    await prisma.$transaction(async (tx) => {
      await tx.feePolicyBudgetRule.deleteMany({ where: { policyId: id } });
      await tx.feePolicyExemptGrade.deleteMany({ where: { policyId: id } });
      await tx.feePolicy.delete({ where: { id } });
      await writeAuditLog(tx, {
        actorUserId: actor.userId,
        entityType: "feePolicy",
        entityId: target.id,
        entityLabel: target.policyName,
        action: "DELETE",
      });
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && (err.code === "P2003" || err.code === "P2014")) {
      return Response.json(
        { ok: false, error: `"${target.policyName}"은(는) 다른 데이터에서 참조 중이라 삭제할 수 없습니다.` },
        { status: 409 }
      );
    }
    throw err;
  }

  return Response.json({ ok: true });
}
