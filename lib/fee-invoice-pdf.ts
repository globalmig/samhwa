import { COMPANY_INFO, type CompanyInfo, type FeeInvoiceTemplate } from "./mock";
import { splitVatInclusive } from "./utils";

// 수수료 청구서(위탁정산 / 연차상시) PDF 생성.
// 실제 대표이사 직인 이미지(public/CEO_stamp.png)는 공문 발송(NoticeLetterPreview)에서 이미
// 쓰이고 있는 사내 자산이라 여기서도 동일하게 재사용한다.

export interface FeeInvoiceTarget {
  kind: "REGULAR" | "REVERSE" | "OTHER";
  projectNumber: string;
  projectName: string;
  leadInstitutionName: string;
  agencyShortName: string;
  agencyFullName: string;
  termYear: number;
  termNumber: number;
  recipientName: string;
  feeCategory: "ANNUAL" | "SETTLEMENT";
  supplyAmount: number;
  taxAmount: number;
  totalAmount: number;
  startDate: string;
  endDate: string;
  researchLead: string;
  participantCount: number;
  docNumber: string;
}

function fmtDotPad(s: string): string {
  if (!s) return "";
  const d = new Date(`${s}T00:00:00`);
  if (isNaN(d.getTime())) return "";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}.${mm}.${dd}`;
}

function todayDot(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}.${mm}.${dd}`;
}

function won(n: number): string {
  return `${Math.round(n).toLocaleString()}원`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// 템플릿에 저장된 "{agency}" 자리표시자를 실제 전담기관 정식명칭으로 치환한다.
function applyAgency(s: string, agencyFullName: string): string {
  return s.split("{agency}").join(agencyFullName);
}

// 화면 미리보기와 PDF 캡처가 항상 같은 내용을 보여주도록 공유하는 HTML 빌더.
// (PDF 뷰어가 없는 환경/브라우저 정책 때문에 <iframe>으로 최종 PDF를 못 띄우는 경우가 있어,
// 청구서 첨부는 이 HTML을 모달에 직접 렌더링해서 미리보기를 보여준다.)
export function buildFeeInvoiceHtml(target: FeeInvoiceTarget, content: FeeInvoiceTemplate, companyInfo: CompanyInfo = COMPANY_INFO): string {
  const periodLabel = content.periodLabel;
  const periodRange = `${fmtDotPad(target.startDate)}~${fmtDotPad(target.endDate)}`;
  const title = applyAgency(content.title, target.agencyFullName);
  const bodyLines = content.bodyIntro.map((line) => applyAgency(line, target.agencyFullName));
  const feeSectionTitle = content.feeSectionTitle;
  const feeTotalLabel = content.feeTotalLabel;
  const feeStdLabel = content.feeStdLabel;
  const surchargeLabel = content.surchargeLabel;
  const totalFee = target.totalAmount;
  const { supplyAmount, taxAmount } = splitVatInclusive(totalFee);

  const row = (label: string, value: string) => `
    <div style="display:flex;border-bottom:1px dashed #94a3b8;">
      <div style="width:170px;flex-shrink:0;padding:7px 12px;font-size:13px;font-weight:600;color:#334155;background:#f8fafc;border-right:1px dashed #94a3b8;">${label}</div>
      <div style="flex:1;padding:7px 12px;font-size:13px;color:#1e293b;">${value}</div>
    </div>`;

  return `
  <div style="width:794px;box-sizing:border-box;padding:36px 56px;background:#ffffff;font-family:'Malgun Gothic','맑은 고딕',sans-serif;color:#1e293b;">
    <div style="border-bottom:4px double #1e293b;padding-bottom:10px;">
      <h1 style="margin:0;font-size:26px;font-weight:800;letter-spacing:8px;color:#0f172a;">${esc(companyInfo.name).split("").join(" ")}</h1>
    </div>
    <p style="margin:8px 0 0;padding-bottom:8px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#64748b;">
      (06097)서울특별시 강남구 봉은사로 407 (삼성동 37-17) 삼화빌딩 8층 &nbsp; ☎ 02-3453-9422~5 &nbsp; FAX: 02-6442-9129
    </p>

    <div style="margin-top:14px;border-top:2px solid #334155;">
      ${row("문 서 번 호", esc(target.docNumber))}
      ${row("발 송 일 자", todayDot())}
      ${row("수&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;신", esc(target.leadInstitutionName))}
      ${row("참&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;조", `총괄책임자:${esc(target.researchLead)} 정산담당자:${esc(target.recipientName)}`)}
      ${row("제&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;목", esc(title))}
    </div>

    <ol style="margin:16px 0 0;padding-left:20px;font-size:13px;line-height:1.75;">
      ${bodyLines.map((line) => `<li>${esc(line)}</li>`).join("")}
    </ol>

    <p style="text-align:center;font-size:16px;font-weight:700;letter-spacing:10px;margin:16px 0;">[아 래]</p>

    <div style="margin-bottom:14px;">
      <p style="font-weight:700;font-size:13px;margin:0 0 6px;">■ 대상과제 현황</p>
      <div style="border:1px solid #64748b;">
        ${row("과 제 번 호", esc(target.projectNumber))}
        ${row("과&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;제&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;명", esc(target.projectName))}
        ${row(esc(periodLabel), periodRange)}
        ${row("주관연구개발기관", esc(target.leadInstitutionName))}
        ${row("연 구 책 임 자", esc(target.researchLead))}
        ${row("참 여 기 관 수", `${target.participantCount}개`)}
      </div>
    </div>

    <div style="margin-bottom:16px;">
      <p style="font-weight:700;font-size:13px;margin:0 0 6px;">■ ${esc(feeSectionTitle)}</p>
      <table style="width:100%;border-collapse:collapse;border:1px solid #64748b;font-size:13px;">
        <thead>
          <tr style="background:#f1f5f9;">
            <th style="border:1px solid #94a3b8;padding:7px 12px;font-weight:700;">구분</th>
            <th style="border:1px solid #94a3b8;padding:7px 12px;font-weight:700;">금액</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="border:1px solid #94a3b8;padding:7px 12px;text-align:center;">${esc(feeStdLabel)}</td>
            <td style="border:1px solid #94a3b8;padding:7px 12px;text-align:right;">${won(supplyAmount)}</td>
          </tr>
          <tr>
            <td style="border:1px solid #94a3b8;padding:7px 12px;text-align:center;">${esc(surchargeLabel)}</td>
            <td style="border:1px solid #94a3b8;padding:7px 12px;text-align:right;">${won(taxAmount)}</td>
          </tr>
          <tr style="background:#f8fafc;">
            <td style="border:1px solid #94a3b8;padding:7px 12px;text-align:center;font-weight:700;">${esc(feeTotalLabel)}</td>
            <td style="border:1px solid #94a3b8;padding:7px 12px;text-align:right;font-weight:700;">${won(totalFee)}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <p style="font-size:13px;margin:0 0 24px;">■ 입금계좌 : ${esc(companyInfo.depositAccountNote)}</p>

    <div style="display:flex;justify-content:flex-end;">
      <div style="text-align:left;">
        <p style="font-size:18px;font-weight:700;letter-spacing:6px;margin:0 0 10px;">${esc(companyInfo.name).split("").join(" ")}</p>
        <div style="display:flex;align-items:center;justify-content:flex-start;gap:10px;">
          <p style="font-size:18px;font-weight:700;margin:0;">대표이사&nbsp;&nbsp;${esc(companyInfo.ceoName).split("").join(" ")}</p>
          <img src="${companyInfo.stampDataUrl || `${window.location.origin}/CEO_stamp.png`}" alt="대표이사 인" style="width:60px;height:60px;object-fit:contain;" />
        </div>
      </div>
    </div>
  </div>`;
}

// html2canvas/jsPDF는 DOM(캔버스)이 필요한 브라우저 전용 라이브러리라 동적 import로
// 로드한다 (서버 사이드 렌더링 시 번들에 끼어들지 않도록).
export async function generateFeeInvoicePdfDataUrl(target: FeeInvoiceTarget, content: FeeInvoiceTemplate, companyInfo: CompanyInfo = COMPANY_INFO): Promise<string> {
  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);

  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.top = "-10000px";
  container.style.left = "0";
  container.innerHTML = buildFeeInvoiceHtml(target, content, companyInfo);
  document.body.appendChild(container);

  // 폰트/이미지 로딩이 끝난 뒤 캡처하도록 한 프레임 대기.
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

  try {
    const canvas = await html2canvas(container.firstElementChild as HTMLElement, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
    });

    const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
    const pageWidth = 210;
    const pageHeight = 297;
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    const imgData = canvas.toDataURL("image/png");

    let heightLeft = imgHeight;
    let position = 0;
    pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }

    // jsPDF의 datauristring 출력은 항상 "data:application/pdf;filename=...;base64,..."처럼
    // filename 파라미터를 끼워 넣는데, 이 비표준 형태 때문에 <iframe> 내장 PDF 뷰어가 빈 화면만
    // 보여주고 메일 발송 API(app/api/notices/send)의 data URL 파싱 정규식도 매치에 실패한다.
    // base64 본문만 뽑아 표준 형태로 다시 감싼다.
    const raw = pdf.output("datauristring");
    const base64 = raw.slice(raw.indexOf(",") + 1);
    return `data:application/pdf;base64,${base64}`;
  } finally {
    document.body.removeChild(container);
  }
}
