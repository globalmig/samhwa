import { prisma } from "@/lib/db";
import { requireUser, requireWriteAccess, SessionError } from "@/lib/session";
import { toReceivable, MOCK_TO_DB_STATUS } from "@/lib/receivable-mapper";
import { UUID_RE } from "@/lib/audit";
import { RECEIVABLE_INCLUDE, writeReceivable, ReceivableWriteError, trackedPaid, receivableDeduction, statusFor } from "@/lib/receivable-write";
import type { Receivable } from "@/lib/mock";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

// 채권 하나의 현재 서버 값 — 수금 저장이 실패했을 때 화면을 서버 정본으로 되돌리는 데 쓴다(lib/store.ts).
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  try {
    await requireUser();
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }
  const row = UUID_RE.test(id) ? await prisma.receivable.findUnique({ where: { id }, include: RECEIVABLE_INCLUDE }) : null;
  if (!row) return Response.json({ ok: false, error: "미수금을 찾을 수 없습니다." }, { status: 404 });
  const invMap = new Map((await prisma.taxInvoice.findMany({
    where: { projectTermInstitutionId: row.projectTermInstitutionId },
    select: { projectTermInstitutionId: true, invoiceNumber: true },
  })).map((i) => [i.projectTermInstitutionId, i.invoiceNumber]));
  return Response.json({ ok: true, receivable: toReceivable(row, invMap) });
}

// 화면이 이 요청을 계산할 때 기준으로 삼은 청구액·납부액(lib/store.ts의 updateReceivable이 붙여 보낸다).
type PatchBody = Partial<Receivable> & { baseBilledAmount?: number; basePaidAmount?: number };

// 채권 수정 — 바뀐 필드만 받는다. 납부액·미수액은 화면이 보낸 값을 그대로 덮어쓰지 않고, 잠금 뒤 읽은
// 최신 값에 맞춰 판단한다(오래 열어 둔 화면이 그 사이 들어온 입금을 지우거나 무시하지 않도록).
//  - 납부액: 화면의 기준값(basePaidAmount)이 지금 서버 값과 다르면 거절한다. 입금 내역 합계보다 작게도 못
//    고친다(0 포함 — 수금 취소(초기화)는 DELETE /api/receivables/[id]/payments로 따로 요청한다).
//  - 미수액: 항상 "최신 청구액 − 최신 납부액 − 차감액"으로 계산한다. 화면이 미수액을 보냈으면 그 화면의
//    기준값으로 계산한 차감액(회수불가 손실 등)만 받아들이고, 보내지 않았으면 기존 차감액을 유지한다.
//  - 상태: 직접 지정하지 않았는데 청구액·납부액이 바뀌면 그에 맞춰 다시 계산한다.
export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  let actor;
  try {
    actor = await requireWriteAccess(["receivables", "fees-sales", "fees"]);
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }

  let body: PatchBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }
  const round = (v: number | undefined) => (v === undefined || v === null ? undefined : Math.round(Number(v)));

  return writeReceivable(id, actor.userId, async (tx, before) => {
    const prevBilled = Number(before.billedAmount);
    const prevPaid = Number(before.collectedAmount);
    const billed = round(body.billedAmount) ?? prevBilled;
    const paidInput = round(body.paidAmount);
    const paidChanged = paidInput !== undefined && paidInput !== prevPaid;
    const collected = paidChanged ? paidInput : prevPaid;

    if (paidChanged) {
      const basePaid = round(body.basePaidAmount);
      if (basePaid !== undefined && basePaid !== prevPaid) {
        throw new ReceivableWriteError(
          409,
          `수정 화면을 연 뒤 다른 곳에서 수금 정보가 바뀌었습니다(현재 납부액 ${prevPaid.toLocaleString("ko-KR")}원). 새로고침 후 다시 수정해 주세요.`,
        );
      }
      const tracked = trackedPaid(before);
      if (collected < tracked) {
        throw new ReceivableWriteError(
          400,
          `차수별 입금 내역 합계(${tracked.toLocaleString("ko-KR")}원)보다 작게 수정할 수 없습니다. 줄이려면 수금 내역에서 해당 입금을 삭제하거나 수금 취소(초기화)를 해 주세요.`,
        );
      }
    }

    // 화면이 미수액을 계산할 때 쓴 청구액·납부액(보낸 값이 있으면 그 값, 없으면 화면의 기준값)으로 차감액을 구한다.
    const receivableInput = round(body.receivableAmount);
    const deduction = receivableInput !== undefined
      ? Math.max(0,
          (round(body.billedAmount) ?? round(body.baseBilledAmount) ?? prevBilled)
          - (paidInput ?? round(body.basePaidAmount) ?? prevPaid)
          - receivableInput)
      : receivableDeduction(before);
    const amountsChanged = billed !== prevBilled || paidChanged || receivableInput !== undefined;

    const statusData = body.status !== undefined
      ? { status: MOCK_TO_DB_STATUS[body.status] ?? undefined, isLongOverdue: body.status === "OVERDUE" }
      : billed !== prevBilled || paidChanged ? statusFor(before, billed, collected) : {};

    await tx.receivable.update({
      where: { id },
      data: {
        billedAmount: billed !== prevBilled ? BigInt(billed) : undefined,
        collectedAmount: paidChanged ? BigInt(collected) : undefined,
        outstandingAmount: amountsChanged ? BigInt(Math.max(0, billed - collected - deduction)) : undefined,
        dueDate: body.dueDate !== undefined ? new Date(body.dueDate) : undefined,
        ...statusData,
      },
    });

    // 누적액을 늘리면서 수금일을 함께 보낸 경우(예전 방식 호출)엔 늘어난 만큼을 그 날짜의 입금으로 남긴다.
    if (paidChanged && collected > prevPaid && body.paidAt) {
      await tx.paymentHistory.create({
        data: { receivableId: id, paymentDate: new Date(body.paidAt), paymentAmount: BigInt(collected - prevPaid), createdBy: actor.userId },
      });
    }
  });
}
