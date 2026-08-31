import type { Project as PrismaProject } from "@prisma/client";
import type { Project } from "./mock";

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function toProject(p: PrismaProject): Project {
  const extra = p.extraData ? (JSON.parse(p.extraData) as Record<string, unknown>) : {};
  return {
    id: p.id,
    projectNumber: p.projectNumber,
    projectName: p.projectName,
    agencyId: p.fundingAgencyId ?? "",
    agency: p.agency ?? "",
    leadInstitutionId: (extra.leadInstitutionId as string) ?? "",
    leadInstitutionName: (extra.leadInstitutionName as string) ?? "",
    totalBudget: (extra.totalBudget as number) ?? 0,
    startDate: `${p.startYear}-01-01`,
    endDate: `${p.endYear}-12-31`,
    totalTerms: p.totalTerms,
    currentTerm: (extra.currentTerm as number) ?? 1,
    status: p.status as Project["status"],
    firstStartDate: (extra.firstStartDate as string) ?? undefined,
    finalEndDate: (extra.finalEndDate as string) ?? undefined,
    stageStartDate: (extra.stageStartDate as string) ?? undefined,
    stageEndDate: (extra.stageEndDate as string) ?? undefined,
    annualFinancials: (extra.annualFinancials as Project["annualFinancials"]) ?? undefined,
    usageReportDeadline: (extra.usageReportDeadline as string) ?? undefined,
    agencyAssignedAt: (extra.agencyAssignedAt as string) ?? undefined,
    internalAssignedAt: (extra.internalAssignedAt as string) ?? undefined,
    projectCategory: (extra.projectCategory as string) ?? undefined,
    researchLead: (extra.researchLead as string) ?? undefined,
    researchLeadEmail: (extra.researchLeadEmail as string) ?? undefined,
    researchLeadOverrides: (extra.researchLeadOverrides as Project["researchLeadOverrides"]) ?? undefined,
    projectCode: (extra.projectCode as string) ?? undefined,
    termCodes: (extra.termCodes as Project["termCodes"]) ?? undefined,
    projectDivision: (extra.projectDivision as Project["projectDivision"]) ?? undefined,
    billingType: (extra.billingType as Project["billingType"]) ?? undefined,
    agreementType: (extra.agreementType as Project["agreementType"]) ?? undefined,
    stages: (extra.stages as Project["stages"]) ?? undefined,
    projectType: (p.projectType as Project["projectType"]) ?? undefined,
    autonomySettlementType: (extra.autonomySettlementType as Project["autonomySettlementType"]) ?? undefined,
    programType: (extra.programType as Project["programType"]) ?? undefined,
    assignedManagerPrimary: (extra.assignedManagerPrimary as string) ?? undefined,
    assignedManagerPrimaryHistory: (extra.assignedManagerPrimaryHistory as Project["assignedManagerPrimaryHistory"]) ?? undefined,
    assignedManagerPrimaryUserId: (extra.assignedManagerPrimaryUserId as string) ?? undefined,
    assignedManager: (extra.assignedManager as string) ?? undefined,
    assignedManagerHistory: (extra.assignedManagerHistory as Project["assignedManagerHistory"]) ?? undefined,
    assignedManagerUserId: (extra.assignedManagerUserId as string) ?? undefined,
    registeredAt: toDateStr(p.createdAt),
  };
}
