import type { Receivable as PrismaReceivable, ProjectTermInstitution, ProjectTerm, Project as PrismaProject, Institution as PrismaInstitution, PaymentHistory } from "@prisma/client";
import type { Receivable } from "./mock";

export type ReceivableWithRelations = PrismaReceivable & {
  projectTermInstitution: ProjectTermInstitution & {
    projectTerm: ProjectTerm & { project: PrismaProject };
    institution: PrismaInstitution;
  };
  paymentHistories: PaymentHistory[];
};

const DB_TO_MOCK_STATUS: Record<string, Receivable["status"]> = {
  OUTSTANDING: "PENDING", PARTIAL: "PARTIAL", SETTLED: "PAID",
};
export const MOCK_TO_DB_STATUS: Record<string, string> = {
  PENDING: "OUTSTANDING", OVERDUE: "OUTSTANDING", PARTIAL: "PARTIAL", PAID: "SETTLED",
};

function toDateStr(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : "";
}

// invoiceNumber는 receivables 테이블에 컬럼이 없다 — 같은 project_term_institution을 참조하는
// tax_invoices 행에서 가져온다(호출측이 ptiId -> invoiceNumber 맵을 만들어 전달).
export function toReceivable(r: ReceivableWithRelations, invoiceNumberByPti: Map<string, string>): Receivable {
  const pti = r.projectTermInstitution;
  const latestPayment = r.paymentHistories.reduce<Date | null>((latest, p) => (!latest || p.paymentDate > latest ? p.paymentDate : latest), null);
  return {
    id: r.id,
    invoiceNumber: invoiceNumberByPti.get(pti.id) ?? "",
    projectNumber: pti.projectTerm.project.projectNumber,
    projectName: pti.projectTerm.project.projectName,
    termYear: pti.projectTerm.termYear,
    termNumber: pti.projectTerm.termNumber,
    leadInstitutionId: pti.institutionId,
    leadInstitutionName: pti.institution.institutionName,
    institutionId: pti.institutionId,
    billedAt: toDateStr(r.createdAt),
    billedAmount: Number(r.billedAmount),
    paidAmount: Number(r.collectedAmount),
    paidAt: latestPayment ? toDateStr(latestPayment) : null,
    receivableAmount: Number(r.outstandingAmount),
    dueDate: toDateStr(r.dueDate),
    status: r.isLongOverdue ? "OVERDUE" : DB_TO_MOCK_STATUS[r.status] ?? "PENDING",
  };
}
