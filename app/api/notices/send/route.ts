import nodemailer from "nodemailer";

// nodemailer는 Node의 net/tls 모듈이 필요해 Edge 런타임에서 동작하지 않는다.
export const runtime = "nodejs";

const SMTP_HOST = process.env.HIWORKS_SMTP_HOST || "smtp.hiworks.com";
const SMTP_PORT = Number(process.env.HIWORKS_SMTP_PORT || 465);

interface MailAttachment {
  filename: string;
  /** data:<mime>;base64,<...> 형식의 Data URL */
  dataUrl: string;
}

interface SendNoticeBody {
  senderEmail: string;
  senderPassword: string;
  senderName?: string;
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
  let body: SendNoticeBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const { senderEmail, senderPassword, senderName, to, subject, html, text, attachments } = body;

  if (!senderEmail || !senderPassword) {
    return Response.json(
      { ok: false, error: "발신 계정(하이웍스) 정보가 등록되어 있지 않습니다. 관리자 > 사용자 관리에서 먼저 등록해주세요." },
      { status: 400 }
    );
  }
  if (!Array.isArray(to) || to.length === 0) {
    return Response.json({ ok: false, error: "수신 이메일이 없습니다." }, { status: 400 });
  }
  if (!subject) {
    return Response.json({ ok: false, error: "메일 제목이 없습니다." }, { status: 400 });
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: senderEmail, pass: senderPassword },
  });

  const mappedAttachments = (attachments ?? []).flatMap((a) => {
    const parsed = parseDataUrl(a.dataUrl);
    if (!parsed) return [];
    return [{ filename: a.filename, content: parsed.content, contentType: parsed.contentType }];
  });

  try {
    const info = await transporter.sendMail({
      from: senderName ? `"${senderName}" <${senderEmail}>` : senderEmail,
      to: to.join(", "),
      subject,
      text,
      html,
      attachments: mappedAttachments,
    });
    return Response.json({ ok: true, messageId: info.messageId });
  } catch (err) {
    return Response.json({ ok: false, error: friendlyError(err) }, { status: 502 });
  }
}
