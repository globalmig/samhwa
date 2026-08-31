import { prisma } from "@/lib/db";
import { getSessionUser } from "@/lib/session";
import { toSystemUser } from "@/lib/user-mapper";

export const runtime = "nodejs";

export async function GET() {
  const session = await getSessionUser();
  if (!session) {
    return Response.json({ ok: false, user: null }, { status: 401 });
  }
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user || user.status !== "ACTIVE") {
    return Response.json({ ok: false, user: null }, { status: 401 });
  }
  return Response.json({ ok: true, user: toSystemUser(user) });
}
