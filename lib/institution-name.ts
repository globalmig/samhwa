// 기관명 정정(같은 기관 ID의 이름만 바꾸기)에 쓰는 규칙 — 서버 라우트(app/api/institutions/[id])와
// 클라이언트(store.updateInstitution, 수수료청구관리 목록의 직접 입력)가 같은 기준을 쓰도록 의존성 없이 둔다.

// institutions.institution_name 컬럼이 NVarChar(200)이다 — SQL Server의 nvarchar 길이와 JS 문자열
// length는 둘 다 UTF-16 코드 유닛 기준이라 그대로 비교하면 된다.
export const INSTITUTION_NAME_MAX_LENGTH = 200;

export type InstitutionNameCheck = { ok: true; name: string } | { ok: false; error: string };

// 앞뒤 공백을 제거하고, 비어 있거나(공백뿐인 이름 포함) DB 제한을 넘는 이름을 막는다.
export function validateInstitutionName(raw: unknown): InstitutionNameCheck {
  const name = typeof raw === "string" ? raw.trim() : "";
  if (!name) return { ok: false, error: "기관명을 입력해주세요." };
  if (name.length > INSTITUTION_NAME_MAX_LENGTH) {
    return { ok: false, error: `기관명은 ${INSTITUTION_NAME_MAX_LENGTH}자 이내로 입력해주세요.` };
  }
  return { ok: true, name };
}

// 전담기관 "소속기관 자동판별"(resolveAutoDetectedAgencyId)은 주관기관명이 소속기관 목록에 정확히
// 일치하는지로 판정한다 — 기관명만 정정하고 목록을 그대로 두면, 이후 과제 정보를 저장할 때 같은 기관인데도
// 소속에서 빠진 것으로 보고 전담기관(RDA2→RDA1 등)과 적용 정책이 바뀐다. 그래서 목록의 옛 이름을 새
// 이름으로 함께 바꿔 기존 판정을 유지한다. 판정이 정확히 일치 기준이므로 여기서도 정확히 일치하는
// 항목만 바꾼다(공백만 다른 항목은 원래도 판정에 걸리지 않았으므로 새로 걸리게 만들지 않는다).
//
// 옛 이름을 다른 기관이 아직 쓰고 있으면(keepOldName) 그 기관의 판정이 바뀌지 않도록 옛 이름은 남기고
// 새 이름만 옆에 추가한다. 바꿀 것이 없으면 null을 돌려준다.
export function renameInAffiliatedNames(
  names: readonly string[],
  oldName: string,
  newName: string,
  keepOldName: boolean,
): string[] | null {
  if (oldName === newName || !names.includes(oldName)) return null;
  const replaced = names.flatMap((n) => (n === oldName ? (keepOldName ? [n, newName] : [newName]) : [n]));
  const next = replaced.filter((n, i) => replaced.indexOf(n) === i);
  const unchanged = next.length === names.length && next.every((n, i) => n === names[i]);
  return unchanged ? null : next;
}

// 새 이름이 원래는 속하지 않던 전담기관의 소속기관 목록에 이미 들어 있는 경우 — 목록을 고쳐서 막을 수는
// 없으므로(그 이름을 쓰는 다른 기관이 있을 수 있음) 저장 전에 담당자에게 알리는 데 쓴다.
export function findAgenciesNewlyMatchingName<A extends { autoDetectByLeadInstitution?: boolean; affiliatedInstitutionNames?: string[] }>(
  agencies: readonly A[],
  oldName: string,
  newName: string,
): A[] {
  if (oldName === newName) return [];
  return agencies.filter((a) => {
    if (!a.autoDetectByLeadInstitution) return false;
    const names = a.affiliatedInstitutionNames ?? [];
    return names.includes(newName) && !names.includes(oldName);
  });
}
