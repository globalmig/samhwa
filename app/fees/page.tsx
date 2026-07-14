"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { FiPlus, FiChevronDown, FiChevronUp, FiChevronRight, FiMail } from "react-icons/fi";
import {
  useStore,
  addTermFee,
  updateReceivable,
  updateProject,
  updateProjectMember,
  addTaxInvoice,
  updateTaxInvoice,
  addEmailDispatch,
  addUnclaimedFee,
  updateUnclaimedFee,
  addProject,
} from "@/lib/store";
import {
  type TermFee,
  type InstitutionType,
  type FeePolicy,
  type TaxInvoice,
  type Project,
} from "@/lib/mock";
import { fmtWon, fmtDate } from "@/lib/utils";
import Modal from "@/components/common/Modal";
import DateInput from "@/components/common/DateInput";
import InstitutionQuickAdd from "@/components/common/InstitutionQuickAdd";
import { useCanWrite } from "@/lib/permissions";

// ── 타입 ──────────────────────────────────────────────────────
type FeeRow = {
  key: string;
  // 식별
  agencyShortName: string;
  projectNumber: string;
  projectName: string;
  leadInstitutionName: string;
  researchLead: string;
  startDate: string;
  endDate: string;
  // 발행
  billingType: string;
  invoiceIssuedAt: string;
  supplyAmount: number;
  taxAmount: number;
  totalInvoiceAmount: number;
  // 수금
  receivableId: string;
  billedAmount: number;
  collectionStatus: string;
  paidAmount: number;
  receivableAmount: number;
  unclaimedAmount: number;
  // 과제 정보
  projectCode: string;
  docRequestDate: string;
  docReplyDate: string;
  recipientName: string;
  recipientEmail: string;
  projectDivision: string;
  assignedManager: string;
  // 매출 발행
  projectId: string;
  leadInstitutionId: string;
  taxInvoiceId: string;
  taxInvoiceStatus: TaxInvoice["status"] | "";
  appliedFeeTotal: number;
  // 원본 termFees (확장용)
  fees: TermFee[];
  termYear: number;
  termNumber: number;
  effectivePolicy: FeePolicy | null;
  projectStatus: "ACTIVE" | "COMPLETED" | "SUSPENDED" | "";
  // 수정용 참조 id
  unclaimedFeeId: string;
  leadMemberId: string;
  hasOpenIssue: boolean;
};

type CollectionTarget = {
  receivableId: string;
  projectName: string;
  leadInstitutionName: string;
  billedAmount: number;
  paidAmount: number;
  receivableAmount: number;
};

type SalesTarget = {
  projectId: string;
  projectNumber: string;
  projectName: string;
  leadInstitutionName: string;
  termYear: number;
  termNumber: number;
  currentBillingType: string;
  currentIssuedAt: string;
  taxInvoiceId: string;
  taxInvoiceStatus: TaxInvoice["status"] | "";
  appliedFeeTotal: number;
};

type DispatchTarget = {
  projectNumber:       string;
  projectName:         string;
  leadInstitutionName: string;
  termYear:            number;
  termNumber:          number;
  recipientEmail:      string;
  recipientName:       string;
  feeCategory:         "ANNUAL" | "SETTLEMENT";
  supplyAmount:        number;
  taxAmount:           number;
  totalAmount:         number;
};

type InfoEditTarget = {
  projectId:      string;
  projectName:    string;
  leadMemberId:   string;
  docRequestDate: string;
  docReplyDate:   string;
  recipientName:  string;
  recipientEmail: string;
  assignedManager: string;
};

type ModalState =
  | { mode: "generate" }
  | { mode: "project-add" }
  | { mode: "collection"; target: CollectionTarget }
  | { mode: "sales-issue"; target: SalesTarget }
  | { mode: "sales-cancel"; target: SalesTarget }
  | { mode: "dispatch"; target: DispatchTarget }
  | { mode: "info-edit"; target: InfoEditTarget };

const BILLING_TYPE_COLOR: Record<string, string> = {
  "정발행":     "bg-blue-100 text-blue-700",
  "역발행요청": "bg-violet-100 text-violet-700",
  "역발행":     "bg-purple-100 text-purple-700",
  "대상아님":   "bg-slate-100 text-slate-500",
  "면제":       "bg-amber-100 text-amber-700",
};

const COLLECTION_STATUS_LABEL: Record<string, string> = {
  PAID:    "완납",
  PARTIAL: "일부",
  PENDING: "대기",
  OVERDUE: "연체",
};
const COLLECTION_STATUS_COLOR: Record<string, string> = {
  PAID:    "bg-green-100 text-green-700",
  PARTIAL: "bg-amber-100 text-amber-700",
  PENDING: "bg-slate-100 text-slate-500",
  OVERDUE: "bg-red-100 text-red-600",
};

const inputCls  = "w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400";
const selectCls = `${inputCls} bg-white`;

// ── 발행구분 옵션 ─────────────────────────────────────────────
const BILLING_OPTIONS = [
  {
    value: "정발행",
    label: "정발행",
    desc: "일반적인 세금계산서 발행 (삼화→기관)",
  },
  {
    value: "역발행요청",
    label: "역발행 요청",
    desc: "기관이 계산서를 발행하도록 요청한 상태",
  },
  {
    value: "역발행",
    label: "역발행",
    desc: "기관이 삼화 앞으로 세금계산서를 발행",
  },
  {
    value: "대상아님",
    label: "대상아님",
    desc: "수수료 발행 대상이 아닌 과제 (국토부 공동기관, 농진청 소속기관이 주관 아닌 공동기관 등)",
  },
  {
    value: "면제",
    label: "면제",
    desc: "IITP·KAIA 주관이 최우수기관이고 공동 없는 경우",
  },
] as const;

// ── SalesIssueModal (매출발행) ────────────────────────────────
function SalesIssueModal({ target, onClose }: { target: SalesTarget; onClose: () => void }) {
  const [billingType, setBillingType] = useState(target.currentBillingType || "정발행");
  const [issuedAt, setIssuedAt]       = useState(target.currentIssuedAt || "");

  const isNoBill = billingType === "대상아님" || billingType === "면제";

  function handleSave() {
    // 1. Project billingType 업데이트
    if (target.projectId) {
      updateProject(target.projectId, { billingType: billingType as "정발행" | "역발행요청" | "역발행" | "대상아님" | "면제" });
    }

    // 2. 대상아님/면제는 세금계산서 처리 불필요
    if (isNoBill) { onClose(); return; }
    if (!issuedAt) { onClose(); return; }

    const supplyAmount = target.appliedFeeTotal;
    const taxAmount    = Math.round(supplyAmount * 0.1);
    const totalAmount  = supplyAmount + taxAmount;

    if (target.taxInvoiceId) {
      // 기존 세금계산서 수정
      updateTaxInvoice(target.taxInvoiceId, {
        issuedAt,
        supplyAmount,
        taxAmount,
        totalAmount,
        status: "ISSUED",
      });
    } else {
      // 새 세금계산서 생성
      const now = new Date();
      const invoiceNumber = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(Math.floor(Math.random() * 90000) + 10000)}`;
      addTaxInvoice({
        invoiceNumber,
        projectNumber:       target.projectNumber,
        projectName:         target.projectName,
        termYear:            target.termYear,
        termNumber:          target.termNumber,
        leadInstitutionId:   "",
        leadInstitutionName: target.leadInstitutionName,
        issuedAt,
        supplyAmount,
        taxAmount,
        totalAmount,
        status:              "ISSUED",
      });
    }
    onClose();
  }

  const selectedOpt = BILLING_OPTIONS.find((o) => o.value === billingType);

  return (
    <div className="p-6 space-y-5">
      {/* 과제 정보 */}
      <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3 space-y-1 text-xs">
        <p className="text-slate-400">과제명</p>
        <p className="font-medium text-slate-800">{target.projectName}</p>
        <p className="text-slate-500">{target.leadInstitutionName} · {target.termYear}년 {target.termNumber}연차</p>
      </div>

      {/* 발행구분 선택 */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-slate-600">발행구분</label>
        <div className="grid grid-cols-1 gap-1.5">
          {BILLING_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`flex items-start gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors ${
                billingType === opt.value
                  ? "border-blue-300 bg-blue-50"
                  : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              <input
                type="radio"
                name="billingType"
                value={opt.value}
                checked={billingType === opt.value}
                onChange={() => setBillingType(opt.value)}
                className="mt-0.5 shrink-0"
              />
              <div className="min-w-0">
                <span className={`text-xs font-semibold ${
                  billingType === opt.value ? "text-blue-700" : "text-slate-700"
                }`}>
                  {opt.label}
                </span>
                <p className="text-[10px] text-slate-400 mt-0.5 leading-relaxed">{opt.desc}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* 세금계산서 발행일 — 대상아님/면제일 때는 숨김 */}
      {!isNoBill && (
        <div className="space-y-2">
          <label className="text-xs font-medium text-slate-600">
            세금계산서 발행일
            {billingType === "역발행요청" && (
              <span className="ml-2 text-violet-500 font-normal">역발행 요청 시 기관 발행 예정일 입력</span>
            )}
          </label>
          <input
            type="date"
            value={issuedAt}
            onChange={(e) => setIssuedAt(e.target.value)}
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
          />
          {target.appliedFeeTotal > 0 && (
            <div className="text-[11px] text-slate-400 space-y-0.5">
              <span>공급가액 {fmtWon(target.appliedFeeTotal)} · 부가세 {fmtWon(Math.round(target.appliedFeeTotal * 0.1))} · 합계 {fmtWon(target.appliedFeeTotal + Math.round(target.appliedFeeTotal * 0.1))}</span>
            </div>
          )}
        </div>
      )}

      {isNoBill && selectedOpt && (
        <div className="rounded-lg border border-amber-100 bg-amber-50 px-4 py-3 text-xs text-amber-700">
          <p className="font-medium">{selectedOpt.label} 처리</p>
          <p className="mt-0.5 text-amber-600">{selectedOpt.desc}</p>
          <p className="mt-1 text-amber-500">세금계산서 발행 없이 발행구분만 업데이트됩니다.</p>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
        <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
          취소
        </button>
        <button
          onClick={handleSave}
          disabled={!isNoBill && !issuedAt}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {target.taxInvoiceId && !isNoBill ? "수정 저장" : "발행 등록"}
        </button>
      </div>
    </div>
  );
}

// ── SalesCancelModal (매출취소) ───────────────────────────────
function SalesCancelModal({ target, onClose }: { target: SalesTarget; onClose: () => void }) {
  const [mode, setMode]       = useState<"delete" | "modify">("modify");
  const [newDate, setNewDate] = useState(target.currentIssuedAt || "");

  function handleSave() {
    if (!target.taxInvoiceId) { onClose(); return; }
    if (mode === "delete") {
      updateTaxInvoice(target.taxInvoiceId, { issuedAt: "", status: "CANCELED" });
    } else {
      if (!newDate) return;
      updateTaxInvoice(target.taxInvoiceId, { issuedAt: newDate, status: "MODIFIED" });
    }
    onClose();
  }

  return (
    <div className="p-6 space-y-5">
      {/* 과제 정보 */}
      <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3 space-y-1 text-xs">
        <p className="text-slate-400">과제명</p>
        <p className="font-medium text-slate-800">{target.projectName}</p>
        <div className="flex items-center gap-3 mt-1">
          <span className="text-slate-500">{target.leadInstitutionName}</span>
          {target.currentIssuedAt && (
            <span className="text-slate-500">현재 발행일 <span className="font-medium text-slate-700">{fmtDate(target.currentIssuedAt)}</span></span>
          )}
          {target.taxInvoiceStatus === "MODIFIED" && (
            <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-medium">수정됨</span>
          )}
        </div>
      </div>

      {/* 처리 방식 선택 */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-slate-600">처리 방식</label>
        <div className="grid grid-cols-2 gap-2">
          {([
            { value: "modify", label: "날짜 수정",   desc: "다른 날짜로 변경",  color: "blue"  },
            { value: "delete", label: "발행일 삭제", desc: "취소 처리로 변경",  color: "red"   },
          ] as const).map((opt) => (
            <label
              key={opt.value}
              className={`flex flex-col gap-1 px-3 py-3 rounded-lg border cursor-pointer transition-colors ${
                mode === opt.value
                  ? opt.color === "red"
                    ? "border-red-300 bg-red-50"
                    : "border-blue-300 bg-blue-50"
                  : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <div className="flex items-center gap-2">
                <input
                  type="radio"
                  name="cancelMode"
                  value={opt.value}
                  checked={mode === opt.value}
                  onChange={() => setMode(opt.value)}
                  className="shrink-0"
                />
                <span className={`text-xs font-semibold ${
                  mode === opt.value
                    ? opt.color === "red" ? "text-red-700" : "text-blue-700"
                    : "text-slate-700"
                }`}>
                  {opt.label}
                </span>
              </div>
              <p className="text-[10px] text-slate-400 pl-5">{opt.desc}</p>
            </label>
          ))}
        </div>
      </div>

      {/* 날짜 수정 모드 */}
      {mode === "modify" && (
        <div className="space-y-2">
          <label className="text-xs font-medium text-slate-600">변경할 발행일</label>
          <input
            type="date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
            autoFocus
          />
        </div>
      )}

      {/* 삭제 확인 */}
      {mode === "delete" && (
        <div className="rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-xs text-red-700">
          세금계산서 상태가 <span className="font-bold">취소</span>로 변경되고 발행일이 삭제됩니다.
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
        <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
          닫기
        </button>
        <button
          onClick={handleSave}
          disabled={mode === "modify" && !newDate}
          className={`px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
            mode === "delete" ? "bg-red-500 hover:bg-red-600" : "bg-blue-600 hover:bg-blue-700"
          }`}
        >
          {mode === "delete" ? "발행일 삭제" : "날짜 수정"}
        </button>
      </div>
    </div>
  );
}

// ── DispatchDropdown (공문 발송 드롭다운 버튼) ────────────────
function DispatchDropdown({
  onSelect,
}: {
  onSelect: (cat: "ANNUAL" | "SETTLEMENT") => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative inline-block">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-[11px] font-medium px-2 py-1 rounded transition-colors whitespace-nowrap bg-teal-50 text-teal-700 hover:bg-teal-100 border border-teal-200"
      >
        <FiMail size={11} />
        공문발송
        <FiChevronRight size={10} className={`transition-transform ${open ? "rotate-90" : ""}`} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden min-w-[160px]">
          <button
            className="w-full text-left px-4 py-2.5 text-xs text-slate-700 hover:bg-teal-50 hover:text-teal-800 transition-colors"
            onClick={() => { setOpen(false); onSelect("ANNUAL"); }}
          >
            연차상시점검 수수료 공문
          </button>
          <button
            className="w-full text-left px-4 py-2.5 text-xs text-slate-700 hover:bg-teal-50 hover:text-teal-800 transition-colors border-t border-slate-100"
            onClick={() => { setOpen(false); onSelect("SETTLEMENT"); }}
          >
            위탁정산 수수료 공문
          </button>
        </div>
      )}
    </div>
  );
}

// ── DispatchModal (공문 발송 모달) ────────────────────────────
function DispatchModal({ target, onClose }: { target: DispatchTarget; onClose: () => void }) {
  const categoryLabel = target.feeCategory === "ANNUAL" ? "연차상시점검수수료" : "위탁정산수수료";
  const termLabel     = `${target.termNumber}연차`;

  const defaultSubject = `[${target.projectNumber}] ${termLabel} ${categoryLabel} 청구서`;
  const defaultBody =
`안녕하세요.
${target.leadInstitutionName} 담당자님,

${target.projectName} 과제의 ${termLabel} ${categoryLabel} 청구서를 첨부하여 안내 드립니다.

【 청구 내역 】
- 과제번호 : ${target.projectNumber}
- 과    제 : ${target.projectName}
- 대    상 : ${termLabel} ${categoryLabel}
- 공급가액 : ${target.supplyAmount > 0 ? target.supplyAmount.toLocaleString() + "원" : "별도 협의"}
- 부  가  세 : ${target.taxAmount   > 0 ? target.taxAmount.toLocaleString()   + "원" : ""}
- 합    계 : ${target.totalAmount  > 0 ? target.totalAmount.toLocaleString()  + "원" : ""}

첨부파일을 확인하시고, 기한 내 납부 부탁드립니다.
문의사항은 아래 연락처로 연락 주시기 바랍니다.

감사합니다.
삼화기술경영 드림`;

  const defaultAttachments = [
    { name: `청구서_${target.projectNumber}_${termLabel}.pdf`, checked: true },
    { name: "사업자등록증.pdf",                                  checked: true },
    ...(target.feeCategory === "SETTLEMENT"
      ? [{ name: "위탁정산내역서.pdf", checked: true }]
      : []),
  ];

  const [toEmail,      setToEmail]      = useState(target.recipientEmail);
  const [subject,      setSubject]      = useState(defaultSubject);
  const [body,         setBody]         = useState(defaultBody);
  const [attachments,  setAttachments]  = useState(defaultAttachments);
  const [sending,      setSending]      = useState(false);
  const [sent,         setSent]         = useState(false);

  function toggleAttach(i: number) {
    setAttachments((prev) => prev.map((a, idx) => idx === i ? { ...a, checked: !a.checked } : a));
  }

  function handleSend() {
    if (!toEmail.trim()) return;
    setSending(true);
    setTimeout(() => {
      const batchId = `BATCH-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(Math.random() * 9000) + 1000}`;
      addEmailDispatch({
        batchId,
        sentAt:               new Date().toISOString().replace("T", " ").slice(0, 16),
        recipientInstitution: target.leadInstitutionName,
        recipientEmail:       toEmail.trim(),
        subject,
        emailType:            "TAX_INVOICE",
        feeCategory:          target.feeCategory,
        attachments:          attachments.filter((a) => a.checked).map((a) => a.name),
        status:               "SUCCESS",
        body,
      });
      setSending(false);
      setSent(true);
    }, 600);
  }

  if (sent) {
    return (
      <div className="p-8 flex flex-col items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
          <FiMail size={28} className="text-green-600" />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-slate-800">발송 완료</p>
          <p className="text-xs text-slate-500 mt-1">{toEmail}</p>
        </div>
        <button onClick={onClose} className="mt-2 px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
          닫기
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      {/* 공문 유형 배지 */}
      <div className="flex items-center gap-2">
        <span className="text-[11px] font-bold px-2 py-1 rounded bg-teal-100 text-teal-700">
          {categoryLabel} 공문
        </span>
        <span className="text-xs text-slate-500">
          {target.projectNumber} · {termLabel}
        </span>
      </div>

      {/* 수신 이메일 */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-slate-600">수신자 이메일</label>
        <input
          type="email"
          value={toEmail}
          onChange={(e) => setToEmail(e.target.value)}
          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
          placeholder="example@domain.com"
        />
        {target.recipientName && (
          <p className="text-[11px] text-slate-400">수신자: {target.recipientName}</p>
        )}
      </div>

      {/* 제목 */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-slate-600">메일 제목</label>
        <input
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
        />
      </div>

      {/* 첨부파일 */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-slate-600">첨부파일</label>
        <div className="rounded-lg border border-slate-200 divide-y divide-slate-100 overflow-hidden">
          {attachments.map((a, i) => (
            <label key={a.name} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-slate-50 transition-colors">
              <input
                type="checkbox"
                checked={a.checked}
                onChange={() => toggleAttach(i)}
                className="rounded"
              />
              <span className={`text-xs ${a.checked ? "text-slate-700" : "text-slate-300 line-through"}`}>
                {a.name}
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* 본문 */}
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-slate-600">메일 본문</label>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={10}
          className="w-full text-xs border border-slate-200 rounded-lg px-3 py-2 text-slate-700 resize-y focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 font-mono leading-relaxed"
        />
      </div>

      {/* 버튼 */}
      <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
        <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
          취소
        </button>
        <button
          onClick={handleSend}
          disabled={!toEmail.trim() || sending}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <FiMail size={14} />
          {sending ? "발송 중..." : "발송"}
        </button>
      </div>
    </div>
  );
}

// ── CollectionModal ───────────────────────────────────────────
function CollectionModal({ target, onClose }: { target: CollectionTarget; onClose: () => void }) {
  const [inputAmount, setInputAmount] = useState("");
  const remaining = target.billedAmount - target.paidAmount;

  function calcStatus(paid: number): "PENDING" | "PARTIAL" | "PAID" | "OVERDUE" {
    if (paid <= 0)                         return "PENDING";
    if (paid >= target.billedAmount)       return "PAID";
    return "PARTIAL";
  }

  function handleSave() {
    const addAmount = Number(inputAmount);
    if (isNaN(addAmount) || addAmount <= 0) return;
    const newPaid       = target.paidAmount + addAmount;
    const newReceivable = Math.max(0, target.billedAmount - newPaid);
    updateReceivable(target.receivableId, {
      paidAmount:       newPaid,
      receivableAmount: newReceivable,
      status:           calcStatus(newPaid),
    });
    onClose();
  }

  function handleFullPay() {
    if (remaining <= 0) return;
    updateReceivable(target.receivableId, {
      paidAmount:       target.billedAmount,
      receivableAmount: 0,
      status:           "PAID",
    });
    onClose();
  }

  function handleCancel() {
    updateReceivable(target.receivableId, {
      paidAmount:       0,
      receivableAmount: target.billedAmount,
      status:           "PENDING",
    });
    onClose();
  }

  const previewPaid       = target.paidAmount + (Number(inputAmount) || 0);
  const previewReceivable = Math.max(0, target.billedAmount - previewPaid);

  return (
    <div className="p-6 space-y-5">
      {/* 현황 */}
      <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3 space-y-2.5 text-xs">
        <p className="font-medium text-slate-500 text-[10px] tracking-widest">현재 수금 현황</p>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-slate-400 mb-0.5">청구액</p>
            <p className="font-bold text-slate-800 text-sm">{fmtWon(target.billedAmount)}</p>
          </div>
          <div>
            <p className="text-slate-400 mb-0.5">기수금액</p>
            <p className="font-bold text-green-700 text-sm">{fmtWon(target.paidAmount)}</p>
          </div>
          <div>
            <p className="text-slate-400 mb-0.5">미수액</p>
            <p className={`font-bold text-sm ${target.receivableAmount > 0 ? "text-red-600" : "text-slate-300"}`}>
              {fmtWon(target.receivableAmount)}
            </p>
          </div>
        </div>
      </div>

      {/* 입금액 입력 */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-slate-600">
          입금액 <span className="text-slate-400 font-normal">(잔여 미수액: {fmtWon(remaining)})</span>
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            max={remaining}
            value={inputAmount}
            onChange={(e) => setInputAmount(e.target.value)}
            placeholder="0"
            className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
            autoFocus
          />
          <button
            onClick={() => setInputAmount(String(remaining))}
            disabled={remaining <= 0}
            className="px-3 py-2 text-xs font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
          >
            완납처리
          </button>
        </div>
      </div>

      {/* 입력 후 미리보기 */}
      {inputAmount !== "" && Number(inputAmount) > 0 && (
        <div className="rounded-lg border border-blue-100 bg-blue-50/50 px-4 py-3 text-xs space-y-1">
          <p className="text-blue-500 font-medium text-[10px] tracking-widest mb-1.5">등록 후 예상</p>
          <div className="flex justify-between text-slate-600">
            <span>수금액</span>
            <span className="font-bold text-green-700">{fmtWon(previewPaid)}</span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>미수액</span>
            <span className={`font-bold ${previewReceivable > 0 ? "text-red-600" : "text-slate-400"}`}>
              {previewReceivable > 0 ? fmtWon(previewReceivable) : "완납"}
            </span>
          </div>
        </div>
      )}

      {/* 버튼 */}
      <div className="flex items-center justify-between pt-2 border-t border-slate-100">
        {target.paidAmount > 0 ? (
          <button
            onClick={handleCancel}
            className="px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 rounded-lg transition-colors"
          >
            수금 취소 (초기화)
          </button>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
            닫기
          </button>
          <button
            onClick={handleSave}
            disabled={!inputAmount || Number(inputAmount) <= 0 || isNaN(Number(inputAmount))}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            수금 등록
          </button>
        </div>
      </div>
    </div>
  );
}

// ── InfoEditModal (서류요청·서류회신·수신자·삼화담당자 수정) ────
function InfoEditModal({ target, onClose }: { target: InfoEditTarget; onClose: () => void }) {
  const [docRequestDate, setDocRequestDate]   = useState(target.docRequestDate);
  const [docReplyDate, setDocReplyDate]       = useState(target.docReplyDate);
  const [recipientName, setRecipientName]     = useState(target.recipientName);
  const [recipientEmail, setRecipientEmail]   = useState(target.recipientEmail);
  const [assignedManager, setAssignedManager] = useState(target.assignedManager);

  function handleSave() {
    updateProject(target.projectId, {
      docRequestDate: docRequestDate || undefined,
      docReplyDate:   docReplyDate || undefined,
      assignedManager: assignedManager || undefined,
    });
    if (target.leadMemberId) {
      updateProjectMember(target.leadMemberId, {
        contactName:  recipientName || undefined,
        contactEmail: recipientEmail || undefined,
      });
    }
    onClose();
  }

  return (
    <div className="p-6 space-y-4">
      <p className="text-xs text-slate-500 -mt-1">{target.projectName}</p>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">서류요청일</label>
          <DateInput value={docRequestDate} onChange={setDocRequestDate} className="w-full" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">서류회신일</label>
          <DateInput value={docReplyDate} onChange={setDocReplyDate} className="w-full" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">수신자</label>
          <input
            value={recipientName}
            onChange={(e) => setRecipientName(e.target.value)}
            placeholder="담당자명"
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">수신자 이메일</label>
          <input
            value={recipientEmail}
            onChange={(e) => setRecipientEmail(e.target.value)}
            placeholder="email@example.com"
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
          />
        </div>
      </div>

      {!target.leadMemberId && (
        <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          이 과제에는 등록된 주관기관 담당자 정보가 없어 수신자 항목은 저장되지 않습니다.
        </p>
      )}

      <div>
        <label className="block text-xs font-medium text-slate-600 mb-1">삼화담당자</label>
        <input
          value={assignedManager}
          onChange={(e) => setAssignedManager(e.target.value)}
          placeholder="담당자명"
          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
        />
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
        <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">취소</button>
        <button onClick={handleSave} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">저장</button>
      </div>
    </div>
  );
}

// ── ProjectAddForm (새 과제 개별 등록 — 엑셀 없이 직접 입력) ───
type NewProjectDraft = {
  projectNumber: string;
  projectName: string;
  agencyId: string;
  leadInstitutionId: string;
  startDate: string;
  endDate: string;
  totalTerms: number;
  currentTerm: number;
  status: Project["status"];
  govGrant: number;
  privateCash: number;
  privateInKind: number;
  projectType: "GENERAL" | "AUTONOMY_TRACK";
  programType: "GENERAL" | "ICT_FUND";
  researchLead: string;
  assignedManager: string;
  projectDivision: "" | "위탁" | "공동";
};

const EMPTY_NEW_PROJECT: NewProjectDraft = {
  projectNumber: "",
  projectName: "",
  agencyId: "",
  leadInstitutionId: "",
  startDate: "",
  endDate: "",
  totalTerms: 1,
  currentTerm: 1,
  status: "ACTIVE",
  govGrant: 0,
  privateCash: 0,
  privateInKind: 0,
  projectType: "GENERAL",
  programType: "GENERAL",
  researchLead: "",
  assignedManager: "",
  projectDivision: "",
};

function ProjectAddForm({ onClose }: { onClose: (createdId?: string) => void }) {
  const { fundingAgencies, institutions, projects } = useStore();
  const [form, setForm] = useState<NewProjectDraft>(EMPTY_NEW_PROJECT);
  const [error, setError] = useState("");
  const s = <K extends keyof NewProjectDraft>(k: K, v: NewProjectDraft[K]) => setForm((p) => ({ ...p, [k]: v }));

  const totalBudget = form.govGrant + form.privateCash + form.privateInKind;

  function handleSubmit() {
    if (!form.projectNumber.trim() || !form.projectName.trim() || !form.agencyId || !form.leadInstitutionId || !form.startDate || !form.endDate) {
      setError("과제번호·과제명·전담기관·주관기관·당해시작일·당해종료일은 필수입니다.");
      return;
    }
    if (projects.some((p) => p.projectNumber === form.projectNumber.trim())) {
      setError("이미 등록된 과제번호입니다.");
      return;
    }
    const agency = fundingAgencies.find((a) => a.id === form.agencyId);
    const lead = institutions.find((i) => i.id === form.leadInstitutionId);
    const created = addProject({
      projectNumber: form.projectNumber.trim(),
      projectName: form.projectName.trim(),
      agencyId: form.agencyId,
      agency: agency?.name ?? "",
      leadInstitutionId: form.leadInstitutionId,
      leadInstitutionName: lead?.name ?? "",
      totalBudget,
      startDate: form.startDate,
      endDate: form.endDate,
      totalTerms: form.totalTerms,
      currentTerm: form.currentTerm,
      status: form.status,
      govGrant: form.govGrant || undefined,
      privateCash: form.privateCash || undefined,
      privateInKind: form.privateInKind || undefined,
      projectType: form.projectType,
      programType: form.agencyId === "fa-003" ? form.programType : undefined,
      researchLead: form.researchLead || undefined,
      assignedManager: form.assignedManager || undefined,
      projectDivision: form.projectDivision || undefined,
    });
    onClose(created.id);
  }

  return (
    <div className="p-6 space-y-4">
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">과제번호 *</label>
          <input className={inputCls} value={form.projectNumber} onChange={(e) => s("projectNumber", e.target.value)} placeholder="RS-2026-00000000" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">과제명 *</label>
          <input className={inputCls} value={form.projectName} onChange={(e) => s("projectName", e.target.value)} placeholder="과제명을 입력하세요" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">전담기관 *</label>
          <select className={selectCls} value={form.agencyId} onChange={(e) => s("agencyId", e.target.value)}>
            <option value="">선택하세요</option>
            {fundingAgencies.map((a) => <option key={a.id} value={a.id}>{a.shortName} · {a.name}</option>)}
          </select>
        </div>
        <div>
          <InstitutionQuickAdd
            label="주관기관 *"
            value={form.leadInstitutionId}
            onChange={(id) => s("leadInstitutionId", id)}
            institutions={institutions}
          />
        </div>
      </div>
      <div className="grid grid-cols-4 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">당해시작일 *</label>
          <DateInput value={form.startDate} onChange={(v) => s("startDate", v)} className="w-full" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">당해종료일 *</label>
          <DateInput value={form.endDate} onChange={(v) => s("endDate", v)} className="w-full" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">총연차</label>
          <input className={inputCls} type="number" min={1} value={form.totalTerms} onChange={(e) => s("totalTerms", Number(e.target.value))} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">현재연차</label>
          <input className={inputCls} type="number" min={1} value={form.currentTerm} onChange={(e) => s("currentTerm", Number(e.target.value))} />
        </div>
      </div>
      <div className="rounded-lg border border-slate-100 bg-slate-50/50 px-4 py-3 space-y-3">
        <p className="text-xs font-semibold text-slate-600">사업비 구분 (당해 기준 — 참여기관·연차별 사업비는 등록 후 상세 화면에서 추가)</p>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">당해 정부출연금</label>
            <input className={inputCls} type="number" min={0} value={form.govGrant} onChange={(e) => s("govGrant", Number(e.target.value))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">당해 민간원금</label>
            <input className={inputCls} type="number" min={0} value={form.privateCash} onChange={(e) => s("privateCash", Number(e.target.value))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">당해 민간현물</label>
            <input className={inputCls} type="number" min={0} value={form.privateInKind} onChange={(e) => s("privateInKind", Number(e.target.value))} />
          </div>
        </div>
        <p className="text-xs text-slate-500">당해 사업비 합계: <strong className="text-slate-800">{fmtWon(totalBudget)}</strong></p>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">상태</label>
          <select className={selectCls} value={form.status} onChange={(e) => s("status", e.target.value as Project["status"])}>
            <option value="ACTIVE">진행중</option>
            <option value="COMPLETED">완료</option>
            <option value="SUSPENDED">중단</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">연구책임자</label>
          <input className={inputCls} value={form.researchLead} onChange={(e) => s("researchLead", e.target.value)} placeholder="담당자명" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">삼화담당자</label>
          <input className={inputCls} value={form.assignedManager} onChange={(e) => s("assignedManager", e.target.value)} placeholder="담당자명" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">자율성트랙 여부</label>
          <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-medium">
            <button type="button" onClick={() => s("projectType", "GENERAL")}
              className={`flex-1 px-2 py-1.5 transition-colors ${form.projectType === "GENERAL" ? "bg-blue-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>일반과제</button>
            <button type="button" onClick={() => s("projectType", "AUTONOMY_TRACK")}
              className={`flex-1 px-2 py-1.5 border-l border-slate-200 transition-colors ${form.projectType === "AUTONOMY_TRACK" ? "bg-blue-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>자율성트랙</button>
          </div>
        </div>
        {form.agencyId === "fa-003" && (
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">사업 유형 <span className="text-slate-400 font-normal">· IITP 전용</span></label>
            <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs font-medium">
              <button type="button" onClick={() => s("programType", "GENERAL")}
                className={`flex-1 px-2 py-1.5 transition-colors ${form.programType === "GENERAL" ? "bg-blue-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>일반 R&D</button>
              <button type="button" onClick={() => s("programType", "ICT_FUND")}
                className={`flex-1 px-2 py-1.5 border-l border-slate-200 transition-colors ${form.programType === "ICT_FUND" ? "bg-blue-600 text-white" : "bg-white text-slate-500 hover:bg-slate-50"}`}>ICT 기금사업</button>
            </div>
          </div>
        )}
      </div>
      <p className="text-xs text-slate-400">등록 후 과제 상세 화면에서 참여기관(주관·공동)과 연차별 사업비를 추가하면 수수료가 자동 산정됩니다.</p>
      <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
        <button onClick={() => onClose()} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">취소</button>
        <button onClick={handleSubmit} className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">등록</button>
      </div>
    </div>
  );
}

function gradeToRuleGrade(grade?: string): string {
  if (!grade) return "일반";
  if (grade === "최우수(S)") return "S";
  if (grade.startsWith("우수")) return "A~C";
  return "일반";
}

// ── useFeeRows ────────────────────────────────────────────────
function useFeeRows(): FeeRow[] {
  const {
    termFees, projects, unclaimedFees, receivables,
    fundingAgencies, feePolicies, projectMembers, taxInvoices, projectIssues,
  } = useStore();

  return useMemo(() => {
    const groups = new Map<string, TermFee[]>();
    termFees.forEach((tf) => {
      const k = `${tf.projectNumber}|${tf.termYear}|${tf.termNumber}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k)!.push(tf);
    });

    const rows: FeeRow[] = Array.from(groups.entries()).map(([key, fees]) => {
      const f0 = fees[0];
      const project = projects.find((p) => p.projectNumber === f0.projectNumber);
      const agency  = fundingAgencies.find((a) => a.id === (project?.agencyId ?? ""));
      const programType = project?.programType ?? "GENERAL";
      const effectivePolicy =
        feePolicies.find((p) => p.agencyId === project?.agencyId && p.status === "ACTIVE" && (p.programType ?? "GENERAL") === programType) ??
        feePolicies.find((p) => p.agencyId === null && p.status === "ACTIVE" && (p.programType ?? "GENERAL") === programType) ??
        null;

      // 세금계산서
      const invoice = taxInvoices.find(
        (ti) => ti.projectNumber === f0.projectNumber && ti.termYear === f0.termYear && ti.termNumber === f0.termNumber
      );

      // 수금(receivable)
      const rv = receivables.find(
        (r) => r.projectNumber === f0.projectNumber && r.termYear === f0.termYear && r.termNumber === f0.termNumber
      );

      // 미청구
      const ucRecord = unclaimedFees.find(
        (u) => u.projectNumber === f0.projectNumber && u.termYear === f0.termYear && u.termNumber === f0.termNumber
      );

      // 주관기관 담당자 (projectMembers의 LEAD 기관 중 연락처 정보 있는 첫 번째)
      const leadMember = projectMembers.find(
        (pm) => pm.projectNumber === f0.projectNumber && pm.role === "LEAD"
      );

      // 미해결 이슈 여부
      const hasOpenIssue = projectIssues.some(
        (i) => i.projectNumber === f0.projectNumber && i.status !== "RESOLVED"
      );

      // 발행구분 — billingType 없으면 세금계산서 유무로 판별
      const billingType = project?.billingType ?? (invoice ? "정발행" : "");
      const appliedFeeTotal = fees.reduce((s, f) => s + f.appliedFee, 0);

      return {
        key,
        projectId:           project?.id ?? "",
        leadInstitutionId:   project?.leadInstitutionId ?? "",
        agencyShortName:     agency?.shortName ?? "",
        projectNumber:       f0.projectNumber,
        projectName:         f0.projectName,
        leadInstitutionName: project?.leadInstitutionName ?? "",
        researchLead:        project?.researchLead ?? "",
        startDate:           project?.startDate ?? "",
        endDate:             project?.endDate ?? "",
        billingType,
        invoiceIssuedAt:     invoice?.issuedAt ?? "",
        supplyAmount:        invoice?.supplyAmount ?? 0,
        taxAmount:           invoice?.taxAmount ?? 0,
        totalInvoiceAmount:  invoice?.totalAmount ?? 0,
        receivableId:        rv?.id ?? "",
        billedAmount:        rv?.billedAmount ?? 0,
        collectionStatus:    rv?.status ?? "",
        paidAmount:          rv?.paidAmount ?? 0,
        receivableAmount:    rv?.receivableAmount ?? 0,
        unclaimedAmount:     ucRecord?.amount ?? 0,
        projectCode:         project?.projectCode ?? "",
        docRequestDate:      project?.docRequestDate ?? "",
        docReplyDate:        project?.docReplyDate ?? "",
        recipientName:       leadMember?.contactName ?? "",
        recipientEmail:      leadMember?.contactEmail ?? "",
        projectDivision:     project?.projectDivision ?? "",
        assignedManager:     project?.assignedManager ?? "",
        taxInvoiceId:        invoice?.id ?? "",
        taxInvoiceStatus:    invoice?.status ?? "",
        appliedFeeTotal,
        fees,
        termYear:            f0.termYear,
        termNumber:          f0.termNumber,
        effectivePolicy,
        projectStatus:       project?.status ?? "",
        unclaimedFeeId:      ucRecord?.id ?? "",
        leadMemberId:        leadMember?.id ?? "",
        hasOpenIssue,
      };
    });

    rows.sort((a, b) => {
      if (a.projectNumber !== b.projectNumber) return a.projectNumber.localeCompare(b.projectNumber);
      if (a.termYear !== b.termYear) return b.termYear - a.termYear;
      return b.termNumber - a.termNumber;
    });

    return rows;
  }, [termFees, projects, unclaimedFees, receivables, fundingAgencies, feePolicies, projectMembers, taxInvoices, projectIssues]);
}

// ── UnclaimedAmountCell (손실금액 직접 입력) ────────────────────
function UnclaimedAmountCell({ row, canEdit }: { row: FeeRow; canEdit: boolean }) {
  const [value, setValue] = useState(row.unclaimedAmount);

  useEffect(() => setValue(row.unclaimedAmount), [row.unclaimedAmount]);

  if (!canEdit) {
    return (
      <span className={`text-xs font-medium ${row.unclaimedAmount > 0 ? "text-amber-600" : "text-slate-300"}`}>
        {row.unclaimedAmount > 0 ? fmtWon(row.unclaimedAmount) : "—"}
      </span>
    );
  }

  function commit() {
    if (value === row.unclaimedAmount) return;
    if (row.unclaimedFeeId) {
      updateUnclaimedFee(row.unclaimedFeeId, { amount: value });
    } else if (value > 0) {
      addUnclaimedFee({
        projectNumber: row.projectNumber,
        projectName: row.projectName,
        leadInstitutionId: row.leadInstitutionId,
        leadInstitutionName: row.leadInstitutionName,
        termYear: row.termYear,
        termNumber: row.termNumber,
        amount: value,
        occurredAt: new Date().toISOString().slice(0, 10),
        carriedOver: false,
        status: "PENDING",
      });
    }
  }

  return (
    <input
      type="number"
      min={0}
      value={value}
      onChange={(e) => setValue(Number(e.target.value))}
      onBlur={commit}
      title="회수불가(손실) 금액 직접 입력"
      className="w-24 text-xs text-right border border-transparent hover:border-slate-200 focus:border-blue-400 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500/30 bg-transparent focus:bg-white"
    />
  );
}

// ── TermGenerateForm ──────────────────────────────────────────
type RowState = {
  included: boolean;
  budget: number;
  feeRate: number;
  appliedFeeStr: string;
  registered?: boolean;
  registeredFee?: number;
  registeredStatus?: TermFee["status"];
};

const TERM_FEE_STATUS_LABEL: Record<TermFee["status"], string> = {
  SCHEDULED: "예정",
  DRAFT: "초안",
  CONFIRMED: "확정",
  BILLED: "발행완료",
};

function TermGenerateForm({ onClose }: { onClose: () => void }) {
  const { projects, projectMembers, feePolicies, fundingAgencies, termFees } = useStore();
  const [projectId, setProjectId]   = useState("");
  const [termYear, setTermYear]     = useState(new Date().getFullYear());
  const [termNumber, setTermNumber] = useState(1);
  const [rows, setRows]             = useState<Record<string, RowState>>({});

  const selectedProject = projects.find((p) => p.id === projectId) ?? null;
  const members = useMemo(
    () => (projectId ? projectMembers.filter((m) => m.projectId === projectId) : []),
    [projectId, projectMembers]
  );

  const selectedAgency   = fundingAgencies.find((a) => a.id === selectedProject?.agencyId);
  const selectedProgramType = selectedProject?.programType ?? "GENERAL";
  const effectivePolicy  = selectedProject
    ? (feePolicies.find((p) => p.agencyId === selectedProject.agencyId && p.status === "ACTIVE" && (p.programType ?? "GENERAL") === selectedProgramType) ??
       feePolicies.find((p) => p.agencyId === null && p.status === "ACTIVE" && (p.programType ?? "GENERAL") === selectedProgramType) ?? null)
    : null;

  function calcEffectiveRate(agencyId: string, grade?: string): number {
    const ruleGrade    = gradeToRuleGrade(grade);
    const agencyPolicy = feePolicies.find((p) => p.status === "ACTIVE" && p.agencyId === agencyId);
    const commonPolicy = feePolicies.find((p) => p.status === "ACTIVE" && p.agencyId === null);
    const activePolicy = agencyPolicy ?? commonPolicy;
    const baseRate     = activePolicy?.standardRate ?? 3.0;
    const rules        = (agencyPolicy?.rules.length ? agencyPolicy.rules : commonPolicy?.rules) ?? [];
    const rule         = rules.find((r) => r.grade === ruleGrade && r.settlementType === "위탁정산");
    const annualRatio  = rule?.annualRate ?? 85;
    return parseFloat((baseRate * annualRatio / 100).toFixed(2));
  }

  // 과제·연도·연차를 고를 때마다 참여기관별 행을 다시 구성한다.
  // 이미 등록된(자동/수동 무관) 기관은 included를 false로 두어 중복 생성을 막고 "등록됨"으로 표시한다.
  useEffect(() => {
    if (!projectId) { setRows({}); return; }
    const proj = projects.find((p) => p.id === projectId) ?? null;
    const mems = projectMembers.filter((m) => m.projectId === projectId);
    const init: Record<string, RowState> = {};
    mems.forEach((m) => {
      const rate = proj ? calcEffectiveRate(proj.agencyId, m.institutionGrade) : m.feeRate;
      const existing = proj
        ? termFees.find(
            (tf) =>
              tf.projectNumber === proj.projectNumber &&
              tf.termYear === termYear &&
              tf.termNumber === termNumber &&
              tf.institutionId === m.institutionId
          )
        : undefined;
      init[m.id] = {
        included: !existing,
        budget: m.budget,
        feeRate: rate,
        appliedFeeStr: "",
        registered: !!existing,
        registeredFee: existing?.appliedFee,
        registeredStatus: existing?.status,
      };
    });
    setRows(init);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, termYear, termNumber, projectMembers, termFees]);

  function calcFee(id: string) {
    const r = rows[id];
    return r ? Math.round((r.budget * r.feeRate) / 100) : 0;
  }

  function setRow(id: string, patch: Partial<RowState>) {
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  const included   = members.filter((m) => rows[m.id]?.included);
  const registered = members.filter((m) => rows[m.id]?.registered);
  const totalCalc  = included.reduce((s, m) => s + calcFee(m.id), 0);

  function handleSubmit() {
    if (!selectedProject) return;
    included.forEach((m) => {
      const r          = rows[m.id];
      const calculated = calcFee(m.id);
      addTermFee({
        projectNumber:   selectedProject.projectNumber,
        projectName:     selectedProject.projectName,
        termYear, termNumber,
        institutionId:   m.institutionId,
        institutionName: m.institutionName,
        institutionType: m.institutionType,
        budget:          r.budget,
        feeRate:         r.feeRate,
        calculatedFee:   calculated,
        appliedFee:      r.appliedFeeStr !== "" ? Number(r.appliedFeeStr) : calculated,
        status:          "DRAFT",
      });
    });
    onClose();
  }

  const INSTITUTION_TYPES: InstitutionType[] = [
    "대기업", "중견기업", "중소기업", "스타트업", "대학", "정부출연연구소", "공공기관",
  ];
  void INSTITUTION_TYPES;

  return (
    <div className="p-6 space-y-5">
      <div className="grid grid-cols-4 gap-4">
        <div className="col-span-2">
          <label className="block text-xs font-medium text-slate-600 mb-1">과제 선택</label>
          <select className={selectCls} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">과제를 선택하세요</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.projectName}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">연도</label>
          <input className={inputCls} type="number" value={termYear} onChange={(e) => setTermYear(Number(e.target.value))} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">연차</label>
          <input className={inputCls} type="number" min={1} value={termNumber} onChange={(e) => setTermNumber(Number(e.target.value))} />
        </div>
      </div>

      {selectedProject && (
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 px-4 py-3 space-y-2">
          <div className="flex items-center gap-4 text-xs">
            <span className="text-indigo-500 font-medium">전담기관</span>
            <span className="font-mono font-bold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded">
              {selectedAgency?.shortName ?? "—"}
            </span>
            <span className="text-slate-600">{selectedAgency?.name ?? "—"}</span>
          </div>
          {effectivePolicy && (
            <div className="flex items-center gap-4 text-xs flex-wrap">
              <span className="text-indigo-500 font-medium">수수료 기준</span>
              <span className="text-slate-700">{effectivePolicy.name} ({effectivePolicy.version})</span>
              <span className="text-slate-500">표준요율 <span className="font-semibold text-slate-800">{effectivePolicy.standardRate}%</span></span>
            </div>
          )}
          {effectivePolicy?.legacyTransitionNote && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700 leading-relaxed">
              <span className="font-semibold">경과조치 안내 · </span>{effectivePolicy.legacyTransitionNote}
            </div>
          )}
          <p className="text-xs text-slate-400">
            <span className="font-mono text-slate-500">{selectedProject.projectNumber}</span>
            {" · "}주관: <span className="text-slate-600">{selectedProject.leadInstitutionName}</span>
          </p>
        </div>
      )}

      {members.length > 0 ? (
        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600">참여기관별 수수료 산정</span>
            <span className="text-xs text-slate-400">
              {members.length}개 기관
              {registered.length > 0 && ` · 기존 등록 ${registered.length}건 제외`}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50 text-slate-500 font-medium">
                  <th className="px-3 py-2.5 text-center w-8">포함</th>
                  <th className="px-3 py-2.5 text-left">기관명</th>
                  <th className="px-3 py-2.5 text-center whitespace-nowrap">구분</th>
                  <th className="px-3 py-2.5 text-right whitespace-nowrap">연차 사업비(원)</th>
                  <th className="px-3 py-2.5 text-center whitespace-nowrap">요율</th>
                  <th className="px-3 py-2.5 text-right whitespace-nowrap">산정수수료</th>
                  <th className="px-3 py-2.5 text-right whitespace-nowrap">적용수수료 (조정시 입력)</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => {
                  const r = rows[m.id];
                  if (!r) return null;
                  const calc = calcFee(m.id);
                  return (
                    <tr key={m.id} className={`border-b border-slate-50 last:border-0 transition-opacity ${!r.included ? "opacity-35" : ""}`}>
                      <td className="px-3 py-2.5 text-center">
                        {r.registered ? (
                          <span
                            title={`이미 등록된 연차 수수료가 있습니다 (${r.registeredStatus ? TERM_FEE_STATUS_LABEL[r.registeredStatus] : ""})`}
                            className="inline-block whitespace-nowrap text-[10px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-1.5 py-0.5"
                          >
                            등록됨
                          </span>
                        ) : (
                          <input type="checkbox" checked={r.included} onChange={(e) => setRow(m.id, { included: e.target.checked })} className="rounded" />
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="font-medium text-slate-800">{m.institutionName}</p>
                        <p className="text-slate-400">
                          {m.role === "LEAD" ? "주관" : "참여"}
                          {r.registered && ` · 등록된 내용 (${r.registeredStatus ? TERM_FEE_STATUS_LABEL[r.registeredStatus] : ""}, ${fmtWon(r.registeredFee ?? 0)})`}
                        </p>
                      </td>
                      <td className="px-3 py-2.5 text-center text-slate-600 whitespace-nowrap">{m.institutionType}</td>
                      <td className="px-3 py-2.5">
                        <input type="number" disabled={!r.included} value={r.budget}
                          onChange={(e) => setRow(m.id, { budget: Number(e.target.value) })}
                          className="w-32 text-right border border-slate-200 rounded px-2 py-1 text-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:bg-slate-50 disabled:text-slate-300" />
                      </td>
                      <td className="px-3 py-2.5 text-center text-blue-700 font-medium whitespace-nowrap">{r.feeRate}%</td>
                      <td className="px-3 py-2.5 text-right text-slate-700 whitespace-nowrap font-medium">{fmtWon(calc)}</td>
                      <td className="px-3 py-2.5">
                        <input type="number" disabled={!r.included} value={r.appliedFeeStr} placeholder={String(calc)}
                          onChange={(e) => setRow(m.id, { appliedFeeStr: e.target.value })}
                          className="w-32 text-right border border-slate-200 rounded px-2 py-1 text-slate-700 placeholder-slate-300 focus:outline-none focus:ring-1 focus:ring-blue-400 disabled:bg-slate-50 disabled:text-slate-300" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="text-slate-400">포함 {included.length}개 기관 · 산정수수료 합계</span>
            <span className="font-semibold text-slate-700">{fmtWon(totalCalc)}</span>
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-400">
          과제를 선택하면 참여기관 목록이 자동으로 불러와집니다
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
        <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">취소</button>
        <button
          onClick={handleSubmit}
          disabled={!projectId || included.length === 0}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {included.length > 0 ? `${included.length}개 기관 수수료 생성` : "수수료 생성"}
        </button>
      </div>
    </div>
  );
}

// ── 열 헤더 정의 ──────────────────────────────────────────────
const COLUMNS = [
  { key: "agencyShortName",    label: "약칭",        width: "w-16",  align: "text-center" },
  { key: "projectNumber",      label: "과제번호",    width: "w-36",  align: "text-left"   },
  { key: "projectName",        label: "과제명",      width: "w-52",  align: "text-left"   },
  { key: "leadInstitutionName",label: "주관기관",    width: "w-32",  align: "text-left"   },
  { key: "researchLead",       label: "연구책임자",  width: "w-20",  align: "text-center" },
  { key: "startDate",          label: "당해시작일",  width: "w-24",  align: "text-center" },
  { key: "endDate",            label: "당해종료일",  width: "w-24",  align: "text-center" },
  { key: "billingType",        label: "발행구분",    width: "w-20",  align: "text-center" },
  { key: "invoiceIssuedAt",    label: "계산서일자",  width: "w-24",  align: "text-center" },
  { key: "supplyAmount",       label: "공급가액",    width: "w-28",  align: "text-right"  },
  { key: "taxAmount",          label: "부가세",      width: "w-24",  align: "text-right"  },
  { key: "totalInvoiceAmount", label: "합계",        width: "w-28",  align: "text-right"  },
  { key: "collectionStatus",   label: "수금표시",    width: "w-16",  align: "text-center" },
  { key: "paidAmount",         label: "수금액",      width: "w-28",  align: "text-right"  },
  { key: "receivableAmount",   label: "미수액",      width: "w-28",  align: "text-right"  },
  { key: "unclaimedAmount",    label: "손실금액",    width: "w-28",  align: "text-right"  },
  { key: "hasOpenIssue",       label: "이슈",        width: "w-12",  align: "text-center" },
  { key: "projectCode",        label: "과제코드",    width: "w-32",  align: "text-left"   },
  { key: "docRequestDate",     label: "서류요청",    width: "w-24",  align: "text-center" },
  { key: "docReplyDate",       label: "서류회신",    width: "w-24",  align: "text-center" },
  { key: "recipientName",      label: "수신자",      width: "w-20",  align: "text-center" },
  { key: "recipientEmail",     label: "수신자이메일",width: "w-44",  align: "text-left"   },
  { key: "projectDivision",    label: "구분",        width: "w-14",  align: "text-center" },
  { key: "assignedManager",    label: "삼화담당자",  width: "w-20",  align: "text-center" },
] as const;

// ── FeeRowDetail ──────────────────────────────────────────────
function FeeRowDetail({ row }: { row: FeeRow }) {
  return (
    <tr>
      <td colSpan={COLUMNS.length + 4} className="bg-slate-50/70 px-6 py-4 border-b border-slate-100">
        <div className="space-y-2">
          <p className="text-[10px] font-bold text-slate-400 tracking-widest mb-2">참여기관별 수수료</p>
          <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100 text-slate-500">
                  <th className="text-left px-3 py-2">기관명</th>
                  <th className="text-center px-3 py-2">역할</th>
                  <th className="text-center px-3 py-2">유형</th>
                  <th className="text-right px-3 py-2">사업비</th>
                  <th className="text-center px-3 py-2">요율</th>
                  <th className="text-right px-3 py-2">산정수수료</th>
                  <th className="text-right px-3 py-2">적용수수료</th>
                  <th className="text-center px-3 py-2">상태</th>
                </tr>
              </thead>
              <tbody>
                {row.fees.map((tf) => (
                  <tr key={tf.id} className="border-b border-slate-50 last:border-0">
                    <td className="px-3 py-2 font-medium text-slate-800">{tf.institutionName}</td>
                    <td className="px-3 py-2 text-center text-slate-500">{tf.institutionType}</td>
                    <td className="px-3 py-2 text-center text-slate-400 text-[10px]">{tf.institutionType}</td>
                    <td className="px-3 py-2 text-right text-slate-600">{fmtWon(tf.budget)}</td>
                    <td className="px-3 py-2 text-center text-blue-700 font-medium">{tf.feeRate}%</td>
                    <td className="px-3 py-2 text-right text-slate-700">{fmtWon(tf.calculatedFee)}</td>
                    <td className="px-3 py-2 text-right font-medium">
                      <span className={tf.appliedFee === 0 ? "text-amber-500" : "text-slate-800"}>
                        {tf.appliedFee === 0 ? "미적용" : fmtWon(tf.appliedFee)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-center">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        tf.status === "BILLED"    ? "bg-green-100 text-green-700" :
                        tf.status === "CONFIRMED" ? "bg-blue-100 text-blue-700"  :
                        tf.status === "DRAFT"     ? "bg-slate-100 text-slate-500" :
                                                    "bg-amber-100 text-amber-700"
                      }`}>
                        {tf.status === "BILLED" ? "청구완료" : tf.status === "CONFIRMED" ? "확정" : tf.status === "DRAFT" ? "초안" : "예정"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </td>
    </tr>
  );
}

// ── 월 단축 버튼 헬퍼 ─────────────────────────────────────────
function monthRange(offset: number): [string, string] {
  const now   = new Date();
  const year  = now.getFullYear();
  const month = now.getMonth() + offset; // 0-indexed
  const d     = new Date(year, month, 1);
  const from  = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  const last  = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  const to    = `${last.getFullYear()}-${String(last.getMonth() + 1).padStart(2, "0")}-${String(last.getDate()).padStart(2, "0")}`;
  return [from, to];
}

function quarterRange(offset: number): [string, string] {
  const now     = new Date();
  const quarter = Math.floor(now.getMonth() / 3) + offset;
  const year    = now.getFullYear() + Math.floor(quarter / 4);
  const q       = ((quarter % 4) + 4) % 4;
  const from    = `${year}-${String(q * 3 + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(year, q * 3 + 3, 0);
  const to      = `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, "0")}-${String(lastDay.getDate()).padStart(2, "0")}`;
  return [from, to];
}

// ── FeesPage ──────────────────────────────────────────────────
export default function FeesPage() {
  const canEdit     = useCanWrite("fees");
  const allRows     = useFeeRows();
  const { fundingAgencies } = useStore();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [filterProjectNumber,   setFilterProjectNumber]   = useState("");
  const [filterProjectName,     setFilterProjectName]     = useState("");
  const [filterLeadInstitution, setFilterLeadInstitution] = useState("");
  const [filterResearchLead,    setFilterResearchLead]    = useState("");
  // 완료/종료된 과제는 더 이상 확인할 필요가 없어 기본값은 '진행중'
  const [filterProjectStatus,   setFilterProjectStatus]   = useState(() => searchParams.get("status") ?? "ACTIVE");
  const [filterAgency,          setFilterAgency]          = useState("ALL");
  const [filterBillingType,     setFilterBillingType]     = useState("ALL");
  const [filterCollectionStatus,setFilterCollectionStatus]= useState("ALL");
  const [filterOnlyReceivable,  setFilterOnlyReceivable]  = useState(false);
  const [invoiceDateFrom, setInvoiceDateFrom] = useState("");
  const [invoiceDateTo, setInvoiceDateTo]     = useState("");
  const [termEndDateFrom, setTermEndDateFrom] = useState("");
  const [termEndDateTo, setTermEndDateTo]     = useState("");
  const [expandedKey, setExpandedKey]     = useState<string | null>(null);
  const [modal, setModal]                 = useState<ModalState | null>(null);
  const [selectedKeys, setSelectedKeys]   = useState<Set<string>>(new Set());

  function applyDateRange(from: string, to: string) {
    setInvoiceDateFrom(from);
    setInvoiceDateTo(to);
  }

  function clearDateRange() {
    setInvoiceDateFrom("");
    setInvoiceDateTo("");
  }

  function clearTermEndDateRange() {
    setTermEndDateFrom("");
    setTermEndDateTo("");
  }

  const hasDateFilter = invoiceDateFrom !== "" || invoiceDateTo !== "";
  const hasTermEndDateFilter = termEndDateFrom !== "" || termEndDateTo !== "";

  const filtered = useMemo(
    () =>
      allRows.filter((r) => {
        const matchProjectNumber    = filterProjectNumber    === "" || r.projectNumber.includes(filterProjectNumber);
        const matchProjectName      = filterProjectName      === "" || r.projectName.includes(filterProjectName);
        const matchLeadInstitution  = filterLeadInstitution  === "" || r.leadInstitutionName.includes(filterLeadInstitution);
        const matchResearchLead     = filterResearchLead     === "" || r.researchLead.includes(filterResearchLead);
        const matchStatus           = filterProjectStatus    === "ALL" || r.projectStatus === filterProjectStatus;
        const matchAgency           = filterAgency           === "ALL" || r.agencyShortName === filterAgency;
        const matchBillingType      = filterBillingType      === "ALL" || r.billingType === filterBillingType;
        const matchCollectionStatus = filterCollectionStatus === "ALL" || r.collectionStatus === filterCollectionStatus;
        const matchOnlyReceivable   = !filterOnlyReceivable  || r.receivableAmount > 0;

        const dt = r.invoiceIssuedAt;
        const matchFrom = invoiceDateFrom === "" || (dt !== "" && dt >= invoiceDateFrom);
        const matchTo   = invoiceDateTo   === "" || (dt !== "" && dt <= invoiceDateTo);

        const endDt = r.endDate;
        const matchEndFrom = termEndDateFrom === "" || (endDt !== "" && endDt >= termEndDateFrom);
        const matchEndTo   = termEndDateTo   === "" || (endDt !== "" && endDt <= termEndDateTo);

        return matchProjectNumber && matchProjectName && matchLeadInstitution && matchResearchLead
          && matchStatus && matchAgency && matchBillingType && matchCollectionStatus
          && matchOnlyReceivable && matchFrom && matchTo && matchEndFrom && matchEndTo;
      }),
    [allRows, filterProjectNumber, filterProjectName, filterLeadInstitution, filterResearchLead,
     filterProjectStatus, filterAgency, filterBillingType, filterCollectionStatus, filterOnlyReceivable,
     invoiceDateFrom, invoiceDateTo, termEndDateFrom, termEndDateTo]
  );

  // 요약 통계
  const totalSupply     = filtered.reduce((s, r) => s + r.supplyAmount, 0);
  const totalPaid       = filtered.reduce((s, r) => s + r.paidAmount, 0);
  const totalReceivable = filtered.reduce((s, r) => s + r.receivableAmount, 0);
  const totalUnclaimed  = filtered.reduce((s, r) => s + r.unclaimedAmount, 0);

  function toggleExpand(key: string) {
    setExpandedKey((prev) => (prev === key ? null : key));
  }

  function toggleSelect(key: string) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const allVisibleSelected = filtered.length > 0 && filtered.every((r) => selectedKeys.has(r.key));

  function toggleSelectAll() {
    setSelectedKeys((prev) => {
      if (allVisibleSelected) return new Set();
      const next = new Set(prev);
      filtered.forEach((r) => next.add(r.key));
      return next;
    });
  }

  function completeSelected() {
    const projectIds = Array.from(
      new Set(filtered.filter((r) => selectedKeys.has(r.key)).map((r) => r.projectId))
    ).filter(Boolean);
    if (projectIds.length === 0) return;
    if (!confirm(`선택한 과제 ${projectIds.length}건을 '완료' 상태로 변경하시겠습니까?`)) return;
    projectIds.forEach((id) => updateProject(id, { status: "COMPLETED" }));
    setSelectedKeys(new Set());
  }

  function cell(row: FeeRow, colKey: string) {
    switch (colKey) {
      case "agencyShortName":
        return row.agencyShortName ? (
          <Link href={`/projects/${row.projectId}`} className="font-mono text-[11px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded hover:bg-indigo-100 transition-colors">
            {row.agencyShortName}
          </Link>
        ) : <span className="text-slate-300">—</span>;

      case "projectNumber":
        return <Link href={`/projects/${row.projectId}`} className="font-mono text-[11px] text-slate-500 hover:text-blue-600 hover:underline transition-colors">{row.projectNumber}</Link>;

      case "projectName":
        return (
          <Link href={`/projects/${row.projectId}`} className="font-medium text-blue-600 hover:underline hover:text-blue-800 text-xs line-clamp-2 max-w-50" title={row.projectName}>
            {row.projectName}
          </Link>
        );

      case "leadInstitutionName":
        return row.leadInstitutionName ? (
          <Link href={`/institutions/${row.leadInstitutionId}`} className="text-xs text-slate-700 hover:text-blue-600 hover:underline transition-colors">{row.leadInstitutionName}</Link>
        ) : <span className="text-slate-300">—</span>;

      case "researchLead":
        return row.researchLead ? (
          <Link href={`/researchers/${encodeURIComponent(row.researchLead)}`} className="text-xs text-slate-700 hover:text-blue-600 hover:underline transition-colors">{row.researchLead}</Link>
        ) : <span className="text-slate-300">—</span>;

      case "startDate":
        return <span className="text-xs text-slate-600">{row.startDate ? fmtDate(row.startDate) : "—"}</span>;

      case "endDate":
        return <span className="text-xs text-slate-600">{row.endDate ? fmtDate(row.endDate) : "—"}</span>;

      case "billingType":
        return row.billingType ? (
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded whitespace-nowrap ${BILLING_TYPE_COLOR[row.billingType] ?? "bg-slate-100 text-slate-600"}`}>
            {row.billingType}
          </span>
        ) : <span className="text-slate-300">—</span>;

      case "invoiceIssuedAt":
        return <span className="text-xs text-slate-600">{row.invoiceIssuedAt ? fmtDate(row.invoiceIssuedAt) : "—"}</span>;

      case "supplyAmount":
        return <span className="text-xs font-medium text-slate-800">{row.supplyAmount ? fmtWon(row.supplyAmount) : "—"}</span>;

      case "taxAmount":
        return <span className="text-xs text-slate-600">{row.taxAmount ? fmtWon(row.taxAmount) : "—"}</span>;

      case "totalInvoiceAmount":
        return <span className="text-xs font-bold text-slate-800">{row.totalInvoiceAmount ? fmtWon(row.totalInvoiceAmount) : "—"}</span>;

      case "collectionStatus":
        return row.collectionStatus ? (
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${COLLECTION_STATUS_COLOR[row.collectionStatus] ?? "bg-slate-100 text-slate-500"}`}>
            {COLLECTION_STATUS_LABEL[row.collectionStatus] ?? row.collectionStatus}
          </span>
        ) : <span className="text-slate-300">—</span>;

      case "paidAmount":
        return (
          <span className={`text-xs font-medium ${row.paidAmount > 0 ? "text-green-700" : "text-slate-300"}`}>
            {row.paidAmount > 0 ? fmtWon(row.paidAmount) : "—"}
          </span>
        );

      case "receivableAmount":
        return (
          <span className={`text-xs font-bold ${row.receivableAmount > 0 ? "text-red-600" : "text-slate-300"}`}>
            {row.receivableAmount > 0 ? fmtWon(row.receivableAmount) : "—"}
          </span>
        );

      case "unclaimedAmount":
        return <UnclaimedAmountCell row={row} canEdit={canEdit} />;

      case "hasOpenIssue":
        return row.hasOpenIssue ? (
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-50 text-red-600 text-[11px] font-bold">O</span>
        ) : (
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-100 text-slate-400 text-[11px] font-bold">X</span>
        );

      case "projectCode":
        return <span className="font-mono text-[11px] text-slate-500">{row.projectCode || "—"}</span>;

      case "docRequestDate":
        return <span className="text-xs text-slate-600">{row.docRequestDate ? fmtDate(row.docRequestDate) : "—"}</span>;

      case "docReplyDate":
        return row.docReplyDate ? (
          <span className="text-xs text-blue-600">{fmtDate(row.docReplyDate)}</span>
        ) : (
          row.docRequestDate ? (
            <span className="text-xs text-amber-500">미회신</span>
          ) : (
            <span className="text-slate-300">—</span>
          )
        );

      case "recipientName":
        return <span className="text-xs text-slate-700">{row.recipientName || "—"}</span>;

      case "recipientEmail":
        return row.recipientEmail ? (
          <a href={`mailto:${row.recipientEmail}`} className="text-xs text-blue-500 hover:underline">
            {row.recipientEmail}
          </a>
        ) : <span className="text-slate-300">—</span>;

      case "projectDivision":
        return row.projectDivision ? (
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
            row.projectDivision === "위탁" ? "bg-sky-100 text-sky-700" : "bg-teal-100 text-teal-700"
          }`}>
            {row.projectDivision}
          </span>
        ) : <span className="text-slate-300">—</span>;

      case "assignedManager":
        return <span className="text-xs text-slate-700">{row.assignedManager || "—"}</span>;

      default:
        return null;
    }
  }

  return (
    <div className="space-y-4">
      {/* 상단 요약 */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">과제별 수수료·세금계산서 관리 · 전체 {allRows.length}건</p>
        {canEdit && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setModal({ mode: "project-add" })}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <FiPlus size={12} />
              새 과제 추가
            </button>
            <button
              onClick={() => setModal({ mode: "generate" })}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <FiPlus size={12} />
              연차 수수료 생성
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "공급가액 합계",   value: fmtWon(totalSupply),     color: "text-slate-800" },
          { label: "수금액 합계",     value: fmtWon(totalPaid),       color: "text-green-700" },
          { label: "미수액 합계",     value: fmtWon(totalReceivable), color: "text-red-600"   },
          { label: "미청구 손실 합계",value: fmtWon(totalUnclaimed),  color: "text-amber-600" },
        ].map((c) => (
          <div key={c.label} className="bg-white rounded-xl border border-slate-200 px-4 py-3">
            <p className="text-xs text-slate-500">{c.label}</p>
            <p className={`text-sm font-bold mt-0.5 ${c.color}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* 검색 + 날짜 필터 */}
      <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100">
        {/* 텍스트 필터 */}
        <div className="px-4 py-3 grid grid-cols-4 gap-3">
          {[
            { label: "과제번호",   value: filterProjectNumber,   onChange: setFilterProjectNumber   },
            { label: "과제명",     value: filterProjectName,     onChange: setFilterProjectName     },
            { label: "주관기관",   value: filterLeadInstitution, onChange: setFilterLeadInstitution },
            { label: "연구책임자", value: filterResearchLead,    onChange: setFilterResearchLead    },
          ].map(({ label, value, onChange }) => (
            <div key={label}>
              <p className="text-[10px] font-medium text-slate-400 mb-1">{label}</p>
              <input
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={`${label} 검색...`}
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-1.5 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
              />
            </div>
          ))}
        </div>

        {/* 상태 · 구분 필터 */}
        <div className="px-4 py-3 flex items-center gap-2 flex-wrap">
          <select
            value={filterProjectStatus}
            onChange={(e) => setFilterProjectStatus(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600 bg-white shrink-0 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          >
            <option value="ALL">전체 상태</option>
            <option value="ACTIVE">진행중</option>
            <option value="COMPLETED">완료</option>
            <option value="SUSPENDED">중단</option>
          </select>
          <span className="w-px h-4 bg-slate-200" />
          <select value={filterAgency} onChange={(e) => setFilterAgency(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600 bg-white shrink-0 focus:outline-none focus:ring-2 focus:ring-blue-500/30">
            <option value="ALL">전담기관 전체</option>
            {fundingAgencies.map((a) => (
              <option key={a.id} value={a.shortName}>{a.shortName} · {a.name}</option>
            ))}
          </select>
          <select value={filterBillingType} onChange={(e) => setFilterBillingType(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600 bg-white shrink-0 focus:outline-none focus:ring-2 focus:ring-blue-500/30">
            <option value="ALL">발행구분 전체</option>
            {["정발행", "역발행요청", "역발행", "대상아님", "면제"].map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
          <select value={filterCollectionStatus} onChange={(e) => setFilterCollectionStatus(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 text-slate-600 bg-white shrink-0 focus:outline-none focus:ring-2 focus:ring-blue-500/30">
            <option value="ALL">수금상태 전체</option>
            <option value="PAID">완납</option>
            <option value="PARTIAL">일부납부</option>
            <option value="PENDING">대기</option>
            <option value="OVERDUE">연체</option>
          </select>
          <label className="flex items-center gap-1.5 cursor-pointer ml-1 shrink-0">
            <input type="checkbox" checked={filterOnlyReceivable}
              onChange={(e) => setFilterOnlyReceivable(e.target.checked)}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500/30" />
            <span className="text-xs text-slate-600">미수 건만</span>
          </label>
          {(filterAgency !== "ALL" || filterBillingType !== "ALL" || filterCollectionStatus !== "ALL" || filterOnlyReceivable) && (
            <button
              onClick={() => { setFilterAgency("ALL"); setFilterBillingType("ALL"); setFilterCollectionStatus("ALL"); setFilterOnlyReceivable(false); }}
              className="text-xs text-slate-400 hover:text-slate-600 px-2 py-1 rounded hover:bg-slate-100 transition-colors ml-auto">
              초기화
            </button>
          )}
        </div>

        {/* 기간 필터 */}
        <div className="px-4 py-3 grid grid-cols-2 gap-x-6 gap-y-3">
          {/* 세금계산서 일자 */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">세금계산서 일자</span>
              {hasDateFilter && (
                <button
                  onClick={clearDateRange}
                  className="text-[11px] text-slate-400 hover:text-slate-600 px-1.5 py-0.5 rounded hover:bg-slate-100 transition-colors"
                >
                  초기화
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <DateInput value={invoiceDateFrom} onChange={setInvoiceDateFrom} className="w-28" />
              <span className="text-slate-400 text-xs">~</span>
              <DateInput value={invoiceDateTo} onChange={setInvoiceDateTo} className="w-28" />
            </div>
            <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
              {[
                { label: "이번달",   fn: () => applyDateRange(...monthRange(0))   },
                { label: "지난달",   fn: () => applyDateRange(...monthRange(-1))  },
                { label: "2개월 전", fn: () => applyDateRange(...monthRange(-2))  },
                { label: "이번분기", fn: () => applyDateRange(...quarterRange(0)) },
                { label: "지난분기", fn: () => applyDateRange(...quarterRange(-1))},
              ].map(({ label, fn }) => (
                <button
                  key={label}
                  onClick={fn}
                  className="text-xs px-2.5 py-1 rounded-md border border-slate-200 text-slate-600 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition-colors"
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* 당해종료일 */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">당해종료일</span>
              {hasTermEndDateFilter && (
                <button
                  onClick={clearTermEndDateRange}
                  className="text-[11px] text-slate-400 hover:text-slate-600 px-1.5 py-0.5 rounded hover:bg-slate-100 transition-colors"
                >
                  초기화
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <DateInput value={termEndDateFrom} onChange={setTermEndDateFrom} className="w-28" />
              <span className="text-slate-400 text-xs">~</span>
              <DateInput value={termEndDateTo} onChange={setTermEndDateTo} className="w-28" />
            </div>
          </div>
        </div>

        {(hasDateFilter || hasTermEndDateFilter) && (
          <div className="px-4 py-2 flex justify-end">
            <span className="text-xs text-blue-600 font-medium">{filtered.length}건 해당</span>
          </div>
        )}
      </div>

      {/* 다중 선택 일괄 처리 */}
      {canEdit && selectedKeys.size > 0 && (
        <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5">
          <span className="text-xs font-medium text-blue-700">{selectedKeys.size}건 선택됨</span>
          <button
            onClick={completeSelected}
            className="text-xs font-medium px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          >
            선택 과제 완료 처리
          </button>
          <button
            onClick={() => setSelectedKeys(new Set())}
            className="text-xs text-slate-500 hover:text-slate-700 px-2 py-1.5 rounded hover:bg-white transition-colors"
          >
            선택 해제
          </button>
        </div>
      )}

      {/* 메인 테이블 */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="text-xs" style={{ minWidth: "2400px" }}>
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50">
                {canEdit && (
                  <th className="w-8 px-2 py-3 shrink-0">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleSelectAll}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500/30"
                    />
                  </th>
                )}
                <th className="w-8 px-2 py-3 shrink-0" />
                {COLUMNS.map((col) => (
                  <th
                    key={col.key}
                    className={`px-3 py-3 font-medium text-slate-500 whitespace-nowrap ${col.align} ${col.width}`}
                  >
                    {col.label}
                  </th>
                ))}
                <th className="px-3 py-3 text-center font-medium text-slate-500 whitespace-nowrap w-24">공문발송</th>
                <th className="px-3 py-3 text-center font-medium text-slate-500 whitespace-nowrap w-32">매출관리</th>
                <th className="px-3 py-3 text-center font-medium text-slate-500 whitespace-nowrap w-20">수금관리</th>
                <th className="px-3 py-3 text-center font-medium text-slate-500 whitespace-nowrap w-20">정보수정</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNS.length + (canEdit ? 6 : 5)} className="px-4 py-10 text-center text-sm text-slate-400">
                    검색 결과가 없습니다
                  </td>
                </tr>
              ) : (
                filtered.flatMap((row) => {
                  const isExpanded   = expandedKey === row.key;
                  const hasReceivable = row.receivableId !== "";
                  const isFullyPaid   = row.collectionStatus === "PAID";
                  return [
                    <tr
                      key={row.key}
                      className={`border-b border-slate-50 transition-colors ${isExpanded ? "bg-blue-50/30" : "hover:bg-slate-50"}`}
                    >
                      {canEdit && (
                        <td className="px-2 py-2.5 text-center shrink-0">
                          <input
                            type="checkbox"
                            checked={selectedKeys.has(row.key)}
                            onChange={() => toggleSelect(row.key)}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500/30"
                          />
                        </td>
                      )}
                      <td className="px-2 py-2.5 text-center shrink-0">
                        <button
                          onClick={() => toggleExpand(row.key)}
                          className={`p-1 rounded transition-colors ${isExpanded ? "text-blue-600 bg-blue-100" : "text-slate-300 hover:text-slate-500 hover:bg-slate-100"}`}
                        >
                          {isExpanded ? <FiChevronUp size={13} /> : <FiChevronDown size={13} />}
                        </button>
                      </td>
                      {COLUMNS.map((col) => (
                        <td
                          key={col.key}
                          className={`px-3 py-2.5 ${col.align} ${col.width} align-middle`}
                        >
                          {cell(row, col.key)}
                        </td>
                      ))}
                      {/* 공문발송 드롭다운 */}
                      <td className="px-3 py-2.5 text-center align-middle w-24">
                        {row.taxInvoiceId && row.taxInvoiceStatus !== "CANCELED" ? (
                          <DispatchDropdown
                            onSelect={(cat) =>
                              setModal({
                                mode: "dispatch",
                                target: {
                                  projectNumber:       row.projectNumber,
                                  projectName:         row.projectName,
                                  leadInstitutionName: row.leadInstitutionName,
                                  termYear:            row.termYear,
                                  termNumber:          row.termNumber,
                                  recipientEmail:      row.recipientEmail,
                                  recipientName:       row.recipientName,
                                  feeCategory:         cat,
                                  supplyAmount:        row.supplyAmount,
                                  taxAmount:           row.taxAmount,
                                  totalAmount:         row.totalInvoiceAmount,
                                },
                              })
                            }
                          />
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>
                      {/* 매출관리 버튼 */}
                      <td className="px-3 py-2.5 text-center align-middle w-32">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() =>
                              setModal({
                                mode: "sales-issue",
                                target: {
                                  projectId:           row.projectId,
                                  projectNumber:       row.projectNumber,
                                  projectName:         row.projectName,
                                  leadInstitutionName: row.leadInstitutionName,
                                  termYear:            row.termYear,
                                  termNumber:          row.termNumber,
                                  currentBillingType:  row.billingType,
                                  currentIssuedAt:     row.invoiceIssuedAt,
                                  taxInvoiceId:        row.taxInvoiceId,
                                  taxInvoiceStatus:    row.taxInvoiceStatus,
                                  appliedFeeTotal:     row.appliedFeeTotal,
                                },
                              })
                            }
                            className="text-[11px] font-medium px-2 py-1 rounded transition-colors whitespace-nowrap bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200"
                          >
                            매출발행
                          </button>
                          {row.taxInvoiceId && row.taxInvoiceStatus !== "CANCELED" && (
                            <button
                              onClick={() =>
                                setModal({
                                  mode: "sales-cancel",
                                  target: {
                                    projectId:           row.projectId,
                                    projectNumber:       row.projectNumber,
                                    projectName:         row.projectName,
                                    leadInstitutionName: row.leadInstitutionName,
                                    termYear:            row.termYear,
                                    termNumber:          row.termNumber,
                                    currentBillingType:  row.billingType,
                                    currentIssuedAt:     row.invoiceIssuedAt,
                                    taxInvoiceId:        row.taxInvoiceId,
                                    taxInvoiceStatus:    row.taxInvoiceStatus,
                                    appliedFeeTotal:     row.appliedFeeTotal,
                                  },
                                })
                              }
                              className="text-[11px] font-medium px-2 py-1 rounded transition-colors whitespace-nowrap bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200"
                            >
                              매출취소
                            </button>
                          )}
                        </div>
                      </td>
                      {/* 수금관리 버튼 */}
                      <td className="px-3 py-2.5 text-center align-middle w-20">
                        {hasReceivable ? (
                          <button
                            onClick={() =>
                              setModal({
                                mode: "collection",
                                target: {
                                  receivableId:       row.receivableId,
                                  projectName:        row.projectName,
                                  leadInstitutionName:row.leadInstitutionName,
                                  billedAmount:       row.billedAmount,
                                  paidAmount:         row.paidAmount,
                                  receivableAmount:   row.receivableAmount,
                                },
                              })
                            }
                            className={`text-[11px] font-medium px-2 py-1 rounded transition-colors whitespace-nowrap ${
                              isFullyPaid
                                ? "bg-green-50 text-green-600 hover:bg-green-100 border border-green-200"
                                : row.paidAmount > 0
                                ? "bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200"
                                : "bg-blue-50 text-blue-600 hover:bg-blue-100 border border-blue-200"
                            }`}
                          >
                            {isFullyPaid ? "수금완료" : row.paidAmount > 0 ? "수금수정" : "수금등록"}
                          </button>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>
                      {/* 정보수정 버튼 */}
                      <td className="px-3 py-2.5 text-center align-middle w-20">
                        {canEdit && (
                          <button
                            onClick={() =>
                              setModal({
                                mode: "info-edit",
                                target: {
                                  projectId:       row.projectId,
                                  projectName:     row.projectName,
                                  leadMemberId:    row.leadMemberId,
                                  docRequestDate:  row.docRequestDate,
                                  docReplyDate:    row.docReplyDate,
                                  recipientName:   row.recipientName,
                                  recipientEmail:  row.recipientEmail,
                                  assignedManager: row.assignedManager,
                                },
                              })
                            }
                            className="text-[11px] font-medium px-2 py-1 rounded transition-colors whitespace-nowrap bg-slate-50 text-slate-600 hover:bg-slate-100 border border-slate-200"
                          >
                            정보수정
                          </button>
                        )}
                      </td>
                    </tr>,
                    isExpanded && (
                      <FeeRowDetail key={`${row.key}-detail`} row={row} />
                    ),
                  ].filter(Boolean);
                })
              )}
            </tbody>
          </table>
        </div>
        <div className="px-4 py-2.5 border-t border-slate-100 text-xs text-slate-400">
          총 {filtered.length}건 표시 (전체 {allRows.length}건)
        </div>
      </div>

      {modal?.mode === "generate" && (
        <Modal title="연차 수수료 생성" onClose={() => setModal(null)} size="xl">
          <TermGenerateForm onClose={() => setModal(null)} />
        </Modal>
      )}
      {modal?.mode === "project-add" && (
        <Modal title="새 과제 추가" onClose={() => setModal(null)} size="xl">
          <ProjectAddForm
            onClose={(createdId) => {
              setModal(null);
              if (createdId) router.push(`/projects/${createdId}`);
            }}
          />
        </Modal>
      )}
      {modal?.mode === "collection" && (
        <Modal
          title={
            modal.target.paidAmount > 0
              ? `수금 수정 — ${modal.target.leadInstitutionName}`
              : `수금 등록 — ${modal.target.leadInstitutionName}`
          }
          onClose={() => setModal(null)}
          size="sm"
        >
          <CollectionModal target={modal.target} onClose={() => setModal(null)} />
        </Modal>
      )}
      {modal?.mode === "sales-issue" && (
        <Modal
          title={modal.target.taxInvoiceId ? "매출 수정" : "매출 발행"}
          onClose={() => setModal(null)}
          size="md"
        >
          <SalesIssueModal target={modal.target} onClose={() => setModal(null)} />
        </Modal>
      )}
      {modal?.mode === "sales-cancel" && (
        <Modal title="매출 취소" onClose={() => setModal(null)} size="sm">
          <SalesCancelModal target={modal.target} onClose={() => setModal(null)} />
        </Modal>
      )}
      {modal?.mode === "dispatch" && (
        <Modal
          title="세금계산서 공문 발송"
          onClose={() => setModal(null)}
          size="lg"
        >
          <DispatchModal target={modal.target} onClose={() => setModal(null)} />
        </Modal>
      )}
      {modal?.mode === "info-edit" && (
        <Modal title="과제 정보 수정" onClose={() => setModal(null)} size="md">
          <InfoEditModal target={modal.target} onClose={() => setModal(null)} />
        </Modal>
      )}
    </div>
  );
}
