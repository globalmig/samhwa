import type { TaxInvoice as PrismaTaxInvoice, ProjectTermInstitution, ProjectTerm, Project as PrismaProject, Institution as PrismaInstitution } from "@prisma/client";
import type { TaxInvoice } from "./mock";

export type TaxInvoiceWithRelations = PrismaTaxInvoice & {
  projectTermInstitution: ProjectTermInstitution & {
    projectTerm: ProjectTerm & { project: PrismaProject };
    institution: PrismaInstitution;
  };
};

const DB_TO_MOCK_STATUS: Record<string, TaxInvoice["status"]> = {
  DRAFT: "ISSUED", ISSUED: "ISSUED", CANCELLED: "CANCELED", AMENDED: "MODIFIED",
};
export const MOCK_TO_DB_STATUS: Record<string, string> = {
  ISSUED: "ISSUED", MODIFIED: "AMENDED", CANCELED: "CANCELLED",
};

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function toTaxInvoice(t: TaxInvoiceWithRelations): TaxInvoice {
  const pti = t.projectTermInstitution;
  return {
    id: t.id,
    invoiceNumber: t.invoiceNumber,
    projectNumber: pti.projectTerm.project.projectNumber,
    projectName: pti.projectTerm.project.projectName,
    termYear: pti.projectTerm.termYear,
    termNumber: pti.projectTerm.termNumber,
    leadInstitutionId: pti.institutionId,
    leadInstitutionName: pti.institution.institutionName,
    institutionId: pti.institutionId,
    issuedAt: toDateStr(t.issueDate),
    supplyAmount: Number(t.supplyAmount),
    taxAmount: Number(t.taxAmount),
    totalAmount: Number(t.totalAmount),
    status: DB_TO_MOCK_STATUS[t.status] ?? "ISSUED",
  };
}
