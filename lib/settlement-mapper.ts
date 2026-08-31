import type { Settlement as PrismaSettlement, ProjectTermInstitution, ProjectTerm, Project as PrismaProject, Institution as PrismaInstitution } from "@prisma/client";
import type { Settlement } from "./mock";

export type SettlementWithRelations = PrismaSettlement & {
  projectTermInstitution: ProjectTermInstitution & {
    projectTerm: ProjectTerm & { project: PrismaProject };
    institution: PrismaInstitution;
  };
};

const DB_TO_MOCK_STATUS: Record<string, Settlement["status"]> = {
  SCHEDULED: "SCHEDULED", IN_PROGRESS: "PENDING", COMPLETED: "PAID", CANCELLED: "SCHEDULED",
};
export const MOCK_TO_DB_STATUS: Record<string, string> = {
  PAID: "COMPLETED", PENDING: "IN_PROGRESS", SCHEDULED: "SCHEDULED",
};

function toDateStr(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
}

export function toSettlement(s: SettlementWithRelations): Settlement {
  const pti = s.projectTermInstitution;
  return {
    id: s.id,
    projectNumber: pti.projectTerm.project.projectNumber,
    projectName: pti.projectTerm.project.projectName,
    termYear: pti.projectTerm.termYear,
    institutionId: pti.institutionId,
    institutionName: pti.institution.institutionName,
    isLead: pti.role === "MAIN",
    settlementAmount: Number(s.settlementAmount),
    additionalAmount: Number(s.additionalAmount),
    feeAmount: Number(s.feeAmount),
    scheduledAmount: Number(s.scheduledAmount ?? 0),
    paidAt: toDateStr(s.settlementDate),
    status: DB_TO_MOCK_STATUS[s.status] ?? "SCHEDULED",
  };
}
