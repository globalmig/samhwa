import { COMPANY_INFO } from "./mock";

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

function buildInvoiceHtml(target: FeeInvoiceTarget): string {
  const isSettlement = target.feeCategory === "SETTLEMENT";
  const periodLabel = isSettlement ? "정산대상기간" : "당해사업연도";
  const periodRange = `${fmtDotPad(target.startDate)}~${fmtDotPad(target.endDate)}`;
  const titleWork = isSettlement ? "위탁정산수수료" : "연차상시점검 수수료";
  const title = `${esc(target.agencyFullName)} 전담과제 ${isSettlement ? "위탁정산수수료" : "연차상시점검 수수료"} 청구의 건`;
  const bodyLine2 = isSettlement
    ? `당 회계법인은 ${esc(target.agencyFullName)}과 체결한 "사업비 위탁정산업무 협약"에 따라 사업비 위탁정산수수료를 아래와 같이 청구하오니 기한내 처리하여 주시고 사업비 사용실적에 반영하여주시기 바랍니다.`
    : `당 회계법인은 ${esc(target.agencyFullName)}과 체결한 "사업비 위탁정산업무 협약"에 따라 사업비 연차상시점검 수수료를 아래와 같이 청구하오니 기한내 처리하여 주시고 사업비 사용실적에 반영하여주시기 바랍니다.`;
  const feeSectionTitle = isSettlement ? "위탁정산수수료(VAT 포함 금액)" : "연차상시점검 수수료";
  const feeTotalLabel = isSettlement ? "정산수수료" : "연차상시점검 수수료";
  const feeStdLabel = isSettlement ? "정산수수료 표준액" : "수수료 표준액";
  const standardFee = target.totalAmount;
  const surcharge = 0;
  const totalFee = standardFee + surcharge;

  const row = (label: string, value: string) => `
    <div style="display:flex;border-bottom:1px dashed #94a3b8;">
      <div style="width:170px;flex-shrink:0;padding:9px 12px;font-size:13px;font-weight:600;color:#334155;background:#f8fafc;border-right:1px dashed #94a3b8;">${label}</div>
      <div style="flex:1;padding:9px 12px;font-size:13px;color:#1e293b;">${value}</div>
    </div>`;

  return `
  <div style="width:794px;box-sizing:border-box;padding:48px 56px;background:#ffffff;font-family:'Malgun Gothic','맑은 고딕',sans-serif;color:#1e293b;">
    <div style="border-bottom:4px double #1e293b;padding-bottom:10px;">
      <h1 style="margin:0;font-size:26px;font-weight:800;letter-spacing:8px;color:#0f172a;">${esc(COMPANY_INFO.name).split("").join(" ")}</h1>
    </div>
    <p style="margin:8px 0 0;padding-bottom:8px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#64748b;">
      (06097)서울특별시 강남구 봉은사로 407 (삼성동 37-17) 삼화빌딩 8층 &nbsp; ☎ 02-3453-9422~5 &nbsp; FAX: 02-6442-9129
    </p>

    <div style="margin-top:16px;border-top:2px solid #334155;">
      ${row("문 서 번 호", esc(target.docNumber))}
      ${row("발 송 일 자", todayDot())}
      ${row("수&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;신", esc(target.leadInstitutionName))}
      ${row("참&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;조", `총괄책임자:${esc(target.researchLead)} 정산담당자:${esc(target.recipientName)}`)}
      ${row("제&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;목", esc(title))}
    </div>

    <ol style="margin:20px 0 0;padding-left:20px;font-size:13px;line-height:1.9;">
      <li>귀 기관의 일익 번창하심을 기원합니다.</li>
      <li>${bodyLine2}</li>
    </ol>

    <p style="text-align:center;font-size:16px;font-weight:700;letter-spacing:10px;margin:22px 0;">[아 래]</p>

    <div style="margin-bottom:20px;">
      <p style="font-weight:700;font-size:13px;margin:0 0 6px;">■ 대상과제 현황</p>
      <div style="border:1px solid #64748b;">
        ${row("과 제 번 호", esc(target.projectNumber))}
        ${row("과&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;제&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;명", esc(target.projectName))}
        ${row(periodLabel, periodRange)}
        ${row("주관연구개발기관", esc(target.leadInstitutionName))}
        ${row("연 구 책 임 자", esc(target.researchLead))}
        ${row("참 여 기 관 수", `${target.participantCount}개`)}
      </div>
    </div>

    <div style="margin-bottom:24px;">
      <p style="font-weight:700;font-size:13px;margin:0 0 6px;">■ ${feeSectionTitle}</p>
      <table style="width:100%;border-collapse:collapse;border:1px solid #64748b;font-size:13px;">
        <thead>
          <tr style="background:#f1f5f9;">
            <th style="border:1px solid #94a3b8;padding:9px 12px;font-weight:700;">구분</th>
            <th style="border:1px solid #94a3b8;padding:9px 12px;font-weight:700;">금액</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="border:1px solid #94a3b8;padding:9px 12px;text-align:center;">${feeStdLabel}</td>
            <td style="border:1px solid #94a3b8;padding:9px 12px;text-align:right;">${won(standardFee)}</td>
          </tr>
          <tr>
            <td style="border:1px solid #94a3b8;padding:9px 12px;text-align:center;">가산금</td>
            <td style="border:1px solid #94a3b8;padding:9px 12px;text-align:right;">${won(surcharge)}</td>
          </tr>
          <tr style="background:#f8fafc;">
            <td style="border:1px solid #94a3b8;padding:9px 12px;text-align:center;font-weight:700;">${feeTotalLabel}</td>
            <td style="border:1px solid #94a3b8;padding:9px 12px;text-align:right;font-weight:700;">${won(totalFee)}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <p style="font-size:13px;margin:0 0 40px;">■ 입금계좌 : ${esc(COMPANY_INFO.depositAccountNote)}</p>

    <div style="display:flex;justify-content:flex-end;">
      <div style="text-align:right;">
        <p style="font-size:18px;font-weight:700;letter-spacing:6px;margin:0 0 10px;">${esc(COMPANY_INFO.name).split("").join(" ")}</p>
        <div style="display:flex;align-items:center;justify-content:flex-end;gap:10px;">
          <p style="font-size:18px;font-weight:700;margin:0;">대표이사&nbsp;&nbsp;${esc(COMPANY_INFO.ceoName).split("").join(" ")}</p>
          <img src="${window.location.origin}/CEO_stamp.png" alt="대표이사 인" style="width:60px;height:60px;object-fit:contain;" />
        </div>
      </div>
    </div>
  </div>`;
}

// html2canvas/jsPDF는 DOM(캔버스)이 필요한 브라우저 전용 라이브러리라 동적 import로
// 로드한다 (서버 사이드 렌더링 시 번들에 끼어들지 않도록).
export async function generateFeeInvoicePdfDataUrl(target: FeeInvoiceTarget): Promise<string> {
  const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
    import("html2canvas"),
    import("jspdf"),
  ]);

  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.top = "-10000px";
  container.style.left = "0";
  container.innerHTML = buildInvoiceHtml(target);
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

    return pdf.output("datauristring");
  } finally {
    document.body.removeChild(container);
  }
}
