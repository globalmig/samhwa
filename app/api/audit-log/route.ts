import { prisma } from "@/lib/db";
import { requireUser, SessionError } from "@/lib/session";
import { formatKST } from "@/lib/utils";
import type { AuditEntry } from "@/lib/store";

export const runtime = "nodejs";

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
  try {
    await requireUser();
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }
  const rows = await prisma.auditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 1000,
    include: { user: { select: { name: true } } },
  });
  return Response.json({ ok: true, entries: rows.map(toAuditEntry) });
}

// 보안 조치(2026-09-10): 이 라우트는 예전엔 POST도 받아서, 브라우저(lib/store.ts의 record())가
// "방금 내가 무엇을 바꿨다"고 스스로 보고하는 값을 그대로 감사 기록으로 저장했다. 로그인만 했으면
// 실제로는 하지 않은 변경을 지어내 기록하거나, 반대로 실제 변경 API(PATCH 등)만 직접 호출해 기록
// 자체를 생략할 수 있었다 — 감사 기록의 신뢰성이 클라이언트에 좌우되는 구조였다.
// 지금은 각 변경 API 라우트가 실제 DB 변경과 같은 prisma.$transaction 안에서 lib/audit.ts의
// writeAuditLog()를 직접 호출해 기록을 남긴다(actor도 body가 아니라 서버가 확인한 세션에서 가져온다).
// 그래서 브라우저가 감사 기록을 "제출"할 경로 자체가 더 이상 필요 없다 — 조회(GET)만 남긴다.
