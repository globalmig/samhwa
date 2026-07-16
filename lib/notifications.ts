import type { Receivable, Project, ProjectIssue, IssueRecipientGroup, SystemUser } from "./mock";

type NotifiableUser = { role: SystemUser["role"]; name: string };

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

// ─── 알림 수신 대상 판정 ─────────────────────────────────────────
// 공통 규칙: VIEWER는 절대 수신 안 함 / ADMIN은 항상 수신함 /
// 과제 담당자가 지정돼 있으면 그 담당자(이름 일치)에게만 /
// 담당자가 비어있으면 전문기관담당자(SETTLEMENT) 전체에게 폴백
export function isAlertVisibleToUser(assignedManager: string | undefined, user: NotifiableUser | null | undefined): boolean {
  if (!user || user.role === "VIEWER") return false;
  if (user.role === "ADMIN") return true;
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

// 이슈/메모 작성 시 선택한 수신 대상(담당자/회계담당자/전문기관담당자)에 따라
// 특정 사용자에게 알림을 보여줄지 판정. 아무것도 선택 안 했으면 담당자 규칙(위 isAlertVisibleToUser)만 적용.
export function isIssueVisibleToUser(
  issue: { recipientGroups?: IssueRecipientGroup[] },
  assignedManager: string | undefined,
  user: NotifiableUser | null | undefined
): boolean {
  if (!user || user.role === "VIEWER") return false;
  if (user.role === "ADMIN") return true;

  const groups = issue.recipientGroups && issue.recipientGroups.length > 0 ? issue.recipientGroups : ["MANAGER" as const];

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
