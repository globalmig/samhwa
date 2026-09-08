import { prisma } from "@/lib/db";
import { requireWriteAccess, SessionError } from "@/lib/session";
import { toTaxInvoice, MOCK_TO_DB_STATUS } from "@/lib/tax-invoice-mapper";
import type { TaxInvoice } from "@/lib/mock";

export const runtime = "nodejs";

const INCLUDE = { projectTermInstitution: { include: { projectTerm: { include: { project: true } }, institution: true } } } as const;

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  try {
    await requireWriteAccess(["tax-invoices", "fees-sales"]);
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }

  let body: Partial<TaxInvoice>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }

  const before = await prisma.taxInvoice.findUnique({ where: { id } });
  if (!before) return Response.json({ ok: false, error: "세금계산서를 찾을 수 없습니다." }, { status: 404 });

  const updated = await prisma.taxInvoice.update({
    where: { id },
    data: {
      invoiceNumber: body.invoiceNumber ?? undefined,
      // issue_date는 DB에서 NOT NULL이라, 빈 문자열(취소 시 "발행일을 지운다"는 의도로 보내던 값)을
      // new Date("")(Invalid Date)로 그대로 넘기면 이 update 자체가 예외로 실패해 상태(status)까지
      // 함께 저장 안 되는 문제가 있었다 — 취소가 화면엔 잠깐 반영된 것처럼 보이다 새로고침하면
      // 원래 발행 상태로 되돌아가던 버그의 실제 원인. 빈 문자열이면 기존 발행일을 그대로 둔다.
      issueDate: body.issuedAt ? new Date(body.issuedAt) : undefined,
      supplyAmount: body.supplyAmount !== undefined ? BigInt(Math.round(body.supplyAmount)) : undefined,
      taxAmount: body.taxAmount !== undefined ? BigInt(Math.round(body.taxAmount)) : undefined,
      totalAmount: body.totalAmount !== undefined ? BigInt(Math.round(body.totalAmount)) : undefined,
      status: body.status !== undefined ? MOCK_TO_DB_STATUS[body.status] ?? undefined : undefined,
      cancelledAt: body.status === "CANCELED" ? new Date() : undefined,
    },
    include: INCLUDE,
  });

  // 변경이력은 클라이언트 record()가 /api/audit-log로 남긴다(중복 방지).
  return Response.json({ ok: true, taxInvoice: toTaxInvoice(updated) });
}
