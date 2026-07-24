import { COMPANY_INFO, type AgencyNoticeTemplate } from "./mock";

export interface NoticeEmailStatusRow {
  label: string;
  value: string;
}

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// 이메일 클라이언트는 Tailwind/next-image를 렌더링하지 못하므로, NoticeLetterPreview와
// 동일한 정보를 인라인 스타일의 순수 HTML 테이블로 다시 만들어 발송 본문으로 사용한다.
export function buildNoticeEmailHtml({
  template,
  statusRows,
  docNumber,
  issuedDate,
}: {
  template: AgencyNoticeTemplate;
  statusRows?: NoticeEmailStatusRow[];
  docNumber: string;
  issuedDate: string;
}): string {
  const metaRows: [string, string][] = [
    ["문 서 번 호", docNumber],
    ["시 행 일 자", issuedDate],
    ["수 신", template.recipient || "—"],
    ["참 조", template.reference || "—"],
    ["제 목", template.title || "—"],
  ];

  const metaHtml = metaRows
    .map(
      ([label, value]) => `
      <tr>
        <td style="padding:8px 12px;font-weight:600;color:#475569;white-space:nowrap;border-bottom:1px solid #e2e8f0;width:120px;">${esc(label)}</td>
        <td style="padding:8px 12px;color:#1e293b;border-bottom:1px solid #e2e8f0;">${esc(value)}</td>
      </tr>`
    )
    .join("");

  const bodyIntroHtml = template.bodyIntro
    .map((line) => {
      const legal =
        line === "관련근거" && template.legalBasis
          ? `<div style="padding-left:16px;margin-top:2px;color:#475569;">: ${esc(template.legalBasis)}</div>`
          : "";
      return `<li style="margin-bottom:6px;">${esc(line)}${legal}</li>`;
    })
    .join("");

  const statusHtml =
    statusRows && statusRows.length > 0
      ? `
      <p style="font-weight:700;margin:0 0 6px;">■ 과제현황</p>
      <table style="width:100%;border-collapse:collapse;border:1px solid #94a3b8;margin-bottom:20px;">
        ${statusRows
          .map(
            (row) => `
          <tr>
            <td style="padding:10px 8px;font-size:13px;font-weight:500;color:#334155;border:1px solid #94a3b8;background:#f8fafc;width:190px;">${esc(row.label)}</td>
            <td style="padding:10px 12px;color:#1e293b;border:1px solid #94a3b8;text-align:center;">${esc(row.value)}</td>
          </tr>`
          )
          .join("")}
      </table>`
      : "";

  const scheduleHtml =
    template.scheduleRows.length > 0
      ? `
      <p style="font-weight:700;margin:0 0 6px;">■ 업무수행 시기</p>
      <table style="width:100%;border-collapse:collapse;border:1px solid #94a3b8;margin-bottom:20px;">
        <tr style="background:#f1f5f9;">
          <th style="padding:8px;font-size:13px;border:1px solid #cbd5e1;width:110px;">업무구분</th>
          <th style="padding:8px;font-size:13px;border:1px solid #cbd5e1;">연구기관</th>
          <th style="padding:8px;font-size:13px;border:1px solid #cbd5e1;">회계법인</th>
        </tr>
        ${template.scheduleRows
          .map(
            (row) => `
          <tr>
            <td style="padding:8px;text-align:center;font-weight:500;border:1px solid #cbd5e1;">${esc(row.category)}</td>
            <td style="padding:8px;text-align:center;white-space:pre-line;border:1px solid #cbd5e1;">${esc(row.institutionTask)}</td>
            <td style="padding:8px;text-align:center;white-space:pre-line;border:1px solid #cbd5e1;">${esc(row.firmTask)}</td>
          </tr>`
          )
          .join("")}
      </table>`
      : "";

  const contactHtml =
    template.contactRows.length > 0
      ? `
      <p style="font-weight:700;margin:0 0 6px;">■ 문의사항 연락처</p>
      <table style="width:100%;border-collapse:collapse;border:1px solid #94a3b8;margin-bottom:20px;">
        <tr style="background:#f1f5f9;">
          <th style="padding:8px;font-size:13px;border:1px solid #cbd5e1;">담당자</th>
          <th style="padding:8px;font-size:13px;border:1px solid #cbd5e1;width:150px;">연락처</th>
          <th style="padding:8px;font-size:13px;border:1px solid #cbd5e1;">이메일</th>
        </tr>
        ${template.contactRows
          .map(
            (row) => `
          <tr>
            <td style="padding:8px;text-align:center;font-weight:500;border:1px solid #cbd5e1;">${esc(row.role)}</td>
            <td style="padding:8px;text-align:center;border:1px solid #cbd5e1;">${esc(row.contact)}</td>
            <td style="padding:8px;text-align:center;color:#1d4ed8;border:1px solid #cbd5e1;">${esc(row.email)}</td>
          </tr>`
          )
          .join("")}
      </table>`
      : "";

  const feeHtml = `
    <p style="font-weight:700;margin:0 0 6px;">■ 수수료</p>
    <div style="background:#f1f5f9;padding:12px;margin-bottom:8px;">
      <p style="font-weight:600;margin:0 0 6px;">${esc(template.feeIntro)}</p>
      <ol style="margin:0;padding-left:20px;color:#1d4ed8;">
        ${template.feeRequiredDocs.map((d) => `<li>${esc(d)}</li>`).join("")}
      </ol>
    </div>
    <div style="color:#334155;margin-bottom:20px;">
      ${template.feeNotes.map((n, i) => `<p style="margin:2px 0;${i > 0 ? "padding-left:12px;" : ""}">${i > 0 ? "- " : ""}${esc(n)}</p>`).join("")}
    </div>`;

  const attachmentsHtml =
    template.attachments.length > 0
      ? `
      <p style="font-weight:600;margin:0 0 4px;">[붙임]</p>
      ${template.attachments.map((f, i) => `<p style="margin:1px 0;">붙임 ${i + 1}. ${esc(f.name)}</p>`).join("")}
      <p style="text-align:center;margin-top:16px;">"끝."</p>`
      : "";

  return `
<div style="font-family:'Malgun Gothic','Apple SD Gothic Neo',sans-serif;font-size:14px;color:#1e293b;max-width:720px;margin:0 auto;">
  <div style="padding-bottom:12px;border-bottom:4px double #1e293b;">
    <h1 style="font-size:26px;font-weight:800;letter-spacing:6px;margin:0;">${esc(COMPANY_INFO.name)}</h1>
  </div>
  <p style="font-size:13px;color:#64748b;padding:8px 0;border-bottom:1px solid #e2e8f0;">
    ${esc(COMPANY_INFO.addressLine)} Tel : ${esc(COMPANY_INFO.tel)} Fax : ${esc(COMPANY_INFO.fax)} 담당 : ${esc(COMPANY_INFO.preparedBy)}
  </p>
  <table style="width:100%;border-collapse:collapse;border-top:2px solid #334155;margin-top:16px;margin-bottom:20px;">
    ${metaHtml}
  </table>
  <ol style="padding-left:20px;margin:0 0 20px;">
    ${bodyIntroHtml}
  </ol>
  <p style="text-align:center;font-size:17px;font-weight:700;letter-spacing:8px;margin:20px 0;">- 다 음 -</p>
  ${statusHtml}
  ${scheduleHtml}
  ${contactHtml}
  ${feeHtml}
  ${attachmentsHtml}
  <div style="margin-top:24px;padding-top:20px;border-top:1px dashed #cbd5e1;text-align:right;">
    <p style="font-size:18px;font-weight:700;letter-spacing:4px;margin:0 0 8px;">${esc(COMPANY_INFO.name)}</p>
    <p style="font-size:18px;font-weight:700;margin:0;">대표이사 ${esc(COMPANY_INFO.ceoName)}</p>
  </div>
</div>`;
}
