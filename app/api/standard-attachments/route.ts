import { prisma } from "@/lib/db";
import { requireUser, requireWriteAccess, SessionError } from "@/lib/session";
import { toStandardAttachment } from "@/lib/notice-template-mapper";
import { writeAuditLog } from "@/lib/audit";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireUser();
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }
  const rows = await prisma.standardAttachment.findMany({ orderBy: { updatedAt: "asc" } });
  return Response.json({ ok: true, attachments: rows.map(toStandardAttachment) });
}

export async function POST(request: Request) {
  let actor;
  try {
    actor = await requireWriteAccess("standard-attachments");
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

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.standardAttachment.create({ data: { name: body.name } });
    await writeAuditLog(tx, {
      actorUserId: actor.userId,
      entityType: "standardAttachment",
      entityId: row.id,
      entityLabel: row.name,
      action: "CREATE",
    });
    return row;
  });
  return Response.json({ ok: true, attachment: toStandardAttachment(created) });
}
