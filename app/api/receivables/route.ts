import { prisma } from "@/lib/db";
import { requireWriteAccess, SessionError } from "@/lib/session";
import { toReceivable, MOCK_TO_DB_STATUS } from "@/lib/receivable-mapper";
import { getOrCreatePti } from "@/lib/pti-helper";
import type { Receivable } from "@/lib/mock";

export const runtime = "nodejs";

const INCLUDE = { projectTermInstitution: { include: { projectTerm: { include: { project: true } }, institution: true } }, paymentHistories: true } as const;

async function invoiceNumberMap(): Promise<Map<string, string>> {
  const invoices = await prisma.taxInvoice.findMany({ select: { projectTermInstitutionId: true, invoiceNumber: true } });
  return new Map(invoices.map((i) => [i.projectTermInstitutionId, i.invoiceNumber]));
}

export async function GET() {
  const rows = await prisma.receivable.findMany({ include: INCLUDE });
  const invMap = await invoiceNumberMap();
  return Response.json({ ok: true, receivables: rows.map((r) => toReceivable(r, invMap)) });
}

export async function POST(request: Request) {
  try {
    await requireWriteAccess(["receivables", "fees-sales", "fees"]);
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }

  let body: Omit<Receivable, "id">;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }
  if (!body.projectNumber || !body.leadInstitutionId) {
    return Response.json({ ok: false, error: "과제번호, 주관기관은 필수입니다." }, { status: 400 });
  }

  const project = await prisma.project.findUnique({ where: { projectNumber: body.projectNumber } });
  if (!project) return Response.json({ ok: false, error: "과제를 찾을 수 없습니다." }, { status: 404 });

  const institutionId = body.institutionId ?? body.leadInstitutionId;
  const ptiId = await getOrCreatePti(prisma, project.id, body.termNumber, institutionId, "MAIN", BigInt(Math.round(body.billedAmount)));

  const claim = await prisma.claim.create({
    data: {
      projectTermInstitutionId: ptiId,
      claimDate: body.billedAt ? new Date(body.billedAt) : new Date(),
      claimAmount: BigInt(Math.round(body.billedAmount)),
      claimType: "일반청구",
      status: "SENT",
    },
  });

  const created = await prisma.receivable.create({
    data: {
      claimId: claim.id,
      projectTermInstitutionId: ptiId,
      billedAmount: BigInt(Math.round(body.billedAmount)),
      collectedAmount: BigInt(Math.round(body.paidAmount ?? 0)),
      outstandingAmount: BigInt(Math.round(body.receivableAmount)),
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      status: MOCK_TO_DB_STATUS[body.status] ?? "OUTSTANDING",
      isLongOverdue: body.status === "OVERDUE",
    },
    include: INCLUDE,
  });

  // 변경이력은 클라이언트 record()가 /api/audit-log로 남긴다(중복 방지).
  const invMap = await invoiceNumberMap();
  return Response.json({ ok: true, receivable: toReceivable(created, invMap) });
}
