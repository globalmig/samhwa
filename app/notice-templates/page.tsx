"use client";

import { useState } from "react";
import { FiEdit2, FiFileText, FiPlus, FiTrash2, FiX } from "react-icons/fi";
import { useStore, addAgencyNoticeTemplate, updateAgencyNoticeTemplate, deleteAgencyNoticeTemplate } from "@/lib/store";
import { EMPTY_NOTICE_TEMPLATE, type AgencyNoticeTemplate } from "@/lib/mock";
import { useCanWrite } from "@/lib/permissions";
import NoticeLetterPreview, { type NoticeStatusRow } from "@/components/common/NoticeLetterPreview";

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
const textareaCls = `${inputCls} resize-none`;

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
      {children}
    </div>
  );
}

function ListEditor({
  label,
  items,
  onChange,
}: {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-semibold text-slate-600">{label}</p>
      {items.map((item, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            className={inputCls}
            value={item}
            onChange={(e) => onChange(items.map((it, j) => (j === i ? e.target.value : it)))}
          />
          <button
            onClick={() => onChange(items.filter((_, j) => j !== i))}
            className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors shrink-0"
          >
            <FiTrash2 size={14} />
          </button>
        </div>
      ))}
      <button onClick={() => onChange([...items, ""])} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700">
        <FiPlus size={12} /> 항목 추가
      </button>
    </div>
  );
}

// ─── 편집 폼 (구조화된 필드 단위 입력) ───────────────────────
function TemplateEditForm({
  name,
  setName,
  draft,
  setField,
}: {
  name: string;
  setName: (v: string) => void;
  draft: AgencyNoticeTemplate;
  setField: <K extends keyof AgencyNoticeTemplate>(key: K, value: AgencyNoticeTemplate[K]) => void;
}) {
  function setScheduleCell(i: number, key: "category" | "institutionTask" | "firmTask", value: string) {
    setField("scheduleRows", draft.scheduleRows.map((r, j) => (j === i ? { ...r, [key]: value } : r)));
  }
  function addScheduleRow() {
    setField("scheduleRows", [...draft.scheduleRows, { category: "", institutionTask: "", firmTask: "" }]);
  }
  function removeScheduleRow(i: number) {
    setField("scheduleRows", draft.scheduleRows.filter((_, j) => j !== i));
  }
  function setContactCell(i: number, key: "role" | "contact" | "email", value: string) {
    setField("contactRows", draft.contactRows.map((r, j) => (j === i ? { ...r, [key]: value } : r)));
  }
  function addContactRow() {
    setField("contactRows", [...draft.contactRows, { role: "", contact: "", email: "" }]);
  }
  function removeContactRow(i: number) {
    setField("contactRows", draft.contactRows.filter((_, j) => j !== i));
  }

  return (
    <div className="p-6 space-y-6 bg-amber-50/20">
      <div className="space-y-3">
        <Field label="템플릿 이름 (목록에서 선택할 때 표시됩니다)">
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="제목">
          <input className={inputCls} value={draft.title} onChange={(e) => setField("title", e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="수신">
            <input className={inputCls} value={draft.recipient} onChange={(e) => setField("recipient", e.target.value)} />
          </Field>
          <Field label="참조">
            <input className={inputCls} value={draft.reference} onChange={(e) => setField("reference", e.target.value)} />
          </Field>
        </div>
        <Field label="관련근거">
          <input className={inputCls} value={draft.legalBasis} onChange={(e) => setField("legalBasis", e.target.value)} />
        </Field>
      </div>

      <ListEditor label="본문 안내 문구 (항목 하나를 '관련근거' 로 두면 위 관련근거 값이 그 아래 표시됩니다)" items={draft.bodyIntro} onChange={(items) => setField("bodyIntro", items)} />

      <div className="space-y-2">
        <p className="text-xs font-semibold text-slate-600">업무수행 시기</p>
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600 w-28">업무구분</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600">연구기관</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600">회계법인</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {draft.scheduleRows.map((row, i) => (
                <tr key={i} className="border-b border-slate-50 last:border-0">
                  <td className="px-2 py-2">
                    <input className={inputCls} value={row.category} onChange={(e) => setScheduleCell(i, "category", e.target.value)} />
                  </td>
                  <td className="px-2 py-2">
                    <textarea rows={2} className={textareaCls} value={row.institutionTask} onChange={(e) => setScheduleCell(i, "institutionTask", e.target.value)} />
                  </td>
                  <td className="px-2 py-2">
                    <textarea rows={2} className={textareaCls} value={row.firmTask} onChange={(e) => setScheduleCell(i, "firmTask", e.target.value)} />
                  </td>
                  <td className="px-2 py-2 text-center">
                    <button onClick={() => removeScheduleRow(i)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors">
                      <FiTrash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button onClick={addScheduleRow} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700">
          <FiPlus size={12} /> 행 추가
        </button>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold text-slate-600">문의사항 연락처</p>
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600">담당자</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600 w-40">연락처</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-slate-600">이메일</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {draft.contactRows.map((row, i) => (
                <tr key={i} className="border-b border-slate-50 last:border-0">
                  <td className="px-2 py-2">
                    <input className={inputCls} value={row.role} onChange={(e) => setContactCell(i, "role", e.target.value)} />
                  </td>
                  <td className="px-2 py-2">
                    <input className={inputCls} value={row.contact} onChange={(e) => setContactCell(i, "contact", e.target.value)} />
                  </td>
                  <td className="px-2 py-2">
                    <input className={inputCls} value={row.email} onChange={(e) => setContactCell(i, "email", e.target.value)} />
                  </td>
                  <td className="px-2 py-2 text-center">
                    <button onClick={() => removeContactRow(i)} className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors">
                      <FiTrash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button onClick={addContactRow} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700">
          <FiPlus size={12} /> 행 추가
        </button>
      </div>

      <div className="space-y-3">
        <p className="text-xs font-semibold text-slate-600">수수료 안내</p>
        <Field label="안내 제목">
          <input className={inputCls} value={draft.feeIntro} onChange={(e) => setField("feeIntro", e.target.value)} />
        </Field>
        <ListEditor label="필요서류" items={draft.feeRequiredDocs} onChange={(items) => setField("feeRequiredDocs", items)} />
        <ListEditor label="세부 안내" items={draft.feeNotes} onChange={(items) => setField("feeNotes", items)} />
      </div>

      <ListEditor label="붙임 파일 목록" items={draft.attachments} onChange={(items) => setField("attachments", items)} />
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
          {/* 템플릿 선택 · 등록 */}
          <div className="flex items-center gap-2 flex-wrap px-5 py-3 border-b border-slate-100 bg-slate-50">
            {agencyTemplates.map((t) => (
              <div
                key={t.id}
                className={`flex items-center gap-1 pl-3 pr-1.5 py-1 rounded-full border text-xs font-medium transition-colors ${
                  selectedId === t.id
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-100"
                }`}
              >
                <button onClick={() => selectTemplate(t.id)}>{t.name}</button>
                {canEdit && (
                  <button
                    onClick={() => removeTemplate(t.id)}
                    title="템플릿 삭제"
                    className={`rounded-full p-0.5 transition-colors ${selectedId === t.id ? "text-blue-100 hover:text-white hover:bg-blue-700" : "text-slate-300 hover:text-red-500 hover:bg-red-50"}`}
                  >
                    <FiX size={11} />
                  </button>
                )}
              </div>
            ))}
            {canEdit &&
              (showNewForm ? (
                <div className="flex items-center gap-1.5">
                  <input
                    autoFocus
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="템플릿 이름"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") createTemplate();
                      if (e.key === "Escape") setShowNewForm(false);
                    }}
                    className="text-xs border border-slate-200 rounded-full px-3 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                  />
                  <button onClick={createTemplate} className="text-xs font-medium text-blue-600 hover:text-blue-700">추가</button>
                  <button onClick={() => setShowNewForm(false)} className="text-xs text-slate-400 hover:text-slate-600">취소</button>
                </div>
              ) : (
                <button
                  onClick={() => setShowNewForm(true)}
                  className="flex items-center gap-1 text-xs font-medium text-blue-600 border border-dashed border-blue-300 rounded-full px-3 py-1 hover:bg-blue-50 transition-colors"
                >
                  <FiPlus size={11} /> 새 템플릿 등록
                </button>
              ))}
          </div>

          {!selected ? (
            <div className="p-10 text-center text-sm text-slate-400">
              등록된 템플릿이 없습니다. 위 &quot;새 템플릿 등록&quot; 버튼으로 추가해주세요.
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50">
                <div className="flex items-center gap-2">
                  <FiFileText className="text-slate-400" size={14} />
                  <p className="text-sm font-semibold text-slate-800">{selected.name}</p>
                  <span className="text-xs text-slate-400">· {agency.name} ({agency.shortName})</span>
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

              {isEditing ? (
                <TemplateEditForm name={draftName} setName={setDraftName} draft={draft} setField={setField} />
              ) : (
                <div className="p-8">
                  <NoticeLetterPreview
                    template={selected.content}
                    statusRows={SAMPLE_PROJECT_STATUS}
                    docNumber="삼화 2026-#### (자동 채번)"
                    previewMode
                  />
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
