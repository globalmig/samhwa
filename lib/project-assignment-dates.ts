import type { Project } from "./mock";
import { backfillExistingTermOverrides } from "./fee-calculator";

// 빈 문자열과 빈 배열도 PATCH에 실어야 날짜 삭제와 마지막 연차 이력 삭제가 저장된다.
export function buildAssignmentDateUpdate(
  project: Project,
  field: "agencyAssignedAt" | "internalAssignedAt",
  termNumber: number,
  value: string,
  existingTermNumbers: Iterable<number>,
): Partial<Project> {
  const historyField = field === "agencyAssignedAt" ? "agencyAssignedAtHistory" : "internalAssignedAtHistory";
  const history = project[historyField] as { termNumber: number; [key: string]: string | number }[] | undefined;
  const baseValue = project[field] ?? "";
  const displayedValue = history?.find((h) => h.termNumber === termNumber)?.[field] ?? baseValue;
  if (value === displayedValue) return {};

  if (termNumber === project.currentTerm) {
    const nextHistory = backfillExistingTermOverrides(
      history,
      existingTermNumbers,
      termNumber,
      (otherTerm) => ({ termNumber: otherTerm, [field]: baseValue }),
    );
    return { [field]: value, [historyField]: nextHistory ?? [] };
  }

  const others = (history ?? []).filter((h) => h.termNumber !== termNumber);
  const nextHistory = value === baseValue
    ? others
    : [...others, { termNumber, [field]: value }].sort((a, b) => a.termNumber - b.termNumber);
  return { [historyField]: nextHistory };
}
