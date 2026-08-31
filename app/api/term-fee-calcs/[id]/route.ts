import { prisma } from "@/lib/db";
import { requireUser, SessionError } from "@/lib/session";
import { toTermFeeCalc } from "@/lib/term-fee-calc-mapper";
import type { TermFeeCalc } from "@/lib/mock";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

const BIGINT_FIELDS = [
  "totalCashBudget", "baseFee", "addonFee", "standardFee", "nonExemptCashBudget", "nonExemptBaseFee",
  "nonExemptAddonFee", "generalFee", "exemptFeeTotal", "calculatedFee", "generalCalcFee", "generalBillingFee",
  "generalUnclaimedFee", "carriedOverUnclaimed", "totalBillingFee",
] as const;

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  let actor;
  try {
    actor = await requireUser();
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }

  let body: Partial<TermFeeCalc>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }

  const before = await prisma.termFeeCalc.findUnique({ where: { id } });
  if (!before) return Response.json({ ok: false, error: "연차수수료 산정 내역을 찾을 수 없습니다." }, { status: 404 });

  const data: Record<string, unknown> = {};
  for (const key of BIGINT_FIELDS) {
    const v = (body as Record<string, unknown>)[key];
    if (typeof v === "number") data[key] = BigInt(Math.round(v));
  }
  if (body.coInstCount !== undefined) data.coInstCount = body.coInstCount;
  if (body.nonExemptCoInstCount !== undefined) data.nonExemptCoInstCount = body.nonExemptCoInstCount;
  if (body.exemptBreakdown !== undefined) data.exemptBreakdown = JSON.stringify(body.exemptBreakdown);
  if (body.overrides !== undefined) data.overrides = JSON.stringify(body.overrides);
  if (body.status !== undefined) data.status = body.status;
  if (body.workType !== undefined) data.workType = body.workType;

  const updated = await prisma.termFeeCalc.update({ where: { id }, data });

  await prisma.auditLog.create({
    data: { userId: actor.userId, action: "UPDATE", resourceType: "termFeeCalc", resourceId: id, newValues: JSON.stringify({ status: updated.status }) },
  });

  return Response.json({ ok: true, termFeeCalc: toTermFeeCalc(updated) });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  let actor;
  try {
    actor = await requireUser();
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }

  const target = await prisma.termFeeCalc.findUnique({ where: { id } });
  if (!target) return Response.json({ ok: false, error: "연차수수료 산정 내역을 찾을 수 없습니다." }, { status: 404 });

  await prisma.termFeeCalc.delete({ where: { id } });

  await prisma.auditLog.create({
    data: { userId: actor.userId, action: "DELETE", resourceType: "termFeeCalc", resourceId: id, oldValues: JSON.stringify({ projectNumber: target.projectNumber }) },
  });

  return Response.json({ ok: true });
}
