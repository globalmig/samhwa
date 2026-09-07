import { prisma } from "@/lib/db";
import { requireWriteAccess, SessionError } from "@/lib/session";
import { toUnclaimedFee, MOCK_TO_DB_STATUS } from "@/lib/unclaimed-fee-mapper";
import type { UnclaimedFee } from "@/lib/mock";

export const runtime = "nodejs";

const INCLUDE = { projectTermInstitution: { include: { projectTerm: { include: { project: true } }, institution: true } } } as const;

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  let actor;
  try {
    actor = await requireWriteAccess(["unclaimed", "fees"]);
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }

  let body: Partial<UnclaimedFee>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }

  const before = await prisma.unclaimedFee.findUnique({ where: { id } });
  if (!before) return Response.json({ ok: false, error: "미청구수수료를 찾을 수 없습니다." }, { status: 404 });

  const updated = await prisma.unclaimedFee.update({
    where: { id },
    data: {
      unclaimedAmount: body.amount !== undefined ? BigInt(Math.round(body.amount)) : undefined,
      status: body.status !== undefined ? MOCK_TO_DB_STATUS[body.status] ?? undefined : undefined,
    },
    include: INCLUDE,
  });

  await prisma.auditLog.create({
    data: { userId: actor.userId, action: "UPDATE", resourceType: "unclaimedFee", resourceId: id, newValues: JSON.stringify({ status: updated.status }) },
  });

  return Response.json({ ok: true, unclaimedFee: toUnclaimedFee(updated) });
}
