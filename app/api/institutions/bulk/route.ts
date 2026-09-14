import { prisma, withDbWriteSlot } from "@/lib/db";
import { requireWriteAccess, SessionError } from "@/lib/session";
import { toInstitution } from "@/lib/institution-mapper";
import { writeAuditLog } from "@/lib/audit";
import type { Institution } from "@/lib/mock";
import { formatBizNumber } from "@/lib/utils";

export const runtime = "nodejs";

// 한 트랜잭션에 너무 많은 INSERT를 몰아넣으면 락 보유 시간이 길어지고 다른 요청이 더 오래
// 기다리게 되므로, 청크 단위로 나눠 트랜잭션(과 withDbWriteSlot 슬롯)을 여러 번 짧게 쓴다.
const CHUNK_SIZE = 200;

// RCMS 엑셀 업로드처럼 신규 기관을 수백~수천 건 한 번에 만들어야 하는 경우를 위한 벌크 생성 API.
// 기관 하나당 별도 POST 요청을 보내던 것(요청 수만큼 HTTP 왕복 + 트랜잭션 오버헤드)을 이 엔드포인트
// 하나로 묶어, 같은 생성 로직(app/api/institutions/route.ts의 POST와 동일)을 트랜잭션 안에서 반복한다.
export async function POST(request: Request) {
  let actor;
  try {
    actor = await requireWriteAccess(["institutions", "projects", "fees"]);
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }

  let body: { items?: Omit<Institution, "id">[] };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }
  const items = body.items ?? [];
  if (items.length === 0) return Response.json({ ok: true, institutions: [] });
  if (items.some((item) => !item.name)) {
    return Response.json({ ok: false, error: "기관명은 필수입니다." }, { status: 400 });
  }

  const created: Institution[] = [];
  for (let i = 0; i < items.length; i += CHUNK_SIZE) {
    const chunk = items.slice(i, i + CHUNK_SIZE);
    try {
      // 동시에 같은 기관을 등록한 요청과 경합하면 실패한 트랜잭션 전체를 다시 시작해
      // 먼저 커밋된 기관을 재사용한다. 다른 오류는 재시도하지 않는다.
      for (let attempt = 0; ; attempt++) {
        try {
          const rows = await withDbWriteSlot(() =>
            prisma.$transaction(async (tx) => {
              const chunkRows = [];
              for (const item of chunk) {
                const businessNumber = formatBizNumber(item.bizNumber ?? "").trim();
                if (businessNumber) {
                  const existing = await tx.institution.findFirst({
                    where: { businessNumber: { in: [businessNumber, businessNumber.replace(/\D/g, ""), (item.bizNumber ?? "").trim()] } },
                    include: { contacts: true },
                  });
                  if (existing) {
                    // 응답 유실 후 재시도해도 기존 정보와 감사로그를 중복 생성하지 않는다.
                    chunkRows.push(existing);
                    continue;
                  }
                }
                const row = await tx.institution.create({
                  data: {
                    institutionName: item.name,
                    businessNumber: businessNumber || null,
                    institutionType: item.type,
                    representativeName: item.representativeName || null,
                    phone: item.contactPhone || null,
                    email: item.contactEmail || null,
                    isActive: item.status !== "INACTIVE",
                    notes: item.note ?? null,
                    contacts: item.contactName
                      ? { create: [{ name: item.contactName, phone: item.contactPhone || null, email: item.contactEmail || null, isPrimary: true }] }
                      : undefined,
                  },
                  include: { contacts: true },
                });
                await writeAuditLog(tx, {
                  actorUserId: actor.userId,
                  entityType: "institution",
                  entityId: row.id,
                  entityLabel: row.institutionName,
                  action: "CREATE",
                });
                chunkRows.push(row);
              }
              return chunkRows;
            })
          );
          created.push(...rows.map(toInstitution));
          break;
        } catch (err) {
          if (attempt < 2 && typeof err === "object" && err !== null && "code" in err && err.code === "P2002") continue;
          throw err;
        }
      }
    } catch (err) {
      // 이 청크(최대 CHUNK_SIZE건)는 트랜잭션이라 통째로 롤백됐지만, 그 앞의 청크들은 이미 커밋돼
      // DB에 남아있다. 여기서 그냥 던지면 클라이언트는 전체를 실패로 보고 이미 만든 것까지 로컬에서
      // 롤백해버리는데, 그 상태로 재시도하면 이미 DB에 있는 기관을 businessNumber unique 제약 때문에
      // 다시 못 만들어 계속 실패한다. 지금까지 성공한 것만이라도 institutions에 담아 돌려줘서,
      // 클라이언트가 그만큼은 로컬 상태에 반영하고 실패분만 다시 시도할 수 있게 한다.
      console.error("기관 일괄 생성 중 청크 실패:", err);
      return Response.json(
        { ok: false, error: "일부 기관 생성에 실패했습니다.", institutions: created },
        { status: 500 }
      );
    }
  }

  return Response.json({ ok: true, institutions: created });
}
