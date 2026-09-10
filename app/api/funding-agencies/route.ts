import { prisma } from "@/lib/db";
import { requireUser, requireWriteAccess, SessionError } from "@/lib/session";
import { toFundingAgency } from "@/lib/funding-agency-mapper";
import { writeAuditLog } from "@/lib/audit";
import type { FundingAgency, AgencyGuideTab } from "@/lib/mock";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireUser();
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }
  const agencies = await prisma.fundingAgency.findMany({ orderBy: { createdAt: "asc" } });
  // guideContent(운용 안내)는 fundingAgency 레코드 자체엔 있지만 toFundingAgency엔 포함하지 않는다 —
  // 클라이언트 store는 이걸 agencyGuides(약칭을 키로 하는 별도 딕셔너리)로 따로 들고 있으므로
  // 여기서 그 모양대로 만들어 함께 내려준다. 예전엔 저장(PATCH)만 되고 이 값을 다시 읽어오는
  // 경로가 없어서, 저장 직후엔 화면에 보이다가도 새로고침하면 항상 사라지는 버그가 있었다.
  const agencyGuides: Record<string, AgencyGuideTab[]> = {};
  for (const a of agencies) {
    if (!a.guideContent) continue;
    try {
      agencyGuides[a.shortName] = JSON.parse(a.guideContent);
    } catch {
      // 저장된 값이 손상됐으면 그 기관만 건너뛰고(기본 안내로 폴백) 나머지는 정상 반환한다.
    }
  }
  return Response.json({ ok: true, agencies: agencies.map(toFundingAgency), agencyGuides });
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

  const created = await prisma.$transaction(async (tx) => {
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
  });

  return Response.json({ ok: true, agency: toFundingAgency(created) });
}
