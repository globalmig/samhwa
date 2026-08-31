import { prisma } from "@/lib/db";
import { requireUser, SessionError } from "@/lib/session";
import { toAgencyNoticeTemplate } from "@/lib/notice-template-mapper";
import type { AgencyNoticeTemplate } from "@/lib/mock";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  let actor;
  try {
    actor = await requireUser();
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }
  let body: Partial<{ name: string; content: AgencyNoticeTemplate }>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }

  const before = await prisma.agencyNoticeTemplate.findUnique({ where: { id } });
  if (!before) return Response.json({ ok: false, error: "템플릿을 찾을 수 없습니다." }, { status: 404 });

  const updated = await prisma.agencyNoticeTemplate.update({
    where: { id },
    data: { name: body.name ?? undefined, content: body.content !== undefined ? JSON.stringify(body.content) : undefined },
    include: { fundingAgency: true },
  });
  await prisma.auditLog.create({ data: { userId: actor.userId, action: "UPDATE", resourceType: "agencyNoticeTemplate", resourceId: id, newValues: JSON.stringify({ name: updated.name }) } });
  return Response.json({ ok: true, template: toAgencyNoticeTemplate(updated) });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  let actor;
  try {
    actor = await requireUser();
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }
  const target = await prisma.agencyNoticeTemplate.findUnique({ where: { id } });
  if (!target) return Response.json({ ok: false, error: "템플릿을 찾을 수 없습니다." }, { status: 404 });

  await prisma.agencyNoticeTemplate.delete({ where: { id } });
  await prisma.auditLog.create({ data: { userId: actor.userId, action: "DELETE", resourceType: "agencyNoticeTemplate", resourceId: id, oldValues: JSON.stringify({ name: target.name }) } });
  return Response.json({ ok: true });
}
