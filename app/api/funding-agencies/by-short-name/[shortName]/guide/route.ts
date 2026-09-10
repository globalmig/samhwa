import { prisma } from "@/lib/db";
import { requireWriteAccess, SessionError } from "@/lib/session";
import { writeAuditLog } from "@/lib/audit";
import type { AgencyGuideTab } from "@/lib/mock";

export const runtime = "nodejs";

type Params = { params: Promise<{ shortName: string }> };

// lib/store.ts의 updateAgencyGuide(shortName, tabs)가 shortName만으로 호출하는 기존 시그니처에 맞춘 라우트.
export async function PATCH(request: Request, { params }: Params) {
  const { shortName } = await params;
  let actor;
  try {
    actor = await requireWriteAccess("funding-agencies");
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

  const decodedShortName = decodeURIComponent(shortName);
  await prisma.$transaction(async (tx) => {
    await tx.fundingAgency.update({ where: { id: agency.id }, data: { guideContent: JSON.stringify(tabs) } });
    await writeAuditLog(tx, {
      actorUserId: actor.userId,
      entityType: "fundingAgency",
      entityId: decodedShortName,
      entityLabel: `${decodedShortName} 운용 안내`,
      action: "UPDATE",
    });
  });

  return Response.json({ ok: true });
}
