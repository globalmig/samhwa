import type { Prisma } from "@prisma/client";
import { diffForAudit, redactChangedFields, type AuditAction, type ChangedFields } from "./audit-diff";

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// audit_log에 쓸 수 있는 최소 클라이언트 인터페이스 — prisma.$transaction(async (tx) => ...)의
// tx나, 트랜잭션이 필요 없는 단순 조회성 기록이면 prisma 자체를 그대로 넘겨도 된다.
type AuditWriter = { auditLog: { create: (args: { data: Prisma.AuditLogUncheckedCreateInput }) => Promise<unknown> } };

// AuditLog.newValues는 NVARCHAR(Max) 문자열 컬럼이라 BigInt(수수료 금액 등)를 그대로 JSON.stringify하면
// "Do not know how to serialize a BigInt"로 터진다 — 문자열로 바꿔서 저장한다(화면 표시엔 지장 없음).
function safeStringify(value: unknown): string {
  return JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? v.toString() : v));
}

interface WriteAuditLogParams {
  /** 실제로 변경을 수행한 로그인 사용자 — 클라이언트가 보낸 값이 아니라 요청을 처리한 라우트가
   *  requireUser()/requireAdmin()/requireWriteAccess()로 얻은 세션 값이어야 한다. */
  actorUserId: string;
  /** lib/store.ts의 ENTITY_NAMES 키와 동일한 값을 써야 감사이력 화면에 라벨이 올바르게 표시된다
   *  (예: "project", "user", "feePolicy"). */
  entityType: string;
  entityId: string;
  entityLabel: string;
  action: AuditAction;
  /** before/after를 넘기면 서버가 직접 diff를 계산한다(권장) — 두 값은 같은 모양의 도메인 객체여야
   *  하며(예: toProject(before) vs toProject(after)), id·비밀번호·토큰류 필드는 자동으로 제외된다. */
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  /** diff 대신 특정 필드만 수동으로 기록하고 싶을 때(예: 특정 컬럼만 일괄 변경) — 이 값도 민감정보
   *  필터를 거친다. before/after와 changedFields를 동시에 넘기면 changedFields가 우선한다. */
  changedFields?: ChangedFields;
}

/** 실제 데이터 변경을 처리하는 서버 코드(각 API 라우트)에서 호출한다 — 브라우저가 별도로
 *  /api/audit-log를 호출하는 이전 방식은 클라이언트가 감사 기록을 생략하거나 임의로 조작해
 *  제출할 수 있어 제거했다. 반드시 실제 DB 변경과 같은 prisma.$transaction 안에서 호출해
 *  "데이터는 바뀌었는데 기록은 없는" 상태(또는 그 반대)가 남지 않도록 한다. */
export async function writeAuditLog(tx: AuditWriter, params: WriteAuditLogParams): Promise<void> {
  const { actorUserId, entityType, entityId, entityLabel, action } = params;
  const changedFields = params.changedFields !== undefined
    ? redactChangedFields(params.changedFields)
    : params.before !== undefined && params.after !== undefined
      ? diffForAudit(params.before, params.after)
      : undefined;

  await tx.auditLog.create({
    data: {
      userId: actorUserId,
      action,
      resourceType: entityType,
      resourceId: entityId && UUID_RE.test(entityId) ? entityId : null,
      newValues: safeStringify({ entityId, entityLabel, changedFields }),
    },
  });
}
