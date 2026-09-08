import { prisma } from "@/lib/db";
import { requireUser, SessionError } from "@/lib/session";
import type { AgencyGuideTab } from "@/lib/mock";

export const runtime = "nodejs";

type Params = { params: Promise<{ shortName: string }> };

// lib/store.ts의 updateAgencyGuide(shortName, tabs)가 shortName만으로 호출하는 기존 시그니처에 맞춘 라우트.
export async function PATCH(request: Request, { params }: Params) {
  const { shortName } = await params;
  try {
    await requireUser();
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }

  let tabs: AgencyGuideTab[];
  try {
    tabs = await request.json();
  } catch {
    return Response.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }

  const agency = await prisma.fundingAgency.findUnique({ where: { shortName: decodeURIComponent(shortName) } });
  if (!agency) return Response.json({ ok: false, error: "전담기관을 찾을 수 없습니다." }, { status: 404 });

  await prisma.fundingAgency.update({ where: { id: agency.id }, data: { guideContent: JSON.stringify(tabs) } });

  // 변경이력은 클라이언트 record()가 /api/audit-log로 남긴다(중복 방지).
  return Response.json({ ok: true });
}
