import { prisma } from "@/lib/db";
import { requireUser, requireWriteAccess, SessionError } from "@/lib/session";
import { toEmailDispatch } from "@/lib/email-dispatch-mapper";
import { writeAuditLog } from "@/lib/audit";
import type { EmailDispatch } from "@/lib/mock";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireUser();
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }
  const rows = await prisma.emailLog.findMany({ orderBy: { createdAt: "desc" }, take: 2000 });
  return Response.json({ ok: true, emailDispatches: rows.map(toEmailDispatch) });
}

export async function POST(request: Request) {
  let actor;
  try {
    actor = await requireWriteAccess(["emails", "simple-notices"]);
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }

  let body: Omit<EmailDispatch, "id">;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }
  if (!body.recipientEmail || !body.subject || !body.emailType) {
    return Response.json({ ok: false, error: "수신 이메일, 제목, 발송유형은 필수입니다." }, { status: 400 });
  }

  const created = await prisma.$transaction(async (tx) => {
    const row = await tx.emailLog.create({
      data: {
        emailType: body.emailType,
        toEmail: body.recipientEmail,
        subject: body.subject,
        body: body.body ?? "",
        status: body.status,
        sentAt: new Date(),
        sentBy: actor.userId,
        // batchId는 클라이언트가 UUID가 아닌 문자열("BATCH-...")로 만들어 email_batches를 참조하는
        // 진짜 FK로는 못 쓴다 — extraData 안에 그대로 보존만 한다.
        extraData: JSON.stringify({
          batchId: body.batchId,
          senderName: body.senderName,
          recipientInstitution: body.recipientInstitution,
          projectNumber: body.projectNumber,
          termNumber: body.termNumber,
          feeCategory: body.feeCategory,
          isReverseRequest: body.isReverseRequest,
          attachments: body.attachments,
          noticeSnapshot: body.noticeSnapshot,
        }),
      },
    });
    await writeAuditLog(tx, {
      actorUserId: actor.userId,
      entityType: "emailDispatch",
      entityId: row.id,
      entityLabel: row.subject,
      action: "CREATE",
    });
    return row;
  });

  return Response.json({ ok: true, emailDispatch: toEmailDispatch(created) });
}
