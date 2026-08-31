import { prisma } from "@/lib/db";
import { requireUser, SessionError } from "@/lib/session";
import { toSimpleNoticeTemplate } from "@/lib/notice-template-mapper";
import type { SimpleNoticeTemplate, SimpleNoticeTemplateEntry } from "@/lib/mock";

export const runtime = "nodejs";

export async function GET() {
  const rows = await prisma.simpleNoticeTemplate.findMany({ orderBy: { createdAt: "asc" } });
  return Response.json({ ok: true, templates: rows.map(toSimpleNoticeTemplate) });
}

export async function POST(request: Request) {
  let actor;
  try {
    actor = await requireUser();
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }
  let body: { category: SimpleNoticeTemplateEntry["category"]; name: string; content: SimpleNoticeTemplate };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }
  if (!body.category || !body.name || !body.content) {
    return Response.json({ ok: false, error: "카테고리, 이름, 내용은 필수입니다." }, { status: 400 });
  }

  const created = await prisma.simpleNoticeTemplate.create({
    data: { category: body.category, name: body.name, content: JSON.stringify(body.content), isDefault: false },
  });
  await prisma.auditLog.create({ data: { userId: actor.userId, action: "CREATE", resourceType: "simpleNoticeTemplate", resourceId: created.id, newValues: JSON.stringify({ name: created.name }) } });
  return Response.json({ ok: true, template: toSimpleNoticeTemplate(created) });
}
