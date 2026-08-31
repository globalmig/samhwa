import { prisma } from "@/lib/db";
import { requireUser, SessionError } from "@/lib/session";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  let actor;
  try {
    actor = await requireUser();
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }

  const target = await prisma.notice.findUnique({ where: { id } });
  if (!target) return Response.json({ ok: false, error: "공지사항을 찾을 수 없습니다." }, { status: 404 });

  await prisma.notice.delete({ where: { id } });

  await prisma.auditLog.create({
    data: { userId: actor.userId, action: "DELETE", resourceType: "notice", resourceId: id, oldValues: JSON.stringify({ title: target.title }) },
  });

  return Response.json({ ok: true });
}
