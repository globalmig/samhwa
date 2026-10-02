import { requireWriteAccess, SessionError } from "@/lib/session";
import { writeReceivable, ReceivableWriteError, trackedPaid, untrackedPaid, amountsAfterPayment } from "@/lib/receivable-write";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

async function writer() {
  try {
    return { actor: await requireWriteAccess(["receivables", "fees-sales", "fees"]) };
  } catch (err) {
    if (err instanceof SessionError) return { denied: Response.json({ ok: false, error: err.message }, { status: err.status }) };
    throw err;
  }
}

// 분할 수금 — 입금 한 건(차수)을 추가한다. 납부액은 덮어쓰지 않고 "이력 없는 예전 수금액 + 입금 내역
// 합계"로 다시 맞추므로, 엑셀 업로드 등으로 이력 없이 들어와 있던 예전 수금액도 그대로 유지된다.
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  const { actor, denied } = await writer();
  if (denied) return denied;

  let body: { paidAt?: string; amount?: number };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }
  const amount = Math.round(Number(body.amount));
  const paidAt = body.paidAt ? new Date(body.paidAt) : null;
  if (!Number.isFinite(amount) || amount <= 0) {
    return Response.json({ ok: false, error: "입금액을 입력해 주세요." }, { status: 400 });
  }
  if (!paidAt || Number.isNaN(paidAt.getTime())) {
    return Response.json({ ok: false, error: "수금일을 입력해 주세요." }, { status: 400 });
  }

  return writeReceivable(id, actor.userId, async (tx, before) => {
    const collected = untrackedPaid(before) + trackedPaid(before) + amount;
    if (collected > Number(before.billedAmount)) {
      throw new ReceivableWriteError(400, "청구액을 초과하는 금액은 등록할 수 없습니다.");
    }
    await tx.paymentHistory.create({
      data: { receivableId: before.id, paymentDate: paidAt, paymentAmount: BigInt(amount), createdBy: actor.userId },
    });
    await tx.receivable.update({ where: { id: before.id }, data: amountsAfterPayment(before, collected) });
  });
}

// 수금 취소(초기화) — 입금 내역을 전부 지우고 납부액을 0으로 되돌린다. 누적액 수정(PATCH)의 paidAmount: 0과
// 구분되는 명시적인 요청이라, 오래 열어 둔 수정창이 옛 납부액 0을 그대로 보내도 새 입금이 지워지지 않는다.
export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  const { actor, denied } = await writer();
  if (denied) return denied;

  return writeReceivable(id, actor.userId, async (tx, before) => {
    await tx.paymentHistory.deleteMany({ where: { receivableId: before.id } });
    await tx.receivable.update({ where: { id: before.id }, data: amountsAfterPayment(before, 0) });
  });
}
