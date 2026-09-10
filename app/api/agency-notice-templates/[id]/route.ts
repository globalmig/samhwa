import { prisma } from "@/lib/db";
import { requireWriteAccess, SessionError } from "@/lib/session";
import { toAgencyNoticeTemplate } from "@/lib/notice-template-mapper";
import { writeAuditLog } from "@/lib/audit";
import type { AgencyNoticeTemplate } from "@/lib/mock";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  let actor;
  try {
    actor = await requireWriteAccess("notice-templates");
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

  const before = await prisma.agencyNoticeTemplate.findUnique({ where: { id }, include: { fundingAgency: true } });
  if (!before) return Response.json({ ok: false, error: "템플릿을 찾을 수 없습니다." }, { status: 404 });

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.agencyNoticeTemplate.update({
      where: { id },
      data: { name: body.name ?? undefined, content: body.content !== undefined ? JSON.stringify(body.content) : undefined },
      include: { fundingAgency: true },
    });
    await writeAuditLog(tx, {
      actorUserId: actor.userId,
      entityType: "fundingAgency",
      entityId: before.fundingAgency.shortName,
      entityLabel: `${before.fundingAgency.shortName} 공문 템플릿 수정 (${row.name})`,
      action: "UPDATE",
    });
    return row;
  });
  return Response.json({ ok: true, template: toAgencyNoticeTemplate(updated) });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  let actor;
  try {
    actor = await requireWriteAccess("notice-templates");
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }
  const target = await prisma.agencyNoticeTemplate.findUnique({ where: { id }, include: { fundingAgency: true } });
  if (!target) return Response.json({ ok: false, error: "템플릿을 찾을 수 없습니다." }, { status: 404 });

  await prisma.$transaction(async (tx) => {
    await tx.agencyNoticeTemplate.delete({ where: { id } });
    await writeAuditLog(tx, {
      actorUserId: actor.userId,
      entityType: "fundingAgency",
      entityId: target.fundingAgency.shortName,
      entityLabel: `${target.fundingAgency.shortName} 공문 템플릿 삭제 (${target.name})`,
      action: "DELETE",
    });
  });
  return Response.json({ ok: true });
}
