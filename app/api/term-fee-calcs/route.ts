import { prisma } from "@/lib/db";
import { requireUser, SessionError } from "@/lib/session";
import { toTermFeeCalc } from "@/lib/term-fee-calc-mapper";
import type { TermFeeCalc } from "@/lib/mock";

export const runtime = "nodejs";

export async function GET() {
  const rows = await prisma.termFeeCalc.findMany();
  return Response.json({ ok: true, termFeeCalcs: rows.map(toTermFeeCalc) });
}

export async function POST(request: Request) {
  try {
    await requireUser();
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }

  let body: Omit<TermFeeCalc, "id">;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }
  if (!body.projectId || !body.agencyId) {
    return Response.json({ ok: false, error: "과제, 전담기관은 필수입니다." }, { status: 400 });
  }

  const created = await prisma.termFeeCalc.create({
    data: {
      projectId: body.projectId,
      projectNumber: body.projectNumber,
      projectName: body.projectName,
      fundingAgencyId: body.agencyId,
      termYear: body.termYear,
      termNumber: body.termNumber,
      stageNumber: body.stageNumber,
      workType: body.workType,
      totalCashBudget: BigInt(Math.round(body.totalCashBudget)),
      coInstCount: body.coInstCount,
      baseFee: BigInt(Math.round(body.baseFee)),
      addonFee: BigInt(Math.round(body.addonFee)),
      standardFee: BigInt(Math.round(body.standardFee)),
      nonExemptCashBudget: BigInt(Math.round(body.nonExemptCashBudget)),
      nonExemptCoInstCount: body.nonExemptCoInstCount,
      nonExemptBaseFee: BigInt(Math.round(body.nonExemptBaseFee)),
      nonExemptAddonFee: BigInt(Math.round(body.nonExemptAddonFee)),
      generalFee: BigInt(Math.round(body.generalFee)),
      exemptFeeTotal: BigInt(Math.round(body.exemptFeeTotal)),
      exemptBreakdown: JSON.stringify(body.exemptBreakdown ?? []),
      calculatedFee: BigInt(Math.round(body.calculatedFee)),
      generalCalcFee: BigInt(Math.round(body.generalCalcFee)),
      generalBillingFee: BigInt(Math.round(body.generalBillingFee)),
      generalUnclaimedFee: BigInt(Math.round(body.generalUnclaimedFee)),
      carriedOverUnclaimed: BigInt(Math.round(body.carriedOverUnclaimed)),
      totalBillingFee: BigInt(Math.round(body.totalBillingFee)),
      overrides: JSON.stringify(body.overrides ?? []),
      status: body.status,
    },
  });

  // 변경이력은 클라이언트 record()가 /api/audit-log로 남긴다(중복 방지).
  return Response.json({ ok: true, termFeeCalc: toTermFeeCalc(created) });
}
