// 변경이력(AuditLog)의 changedFields를 만드는 순수 함수 — 서버(lib/audit.ts)와 클라이언트
// (lib/store.ts, 낙관적 갱신용)가 동일한 로직을 쓰도록 여기 하나로 공유한다. I/O가 전혀 없어
// 두 쪽 어디서 import해도 안전하다.

export type AuditAction = "CREATE" | "UPDATE" | "DELETE";
export type ChangedFields = Record<string, { before: unknown; after: unknown }>;

// 비밀번호·인증 토큰류는 "값"은 물론 "바뀌었다"는 사실 자체도 감사 기록에 남기지 않는다 —
// 필드명 매칭이라 새 엔티티에 password/token류 컬럼이 추가돼도 명시적으로 등록하지 않아도 자동으로 걸러진다.
const SENSITIVE_FIELD_RE = /password|token|secret|apikey|api[-_]?key/i;

export function isSensitiveAuditField(key: string): boolean {
  return SENSITIVE_FIELD_RE.test(key);
}

// 배열·객체 필드(stages/annualFinancials/gradeOverrides 등)는 String()으로 비교하면 서로 다른
// 값도 전부 "[object Object]"로 뭉개져 실제로는 바뀌었는데 변경 없음으로 놓칠 수 있다 —
// JSON.stringify로 값 자체를 비교한다(이 앱의 엔티티는 함수/순환참조가 없는 순수 데이터라 안전).
export function diffForAudit(
  before: Record<string, unknown>,
  after: Record<string, unknown>
): ChangedFields | undefined {
  const changes: ChangedFields = {};
  for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (k === "id" || isSensitiveAuditField(k)) continue;
    const b = before[k];
    const a = after[k];
    const same = (b !== null && typeof b === "object") || (a !== null && typeof a === "object")
      ? JSON.stringify(b) === JSON.stringify(a)
      : String(b) === String(a);
    if (!same) changes[k] = { before: b, after: a };
  }
  return Object.keys(changes).length > 0 ? changes : undefined;
}

// changedFields를 서버 라우트가 직접 넘기는 경우(diff 대신 특정 필드만 수동 기록)에도 민감정보는
// 동일하게 걸러낸다.
export function redactChangedFields(fields: ChangedFields | undefined): ChangedFields | undefined {
  if (!fields) return fields;
  const out: ChangedFields = {};
  for (const [k, v] of Object.entries(fields)) {
    if (isSensitiveAuditField(k)) continue;
    out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}
