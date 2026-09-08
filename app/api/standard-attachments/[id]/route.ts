import { prisma } from "@/lib/db";
import { requireUser, SessionError } from "@/lib/session";
import { toStandardAttachment } from "@/lib/notice-template-mapper";
import type { StandardAttachment } from "@/lib/mock";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  try {
    await requireUser();
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
  // 변경이력은 클라이언트 record()가 /api/audit-log로 남긴다(중복 방지).
  return Response.json({ ok: true, attachment: toStandardAttachment(updated) });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  try {
    await requireUser();
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }
  const target = await prisma.standardAttachment.findUnique({ where: { id } });
  if (!target) return Response.json({ ok: false, error: "첨부서류를 찾을 수 없습니다." }, { status: 404 });

  await prisma.standardAttachment.delete({ where: { id } });
  // 변경이력은 클라이언트 record()가 /api/audit-log로 남긴다(중복 방지).
  return Response.json({ ok: true });
}
