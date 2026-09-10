import { prisma } from "@/lib/db";
import { requireUser, requireWriteAccess, SessionError } from "@/lib/session";
import { toAgencyNoticeTemplate } from "@/lib/notice-template-mapper";
import { writeAuditLog } from "@/lib/audit";
import type { AgencyNoticeTemplate } from "@/lib/mock";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireUser();
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }
  const rows = await prisma.agencyNoticeTemplate.findMany({ include: { fundingAgency: true }, orderBy: { createdAt: "asc" } });
  return Response.json({ ok: true, templates: rows.map(toAgencyNoticeTemplate) });
}

export async function POST(request: Request) {
  let actor;
  try {
    actor = await requireWriteAccess("notice-templates");
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

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.agencyNoticeTemplate.create({
      data: { fundingAgencyId: agency.id, name: body.name, content: JSON.stringify(body.content) },
      include: { fundingAgency: true },
    });
    await writeAuditLog(tx, {
      actorUserId: actor.userId,
      entityType: "fundingAgency",
      entityId: body.agencyShortName,
      entityLabel: `${body.agencyShortName} 공문 템플릿 등록 (${body.name})`,
      action: "CREATE",
    });
    return row;
  });
  return Response.json({ ok: true, template: toAgencyNoticeTemplate(created) });
}
