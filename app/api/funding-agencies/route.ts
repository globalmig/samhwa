import { Prisma } from "@prisma/client";
import { prisma, withDbWriteSlot, describeDbWriteError } from "@/lib/db";
import { requireUser, requireWriteAccess, SessionError } from "@/lib/session";
import { toFundingAgency } from "@/lib/funding-agency-mapper";
import { writeAuditLog } from "@/lib/audit";
import { cached, invalidateCache, FUNDING_AGENCIES_CACHE_KEY } from "@/lib/server-cache";
import type { FundingAgency, AgencyGuideTab } from "@/lib/mock";

export const runtime = "nodejs";

const FUNDING_AGENCIES_CACHE_TTL_MS = 60_000;

export async function GET() {
  try {
    await requireUser();
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }
  // 전담기관 목록은 등록·수정이 드문 조회성 데이터라 매 요청마다 DB를 왕복할 필요가 없다 —
  // 아래 write 라우트들이 변경 시 invalidateCache로 즉시 무효화하므로, 최대 TTL만큼만
  // 지연될 수 있고 그 안에서도 실제 변경은 화면에 곧바로 반영된다(store의 낙관적 갱신).
  const { agencies, agencyGuides } = await cached(FUNDING_AGENCIES_CACHE_KEY, FUNDING_AGENCIES_CACHE_TTL_MS, async () => {
    const rows = await prisma.fundingAgency.findMany({ orderBy: { createdAt: "asc" } });
    // guideContent(운용 안내)는 fundingAgency 레코드 자체엔 있지만 toFundingAgency엔 포함하지 않는다 —
    // 클라이언트 store는 이걸 agencyGuides(약칭을 키로 하는 별도 딕셔너리)로 따로 들고 있으므로
    // 여기서 그 모양대로 만들어 함께 내려준다. 예전엔 저장(PATCH)만 되고 이 값을 다시 읽어오는
    // 경로가 없어서, 저장 직후엔 화면에 보이다가도 새로고침하면 항상 사라지는 버그가 있었다.
    const guides: Record<string, AgencyGuideTab[]> = {};
    for (const a of rows) {
      if (!a.guideContent) continue;
      try {
        guides[a.shortName] = JSON.parse(a.guideContent);
      } catch {
        // 저장된 값이 손상됐으면 그 기관만 건너뛰고(기본 안내로 폴백) 나머지는 정상 반환한다.
      }
    }
    return { agencies: rows.map(toFundingAgency), agencyGuides: guides };
  });
  return Response.json({ ok: true, agencies, agencyGuides });
}

export async function POST(request: Request) {
  let actor;
  try {
    // "전담기관 관리" 화면뿐 아니라, 수수료청구관리의 RCMS 엑셀 일괄등록("fees" 권한)도 인식 못한
    // 전담기관을 그 자리에서 새로 만들 수 있다.
    actor = await requireWriteAccess(["funding-agencies", "fees"]);
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }

  let body: Omit<FundingAgency, "id">;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }
  if (!body.name || !body.shortName || !body.code) {
    return Response.json({ ok: false, error: "정식명칭, 약칭, 기관코드는 필수입니다." }, { status: 400 });
  }

  let created;
  try {
    created = await withDbWriteSlot(() => prisma.$transaction(async (tx) => {
      const row = await tx.fundingAgency.create({
        data: {
          name: body.name,
          shortName: body.shortName,
          code: body.code,
          contactName: body.contactName ?? "",
          contactEmail: body.contactEmail ?? "",
          contactPhone: body.contactPhone ?? "",
          noticeSenderEmail: body.noticeSenderEmail ?? null,
          noticeSenderMailPassword: body.noticeSenderMailPassword ?? null,
          status: body.status ?? "ACTIVE",
          registeredAt: body.registeredAt ? new Date(body.registeredAt) : new Date(),
          website: body.website ?? null,
          noticeRecipientScope: body.noticeRecipientScope ?? "LEAD_ONLY",
          autoDetectByLeadInstitution: !!body.autoDetectByLeadInstitution,
          affiliatedInstitutionNames: body.affiliatedInstitutionNames ? JSON.stringify(body.affiliatedInstitutionNames) : null,
          specialNotes: body.specialNotes ? JSON.stringify(body.specialNotes) : null,
        },
      });
      await writeAuditLog(tx, {
        actorUserId: actor.userId,
        entityType: "fundingAgency",
        entityId: row.id,
        entityLabel: row.name,
        action: "CREATE",
      });
      return row;
    }));
  } catch (err) {
    // 약칭(shortName) 유니크 제약 위반 — 이 브라우저가 들고 있던 전담기관 목록이 오래돼(재조회
    // 없이 세션 내내 유지) 이미 서버에 있는 전담기관을 "신규"로 오인한 경우다(엑셀 대량 업로드의
    // 신규 전담기관 자동 생성에서 흔함). 실패로 끝내는 대신 기존 전담기관을 그대로 돌려준다.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const existing = await prisma.fundingAgency.findUnique({ where: { shortName: body.shortName } });
      if (existing) return Response.json({ ok: true, agency: toFundingAgency(existing) });
    }
    console.error("전담기관 생성 실패:", err);
    return Response.json({ ok: false, error: describeDbWriteError(err, "전담기관을 생성하지 못했습니다.") }, { status: 500 });
  }

  invalidateCache(FUNDING_AGENCIES_CACHE_KEY);
  return Response.json({ ok: true, agency: toFundingAgency(created) });
}
