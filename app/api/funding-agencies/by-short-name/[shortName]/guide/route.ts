import { prisma } from "@/lib/db";
import { requireUser, SessionError } from "@/lib/session";
import type { AgencyGuideTab } from "@/lib/mock";

export const runtime = "nodejs";

type Params = { params: Promise<{ shortName: string }> };

// lib/store.ts의 updateAgencyGuide(shortName, tabs)가 shortName만으로 호출하는 기존 시그니처에 맞춘 라우트.
export async function PATCH(request: Request, { params }: Params) {
  const { shortName } = await params;
  let actor;
  try {
    actor = await requireUser();
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
  await prisma.auditLog.create({
    data: { userId: actor.userId, action: "UPDATE", resourceType: "fundingAgency", resourceId: agency.id, newValues: JSON.stringify({ guideUpdated: true }) },
  });

  return Response.json({ ok: true });
}
