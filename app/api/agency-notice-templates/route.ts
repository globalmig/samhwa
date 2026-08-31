import { prisma } from "@/lib/db";
import { requireUser, SessionError } from "@/lib/session";
import { toAgencyNoticeTemplate } from "@/lib/notice-template-mapper";
import type { AgencyNoticeTemplate } from "@/lib/mock";

export const runtime = "nodejs";

export async function GET() {
  const rows = await prisma.agencyNoticeTemplate.findMany({ include: { fundingAgency: true }, orderBy: { createdAt: "asc" } });
  return Response.json({ ok: true, templates: rows.map(toAgencyNoticeTemplate) });
}

export async function POST(request: Request) {
  let actor;
  try {
    actor = await requireUser();
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }
  let body: { agencyShortName: string; name: string; content: AgencyNoticeTemplate };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }
  if (!body.agencyShortName || !body.name || !body.content) {
    return Response.json({ ok: false, error: "전담기관, 템플릿 이름, 내용은 필수입니다." }, { status: 400 });
  }

  const agency = await prisma.fundingAgency.findUnique({ where: { shortName: body.agencyShortName } });
  if (!agency) return Response.json({ ok: false, error: "전담기관을 찾을 수 없습니다." }, { status: 404 });

  const created = await prisma.agencyNoticeTemplate.create({
    data: { fundingAgencyId: agency.id, name: body.name, content: JSON.stringify(body.content) },
    include: { fundingAgency: true },
  });
  await prisma.auditLog.create({ data: { userId: actor.userId, action: "CREATE", resourceType: "agencyNoticeTemplate", resourceId: created.id, newValues: JSON.stringify({ name: created.name }) } });
  return Response.json({ ok: true, template: toAgencyNoticeTemplate(created) });
}
