import nodemailer from "nodemailer";
import { prisma } from "@/lib/db";
import { requireWriteAccess, SessionError } from "@/lib/session";

// nodemailer는 Node의 net/tls 모듈이 필요해 Edge 런타임에서 동작하지 않는다.
export const runtime = "nodejs";

const SMTP_HOST = process.env.HIWORKS_SMTP_HOST || "smtp.hiworks.com";
const SMTP_PORT = Number(process.env.HIWORKS_SMTP_PORT || 465);

// 남용 방지 가드레일 — 무단 발송 시 하이웍스 계정이 대량/스팸 발송에 쓰이는 걸 막는다.
const MAX_RECIPIENTS = 30;
const MAX_ATTACHMENTS = 10;
const MAX_ATTACHMENT_TOTAL_BYTES = 20 * 1024 * 1024; // 20MB — hiworks SMTP 실측 상한보다 여유있게
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1시간
const RATE_LIMIT_MAX_SENDS = 30; // 사용자당 1시간에 30건까지
const EMAIL_RE = /^[^\s<>"',;\r\n]+@[^\s<>"',;\r\n]+\.[^\s<>"',;\r\n]+$/;

interface MailAttachment {
  filename: string;
  /** data:<mime>;base64,<...> 형식의 Data URL */
  dataUrl: string;
}

interface SendNoticeBody {
  senderName?: string;
  /** 실제 로그인(인증) 계정과 다른 주소를 발신인으로 보이게 할 때만 지정 — 예: 정산절차 안내
   *  공문은 담당자 개인 하이웍스 계정으로 인증하되, 수신자에게는 전담기관 공용메일 주소로 보인다.
   *  생략하면 발신자 본인의 하이웍스 계정이 그대로 발신 주소로 쓰인다. */
  fromEmail?: string;
  to: string[];
  subject: string;
  html?: string;
  text?: string;
  attachments?: MailAttachment[];
}

function parseDataUrl(dataUrl: string): { content: Buffer; contentType?: string } | null {
  const match = /^data:([^;]+);base64,([\s\S]*)$/.exec(dataUrl);
  if (!match) return null;
  return { content: Buffer.from(match[2], "base64"), contentType: match[1] };
}

function friendlyError(err: unknown): string {
  const code = (err as { code?: string } | null)?.code;
  if (code === "EAUTH") return "하이웍스 계정 인증에 실패했습니다. 등록된 이메일과 메일 전용 비밀번호를 확인해주세요.";
  if (code === "ECONNECTION" || code === "ETIMEDOUT" || code === "ESOCKET") {
    return "하이웍스 메일 서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.";
  }
  return err instanceof Error ? err.message : "알 수 없는 오류로 메일 발송에 실패했습니다.";
}

export async function POST(request: Request) {
  // 발신 계정 인증정보는 클라이언트가 아니라 로그인 세션 기준으로 서버가 직접 DB에서 조회한다 —
  // 과거에는 브라우저가 하이웍스 메일 비밀번호를 평문으로 들고 있다가 그대로 요청에 실어 보냈다.
  // 로그인 여부뿐 아니라 "이메일/간이공지" 발송 화면에 대한 쓰기 권한도 함께 강제한다.
  let session;
  try {
    session = await requireWriteAccess(["emails", "simple-notices"]);
  } catch (err) {
    if (err instanceof SessionError) return Response.json({ ok: false, error: err.message }, { status: err.status });
    throw err;
  }

  let body: SendNoticeBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const { senderName, fromEmail, to, subject, html, text, attachments } = body;

  if (!Array.isArray(to) || to.length === 0) {
    return Response.json({ ok: false, error: "수신 이메일이 없습니다." }, { status: 400 });
  }
  if (to.length > MAX_RECIPIENTS) {
    return Response.json({ ok: false, error: `수신자는 한 번에 최대 ${MAX_RECIPIENTS}명까지 지정할 수 있습니다.` }, { status: 400 });
  }
  if (to.some((addr) => typeof addr !== "string" || !EMAIL_RE.test(addr))) {
    return Response.json({ ok: false, error: "수신 이메일 형식이 올바르지 않습니다." }, { status: 400 });
  }
  if (!subject) {
    return Response.json({ ok: false, error: "메일 제목이 없습니다." }, { status: 400 });
  }
  if ((attachments?.length ?? 0) > MAX_ATTACHMENTS) {
    return Response.json({ ok: false, error: `첨부파일은 최대 ${MAX_ATTACHMENTS}개까지 첨부할 수 있습니다.` }, { status: 400 });
  }

  const mappedAttachments = (attachments ?? []).flatMap((a) => {
    const parsed = parseDataUrl(a.dataUrl);
    if (!parsed) return [];
    return [{ filename: a.filename, content: parsed.content, contentType: parsed.contentType }];
  });
  const attachmentTotalBytes = mappedAttachments.reduce((sum, a) => sum + a.content.length, 0);
  if (attachmentTotalBytes > MAX_ATTACHMENT_TOTAL_BYTES) {
    return Response.json(
      { ok: false, error: `첨부파일 전체 용량은 ${Math.floor(MAX_ATTACHMENT_TOTAL_BYTES / (1024 * 1024))}MB를 초과할 수 없습니다.` },
      { status: 400 }
    );
  }

  const rateLimitWindowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
  const recentSendCount = await prisma.auditLog.count({
    where: { userId: session.userId, resourceType: "notice-mail-send", createdAt: { gte: rateLimitWindowStart } },
  });
  if (recentSendCount >= RATE_LIMIT_MAX_SENDS) {
    return Response.json(
      { ok: false, error: "메일 발송 횟수 제한을 초과했습니다. 잠시 후 다시 시도해주세요." },
      { status: 429 }
    );
  }

  const sender = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!sender?.hiworksEmail || !sender?.hiworksMailPassword) {
    return Response.json(
      { ok: false, error: "발신 계정(하이웍스) 정보가 등록되어 있지 않습니다. 관리자 > 사용자 관리에서 먼저 등록해주세요." },
      { status: 400 }
    );
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: sender.hiworksEmail, pass: sender.hiworksMailPassword },
  });

  let result: { ok: true; messageId: string } | { ok: false; error: string };
  try {
    const displayEmail = fromEmail || sender.hiworksEmail;
    const info = await transporter.sendMail({
      from: senderName ? `"${senderName}" <${displayEmail}>` : displayEmail,
      to: to.join(", "),
      subject,
      text,
      html,
      attachments: mappedAttachments,
    });
    result = { ok: true, messageId: info.messageId };
  } catch (err) {
    result = { ok: false, error: friendlyError(err) };
  }

  // 발송 결과는 클라이언트가 별도로 호출하는 이력 API(/api/email-dispatches) 여부와 무관하게
  // 서버가 직접 남긴다 — 그쪽은 화면 흐름을 벗어난 직접 호출(curl 등)에서는 아예 호출되지 않는다.
  await prisma.auditLog.create({
    data: {
      userId: session.userId,
      action: result.ok ? "CREATE" : "UPDATE",
      resourceType: "notice-mail-send",
      newValues: JSON.stringify({
        to,
        subject,
        attachmentCount: mappedAttachments.length,
        attachmentTotalBytes,
        status: result.ok ? "SUCCESS" : "FAILED",
        error: result.ok ? undefined : result.error,
      }),
    },
  });

  if (result.ok) {
    return Response.json(result);
  }
  return Response.json({ ok: false, error: result.error }, { status: 502 });
}
