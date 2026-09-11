import { prisma, withDbWriteSlot } from "@/lib/db";
import { requireWriteAccess, SessionError } from "@/lib/session";
import { toInstitution } from "@/lib/institution-mapper";
import { writeAuditLog } from "@/lib/audit";
import type { Institution } from "@/lib/mock";

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
    const rows = await withDbWriteSlot(() =>
      prisma.$transaction(async (tx) => {
        const chunkRows = [];
        for (const item of chunk) {
          const row = await tx.institution.create({
            data: {
              institutionName: item.name,
              businessNumber: item.bizNumber || null,
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
  }

  return Response.json({ ok: true, institutions: created });
}
