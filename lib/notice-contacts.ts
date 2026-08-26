import type { NoticeContactRow } from "./mock";

// 정산절차 안내 공문의 "문의사항 연락처" 표(NoticeContactRow)에서 "과제담당(정)"·"과제담당(부)" 두
// 행만 과제별로 실제 담당자로 바꿔치기한다 — 그 외 행(총괄/세금계산서 등)은 전담기관 템플릿에 등록된
// 값을 그대로 쓴다. 라벨 접두어로 행을 식별하는 이유는 NoticeContactRow가 role/contact/email 세
// 자유 텍스트 필드뿐이라(구조화된 "역할" 구분이 없음) 기존 템플릿 데이터와 호환되게 하려면 이 방법뿐이다.
//
// 연락처·이메일은 별도 명부에서 이름으로 찾지 않고, 책임자이메일/실무자이메일과 동일하게 과제
// 자체(엑셀 업로드 또는 과제 정보 수정에서 직접 입력)에 저장된 값을 그대로 쓴다.
export const PRIMARY_PREFIX = "과제담당(정)";
export const DEPUTY_PREFIX = "과제담당(부)";

export interface ManagerAssignment {
  assignedManagerPrimary?: string;      // 과제담당자(정)
  assignedManagerPrimaryPhone?: string;
  assignedManagerPrimaryEmail?: string;
  assignedManager?: string;             // 과제담당자(부)
  assignedManagerPhone?: string;
  assignedManagerEmail?: string;
}

// 과제에 담당자 이름이 지정되지 않았으면 그 행은 건드리지 않고 템플릿 기본값을 그대로 둔다.
// 이름은 있는데 연락처·이메일이 비어있으면 이름만 바꾸고 연락처·이메일은 템플릿 기본값을 유지한다.
export function applyManagerContactRows(
  contactRows: NoticeContactRow[],
  project: ManagerAssignment,
): NoticeContactRow[] {
  function resolve(row: NoticeContactRow, prefix: string, name: string | undefined, phone: string | undefined, email: string | undefined): NoticeContactRow | null {
    if (!row.role.startsWith(prefix) || !name) return null;
    return { role: `${prefix} : ${name}`, contact: phone || row.contact, email: email || row.email };
  }
  return contactRows.map((row) =>
    resolve(row, PRIMARY_PREFIX, project.assignedManagerPrimary, project.assignedManagerPrimaryPhone, project.assignedManagerPrimaryEmail)
    ?? resolve(row, DEPUTY_PREFIX, project.assignedManager, project.assignedManagerPhone, project.assignedManagerEmail)
    ?? row
  );
}
