import { prisma } from "@/lib/db";
import { requireUser, requireWriteAccess, SessionError } from "@/lib/session";
import { toFeeInvoiceTemplate } from "@/lib/notice-template-mapper";
import { writeAuditLog } from "@/lib/audit";
import type { FeeInvoiceTemplate, FeeInvoiceTemplateEntry } from "@/lib/mock";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireUser();
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }
  const rows = await prisma.feeInvoiceTemplate.findMany({ orderBy: { createdAt: "asc" } });
  return Response.json({ ok: true, templates: rows.map(toFeeInvoiceTemplate) });
}

export async function POST(request: Request) {
  let actor;
  try {
    actor = await requireWriteAccess("notice-templates");
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }
  let body: { category: FeeInvoiceTemplateEntry["category"]; name: string; content: FeeInvoiceTemplate };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }
  if (!body.category || !body.name || !body.content) {
    return Response.json({ ok: false, error: "카테고리, 이름, 내용은 필수입니다." }, { status: 400 });
  }

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.feeInvoiceTemplate.create({
      data: { category: body.category, name: body.name, content: JSON.stringify(body.content), isDefault: false },
    });
    await writeAuditLog(tx, {
      actorUserId: actor.userId,
      entityType: "feeInvoiceTemplate",
      entityId: row.id,
      entityLabel: row.name,
      action: "CREATE",
    });
    return row;
  });
  return Response.json({ ok: true, template: toFeeInvoiceTemplate(created) });
}
