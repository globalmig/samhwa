import { requireWriteAccess, SessionError } from "@/lib/session";
import { writeReceivable, ReceivableWriteError, trackedPaid, untrackedPaid, amountsAfterPayment } from "@/lib/receivable-write";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string; paymentId: string }> };

// 분할 수금 중 잘못 입력한 입금 한 건(차수)만 지우고, 납부액을 "이력 없는 예전 수금액 + 남은 입금 내역
// 합계"로 다시 맞춘다.
export async function DELETE(_request: Request, { params }: Params) {
  const { id, paymentId } = await params;
  let actor;
  try {
    actor = await requireWriteAccess(["receivables", "fees-sales", "fees"]);
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }

  return writeReceivable(id, actor.userId, async (tx, before) => {
    const payment = before.paymentHistories.find((p) => p.id.toLowerCase() === paymentId.toLowerCase());
    if (!payment) throw new ReceivableWriteError(404, "입금 내역을 찾을 수 없습니다. 이미 삭제됐을 수 있습니다.");
    const collected = untrackedPaid(before) + trackedPaid(before) - Number(payment.paymentAmount);
    await tx.paymentHistory.delete({ where: { id: payment.id } });
    await tx.receivable.update({ where: { id: before.id }, data: amountsAfterPayment(before, collected) });
  });
}
