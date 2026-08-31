import { prisma } from "@/lib/db";
import { requireUser, SessionError } from "@/lib/session";
import { toStandardAttachment } from "@/lib/notice-template-mapper";
import type { StandardAttachment } from "@/lib/mock";

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
  let body: Partial<Omit<StandardAttachment, "id">>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }

  const before = await prisma.standardAttachment.findUnique({ where: { id } });
  if (!before) return Response.json({ ok: false, error: "첨부서류를 찾을 수 없습니다." }, { status: 404 });

  const updated = await prisma.standardAttachment.update({
    where: { id },
    data: {
      name: body.name ?? undefined,
      fileDataUrl: body.fileDataUrl !== undefined ? body.fileDataUrl : undefined,
      enabledByCategory: body.enabledByCategory !== undefined ? JSON.stringify(body.enabledByCategory) : undefined,
    },
  });
  await prisma.auditLog.create({ data: { userId: actor.userId, action: "UPDATE", resourceType: "standardAttachment", resourceId: id, newValues: JSON.stringify({ name: updated.name }) } });
  return Response.json({ ok: true, attachment: toStandardAttachment(updated) });
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
  const target = await prisma.standardAttachment.findUnique({ where: { id } });
  if (!target) return Response.json({ ok: false, error: "첨부서류를 찾을 수 없습니다." }, { status: 404 });

  await prisma.standardAttachment.delete({ where: { id } });
  await prisma.auditLog.create({ data: { userId: actor.userId, action: "DELETE", resourceType: "standardAttachment", resourceId: id, oldValues: JSON.stringify({ name: target.name }) } });
  return Response.json({ ok: true });
}
