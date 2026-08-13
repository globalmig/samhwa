"use client";

import { useState } from "react";
import { FiCheckCircle, FiChevronRight, FiEdit2, FiFileText, FiPaperclip, FiPlus, FiTrash2, FiX } from "react-icons/fi";
import {
  useStore,
  addFeeInvoiceTemplate,
  updateFeeInvoiceTemplate,
  deleteFeeInvoiceTemplate,
  setDefaultFeeInvoiceTemplate,
  addSimpleNoticeTemplate,
  updateSimpleNoticeTemplate,
  deleteSimpleNoticeTemplate,
  setDefaultSimpleNoticeTemplate,
  updateStandardAttachment,
  addStandardAttachment,
  deleteStandardAttachment,
} from "@/lib/store";
import {
  EMPTY_FEE_INVOICE_TEMPLATE,
  EMPTY_SIMPLE_NOTICE_TEMPLATE,
  type FeeInvoiceTemplate,
  type FeeInvoiceTemplateEntry,
  type SimpleNoticeTemplate,
  type SimpleNoticeTemplateEntry,
  type StandardAttachment,
  type Project,
  type ProjectMember,
  type FundingAgency,
  type TermFee,
  type TaxInvoice,
} from "@/lib/mock";
import { useCanWrite } from "@/lib/permissions";
import { splitVatInclusive, resolveTermDateRange } from "@/lib/utils";
import FeeInvoiceLetterPreview, { type FeeInvoiceStatusData } from "@/components/common/FeeInvoiceLetterPreview";
import { fillTokens, type SimpleNoticeTarget } from "@/components/common/SimpleNoticeModal";
import Modal from "@/components/common/Modal";

// 미리보기용 샘플 데이터 — 실제 발송 시엔 과제/연차 데이터로 자동 치환된다(app/fees/page.tsx의
// DispatchModal 참고). 여기 값은 실제 발송 청구서 샘플과 동일하게 맞춰 미리보기가 실물과 같아 보이게 했다.
const SAMPLE_STATUS: FeeInvoiceStatusData = {
  projectNumber: "RS-2024-00432298",
  projectName: "대형 이동로봇 플랫폼용 중공형/박형/소형 고감속 감속기 개발",
  periodValue: "2026.01.01~2026.12.31",
  leadInstitutionName: "(주)서진오토모티브",
  researchLead: "신석호",
  recipientName: "정기예",
  participantCount: 3,
};
const SAMPLE_FEE_TOTAL = 1_881_900;
const SAMPLE_FEE_SPLIT = splitVatInclusive(SAMPLE_FEE_TOTAL);
const SAMPLE_FEE_AMOUNTS = { supply: SAMPLE_FEE_SPLIT.supplyAmount, tax: SAMPLE_FEE_SPLIT.taxAmount, total: SAMPLE_FEE_TOTAL };

const inputCls = "w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400";

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function genAttachmentId(): string {
  return `fia-${Math.random().toString(36).slice(2, 10)}`;
}

// 청구서 양식(FeeInvoiceTemplateEntry) 4종 + 첨부 없이 본문만 보내는 간단 안내 메일
// (SimpleNoticeTemplateEntry) 2종을 같은 탭 목록에서 관리한다. 구조가 서로 달라서(청구서는
// 표 양식·첨부, 간단 안내 메일은 제목/본문 텍스트뿐) isSimpleCategory로 나눠서 렌더링한다.
type Category = FeeInvoiceTemplateEntry["category"] | SimpleNoticeTemplateEntry["category"];
function isSimpleCategory(cat: Category): cat is SimpleNoticeTemplateEntry["category"] {
  return cat === "DOC_REQUEST" || cat === "PAYMENT_REMINDER";
}
const CATEGORY_TABS: { key: Category; label: string }[] = [
  { key: "ANNUAL", label: "연차상시점검 수수료" },
  { key: "SETTLEMENT", label: "위탁정산 수수료" },
  { key: "REVERSE", label: "역발행 수수료" },
  { key: "OTHER", label: "기타 공문" },
  { key: "DOC_REQUEST", label: "계산서발행 서류 요청" },
  { key: "PAYMENT_REMINDER", label: "입금 확인 요청" },
];
const SIMPLE_NOTICE_TOKENS = [
  "{과제번호}", "{과제명}", "{전담기관명}", "{기관명}", "{당해연구개발기간}",
  "{연구책임자}", "{참여기관수}", "{수수료금액}", "{세금계산서발행일}",
];

// ─── 템플릿 선택 모달 ─────────────────────────────────────────
// 청구서 양식(title)과 간단 안내 메일(subject) 둘 다 이 표에서 재사용하므로, "제목" 칼럼에 보여줄
// 값은 호출 쪽에서 getTitle로 넘겨받는다.
function TemplatePickerModal<T extends { id: string; name: string; isDefault: boolean }>({
  templates,
  getTitle,
  selectedId,
  onSelect,
  onSetDefault,
  onDelete,
  onClose,
}: {
  templates: T[];
  getTitle: (t: T) => string;
  selectedId: string;
  onSelect: (id: string) => void;
  onSetDefault?: (id: string) => void;
  onDelete?: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="flex flex-col max-h-[70vh]">
      <div className="overflow-y-auto flex-1">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-100">
              <th className="text-left px-5 py-2.5 text-xs font-medium text-slate-500 whitespace-nowrap">템플릿명</th>
              <th className="text-left px-5 py-2.5 text-xs font-medium text-slate-500">제목</th>
              <th className="text-center px-5 py-2.5 text-xs font-medium text-slate-500 whitespace-nowrap w-20">대표양식</th>
              <th className="px-5 py-2.5 w-44" />
            </tr>
          </thead>
          <tbody>
            {templates.map((t) => {
              const isSelected = t.id === selectedId;
              return (
                <tr key={t.id} className={`border-b border-slate-50 hover:bg-slate-50 ${isSelected ? "bg-blue-50/50" : ""}`}>
                  <td className="px-5 py-3 font-medium text-slate-700">{t.name}</td>
                  <td className="px-5 py-3 text-slate-500 truncate max-w-xs">{getTitle(t) || "—"}</td>
                  <td className="px-5 py-3 text-center">
                    {t.isDefault ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                        <FiCheckCircle size={12} /> 대표
                      </span>
                    ) : (
                      onSetDefault && (
                        <button
                          onClick={() => onSetDefault(t.id)}
                          className="text-[11px] font-medium text-slate-400 hover:text-emerald-600 hover:underline"
                        >
                          대표로 지정
                        </button>
                      )
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {onDelete && !t.isDefault && (
                        <button
                          onClick={() => onDelete(t.id)}
                          title="템플릿 삭제"
                          className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                        >
                          <FiTrash2 size={13} />
                        </button>
                      )}
                      <button
                        onClick={() => { onSelect(t.id); onClose(); }}
                        className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
                          isSelected ? "bg-blue-600 text-white" : "text-blue-600 border border-blue-200 hover:bg-blue-50"
                        }`}
                      >
                        {isSelected ? "선택됨" : "선택"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// 과제를 하나도 고르지 않았을 때(또는 참여기관이 없어 값을 못 채울 때)의 대체 샘플 데이터.
const SIMPLE_NOTICE_FALLBACK_SAMPLE: SimpleNoticeTarget = {
  kind: "DOC_REQUEST",
  projectNumber: "RS-2024-00432298",
  projectName: "대형 이동로봇 플랫폼용 중공형/박형/소형 고감속 감속기 개발",
  agencyName: "한국산업기술기획평가원",
  leadInstitutionName: "(주)서진오토모티브",
  termStart: "2026-01-01",
  termEnd: "2026-12-31",
  researchLead: "신석호",
  participantCount: 3,
  recipientEmail: "",
  totalAmount: 1_881_900,
  invoiceIssuedAt: "2026-01-15",
};

// 실제 과제·연차를 골랐을 때 그 데이터로 SimpleNoticeTarget을 채운다 — app/fees/page.tsx의 공문발송
// 버튼이 SimpleNoticeModal에 넘기는 값 구성과 동일한 기준(참여기관 LEAD/공동, 전담기관 정식명칭,
// 해당 연차의 실제 청구액·계산서발행일)을 따른다.
function buildSampleFromProject(
  kind: SimpleNoticeTemplateEntry["category"],
  project: Project,
  termNumber: number,
  projectMembers: ProjectMember[],
  fundingAgencies: FundingAgency[],
  termFees: TermFee[],
  taxInvoices: TaxInvoice[]
): SimpleNoticeTarget {
  const members = projectMembers.filter((m) => m.projectId === project.id);
  const lead = members.find((m) => m.role === "LEAD");
  const agency = fundingAgencies.find((a) => a.id === project.agencyId);
  const { start, end } = resolveTermDateRange(project, termNumber);
  const termFeesForTerm = termFees.filter((f) => f.projectNumber === project.projectNumber && f.termNumber === termNumber);
  const invoice = taxInvoices.find((t) => t.projectNumber === project.projectNumber && t.termNumber === termNumber && t.status !== "CANCELED");
  return {
    kind,
    projectNumber: project.projectNumber,
    projectName: project.projectName,
    agencyName: agency?.name ?? project.agency,
    leadInstitutionName: lead?.institutionName ?? project.leadInstitutionName,
    termStart: start,
    termEnd: end,
    researchLead: project.researchLead ?? "",
    participantCount: members.filter((m) => m.role !== "LEAD").length,
    recipientEmail: "",
    totalAmount: termFeesForTerm.reduce((s, f) => s + f.appliedFee, 0),
    invoiceIssuedAt: invoice?.issuedAt ?? "",
  };
}

// ─── 간단 안내 메일 편집기 (계산서발행 서류 요청 / 입금 확인 요청) ─────────
// 청구서 양식과 달리 표 서식이 없어 제목·본문 텍스트만 편집하고, {토큰}이 치환된 결과를
// 실제 과제를 골라 그 연차 데이터로 바로 미리 볼 수 있게 한다.
function SimpleNoticeTemplateEditor({
  selected,
  isEditing,
  draft,
  onFieldChange,
  projects,
  projectMembers,
  fundingAgencies,
  termFees,
  taxInvoices,
}: {
  selected: SimpleNoticeTemplateEntry;
  isEditing: boolean;
  draft: SimpleNoticeTemplate;
  onFieldChange: <K extends keyof SimpleNoticeTemplate>(key: K, value: SimpleNoticeTemplate[K]) => void;
  projects: Project[];
  projectMembers: ProjectMember[];
  fundingAgencies: FundingAgency[];
  termFees: TermFee[];
  taxInvoices: TaxInvoice[];
}) {
  const content = isEditing ? draft : selected.content;

  const [previewProjectId, setPreviewProjectId] = useState("");
  const previewProject = projects.find((p) => p.id === previewProjectId);
  const [previewTerm, setPreviewTerm] = useState(1);

  const sample: SimpleNoticeTarget = previewProject
    ? buildSampleFromProject(selected.category, previewProject, previewTerm, projectMembers, fundingAgencies, termFees, taxInvoices)
    : { ...SIMPLE_NOTICE_FALLBACK_SAMPLE, kind: selected.category };

  function pickProject(id: string) {
    setPreviewProjectId(id);
    const p = projects.find((pr) => pr.id === id);
    setPreviewTerm(p?.currentTerm ?? 1);
  }

  return (
    <div className="space-y-5">
      {isEditing ? (
        <>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">메일 제목</label>
            <input
              value={content.subject}
              onChange={(e) => onFieldChange("subject", e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">메일 본문</label>
            <textarea
              value={content.body}
              onChange={(e) => onFieldChange("body", e.target.value)}
              rows={20}
              className={`${inputCls} leading-relaxed whitespace-pre-wrap`}
            />
          </div>
          <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2.5">
            <p className="text-[11px] font-medium text-slate-500 mb-1.5">사용 가능한 토큰 — 발송 시 실제 과제 정보로 자동 치환됩니다</p>
            <div className="flex flex-wrap gap-1.5">
              {SIMPLE_NOTICE_TOKENS.map((token) => (
                <span key={token} className="text-[11px] font-mono text-blue-700 bg-blue-50 border border-blue-100 rounded px-1.5 py-0.5">
                  {token}
                </span>
              ))}
            </div>
          </div>
        </>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[11px] font-medium text-slate-400 shrink-0">미리보기 —</p>
            <select
              value={previewProjectId}
              onChange={(e) => pickProject(e.target.value)}
              className="text-xs border border-slate-200 rounded-lg px-2 py-1 text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 max-w-xs"
            >
              <option value="">샘플 데이터로 보기</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.projectNumber} · {p.projectName}</option>
              ))}
            </select>
            {previewProject && (
              <select
                value={previewTerm}
                onChange={(e) => setPreviewTerm(Number(e.target.value))}
                className="text-xs border border-slate-200 rounded-lg px-2 py-1 text-slate-700 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
              >
                {Array.from({ length: previewProject.totalTerms }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>{n}연차</option>
                ))}
              </select>
            )}
            <p className="text-[11px] text-slate-400">{previewProject ? "이 과제·연차의 실제 정보로 토큰이 치환됩니다" : "과제를 고르지 않으면 예시 데이터로 표시됩니다"}</p>
          </div>
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-100">
              <p className="text-xs font-semibold text-slate-700">{fillTokens(content.subject, sample) || "(제목 없음)"}</p>
            </div>
            <div className="px-4 py-4 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
              {fillTokens(content.body, sample) || "(본문 없음)"}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function NoticeInvoiceTemplatesPage() {
  const canEdit = useCanWrite("notice-templates");
  // 사업자등록증·통장사본은 회계담당자·시스템관리자만 등록/교체/포함여부 변경이 가능하고,
  // 그 외(전담기관담당자 등)는 이 페이지에 들어와도 조회만 가능하다 — 템플릿 문구 편집 권한(canEdit)과는 별개 범위.
  const canEditStandard = useCanWrite("standard-attachments");
  const { feeInvoiceTemplates, simpleNoticeTemplates, standardAttachments, projects, projectMembers, fundingAgencies, termFees, taxInvoices } = useStore();
  // 파일이 등록된 항목은 기본 접힘, 없는 항목은 기본 펼침 — 사용자가 직접 펼치거나 접으면
  // 그 세션 동안은 이 값(override)이 기본 규칙보다 우선한다.
  const [attachmentExpandOverride, setAttachmentExpandOverride] = useState<Record<string, boolean>>({});
  const [activeCategory, setActiveCategory] = useState<Category>("ANNUAL");
  const isSimple = isSimpleCategory(activeCategory);
  // 카테고리 성격에 따라 두 저장소(feeInvoiceTemplates/simpleNoticeTemplates) 중 하나에서 목록을 가져온다.
  const categoryTemplates: (FeeInvoiceTemplateEntry | SimpleNoticeTemplateEntry)[] = isSimple
    ? simpleNoticeTemplates.filter((t) => t.category === activeCategory)
    : feeInvoiceTemplates.filter((t) => t.category === activeCategory);
  const activeCategoryLabel = CATEGORY_TABS.find((t) => t.key === activeCategory)?.label ?? "";

  const [selectedId, setSelectedId] = useState(
    categoryTemplates.find((t) => t.isDefault)?.id ?? categoryTemplates[0]?.id ?? ""
  );
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<FeeInvoiceTemplate>(EMPTY_FEE_INVOICE_TEMPLATE);
  const [simpleDraft, setSimpleDraft] = useState<SimpleNoticeTemplate>(EMPTY_SIMPLE_NOTICE_TEMPLATE);
  const [draftName, setDraftName] = useState("");
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);

  const selected = categoryTemplates.find((t) => t.id === selectedId) ?? categoryTemplates[0];

  function selectCategory(cat: Category) {
    setActiveCategory(cat);
    const list = isSimpleCategory(cat)
      ? simpleNoticeTemplates.filter((t) => t.category === cat)
      : feeInvoiceTemplates.filter((t) => t.category === cat);
    setSelectedId(list.find((t) => t.isDefault)?.id ?? list[0]?.id ?? "");
    setIsEditing(false);
    setShowNewForm(false);
  }
  function selectTemplate(id: string) {
    setSelectedId(id);
    setIsEditing(false);
  }
  function startEdit() {
    if (!selected) return;
    if (isSimple) {
      setSimpleDraft(JSON.parse(JSON.stringify(selected.content)));
    } else {
      setDraft(JSON.parse(JSON.stringify(selected.content)));
    }
    setDraftName(selected.name);
    setIsEditing(true);
  }
  function cancelEdit() {
    setIsEditing(false);
  }
  function saveEdit() {
    if (!selected) return;
    if (isSimple) {
      updateSimpleNoticeTemplate(selected.id, { name: draftName.trim() || selected.name, content: simpleDraft });
    } else {
      updateFeeInvoiceTemplate(selected.id, { name: draftName.trim() || selected.name, content: draft });
    }
    setIsEditing(false);
  }
  function setField<K extends keyof FeeInvoiceTemplate>(key: K, value: FeeInvoiceTemplate[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }
  function setSimpleField<K extends keyof SimpleNoticeTemplate>(key: K, value: SimpleNoticeTemplate[K]) {
    setSimpleDraft((d) => ({ ...d, [key]: value }));
  }
  function createTemplate() {
    if (!newName.trim()) return;
    const item = isSimple
      ? addSimpleNoticeTemplate(activeCategory as SimpleNoticeTemplateEntry["category"], newName.trim(), EMPTY_SIMPLE_NOTICE_TEMPLATE)
      : addFeeInvoiceTemplate(activeCategory as FeeInvoiceTemplateEntry["category"], newName.trim(), EMPTY_FEE_INVOICE_TEMPLATE);
    setSelectedId(item.id);
    setNewName("");
    setShowNewForm(false);
    if (isSimple) {
      setSimpleDraft(JSON.parse(JSON.stringify(EMPTY_SIMPLE_NOTICE_TEMPLATE)));
    } else {
      setDraft(JSON.parse(JSON.stringify(EMPTY_FEE_INVOICE_TEMPLATE)));
    }
    setDraftName(item.name);
    setIsEditing(true);
  }
  function removeTemplate(id: string) {
    if (!window.confirm("이 템플릿을 삭제할까요?")) return;
    if (isSimple) deleteSimpleNoticeTemplate(id);
    else deleteFeeInvoiceTemplate(id);
    if (selectedId === id) {
      const remaining = categoryTemplates.filter((t) => t.id !== id);
      setSelectedId(remaining.find((t) => t.isDefault)?.id ?? remaining[0]?.id ?? "");
    }
  }
  function makeDefault(id: string) {
    if (isSimple) setDefaultSimpleNoticeTemplate(id);
    else setDefaultFeeInvoiceTemplate(id);
  }

  // 기본 첨부 파일 — 이 카테고리로 발송할 때(app/fees/page.tsx의 DispatchModal) 항상 자동으로
  // 붙는 파일이다. 편집 중(draft) 여부와 무관하게 바로바로 저장되는 별도 항목이라, letter 내용의
  // isEditing/draft/저장 흐름과 분리해서 각 조작마다 즉시 store에 반영한다.
  // 간단 안내 메일(DOC_REQUEST/PAYMENT_REMINDER)엔 첨부파일이 없어 이 함수들은 청구서 양식일 때만
  // 쓰인다 — 버튼 자체도 아래 JSX에서 !isSimple일 때만 보이므로 isSimple이면 조용히 아무 일도 안 한다.
  function addDefaultAttachment() {
    if (!selected || isSimple) return;
    const entry = selected as FeeInvoiceTemplateEntry;
    const next = [...(entry.defaultAttachments ?? []), { id: genAttachmentId(), name: "" }];
    updateFeeInvoiceTemplate(entry.id, { defaultAttachments: next });
  }
  function renameDefaultAttachment(attId: string, name: string) {
    if (!selected || isSimple) return;
    const entry = selected as FeeInvoiceTemplateEntry;
    const next = (entry.defaultAttachments ?? []).map((a) => (a.id === attId ? { ...a, name } : a));
    updateFeeInvoiceTemplate(entry.id, { defaultAttachments: next });
  }
  function removeDefaultAttachment(attId: string) {
    if (!selected || isSimple) return;
    const entry = selected as FeeInvoiceTemplateEntry;
    const next = (entry.defaultAttachments ?? []).filter((a) => a.id !== attId);
    updateFeeInvoiceTemplate(entry.id, { defaultAttachments: next });
  }
  async function handleDefaultAttachmentFile(attId: string, files: FileList | null) {
    if (!selected || isSimple) return;
    const entry = selected as FeeInvoiceTemplateEntry;
    const file = files?.[0];
    if (!file) return;
    const fileDataUrl = await fileToDataUrl(file);
    const next = (entry.defaultAttachments ?? []).map((a) => (a.id === attId ? { ...a, fileDataUrl } : a));
    updateFeeInvoiceTemplate(entry.id, { defaultAttachments: next });
  }

  // 사업자등록증 등 공통 첨부파일 — 파일 자체는 유형(카테고리)과 무관하게 하나만 관리하지만, "이 유형
  // 발송 시 첨부할지"는 카테고리마다 따로 켜고 끌 수 있다(enabledByCategory). 지금까지는 수수료 청구
  // 관리 → 공문발송 모달의 "기본파일 일괄 수정" 안에서만 바꿀 수 있어 눈에 잘 안 띄었는데, 여기서도
  // 바로 등록/교체하고 목록 자체를 추가·삭제할 수 있게 한다(같은 store 항목을 공유해서 둘 다 반영됨).
  async function handleReplaceStandardAttachment(id: string, files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    const fileDataUrl = await fileToDataUrl(file);
    updateStandardAttachment(id, { fileDataUrl, updatedAt: new Date().toISOString().slice(0, 10) });
  }
  function renameStandardAttachment(id: string, name: string) {
    updateStandardAttachment(id, { name });
  }
  function toggleStandardAttachmentForCategory(a: StandardAttachment) {
    // 공통 첨부파일은 청구서 양식(4종)에만 적용된다 — 이 함수를 여는 버튼도 !isSimple일 때만 보인다.
    if (isSimple) return;
    const cat = activeCategory as FeeInvoiceTemplateEntry["category"];
    const current = a.enabledByCategory?.[cat] ?? true;
    updateStandardAttachment(a.id, { enabledByCategory: { ...(a.enabledByCategory ?? {}), [cat]: !current } });
  }
  function addStandardAttachmentRow() {
    const item = addStandardAttachment("");
    setAttachmentExpandOverride((prev) => ({ ...prev, [item.id]: true }));
  }
  function removeStandardAttachmentRow(id: string) {
    if (!window.confirm("이 공통 첨부 파일을 삭제할까요? 모든 유형의 발송에서 제외됩니다.")) return;
    deleteStandardAttachment(id);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">
          유형별로 수수료 청구서 양식(연차상시/위탁정산/역발행/기타) 또는 간단 안내 메일(계산서발행 서류 요청/입금 확인 요청)을 등록·관리합니다.
          &quot;대표양식&quot;으로 지정한 템플릿이 실제 발송(수수료 청구 관리 → 공문발송) 시 자동으로 적용됩니다.
        </p>
      </div>

      <div className="flex gap-1.5">
        {CATEGORY_TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => selectCategory(t.key)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              activeCategory === t.key
                ? "bg-slate-800 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {/* 템플릿 불러오기 · 등록 */}
        <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100 bg-slate-50">
          <label className="text-xs font-medium text-slate-600 shrink-0">템플릿 불러오기</label>
          <div className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 truncate flex items-center gap-1.5">
            {selected ? (
              <>
                {selected.name}
                {selected.isDefault && (
                  <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-emerald-700">
                    <FiCheckCircle size={10} /> 대표
                  </span>
                )}
              </>
            ) : (
              "등록된 템플릿이 없습니다"
            )}
          </div>
          <button
            type="button"
            onClick={() => setShowTemplatePicker(true)}
            disabled={categoryTemplates.length === 0}
            className="shrink-0 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            선택
          </button>
          {canEdit && (
            <button
              onClick={() => setShowNewForm(true)}
              className="shrink-0 flex items-center gap-1 text-xs font-medium text-blue-600 border border-dashed border-blue-300 rounded-lg px-3 py-1.5 hover:bg-blue-50 transition-colors"
            >
              <FiPlus size={11} /> 새 템플릿 등록
            </button>
          )}
        </div>

        {showTemplatePicker && (
          <Modal title="템플릿 선택" onClose={() => setShowTemplatePicker(false)} size="lg">
            <TemplatePickerModal
              templates={categoryTemplates}
              getTitle={(t) => isSimple ? (t as SimpleNoticeTemplateEntry).content.subject : (t as FeeInvoiceTemplateEntry).content.title}
              selectedId={selectedId}
              onSelect={selectTemplate}
              onSetDefault={canEdit ? makeDefault : undefined}
              onDelete={canEdit ? removeTemplate : undefined}
              onClose={() => setShowTemplatePicker(false)}
            />
          </Modal>
        )}

        {showNewForm && (
          <Modal title="새 템플릿 등록" onClose={() => { setShowNewForm(false); setNewName(""); }} size="lg">
            <div className="p-8 space-y-5">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">템플릿 이름</label>
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="예: 연차상시점검 수수료 청구서 (신규)"
                  onKeyDown={(e) => { if (e.key === "Enter") createTemplate(); }}
                  className="w-full text-base border border-slate-200 rounded-lg px-4 py-3 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                />
                <p className="text-xs text-slate-400 mt-2">
                  템플릿 목록에서 표시되는 이름입니다. 등록 후 상세 내용을 바로 편집할 수 있고, 목록에서 &quot;대표로 지정&quot;해야 실제 발송에 쓰입니다.
                </p>
              </div>
              <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
                <button
                  onClick={() => { setShowNewForm(false); setNewName(""); }}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  취소
                </button>
                <button
                  onClick={createTemplate}
                  disabled={!newName.trim()}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  등록
                </button>
              </div>
            </div>
          </Modal>
        )}

        {!selected ? (
          <div className="p-10 text-center text-sm text-slate-400">
            등록된 템플릿이 없습니다. 위 &quot;새 템플릿 등록&quot; 버튼으로 추가해주세요.
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <FiFileText className="text-slate-400 shrink-0" size={14} />
                {isEditing ? (
                  <input
                    value={draftName}
                    onChange={(e) => setDraftName(e.target.value)}
                    placeholder="템플릿 이름"
                    className={`${inputCls} max-w-xs py-1`}
                  />
                ) : (
                  <p className="text-sm font-semibold text-slate-800 truncate">{selected.name}</p>
                )}
                {selected.isDefault && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 shrink-0">
                    <FiCheckCircle size={12} /> 대표양식
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {isEditing ? (
                  <>
                    <button onClick={cancelEdit} className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">
                      취소
                    </button>
                    <button onClick={saveEdit} className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors">
                      저장
                    </button>
                  </>
                ) : (
                  canEdit && (
                    <>
                      {!selected.isDefault && (
                        <button
                          onClick={() => makeDefault(selected.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-emerald-700 border border-emerald-200 hover:bg-emerald-50 rounded-lg transition-colors"
                        >
                          <FiCheckCircle size={12} /> 대표로 지정
                        </button>
                      )}
                      <button
                        onClick={startEdit}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors"
                      >
                        <FiEdit2 size={12} /> 편집
                      </button>
                    </>
                  )
                )}
              </div>
            </div>

            {/* 간단 안내 메일(계산서발행 서류 요청/입금 확인 요청)은 첨부파일이 없으므로 아래 두 첨부
                파일 섹션은 청구서 양식(4종)일 때만 보여준다. */}
            {!isSimple && selected && (() => {
              const feeSelected = selected as FeeInvoiceTemplateEntry;
              return (
            <>
            {/* 공통 첨부 파일 — 파일 자체는 유형 구분 없이 하나만 관리하지만, "이 유형 발송 시 첨부할지"는
                지금 선택된 카테고리(activeCategory) 탭마다 따로 켜고 끌 수 있다 */}
            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/60 space-y-3">
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                  <FiPaperclip size={12} className="text-slate-400" /> 공통 첨부 파일
                </p>
                {canEditStandard && (
                  <button
                    type="button"
                    onClick={addStandardAttachmentRow}
                    className="flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-700 transition-colors"
                  >
                    <FiPlus size={11} /> 파일 추가
                  </button>
                )}
              </div>
              <p className="text-[11px] text-slate-400">
                파일은 유형 공통이고, 발송 시 첨부 여부는 지금 선택된 <strong className="text-slate-500">{activeCategoryLabel}</strong> 탭 기준으로 켜고 끌 수 있습니다.
              </p>
              {standardAttachments.length === 0 ? (
                <p className="text-xs text-slate-400 py-1">등록된 공통 첨부 파일이 없습니다.</p>
              ) : (
                <div className="space-y-2">
                  {standardAttachments.map((a) => {
                    const hasFile = !!a.fileDataUrl;
                    const expanded = attachmentExpandOverride[a.id] ?? !hasFile;
                    const enabled = a.enabledByCategory?.[activeCategory] ?? true;
                    return (
                      <div key={a.id} className="bg-white rounded-lg border border-slate-200 overflow-hidden">
                        <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                          <button
                            type="button"
                            onClick={() => setAttachmentExpandOverride((prev) => ({ ...prev, [a.id]: !expanded }))}
                            className="flex items-center gap-2 min-w-0 flex-1 text-left"
                          >
                            <FiChevronRight size={12} className={`shrink-0 text-slate-400 transition-transform ${expanded ? "rotate-90" : ""}`} />
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-slate-700 truncate">{a.name || "(이름 없음)"}</p>
                              <p className={`text-[10px] mt-0.5 ${hasFile ? "text-emerald-600" : "text-amber-500"}`}>
                                {hasFile ? `파일 등록됨 · ${a.updatedAt} 수정` : "등록된 파일 없음"}
                              </p>
                            </div>
                          </button>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className="text-[10px] text-slate-400 whitespace-nowrap">{enabled ? `${activeCategoryLabel} 첨부` : `${activeCategoryLabel} 제외`}</span>
                            {canEditStandard && (
                              <button
                                type="button"
                                role="switch"
                                aria-checked={enabled}
                                onClick={() => toggleStandardAttachmentForCategory(a)}
                                title={`${activeCategoryLabel} 발송 시 자동 첨부 여부`}
                                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                                  enabled ? "bg-blue-600" : "bg-slate-300"
                                }`}
                              >
                                <span
                                  className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                                    enabled ? "translate-x-4.5" : "translate-x-0.5"
                                  }`}
                                />
                              </button>
                            )}
                          </div>
                        </div>
                        {expanded && (
                          <div className="px-3 pb-3 pt-2.5 border-t border-slate-100 space-y-2">
                            {canEditStandard ? (
                              <input
                                value={a.name}
                                onChange={(e) => renameStandardAttachment(a.id, e.target.value)}
                                placeholder="파일명 (예: 사업자등록증.pdf)"
                                className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-700 bg-slate-50 focus:outline-none focus:ring-1 focus:ring-blue-400"
                              />
                            ) : null}
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-[11px] text-slate-400">
                                {hasFile ? `${a.updatedAt} 수정` : "파일을 등록하면 발송 시 자동으로 첨부됩니다."}
                              </p>
                              {canEditStandard && (
                                <div className="flex items-center gap-2 shrink-0">
                                  <label className="text-[11px] font-medium text-teal-600 hover:text-teal-700 cursor-pointer whitespace-nowrap">
                                    {hasFile ? "파일 교체" : "파일 선택"}
                                    <input
                                      type="file"
                                      className="hidden"
                                      onChange={(e) => { handleReplaceStandardAttachment(a.id, e.target.files); e.target.value = ""; }}
                                    />
                                  </label>
                                  <button
                                    type="button"
                                    onClick={() => removeStandardAttachmentRow(a.id)}
                                    className="p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                                    title="삭제"
                                  >
                                    <FiX size={12} />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* 기본 첨부 파일 — letter 내용(draft/저장)과 무관하게 조작 즉시 저장된다 */}
            <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/60 space-y-3">
              <div className="flex items-center justify-between">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                  <FiPaperclip size={12} className="text-slate-400" /> 기본 첨부 파일
                </p>
                {canEdit && (
                  <button
                    type="button"
                    onClick={addDefaultAttachment}
                    className="flex items-center gap-1 text-[11px] font-medium text-blue-600 hover:text-blue-700 transition-colors"
                  >
                    <FiPlus size={11} /> 파일 추가
                  </button>
                )}
              </div>
              <p className="text-[11px] text-slate-400">
                이 유형으로 발송할 때(수수료 청구 관리 → 공문발송) 청구서 PDF·사업자등록증과 함께 항상 자동으로 첨부됩니다.
              </p>
              {(feeSelected.defaultAttachments ?? []).length === 0 ? (
                <p className="text-xs text-slate-400 py-1">등록된 기본 첨부 파일이 없습니다.</p>
              ) : (
                <div className="space-y-1.5">
                  {(feeSelected.defaultAttachments ?? []).map((a) => (
                    <div key={a.id} className="flex items-center gap-2 bg-white rounded-lg border border-slate-200 px-3 py-2">
                      {canEdit ? (
                        <input
                          value={a.name}
                          onChange={(e) => renameDefaultAttachment(a.id, e.target.value)}
                          placeholder="파일명 (예: 위탁정산내역서.pdf)"
                          className="flex-1 text-xs border-none outline-none text-slate-700 bg-transparent"
                        />
                      ) : (
                        <span className="flex-1 text-xs text-slate-700 truncate">{a.name || "—"}</span>
                      )}
                      <span className={`text-[10px] shrink-0 ${a.fileDataUrl ? "text-emerald-600" : "text-amber-500"}`}>
                        {a.fileDataUrl ? "파일 등록됨" : "파일 없음"}
                      </span>
                      {canEdit && (
                        <>
                          <label className="shrink-0 text-[11px] font-medium text-teal-600 hover:text-teal-700 cursor-pointer whitespace-nowrap">
                            파일 선택
                            <input
                              type="file"
                              className="hidden"
                              onChange={(e) => { handleDefaultAttachmentFile(a.id, e.target.files); e.target.value = ""; }}
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => removeDefaultAttachment(a.id)}
                            className="shrink-0 p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
                            title="삭제"
                          >
                            <FiX size={12} />
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            </>
              );
            })()}

            <div className="p-8">
              {isSimple ? (
                <SimpleNoticeTemplateEditor
                  selected={selected as SimpleNoticeTemplateEntry}
                  isEditing={isEditing}
                  draft={simpleDraft}
                  onFieldChange={setSimpleField}
                  projects={projects}
                  projectMembers={projectMembers}
                  fundingAgencies={fundingAgencies}
                  termFees={termFees}
                  taxInvoices={taxInvoices}
                />
              ) : (
                <FeeInvoiceLetterPreview
                  template={isEditing ? draft : (selected as FeeInvoiceTemplateEntry).content}
                  status={SAMPLE_STATUS}
                  feeAmounts={SAMPLE_FEE_AMOUNTS}
                  docNumber="삼화 2026-#### (자동 채번)"
                  previewMode
                  editable={isEditing}
                  onFieldChange={setField}
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
