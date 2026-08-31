import { prisma } from "@/lib/db";
import { requireUser, SessionError } from "@/lib/session";
import { toFeePolicy, MOCK_TO_DB_STATUS, type FeePolicyWithRelations } from "@/lib/fee-policy-mapper";
import type { FeePolicy } from "@/lib/mock";

export const runtime = "nodejs";

const INCLUDE = { budgetRules: true, exemptGrades: true } as const;

export async function GET() {
  const policies = await prisma.feePolicy.findMany({ include: INCLUDE, orderBy: { createdAt: "asc" } });
  return Response.json({ ok: true, policies: (policies as FeePolicyWithRelations[]).map(toFeePolicy) });
}

export async function POST(request: Request) {
  let actor;
  try {
    actor = await requireUser();
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }

  let body: Omit<FeePolicy, "id">;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }
  if (!body.name) {
    return Response.json({ ok: false, error: "정책명은 필수입니다." }, { status: 400 });
  }

  const maxVersion = await prisma.feePolicy.aggregate({ _max: { policyVersion: true } });

  const created = await prisma.$transaction(async (tx) => {
    const policy = await tx.feePolicy.create({
      data: {
        policyName: body.name,
        policyVersion: (maxVersion._max.policyVersion ?? 0) + 1,
        description: body.description ?? null,
        status: MOCK_TO_DB_STATUS[body.status] ?? "DRAFT",
        effectiveFrom: body.effectiveFrom ? new Date(body.effectiveFrom) : null,
        effectiveTo: body.effectiveTo ? new Date(body.effectiveTo) : null,
        fundingAgencyId: body.agencyId ?? null,
        versionLabel: body.version ?? null,
        standardRate: body.standardRate ?? 0,
        coInstAddonMethod: body.coInstAddonMethod ?? "TIERED",
        coInstFirstRate: body.coInstFirstRate ?? null,
        coInstAdditionalRate: body.coInstAdditionalRate ?? null,
        exemptionMode: body.exemptionMode ?? "DISCOUNT",
        exemptCustomRate: body.exemptCustomRate ?? null,
        defaultSettlementType: body.defaultSettlementType ?? null,
        feeBasis: body.feeBasis ?? "CASH",
        hasAutonomyTrack: !!body.hasAutonomyTrack,
        annualBillingRate: body.annualBillingRate ?? 0,
        minimumFee: body.minimumFee == null ? null : BigInt(Math.round(body.minimumFee)),
        perInstitutionMinimumFee: body.perInstitutionMinimumFee == null ? null : BigInt(Math.round(body.perInstitutionMinimumFee)),
        excludeLeadFromCalc: !!body.excludeLeadFromCalc,
        calcMode: body.calcMode ?? null,
        programType: body.programType ?? null,
        legacyTransitionNote: body.legacyTransitionNote ?? null,
      },
    });

    for (const [i, br] of (body.feeRateBrackets ?? []).entries()) {
      await tx.feePolicyBudgetRule.create({
        data: { policyId: policy.id, budgetMin: BigInt(Math.round(br.minAmount)), budgetMax: br.maxAmount == null ? null : BigInt(Math.round(br.maxAmount)), baseAmount: BigInt(Math.round(br.baseFee)), priority: i },
      });
    }
    for (const grade of body.exemptGrades ?? []) {
      await tx.feePolicyExemptGrade.create({ data: { policyId: policy.id, grade } });
    }

    return tx.feePolicy.findUniqueOrThrow({ where: { id: policy.id }, include: INCLUDE });
  });

  await prisma.auditLog.create({
    data: { userId: actor.userId, action: "CREATE", resourceType: "feePolicy", resourceId: created.id, newValues: JSON.stringify({ name: created.policyName }) },
  });

  return Response.json({ ok: true, policy: toFeePolicy(created as FeePolicyWithRelations) });
}
