import { prisma } from "@/lib/db";
import { requireUser, SessionError } from "@/lib/session";

export const runtime = "nodejs";

export async function GET() {
  let actor;
  try {
    actor = await requireUser();
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }

  const row = await prisma.notificationState.findUnique({ where: { userId: actor.userId } });
  return Response.json({
    ok: true,
    readIds: row ? (JSON.parse(row.readIds) as string[]) : [],
    dismissedIds: row ? (JSON.parse(row.dismissedIds) as string[]) : [],
  });
}

export async function PUT(request: Request) {
  let actor;
  try {
    actor = await requireUser();
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }

  let body: { readIds?: unknown; dismissedIds?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }
  if (!Array.isArray(body.readIds) || !Array.isArray(body.dismissedIds)) {
    return Response.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }
  const readIds = JSON.stringify(body.readIds);
  const dismissedIds = JSON.stringify(body.dismissedIds);

  await prisma.notificationState.upsert({
    where: { userId: actor.userId },
    create: { userId: actor.userId, readIds, dismissedIds },
    update: { readIds, dismissedIds },
  });

  return Response.json({ ok: true });
}
