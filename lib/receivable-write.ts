import type { Prisma } from "@prisma/client";
import { prisma, withDbWriteSlot, withDeadlockRetry, describeDbWriteError } from "@/lib/db";
import { writeAuditLog, UUID_RE } from "@/lib/audit";
import { toReceivable, type ReceivableWithRelations } from "@/lib/receivable-mapper";

// toReceivable이 실제로 쓰는 필드만 select한다 — project 전체(특히 extraData)를 매 행마다 통째로
// 끌고 오면 채권이 쌓일수록 느려진다.
export const RECEIVABLE_INCLUDE = {
  projectTermInstitution: {
    include: {
      projectTerm: { include: { project: { select: { projectNumber: true, projectName: true } } } },
      institution: { select: { institutionName: true } },
    },
  },
  paymentHistories: true,
} as const;

export class ReceivableWriteError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export function trackedPaid(r: Pick<ReceivableWithRelations, "paymentHistories">): number {
  return r.paymentHistories.reduce((s, p) => s + Number(p.paymentAmount), 0);
}

// 납부액 = 입금 내역 없이 들어와 있던 예전 수금액(엑셀 업로드·분할 수금 도입 전 입력 등) + 차수별 입금
// 내역 합계. 입금을 추가·삭제할 때는 저장된 납부액에 그 금액만 더하고 빼는 대신 이 식으로 다시 맞춘다 —
// 예전 데이터에 납부액이 내역 합계보다 작게 남아 있어도 다음 입금 처리 때 내역 합계 기준으로 바로잡힌다.
export function untrackedPaid(r: Pick<ReceivableWithRelations, "collectedAmount" | "paymentHistories">): number {
  return Math.max(0, Number(r.collectedAmount) - trackedPaid(r));
}

// 미수액에서 따로 빼 둔 금액(회수불가 손실 등) — 미수액 = 청구액 − 납부액 − 차감액. 미수액은 화면이 계산해
// 보낸 값을 그대로 저장하지 않고 잠금 뒤 읽은 최신 청구액·납부액으로 서버가 다시 계산하는데, 이 차감액은
// 그대로 이어서 적용한다(오래 열어 둔 화면이 옛 납부액으로 계산한 미수액이 최신 입금을 무시하던 문제).
export function receivableDeduction(r: Pick<ReceivableWithRelations, "billedAmount" | "collectedAmount" | "outstandingAmount">): number {
  return Math.max(0, Number(r.billedAmount) - Number(r.collectedAmount) - Number(r.outstandingAmount));
}

// 납부액에 맞는 상태 — 미입금의 기본 상태는 "미수"(OUTSTANDING + isLongOverdue)로, 세금계산서 발행 직후
// 채권과 같은 기준이다(실제 연체 여부는 화면에서 만기일로 판정). 원래 미입금 상태였으면 그 값을 유지한다.
export function statusFor(
  before: Pick<ReceivableWithRelations, "status" | "isLongOverdue">,
  billed: number,
  collected: number,
): { status: string; isLongOverdue: boolean } {
  if (collected > 0 && collected >= billed) return { status: "SETTLED", isLongOverdue: false };
  if (collected > 0) return { status: "PARTIAL", isLongOverdue: false };
  if (before.status === "OUTSTANDING") return { status: before.status, isLongOverdue: before.isLongOverdue };
  return { status: "OUTSTANDING", isLongOverdue: true };
}

// 입금 추가·삭제·초기화 후 납부액·미수액·상태를 한 번에 맞춘다(기존 차감액 유지).
export function amountsAfterPayment(before: ReceivableWithRelations, collected: number) {
  const billed = Number(before.billedAmount);
  return {
    collectedAmount: BigInt(collected),
    outstandingAmount: BigInt(Math.max(0, billed - collected - receivableDeduction(before))),
    ...statusFor(before, billed, collected),
  };
}

// 채권 하나에 대한 수금 쓰기(입금 추가·삭제·누적액 수정)를 행 잠금으로 직렬화해서 실행한다. 트랜잭션 첫
// 문장에서 그 채권 행을 갱신해 배타 잠금을 잡으므로, 같은 채권에 동시에 들어온 다른 요청은 이 트랜잭션이
// 끝날 때까지 기다렸다가 커밋된 최신 납부액·입금 내역을 읽는다. (예전엔 트랜잭션 밖에서 읽은 납부액에
// 금액을 더해 저장해서, 동시 요청 두 건이 같은 옛 값을 보고 각자 덮어쓰면 입금 한 건이 납부액에서 사라졌다.)
// mutate 안에서 ReceivableWriteError를 던지면 전부 롤백되고 그 상태코드·메시지로 응답한다.
export async function writeReceivable(
  id: string,
  actorUserId: string,
  mutate: (tx: Prisma.TransactionClient, before: ReceivableWithRelations) => Promise<void>,
): Promise<Response> {
  if (!UUID_RE.test(id)) return Response.json({ ok: false, error: "미수금을 찾을 수 없습니다." }, { status: 404 });
  try {
    const receivable = await withDbWriteSlot(() => withDeadlockRetry(() => prisma.$transaction(async (tx) => {
      const { count } = await tx.receivable.updateMany({ where: { id }, data: { updatedAt: new Date() } });
      if (count === 0) throw new ReceivableWriteError(404, "미수금을 찾을 수 없습니다.");
      const before = await tx.receivable.findUniqueOrThrow({ where: { id }, include: RECEIVABLE_INCLUDE });

      await mutate(tx, before);

      const after = await tx.receivable.findUniqueOrThrow({ where: { id }, include: RECEIVABLE_INCLUDE });
      // invoiceNumber는 receivables 테이블에 컬럼이 없어 같은 참여기관(PTI)의 세금계산서에서 가져온다.
      const invMap = new Map((await tx.taxInvoice.findMany({
        where: { projectTermInstitutionId: before.projectTermInstitutionId },
        select: { projectTermInstitutionId: true, invoiceNumber: true },
      })).map((i) => [i.projectTermInstitutionId, i.invoiceNumber]));
      const afterReceivable = toReceivable(after, invMap);
      await writeAuditLog(tx, {
        actorUserId,
        entityType: "receivable",
        entityId: id,
        entityLabel: `${afterReceivable.projectNumber} · ${afterReceivable.leadInstitutionName}`,
        action: "UPDATE",
        before: toReceivable(before, invMap) as unknown as Record<string, unknown>,
        after: afterReceivable as unknown as Record<string, unknown>,
      });
      return afterReceivable;
    })));
    return Response.json({ ok: true, receivable });
  } catch (err) {
    if (err instanceof ReceivableWriteError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    console.error("수금 저장 실패:", err);
    return Response.json({ ok: false, error: describeDbWriteError(err, "수금 정보를 저장하지 못했습니다.") }, { status: 500 });
  }
}
