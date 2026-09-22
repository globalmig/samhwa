import { prisma } from "@/lib/db";
import { requireUser, requireWriteAccess, SessionError } from "@/lib/session";
import { toEmailDispatch } from "@/lib/email-dispatch-mapper";
import { writeAuditLog } from "@/lib/audit";
import type { EmailDispatch } from "@/lib/mock";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

// 목록 조회(GET /api/email-dispatches)는 body/noticeSnapshot을 뺀 가벼운 버전만 내려주므로,
// 발송이력 상세 페이지(app/emails/[id]/page.tsx)가 열릴 때 이 건 하나의 전체 내용을 따로 받아온다.
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  try {
    await requireUser();
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }
  const row = await prisma.emailLog.findUnique({ where: { id } });
  if (!row) return Response.json({ ok: false, error: "발송이력을 찾을 수 없습니다." }, { status: 404 });
  return Response.json({ ok: true, emailDispatch: toEmailDispatch(row) });
}

// 발송 시점엔 아직 실제 메일 성공/실패를 모르므로(POST가 status="PENDING"으로 먼저 만들어둔다),
// 메일 발송(fetch)이 끝난 뒤 이 레코드의 status만 SUCCESS/FAILED로 확정하는 데 쓴다 — PATCH를
// status 필드 하나로 좁혀둔 이유는, 이 레코드를 먼저 만들어두는 목적 자체가 "발송 전에 이미 문서
// 번호(noticeSnapshot.docNumber)를 확정해두어, 같은 과제의 다른 참여기관에 대해 거의 동시에 다른
// 발송 모달을 열어 보내도 같은 문서번호를 다시 쓰지 않게" 하는 것이라 — 다른 필드까지 나중에 바뀔
// 일은 없다.
export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  let actor;
  try {
    actor = await requireWriteAccess(["emails", "simple-notices"]);
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }

  let body: Pick<EmailDispatch, "status">;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "잘못된 요청입니다." }, { status: 400 });
  }
  if (body.status !== "SUCCESS" && body.status !== "FAILED" && body.status !== "PENDING") {
    return Response.json({ ok: false, error: "status 값이 올바르지 않습니다." }, { status: 400 });
  }

  const before = await prisma.emailLog.findUnique({ where: { id } });
  if (!before) return Response.json({ ok: false, error: "발송이력을 찾을 수 없습니다." }, { status: 404 });

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.emailLog.update({ where: { id }, data: { status: body.status } });
    await writeAuditLog(tx, {
      actorUserId: actor.userId,
      entityType: "emailDispatch",
      entityId: row.id,
      entityLabel: row.subject,
      action: "UPDATE",
      before: toEmailDispatch(before) as unknown as Record<string, unknown>,
      after: toEmailDispatch(row) as unknown as Record<string, unknown>,
    });
    return row;
  });

  return Response.json({ ok: true, emailDispatch: toEmailDispatch(updated) });
}
