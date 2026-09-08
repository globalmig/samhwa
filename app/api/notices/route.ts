import { prisma } from "@/lib/db";
import { requireUser, SessionError } from "@/lib/session";
import { toNotice } from "@/lib/notice-mapper";
import { appRoleToDb } from "@/lib/role-map";
import type { Notice } from "@/lib/mock";

export const runtime = "nodejs";

export async function GET() {
  const rows = await prisma.notice.findMany({ orderBy: { createdAt: "desc" } });
  return Response.json({ ok: true, notices: rows.map(toNotice) });
}

export async function POST(request: Request) {
  let actor;
  try {
    actor = await requireUser();
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }

  let body: Omit<Notice, "id">;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }
  if (!body.title || !body.content) {
    return Response.json({ ok: false, error: "제목, 내용은 필수입니다." }, { status: 400 });
  }

  const created = await prisma.notice.create({
    data: {
      title: body.title,
      content: body.content,
      authorName: body.authorName,
      authorId: actor.userId,
      authorRole: appRoleToDb(body.authorRole),
    },
  });

  // 변경이력은 클라이언트 record()가 /api/audit-log로 남긴다(중복 방지).
  return Response.json({ ok: true, notice: toNotice(created) });
}
