import type { FeePolicy as PrismaFeePolicy, FeePolicyBudgetRule, FeePolicyExemptGrade } from "@prisma/client";
import type { FeePolicy } from "./mock";

export type FeePolicyWithRelations = PrismaFeePolicy & {
  budgetRules: FeePolicyBudgetRule[];
  exemptGrades: FeePolicyExemptGrade[];
};

// DB status(DRAFT|ACTIVE|ARCHIVED) <-> mock status(DRAFT|ACTIVE|EXPIRED) — 이름이 다르다.
const DB_TO_MOCK_STATUS: Record<string, FeePolicy["status"]> = { DRAFT: "DRAFT", ACTIVE: "ACTIVE", ARCHIVED: "EXPIRED" };
export const MOCK_TO_DB_STATUS: Record<string, string> = { DRAFT: "DRAFT", ACTIVE: "ACTIVE", EXPIRED: "ARCHIVED" };

function toDateStr(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

export function toFeePolicy(p: FeePolicyWithRelations): FeePolicy {
  return {
    id: p.id,
    agencyId: p.fundingAgencyId,
    name: p.policyName,
    version: p.versionLabel ?? String(p.policyVersion),
    effectiveFrom: toDateStr(p.effectiveFrom),
    effectiveTo: p.effectiveTo ? toDateStr(p.effectiveTo) : null,
    status: DB_TO_MOCK_STATUS[p.status] ?? "DRAFT",
    standardRate: Number(p.standardRate),
    description: p.description ?? "",
    createdAt: p.createdAt.toISOString().slice(0, 10),
    createdBy: p.createdBy ?? "",
    feeRateBrackets: p.budgetRules
      .sort((a, b) => a.priority - b.priority)
      .map((r) => ({
        minAmount: Number(r.budgetMin),
        maxAmount: r.budgetMax == null ? null : Number(r.budgetMax),
        baseFee: Number(r.baseAmount ?? 0),
      })),
    coInstAddonMethod: p.coInstAddonMethod as FeePolicy["coInstAddonMethod"],
    coInstFirstRate: p.coInstFirstRate == null ? undefined : Number(p.coInstFirstRate),
    coInstAdditionalRate: p.coInstAdditionalRate == null ? undefined : Number(p.coInstAdditionalRate),
    exemptGrades: p.exemptGrades.map((g) => g.grade),
    exemptionMode: p.exemptionMode as FeePolicy["exemptionMode"],
    exemptCustomRate: p.exemptCustomRate == null ? undefined : Number(p.exemptCustomRate),
    defaultSettlementType: (p.defaultSettlementType as FeePolicy["defaultSettlementType"]) ?? undefined,
    feeBasis: p.feeBasis as FeePolicy["feeBasis"],
    hasAutonomyTrack: p.hasAutonomyTrack,
    annualBillingRate: Number(p.annualBillingRate),
    minimumFee: p.minimumFee == null ? undefined : Number(p.minimumFee),
    perInstitutionMinimumFee: p.perInstitutionMinimumFee == null ? undefined : Number(p.perInstitutionMinimumFee),
    excludeLeadFromCalc: p.excludeLeadFromCalc,
    calcMode: (p.calcMode as FeePolicy["calcMode"]) ?? undefined,
    programType: (p.programType as FeePolicy["programType"]) ?? undefined,
    legacyTransitionNote: p.legacyTransitionNote ?? undefined,
  };
}
