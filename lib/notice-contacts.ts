import type { NoticeContactRow, ManagerContact } from "./mock";

// 정산절차 안내 공문의 "문의사항 연락처" 표(NoticeContactRow)에서 "과제담당(정)"·"과제담당(부)" 두
// 행만 과제별로 실제 담당자로 바꿔치기한다 — 그 외 행(총괄/세금계산서 등)은 전담기관 템플릿에 등록된
// 값을 그대로 쓴다. 라벨 접두어로 행을 식별하는 이유는 NoticeContactRow가 role/contact/email 세
// 자유 텍스트 필드뿐이라(구조화된 "역할" 구분이 없음) 기존 템플릿 데이터와 호환되게 하려면 이 방법뿐이다.
const PRIMARY_PREFIX = "과제담당(정)";
const DEPUTY_PREFIX = "과제담당(부)";

export interface ManagerAssignment {
  assignedManagerPrimary?: string; // 과제담당자(정)
  assignedManager?: string;        // 과제담당자(부)
}

// name이 비어있거나(과제에 담당자가 지정되지 않음) 연락처 목록에 등록된 사람이 없으면, 그 행은
// 건드리지 않고 템플릿의 기본값을 그대로 둔다 — 등록 전까지는 기존처럼 동작해야 하기 때문이다.
export function applyManagerContactRows(
  contactRows: NoticeContactRow[],
  project: ManagerAssignment,
  managerContacts: ManagerContact[]
): NoticeContactRow[] {
  function resolve(row: NoticeContactRow, prefix: string, name: string | undefined): NoticeContactRow | null {
    if (!row.role.startsWith(prefix) || !name) return null;
    const found = managerContacts.find((c) => c.name === name);
    return { role: `${prefix} : ${name}`, contact: found?.phone ?? row.contact, email: found?.email ?? row.email };
  }
  return contactRows.map((row) =>
    resolve(row, PRIMARY_PREFIX, project.assignedManagerPrimary)
    ?? resolve(row, DEPUTY_PREFIX, project.assignedManager)
    ?? row
  );
}
