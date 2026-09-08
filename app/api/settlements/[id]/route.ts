import { prisma } from "@/lib/db";
import { requireUser, SessionError } from "@/lib/session";
import { toSettlement, MOCK_TO_DB_STATUS } from "@/lib/settlement-mapper";
import type { Settlement } from "@/lib/mock";

export const runtime = "nodejs";

const INCLUDE = { projectTermInstitution: { include: { projectTerm: { include: { project: true } }, institution: true } } } as const;

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  try {
    await requireUser();
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }

  let body: Partial<Settlement>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }

  const before = await prisma.settlement.findUnique({ where: { id } });
  if (!before) return Response.json({ ok: false, error: "정산 내역을 찾을 수 없습니다." }, { status: 404 });

  const updated = await prisma.settlement.update({
    where: { id },
    data: {
      settlementAmount: body.settlementAmount !== undefined ? BigInt(Math.round(body.settlementAmount)) : undefined,
      additionalAmount: body.additionalAmount !== undefined ? BigInt(Math.round(body.additionalAmount)) : undefined,
      feeAmount: body.feeAmount !== undefined ? BigInt(Math.round(body.feeAmount)) : undefined,
      scheduledAmount: body.scheduledAmount !== undefined ? BigInt(Math.round(body.scheduledAmount)) : undefined,
      paidAmount: body.status === "PAID" && body.scheduledAmount !== undefined ? BigInt(Math.round(body.scheduledAmount)) : undefined,
      outstandingAmount: body.status === "PAID" ? BigInt(0) : undefined,
      settlementDate: body.paidAt !== undefined ? (body.paidAt ? new Date(body.paidAt) : null) : undefined,
      status: body.status !== undefined ? MOCK_TO_DB_STATUS[body.status] ?? undefined : undefined,
    },
    include: INCLUDE,
  });

  // 변경이력은 클라이언트 record()가 /api/audit-log로 남긴다(중복 방지).
  return Response.json({ ok: true, settlement: toSettlement(updated) });
}
