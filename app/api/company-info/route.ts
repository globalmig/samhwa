import { prisma } from "@/lib/db";
import { requireUser, SessionError } from "@/lib/session";
import { COMPANY_INFO, type CompanyInfo } from "@/lib/mock";
import type { CompanyInfo as PrismaCompanyInfo } from "@prisma/client";

export const runtime = "nodejs";

function toCompanyInfo(row: PrismaCompanyInfo): CompanyInfo {
  return {
    name: row.name,
    addressLine: row.addressLine,
    tel: row.tel,
    fax: row.fax,
    preparedBy: row.preparedBy,
    ceoName: row.ceoName,
    docNumberPrefix: row.docNumberPrefix,
    managerName: row.managerName,
    managerEmail: row.managerEmail,
    managerPhone: row.managerPhone,
    depositAccountNote: row.depositAccountNote,
    stampDataUrl: row.stampDataUrl ?? undefined,
  };
}

// 싱글턴 — 시드에서 이미 1행 만들어두지만, 없는 환경(예: 재시드 전)을 위해 방어적으로 없으면 만든다.
async function ensureRow() {
  const existing = await prisma.companyInfo.findFirst();
  if (existing) return existing;
  return prisma.companyInfo.create({
    data: {
      name: COMPANY_INFO.name, addressLine: COMPANY_INFO.addressLine, tel: COMPANY_INFO.tel, fax: COMPANY_INFO.fax,
      preparedBy: COMPANY_INFO.preparedBy, ceoName: COMPANY_INFO.ceoName, docNumberPrefix: COMPANY_INFO.docNumberPrefix,
      managerName: COMPANY_INFO.managerName, managerEmail: COMPANY_INFO.managerEmail, managerPhone: COMPANY_INFO.managerPhone,
      depositAccountNote: COMPANY_INFO.depositAccountNote, stampDataUrl: COMPANY_INFO.stampDataUrl ?? null,
    },
  });
}

export async function GET() {
  const row = await ensureRow();
  return Response.json({ ok: true, companyInfo: toCompanyInfo(row) });
}

export async function PATCH(request: Request) {
  try {
    await requireUser();
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }

  let body: Partial<CompanyInfo>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }

  const existing = await ensureRow();
  const updated = await prisma.companyInfo.update({
    where: { id: existing.id },
    data: {
      name: body.name ?? undefined,
      addressLine: body.addressLine ?? undefined,
      tel: body.tel ?? undefined,
      fax: body.fax ?? undefined,
      preparedBy: body.preparedBy ?? undefined,
      ceoName: body.ceoName ?? undefined,
      docNumberPrefix: body.docNumberPrefix ?? undefined,
      managerName: body.managerName ?? undefined,
      managerEmail: body.managerEmail ?? undefined,
      managerPhone: body.managerPhone ?? undefined,
      depositAccountNote: body.depositAccountNote ?? undefined,
      stampDataUrl: "stampDataUrl" in body ? (body.stampDataUrl ?? null) : undefined,
    },
  });

  // 변경이력은 클라이언트 record()가 /api/audit-log로 남긴다(중복 방지).
  return Response.json({ ok: true, companyInfo: toCompanyInfo(updated) });
}
