"use client";

import { useState, useMemo, useRef, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import * as XLSX from "xlsx";
import { FiPlus, FiChevronDown, FiChevronUp, FiChevronRight, FiMail, FiDownload, FiX } from "react-icons/fi";
import {
  useStore,
  addReceivable,
  updateReceivable,
  updateProject,
  updateProjectMember,
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
  COMPANY_INFO,
} from "@/lib/mock";
import { fmtWon, fmtDate, splitVatInclusive } from "@/lib/utils";
import Modal from "@/components/common/Modal";
import DateInput from "@/components/common/DateInput";
import InstitutionQuickAdd from "@/components/common/InstitutionQuickAdd";
import MoneyInput from "@/components/common/MoneyInput";
import AgreementStructureEditor, { type Stage } from "@/components/common/AgreementStructureEditor";
import { useCanWrite } from "@/lib/permissions";
import { getCurrentUser } from "@/lib/auth";
import { resolveRdaAgencyId, isSettlementTerm } from "@/lib/fee-calculator";

// ── 타입 ──────────────────────────────────────────────────────
type FeeRow = {
  key: string;
  // 식별
  agencyShortName: string;
  projectNumber: string;
  projectName: string;
  leadInstitutionName: string;
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
  receivableAmount: number;
  unclaimedAmount: number;
  // 과제 정보
  projectCode: string;
  agencyAssignedAt: string;
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
  // 원본 termFees (확장용)
  fees: TermFee[];
  termYear: number;
  termNumber: number;
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
      });
    } else {
      const due = new Date(`${issuedAt}T00:00:00`);
      due.setMonth(due.getMonth() + 3);
      addReceivable({
        invoiceNumber,
        projectNumber:       target.projectNumber,
        projectName:         target.projectName,
        termYear:            target.termYear,
        termNumber:          target.termNumber,
        leadInstitutionId:   "",
        leadInstitutionName: target.leadInstitutionName,
        billedAt:            issuedAt,
        billedAmount:        totalAmount,
        paidAmount:          0,
        receivableAmount:    totalAmount,
        dueDate:             due.toISOString().slice(0, 10),
        status:              "PENDING",
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
  const { standardAttachments } = useStore();
  const bizRegAttachment = standardAttachments.find((a) => a.id === "sa-biz-reg");
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
    if (isOther) return [];
    return [
      { name: `청구서_${target.projectNumber}_${termLabel}.pdf`, checked: true },
      { name: bizRegAttachment?.name ?? "사업자등록증.pdf", checked: true, dataUrl: bizRegAttachment?.fileDataUrl },
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
  const [showStandardPanel, setShowStandardPanel] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const replaceIndexRef = useRef<number | null>(null);

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
  const canSend = emails.length > 0 && invalidEmails.length === 0 && !sending;

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

  function handleSend() {
    if (!canSend) return;
    setSending(true);
    setTimeout(() => {
      const batchId = `BATCH-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(Math.random() * 9000) + 1000}`;
      addEmailDispatch({
        batchId,
        sentAt:               new Date().toISOString().replace("T", " ").slice(0, 16),
        senderName:           getCurrentUser()?.name ?? "시스템",
        recipientInstitution: target.leadInstitutionName,
        recipientEmail:       emails.join(", "),
        subject,
        emailType:            isOther ? "OTHER" : "TAX_INVOICE",
        feeCategory:          isOther ? undefined : feeCategory,
        isReverseRequest:     target.kind === "REVERSE" ? true : undefined,
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
            {!isOther && (
              <button type="button" onClick={() => setShowStandardPanel((v) => !v)} className="text-[11px] text-slate-400 hover:text-teal-600 transition-colors">
                기본파일 일괄 수정
              </button>
            )}
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
      docRequestDate: docRequestDate || undefined,
      docReplyDate:   docReplyDate || undefined,
      assignedManager: assignedManager || undefined,
      registeredAt:   registeredAt || undefined,
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
    const resolvedAgencyId = resolveRdaAgencyId(form.agencyId, lead?.name ?? "");
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
            <label className="block text-xs font-medium text-slate-500 mb-1">당해 민간원금</label>
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

// ── 연차별 당해시작일/종료일 계산 (autoGenerateTermFees와 동일한 기준: 과제 시작일 + (연차-1)년) ──
function termDateRange(projectStartDate: string, termNumber: number): { start: string; end: string } {
  const start = new Date(projectStartDate);
  start.setFullYear(start.getFullYear() + termNumber - 1);
  const end = new Date(start);
  end.setFullYear(end.getFullYear() + 1);
  end.setDate(end.getDate() - 1);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
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

      // 이슈/메모 (최신순)
      const issues = projectIssues
        .filter((i) => i.projectNumber === f0.projectNumber)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

      // 발행구분 — billingType 없으면 세금계산서 유무로 판별
      const billingType = project?.billingType ?? (invoice ? "정발행" : "");
      const appliedFeeTotal = fees.reduce((s, f) => s + f.appliedFee, 0);

      // 과제구분(연차상시/정산)과 당해시작일/종료일은 과제 전체 기간이 아니라 "이 행이 나타내는 연차"
      // 기준으로 계산해야 한다 — 다년차 과제는 연차마다 행이 따로 나오므로, project 레벨 고정값을 그대로
      // 쓰면 모든 연차 행이 똑같은 날짜/구분을 보여줘서 어느 연차인지 구분이 안 된다.
      const termRange = project ? termDateRange(project.startDate, f0.termNumber) : null;
      const projectCategory = project ? (isSettlementTerm(project, f0.termNumber) ? "정산" : "연차상시") : "연차상시";

      return {
        key,
        projectId:           project?.id ?? "",
        leadInstitutionId:   project?.leadInstitutionId ?? "",
        agencyShortName:     agency?.shortName ?? "",
        projectNumber:       f0.projectNumber,
        projectName:         f0.projectName,
        leadInstitutionName: project?.leadInstitutionName ?? "",
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
        receivableAmount:    rv?.receivableAmount ?? 0,
        unclaimedAmount:     ucRecord?.amount ?? 0,
        projectCode:         project?.projectCode ?? "",
        agencyAssignedAt:    project?.agencyAssignedAt ?? "",
        docRequestDate:      project?.docRequestDate ?? "",
        docReplyDate:        project?.docReplyDate ?? "",
        recipientName:       leadMember?.contactName ?? "",
        recipientEmail:      leadMember?.contactEmail ?? "",
        projectDivision:     project?.projectDivision ?? "",
        assignedManager:     project?.assignedManager ?? "",
        registeredAt:        project?.registeredAt ?? "",
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
        issues,
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
  { key: "agencyShortName",    label: "약칭",        width: "w-16",  align: "text-center" },
  { key: "projectNumber",      label: "과제번호",    width: "w-36",  align: "text-left"   },
  { key: "projectName",        label: "과제명",      width: "w-52",  align: "text-left"   },
  { key: "leadInstitutionName",label: "주관기관",    width: "w-32",  align: "text-left"   },
  { key: "researchLead",       label: "연구책임자",  width: "w-20",  align: "text-center" },
  { key: "term",                label: "연차",        width: "w-16",  align: "text-center" },
  { key: "projectCategory",    label: "과제구분",    width: "w-20",  align: "text-center" },
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
  { key: "projectCode",        label: "과제코드",    width: "w-32",  align: "text-left"   },
  { key: "agencyAssignedAt",   label: "전담기관배정일",width: "w-24", align: "text-center" },
  { key: "docRequestDate",     label: "서류요청",    width: "w-24",  align: "text-center" },
  { key: "docReplyDate",       label: "서류회신",    width: "w-24",  align: "text-center" },
  { key: "recipientName",      label: "수신자",      width: "w-20",  align: "text-center" },
  { key: "recipientEmail",     label: "수신자이메일",width: "w-44",  align: "text-left"   },
  { key: "projectDivision",    label: "구분",        width: "w-14",  align: "text-center" },
  { key: "assignedManager",    label: "삼화담당자",  width: "w-20",  align: "text-center" },
] as const;

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

// ── FeesPage ──────────────────────────────────────────────────
export default function FeesPage() {
  const canEdit     = useCanWrite("fees");
  const canEditSales = useCanWrite("fees-sales");
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
  const [agencyAssignedFrom, setAgencyAssignedFrom] = useState("");
  const [agencyAssignedTo, setAgencyAssignedTo]     = useState("");
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

        const assignedDt = r.agencyAssignedAt;
        const matchAssignedFrom = agencyAssignedFrom === "" || (assignedDt !== "" && assignedDt >= agencyAssignedFrom);
        const matchAssignedTo   = agencyAssignedTo   === "" || (assignedDt !== "" && assignedDt <= agencyAssignedTo);

        return matchProjectNumber && matchProjectName && matchLeadInstitution && matchResearchLead
          && matchStatus && matchAgency && matchBillingType && matchCollectionStatus
          && matchOnlyReceivable && matchFrom && matchTo && matchEndFrom && matchEndTo
          && matchAssignedFrom && matchAssignedTo;
      }),
    [allRows, filterProjectNumber, filterProjectName, filterLeadInstitution, filterResearchLead,
     filterProjectStatus, filterAgency, filterBillingType, filterCollectionStatus, filterOnlyReceivable,
     invoiceDateFrom, invoiceDateTo, termEndDateFrom, termEndDateTo, agencyAssignedFrom, agencyAssignedTo]
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

      case "term":
        return <span className="text-xs font-semibold text-slate-700 whitespace-nowrap">{row.termYear}년 {row.termNumber}연차</span>;

      case "projectCategory":
        return (
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
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

  function exportToExcel() {
    const data = filtered.map((r) => ({
      "약칭": r.agencyShortName,
      "과제번호": r.projectNumber,
      "과제명": r.projectName,
      "주관기관": r.leadInstitutionName,
      "연구책임자": r.researchLead,
      "연차": `${r.termYear}년 ${r.termNumber}연차`,
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
            <button
              onClick={() => setModal({ mode: "project-add" })}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <FiPlus size={12} />
              새 과제 추가
            </button>
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
                filtered.flatMap((row, idx) => {
                  const isExpanded   = expandedKey === row.key;
                  const hasReceivable = row.receivableId !== "";
                  const isFullyPaid   = row.collectionStatus === "PAID";
                  // 같은 과제(연차별 여러 행)를 옅은 배경색으로 묶어 보여주고, 다른 과제로 넘어가는
                  // 경계엔 굵은 구분선을 넣어 어디까지가 한 과제인지 한눈에 보이게 한다.
                  const isGroupStart = idx === 0 || filtered[idx - 1].projectNumber !== row.projectNumber;
                  const groupBg = (rowGroupIndex.get(row.key) ?? 0) % 2 === 1 ? "bg-slate-50/50" : "bg-white";
                  return [
                    <tr
                      key={row.key}
                      className={`transition-colors ${isExpanded ? "bg-blue-50/30" : `${groupBg} hover:bg-slate-100/70`} ${
                        isGroupStart ? "border-t-2 border-t-slate-200" : "border-t border-t-slate-50"
                      } border-b border-b-slate-50`}
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
                            onSelect={(choice) =>
                              setModal({
                                mode: "dispatch",
                                target: {
                                  kind:                choice.kind,
                                  projectNumber:       row.projectNumber,
                                  projectName:         row.projectName,
                                  leadInstitutionName: row.leadInstitutionName,
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
                                    leadInstitutionName: row.leadInstitutionName,
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
                                      leadInstitutionName: row.leadInstitutionName,
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
                      <td className="px-3 py-2.5 text-center align-middle w-20">
                        {canEditSales && hasReceivable ? (
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
        <div className="px-4 py-2.5 border-t border-slate-100 text-xs text-slate-400">
          총 {filtered.length}건 표시 (전체 {allRows.length}건)
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
