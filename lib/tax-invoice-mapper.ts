import type { TaxInvoice as PrismaTaxInvoice, ProjectTermInstitution, ProjectTerm, Project as PrismaProject, Institution as PrismaInstitution } from "@prisma/client";
import type { TaxInvoice } from "./mock";

// project/institution은 실제로 쓰는 필드(아래 toTaxInvoice 참고)만 좁혀서 select한다 — project의
// extraData(NVarChar(Max), 연차별 이력이 쌓인 JSON)까지 매 행마다 통째로 끌고 오면 세금계산서가
// 쌓일수록 이 API가 느려진다.
export type TaxInvoiceWithRelations = PrismaTaxInvoice & {
  projectTermInstitution: ProjectTermInstitution & {
    projectTerm: ProjectTerm & { project: Pick<PrismaProject, "projectNumber" | "projectName"> };
    institution: Pick<PrismaInstitution, "institutionName">;
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
