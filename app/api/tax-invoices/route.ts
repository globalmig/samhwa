import { prisma } from "@/lib/db";
import { requireUser, SessionError } from "@/lib/session";
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
  let actor;
  try {
    actor = await requireUser();
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
  const ptiId = await getOrCreatePti(prisma, project.id, body.termNumber, institutionId, "MAIN", BigInt(Math.round(body.supplyAmount)));

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

  await prisma.auditLog.create({
    data: { userId: actor.userId, action: "CREATE", resourceType: "taxInvoice", resourceId: created.id, newValues: JSON.stringify({ invoiceNumber: created.invoiceNumber }) },
  });

  return Response.json({ ok: true, taxInvoice: toTaxInvoice(created) });
}
