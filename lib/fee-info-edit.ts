import type { Project, ProjectMember, TermFee } from "./mock";
import { buildAssignmentDateUpdate } from "./project-assignment-dates";
import { backfillExistingTermOverrides, resolveMemberLeadForTerm, resolveMemberRecipientForTerm, resolveResearchLeadForTerm } from "./fee-calculator";

export const FEE_INFO_FIELDS = [
  "docRequestDate", "docReplyDate", "auditFirm", "recipientName", "recipientEmail",
  "researchLeadEmail", "assignedManager", "assignedManagerPrimary",
  "assignedManagerUserId", "assignedManagerPrimaryUserId", "registeredAt", "agencyAssignedAt",
] as const;
export type FeeInfoChanges = Partial<Record<typeof FEE_INFO_FIELDS[number], string>>;
export interface FeeInfoEditRequest {
  termNumber: number;
  memberId: string;
  feeId: string;
  changes: FeeInfoChanges;
}
export interface FeeInfoPatches {
  project: Partial<Project>;
  member: Partial<ProjectMember>;
  fee: Partial<TermFee>;
  annualAuditFirm?: { institutionId: string; termNumber: number; auditFirm: string };
}

// 수정 창에서 변경한 항목만 최신 서버 데이터 위에 반영한다. 연차·사업비·수수료 금액은 편집하지 않는다.
export function buildFeeInfoPatches(
  project: Project, member: ProjectMember | undefined, termNumber: number,
  existingTerms: number[], splitByInstitution: boolean, changes: FeeInfoChanges,
): FeeInfoPatches {
  const result: FeeInfoPatches = { project: {}, member: {}, fee: {} };
  const current = termNumber === project.currentTerm;
  if (changes.registeredAt !== undefined) result.project.registeredAt = changes.registeredAt;
  if (changes.agencyAssignedAt !== undefined) Object.assign(result.project,
    buildAssignmentDateUpdate(project, "agencyAssignedAt", termNumber, changes.agencyAssignedAt, existingTerms));

  for (const [field, historyField, userIdField] of [
    ["assignedManager", "assignedManagerHistory", "assignedManagerUserId"],
    ["assignedManagerPrimary", "assignedManagerPrimaryHistory", "assignedManagerPrimaryUserId"],
  ] as const) {
    const value = changes[field];
    if (value === undefined) continue;
    const base = project[field] ?? "";
    const history = project[historyField] as { termNumber: number; [key: string]: string | number }[] | undefined;
    const others = current
      ? backfillExistingTermOverrides(history, existingTerms, termNumber, (t) => ({ termNumber: t, [field]: base, [userIdField]: project[userIdField] ?? "" })) ?? []
      : (history ?? []).filter((h) => h.termNumber !== termNumber);
    // 현재 계정이 바뀌어도 동명이인인 과거 담당자가 새 계정으로 해석되지 않게 계정 ID도 고정한다.
    const preserved = others.map((h) => ({ ...h,
      [userIdField]: h[userIdField] ?? (h[field] === base ? project[userIdField] ?? "" : ""),
    }));
    const existing = history?.find((h) => h.termNumber === termNumber);
    const existingId = existing?.[field] === value ? existing?.[userIdField] : undefined;
    const userId = changes[userIdField] ?? existingId ?? (value === base ? project[userIdField] ?? "" : "");
    Object.assign(result.project, {
      [historyField]: [...preserved, { termNumber, [field]: value, [userIdField]: userId }].sort((a, b) => a.termNumber - b.termNumber),
      ...(current ? { [field]: value, [userIdField]: userId } : {}),
    });
  }

  if (changes.researchLeadEmail !== undefined) {
    const email = changes.researchLeadEmail;
    if (splitByInstitution && member) {
      const lead = resolveMemberLeadForTerm(member, project, termNumber, true);
      const others = current
        ? backfillExistingTermOverrides(member.leadOverrides, existingTerms, termNumber,
          (t) => ({ termNumber: t, ...resolveMemberLeadForTerm(member, project, t, true) })) ?? []
        : (member.leadOverrides ?? []).filter((h) => h.termNumber !== termNumber);
      result.member.leadOverrides = [...others, { termNumber, name: lead.name, email }].sort((a, b) => a.termNumber - b.termNumber);
      if (current) result.member.leadEmail = email;
    } else if (!splitByInstitution) {
      const lead = resolveResearchLeadForTerm(project, termNumber);
      const others = current
        ? backfillExistingTermOverrides(project.researchLeadOverrides, existingTerms, termNumber,
          (t) => ({ termNumber: t, ...resolveResearchLeadForTerm(project, t) })) ?? []
        : (project.researchLeadOverrides ?? []).filter((h) => h.termNumber !== termNumber);
      result.project.researchLeadOverrides = [...others, { termNumber, name: lead.name, email }].sort((a, b) => a.termNumber - b.termNumber);
      if (current) result.project.researchLeadEmail = email;
    }
  }

  if (member && (changes.recipientName !== undefined || changes.recipientEmail !== undefined)) {
    const recipient = resolveMemberRecipientForTerm(member, termNumber);
    result.member.recipientOverrides = [
      ...(member.recipientOverrides ?? []).filter((h) => h.termNumber !== termNumber),
      { termNumber, ...recipient,
        recipientName: changes.recipientName ?? recipient.recipientName,
        recipientEmail: changes.recipientEmail ?? recipient.recipientEmail },
    ].sort((a, b) => a.termNumber - b.termNumber);
  }
  for (const key of ["docRequestDate", "docReplyDate", "auditFirm"] as const) {
    if (changes[key] !== undefined) result.fee[key] = changes[key];
  }
  return result;
}
