import { prisma } from "@/lib/db";
import { requireWriteAccess, SessionError } from "@/lib/session";
import { toTaxInvoice, MOCK_TO_DB_STATUS } from "@/lib/tax-invoice-mapper";
import { getOrCreatePti } from "@/lib/pti-helper";
import type { TaxInvoice } from "@/lib/mock";

export const runtime = "nodejs";

const INCLUDE = { projectTermInstitution: { include: { projectTerm: { include: { project: true } }, institution: true } } } as const;

export async function GET() {
  const rows = await prisma.taxInvoice.findMany({ include: INCLUDE });
  return Response.json({ ok: true, taxInvoices: rows.map(toTaxInvoice) });
}

export async function POST(request: Request) {
  try {
    await requireWriteAccess(["tax-invoices", "fees-sales"]);
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }

  let body: Omit<TaxInvoice, "id">;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }
  if (!body.invoiceNumber || !body.projectNumber || !body.leadInstitutionId) {
    return Response.json({ ok: false, error: "계산서번호, 과제번호, 주관기관은 필수입니다." }, { status: 400 });
  }

  const project = await prisma.project.findUnique({ where: { projectNumber: body.projectNumber } });
  if (!project) return Response.json({ ok: false, error: "과제를 찾을 수 없습니다." }, { status: 404 });

  const institution = await prisma.institution.findUnique({ where: { id: body.institutionId ?? body.leadInstitutionId } });
  const institutionId = body.institutionId ?? body.leadInstitutionId;
  const ptiId = await getOrCreatePti(prisma, project.id, body.termNumber, institutionId, "MAIN", BigInt(Math.round(body.supplyAmount)), body.termYear);

  // 이미 발행(취소되지 않은) 세금계산서가 이 연차·기관에 있으면 새로 만들지 않고 그 레코드를
  // 그대로 돌려준다 — 화면이 실제로는 이미 발행된 건을 "발행 전"으로 잘못 보여주는 동안(예: 위
  // getOrCreatePti의 연도 버그) 사용자가 "저장 & 발행"을 여러 번 눌러도 같은 연차·기관에 계산서가
  // 중복 생성되지 않도록 막는 방어선이다.
  const existingActive = await prisma.taxInvoice.findFirst({
    where: { projectTermInstitutionId: ptiId, status: { not: "CANCELLED" } },
    include: INCLUDE,
  });
  if (existingActive) {
    return Response.json({ ok: true, taxInvoice: toTaxInvoice(existingActive) });
  }

  const created = await prisma.taxInvoice.create({
    data: {
      projectTermInstitutionId: ptiId,
      invoiceNumber: body.invoiceNumber,
      issueDate: body.issuedAt ? new Date(body.issuedAt) : new Date(),
      supplyAmount: BigInt(Math.round(body.supplyAmount)),
      taxAmount: BigInt(Math.round(body.taxAmount)),
      totalAmount: BigInt(Math.round(body.totalAmount)),
      buyerName: body.leadInstitutionName,
      buyerBusinessNumber: institution?.businessNumber ?? "",
      status: MOCK_TO_DB_STATUS[body.status] ?? "ISSUED",
    },
    include: INCLUDE,
  });

  // 변경이력은 클라이언트 record()가 /api/audit-log로 남긴다(중복 방지).
  return Response.json({ ok: true, taxInvoice: toTaxInvoice(created) });
}
