"use client";

import { useState, useMemo, useRef, useEffect, type CSSProperties } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import * as XLSX from "xlsx";
import { FiPlus, FiChevronDown, FiChevronUp, FiChevronRight, FiMail, FiSend, FiDownload, FiX } from "react-icons/fi";
import ExcelUploadModal, { downloadExcelTemplate } from "@/components/common/ExcelUploadModal";
import {
  useStore,
  addReceivable,
  updateReceivable,
  updateProject,
  updateProjectMember,
  updateTermFee,
  addTaxInvoice,
  updateTaxInvoice,
  addEmailDispatch,
  addUnclaimedFee,
  updateUnclaimedFee,
  addProject,
  updateStandardAttachment,
} from "@/lib/store";
import {
  type TermFee,
  type FeePolicy,
  type TaxInvoice,
  type Project,
  type ProjectIssue,
  type AgencyNoticeTemplateEntry,
  type SystemUser,
  EMPTY_NOTICE_TEMPLATE,
  EMPTY_FEE_INVOICE_TEMPLATE,
  COMPANY_INFO,
} from "@/lib/mock";
import { fmtWon, fmtDate, splitVatInclusive, addMonths, termDateRange } from "@/lib/utils";
import Modal from "@/components/common/Modal";
import DateInput from "@/components/common/DateInput";
import InstitutionQuickAdd from "@/components/common/InstitutionQuickAdd";
import MoneyInput from "@/components/common/MoneyInput";
import AgreementStructureEditor, { type Stage } from "@/components/common/AgreementStructureEditor";
import NoticeLetterPreview, { type NoticeStatusRow } from "@/components/common/NoticeLetterPreview";
import { buildNoticeEmailHtml } from "@/lib/notice-email-html";
import { useCanWrite } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/auth";
import { resolveRdaAgencyId, isSettlementTerm } from "@/lib/fee-calculator";
import { generateFeeInvoicePdfDataUrl } from "@/lib/fee-invoice-pdf";

// ── 타입 ──────────────────────────────────────────────────────
type FeeRow = {
  key: string;
  // 식별
  agencyShortName: string;
  projectNumber: string;
  projectName: string;
  leadInstitutionName: string;
  // 실제로 계산서·공문·수금이 청구되는 기관 — 통상 주관기관과 같지만, RDA2처럼 기관별로 따로
  // 청구하는 과제는 행이 기관별로 나뉘어 이 값이 그 행이 대표하는 참여기관으로 바뀐다.
  billedInstitutionId: string;
  billedInstitutionName: string;
  // 이 행이 RDA2 등에서 기관별로 분리된 청구 단위인지 — 세금계산서·채권을 새로 만들 때
  // institutionId를 함께 저장해야 다음 렌더에서 이 기관의 것으로 다시 찾을 수 있다.
  isSplitRow: boolean;
  researchLead: string;
  projectCategory: string;
  startDate: string;
  endDate: string;
  stageStartDate: string;
  stageEndDate: string;
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
  paidAt: string | null;
  receivableAmount: number;
  unclaimedAmount: number;
  // 과제 정보
  projectCode: string;
  agencyAssignedAt: string;
  // 서류요청일/회신일이 저장된 TermFee id — InfoEditModal에서 수정 시 이 id로 updateTermFee를 호출한다.
  docFeeId: string;
  docRequestDate: string;
  docReplyDate: string;
  recipientName: string;
  recipientEmail: string;
  projectDivision: string;
  assignedManager: string;
  registeredAt: string;
  // 매출 발행
  projectId: string;
  leadInstitutionId: string;
  taxInvoiceId: string;
  taxInvoiceStatus: TaxInvoice["status"] | "";
  appliedFeeTotal: number;
  // 타회계법인이 진행한 연차인지 — true면 appliedFeeTotal에서 그 기관들의 청구액은 이미 빠져있다
  // (삼화가 청구할 몫이 아니므로). 대신 otherFirmUnclaimedTotal에 그 기관들의 당해 미청구(15%)를 담아둔다 —
  // 이 금액은 나중에 정산연차에서 자동으로 이월·합산되므로 여기서 청구하면 안 되고 표시만 한다.
  otherFirmHandled: boolean;
  otherFirmUnclaimedTotal: number;
  // 원본 termFees (확장용)
  fees: TermFee[];
  // 이 과제에 연차별 수수료(TermFee) 기록이 하나도 없어서 만든 자리표시 행인지 — 대시보드
  // 파이프라인(진행중/완료/중단)에서 클릭해 들어왔을 때 과제 자체는 보이되 수수료 관련 칸은
  // 비어 있는 이유를 알 수 있게 표시한다.
  noFeeRecord: boolean;
  termYear: number;
  termNumber: number;
  totalTerms: number;
  effectivePolicy: FeePolicy | null;
  projectStatus: "ACTIVE" | "COMPLETED" | "SUSPENDED" | "";
  // 수정용 참조 id
  unclaimedFeeId: string;
  leadMemberId: string;
  issues: ProjectIssue[];
};

type CollectionTarget = {
  receivableId: string;
  projectName: string;
  leadInstitutionName: string;
  billedAmount: number;
  paidAmount: number;
  paidAt: string | null;
  receivableAmount: number;
};

type SalesTarget = {
  projectId: string;
  projectNumber: string;
  projectName: string;
  leadInstitutionName: string;
  institutionId?: string; // RDA2 등 기관별 분리 청구 행일 때만 채워짐
  termYear: number;
  termNumber: number;
  currentBillingType: string;
  currentIssuedAt: string;
  taxInvoiceId: string;
  taxInvoiceStatus: TaxInvoice["status"] | "";
  appliedFeeTotal: number;
  receivableId: string;
  paidAmount: number;
};

type DispatchTarget = {
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

type InfoEditTarget = {
  projectId:      string;
  projectName:    string;
  leadMemberId:   string;
  docFeeId:       string;
  docRequestDate: string;
  docReplyDate:   string;
  recipientName:  string;
  recipientEmail: string;
  assignedManager: string;
  registeredAt:   string;
};

type ModalState =
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

    const { supplyAmount, taxAmount } = splitVatInclusive(target.appliedFeeTotal);
    const totalAmount = target.appliedFeeTotal;

    const now = new Date();
    const invoiceNumber = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(Math.floor(Math.random() * 90000) + 10000)}`;

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
      addTaxInvoice({
        invoiceNumber,
        projectNumber:       target.projectNumber,
        projectName:         target.projectName,
        termYear:            target.termYear,
        termNumber:          target.termNumber,
        leadInstitutionId:   "",
        leadInstitutionName: target.leadInstitutionName,
        institutionId:       target.institutionId,
        issuedAt,
        supplyAmount,
        taxAmount,
        totalAmount,
        status:              "ISSUED",
      });
    }

    // 3. 세금계산서를 발행하면 수금관리에서 처리할 수 있도록 채권(미수금) 레코드도 함께 생성/갱신한다.
    //    (과거엔 여기서 채권을 만들지 않아, 발행 이력은 있는데 수금등록 버튼이 안 뜨는 과제가 있었음)
    if (target.receivableId) {
      updateReceivable(target.receivableId, {
        billedAt:         issuedAt,
        billedAmount:     totalAmount,
        receivableAmount: Math.max(0, totalAmount - target.paidAmount),
        dueDate:          addMonths(issuedAt, 3),
      });
    } else {
      addReceivable({
        invoiceNumber,
        projectNumber:       target.projectNumber,
        projectName:         target.projectName,
        termYear:            target.termYear,
        termNumber:          target.termNumber,
        leadInstitutionId:   "",
        leadInstitutionName: target.leadInstitutionName,
        institutionId:       target.institutionId,
        billedAt:            issuedAt,
        billedAmount:        totalAmount,
        paidAmount:          0,
        receivableAmount:    totalAmount,
        dueDate:             addMonths(issuedAt, 3),
        // 발행 직후 미입금 상태의 기본값은 "미수"(OVERDUE) — 만기일이 지나기 전까진 isOverdueByRule이
        // "연체"로 승격시키지 않으므로 화면엔 미수로만 표시되고, 만기일이 지나면 자동으로 연체가 된다.
        status:              "OVERDUE",
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
          <DateInput
            value={issuedAt}
            onChange={setIssuedAt}
            className="w-full"
          />
          {target.appliedFeeTotal > 0 && (() => {
            const { supplyAmount, taxAmount } = splitVatInclusive(target.appliedFeeTotal);
            return (
              <div className="text-[11px] text-slate-400 space-y-0.5">
                <span>공급가액 {fmtWon(supplyAmount)} · 부가세 {fmtWon(taxAmount)} · 합계 {fmtWon(target.appliedFeeTotal)}</span>
              </div>
            );
          })()}
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
      // billingType이 "정발행"으로 저장되어 있으면 취소 후에도 계속 그 표시가 남으므로 초기화한다.
      // (세금계산서가 실제로 취소됐는지와 무관하게 project.billingType은 별도 필드라 자동으로 안 지워짐)
      if (target.projectId && target.currentBillingType === "정발행") {
        updateProject(target.projectId, { billingType: undefined });
      }
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
          <DateInput
            value={newDate}
            onChange={setNewDate}
            className="w-full"
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
function fmtDot(s: string): string {
  if (!s) return "";
  const d = new Date(`${s}T00:00:00`);
  if (isNaN(d.getTime())) return "";
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}.`;
}

function parseEmails(raw: string): string[] {
  return raw.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
}

function generateBatchId(): string {
  return `BATCH-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(Math.random() * 9000) + 1000}`;
}

function generateDocNumber(): string {
  const yyyymm = new Date().toISOString().slice(0, 7).replace(/-/g, "");
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

type DispatchChoice =
  | { kind: "REGULAR" | "REVERSE"; feeCategory: "ANNUAL" | "SETTLEMENT" }
  | { kind: "OTHER" };

function DispatchDropdown({
  onSelect,
}: {
  onSelect: (choice: DispatchChoice) => void;
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

  function pick(choice: DispatchChoice) {
    setOpen(false);
    onSelect(choice);
  }

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
        <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden min-w-[190px]">
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
        </div>
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
    updateStandardAttachment(id, { fileDataUrl, updatedAt: new Date().toISOString().slice(0, 10) });
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
type AttachmentRow = { name: string; checked: boolean; dataUrl?: string };

function DispatchModal({ target, onClose }: { target: DispatchTarget; onClose: () => void }) {
  const { standardAttachments, users, feeInvoiceTemplates } = useStore();
  const bizRegAttachment = standardAttachments.find((a) => a.id === "sa-biz-reg");
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
${COMPANY_INFO.name}입니다.

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

■담당자 : ${COMPANY_INFO.managerName}(${COMPANY_INFO.managerEmail}, ${COMPANY_INFO.managerPhone})

■입금계좌 : ${COMPANY_INFO.depositAccountNote}


감사합니다.
${COMPANY_INFO.name} 드림`;
  }

  function buildAttachments(cat: "ANNUAL" | "SETTLEMENT"): AttachmentRow[] {
    const invoiceAttachment = { name: `청구서_${target.projectNumber}_${termLabel}.pdf`, checked: true };
    const bizRegAttachmentRow = { name: bizRegAttachment?.name ?? "사업자등록증.pdf", checked: true, dataUrl: bizRegAttachment?.fileDataUrl };
    // 기타 공문도 청구서 PDF는 자동 생성해 붙이되(대표양식은 OTHER 전용), 위탁정산내역서처럼 특정
    // 카테고리 전용 서류는 붙이지 않는다 — "기타"는 정형화된 카테고리가 아니라서 그 판단까지 자동화하지 않는다.
    if (isOther) return [invoiceAttachment, bizRegAttachmentRow];
    return [
      invoiceAttachment,
      bizRegAttachmentRow,
      ...(cat === "SETTLEMENT" ? [{ name: "위탁정산내역서.pdf", checked: true }] : []),
    ];
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceIndexRef = useRef<number | null>(null);

  const invoiceFileName = `청구서_${target.projectNumber}_${termLabel}.pdf`;

  // 청구서 문구/라벨은 하드코딩이 아니라 공문관리 > 수수료 청구서 양식(/notice-templates/invoices)에서
  // 카테고리별로 등록해둔 대표양식을 그대로 쓴다 — 선택 UI 없이 항상 자동 적용. 역발행/기타는 연차상시/
  // 위탁정산 어느 쪽이든 항상 REVERSE·OTHER 전용 대표양식을 쓴다(공문발송 드롭다운의 "역발행 수수료
  // 공문"·"기타 공문"이 연차상시/위탁정산 구분 없이 하나뿐인 것과 대응).
  const invoiceTemplateCategory =
    target.kind === "REVERSE" ? "REVERSE" : target.kind === "OTHER" ? "OTHER" : feeCategory;
  const invoiceTemplateEntry =
    feeInvoiceTemplates.find((t) => t.category === invoiceTemplateCategory && t.isDefault)
    ?? feeInvoiceTemplates.find((t) => t.category === invoiceTemplateCategory);
  const invoiceTemplateContent = invoiceTemplateEntry?.content ?? EMPTY_FEE_INVOICE_TEMPLATE;

  // 청구서(위탁정산/연차상시/역발행/기타) PDF는 반출용 파일이라 모달을 열 때, 그리고 구분(위탁정산↔
  // 연차상시)을 바꿀 때마다 값에 맞춰 새로 생성해 첨부에 자동으로 끼워 넣는다.
  useEffect(() => {
    let cancelled = false;
    setInvoiceGenerating(true);
    generateFeeInvoicePdfDataUrl({
      kind: target.kind,
      projectNumber: target.projectNumber,
      projectName: target.projectName,
      leadInstitutionName: target.leadInstitutionName,
      agencyShortName: target.agencyShortName,
      agencyFullName: target.agencyFullName,
      termYear: target.termYear,
      termNumber: target.termNumber,
      recipientName: target.recipientName,
      feeCategory,
      supplyAmount: target.supplyAmount,
      taxAmount: target.taxAmount,
      totalAmount: target.totalAmount,
      startDate: target.startDate,
      endDate: target.endDate,
      researchLead: target.researchLead,
      participantCount: target.participantCount,
      docNumber: target.docNumber,
    }, invoiceTemplateContent)
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
  }, [feeCategory, invoiceTemplateEntry?.id]);

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
      sentAt:               new Date().toISOString().replace("T", " ").slice(0, 16),
      senderName:           senderUser.name,
      recipientInstitution: target.leadInstitutionName,
      recipientEmail:       emails.join(", "),
      subject,
      emailType:            isOther ? "OTHER" : "TAX_INVOICE",
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
          수신자 이메일 <span className="text-slate-400 font-normal">(여러 명은 쉼표로 구분)</span>
        </label>
        <input
          type="text"
          value={toEmailRaw}
          onChange={(e) => setToEmailRaw(e.target.value)}
          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
          placeholder="example@domain.com, second@domain.com"
        />
        {target.recipientName && (
          <p className="text-[11px] text-slate-400">수신자: {target.recipientName}</p>
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
                <span className={`flex-1 text-xs truncate ${a.checked ? "text-slate-700" : "text-slate-300 line-through"}`}>
                  {a.name}
                </span>
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
    </div>
  );
}

// ── CollectionModal ───────────────────────────────────────────
function CollectionModal({ target, onClose }: { target: CollectionTarget; onClose: () => void }) {
  const [inputAmount, setInputAmount] = useState(0);
  const [paidAtInput, setPaidAtInput] = useState(target.paidAt ?? new Date().toISOString().slice(0, 10));
  const remaining = target.billedAmount - target.paidAmount;

  function calcStatus(paid: number): "PENDING" | "PARTIAL" | "PAID" | "OVERDUE" {
    if (paid <= 0)                         return "PENDING";
    if (paid >= target.billedAmount)       return "PAID";
    return "PARTIAL";
  }

  function handleSave() {
    if (inputAmount <= 0) return;
    const newPaid       = target.paidAmount + inputAmount;
    const newReceivable = Math.max(0, target.billedAmount - newPaid);
    updateReceivable(target.receivableId, {
      paidAmount:       newPaid,
      paidAt:           paidAtInput || undefined,
      receivableAmount: newReceivable,
      status:           calcStatus(newPaid),
    });
    onClose();
  }

  function handleFullPay() {
    if (remaining <= 0) return;
    updateReceivable(target.receivableId, {
      paidAmount:       target.billedAmount,
      paidAt:           paidAtInput || undefined,
      receivableAmount: 0,
      status:           "PAID",
    });
    onClose();
  }

  function handleCancel() {
    updateReceivable(target.receivableId, {
      paidAmount:       0,
      paidAt:           null,
      receivableAmount: target.billedAmount,
      status:           "PENDING",
    });
    onClose();
  }

  const previewPaid       = target.paidAmount + inputAmount;
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
          <MoneyInput
            value={inputAmount}
            onChange={setInputAmount}
            placeholder="0"
            className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
            autoFocus
          />
          <button
            onClick={() => setInputAmount(remaining)}
            disabled={remaining <= 0}
            className="px-3 py-2 text-xs font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
          >
            완납처리
          </button>
        </div>
      </div>

      {/* 수금일 */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-slate-600">수금일</label>
        <DateInput value={paidAtInput} onChange={setPaidAtInput} className="w-full" />
      </div>

      {/* 입력 후 미리보기 */}
      {inputAmount > 0 && (
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
            disabled={inputAmount <= 0}
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
  const [registeredAt, setRegisteredAt]       = useState(target.registeredAt);

  function handleSave() {
    updateProject(target.projectId, {
      assignedManager: assignedManager || undefined,
      registeredAt:   registeredAt || undefined,
    });
    if (target.docFeeId) {
      updateTermFee(target.docFeeId, {
        docRequestDate: docRequestDate || undefined,
        docReplyDate:   docReplyDate || undefined,
      });
    }
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

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">삼화담당자</label>
          <input
            value={assignedManager}
            onChange={(e) => setAssignedManager(e.target.value)}
            placeholder="담당자명"
            className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">등록일 (배정일)</label>
          <DateInput value={registeredAt} onChange={setRegisteredAt} className="w-full" />
        </div>
      </div>
      {!registeredAt && (
        <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          등록일이 없으면 이 과제는 통합 대시보드의 연도별 집계에서 제외됩니다.
        </p>
      )}

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
  agreementType: "BATCH" | "STAGED";
  stages: Stage[] | undefined;
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
  agreementType: "BATCH",
  stages: undefined,
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
    const lead = institutions.find((i) => i.id === form.leadInstitutionId);
    // 전담기관이 농촌진흥청 계열(RDA1/RDA2)이면 주관기관명으로 실제 트랙을 자동 교정한다 —
    // 두 레코드 모두 표시 이름이 "농촌진흥청"이라 사람이 직접 고르면 실수하기 쉽다.
    const rda2AffiliatedNames = fundingAgencies.find((a) => a.id === "fa-006")?.rda2AffiliatedInstitutionNames;
    const resolvedAgencyId = resolveRdaAgencyId(form.agencyId, lead?.name ?? "", rda2AffiliatedNames);
    const agency = fundingAgencies.find((a) => a.id === resolvedAgencyId);
    const created = addProject({
      projectNumber: form.projectNumber.trim(),
      projectName: form.projectName.trim(),
      agencyId: resolvedAgencyId,
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
      programType: resolvedAgencyId === "fa-003" ? form.programType : undefined,
      researchLead: form.researchLead || undefined,
      assignedManager: form.assignedManager || undefined,
      projectDivision: form.projectDivision || undefined,
      agreementType: form.agreementType,
      stages: form.agreementType === "STAGED" ? form.stages : undefined,
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
      <AgreementStructureEditor
        agreementType={form.agreementType}
        stages={form.stages}
        totalTerms={form.totalTerms}
        onChange={(agreementType, stages) => setForm((p) => ({ ...p, agreementType, stages }))}
      />
      <div className="rounded-lg border border-slate-100 bg-slate-50/50 px-4 py-3 space-y-3">
        <p className="text-xs font-semibold text-slate-600">사업비 구분 (당해 기준 — 참여기관·연차별 사업비는 등록 후 상세 화면에서 추가)</p>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">당해 정부출연금</label>
            <MoneyInput className={inputCls} value={form.govGrant} onChange={(v) => s("govGrant", v)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">당해 민간현금</label>
            <MoneyInput className={inputCls} value={form.privateCash} onChange={(v) => s("privateCash", v)} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">당해 민간현물</label>
            <MoneyInput className={inputCls} value={form.privateInKind} onChange={(v) => s("privateInKind", v)} />
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

    const rows: FeeRow[] = Array.from(groups.entries()).flatMap(([key, fees]) => {
      const f0 = fees[0];
      const project = projects.find((p) => p.projectNumber === f0.projectNumber);
      const agency  = fundingAgencies.find((a) => a.id === (project?.agencyId ?? ""));
      const programType = project?.programType ?? "GENERAL";
      const effectivePolicy =
        feePolicies.find((p) => p.agencyId === project?.agencyId && p.status === "ACTIVE" && (p.programType ?? "GENERAL") === programType) ??
        feePolicies.find((p) => p.agencyId === null && p.status === "ACTIVE" && (p.programType ?? "GENERAL") === programType) ??
        null;

      // 이슈/메모 (최신순) — 과제 단위라 기관별로 나뉘어도 동일하게 붙는다.
      const issues = projectIssues
        .filter((i) => i.projectNumber === f0.projectNumber)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      // 과제구분(연차상시/정산)과 당해시작일/종료일은 과제 전체 기간이 아니라 "이 행이 나타내는 연차"
      // 기준으로 계산해야 한다 — 다년차 과제는 연차마다 행이 따로 나오므로, project 레벨 고정값을 그대로
      // 쓰면 모든 연차 행이 똑같은 날짜/구분을 보여줘서 어느 연차인지 구분이 안 된다.
      const termRange = project ? termDateRange(project.startDate, f0.termNumber) : null;
      const projectCategory = project ? (isSettlementTerm(project, f0.termNumber) ? "정산" : "연차상시") : "연차상시";

      // RDA2는 참여기관마다 계산서·공문발송·수금을 따로 관리하므로(과제 상세의 BillingBlock과 동일 기준),
      // 실제로 수수료가 발생하는(appliedFee > 0) 기관마다 행을 따로 만든다. 그 외 전담기관은 지금까지와
      // 동일하게 연차 전체를 기관 구분 없이 1행으로 합친다.
      const isRda2 = project?.agencyId === "fa-006";
      const splitUnits = isRda2 ? fees.filter((f) => f.appliedFee > 0) : [];
      const unitGroups: TermFee[][] = splitUnits.length > 0 ? splitUnits.map((f) => [f]) : [fees];

      return unitGroups.map((unitFees) => {
        const isSplit = splitUnits.length > 0;
        const primary = unitFees[0];

        // 세금계산서 — 분리행이면 그 기관의 계산서만, 아니면 기존처럼 연차 통합 계산서를 찾는다.
        const invoice = taxInvoices.find(
          (ti) => ti.projectNumber === f0.projectNumber && ti.termYear === f0.termYear && ti.termNumber === f0.termNumber &&
            (isSplit ? ti.institutionId === primary.institutionId : true)
        );

        // 수금(receivable)
        const rv = receivables.find(
          (r) => r.projectNumber === f0.projectNumber && r.termYear === f0.termYear && r.termNumber === f0.termNumber &&
            (isSplit ? r.institutionId === primary.institutionId : true)
        );

        // 미청구 — 기관별 레코드가 없으므로 지금까지처럼 연차 단위로만 붙인다(분리행이어도 동일 값 공유).
        const ucRecord = unclaimedFees.find(
          (u) => u.projectNumber === f0.projectNumber && u.termYear === f0.termYear && u.termNumber === f0.termNumber
        );

        // 이 행의 청구 대상 기관 — 분리행이면 그 참여기관, 아니면 지금까지처럼 주관기관.
        const billedInstitutionId   = isSplit ? primary.institutionId   : (project?.leadInstitutionId ?? primary.institutionId);
        const billedInstitutionName = isSplit ? primary.institutionName : (project?.leadInstitutionName ?? primary.institutionName);

        // 수신자 담당자 — 분리행이면 그 기관의 참여기관 레코드, 아니면 지금까지처럼 주관기관(LEAD) 레코드.
        const recipientMember = isSplit
          ? projectMembers.find((pm) => pm.projectNumber === f0.projectNumber && pm.institutionId === primary.institutionId)
          : projectMembers.find((pm) => pm.projectNumber === f0.projectNumber && pm.role === "LEAD");

        // 서류요청일/회신일을 들고 있는 TermFee — 분리행이면 그 기관 자신, 아니면 주관기관 쪽(없으면
        // 청구(BILLED)된 쪽, 그것도 없으면 첫 번째 행)을 기본 소유자로 삼는다.
        const docOwner = isSplit
          ? primary
          : unitFees.find((f) => f.institutionId === project?.leadInstitutionId) ?? unitFees.find((f) => f.status === "BILLED") ?? primary;

        // 발행구분 — billingType 없으면 세금계산서 유무로 판별.
        // 단, 취소된(CANCELED) 계산서는 "발행됨"으로 치지 않는다 — 안 그러면 발행 취소 후에도
        // billingType이 비어있는 과제는 계속 "정발행"으로 표시되어 버린다.
        const billingType = project?.billingType ?? (invoice && invoice.status !== "CANCELED" ? "정발행" : "");
        // 타회계법인이 진행한 기관×연차는 삼화가 청구할 금액이 아니므로 appliedFeeTotal(실제 청구/발행 대상
        // 금액)에서 제외한다 — 그 몫의 당해 미청구(15%)는 otherFirmUnclaimedTotal로 따로 보여주기만 하고,
        // 정산연차가 되면 store.ts의 이월 로직이 알아서 그때 청구액에 합산한다.
        const appliedFeeTotal = unitFees.reduce((s, f) => s + (f.otherFirmHandled ? 0 : f.appliedFee), 0);
        const otherFirmHandled = unitFees.some((f) => f.otherFirmHandled);
        const otherFirmUnclaimedTotal = unitFees.reduce((s, f) => s + (f.otherFirmHandled ? (f.unclaimedFee ?? 0) : 0), 0);

        return {
          key: isSplit ? `${key}|${primary.institutionId}` : key,
          projectId:           project?.id ?? "",
          leadInstitutionId:   project?.leadInstitutionId ?? "",
          agencyShortName:     agency?.shortName ?? "",
          projectNumber:       f0.projectNumber,
          projectName:         f0.projectName,
          leadInstitutionName: project?.leadInstitutionName ?? "",
          billedInstitutionId,
          billedInstitutionName,
          isSplitRow:          isSplit,
          researchLead:        project?.researchLead ?? "",
          projectCategory,
          startDate:           termRange?.start ?? project?.startDate ?? "",
          endDate:             termRange?.end ?? project?.endDate ?? "",
          stageStartDate:      project?.stageStartDate ?? "",
          stageEndDate:        project?.stageEndDate ?? "",
          billingType,
          invoiceIssuedAt:     invoice?.issuedAt ?? "",
          supplyAmount:        invoice?.supplyAmount ?? 0,
          taxAmount:           invoice?.taxAmount ?? 0,
          totalInvoiceAmount:  invoice?.totalAmount ?? 0,
          receivableId:        rv?.id ?? "",
          billedAmount:        rv?.billedAmount ?? 0,
          collectionStatus:    rv?.status ?? "",
          paidAmount:          rv?.paidAmount ?? 0,
          paidAt:              rv?.paidAt ?? null,
          receivableAmount:    rv?.receivableAmount ?? 0,
          unclaimedAmount:     ucRecord?.amount ?? 0,
          projectCode:         project?.projectCode ?? "",
          agencyAssignedAt:    project?.agencyAssignedAt ?? "",
          docFeeId:            docOwner?.id ?? "",
          docRequestDate:      docOwner?.docRequestDate ?? "",
          docReplyDate:        docOwner?.docReplyDate ?? "",
          recipientName:       recipientMember?.contactName ?? "",
          recipientEmail:      recipientMember?.contactEmail ?? "",
          projectDivision:     project?.projectDivision ?? "",
          assignedManager:     project?.assignedManager ?? "",
          registeredAt:        project?.registeredAt ?? "",
          taxInvoiceId:        invoice?.id ?? "",
          taxInvoiceStatus:    invoice?.status ?? "",
          appliedFeeTotal,
          otherFirmHandled,
          otherFirmUnclaimedTotal,
          fees: unitFees,
          termYear:            f0.termYear,
          termNumber:          f0.termNumber,
          totalTerms:          project?.totalTerms ?? f0.termNumber,
          effectivePolicy,
          projectStatus:       project?.status ?? "",
          unclaimedFeeId:      ucRecord?.id ?? "",
          leadMemberId:        recipientMember?.id ?? "",
          issues,
          noFeeRecord: false,
        };
      });
    });

    // 연차별 수수료(TermFee) 기록이 하나도 없는 과제는 위 루프에서 아예 안 잡힌다 — 대시보드
    // "과제 파이프라인"(진행중/완료/중단)에서 그런 과제를 클릭해 들어오면 리스트가 통째로 비어 보여서
    // "왜 아무것도 안 보이지?"가 되므로, 과제 자체는 자리표시 행으로 보여주고 수수료 관련 칸만 비운다.
    const projectNumbersWithFees = new Set(termFees.map((tf) => tf.projectNumber));
    for (const project of projects) {
      if (projectNumbersWithFees.has(project.projectNumber)) continue;
      const agency = fundingAgencies.find((a) => a.id === project.agencyId);
      const leadMember = projectMembers.find((pm) => pm.projectNumber === project.projectNumber && pm.role === "LEAD");
      const issues = projectIssues
        .filter((i) => i.projectNumber === project.projectNumber)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      const termRange = termDateRange(project.startDate, project.currentTerm);
      rows.push({
        key: `no-fee|${project.projectNumber}`,
        projectId: project.id,
        leadInstitutionId: project.leadInstitutionId ?? "",
        agencyShortName: agency?.shortName ?? "",
        projectNumber: project.projectNumber,
        projectName: project.projectName,
        leadInstitutionName: project.leadInstitutionName ?? "",
        billedInstitutionId: project.leadInstitutionId ?? "",
        billedInstitutionName: project.leadInstitutionName ?? "",
        isSplitRow: false,
        researchLead: project.researchLead ?? "",
        projectCategory: isSettlementTerm(project, project.currentTerm) ? "정산" : "연차상시",
        startDate: termRange?.start ?? project.startDate ?? "",
        endDate: termRange?.end ?? project.endDate ?? "",
        stageStartDate: project.stageStartDate ?? "",
        stageEndDate: project.stageEndDate ?? "",
        billingType: project.billingType ?? "",
        invoiceIssuedAt: "",
        supplyAmount: 0,
        taxAmount: 0,
        totalInvoiceAmount: 0,
        receivableId: "",
        billedAmount: 0,
        collectionStatus: "",
        paidAmount: 0,
        paidAt: null,
        receivableAmount: 0,
        unclaimedAmount: 0,
        projectCode: project.projectCode ?? "",
        agencyAssignedAt: project.agencyAssignedAt ?? "",
        docFeeId: "",
        docRequestDate: "",
        docReplyDate: "",
        recipientName: leadMember?.contactName ?? "",
        recipientEmail: leadMember?.contactEmail ?? "",
        projectDivision: project.projectDivision ?? "",
        assignedManager: project.assignedManager ?? "",
        registeredAt: project.registeredAt ?? "",
        taxInvoiceId: "",
        taxInvoiceStatus: "",
        appliedFeeTotal: 0,
        fees: [],
        termYear: termRange ? Number(termRange.start.slice(0, 4)) : new Date().getFullYear(),
        termNumber: project.currentTerm,
        totalTerms: project.totalTerms,
        effectivePolicy: null,
        projectStatus: project.status ?? "",
        unclaimedFeeId: "",
        leadMemberId: leadMember?.id ?? "",
        issues,
        otherFirmHandled: false,
        otherFirmUnclaimedTotal: 0,
        noFeeRecord: true,
      });
    }

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
    // 손실금액만큼 미수 금액에서 자동 차감 반영
    if (row.receivableId) {
      updateReceivable(row.receivableId, {
        receivableAmount: Math.max(0, row.billedAmount - row.paidAmount - value),
      });
    }
  }

  return (
    <MoneyInput
      value={value}
      onChange={setValue}
      onBlur={commit}
      title="회수불가(손실) 금액 직접 입력"
      className="w-24 text-xs text-right border border-transparent hover:border-slate-200 focus:border-blue-400 rounded px-1.5 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500/30 bg-transparent focus:bg-white"
    />
  );
}

// ── 열 헤더 정의 ──────────────────────────────────────────────
const COLUMNS = [
  { key: "agencyShortName",    label: "약칭",        width: "w-20",  align: "text-center" },
  { key: "projectNumber",      label: "과제번호",    width: "w-32",  align: "text-left"   },
  { key: "projectName",        label: "과제명",      width: "w-40",  align: "text-left"   },
  { key: "leadInstitutionName",label: "주관기관",    width: "w-28",  align: "text-left"   },
  { key: "researchLead",       label: "연구책임자",  width: "w-20",  align: "text-center" },
  { key: "billedInstitutionName",label: "청구기관",  width: "w-24",  align: "text-left"   },
  { key: "term",                label: "연차",        width: "w-16",  align: "text-center" },
  { key: "projectCategory",    label: "과제구분",    width: "w-24",  align: "text-center" },
  { key: "startDate",          label: "당해시작일",  width: "w-24",  align: "text-center" },
  { key: "endDate",            label: "당해종료일",  width: "w-24",  align: "text-center" },
  { key: "billingType",        label: "발행구분",    width: "w-20",  align: "text-center" },
  { key: "invoiceIssuedAt",    label: "계산서일자",  width: "w-24",  align: "text-center" },
  { key: "supplyAmount",       label: "공급가액",    width: "w-28",  align: "text-right"  },
  { key: "taxAmount",          label: "부가세",      width: "w-24",  align: "text-right"  },
  { key: "totalInvoiceAmount", label: "합계",        width: "w-28",  align: "text-right"  },
  { key: "collectionStatus",   label: "수금표시",    width: "w-16",  align: "text-center" },
  { key: "paidAmount",         label: "수금액",      width: "w-28",  align: "text-right"  },
  { key: "paidAt",             label: "수금일",      width: "w-24",  align: "text-center" },
  { key: "receivableAmount",   label: "미수액",      width: "w-28",  align: "text-right"  },
  { key: "unclaimedAmount",    label: "손실금액",    width: "w-28",  align: "text-right"  },
  { key: "projectCode",        label: "과제코드",    width: "w-32",  align: "text-left"   },
  { key: "agencyAssignedAt",   label: "전담기관배정일",width: "w-24", align: "text-center" },
  { key: "docRequestDate",     label: "서류요청",    width: "w-24",  align: "text-center" },
  { key: "docReplyDate",       label: "서류회신",    width: "w-24",  align: "text-center" },
  { key: "recipientName",      label: "수신자",      width: "w-20",  align: "text-center" },
  { key: "recipientEmail",     label: "수신자이메일",width: "w-44",  align: "text-left"   },
  { key: "projectDivision",    label: "구분",        width: "w-16",  align: "text-center" },
  { key: "assignedManager",    label: "삼화담당자",  width: "w-20",  align: "text-center" },
] as const;

// ── 좌측 고정(freeze) 열 — 체크박스/펼치기 버튼 + 약칭~연구책임자는 가로로 스크롤해도 계속 보이게 고정한다.
// Tailwind의 w-* 유틸은 빌드 타임에 고정된 px값이라(w-20=80px 등) 여기서도 같은 값을 그대로 사용해
// sticky left 오프셋을 누적 계산한다 — 폭이 바뀌면 이 표도 같이 맞춰야 한다.
const STICKY_LEFT_KEYS = ["agencyShortName", "projectNumber", "projectName", "leadInstitutionName", "researchLead"] as const;
const STICKY_COL_PX: Record<string, number> = { agencyShortName: 80, projectNumber: 128, projectName: 160, leadInstitutionName: 112, researchLead: 80 };
const STICKY_CHECKBOX_PX = 32;
const STICKY_CHEVRON_PX = 32;

function stickyLeftOffset(key: string, canEdit: boolean): number {
  let left = (canEdit ? STICKY_CHECKBOX_PX : 0) + STICKY_CHEVRON_PX;
  for (const k of STICKY_LEFT_KEYS) {
    if (k === key) return left;
    left += STICKY_COL_PX[k];
  }
  return left;
}

// 고정열의 실제 렌더링 너비는 반드시 sticky left 계산에 쓴 값과 정확히 같아야 한다 — 하나라도 어긋나면
// (Tailwind width 클래스가 실제로 그 px값대로 안 먹는 경우 등) 처음부터(스크롤 전에도) 고정열끼리
// 서로 겹쳐 보인다. 그래서 Tailwind width 클래스 대신 인라인 style로 width/min/max를 못박아 확실히 맞춘다.
function fixedColStyle(px: number): CSSProperties {
  return { width: px, minWidth: px, maxWidth: px };
}

// ── FeeRowDetail (이슈/메모) ─────────────────────────────────────
const ISSUE_PRIORITY_STYLE: Record<string, string> = {
  HIGH: "bg-red-100 text-red-700",
  MEDIUM: "bg-amber-100 text-amber-700",
  LOW: "bg-slate-100 text-slate-500",
};
const ISSUE_PRIORITY_LABEL: Record<string, string> = { HIGH: "높음", MEDIUM: "보통", LOW: "낮음" };
const ISSUE_STATUS_STYLE: Record<string, string> = {
  OPEN: "bg-slate-100 text-slate-600",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  RESOLVED: "bg-green-100 text-green-700",
};
const ISSUE_STATUS_LABEL: Record<string, string> = { OPEN: "미처리", IN_PROGRESS: "진행중", RESOLVED: "완료" };

function FeeRowDetail({ row }: { row: FeeRow }) {
  return (
    <tr>
      <td colSpan={COLUMNS.length + 4} className="bg-slate-50/70 px-6 py-4 border-b border-slate-100">
        <div className="space-y-2">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-bold text-slate-400 tracking-widest">이슈 / 메모</p>
            <Link href="/issues" className="text-[11px] text-blue-500 hover:underline">이슈 관리로 이동 →</Link>
          </div>
          {row.issues.length === 0 ? (
            <div className="rounded-lg border border-slate-200 bg-white px-4 py-6 text-center text-xs text-slate-400">
              등록된 이슈/메모가 없습니다
            </div>
          ) : (
            <div className="rounded-lg border border-slate-200 bg-white divide-y divide-slate-100 overflow-hidden">
              {row.issues.map((issue) => (
                <div key={issue.id} className="px-4 py-2.5 flex items-start gap-3">
                  <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap ${ISSUE_PRIORITY_STYLE[issue.priority]}`}>
                    {ISSUE_PRIORITY_LABEL[issue.priority]}
                  </span>
                  <span className={`shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap ${ISSUE_STATUS_STYLE[issue.status ?? "OPEN"]}`}>
                    {ISSUE_STATUS_LABEL[issue.status ?? "OPEN"]}
                  </span>
                  <p className="flex-1 text-xs text-slate-700 leading-relaxed">{issue.content}</p>
                  <span className="shrink-0 text-[10px] text-slate-400 font-mono whitespace-nowrap">{issue.author} · {issue.createdAt}</span>
                </div>
              ))}
            </div>
          )}
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

// 사업(부가세 신고) 분기 — 1분기 4~6월, 2분기 7~9월, 3분기 10~12월, 4분기(익년) 1~3월.
// 오늘이 속한 결산연도(4월 시작) 기준으로 해당 분기의 날짜 범위를 계산한다.
function govFiscalQuarterRange(q: 1 | 2 | 3 | 4): [string, string] {
  const now = new Date();
  const cycleStartYear = now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;
  const year = q === 4 ? cycleStartYear + 1 : cycleStartYear;
  const startMonth = q === 4 ? 1 : (q - 1) * 3 + 4;
  const from    = `${year}-${String(startMonth).padStart(2, "0")}-01`;
  const lastDay = new Date(year, startMonth + 2, 0);
  const to      = `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, "0")}-${String(lastDay.getDate()).padStart(2, "0")}`;
  return [from, to];
}

// ── 정산절차 안내 공문 일괄발송 ────────────────────────────────
interface BulkNoticeTarget {
  projectId: string;
  projectNumber: string;
  projectName: string;
  agencyShortName: string;
  leadInstitutionName: string;
  recipientEmail: string;
  statusRows: NoticeStatusRow[];
  templates: AgencyNoticeTemplateEntry[];
}

function BulkSettlementNoticeModal({
  targets,
  startSeq,
  senderUser,
  onClose,
}: {
  targets: BulkNoticeTarget[];
  startSeq: number;
  senderUser: SystemUser | null;
  onClose: () => void;
}) {
  // 공문 양식이 없는 전담기관 과제는 보낼 방법이 없어 건너뛰고, 수신 이메일이 없는 과제도 자동 제외한다
  // (참여기관 목록에 담당자 이메일이 등록돼 있어야 함 — 과제 상세에서 확인 가능).
  const noTemplate = targets.filter((t) => t.templates.length === 0);
  const noEmail = targets.filter((t) => t.templates.length > 0 && !t.recipientEmail);
  const eligible = targets.filter((t) => t.templates.length > 0 && t.recipientEmail);

  const agencyGroups = useMemo(() => {
    const map = new Map<string, BulkNoticeTarget[]>();
    eligible.forEach((t) => {
      if (!map.has(t.agencyShortName)) map.set(t.agencyShortName, []);
      map.get(t.agencyShortName)!.push(t);
    });
    return [...map.entries()];
  }, [eligible]);

  const [templateChoices, setTemplateChoices] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    agencyGroups.forEach(([agency, items]) => { initial[agency] = items[0]?.templates[0]?.id ?? ""; });
    return initial;
  });
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [previewAgency, setPreviewAgency] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [results, setResults] = useState<{ projectName: string; email: string; status: "SUCCESS" | "FAILED"; error?: string }[]>([]);

  const canSendMail = !!senderUser?.hiworksEmail && !!senderUser?.hiworksMailPassword;
  const toSend = eligible.filter((t) => !excluded.has(t.projectId));

  function toggleExclude(projectId: string) {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId); else next.add(projectId);
      return next;
    });
  }

  async function sendAll() {
    if (!senderUser?.hiworksEmail || !senderUser?.hiworksMailPassword) return;
    setSending(true);
    const now = new Date();
    const issuedDate = now.toISOString().slice(0, 10).replace(/-/g, ".");
    const batchId = `BATCH-${Date.now()}`;
    let seq = startSeq;
    const newResults: typeof results = [];

    for (const t of toSend) {
      const templateId = templateChoices[t.agencyShortName] ?? t.templates[0]?.id;
      const template = t.templates.find((x) => x.id === templateId)?.content ?? t.templates[0]?.content ?? EMPTY_NOTICE_TEMPLATE;
      const docNumber = `${COMPANY_INFO.docNumberPrefix} ${now.getFullYear()}-${String(seq).padStart(4, "0")}`;
      seq++;
      const subject = `[${t.projectNumber}] ${template.title || "정산절차 안내 및 수수료 청구"}`;
      const html = buildNoticeEmailHtml({ template, statusRows: t.statusRows, docNumber, issuedDate });

      let status: "SUCCESS" | "FAILED" = "SUCCESS";
      let errMsg = "";
      try {
        const res = await fetch("/api/notices/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            senderEmail: senderUser.hiworksEmail,
            senderPassword: senderUser.hiworksMailPassword,
            senderName: senderUser.name,
            to: [t.recipientEmail],
            subject,
            html,
          }),
        });
        const json = await res.json();
        if (!res.ok || !json.ok) { status = "FAILED"; errMsg = json.error || "메일 발송에 실패했습니다."; }
      } catch {
        status = "FAILED"; errMsg = "메일 발송 중 네트워크 오류가 발생했습니다.";
      }

      addEmailDispatch({
        batchId,
        sentAt: new Date().toISOString().replace("T", " ").slice(0, 16),
        senderName: senderUser.name,
        recipientInstitution: t.leadInstitutionName,
        recipientEmail: t.recipientEmail,
        subject,
        emailType: "SETTLEMENT_NOTICE",
        attachments: template.attachments.map((a) => a.name),
        status,
        noticeSnapshot: { template, statusRows: t.statusRows, docNumber, issuedDate },
      });
      newResults.push({ projectName: t.projectName, email: t.recipientEmail, status, error: errMsg });
    }

    setResults(newResults);
    setSending(false);
    setDone(true);
  }

  if (done) {
    const successCount = results.filter((r) => r.status === "SUCCESS").length;
    const failCount = results.length - successCount;
    return (
      <div className="p-6 flex flex-col items-center gap-4">
        <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
          <FiSend size={22} className="text-green-600" />
        </div>
        <p className="text-sm font-semibold text-slate-800">{successCount}건 발송 완료{failCount > 0 ? ` · ${failCount}건 실패` : ""}</p>
        <div className="w-full max-h-56 overflow-y-auto border border-slate-100 rounded-xl divide-y divide-slate-100">
          {results.map((r, i) => (
            <div key={i} className="flex items-center justify-between px-3 py-2 text-xs">
              <span className="truncate flex-1 text-slate-700">{r.projectName}</span>
              <span className="text-slate-400 mx-2">{r.email}</span>
              {r.status === "SUCCESS" ? (
                <span className="text-green-600 font-medium shrink-0">성공</span>
              ) : (
                <span className="text-red-600 font-medium shrink-0" title={r.error}>실패</span>
              )}
            </div>
          ))}
        </div>
        <button onClick={onClose} className="mt-2 px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
          닫기
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-center">
          <p className="text-2xl font-bold text-emerald-700">{toSend.length}</p>
          <p className="text-xs text-slate-500 mt-0.5">발송 대상</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-center">
          <p className="text-2xl font-bold text-slate-500">{noTemplate.length}</p>
          <p className="text-xs text-slate-500 mt-0.5">공문 양식 없음 (건너뜀)</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-center">
          <p className="text-2xl font-bold text-slate-500">{noEmail.length}</p>
          <p className="text-xs text-slate-500 mt-0.5">수신 이메일 없음 (건너뜀)</p>
        </div>
      </div>

      {agencyGroups.length > 0 && (
        <div className="space-y-3">
          {agencyGroups.map(([agency, items]) => (
            <div key={agency} className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3">
                <span className="text-xs font-semibold text-slate-700">{agency} · {items.length}건</span>
                <div className="flex items-center gap-2">
                  {items[0].templates.length > 1 && (
                    <select
                      value={templateChoices[agency] ?? ""}
                      onChange={(e) => setTemplateChoices((prev) => ({ ...prev, [agency]: e.target.value }))}
                      className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-700"
                    >
                      {items[0].templates.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  )}
                  <button
                    onClick={() => setPreviewAgency((prev) => (prev === agency ? null : agency))}
                    className="text-[11px] text-purple-600 hover:underline"
                  >
                    {previewAgency === agency ? "미리보기 닫기 ▲" : "미리보기 ▼"}
                  </button>
                </div>
              </div>
              {previewAgency === agency && (() => {
                const templateId = templateChoices[agency] ?? items[0].templates[0]?.id;
                const template = items[0].templates.find((t) => t.id === templateId)?.content ?? items[0].templates[0]?.content ?? EMPTY_NOTICE_TEMPLATE;
                return (
                  <div className="max-h-[40vh] overflow-y-auto border-b border-slate-200 p-4 bg-slate-50/50">
                    <p className="text-[10px] text-slate-400 mb-2">&quot;{items[0].projectName}&quot; 기준 미리보기 — 과제별로 아래 내용만 자동으로 바뀌어 발송됩니다.</p>
                    <NoticeLetterPreview
                      template={template}
                      statusRows={items[0].statusRows}
                      docNumber={`${COMPANY_INFO.docNumberPrefix} ${new Date().getFullYear()}-미리보기`}
                      issuedDate={new Date().toISOString().slice(0, 10).replace(/-/g, ".")}
                    />
                  </div>
                );
              })()}
              <div className="divide-y divide-slate-100">
                {items.map((t) => (
                  <label key={t.projectId} className="flex items-center gap-3 px-4 py-2 text-xs cursor-pointer hover:bg-slate-50">
                    <input
                      type="checkbox"
                      checked={!excluded.has(t.projectId)}
                      onChange={() => toggleExclude(t.projectId)}
                      className="rounded border-slate-300 text-purple-600 focus:ring-purple-500/30"
                    />
                    <span className="flex-1 min-w-0 truncate font-medium text-slate-700">{t.projectName}</span>
                    <span className="text-slate-400 shrink-0">{t.recipientEmail}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {(noTemplate.length > 0 || noEmail.length > 0) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-700 space-y-1">
          {noTemplate.length > 0 && (
            <p>공문 양식이 없는 전담기관 과제: {noTemplate.map((t) => t.projectName).join(", ")}</p>
          )}
          {noEmail.length > 0 && (
            <p>주관기관 담당자 이메일이 없는 과제: {noEmail.map((t) => t.projectName).join(", ")}</p>
          )}
        </div>
      )}

      {eligible.length === 0 && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
          발송 가능한 과제가 없습니다.
        </div>
      )}

      <p className="text-[11px] text-slate-400">
        발신 계정: {canSendMail ? senderUser!.hiworksEmail : <span className="text-red-500">등록된 하이웍스 계정이 없습니다 (관리자 &gt; 사용자 관리에서 등록)</span>}
      </p>

      <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
        <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">취소</button>
        <button
          onClick={sendAll}
          disabled={toSend.length === 0 || sending || !canSendMail}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <FiSend size={14} />
          {sending ? "발송 중..." : `${toSend.length}건 발송`}
        </button>
      </div>
    </div>
  );
}

// ── FeesPage ──────────────────────────────────────────────────
export default function FeesPage() {
  const canEdit     = useCanWrite("fees");
  const canEditSales = useCanWrite("fees-sales");
  const canEditEmails = useCanWrite("emails");
  const allRows     = useFeeRows();
  const { fundingAgencies, projects, projectMembers, agencyNoticeTemplates, users, emailDispatches } = useStore();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [filterProjectNumber,   setFilterProjectNumber]   = useState("");
  const [filterProjectName,     setFilterProjectName]     = useState("");
  const [filterLeadInstitution, setFilterLeadInstitution] = useState("");
  const [filterResearchLead,    setFilterResearchLead]    = useState("");
  const [filterAssignedManager, setFilterAssignedManager] = useState("");
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
  const [agencyAssignedFrom, setAgencyAssignedFrom] = useState("");
  const [agencyAssignedTo, setAgencyAssignedTo]     = useState("");
  const [expandedKey, setExpandedKey]     = useState<string | null>(null);
  const [modal, setModal]                 = useState<ModalState | null>(null);
  const [selectedKeys, setSelectedKeys]   = useState<Set<string>>(new Set());
  const [showBulkNotice, setShowBulkNotice] = useState(false);
  const [showRcmsUpload, setShowRcmsUpload] = useState(false);

  // 표 영역을 스크롤바 드래그 없이 아무 빈 공간이나 잡고 좌우로 끌어서 스크롤할 수 있게 한다.
  // 버튼·체크박스 등 클릭 가능한 요소 위에서 시작한 경우는 드래그로 취급하지 않아 기존 클릭 동작을 해치지 않는다.
  const tableScrollRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef({ isDown: false, startX: 0, startScrollLeft: 0 });

  function handleTableDragStart(e: React.MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    if (target.closest("button, a, input, textarea, select, label")) return;
    const el = tableScrollRef.current;
    if (!el) return;
    dragStateRef.current = { isDown: true, startX: e.pageX, startScrollLeft: el.scrollLeft };
    el.style.cursor = "grabbing";
    el.style.userSelect = "none";
  }

  function handleTableDragMove(e: React.MouseEvent<HTMLDivElement>) {
    const state = dragStateRef.current;
    if (!state.isDown) return;
    const el = tableScrollRef.current;
    if (!el) return;
    e.preventDefault();
    el.scrollLeft = state.startScrollLeft - (e.pageX - state.startX);
  }

  function handleTableDragEnd() {
    dragStateRef.current.isDown = false;
    const el = tableScrollRef.current;
    if (el) {
      el.style.cursor = "grab";
      el.style.userSelect = "";
    }
  }

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

  function clearAgencyAssignedRange() {
    setAgencyAssignedFrom("");
    setAgencyAssignedTo("");
  }

  const hasDateFilter = invoiceDateFrom !== "" || invoiceDateTo !== "";
  const hasTermEndDateFilter = termEndDateFrom !== "" || termEndDateTo !== "";
  const hasAgencyAssignedFilter = agencyAssignedFrom !== "" || agencyAssignedTo !== "";

  const filtered = useMemo(
    () =>
      allRows.filter((r) => {
        const matchProjectNumber    = filterProjectNumber    === "" || r.projectNumber.includes(filterProjectNumber);
        const matchProjectName      = filterProjectName      === "" || r.projectName.includes(filterProjectName);
        const matchLeadInstitution  = filterLeadInstitution  === "" || r.leadInstitutionName.includes(filterLeadInstitution);
        const matchResearchLead     = filterResearchLead     === "" || r.researchLead.includes(filterResearchLead);
        const matchAssignedManager  = filterAssignedManager  === "" || r.assignedManager.includes(filterAssignedManager);
        const matchStatus           = filterProjectStatus    === "ALL" || r.projectStatus === filterProjectStatus;
        const matchAgency           = filterAgency           === "ALL" || r.agencyShortName === filterAgency;
        const matchBillingType      = filterBillingType      === "ALL" || r.billingType === filterBillingType;
        const matchCollectionStatus = filterCollectionStatus === "ALL"
          || (filterCollectionStatus === "HAS_LOSS" ? r.unclaimedAmount > 0 : r.collectionStatus === filterCollectionStatus);
        const matchOnlyReceivable   = !filterOnlyReceivable  || r.receivableAmount > 0;

        const dt = r.invoiceIssuedAt;
        const matchFrom = invoiceDateFrom === "" || (dt !== "" && dt >= invoiceDateFrom);
        const matchTo   = invoiceDateTo   === "" || (dt !== "" && dt <= invoiceDateTo);

        const endDt = r.endDate;
        const matchEndFrom = termEndDateFrom === "" || (endDt !== "" && endDt >= termEndDateFrom);
        const matchEndTo   = termEndDateTo   === "" || (endDt !== "" && endDt <= termEndDateTo);

        const assignedDt = r.agencyAssignedAt;
        const matchAssignedFrom = agencyAssignedFrom === "" || (assignedDt !== "" && assignedDt >= agencyAssignedFrom);
        const matchAssignedTo   = agencyAssignedTo   === "" || (assignedDt !== "" && assignedDt <= agencyAssignedTo);

        return matchProjectNumber && matchProjectName && matchLeadInstitution && matchResearchLead
          && matchAssignedManager
          && matchStatus && matchAgency && matchBillingType && matchCollectionStatus
          && matchOnlyReceivable && matchFrom && matchTo && matchEndFrom && matchEndTo
          && matchAssignedFrom && matchAssignedTo;
      }),
    [allRows, filterProjectNumber, filterProjectName, filterLeadInstitution, filterResearchLead,
     filterAssignedManager,
     filterProjectStatus, filterAgency, filterBillingType, filterCollectionStatus, filterOnlyReceivable,
     invoiceDateFrom, invoiceDateTo, termEndDateFrom, termEndDateTo, agencyAssignedFrom, agencyAssignedTo]
  );

  // ── 페이지네이션 — 과제 10개 단위로 끊는다(한 과제가 연차별로 여러 행을 차지하므로
  // "행" 기준이 아니라 "과제" 기준으로 페이지를 나눠야 한 과제의 연차 행들이 페이지 중간에서
  // 잘리지 않는다). filtered는 이미 projectNumber 순으로 정렬돼 있어 순서대로 묶으면 된다.
  const PAGE_SIZE = 10;
  const [page, setPage] = useState(1);
  const distinctProjectNumbers = useMemo(() => {
    const seen = new Set<string>();
    const list: string[] = [];
    for (const r of filtered) {
      if (!seen.has(r.projectNumber)) { seen.add(r.projectNumber); list.push(r.projectNumber); }
    }
    return list;
  }, [filtered]);
  const totalPages = Math.max(1, Math.ceil(distinctProjectNumbers.length / PAGE_SIZE));
  // 필터가 바뀌어 과제 수가 줄면 이전 페이지 번호가 범위를 벗어날 수 있어 렌더링 시점에 보정한다
  // (버튼 클릭도 이 값 기준으로 계산하므로 별도 useEffect로 되돌릴 필요가 없다).
  const safePage = Math.min(page, totalPages);
  const pagedProjectNumbers = useMemo(
    () => new Set(distinctProjectNumbers.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)),
    [distinctProjectNumbers, safePage]
  );
  const pagedRows = useMemo(
    () => filtered.filter((r) => pagedProjectNumbers.has(r.projectNumber)),
    [filtered, pagedProjectNumbers]
  );

  // 같은 과제(연차별로 여러 행)를 시각적으로 묶어 보여주기 위한 그룹 인덱스 — filtered는 이미
  // projectNumber로 정렬되어 있으므로, 앞 행과 과제번호가 바뀔 때마다 그룹을 하나씩 증가시킨다.
  const rowGroupIndex = useMemo(() => {
    const map = new Map<string, number>();
    let group = -1;
    let prevProjectNumber: string | null = null;
    for (const row of filtered) {
      if (row.projectNumber !== prevProjectNumber) {
        group += 1;
        prevProjectNumber = row.projectNumber;
      }
      map.set(row.key, group);
    }
    return map;
  }, [filtered]);

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

  // "전체 선택"은 지금 페이지에 보이는 행 기준 — 다른 페이지에서 이미 선택해둔 항목은 그대로 유지된다.
  const allVisibleSelected = pagedRows.length > 0 && pagedRows.every((r) => selectedKeys.has(r.key));

  function toggleSelectAll() {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) pagedRows.forEach((r) => next.delete(r.key));
      else pagedRows.forEach((r) => next.add(r.key));
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

  // 선택된 행 → 과제 단위로 묶어 "정산절차 안내 공문 일괄발송" 모달에 넘길 대상 목록을 만든다.
  // 과제 상세 페이지의 단건 발송(SettlementNoticeModal)과 동일한 필드 구성을 그대로 재현한다.
  const bulkNoticeTargets = useMemo<BulkNoticeTarget[]>(() => {
    if (!showBulkNotice) return [];
    const selectedProjectIds = Array.from(
      new Set(filtered.filter((r) => selectedKeys.has(r.key)).map((r) => r.projectId))
    ).filter(Boolean);

    return selectedProjectIds.map((projectId) => {
      const project = projects.find((p) => p.id === projectId)!;
      const agency = fundingAgencies.find((a) => a.id === project.agencyId);
      const templates = agency ? agencyNoticeTemplates.filter((t) => t.agencyShortName === agency.shortName) : [];
      const leadMember = projectMembers.find((m) => m.projectId === projectId && m.role === "LEAD");
      const coInstitutionCount = projectMembers.filter((m) => m.projectId === projectId && m.role !== "LEAD").length;
      const currentStage = project.stages?.find((s) => project.currentTerm >= s.startTermNumber && project.currentTerm <= s.endTermNumber);
      const currentStageStartDate = currentStage?.stageStartDate ?? project.stageStartDate ?? project.startDate;
      const currentStageEndDate = currentStage?.stageEndDate ?? project.stageEndDate ?? project.endDate;
      const statusRows: NoticeStatusRow[] = [
        { label: "과제번호 (RCMS)", value: project.projectCode || project.projectNumber },
        { label: "과제명", value: project.projectName },
        { label: "단계연구개발기간", value: `${fmtDate(currentStageStartDate)} ~ ${fmtDate(currentStageEndDate)}` },
        { label: "대상기간", value: `${fmtDate(project.firstStartDate ?? project.startDate)} ~ ${fmtDate(project.finalEndDate ?? project.endDate)}` },
        { label: "정산구분", value: leadMember?.settlementType ?? "위탁정산" },
        { label: "주관연구개발기관", value: project.leadInstitutionName },
        { label: "연구책임자", value: project.researchLead ?? "—" },
        { label: "공동연구개발기관수", value: `${coInstitutionCount}개` },
      ];
      return {
        projectId,
        projectNumber: project.projectNumber,
        projectName: project.projectName,
        agencyShortName: agency?.shortName ?? "",
        leadInstitutionName: project.leadInstitutionName,
        recipientEmail: leadMember?.contactEmail ?? "",
        statusRows,
        templates,
      };
    });
  }, [showBulkNotice, filtered, selectedKeys, projects, fundingAgencies, agencyNoticeTemplates, projectMembers]);

  const bulkNoticeSenderUser = users.find((u) => u.id === getCurrentUser()?.id) ?? null;
  const bulkNoticeStartSeq = emailDispatches.filter((e) => e.emailType === "SETTLEMENT_NOTICE").length + 1;

  function cell(row: FeeRow, colKey: string) {
    switch (colKey) {
      case "agencyShortName":
        return row.agencyShortName ? (
          <Link href={`/projects/${row.projectId}`} className="inline-block max-w-full truncate font-mono text-sm font-bold text-indigo-700 bg-indigo-50 px-2 py-1 rounded hover:bg-indigo-100 transition-colors">
            {row.agencyShortName}
          </Link>
        ) : <span className="text-slate-300">—</span>;

      case "projectNumber":
        return <Link href={`/projects/${row.projectId}`} className="block truncate font-mono text-[11px] text-slate-500 hover:text-blue-600 hover:underline transition-colors" title={row.projectNumber}>{row.projectNumber}</Link>;

      case "projectName":
        return (
          <div>
            <Link href={`/projects/${row.projectId}`} className="block w-full font-medium text-blue-600 hover:underline hover:text-blue-800 text-xs line-clamp-2" title={row.projectName}>
              {row.projectName}
            </Link>
            {row.noFeeRecord && (
              <span
                className="inline-block mt-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 whitespace-nowrap"
                title="이 과제는 아직 연차별 수수료(TermFee)가 등록되지 않아 발행·수금 관련 칸이 비어 있습니다"
              >
                수수료 미등록
              </span>
            )}
          </div>
        );

      case "leadInstitutionName":
        return row.leadInstitutionName ? (
          <Link href={`/institutions/${row.leadInstitutionId}`} className="block truncate text-xs text-slate-700 hover:text-blue-600 hover:underline transition-colors" title={row.leadInstitutionName}>{row.leadInstitutionName}</Link>
        ) : <span className="text-slate-300">—</span>;

      case "researchLead":
        return row.researchLead ? (
          <Link href={`/researchers/${encodeURIComponent(row.researchLead)}`} className="block truncate text-xs text-slate-700 hover:text-blue-600 hover:underline transition-colors" title={row.researchLead}>{row.researchLead}</Link>
        ) : <span className="text-slate-300">—</span>;

      case "billedInstitutionName":
        return row.billedInstitutionName ? (
          <Link href={`/institutions/${row.billedInstitutionId}`} className="block truncate text-xs text-slate-700 hover:text-blue-600 hover:underline transition-colors" title={row.billedInstitutionName}>{row.billedInstitutionName}</Link>
        ) : <span className="text-slate-300">—</span>;

      case "term":
        return <span className="text-xs font-semibold text-slate-700 whitespace-nowrap">{row.termNumber}/{row.totalTerms}</span>;

      case "projectCategory":
        return (
          <span className={`inline-block whitespace-nowrap text-[10px] font-medium px-1.5 py-0.5 rounded ${
            row.projectCategory === "정산" ? "bg-orange-100 text-orange-700" : "bg-indigo-100 text-indigo-700"
          }`}>
            {row.projectCategory}
          </span>
        );

      case "startDate":
        return <span className="text-xs text-slate-600">{row.startDate ? fmtDate(row.startDate) : "—"}</span>;

      case "endDate":
        return <span className="text-xs text-slate-600">{row.endDate ? fmtDate(row.endDate) : "—"}</span>;

      case "billingType":
        return (
          <div className="flex flex-col items-center gap-0.5">
            {row.billingType ? (
              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded whitespace-nowrap ${BILLING_TYPE_COLOR[row.billingType] ?? "bg-slate-100 text-slate-600"}`}>
                {row.billingType}
              </span>
            ) : <span className="text-slate-300">—</span>}
            {row.otherFirmHandled && (
              <span
                className="text-[9px] font-medium px-1.5 py-0.5 rounded whitespace-nowrap bg-orange-100 text-orange-700"
                title={`이 연차는 타회계법인이 진행해 삼화 청구액에서 제외됩니다. 당해 미청구(15%) ${fmtWon(row.otherFirmUnclaimedTotal)}은 정산연차에 자동 이월됩니다.`}
              >
                타회계법인 진행
              </span>
            )}
          </div>
        );

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

      case "paidAt":
        return <span className="text-xs text-slate-600">{row.paidAt ? fmtDate(row.paidAt) : "—"}</span>;

      case "receivableAmount":
        return (
          <span className={`text-xs font-bold ${row.receivableAmount > 0 ? "text-red-600" : "text-slate-300"}`}>
            {row.receivableAmount > 0 ? fmtWon(row.receivableAmount) : "—"}
          </span>
        );

      case "unclaimedAmount":
        return <UnclaimedAmountCell row={row} canEdit={canEdit} />;

      case "projectCode":
        return <span className="font-mono text-[11px] text-slate-500">{row.projectCode || "—"}</span>;

      case "agencyAssignedAt":
        return <span className="text-xs text-slate-600">{row.agencyAssignedAt ? fmtDate(row.agencyAssignedAt) : "—"}</span>;

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
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded whitespace-nowrap ${
            row.projectDivision === "위탁" ? "bg-sky-100 text-sky-700" : "bg-teal-100 text-teal-700"
          }`}>
            {row.projectDivision}
          </span>
        ) : <span className="text-slate-300">—</span>;

      case "assignedManager": {
        if (!row.assignedManager) return <span className="text-slate-300">—</span>;
        const matches = users.filter((u) => u.name === row.assignedManager);
        if (matches.length === 1) {
          return (
            <Link href={`/admin/users/${matches[0].id}`} className="block truncate text-xs text-slate-700 hover:text-blue-600 hover:underline transition-colors" title={row.assignedManager}>
              {row.assignedManager}
            </Link>
          );
        }
        if (matches.length > 1) {
          return (
            <span className="text-xs text-amber-600" title="동명이인이 등록되어 있어 담당자 상세페이지로 연결할 수 없습니다">
              {row.assignedManager} ⚠
            </span>
          );
        }
        return <span className="text-xs text-slate-700">{row.assignedManager}</span>;
      }

      default:
        return null;
    }
  }

  function exportToExcel() {
    const data = filtered.map((r) => ({
      "약칭": r.agencyShortName,
      "과제번호": r.projectNumber,
      "과제명": r.projectName,
      "주관기관": r.leadInstitutionName,
      "연구책임자": r.researchLead,
      "청구기관": r.billedInstitutionName,
      "연차": `${r.termNumber}/${r.totalTerms}`,
      "과제구분": r.projectCategory,
      "당해시작일": r.startDate,
      "당해종료일": r.endDate,
      "발행구분": r.billingType,
      "계산서일자": r.invoiceIssuedAt,
      "공급가액": r.supplyAmount,
      "부가세": r.taxAmount,
      "합계": r.totalInvoiceAmount,
      "수금상태": COLLECTION_STATUS_LABEL[r.collectionStatus] ?? "",
      "수금액": r.paidAmount,
      "수금일": r.paidAt ?? "",
      "미수액": r.receivableAmount,
      "손실금액": r.unclaimedAmount,
      "과제코드": r.projectCode,
      "전담기관배정일": r.agencyAssignedAt,
      "서류요청일": r.docRequestDate,
      "서류회신일": r.docReplyDate,
      "수신자": r.recipientName,
      "수신자이메일": r.recipientEmail,
      "구분": r.projectDivision,
      "삼화담당자": r.assignedManager,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = Object.keys(data[0] ?? {}).map(() => ({ wch: 16 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "수수료청구관리");
    XLSX.writeFile(wb, `수수료청구관리_${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  return (
    <div className="space-y-4">
      {/* 상단 요약 */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">과제별 수수료·세금계산서 관리 · 전체 {allRows.length}건</p>
        <div className="flex items-center gap-2">
          <button
            onClick={exportToExcel}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <FiDownload size={12} />
            엑셀 다운로드
          </button>
          {canEdit && (
            <>
              <button
                onClick={downloadExcelTemplate}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path fillRule="evenodd" d="M3 17a1 1 0 0 1 1-1h12a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1zM6.293 9.293a1 1 0 0 1 1.414 0L9 10.586V3a1 1 0 1 1 2 0v7.586l1.293-1.293a1 1 0 1 1 1.414 1.414l-3 3a1 1 0 0 1-1.414 0l-3-3a1 1 0 0 1 0-1.414z" clipRule="evenodd" /></svg>
                RCMS 양식 다운로드
              </button>
              <button
                onClick={() => setShowRcmsUpload(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5"><path fillRule="evenodd" d="M3 17a1 1 0 0 1 1-1h12a1 1 0 1 1 0 2H4a1 1 0 0 1-1-1zM6.293 6.707a1 1 0 0 1 0-1.414l3-3a1 1 0 0 1 1.414 0l3 3a1 1 0 0 1-1.414 1.414L11 5.414V13a1 1 0 1 1-2 0V5.414L7.707 6.707a1 1 0 0 1-1.414 0z" clipRule="evenodd" /></svg>
                RCMS 엑셀 업로드
              </button>
              <button
                onClick={() => setModal({ mode: "project-add" })}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
              >
                <FiPlus size={12} />
                새 과제 추가
              </button>
            </>
          )}
        </div>
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
        <div className="px-4 py-3 grid grid-cols-3 gap-3">
          {[
            { label: "과제번호",   value: filterProjectNumber,   onChange: setFilterProjectNumber   },
            { label: "과제명",     value: filterProjectName,     onChange: setFilterProjectName     },
            { label: "주관기관",   value: filterLeadInstitution, onChange: setFilterLeadInstitution },
            { label: "연구책임자", value: filterResearchLead,    onChange: setFilterResearchLead    },
            { label: "삼화 담당자", value: filterAssignedManager, onChange: setFilterAssignedManager },
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
            {/* 금액 자체가 아니라 손실금액이 등록돼 있는지 여부만 확인하는 용도 */}
            <option value="HAS_LOSS">손실금액 있음</option>
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
        <div className="px-4 py-3 grid grid-cols-3 gap-x-6 gap-y-3">
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
                { label: "1분기",   fn: () => applyDateRange(...govFiscalQuarterRange(1)) },
                { label: "2분기",   fn: () => applyDateRange(...govFiscalQuarterRange(2)) },
                { label: "3분기",   fn: () => applyDateRange(...govFiscalQuarterRange(3)) },
                { label: "4분기",   fn: () => applyDateRange(...govFiscalQuarterRange(4)) },
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

          {/* 전담기관 배정일 */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-slate-500">전담기관 배정일</span>
              {hasAgencyAssignedFilter && (
                <button
                  onClick={clearAgencyAssignedRange}
                  className="text-[11px] text-slate-400 hover:text-slate-600 px-1.5 py-0.5 rounded hover:bg-slate-100 transition-colors"
                >
                  초기화
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <DateInput value={agencyAssignedFrom} onChange={setAgencyAssignedFrom} className="w-28" />
              <span className="text-slate-400 text-xs">~</span>
              <DateInput value={agencyAssignedTo} onChange={setAgencyAssignedTo} className="w-28" />
            </div>
          </div>
        </div>

        {(hasDateFilter || hasTermEndDateFilter || hasAgencyAssignedFilter) && (
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
          {canEditEmails && (
            <button
              onClick={() => setShowBulkNotice(true)}
              className="flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-lg bg-purple-600 text-white hover:bg-purple-700 transition-colors"
            >
              <FiSend size={12} /> 정산절차 안내 공문 일괄발송
            </button>
          )}
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
        {/* max-h + overflow-y-auto: 이 div 자체가 세로 스크롤 컨테이너가 되어야 안의 sticky
            top-0 헤더가 실제로 고정된다 — 바깥 래퍼의 overflow-hidden(모서리 둥글게 처리용)에
            기대면, 그쪽엔 실제로 스크롤이 없어서(내용에 맞춰 늘어나기만 함) sticky가 무효화된다. */}
        <div
          ref={tableScrollRef}
          className="overflow-x-auto overflow-y-auto max-h-[70vh] cursor-grab"
          onMouseDown={handleTableDragStart}
          onMouseMove={handleTableDragMove}
          onMouseUp={handleTableDragEnd}
          onMouseLeave={handleTableDragEnd}
        >
          {/* table-fixed: 열 너비를 각 셀의 width 클래스대로 고정한다. 이게 없으면 내용이 긴 셀이
              자기 열을 넘어 자동으로 넓어질 수 있는데, 그러면 아래에서 px로 계산해둔 고정열 sticky
              left 오프셋이 실제 렌더링 너비와 어긋나 고정열끼리 겹쳐 보이는 문제가 생긴다.
              border-separate + spacing-0: 브라우저 기본(Tailwind preflight)인 border-collapse: collapse는
              position: sticky인 td/th의 배경이 셀 경계 픽셀까지 완전히 칠해지지 않는 버그가 있어(셀 테두리가
              합쳐지는 순간 배경도 같이 끊김), 그 경계 틈으로 스크롤되는 내용이 비쳐 보인다. separate로 바꿔야
              고정열 배경이 셀 전체를 빈틈없이 덮는다. */}
          <table className="text-xs table-fixed border-separate border-spacing-0" style={{ minWidth: "2400px" }}>
            <thead>
              {/* border-separate에서는 <tr> border가 안 그려지므로 각 <th>에 border-b를 직접 넣는다. */}
              <tr className="bg-slate-50">
                {canEdit && (
                  <th
                    className="px-2 py-3 sticky top-0 z-30 bg-slate-50 border-b border-slate-200"
                    style={{ ...fixedColStyle(STICKY_CHECKBOX_PX), left: 0 }}
                  >
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleSelectAll}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500/30"
                    />
                  </th>
                )}
                <th
                  className="px-2 py-3 sticky top-0 z-30 bg-slate-50 border-b border-slate-200"
                  style={{ ...fixedColStyle(STICKY_CHEVRON_PX), left: canEdit ? STICKY_CHECKBOX_PX : 0 }}
                />
                {COLUMNS.map((col) => {
                  const isSticky = (STICKY_LEFT_KEYS as readonly string[]).includes(col.key);
                  const isLastSticky = col.key === STICKY_LEFT_KEYS[STICKY_LEFT_KEYS.length - 1];
                  return (
                    <th
                      key={col.key}
                      className={`px-3 py-3 font-medium text-slate-500 whitespace-nowrap ${col.align} ${isSticky ? "" : col.width} sticky top-0 border-b border-slate-200 ${
                        isSticky ? `z-30 bg-slate-50 ${isLastSticky ? "border-r border-r-slate-200" : ""}` : "z-20 bg-slate-50"
                      }`}
                      style={isSticky ? { ...fixedColStyle(STICKY_COL_PX[col.key]), left: stickyLeftOffset(col.key, canEdit) } : undefined}
                    >
                      {col.label}
                    </th>
                  );
                })}
                <th className="px-3 py-3 text-center font-medium text-slate-500 whitespace-nowrap w-24 sticky top-0 z-20 bg-slate-50 border-b border-slate-200">공문발송</th>
                <th className="px-3 py-3 text-center font-medium text-slate-500 whitespace-nowrap w-32 sticky top-0 z-20 bg-slate-50 border-b border-slate-200">매출관리</th>
                <th className="px-3 py-3 text-center font-medium text-slate-500 whitespace-nowrap w-20 sticky top-0 z-20 bg-slate-50 border-b border-slate-200">수금관리</th>
                <th className="px-3 py-3 text-center font-medium text-slate-500 whitespace-nowrap w-20 sticky top-0 z-20 bg-slate-50 border-b border-slate-200">정보수정</th>
              </tr>
            </thead>
            <tbody>
              {pagedRows.length === 0 ? (
                <tr>
                  <td colSpan={COLUMNS.length + (canEdit ? 6 : 5)} className="px-4 py-10 text-center text-sm text-slate-400">
                    검색 결과가 없습니다
                  </td>
                </tr>
              ) : (
                pagedRows.flatMap((row, idx) => {
                  const isExpanded   = expandedKey === row.key;
                  const hasReceivable = row.receivableId !== "";
                  const isFullyPaid   = row.collectionStatus === "PAID";
                  // 같은 과제(연차별 여러 행)를 옅은 배경색으로 묶어 보여주고, 다른 과제로 넘어가는
                  // 경계엔 굵은 구분선을 넣어 어디까지가 한 과제인지 한눈에 보이게 한다.
                  const isGroupStart = idx === 0 || pagedRows[idx - 1].projectNumber !== row.projectNumber;
                  // 고정(sticky) 열이 스크롤되는 다른 열 위에 완전히 덮여야 하므로, 배경은 반투명이 아닌
                  // 불투명 색상만 써야 한다 — 반투명이면 그 밑으로 스크롤되는 내용이 비쳐서 겹쳐 보인다.
                  const groupBg = (rowGroupIndex.get(row.key) ?? 0) % 2 === 1 ? "bg-slate-50" : "bg-white";
                  const isSelected = selectedKeys.has(row.key);
                  // hover: 는 마우스가 "그 셀 자신" 위에 있을 때만 켜진다 — 고정열은 각자 자기 배경을 따로
                  // 들고 있어서 hover:만 쓰면 행의 다른 칸(비고정 칸 등)에 마우스를 올려도 고정열은 안 따라 바뀐다.
                  // group-hover:는 <tr className="group">를 조상으로 잡아 행 어디에 마우스가 있어도 같이 바뀌게 한다.
                  const rowBg = isSelected
                    ? "bg-cyan-50 hover:bg-cyan-100 group-hover:bg-cyan-100"
                    : isExpanded
                      ? "bg-blue-50"
                      : `${groupBg} hover:bg-slate-100 group-hover:bg-slate-100`;
                  // border-separate에서는 <tr>에 준 border가 렌더링되지 않으므로(분리 모드에선 셀 테두리만
                  // 그려진다), 행 구분선을 각 <td>에 직접 넣는다.
                  const rowBorder = `${isGroupStart ? "border-t-2 border-t-slate-200" : "border-t border-t-slate-50"} border-b border-b-slate-50`;
                  return [
                    <tr
                      key={row.key}
                      className={`group transition-colors ${rowBg}`}
                    >
                      {canEdit && (
                        <td
                          className={`px-2 py-2.5 text-center sticky z-10 ${rowBg} ${rowBorder}`}
                          style={{ ...fixedColStyle(STICKY_CHECKBOX_PX), left: 0 }}
                        >
                          <input
                            type="checkbox"
                            checked={selectedKeys.has(row.key)}
                            onChange={() => toggleSelect(row.key)}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500/30"
                          />
                        </td>
                      )}
                      <td
                        className={`px-2 py-2.5 text-center sticky z-10 ${rowBg} ${rowBorder}`}
                        style={{ ...fixedColStyle(STICKY_CHEVRON_PX), left: canEdit ? STICKY_CHECKBOX_PX : 0 }}
                      >
                        <button
                          onClick={() => toggleExpand(row.key)}
                          className={`p-1 rounded transition-colors ${isExpanded ? "text-blue-600 bg-blue-100" : "text-slate-300 hover:text-slate-500 hover:bg-slate-100"}`}
                        >
                          {isExpanded ? <FiChevronUp size={13} /> : <FiChevronDown size={13} />}
                        </button>
                      </td>
                      {COLUMNS.map((col) => {
                        const isSticky = (STICKY_LEFT_KEYS as readonly string[]).includes(col.key);
                        const isLastSticky = col.key === STICKY_LEFT_KEYS[STICKY_LEFT_KEYS.length - 1];
                        return (
                          <td
                            key={col.key}
                            className={`px-3 py-2.5 ${col.align} ${isSticky ? "" : col.width} align-middle ${rowBorder} ${
                              isSticky ? `sticky z-10 ${rowBg} ${isLastSticky ? "border-r border-r-slate-200" : ""}` : ""
                            }`}
                            style={isSticky ? { ...fixedColStyle(STICKY_COL_PX[col.key]), left: stickyLeftOffset(col.key, canEdit) } : undefined}
                          >
                            {cell(row, col.key)}
                          </td>
                        );
                      })}
                      {/* 공문발송 드롭다운 — 회계담당자만 발송 가능 */}
                      <td className={`px-3 py-2.5 text-center align-middle w-24 ${rowBorder}`}>
                        {canEditEmails && row.taxInvoiceId && row.taxInvoiceStatus !== "CANCELED" ? (
                          <DispatchDropdown
                            onSelect={(choice) => {
                              const dispatchProject = projects.find((p) => p.id === row.projectId);
                              const dispatchAgency = fundingAgencies.find((a) => a.id === dispatchProject?.agencyId);
                              setModal({
                                mode: "dispatch",
                                target: {
                                  kind:                choice.kind,
                                  projectNumber:       row.projectNumber,
                                  projectName:         row.projectName,
                                  leadInstitutionName: row.billedInstitutionName,
                                  agencyShortName:     row.agencyShortName,
                                  termYear:            row.termYear,
                                  termNumber:          row.termNumber,
                                  recipientEmail:      row.recipientEmail,
                                  recipientName:       row.recipientName,
                                  feeCategory:         choice.kind === "OTHER" ? "ANNUAL" : choice.feeCategory,
                                  supplyAmount:        row.supplyAmount,
                                  taxAmount:           row.taxAmount,
                                  totalAmount:         row.totalInvoiceAmount,
                                  startDate:           row.startDate,
                                  endDate:             row.endDate,
                                  stageStartDate:      row.stageStartDate,
                                  stageEndDate:        row.stageEndDate,
                                  researchLead:        row.researchLead,
                                  agencyFullName:      dispatchAgency?.name ?? row.agencyShortName,
                                  participantCount:    projectMembers.filter((m) => m.projectId === row.projectId).length,
                                  docNumber:           generateDocNumber(),
                                },
                              });
                            }}
                          />
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>
                      {/* 매출관리 버튼 */}
                      <td className={`px-3 py-2.5 text-center align-middle w-32 ${rowBorder}`}>
                        {canEditSales ? (
                          <div className="flex items-center justify-center gap-1">
                            <button
                              onClick={() =>
                                setModal({
                                  mode: "sales-issue",
                                  target: {
                                    projectId:           row.projectId,
                                    projectNumber:       row.projectNumber,
                                    projectName:         row.projectName,
                                    leadInstitutionName: row.billedInstitutionName,
                                    institutionId:       row.isSplitRow ? row.billedInstitutionId : undefined,
                                    termYear:            row.termYear,
                                    termNumber:          row.termNumber,
                                    currentBillingType:  row.billingType,
                                    currentIssuedAt:     row.invoiceIssuedAt,
                                    taxInvoiceId:        row.taxInvoiceId,
                                    taxInvoiceStatus:    row.taxInvoiceStatus,
                                    appliedFeeTotal:     row.appliedFeeTotal,
                                    receivableId:        row.receivableId,
                                    paidAmount:          row.paidAmount,
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
                                      leadInstitutionName: row.billedInstitutionName,
                                      institutionId:       row.isSplitRow ? row.billedInstitutionId : undefined,
                                      termYear:            row.termYear,
                                      termNumber:          row.termNumber,
                                      currentBillingType:  row.billingType,
                                      currentIssuedAt:     row.invoiceIssuedAt,
                                      taxInvoiceId:        row.taxInvoiceId,
                                      taxInvoiceStatus:    row.taxInvoiceStatus,
                                      appliedFeeTotal:     row.appliedFeeTotal,
                                      receivableId:        row.receivableId,
                                      paidAmount:          row.paidAmount,
                                    },
                                  })
                                }
                                className="text-[11px] font-medium px-2 py-1 rounded transition-colors whitespace-nowrap bg-rose-50 text-rose-600 hover:bg-rose-100 border border-rose-200"
                              >
                                매출취소
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>
                      {/* 수금관리 버튼 */}
                      <td className={`px-3 py-2.5 text-center align-middle w-20 ${rowBorder}`}>
                        {canEditSales && hasReceivable ? (
                          <button
                            onClick={() =>
                              setModal({
                                mode: "collection",
                                target: {
                                  receivableId:       row.receivableId,
                                  projectName:        row.projectName,
                                  leadInstitutionName:row.billedInstitutionName,
                                  billedAmount:       row.billedAmount,
                                  paidAmount:         row.paidAmount,
                                  paidAt:             row.paidAt,
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
                      <td className={`px-3 py-2.5 text-center align-middle w-20 ${rowBorder}`}>
                        {canEdit && (
                          <button
                            onClick={() =>
                              setModal({
                                mode: "info-edit",
                                target: {
                                  projectId:       row.projectId,
                                  projectName:     row.projectName,
                                  leadMemberId:    row.leadMemberId,
                                  docFeeId:        row.docFeeId,
                                  docRequestDate:  row.docRequestDate,
                                  docReplyDate:    row.docReplyDate,
                                  recipientName:   row.recipientName,
                                  recipientEmail:  row.recipientEmail,
                                  assignedManager: row.assignedManager,
                                  registeredAt:    row.registeredAt,
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
        <div className="px-4 py-2.5 border-t border-slate-100 flex items-center justify-between gap-3">
          <span className="text-xs text-slate-400">
            과제 {distinctProjectNumbers.length}건 중 {pagedRows.length}행 표시 (전체 {allRows.length}행)
          </span>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(Math.max(1, safePage - 1))}
                disabled={safePage === 1}
                className="px-2 py-1 text-xs rounded border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                이전
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((n) => n === 1 || n === totalPages || Math.abs(n - safePage) <= 2)
                .flatMap((n, i, arr) => {
                  const nodes: React.ReactNode[] = [];
                  if (i > 0 && n - arr[i - 1] > 1) {
                    nodes.push(<span key={`ellipsis-${n}`} className="px-1 text-xs text-slate-300">…</span>);
                  }
                  nodes.push(
                    <button
                      key={n}
                      onClick={() => setPage(n)}
                      className={`min-w-[1.75rem] px-2 py-1 text-xs rounded transition-colors ${
                        n === safePage ? "bg-blue-600 text-white" : "border border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {n}
                    </button>
                  );
                  return nodes;
                })}
              <button
                onClick={() => setPage(Math.min(totalPages, safePage + 1))}
                disabled={safePage === totalPages}
                className="px-2 py-1 text-xs rounded border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                다음
              </button>
            </div>
          )}
        </div>
      </div>

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
      {showRcmsUpload && <ExcelUploadModal onClose={() => setShowRcmsUpload(false)} />}
      {showBulkNotice && (
        <Modal title="정산절차 안내 공문 일괄발송" onClose={() => setShowBulkNotice(false)} size="xl">
          <BulkSettlementNoticeModal
            targets={bulkNoticeTargets}
            startSeq={bulkNoticeStartSeq}
            senderUser={bulkNoticeSenderUser}
            onClose={() => setShowBulkNotice(false)}
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
