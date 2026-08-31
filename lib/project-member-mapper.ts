import type { ProjectTermInstitution, ProjectTerm, Project as PrismaProject, Institution as PrismaInstitution } from "@prisma/client";
import type { ProjectMember, AnnualBudget } from "./mock";

export type PtiWithTerm = ProjectTermInstitution & {
  projectTerm: ProjectTerm & { project: PrismaProject };
  institution: PrismaInstitution;
};

type SharedExtra = {
  feeRate?: number;
  calculatedFee?: number;
  institutionGrade?: ProjectMember["institutionGrade"];
  gradeOverrides?: ProjectMember["gradeOverrides"];
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  recipientOverrides?: ProjectMember["recipientOverrides"];
  settlementType?: ProjectMember["settlementType"];
  settlementTypeOverrides?: ProjectMember["settlementTypeOverrides"];
  exemptRefGrade?: ProjectMember["exemptRefGrade"];
  role?: "LEAD" | "PARTICIPANT" | "ENTRUSTED";
  cashBudget?: number;
  inKindBudget?: number;
  termStartDate?: string;
  termEndDate?: string;
  auditFirm?: string;
};

// 하나의 (project, institution) 조합에 속한 연차별 project_term_institutions 행들을 mock의
// ProjectMember 하나로 재구성한다 — DB는 연차마다 행이 나뉘어 있지만(정규화) mock은 연차별
// annualBudgets[]를 품은 멤버 하나로 표현하기 때문에, id 하나로 묶이지 않고 그룹핑이 필요하다.
export function groupPtisToMembers(rows: PtiWithTerm[]): ProjectMember[] {
  const groups = new Map<string, PtiWithTerm[]>();
  for (const row of rows) {
    const key = `${row.projectTerm.projectId}|${row.institutionId}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }

  const members: ProjectMember[] = [];
  for (const group of groups.values()) {
    group.sort((a, b) => a.projectTerm.termNumber - b.projectTerm.termNumber);
    const first = group[0];
    const extra: SharedExtra = first.extraData ? JSON.parse(first.extraData) : {};

    const annualBudgets: AnnualBudget[] = group.map((row) => {
      const rowExtra: SharedExtra = row.extraData ? JSON.parse(row.extraData) : {};
      return {
        termYear: row.projectTerm.termYear,
        termNumber: row.projectTerm.termNumber,
        cashBudget: rowExtra.cashBudget ?? Number(row.projectBudget),
        inKindBudget: rowExtra.inKindBudget ?? 0,
        termStartDate: rowExtra.termStartDate,
        termEndDate: rowExtra.termEndDate,
        auditFirm: rowExtra.auditFirm,
      };
    });

    members.push({
      id: first.id,
      projectId: first.projectTerm.projectId,
      projectNumber: first.projectTerm.project.projectNumber,
      institutionId: first.institutionId,
      institutionName: first.institution.institutionName,
      institutionType: (first.institution.institutionType as ProjectMember["institutionType"]) ?? "중소기업",
      role: extra.role ?? (first.role === "MAIN" ? "LEAD" : "PARTICIPANT"),
      budget: Number(first.projectBudget),
      feeRate: extra.feeRate ?? 0,
      calculatedFee: extra.calculatedFee ?? 0,
      institutionGrade: extra.institutionGrade,
      gradeOverrides: extra.gradeOverrides,
      contactName: extra.contactName,
      contactEmail: extra.contactEmail,
      contactPhone: extra.contactPhone,
      recipientOverrides: extra.recipientOverrides,
      cashBudget: extra.cashBudget,
      inKindBudget: extra.inKindBudget,
      settlementType: extra.settlementType,
      settlementTypeOverrides: extra.settlementTypeOverrides,
      exemptRefGrade: extra.exemptRefGrade,
      annualBudgets,
    });
  }
  return members;
}
