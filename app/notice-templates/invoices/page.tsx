"use client";

import { useState } from "react";
import { FiCheckCircle, FiChevronRight, FiEdit2, FiFileText, FiPaperclip, FiPlus, FiTrash2, FiX } from "react-icons/fi";
import {
  useStore,
  addFeeInvoiceTemplate,
  updateFeeInvoiceTemplate,
  deleteFeeInvoiceTemplate,
  setDefaultFeeInvoiceTemplate,
  updateStandardAttachment,
  addStandardAttachment,
  deleteStandardAttachment,
} from "@/lib/store";
import { EMPTY_FEE_INVOICE_TEMPLATE, type FeeInvoiceTemplate, type FeeInvoiceTemplateEntry, type StandardAttachment } from "@/lib/mock";
import { useCanWrite } from "@/lib/permissions";
import FeeInvoiceLetterPreview, { type FeeInvoiceStatusData } from "@/components/common/FeeInvoiceLetterPreview";
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
const SAMPLE_FEE_AMOUNTS = { standard: 1_881_900, surcharge: 0, total: 1_881_900 };

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

const CATEGORY_TABS: { key: FeeInvoiceTemplateEntry["category"]; label: string }[] = [
  { key: "ANNUAL", label: "연차상시점검 수수료" },
  { key: "SETTLEMENT", label: "위탁정산 수수료" },
  { key: "REVERSE", label: "역발행 수수료" },
  { key: "OTHER", label: "기타 공문" },
];

// ─── 템플릿 선택 모달 ─────────────────────────────────────────
function TemplatePickerModal({
  templates,
  selectedId,
  onSelect,
  onSetDefault,
  onDelete,
  onClose,
}: {
  templates: FeeInvoiceTemplateEntry[];
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
                  <td className="px-5 py-3 text-slate-500 truncate max-w-xs">{t.content.title || "—"}</td>
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

export default function NoticeInvoiceTemplatesPage() {
  const canEdit = useCanWrite("notice-templates");
  // 사업자등록증·통장사본은 회계담당자·시스템관리자만 등록/교체/포함여부 변경이 가능하고,
  // 그 외(전담기관담당자 등)는 이 페이지에 들어와도 조회만 가능하다 — 템플릿 문구 편집 권한(canEdit)과는 별개 범위.
  const canEditStandard = useCanWrite("standard-attachments");
  const { feeInvoiceTemplates, standardAttachments } = useStore();
  // 파일이 등록된 항목은 기본 접힘, 없는 항목은 기본 펼침 — 사용자가 직접 펼치거나 접으면
  // 그 세션 동안은 이 값(override)이 기본 규칙보다 우선한다.
  const [attachmentExpandOverride, setAttachmentExpandOverride] = useState<Record<string, boolean>>({});
  const [activeCategory, setActiveCategory] = useState<FeeInvoiceTemplateEntry["category"]>("ANNUAL");
  const categoryTemplates = feeInvoiceTemplates.filter((t) => t.category === activeCategory);
  const activeCategoryLabel = CATEGORY_TABS.find((t) => t.key === activeCategory)?.label ?? "";

  const [selectedId, setSelectedId] = useState(
    categoryTemplates.find((t) => t.isDefault)?.id ?? categoryTemplates[0]?.id ?? ""
  );
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<FeeInvoiceTemplate>(EMPTY_FEE_INVOICE_TEMPLATE);
  const [draftName, setDraftName] = useState("");
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);

  const selected = categoryTemplates.find((t) => t.id === selectedId) ?? categoryTemplates[0];

  function selectCategory(cat: FeeInvoiceTemplateEntry["category"]) {
    setActiveCategory(cat);
    const list = feeInvoiceTemplates.filter((t) => t.category === cat);
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
    setDraft(JSON.parse(JSON.stringify(selected.content)));
    setDraftName(selected.name);
    setIsEditing(true);
  }
  function cancelEdit() {
    setIsEditing(false);
  }
  function saveEdit() {
    if (!selected) return;
    updateFeeInvoiceTemplate(selected.id, { name: draftName.trim() || selected.name, content: draft });
    setIsEditing(false);
  }
  function setField<K extends keyof FeeInvoiceTemplate>(key: K, value: FeeInvoiceTemplate[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }
  function createTemplate() {
    if (!newName.trim()) return;
    const item = addFeeInvoiceTemplate(activeCategory, newName.trim(), EMPTY_FEE_INVOICE_TEMPLATE);
    setSelectedId(item.id);
    setNewName("");
    setShowNewForm(false);
    setDraft(JSON.parse(JSON.stringify(EMPTY_FEE_INVOICE_TEMPLATE)));
    setDraftName(item.name);
    setIsEditing(true);
  }
  function removeTemplate(id: string) {
    if (!window.confirm("이 템플릿을 삭제할까요?")) return;
    deleteFeeInvoiceTemplate(id);
    if (selectedId === id) {
      const remaining = categoryTemplates.filter((t) => t.id !== id);
      setSelectedId(remaining.find((t) => t.isDefault)?.id ?? remaining[0]?.id ?? "");
    }
  }
  function makeDefault(id: string) {
    setDefaultFeeInvoiceTemplate(id);
  }

  // 기본 첨부 파일 — 이 카테고리로 발송할 때(app/fees/page.tsx의 DispatchModal) 항상 자동으로
  // 붙는 파일이다. 편집 중(draft) 여부와 무관하게 바로바로 저장되는 별도 항목이라, letter 내용의
  // isEditing/draft/저장 흐름과 분리해서 각 조작마다 즉시 store에 반영한다.
  function addDefaultAttachment() {
    if (!selected) return;
    const next = [...(selected.defaultAttachments ?? []), { id: genAttachmentId(), name: "" }];
    updateFeeInvoiceTemplate(selected.id, { defaultAttachments: next });
  }
  function renameDefaultAttachment(attId: string, name: string) {
    if (!selected) return;
    const next = (selected.defaultAttachments ?? []).map((a) => (a.id === attId ? { ...a, name } : a));
    updateFeeInvoiceTemplate(selected.id, { defaultAttachments: next });
  }
  function removeDefaultAttachment(attId: string) {
    if (!selected) return;
    const next = (selected.defaultAttachments ?? []).filter((a) => a.id !== attId);
    updateFeeInvoiceTemplate(selected.id, { defaultAttachments: next });
  }
  async function handleDefaultAttachmentFile(attId: string, files: FileList | null) {
    if (!selected) return;
    const file = files?.[0];
    if (!file) return;
    const fileDataUrl = await fileToDataUrl(file);
    const next = (selected.defaultAttachments ?? []).map((a) => (a.id === attId ? { ...a, fileDataUrl } : a));
    updateFeeInvoiceTemplate(selected.id, { defaultAttachments: next });
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
    const current = a.enabledByCategory?.[activeCategory] ?? true;
    updateStandardAttachment(a.id, { enabledByCategory: { ...(a.enabledByCategory ?? {}), [activeCategory]: !current } });
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
          유형(연차상시/위탁정산/역발행/기타)별로 수수료 청구서 양식을 등록·관리합니다. &quot;대표양식&quot;으로 지정한 템플릿이 실제 발송(수수료 청구 관리 → 공문발송) 시 자동으로 적용됩니다.
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
              {(selected.defaultAttachments ?? []).length === 0 ? (
                <p className="text-xs text-slate-400 py-1">등록된 기본 첨부 파일이 없습니다.</p>
              ) : (
                <div className="space-y-1.5">
                  {(selected.defaultAttachments ?? []).map((a) => (
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

            <div className="p-8">
              <FeeInvoiceLetterPreview
                template={isEditing ? draft : selected.content}
                status={SAMPLE_STATUS}
                feeAmounts={SAMPLE_FEE_AMOUNTS}
                docNumber="삼화 2026-#### (자동 채번)"
                previewMode
                editable={isEditing}
                onFieldChange={setField}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
