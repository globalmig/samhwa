import { prisma } from "@/lib/db";
import { requireWriteAccess, SessionError } from "@/lib/session";
import { toTermFeeCalc } from "@/lib/term-fee-calc-mapper";
import { writeAuditLog } from "@/lib/audit";
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
    actor = await requireWriteAccess(["fees", "fees-sales", "fees-info-edit"]);
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

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.termFeeCalc.update({ where: { id }, data });
    const afterCalc = toTermFeeCalc(row);
    await writeAuditLog(tx, {
      actorUserId: actor.userId,
      entityType: "termFeeCalc",
      entityId: row.id,
      entityLabel: `${afterCalc.projectNumber} · ${afterCalc.termYear}년 ${afterCalc.termNumber}연차`,
      action: "UPDATE",
      before: toTermFeeCalc(before) as unknown as Record<string, unknown>,
      after: afterCalc as unknown as Record<string, unknown>,
    });
    return row;
  });

  return Response.json({ ok: true, termFeeCalc: toTermFeeCalc(updated) });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  let actor;
  try {
    actor = await requireWriteAccess(["fees", "fees-sales", "fees-info-edit"]);
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }

  const target = await prisma.termFeeCalc.findUnique({ where: { id } });
  if (!target) return Response.json({ ok: false, error: "연차수수료 산정 내역을 찾을 수 없습니다." }, { status: 404 });

  await prisma.$transaction(async (tx) => {
    await tx.termFeeCalc.delete({ where: { id } });
    const targetCalc = toTermFeeCalc(target);
    await writeAuditLog(tx, {
      actorUserId: actor.userId,
      entityType: "termFeeCalc",
      entityId: target.id,
      entityLabel: `${targetCalc.projectNumber} · ${targetCalc.termYear}년 ${targetCalc.termNumber}연차`,
      action: "DELETE",
    });
  });

  return Response.json({ ok: true });
}
