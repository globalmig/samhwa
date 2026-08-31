import type { TermFeeCalc as PrismaTermFeeCalc } from "@prisma/client";
import type { TermFeeCalc } from "./mock";

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function toTermFeeCalc(t: PrismaTermFeeCalc): TermFeeCalc {
  return {
    id: t.id,
    projectId: t.projectId,
    projectNumber: t.projectNumber,
    projectName: t.projectName,
    agencyId: t.fundingAgencyId,
    termYear: t.termYear,
    termNumber: t.termNumber,
    stageNumber: t.stageNumber,
    workType: t.workType as TermFeeCalc["workType"],
    totalCashBudget: Number(t.totalCashBudget),
    coInstCount: t.coInstCount,
    baseFee: Number(t.baseFee),
    addonFee: Number(t.addonFee),
    standardFee: Number(t.standardFee),
    nonExemptCashBudget: Number(t.nonExemptCashBudget),
    nonExemptCoInstCount: t.nonExemptCoInstCount,
    nonExemptBaseFee: Number(t.nonExemptBaseFee),
    nonExemptAddonFee: Number(t.nonExemptAddonFee),
    generalFee: Number(t.generalFee),
    exemptFeeTotal: Number(t.exemptFeeTotal),
    exemptBreakdown: t.exemptBreakdown ? JSON.parse(t.exemptBreakdown) : [],
    calculatedFee: Number(t.calculatedFee),
    generalCalcFee: Number(t.generalCalcFee),
    generalBillingFee: Number(t.generalBillingFee),
    generalUnclaimedFee: Number(t.generalUnclaimedFee),
    carriedOverUnclaimed: Number(t.carriedOverUnclaimed),
    totalBillingFee: Number(t.totalBillingFee),
    overrides: t.overrides ? JSON.parse(t.overrides) : [],
    status: t.status as TermFeeCalc["status"],
    createdAt: toDateStr(t.createdAt),
    updatedAt: t.updatedAt ? toDateStr(t.updatedAt) : undefined,
  };
}
