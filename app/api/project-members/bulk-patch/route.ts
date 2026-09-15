import { withDbWriteSlot } from "@/lib/db";
import { requireWriteAccess, SessionError } from "@/lib/session";
import { applyProjectMemberPatch, describeDbError } from "@/lib/project-member-patch";
import type { ProjectMember } from "@/lib/mock";

export const runtime = "nodejs";

// RCMS 엑셀 대량 업로드처럼 짧은 시간에 수백~수천 건의 참여기관을 갱신해야 할 때, 건당 개별
// PATCH 요청을 쏘면(과거 방식) 요청마다 세션 검증(DB 조회 2회)·anchor/siblings 조회·트랜잭션이
// 반복돼 요청 수에 비례해 DB 왕복이 폭증한다 — "천단위" 업로드가 느리고 일부가 실패하던 원인
// 중 하나. lib/store.ts가 이 라우트로 여러 건을 청크(기본 50건)로 묶어 보내, 세션 검증 등 건당
// 고정 비용을 요청 수만큼만(건수가 아니라) 치르게 한다.
const MAX_UPDATES_PER_REQUEST = 200;

interface BulkUpdateItem {
  id: string;
  data: Partial<ProjectMember>;
}

interface BulkPatchResult {
  id: string;
  ok: boolean;
  member?: ProjectMember;
  error?: string;
}

export async function POST(request: Request) {
  let actor;
  try {
    actor = await requireWriteAccess(["projects", "fees", "institutions"]);
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }

  let updates: BulkUpdateItem[];
  try {
    const body = await request.json();
    updates = body?.updates;
  } catch {
    return Response.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }
  if (!Array.isArray(updates) || updates.length === 0) {
    return Response.json({ ok: false, error: "updates 배열이 필요합니다." }, { status: 400 });
  }
  if (updates.length > MAX_UPDATES_PER_REQUEST) {
    return Response.json({ ok: false, error: `한 번에 최대 ${MAX_UPDATES_PER_REQUEST}건까지 처리할 수 있습니다.` }, { status: 400 });
  }

  // 이 요청이 처리하는 N건 전체(조회+쓰기)를 write slot 하나로 묶는다 — 건마다 슬롯을 새로
  // 받으면(=PATCH 단건 라우트와 동시성이 같아지면) 요청을 나눠 보낸 의미가 없다. 한 건이
  // 실패해도(존재하지 않는 id, DB 오류 등) 나머지 건은 계속 처리한다 — 대량 업로드 중 한 건
  // 때문에 전체가 멈추면 안 된다.
  const results: BulkPatchResult[] = await withDbWriteSlot(async () => {
    const out: BulkPatchResult[] = [];
    for (const item of updates) {
      if (!item || typeof item.id !== "string") {
        out.push({ id: String(item?.id ?? ""), ok: false, error: "잘못된 항목입니다." });
        continue;
      }
      try {
        const result = await applyProjectMemberPatch(item.id, item.data ?? {}, actor.userId);
        out.push(result.ok ? { id: item.id, ok: true, member: result.member } : { id: item.id, ok: false, error: result.error });
      } catch (err) {
        console.error(`[project-members bulk-patch] id=${item.id} 처리 중 오류:`, err);
        out.push({ id: item.id, ok: false, error: describeDbError(err) });
      }
    }
    return out;
  });

  return Response.json({ ok: true, results });
}
