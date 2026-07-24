"use client";

import { useState } from "react";
import { FiEdit2, FiFileText, FiPlus, FiTrash2 } from "react-icons/fi";
import { useStore, addAgencyNoticeTemplate, updateAgencyNoticeTemplate, deleteAgencyNoticeTemplate } from "@/lib/store";
import { EMPTY_NOTICE_TEMPLATE, type AgencyNoticeTemplate, type AgencyNoticeTemplateEntry } from "@/lib/mock";
import { useCanWrite } from "@/lib/permissions";
import NoticeLetterPreview, { type NoticeStatusRow } from "@/components/common/NoticeLetterPreview";
import Modal from "@/components/common/Modal";

// 과제현황 표 — 실제 발송 시 선택한 과제 데이터로 자동 치환되는 영역.
// 템플릿에는 포함되지 않으므로 편집 불가하며, 예시 값으로 미리보기만 제공한다.
const SAMPLE_PROJECT_STATUS: NoticeStatusRow[] = [
  { label: "과제번호 (RCMS)", value: "00269575" },
  { label: "과제명", value: "리튬이차전지용 NMP 용매 대체 저유해성 코팅 소재 및 에너지 저감형 고용량 양극 공정기술 개발" },
  { label: "단계연구개발기간", value: "2023 년 07 월 01 일 ~ 2026 년 12 월 31 일" },
  { label: "대상기간", value: "2023 년 07 월 01 일 ~ 2026 년 12 월 31 일" },
  { label: "정산구분", value: "정산" },
  { label: "주관연구개발기관", value: "한솔케미칼전주공장" },
  { label: "연구책임자", value: "권세만" },
  { label: "공동연구개발기관수", value: "3개" },
];

const inputCls = "w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400";

// ─── 템플릿 선택 모달 ─────────────────────────────────────────
function TemplatePickerModal({
  templates,
  selectedId,
  onSelect,
  onDelete,
  onClose,
}: {
  templates: AgencyNoticeTemplateEntry[];
  selectedId: string;
  onSelect: (id: string) => void;
  onDelete?: (id: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = templates.filter((t) =>
    t.name.toLowerCase().includes(query.trim().toLowerCase())
  );

  return (
    <div className="flex flex-col max-h-[70vh]">
      <div className="px-6 py-4 border-b border-slate-100 shrink-0">
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="템플릿명으로 검색..."
          className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
        />
      </div>
      <div className="overflow-y-auto flex-1">
        {filtered.length === 0 ? (
          <div className="px-6 py-10 text-center text-sm text-slate-400">일치하는 템플릿이 없습니다</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="text-left px-5 py-2.5 text-xs font-medium text-slate-500 whitespace-nowrap">템플릿명</th>
                <th className="text-left px-5 py-2.5 text-xs font-medium text-slate-500">문서 제목</th>
                <th className="text-center px-5 py-2.5 text-xs font-medium text-slate-500 whitespace-nowrap w-20">첨부파일</th>
                <th className="px-5 py-2.5 w-32" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((t) => {
                const isSelected = t.id === selectedId;
                return (
                  <tr key={t.id} className={`border-b border-slate-50 hover:bg-slate-50 ${isSelected ? "bg-blue-50/50" : ""}`}>
                    <td className="px-5 py-3 font-medium text-slate-700">{t.name}</td>
                    <td className="px-5 py-3 text-slate-500 truncate max-w-xs">{t.content.title || "—"}</td>
                    <td className="px-5 py-3 text-center text-slate-500">{t.content.attachments.length}개</td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {onDelete && (
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
        )}
      </div>
    </div>
  );
}

export default function NoticeTemplatesPage() {
  const canEdit = useCanWrite("notice-templates");
  const { fundingAgencies, agencyNoticeTemplates } = useStore();
  const [activeAgency, setActiveAgency] = useState(fundingAgencies[0]?.shortName ?? "");
  const agencyTemplates = agencyNoticeTemplates.filter((t) => t.agencyShortName === activeAgency);

  const [selectedId, setSelectedId] = useState(agencyTemplates[0]?.id ?? "");
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<AgencyNoticeTemplate>(EMPTY_NOTICE_TEMPLATE);
  const [draftName, setDraftName] = useState("");
  const [showNewForm, setShowNewForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);

  const agency = fundingAgencies.find((a) => a.shortName === activeAgency);
  const selected = agencyTemplates.find((t) => t.id === selectedId) ?? agencyTemplates[0];

  function selectAgency(shortName: string) {
    setActiveAgency(shortName);
    const first = agencyNoticeTemplates.find((t) => t.agencyShortName === shortName);
    setSelectedId(first?.id ?? "");
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
    updateAgencyNoticeTemplate(selected.id, { name: draftName.trim() || selected.name, content: draft });
    setIsEditing(false);
  }
  function setField<K extends keyof AgencyNoticeTemplate>(key: K, value: AgencyNoticeTemplate[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }
  function createTemplate() {
    if (!newName.trim() || !activeAgency) return;
    const item = addAgencyNoticeTemplate(activeAgency, newName.trim(), EMPTY_NOTICE_TEMPLATE);
    setSelectedId(item.id);
    setNewName("");
    setShowNewForm(false);
    setDraft(JSON.parse(JSON.stringify(EMPTY_NOTICE_TEMPLATE)));
    setDraftName(item.name);
    setIsEditing(true);
  }
  function removeTemplate(id: string) {
    if (!window.confirm("이 템플릿을 삭제할까요?")) return;
    deleteAgencyNoticeTemplate(id);
    if (selectedId === id) {
      const remaining = agencyTemplates.filter((t) => t.id !== id);
      setSelectedId(remaining[0]?.id ?? "");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">전담기관별 정산절차 안내 공문 템플릿을 등록 · 선택 · 관리합니다</p>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {fundingAgencies.map((a) => (
          <button
            key={a.id}
            onClick={() => selectAgency(a.shortName)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
              activeAgency === a.shortName
                ? "bg-blue-600 text-white border-blue-600"
                : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
            }`}
          >
            {a.shortName}
          </button>
        ))}
      </div>

      {!agency ? (
        <div className="bg-white rounded-xl border border-slate-200 p-10 text-center text-sm text-slate-400">
          전담기관을 먼저 등록해주세요. (전담기관 관리 메뉴)
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          {/* 템플릿 불러오기 · 등록 */}
          <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100 bg-slate-50">
            <label className="text-xs font-medium text-slate-600 shrink-0">템플릿 불러오기</label>
            <div className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 truncate">
              {selected ? selected.name : "등록된 템플릿이 없습니다"}
            </div>
            <button
              type="button"
              onClick={() => setShowTemplatePicker(true)}
              disabled={agencyTemplates.length === 0}
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
                templates={agencyTemplates}
                selectedId={selectedId}
                onSelect={selectTemplate}
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
                    placeholder="예: 정산절차 안내 공문 (신규)"
                    onKeyDown={(e) => { if (e.key === "Enter") createTemplate(); }}
                    className="w-full text-base border border-slate-200 rounded-lg px-4 py-3 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
                  />
                  <p className="text-xs text-slate-400 mt-2">
                    템플릿 목록에서 표시되는 이름입니다. 등록 후 상세 내용을 바로 편집할 수 있습니다.
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
                  <span className="text-xs text-slate-400 shrink-0">· {agency.name} ({agency.shortName})</span>
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
                      <button
                        onClick={startEdit}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 rounded-lg transition-colors"
                      >
                        <FiEdit2 size={12} /> 편집
                      </button>
                    )
                  )}
                </div>
              </div>

              <div className="p-8">
                <NoticeLetterPreview
                  template={isEditing ? draft : selected.content}
                  statusRows={SAMPLE_PROJECT_STATUS}
                  docNumber="삼화 2026-#### (자동 채번)"
                  previewMode
                  editable={isEditing}
                  onFieldChange={setField}
                />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
