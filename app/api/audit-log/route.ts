import { prisma } from "@/lib/db";
import { requireUser, SessionError } from "@/lib/session";
import { formatKST } from "@/lib/utils";
import type { AuditEntry } from "@/lib/store";

export const runtime = "nodejs";

// audit_log.resource_id는 UNIQUEIDENTIFIER 컬럼이라 진짜 UUID가 아니면 저장이 거부된다 — 이 화면의
// entityId 중에는 "page:/fees"(권한 항목) 같은 UUID가 아닌 값도 있어, 그런 경우엔 resourceId를
// 비워두고 실제 entityId는 newValues 안에 함께 넣어 잃어버리지 않게 한다.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface StoredPayload {
  entityId?: string;
  entityLabel?: string;
  changedFields?: AuditEntry["changedFields"];
}

// 이 테이블은 개별 API 라우트들이 자기 컴플라이언스 로그로도 함께 쓰고 있어(예: 세금계산서 발행),
// newValues가 우리가 기대하는 { entityLabel, changedFields } 모양이 아닐 수 있다 — 그런 행은
// 화면에서 "무슨 값이 어떻게 바뀌었는지"까지는 못 보여줘도, 최소한 누가/언제/무엇을(resourceType)
// 했는지는 그대로 보여준다.
function toAuditEntry(row: {
  id: string;
  resourceType: string;
  resourceId: string | null;
  action: string;
  newValues: string | null;
  createdAt: Date;
  user: { name: string } | null;
}): AuditEntry {
  let parsed: StoredPayload = {};
  if (row.newValues) {
    try {
      const json = JSON.parse(row.newValues) as StoredPayload;
      if (json && typeof json === "object") parsed = json;
    } catch {
      // 우리 형식이 아닌 raw JSON(예: {projectNumber, projectName}) — 그냥 라벨 없이 둔다.
    }
  }
  const action: AuditEntry["action"] = row.action === "CREATE" || row.action === "DELETE" ? row.action : "UPDATE";
  return {
    id: row.id,
    entityType: row.resourceType,
    entityId: parsed.entityId ?? row.resourceId ?? "",
    entityLabel: parsed.entityLabel ?? row.resourceType,
    action,
    changedFields: parsed.changedFields,
    performedBy: row.user?.name ?? "시스템",
    performedAt: formatKST(row.createdAt, true),
  };
}

export async function GET() {
  const rows = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 1000,
    include: { user: { select: { name: true } } },
  });
  return Response.json({ ok: true, entries: rows.map(toAuditEntry) });
}

export async function POST(request: Request) {
  let actor;
  try {
    actor = await requireUser();
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }

  let body: { entityType: string; entityId: string; entityLabel: string; action: AuditEntry["action"]; changedFields?: AuditEntry["changedFields"] };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }
  if (!body.entityType || !body.action) {
    return Response.json({ ok: false, error: "entityType, action은 필수입니다." }, { status: 400 });
  }

  const created = await prisma.auditLog.create({
    data: {
      userId: actor.userId,
      action: body.action,
      resourceType: body.entityType,
      resourceId: body.entityId && UUID_RE.test(body.entityId) ? body.entityId : null,
      newValues: JSON.stringify({ entityId: body.entityId, entityLabel: body.entityLabel, changedFields: body.changedFields }),
    },
  });

  return Response.json({ ok: true, id: created.id });
}
