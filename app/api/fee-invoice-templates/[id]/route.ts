import { prisma } from "@/lib/db";
import { requireUser, SessionError } from "@/lib/session";
import { toFeeInvoiceTemplate } from "@/lib/notice-template-mapper";
import type { FeeInvoiceTemplate, FeeInvoiceDefaultAttachment } from "@/lib/mock";

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
  let body: Partial<{ name: string; content: FeeInvoiceTemplate; defaultAttachments: FeeInvoiceDefaultAttachment[] }>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }

  const before = await prisma.feeInvoiceTemplate.findUnique({ where: { id } });
  if (!before) return Response.json({ ok: false, error: "템플릿을 찾을 수 없습니다." }, { status: 404 });

  const updated = await prisma.feeInvoiceTemplate.update({
    where: { id },
    data: {
      name: body.name ?? undefined,
      content: body.content !== undefined ? JSON.stringify(body.content) : undefined,
      defaultAttachments: body.defaultAttachments !== undefined ? JSON.stringify(body.defaultAttachments) : undefined,
    },
  });
  await prisma.auditLog.create({ data: { userId: actor.userId, action: "UPDATE", resourceType: "feeInvoiceTemplate", resourceId: id, newValues: JSON.stringify({ name: updated.name }) } });
  return Response.json({ ok: true, template: toFeeInvoiceTemplate(updated) });
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
  const target = await prisma.feeInvoiceTemplate.findUnique({ where: { id } });
  if (!target) return Response.json({ ok: false, error: "템플릿을 찾을 수 없습니다." }, { status: 404 });
  if (target.isDefault) return Response.json({ ok: false, error: "대표양식은 삭제할 수 없습니다. 다른 템플릿을 먼저 대표로 지정해주세요." }, { status: 409 });

  await prisma.feeInvoiceTemplate.delete({ where: { id } });
  await prisma.auditLog.create({ data: { userId: actor.userId, action: "DELETE", resourceType: "feeInvoiceTemplate", resourceId: id, oldValues: JSON.stringify({ name: target.name }) } });
  return Response.json({ ok: true });
}
