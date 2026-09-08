import { prisma } from "@/lib/db";
import { requireUser, SessionError } from "@/lib/session";
import { toStandardAttachment } from "@/lib/notice-template-mapper";

export const runtime = "nodejs";

export async function GET() {
  const rows = await prisma.standardAttachment.findMany({ orderBy: { updatedAt: "asc" } });
  return Response.json({ ok: true, attachments: rows.map(toStandardAttachment) });
}

export async function POST(request: Request) {
  try {
    await requireUser();
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }
  let body: { name: string };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }
  if (!body.name) return Response.json({ ok: false, error: "이름은 필수입니다." }, { status: 400 });

  const created = await prisma.standardAttachment.create({ data: { name: body.name } });
  // 변경이력은 클라이언트 record()가 /api/audit-log로 남긴다(중복 방지).
  return Response.json({ ok: true, attachment: toStandardAttachment(created) });
}
