"use client";

import { useState } from "react";
import { FiCheckCircle, FiEdit2, FiFileText, FiPlus, FiTrash2 } from "react-icons/fi";
import {
  useStore,
  addFeeInvoiceTemplate,
  updateFeeInvoiceTemplate,
  deleteFeeInvoiceTemplate,
  setDefaultFeeInvoiceTemplate,
} from "@/lib/store";
import { EMPTY_FEE_INVOICE_TEMPLATE, type FeeInvoiceTemplate, type FeeInvoiceTemplateEntry } from "@/lib/mock";
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
  const { feeInvoiceTemplates } = useStore();
  const [activeCategory, setActiveCategory] = useState<FeeInvoiceTemplateEntry["category"]>("ANNUAL");
  const categoryTemplates = feeInvoiceTemplates.filter((t) => t.category === activeCategory);

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
