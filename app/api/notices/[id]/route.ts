import { prisma } from "@/lib/db";
import { requireUser, SessionError } from "@/lib/session";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  try {
    await requireUser();
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }

  const target = await prisma.notice.findUnique({ where: { id } });
  if (!target) return Response.json({ ok: false, error: "공지사항을 찾을 수 없습니다." }, { status: 404 });

  await prisma.notice.delete({ where: { id } });

  // 변경이력은 클라이언트 record()가 /api/audit-log로 남긴다(중복 방지).
  return Response.json({ ok: true });
}
