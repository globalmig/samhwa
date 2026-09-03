"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { FiChevronRight, FiMail, FiX } from "react-icons/fi";
import { useStore, addEmailDispatch, updateStandardAttachment } from "@/lib/store";
import { EMPTY_FEE_INVOICE_TEMPLATE } from "@/lib/mock";
import Modal from "@/components/common/Modal";
import { getCurrentUser } from "@/lib/auth";
import { generateFeeInvoicePdfDataUrl, buildFeeInvoiceHtml, type FeeInvoiceTarget } from "@/lib/fee-invoice-pdf";
import { nowKST, todayKST } from "@/lib/utils";

// 수수료 공문 발송(연차상시/위탁정산/역발행/기타) — 청구서 PDF·첨부파일까지 갖춰 실제 메일을 보낸다.
// 수수료청구관리 목록과 과제 상세 페이지 양쪽에서 똑같이 쓸 수 있도록 공용 컴포넌트로 뺐다.

export function fmtDot(s: string): string {
  if (!s) return "";
  const d = new Date(`${s}T00:00:00`);
  if (isNaN(d.getTime())) return "";
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}.`;
}

export function parseEmails(raw: string): string[] {
  return raw.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
}

export function generateBatchId(): string {
  return `BATCH-${todayKST().replace(/-/g, "")}-${Math.floor(Math.random() * 9000) + 1000}`;
}

export function generateDocNumber(): string {
  const yyyymm = todayKST().slice(0, 7).replace(/-/g, "");
  const seq = String(Math.floor(Math.random() * 9000) + 1000);
  return `E${yyyymm}-${seq}`;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export type DispatchTarget = {
  kind:                "REGULAR" | "REVERSE" | "OTHER";
  projectNumber:       string;
  projectName:         string;
  leadInstitutionName: string;
  agencyShortName:     string;
  termYear:            number;
  termNumber:          number;
  recipientEmail:      string;
  recipientName:       string;
  feeCategory:         "ANNUAL" | "SETTLEMENT";
  supplyAmount:        number;
  taxAmount:           number;
  totalAmount:         number;
  startDate:           string; // 당해사업연도
  endDate:             string;
  stageStartDate:      string; // 단계사업연도
  stageEndDate:        string;
  // 청구서 PDF 전용 — 공문 본문(제목/본문)엔 안 쓰이던 값들이지만 청구서 양식엔 필요하다.
  researchLead:        string;
  agencyFullName:      string; // 전담기관 정식명칭 (예: "한국산업기술기획평가원") — 약칭과 별개
  participantCount:    number;
  docNumber:           string;
};

export type DispatchChoice =
  | { kind: "REGULAR" | "REVERSE"; feeCategory: "ANNUAL" | "SETTLEMENT" }
  | { kind: "OTHER" }
  | { kind: "DOC_REQUEST" | "PAYMENT_REMINDER" };

// ── DispatchDropdown (공문 발송 드롭다운 버튼) ────────────────
// 메뉴를 버튼의 형제로 두면(position: absolute) 수수료청구관리 목록의 가로/세로 스크롤 컨테이너나
// 과제 상세의 rounded-xl overflow-hidden 카드 안에서 메뉴 아래쪽이 그 경계에 잘려 보인다 — 그래서
// fixed 좌표를 직접 계산해 document.body에 포탈로 그린다(이 파일의 InfoEditModal 등과 별개로,
// 과제 상세 페이지의 explainPopover와 동일한 해법).
const DISPATCH_MENU_WIDTH = 190;

export function DispatchDropdown({
  onSelect,
}: {
  onSelect: (choice: DispatchChoice) => void;
}) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  function toggle(e: React.MouseEvent<HTMLButtonElement>) {
    if (pos) { setPos(null); return; }
    const rect = e.currentTarget.getBoundingClientRect();
    setPos({ top: rect.bottom + 4, left: Math.max(8, rect.right - DISPATCH_MENU_WIDTH) });
  }

  function pick(choice: DispatchChoice) {
    setPos(null);
    onSelect(choice);
  }

  return (
    <div className="relative inline-block">
      <button
        onClick={toggle}
        className="flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded transition-colors whitespace-nowrap bg-teal-50 text-teal-700 hover:bg-teal-100 border border-teal-200"
      >
        <FiMail size={11} />
        공문발송
        <FiChevronRight size={10} className={`transition-transform ${pos ? "rotate-90" : ""}`} />
      </button>
      {pos && createPortal(
        <>
          <div className="fixed inset-0 z-40" onClick={() => setPos(null)} />
          <div
            className="fixed z-50 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden"
            style={{ top: pos.top, left: pos.left, width: DISPATCH_MENU_WIDTH }}
          >
            <button
              className="w-full text-left px-4 py-2.5 text-xs text-slate-700 hover:bg-teal-50 hover:text-teal-800 transition-colors"
              onClick={() => pick({ kind: "REGULAR", feeCategory: "ANNUAL" })}
            >
              연차상시점검 수수료 공문
            </button>
            <button
              className="w-full text-left px-4 py-2.5 text-xs text-slate-700 hover:bg-teal-50 hover:text-teal-800 transition-colors border-t border-slate-100"
              onClick={() => pick({ kind: "REGULAR", feeCategory: "SETTLEMENT" })}
            >
              위탁정산 수수료 공문
            </button>
            <button
              className="w-full text-left px-4 py-2.5 text-xs text-slate-700 hover:bg-teal-50 hover:text-teal-800 transition-colors border-t border-slate-100"
              onClick={() => pick({ kind: "REVERSE", feeCategory: "ANNUAL" })}
            >
              역발행 수수료 공문
            </button>
            <button
              className="w-full text-left px-4 py-2.5 text-xs text-slate-700 hover:bg-teal-50 hover:text-teal-800 transition-colors border-t border-slate-100"
              onClick={() => pick({ kind: "OTHER" })}
            >
              기타 공문
            </button>
            <button
              className="w-full text-left px-4 py-2.5 text-xs text-slate-700 hover:bg-teal-50 hover:text-teal-800 transition-colors border-t border-slate-100"
              onClick={() => pick({ kind: "DOC_REQUEST" })}
            >
              계산서발행 서류 요청
            </button>
            <button
              className="w-full text-left px-4 py-2.5 text-xs text-slate-700 hover:bg-teal-50 hover:text-teal-800 transition-colors border-t border-slate-100"
              onClick={() => pick({ kind: "PAYMENT_REMINDER" })}
            >
              입금 확인 요청
            </button>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}

// ── StandardAttachmentsPanel (사업자등록증 등 기본 첨부서류 일괄 관리) ──
// 여기서 파일을 바꾸면 이후 새로 여는 모든 공문 발송창에 기본값으로 반영된다.
function StandardAttachmentsPanel() {
  const { standardAttachments } = useStore();

  async function handleReplace(id: string, files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    const fileDataUrl = await fileToDataUrl(file);
    updateStandardAttachment(id, { fileDataUrl, updatedAt: todayKST() });
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 space-y-2">
      <p className="text-[11px] text-slate-500">여기서 교체한 파일은 이후 새로 작성하는 모든 공문에 기본으로 첨부됩니다.</p>
      {standardAttachments.map((a) => (
        <div key={a.id} className="flex items-center justify-between gap-3 bg-white rounded-lg border border-slate-200 px-3 py-2">
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-700 truncate">{a.name}</p>
            <p className="text-[10px] text-slate-400">
              {a.fileDataUrl ? `파일 등록됨 · ${a.updatedAt} 수정` : "등록된 파일 없음"}
            </p>
          </div>
          <label className="shrink-0 text-[11px] font-medium text-teal-600 hover:text-teal-700 cursor-pointer whitespace-nowrap">
            파일 선택
            <input type="file" className="hidden" onChange={(e) => { handleReplace(a.id, e.target.files); e.target.value = ""; }} />
          </label>
        </div>
      ))}
    </div>
  );
}

// ── DispatchModal (공문 발송 모달) ────────────────────────────
type AttachmentRow = { name: string; checked: boolean; dataUrl?: string; previewHtml?: string };

export default function DispatchModal({ target, onClose }: { target: DispatchTarget; onClose: () => void }) {
  const { standardAttachments, users, feeInvoiceTemplates, companyInfo } = useStore();
  // getCurrentUser()는 로그인 시점 스냅샷이라 이후 등록된 하이웍스 계정 정보가 반영되지 않으므로,
  // 실시간 store에서 같은 id의 사용자 레코드를 다시 찾아 발신 계정으로 사용한다.
  const senderUser = users.find((u) => u.id === getCurrentUser()?.id) ?? null;
  const canSendMail = !!senderUser?.hiworksEmail && !!senderUser?.hiworksMailPassword;
  const isOther = target.kind === "OTHER";
  const termLabel = `${target.termNumber}연차`;

  const stageRange = target.stageStartDate && target.stageEndDate
    ? `${fmtDot(target.stageStartDate)} ~ ${fmtDot(target.stageEndDate)}`
    : "-";
  const termRange = target.startDate && target.endDate
    ? `${fmtDot(target.startDate)}～${fmtDot(target.endDate)}`
    : "-";

  function buildSubject(cat: "ANNUAL" | "SETTLEMENT"): string {
    const label = cat === "ANNUAL" ? "연차상시점검 수수료" : "위탁정산 수수료";
    const suffix = target.kind === "REVERSE" ? "역발행 요청" : "청구서";
    return `[${target.projectNumber}] ${target.agencyShortName} 전담과제 ${label} ${suffix}_${target.leadInstitutionName}`;
  }

  function buildBody(cat: "ANNUAL" | "SETTLEMENT"): string {
    const compact = cat === "ANNUAL" ? "연차상시점검수수료" : "위탁정산수수료";
    if (target.kind === "REVERSE") {
      return `안녕하세요.
${companyInfo.name}입니다.

수수료 역발행 관련하여 필요 서류 송부드립니다.
첨부하여드린 청구서 참고하셔서 역발행하여 주시기 바랍니다.

또한 역발행 하실 때 과제 정보 확인을 위해
품목에 연구책임자님 성함 또는 과제명을 입력하여 주시기 바랍니다.


감사합니다.`;
    }
    return `안녕하세요.
${target.leadInstitutionName} 담당자님,

${target.projectName} 과제의 ${termLabel} ${compact} 청구서를 첨부하여 안내 드립니다.

【 청구 내역 】
- 과제번호 : ${target.projectNumber}
- 과    제 : ${target.projectName}
- 대    상 : ${termLabel} ${compact}
- 단계사업연도 : ${stageRange}
- 당해사업연도 : ${termRange}
- 공급가액 : ${target.supplyAmount > 0 ? target.supplyAmount.toLocaleString() + "원" : "별도 협의"}
- 부  가  세 : ${target.taxAmount   > 0 ? target.taxAmount.toLocaleString()   + "원" : ""}
- 합    계 : ${target.totalAmount  > 0 ? target.totalAmount.toLocaleString()  + "원" : ""}

첨부파일을 확인하시고, 기한 내 납부 부탁드립니다.
문의사항은 아래 연락처로 연락 주시기 바랍니다.

■담당자 : ${companyInfo.managerName}(${companyInfo.managerEmail}, ${companyInfo.managerPhone})

■입금계좌 : ${companyInfo.depositAccountNote}


감사합니다.
${companyInfo.name} 드림`;
  }

  // 청구서 문구/라벨은 하드코딩이 아니라 공문관리 > 수수료 청구서 양식(/notice-templates/invoices)에서
  // 카테고리별로 등록해둔 대표양식을 그대로 쓴다 — 선택 UI 없이 항상 자동 적용. 역발행/기타는 연차상시/
  // 위탁정산 어느 쪽이든 항상 REVERSE·OTHER 전용 대표양식을 쓴다(공문발송 드롭다운의 "역발행 수수료
  // 공문"·"기타 공문"이 연차상시/위탁정산 구분 없이 하나뿐인 것과 대응).
  // 청구서 대표양식뿐 아니라 공통 첨부파일(사업자등록증 등)의 "이 유형엔 첨부할지" 설정도 같은 카테고리
  // 축(ANNUAL/SETTLEMENT/REVERSE/OTHER)을 기준으로 삼는다 — 역발행/기타는 항상 REVERSE·OTHER로 취급.
  function resolveTemplateCategory(cat: "ANNUAL" | "SETTLEMENT"): "ANNUAL" | "SETTLEMENT" | "REVERSE" | "OTHER" {
    return target.kind === "REVERSE" ? "REVERSE" : target.kind === "OTHER" ? "OTHER" : cat;
  }

  function resolveInvoiceTemplateEntry(cat: "ANNUAL" | "SETTLEMENT") {
    const category = resolveTemplateCategory(cat);
    return (
      feeInvoiceTemplates.find((t) => t.category === category && t.isDefault)
      ?? feeInvoiceTemplates.find((t) => t.category === category)
    );
  }

  function resolveInvoiceTemplateContent(cat: "ANNUAL" | "SETTLEMENT") {
    return resolveInvoiceTemplateEntry(cat)?.content ?? EMPTY_FEE_INVOICE_TEMPLATE;
  }

  function buildFeeInvoiceTargetData(cat: "ANNUAL" | "SETTLEMENT"): FeeInvoiceTarget {
    return {
      kind: target.kind,
      projectNumber: target.projectNumber,
      projectName: target.projectName,
      leadInstitutionName: target.leadInstitutionName,
      agencyShortName: target.agencyShortName,
      agencyFullName: target.agencyFullName,
      termYear: target.termYear,
      termNumber: target.termNumber,
      recipientName: target.recipientName,
      feeCategory: cat,
      supplyAmount: target.supplyAmount,
      taxAmount: target.taxAmount,
      totalAmount: target.totalAmount,
      startDate: target.startDate,
      endDate: target.endDate,
      researchLead: target.researchLead,
      participantCount: target.participantCount,
      docNumber: target.docNumber,
    };
  }

  function buildAttachments(cat: "ANNUAL" | "SETTLEMENT"): AttachmentRow[] {
    // previewHtml은 PDF 뷰어 유무와 상관없이 화면에서 바로 확인할 수 있도록, PDF와 같은 내용을
    // html2canvas 없이 즉시(동기) 렌더링해둔 것 — 모달을 열자마자 "생성 중" 대기 없이 보여준다.
    const invoiceAttachment = {
      name: `청구서_${target.projectNumber}_${termLabel}.pdf`,
      checked: true,
      previewHtml: buildFeeInvoiceHtml(buildFeeInvoiceTargetData(cat), resolveInvoiceTemplateContent(cat), companyInfo),
    };
    // 사업자등록증·통장사본 등 공통 첨부파일(/notice-templates/invoices에서 관리) — 이 유형(카테고리)
    // 기준으로 꺼져 있는 항목은(파일이 등록돼 있어도) 발송 목록에서 아예 빼서, 그 유형엔 필요 없는
    // 서류를 매번 체크 해제하지 않아도 되게 한다.
    const templateCategory = resolveTemplateCategory(cat);
    const standardAttachmentRows = standardAttachments
      .filter((a) => (a.enabledByCategory?.[templateCategory] ?? true))
      .map((a) => ({ name: a.name, checked: true, dataUrl: a.fileDataUrl }));
    // 공문 양식 관리 > 수수료 청구서 양식(/notice-templates/invoices)에서 이 카테고리(대표양식)에
    // 등록해둔 기본 첨부 파일 — 위탁정산내역서처럼 카테고리마다 다를 수 있는 서류를 거기서 관리한다.
    const defaultAttachmentRows = (resolveInvoiceTemplateEntry(cat)?.defaultAttachments ?? []).map((a) => ({
      name: a.name,
      checked: true,
      dataUrl: a.fileDataUrl,
    }));
    return [invoiceAttachment, ...standardAttachmentRows, ...defaultAttachmentRows];
  }

  const [feeCategory,  setFeeCategory]  = useState(target.feeCategory);
  const [toEmailRaw,   setToEmailRaw]   = useState(target.recipientEmail);
  const [subject,      setSubject]      = useState(() => isOther ? "" : buildSubject(target.feeCategory));
  const [body,         setBody]         = useState(() => isOther ? "" : buildBody(target.feeCategory));
  const [attachments,  setAttachments]  = useState<AttachmentRow[]>(() => buildAttachments(target.feeCategory));
  const [sending,      setSending]      = useState(false);
  const [sent,         setSent]         = useState(false);
  const [sendError,    setSendError]    = useState("");
  const [showStandardPanel, setShowStandardPanel] = useState(false);
  const [invoiceGenerating, setInvoiceGenerating] = useState(false);
  const [previewAttachment, setPreviewAttachment] = useState<AttachmentRow | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceIndexRef = useRef<number | null>(null);

  const invoiceFileName = `청구서_${target.projectNumber}_${termLabel}.pdf`;
  const activeInvoiceTemplateEntry = resolveInvoiceTemplateEntry(feeCategory);

  // 청구서(위탁정산/연차상시/역발행/기타) PDF는 반출용 파일이라 모달을 열 때, 그리고 구분(위탁정산↔
  // 연차상시)을 바꿀 때마다 값에 맞춰 새로 생성해 첨부에 자동으로 끼워 넣는다. (화면 미리보기는
  // previewHtml로 이미 즉시 보이므로, 여기서는 메일 발송용 실제 PDF 파일만 비동기로 준비한다.)
  useEffect(() => {
    let cancelled = false;
    setInvoiceGenerating(true);
    generateFeeInvoicePdfDataUrl(buildFeeInvoiceTargetData(feeCategory), resolveInvoiceTemplateContent(feeCategory), companyInfo)
      .then((dataUrl) => {
        if (cancelled) return;
        setAttachments((prev) => prev.map((a) => (a.name === invoiceFileName ? { ...a, dataUrl } : a)));
      })
      .catch((err) => {
        console.error("청구서 PDF 생성 실패", err);
      })
      .finally(() => {
        if (!cancelled) setInvoiceGenerating(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feeCategory, activeInvoiceTemplateEntry?.id]);

  // 역발행 공문은 과제가 연차상시/위탁정산 중 어느 쪽인지 자동으로 구분할 수 있는 필드가
  // 없어(발행 시 매번 사람이 고르는 구조) 모달에서 직접 선택하게 하고, 고르면 제목/본문/
  // 첨부를 그 구분에 맞춰 다시 만든다.
  function handleCategoryChange(next: "ANNUAL" | "SETTLEMENT") {
    setFeeCategory(next);
    setSubject(buildSubject(next));
    setBody(buildBody(next));
    setAttachments(buildAttachments(next));
  }

  const emails = parseEmails(toEmailRaw);
  const invalidEmails = emails.filter((e) => !EMAIL_RE.test(e));
  const canSend = emails.length > 0 && invalidEmails.length === 0 && !sending && canSendMail;

  function toggleAttach(i: number) {
    setAttachments((prev) => prev.map((a, idx) => idx === i ? { ...a, checked: !a.checked } : a));
  }

  function removeAttach(i: number) {
    setAttachments((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function handleFilesPicked(files: FileList | null) {
    if (!files || files.length === 0) return;
    const idx = replaceIndexRef.current;
    replaceIndexRef.current = null;
    const picked = await Promise.all(
      Array.from(files).map(async (f) => ({ name: f.name, checked: true, dataUrl: await fileToDataUrl(f) }))
    );
    setAttachments((prev) => {
      if (idx !== null) {
        // 개별 수정 — 이 발송 건에서만 해당 행의 파일을 교체 (기본 첨부서류는 그대로 둠)
        return prev.map((a, i) => i === idx ? picked[0] : a);
      }
      return [...prev, ...picked];
    });
  }

  async function handleSend() {
    if (!canSend || !senderUser?.hiworksEmail || !senderUser?.hiworksMailPassword) return;
    setSending(true);
    setSendError("");

    const checkedAttachments = attachments.filter((a) => a.checked);
    const mailAttachments = checkedAttachments
      .filter((a): a is AttachmentRow & { dataUrl: string } => !!a.dataUrl)
      .map((a) => ({ filename: a.name, dataUrl: a.dataUrl }));

    let status: "SUCCESS" | "FAILED" = "SUCCESS";
    try {
      const res = await fetch("/api/notices/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderEmail: senderUser.hiworksEmail,
          senderPassword: senderUser.hiworksMailPassword,
          senderName: senderUser.name,
          to: emails,
          subject,
          text: body,
          attachments: mailAttachments,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        status = "FAILED";
        setSendError(json.error || "메일 발송에 실패했습니다.");
      }
    } catch {
      status = "FAILED";
      setSendError("메일 발송 중 네트워크 오류가 발생했습니다.");
    }

    addEmailDispatch({
      batchId: generateBatchId(),
      sentAt:               nowKST(),
      senderName:           senderUser.name,
      recipientInstitution: target.leadInstitutionName,
      recipientEmail:       emails.join(", "),
      subject,
      emailType:            isOther ? "OTHER" : "TAX_INVOICE",
      projectNumber:        target.projectNumber,
      termNumber:           target.termNumber,
      feeCategory:          isOther ? undefined : feeCategory,
      isReverseRequest:     target.kind === "REVERSE" ? true : undefined,
      attachments:          checkedAttachments.map((a) => a.name),
      status,
      body,
    });
    setSending(false);
    if (status === "SUCCESS") setSent(true);
  }

  if (sent) {
    return (
      <div className="p-8 flex flex-col items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
          <FiMail size={28} className="text-green-600" />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-slate-800">발송 완료</p>
          <p className="text-xs text-slate-500 mt-1">{emails.join(", ")}</p>
        </div>
        <button onClick={onClose} className="mt-2 px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
          닫기
        </button>
      </div>
    );
  }

  const categoryLabelCompact = feeCategory === "ANNUAL" ? "연차상시점검수수료" : "위탁정산수수료";
  const badgeLabel = isOther ? "기타 공문" : `${categoryLabelCompact} ${target.kind === "REVERSE" ? "역발행 " : ""}공문`;

  return (
    <div className="p-6 space-y-4">
      <input
        ref={fileInputRef}
        type="file"
        multiple={replaceIndexRef.current === null}
        className="hidden"
        onChange={(e) => { handleFilesPicked(e.target.files); e.target.value = ""; }}
      />

      {/* 공문 유형 배지 */}
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-bold px-2 py-1 rounded bg-teal-100 text-teal-700">
          {badgeLabel}
        </span>
        {!isOther && (
          <span className="text-xs text-slate-500">
            {target.projectNumber} · {termLabel}
          </span>
        )}
      </div>

      {/* 역발행 — 연차상시/위탁정산 자동 구분이 안 되어 직접 선택 */}
      {target.kind === "REVERSE" && (
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-600">수수료 구분</label>
          <div className="flex gap-2">
            {(["ANNUAL", "SETTLEMENT"] as const).map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => handleCategoryChange(cat)}
                className={`flex-1 px-3 py-2 text-xs font-medium rounded-lg border transition-colors ${
                  feeCategory === cat ? "bg-teal-50 border-teal-300 text-teal-700" : "border-slate-200 text-slate-500 hover:border-slate-300"
                }`}
              >
                {cat === "ANNUAL" ? "연차상시점검 수수료" : "위탁정산 수수료"}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 수신 이메일 */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-slate-600">
          실무자 이메일 <span className="text-slate-400 font-normal">(여러 명은 쉼표로 구분)</span>
        </label>
        <input
          type="text"
          value={toEmailRaw}
          onChange={(e) => setToEmailRaw(e.target.value)}
          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
          placeholder="example@domain.com, second@domain.com"
        />
        {target.recipientName && (
          <p className="text-[11px] text-slate-400">실무자: {target.recipientName}</p>
        )}
        {invalidEmails.length > 0 && (
          <p className="text-[11px] text-red-500">올바르지 않은 이메일 주소: {invalidEmails.join(", ")}</p>
        )}
        {emails.length > 1 && invalidEmails.length === 0 && (
          <p className="text-[11px] text-slate-400">{emails.length}명에게 발송됩니다</p>
        )}
      </div>

      {/* 제목 */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-slate-600">메일 제목</label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder={isOther ? "메일 제목을 입력하세요" : undefined}
          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
        />
      </div>

      {/* 첨부파일 */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-xs font-medium text-slate-600">첨부파일</label>
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setShowStandardPanel((v) => !v)} className="text-[11px] text-slate-400 hover:text-teal-600 transition-colors">
              기본파일 일괄 수정
            </button>
            <button
              type="button"
              onClick={() => { replaceIndexRef.current = null; fileInputRef.current?.click(); }}
              className="text-[11px] font-medium text-teal-600 hover:text-teal-700 transition-colors"
            >
              + 파일 추가
            </button>
          </div>
        </div>
        {showStandardPanel && <StandardAttachmentsPanel />}
        {attachments.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-400">
            첨부된 파일이 없습니다
          </div>
        ) : (
          <div className="rounded-lg border border-slate-200 divide-y divide-slate-100 overflow-hidden">
            {attachments.map((a, i) => (
              <div key={`${a.name}-${i}`} className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 transition-colors">
                <input
                  type="checkbox"
                  checked={a.checked}
                  onChange={() => toggleAttach(i)}
                  className="rounded"
                />
                {a.dataUrl || a.previewHtml ? (
                  <button
                    type="button"
                    onClick={() => setPreviewAttachment(a)}
                    title="미리보기"
                    className={`flex-1 text-left text-xs truncate hover:underline ${a.checked ? "text-teal-700" : "text-slate-300 line-through"}`}
                  >
                    {a.name}
                  </button>
                ) : (
                  <span className={`flex-1 text-xs truncate ${a.checked ? "text-slate-700" : "text-slate-300 line-through"}`}>
                    {a.name}
                  </span>
                )}
                {!a.dataUrl && a.name === invoiceFileName && invoiceGenerating ? (
                  <span className="text-[10px] text-slate-400 whitespace-nowrap">생성 중…</span>
                ) : !a.dataUrl ? (
                  <span className="text-[10px] text-amber-500 whitespace-nowrap" title="실제 파일이 등록되지 않아 발송 시 첨부되지 않습니다">
                    파일 없음
                  </span>
                ) : null}
                <button
                  type="button"
                  onClick={() => { replaceIndexRef.current = i; fileInputRef.current?.click(); }}
                  className="text-[10px] text-slate-400 hover:text-teal-600 transition-colors whitespace-nowrap"
                >
                  교체
                </button>
                <button
                  type="button"
                  onClick={() => removeAttach(i)}
                  className="text-slate-300 hover:text-red-500 transition-colors"
                  title="삭제"
                >
                  <FiX size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 본문 */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-slate-600">메일 본문</label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={isOther ? 8 : 13}
          placeholder={isOther ? "메일 본문을 입력하세요" : undefined}
          className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 text-slate-700 resize-y focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 font-mono leading-relaxed"
        />
      </div>

      <p className="text-[11px] text-slate-400">
        발신 계정: {canSendMail ? senderUser!.hiworksEmail : <span className="text-red-500">등록된 하이웍스 계정이 없습니다 (관리자 &gt; 사용자 관리에서 등록)</span>}
      </p>
      {sendError && <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{sendError}</p>}

      {/* 버튼 */}
      <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
        <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
          취소
        </button>
        <button
          onClick={handleSend}
          disabled={!canSend}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <FiMail size={14} />
          {sending ? "발송 중..." : "발송"}
        </button>
      </div>

      {previewAttachment && (previewAttachment.previewHtml || previewAttachment.dataUrl) && (
        <Modal title={previewAttachment.name} onClose={() => setPreviewAttachment(null)} size="xl">
          {previewAttachment.previewHtml ? (
            // 브라우저의 내장 PDF 뷰어 유무와 무관하게 항상 보이도록, PDF와 동일한 내용을 HTML로 직접
            // 렌더링한다 (실제 발송되는 PDF는 별도로 html2canvas가 이 HTML을 캡처해서 만든 것이라 내용은 같다).
            <div className="bg-slate-100 p-4">
              <div dangerouslySetInnerHTML={{ __html: previewAttachment.previewHtml }} />
            </div>
          ) : (
            <iframe src={previewAttachment.dataUrl} title={previewAttachment.name} className="w-full h-[80vh]" />
          )}
        </Modal>
      )}
    </div>
  );
}
