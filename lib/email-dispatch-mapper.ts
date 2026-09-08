import type { EmailLog } from "@prisma/client";
import type { EmailDispatch } from "./mock";
import { formatKST } from "./utils";

// EmailLog 실컬럼으로 표현 안 되는 나머지 필드(발신인 표시명, 기관명, 클라이언트 batchId 문자열,
// 과제번호·연차, 첨부파일명, 정산절차 안내 공문 서식 스냅샷 등)는 extraData JSON에 들어있다.
type ExtraData = Partial<
  Pick<EmailDispatch, "batchId" | "senderName" | "recipientInstitution" | "projectNumber" | "termNumber" | "feeCategory" | "isReverseRequest" | "attachments" | "noticeSnapshot">
>;

export function toEmailDispatch(row: EmailLog): EmailDispatch {
  let extra: ExtraData = {};
  if (row.extraData) {
    try {
      const parsed = JSON.parse(row.extraData) as ExtraData;
      if (parsed && typeof parsed === "object") extra = parsed;
    } catch {
      // 알 수 없는 형식이면 조용히 무시 — 실컬럼(수신 이메일·제목·본문·상태 등)만으로도 화면에 표시 가능.
    }
  }
  return {
    id: row.id,
    batchId: extra.batchId ?? row.batchId ?? "",
    sentAt: formatKST(row.sentAt ?? row.createdAt),
    senderName: extra.senderName ?? "",
    recipientInstitution: extra.recipientInstitution ?? "",
    recipientEmail: row.toEmail,
    subject: row.subject,
    projectNumber: extra.projectNumber,
    termNumber: extra.termNumber,
    emailType: row.emailType as EmailDispatch["emailType"],
    feeCategory: extra.feeCategory,
    isReverseRequest: extra.isReverseRequest,
    attachments: extra.attachments ?? [],
    status: row.status as EmailDispatch["status"],
    body: row.body || undefined,
    noticeSnapshot: extra.noticeSnapshot,
  };
}
