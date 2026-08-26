import type { NoticeContactRow, SystemUser } from "./mock";

// 정산절차 안내 공문의 "문의사항 연락처" 표(NoticeContactRow)에서 "과제담당(정)"·"과제담당(부)" 두
// 행만 과제별로 실제 담당자로 바꿔치기한다 — 그 외 행(총괄/세금계산서 등)은 전담기관 템플릿에 등록된
// 값을 그대로 쓴다. 라벨 접두어로 행을 식별하는 이유는 NoticeContactRow가 role/contact/email 세
// 자유 텍스트 필드뿐이라(구조화된 "역할" 구분이 없음) 기존 템플릿 데이터와 호환되게 하려면 이 방법뿐이다.
//
// 연락처·이메일은 과제(Project)에 저장하지 않는다 — 과제담당자(정)/(부)는 삼화 내부 직원이라
// [권한관리](SystemUser) 목록에 이미 이름·이메일·연락처가 등록돼 있으므로, 공문 발송 시 그 이름으로
// 찾아 그대로 쓴다. 과제 건별로 반복 입력할 필요가 없고, 권한관리에서 한 번만 갱신하면 그 사람이
// 담당하는 모든 과제의 공문에 그대로 반영된다. 동명이인이 있으면 이름만으로는 어느 쪽인지 구분할 수
// 없다 — 과제상세의 담당자 선택 모달이나 엑셀 업로드 시 동명이인 해소 모달에서 특정 계정을 고르면
// assignedManagerPrimaryUserId/assignedManagerUserId가 함께 저장되고, 있으면 이 id로 먼저 찾는다.
// id가 없으면(과거 데이터 등) 이름으로 찾되, 이때는 동명이인 중 첫 번째 일치 항목을 쓴다.
export const PRIMARY_PREFIX = "과제담당(정)";
export const DEPUTY_PREFIX = "과제담당(부)";

export interface ManagerAssignment {
  assignedManagerPrimary?: string;   // 과제담당자(정)
  assignedManagerPrimaryUserId?: string;
  assignedManager?: string;          // 과제담당자(부)
  assignedManagerUserId?: string;
}

// 과제에 담당자 이름이 지정되지 않았거나, 그 이름/id로 [권한관리]에 등록된 사용자를 찾을 수 없으면
// 그 행은 건드리지 않고 템플릿 기본값을 그대로 둔다.
export function applyManagerContactRows(
  contactRows: NoticeContactRow[],
  project: ManagerAssignment,
  users: SystemUser[],
): NoticeContactRow[] {
  function resolve(row: NoticeContactRow, prefix: string, name: string | undefined, userId: string | undefined): NoticeContactRow | null {
    if (!row.role.startsWith(prefix) || !name) return null;
    const found = (userId ? users.find((u) => u.id === userId) : undefined) ?? users.find((u) => u.name === name);
    return { role: `${prefix} : ${name}`, contact: found?.phone || row.contact, email: found?.email || row.email };
  }
  return contactRows.map((row) =>
    resolve(row, PRIMARY_PREFIX, project.assignedManagerPrimary, project.assignedManagerPrimaryUserId)
    ?? resolve(row, DEPUTY_PREFIX, project.assignedManager, project.assignedManagerUserId)
    ?? row
  );
}
