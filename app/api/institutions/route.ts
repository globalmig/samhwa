import { Prisma } from "@prisma/client";
import { prisma, withDbWriteSlot, describeDbWriteError } from "@/lib/db";
import { requireUser, requireWriteAccess, SessionError } from "@/lib/session";
import { toInstitution } from "@/lib/institution-mapper";
import { writeAuditLog } from "@/lib/audit";
import { cached, invalidateCache, INSTITUTIONS_CACHE_KEY } from "@/lib/server-cache";
import type { Institution } from "@/lib/mock";

export const runtime = "nodejs";

const INSTITUTIONS_CACHE_TTL_MS = 60_000;

export async function GET() {
  try {
    await requireUser();
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }
  // 기관 목록도 전담기관과 마찬가지로 등록·수정이 드문 조회성 데이터라 TTL 캐시로 DB 왕복을
  // 줄인다 — 아래 write 라우트들(단건/일괄 생성, 수정, 삭제)이 변경 시 즉시 무효화한다.
  const institutions = await cached(INSTITUTIONS_CACHE_KEY, INSTITUTIONS_CACHE_TTL_MS, async () => {
    const rows = await prisma.institution.findMany({ include: { contacts: true }, orderBy: { createdAt: "asc" } });
    return rows.map(toInstitution);
  });
  return Response.json({ ok: true, institutions });
}

export async function POST(request: Request) {
  let actor;
  try {
    // "수행기관관리" 화면의 등록 폼뿐 아니라, 참여기관 추가(InstitutionQuickAdd, "projects" 권한)와
    // 수수료청구관리의 RCMS 엑셀 일괄등록("fees" 권한)에서도 그 자리에서 새 기관을 만들 수 있어
    // 셋 중 하나만 있어도 통과한다 — 버튼이 보이는데 API만 막히는 일이 없도록.
    actor = await requireWriteAccess(["institutions", "projects", "fees"]);
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }

  let body: Omit<Institution, "id">;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }
  if (!body.name) return Response.json({ ok: false, error: "기관명은 필수입니다." }, { status: 400 });

  const businessNumber = body.bizNumber || null;
  let created;
  try {
    created = await withDbWriteSlot(() => prisma.$transaction(async (tx) => {
      const row = await tx.institution.create({
        data: {
          institutionName: body.name,
          businessNumber,
          institutionType: body.type,
          representativeName: body.representativeName || null,
          phone: body.contactPhone || null,
          email: body.contactEmail || null,
          isActive: body.status !== "INACTIVE",
          notes: body.note ?? null,
          contacts: body.contactName
            ? { create: [{ name: body.contactName, phone: body.contactPhone || null, email: body.contactEmail || null, isPrimary: true }] }
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
      return row;
    }));
  } catch (err) {
    // 사업자번호 유니크 제약 위반 — 이 브라우저가 들고 있던 기관 목록이 오래돼(재조회 없이 세션
    // 내내 유지) 이미 서버에 있는 기관을 "신규"로 오인한 경우다(엑셀 대량 업로드에서 흔함).
    // 실패로 끝내는 대신 기존 기관을 그대로 돌려준다 — institutions/bulk의 재사용 로직과 동일한 이유.
    if (businessNumber && err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const existing = await prisma.institution.findUnique({ where: { businessNumber }, include: { contacts: true } });
      if (existing) return Response.json({ ok: true, institution: toInstitution(existing) });
    }
    console.error("기관 생성 실패:", err);
    return Response.json({ ok: false, error: describeDbWriteError(err, "기관을 생성하지 못했습니다.") }, { status: 500 });
  }

  invalidateCache(INSTITUTIONS_CACHE_KEY);
  return Response.json({ ok: true, institution: toInstitution(created) });
}
