import type { Receivable, Project, ProjectIssue, IssueRecipientGroup, SystemUser } from "./mock";

type NotifiableUser = { id: string; role: SystemUser["role"]; name: string };

// 미수 상태(PAID 제외)이면서 만기일이 지나면 '연체'로 자동 판정
export function isOverdueByRule(r: { status: Receivable["status"]; dueDate: string }): boolean {
  if (r.status === "PAID") return false;
  if (!r.dueDate) return false;
  const due = new Date(`${r.dueDate}T00:00:00`);
  if (isNaN(due.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return due.getTime() < today.getTime();
}

// ─── 알림 수신 대상 판정 (연체 채권 알림 등) ───────────────────────
// 규칙: ADMIN은 항상 수신 / 회계담당자(ACCOUNTANT)는 항상 수신 /
// 과제 담당자(삼화담당자)로 지정된 사람은 역할과 무관하게(조회전용 포함) 이름이 일치하면 수신 /
// 담당자가 비어있으면 전문기관담당자(SETTLEMENT) 전체에게 폴백.
// 참고: 조회전용 계정도 "해당 과제 담당자"인 경우엔 수신 대상에 포함된다 — VIEWER를 통째로
// 막던 예전 규칙은 "회계담당자·조회전용 담당자·전담기관 담당자에게 발송" 요건과 맞지 않았다.
export function isAlertVisibleToUser(assignedManager: string | undefined, user: NotifiableUser | null | undefined): boolean {
  if (!user) return false;
  if (user.role === "ADMIN") return true;
  if (user.role === "ACCOUNTANT") return true;
  if (assignedManager) return assignedManager === user.name;
  return user.role === "SETTLEMENT";
}

export interface OverdueAlert {
  id: string;
  projectName: string;
  leadInstitutionName: string;
  detail: string;
  assignedManager?: string;
}

// 헤더 알림 등 화면 전반에서 쓰는 "연체된 과제" 알림 목록 (수신 대상 필터링 전 전체 목록)
export function computeOverdueAlerts(receivables: Receivable[], projects: Project[]): OverdueAlert[] {
  return receivables
    .map((r): OverdueAlert | null => {
      const project = projects.find((p) => p.projectNumber === r.projectNumber);
      const overdue = isOverdueByRule({ status: r.status, dueDate: r.dueDate });
      if (!overdue) return null;
      return {
        id: r.id,
        projectName: r.projectName,
        leadInstitutionName: r.leadInstitutionName,
        detail: `${r.termYear}년 ${r.termNumber}연차 · 미수금 ${r.receivableAmount.toLocaleString("ko-KR")}원`,
        assignedManager: project?.assignedManager,
      };
    })
    .filter((x): x is OverdueAlert => x !== null);
}

// 이슈/메모 작성 시 선택한 수신 대상(담당자/회계담당자/전문기관담당자 그룹 + 개인 지정)에 따라
// 특정 사용자에게 알림을 보여줄지 판정. 아무것도 선택 안 했으면 담당자 규칙(위 isAlertVisibleToUser)만 적용.
// 그룹 선택과 개인 지정은 배타적이지 않다 — 개인으로 지정된 사람은 그룹 선택 여부와 무관하게 항상 수신.
export function isIssueVisibleToUser(
  issue: { recipientGroups?: IssueRecipientGroup[]; recipientUserIds?: string[] },
  assignedManager: string | undefined,
  user: NotifiableUser | null | undefined
): boolean {
  if (!user || user.role === "VIEWER") return false;
  if (user.role === "ADMIN") return true;

  if (issue.recipientUserIds?.includes(user.id)) return true;

  const hasSelection = (issue.recipientGroups && issue.recipientGroups.length > 0) || (issue.recipientUserIds && issue.recipientUserIds.length > 0);
  const groups = hasSelection ? (issue.recipientGroups ?? []) : ["MANAGER" as const];

  if (groups.includes("MANAGER") && isAlertVisibleToUser(assignedManager, user)) return true;
  if (groups.includes("ACCOUNTANT") && user.role === "ACCOUNTANT") return true;
  if (groups.includes("SETTLEMENT") && user.role === "SETTLEMENT") return true;
  return false;
}

export interface IssueAlert {
  id: string;
  projectId: string;
  projectName: string;
  content: string;
  priority: ProjectIssue["priority"];
}

// 헤더 알림에 쓰는 "미해결 이슈/메모" 목록 (수신 대상 필터링 전 전체 목록)
export function computeIssueAlerts(issues: ProjectIssue[], projects: Project[]): (IssueAlert & { assignedManager?: string; recipientGroups?: IssueRecipientGroup[] })[] {
  return issues
    .filter((i) => i.status !== "RESOLVED")
    .map((i) => {
      const project = projects.find((p) => p.id === i.projectId);
      return {
        id: i.id,
        projectId: i.projectId,
        projectName: project?.projectName ?? i.projectNumber,
        content: i.content,
        priority: i.priority,
        assignedManager: project?.assignedManager,
        recipientGroups: i.recipientGroups,
      };
    });
}
