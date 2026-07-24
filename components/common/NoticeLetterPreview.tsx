import Image from "next/image";
import type { ReactNode } from "react";
import { FiPlus, FiX } from "react-icons/fi";
import { COMPANY_INFO, type AgencyNoticeTemplate } from "@/lib/mock";

export interface NoticeStatusRow {
  label: string;
  value: string;
}

// 라벨 글자 사이를 벌려 공문 특유의 자간(예: "문 서 번 호") 표기를 흉내낸다.
function spaced(label: string) {
  return label.split("").join(" ");
}

// "과제번호 (RCMS)" 같은 괄호 부기는 붙여두고 한글 라벨만 자간을 벌린다.
function spacedLabel(label: string) {
  const match = label.match(/^(.*?)\s*(\(.+\))$/);
  if (match) return `${spaced(match[1])} ${match[2]}`;
  return spaced(label);
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─── 편집 모드 전용 인라인 위젯 ────────────────────────────────
// 공문 디자인 위에서 바로 값을 고칠 수 있도록, 어느 자리가 수정 가능한지 항상 옅은 테두리로
// 드러내고, 포커스 시에는 파란 테두리로 활성 상태를 보여주는 인라인 input/textarea.
const editableCls =
  "w-full bg-white border border-slate-200 rounded-md px-2 py-1 focus:outline-none " +
  "focus:ring-1 focus:ring-blue-400 focus:border-blue-400 hover:border-slate-300 transition-colors";

function InlineInput({
  value,
  onChange,
  className = "",
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`${editableCls} ${className}`}
    />
  );
}

function InlineTextarea({
  value,
  onChange,
  className = "",
  rows = 2,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      className={`${editableCls} resize-none ${className}`}
    />
  );
}

function RemoveDot({ onClick, title = "삭제" }: { onClick: () => void; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="shrink-0 p-1 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
    >
      <FiX size={12} />
    </button>
  );
}

function AddRow({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 mt-2"
    >
      <FiPlus size={11} /> {label}
    </button>
  );
}

function MetaRow({ label, dynamic, children }: { label: string; dynamic?: boolean; children: ReactNode }) {
  return (
    <div className={`flex border-b border-slate-200 ${dynamic ? "bg-slate-100" : ""}`}>
      <div className="w-36 shrink-0 px-3 py-2.5 text-sm font-semibold text-slate-600 whitespace-nowrap">{label}</div>
      <div className="w-4 shrink-0 text-center text-slate-400">:</div>
      <div className="flex-1 px-3 py-2.5 text-slate-800 flex items-center justify-between gap-2">{children}</div>
    </div>
  );
}

type FieldSetter = <K extends keyof AgencyNoticeTemplate>(key: K, value: AgencyNoticeTemplate[K]) => void;

// 전담기관 공문 템플릿 + (선택적) 과제현황 데이터를 실제 삼화회계법인 공문 양식과
// 최대한 동일한 순서 · 표기로 렌더링한다.
// docNumber/issuedDate가 없으면 발송 전 미리보기이므로 자동 채번 안내 문구를 대신 보여준다.
// editable=true면 읽기 전용 텍스트 대신 동일한 자리에 인라인 입력을 렌더링해, 실제 발송되는
// 공문과 똑같은 모양을 보면서 그 자리에서 바로 값을 고칠 수 있다.
export default function NoticeLetterPreview({
  template,
  statusRows,
  docNumber,
  issuedDate,
  previewMode = false,
  editable = false,
  onFieldChange,
}: {
  template: AgencyNoticeTemplate;
  statusRows?: NoticeStatusRow[];
  docNumber?: string;
  issuedDate?: string;
  // true면 아직 실제 값으로 채워지지 않은, 과제별로 자동 치환될 영역을 회색으로 표시하고 안내 문구를 덧붙인다.
  // 템플릿 관리 화면(과제 미지정)에서만 켜고, 실제 발송 모달(값이 이미 채워진 상태)에서는 꺼서 쓴다.
  previewMode?: boolean;
  editable?: boolean;
  onFieldChange?: FieldSetter;
}) {
  function setField<K extends keyof AgencyNoticeTemplate>(key: K, value: AgencyNoticeTemplate[K]) {
    onFieldChange?.(key, value);
  }

  return (
    <div className="text-base text-slate-800 bg-white">
      {/* 레터헤드 */}
      <div className="pb-3 border-b-4 border-double border-slate-800">
        <h1 className="text-3xl font-extrabold tracking-[0.3em] text-slate-900">{spaced(COMPANY_INFO.name)}</h1>
      </div>
      <p className="text-sm text-slate-500 py-2 border-b border-slate-200">
        {COMPANY_INFO.addressLine} Tel : {COMPANY_INFO.tel} Fax : {COMPANY_INFO.fax} 담당 : {COMPANY_INFO.preparedBy}
      </p>

      {/* 문서 메타 */}
      <div className="mt-4 border-t-2 border-slate-700">
        <MetaRow label="문 서 번 호" dynamic={previewMode}>
          <span>{docNumber || `${COMPANY_INFO.docNumberPrefix} · 발송 시 자동 채번`}</span>
          {previewMode && <span className="text-xs text-slate-400 shrink-0">데이터에 따라 변경될 예정</span>}
        </MetaRow>
        <MetaRow label="시 행 일 자" dynamic={previewMode}>
          <span>{issuedDate || "발송일 기준 자동 입력"}</span>
          {previewMode && <span className="text-xs text-slate-400 shrink-0">데이터에 따라 변경될 예정</span>}
        </MetaRow>
        <MetaRow label="수 신">
          {editable ? (
            <InlineInput value={template.recipient} onChange={(v) => setField("recipient", v)} />
          ) : (
            <span>{template.recipient || "—"}</span>
          )}
        </MetaRow>
        <MetaRow label="참 조">
          {editable ? (
            <InlineInput value={template.reference} onChange={(v) => setField("reference", v)} />
          ) : (
            <span>{template.reference || "—"}</span>
          )}
        </MetaRow>
        <MetaRow label="제 목">
          {editable ? (
            <InlineInput value={template.title} onChange={(v) => setField("title", v)} className="font-medium" />
          ) : (
            <span>{template.title || "—"}</span>
          )}
        </MetaRow>
      </div>

      {/* 본문 안내 문구 */}
      <ol className="mt-5 space-y-2.5 list-decimal list-outside pl-5 marker:text-slate-500">
        {template.bodyIntro.map((line, i) => (
          <li key={i}>
            {editable ? (
              <div className="flex items-start gap-1.5">
                <InlineInput
                  value={line}
                  onChange={(v) => setField("bodyIntro", template.bodyIntro.map((l, j) => (j === i ? v : l)))}
                  className="flex-1"
                />
                <RemoveDot onClick={() => setField("bodyIntro", template.bodyIntro.filter((_, j) => j !== i))} />
              </div>
            ) : (
              line
            )}
            {line === "관련근거" &&
              (editable ? (
                <div className="pl-4 mt-0.5 flex items-center gap-1.5 text-slate-600">
                  <span className="shrink-0">:</span>
                  <InlineInput value={template.legalBasis} onChange={(v) => setField("legalBasis", v)} className="flex-1" />
                </div>
              ) : (
                template.legalBasis && <p className="pl-4 mt-0.5 text-slate-600">: {template.legalBasis}</p>
              ))}
          </li>
        ))}
      </ol>
      {editable && (
        <AddRow onClick={() => setField("bodyIntro", [...template.bodyIntro, ""])} label="문구 추가" />
      )}

      <p className="text-center text-lg font-bold tracking-[0.5em] my-5">- 다 음 -</p>

      {/* 과제현황 — 과제별로 자동 치환되는 영역 (템플릿 값이 아니므로 항상 읽기 전용) */}
      {statusRows && statusRows.length > 0 && (
        <div className="mb-5">
          <div className="flex items-center justify-between mb-1.5">
            <p className="font-bold">■ 과제현황</p>
            {previewMode && <span className="text-xs text-slate-400">데이터에 따라 변경될 예정</span>}
          </div>
          <div className={`border border-slate-400 ${previewMode ? "bg-slate-100" : ""}`}>
            {statusRows.map((row, i) => (
              <div key={row.label} className={`flex ${i > 0 ? "border-t border-dashed border-slate-400" : ""}`}>
                <div className={`w-48 shrink-0 px-2 py-3 text-sm font-medium text-slate-700 border-r border-dashed border-slate-400 ${previewMode ? "" : "bg-slate-50"}`}>
                  <span className="block" style={{ textAlign: "justify", textAlignLast: "justify" }}>
                    {spacedLabel(row.label)}
                  </span>
                </div>
                <div className="flex-1 px-3 py-3 text-slate-800 text-center flex items-center justify-center">{row.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 업무수행 시기 */}
      <div className="mb-5">
        <p className="font-bold mb-1.5">■ 업무수행 시기</p>
        <div className="overflow-x-auto border border-slate-400">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-400">
                <th className="px-3 py-2.5 text-sm font-semibold text-slate-700 border-r border-slate-300 w-28">업무구분</th>
                <th className="px-3 py-2.5 text-sm font-semibold text-slate-700 border-r border-slate-300">연구기관</th>
                <th className="px-3 py-2.5 text-sm font-semibold text-slate-700">회계법인</th>
                {editable && <th className="w-8 border-l border-slate-300" />}
              </tr>
            </thead>
            <tbody>
              {template.scheduleRows.map((row, i) => (
                <tr key={i} className={i > 0 ? "border-t border-slate-300" : ""}>
                  {editable ? (
                    <>
                      <td className="px-2 py-2 text-center align-middle border-r border-slate-300">
                        <InlineInput
                          value={row.category}
                          onChange={(v) =>
                            setField("scheduleRows", template.scheduleRows.map((r, j) => (j === i ? { ...r, category: v } : r)))
                          }
                          className="text-center font-medium"
                        />
                      </td>
                      <td className="px-2 py-2 align-middle border-r border-slate-300">
                        <InlineTextarea
                          value={row.institutionTask}
                          onChange={(v) =>
                            setField("scheduleRows", template.scheduleRows.map((r, j) => (j === i ? { ...r, institutionTask: v } : r)))
                          }
                          className="text-center"
                        />
                      </td>
                      <td className="px-2 py-2 align-middle border-r border-slate-300">
                        <InlineTextarea
                          value={row.firmTask}
                          onChange={(v) =>
                            setField("scheduleRows", template.scheduleRows.map((r, j) => (j === i ? { ...r, firmTask: v } : r)))
                          }
                          className="text-center"
                        />
                      </td>
                      <td className="px-1 py-2 text-center align-middle">
                        <RemoveDot onClick={() => setField("scheduleRows", template.scheduleRows.filter((_, j) => j !== i))} />
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-3 py-2.5 text-center font-medium whitespace-nowrap align-middle border-r border-slate-300">{row.category}</td>
                      <td className="px-3 py-2.5 text-center whitespace-pre-line align-middle border-r border-slate-300">{row.institutionTask}</td>
                      <td className="px-3 py-2.5 text-center whitespace-pre-line align-middle">{row.firmTask}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {editable && (
          <AddRow
            onClick={() => setField("scheduleRows", [...template.scheduleRows, { category: "", institutionTask: "", firmTask: "" }])}
            label="행 추가"
          />
        )}
      </div>

      {/* 문의사항 연락처 */}
      <div className="mb-5">
        <p className="font-bold mb-1.5">■ 문의사항 연락처</p>
        <div className="overflow-x-auto border border-slate-400">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-400">
                <th className="px-3 py-2.5 text-sm font-semibold text-slate-700 border-r border-slate-300">담당자</th>
                <th className="px-3 py-2.5 text-sm font-semibold text-slate-700 border-r border-slate-300 w-40">연락처</th>
                <th className="px-3 py-2.5 text-sm font-semibold text-slate-700">이메일</th>
                {editable && <th className="w-8 border-l border-slate-300" />}
              </tr>
            </thead>
            <tbody>
              {template.contactRows.map((row, i) => (
                <tr key={i} className={i > 0 ? "border-t border-slate-300" : ""}>
                  {editable ? (
                    <>
                      <td className="px-2 py-2 text-center border-r border-slate-300">
                        <InlineInput
                          value={row.role}
                          onChange={(v) =>
                            setField("contactRows", template.contactRows.map((r, j) => (j === i ? { ...r, role: v } : r)))
                          }
                          className="text-center font-medium"
                        />
                      </td>
                      <td className="px-2 py-2 text-center border-r border-slate-300">
                        <InlineInput
                          value={row.contact}
                          onChange={(v) =>
                            setField("contactRows", template.contactRows.map((r, j) => (j === i ? { ...r, contact: v } : r)))
                          }
                          className="text-center"
                        />
                      </td>
                      <td className="px-2 py-2 text-center">
                        <InlineInput
                          value={row.email}
                          onChange={(v) =>
                            setField("contactRows", template.contactRows.map((r, j) => (j === i ? { ...r, email: v } : r)))
                          }
                          className="text-center text-blue-700"
                        />
                      </td>
                      <td className="px-1 py-2 text-center">
                        <RemoveDot onClick={() => setField("contactRows", template.contactRows.filter((_, j) => j !== i))} />
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-3 py-2.5 text-center font-medium whitespace-nowrap border-r border-slate-300">{row.role}</td>
                      <td className="px-3 py-2.5 text-center whitespace-nowrap border-r border-slate-300">{row.contact}</td>
                      <td className="px-3 py-2.5 text-center text-blue-700">{row.email}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {editable && (
          <AddRow
            onClick={() => setField("contactRows", [...template.contactRows, { role: "", contact: "", email: "" }])}
            label="행 추가"
          />
        )}
      </div>

      {/* 수수료 안내 */}
      <div className="mb-5">
        <p className="font-bold mb-1.5">■ 수수료</p>
        <div className="bg-slate-100 px-3 py-3 space-y-2">
          {editable ? (
            <InlineInput value={template.feeIntro} onChange={(v) => setField("feeIntro", v)} className="font-medium" />
          ) : (
            <p className="font-medium">{template.feeIntro}</p>
          )}
          <ol className="space-y-1 text-blue-700">
            {template.feeRequiredDocs.map((d, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <span className="shrink-0">({i + 1})</span>
                {editable ? (
                  <>
                    <InlineInput
                      value={d}
                      onChange={(v) => setField("feeRequiredDocs", template.feeRequiredDocs.map((it, j) => (j === i ? v : it)))}
                      className="flex-1"
                    />
                    <RemoveDot onClick={() => setField("feeRequiredDocs", template.feeRequiredDocs.filter((_, j) => j !== i))} />
                  </>
                ) : (
                  <span>{d}</span>
                )}
              </li>
            ))}
          </ol>
          {editable && (
            <AddRow onClick={() => setField("feeRequiredDocs", [...template.feeRequiredDocs, ""])} label="필요서류 추가" />
          )}
        </div>
        <div className="mt-2 space-y-1 text-slate-700">
          {template.feeNotes.map((n, i) => (
            <div key={i} className={`flex items-start gap-1.5 ${i === 0 ? "" : "pl-3"}`}>
              {i > 0 && <span className="shrink-0">-</span>}
              {editable ? (
                <>
                  <InlineInput
                    value={n}
                    onChange={(v) => setField("feeNotes", template.feeNotes.map((it, j) => (j === i ? v : it)))}
                    className="flex-1"
                  />
                  <RemoveDot onClick={() => setField("feeNotes", template.feeNotes.filter((_, j) => j !== i))} />
                </>
              ) : (
                <p>{n}</p>
              )}
            </div>
          ))}
          {editable && <AddRow onClick={() => setField("feeNotes", [...template.feeNotes, ""])} label="안내 문구 추가" />}
        </div>
      </div>

      {/* 붙임 */}
      <div className="mb-6">
        <p className="font-semibold mb-1">[붙임]</p>
        <div className="space-y-1 text-slate-800">
          {template.attachments.map((f, i) => (
            <div key={i} className="flex items-start gap-1.5">
              <span className="shrink-0">붙임 {i + 1}.</span>
              {editable ? (
                <>
                  <InlineInput
                    value={f.name}
                    onChange={(v) =>
                      setField("attachments", template.attachments.map((it, j) => (j === i ? { ...it, name: v } : it)))
                    }
                    className="flex-1"
                  />
                  <label
                    className={`shrink-0 text-xs font-medium rounded px-2 py-1 cursor-pointer whitespace-nowrap transition-colors ${
                      f.dataUrl ? "text-emerald-700 bg-emerald-50 hover:bg-emerald-100" : "text-blue-600 border border-blue-200 hover:bg-blue-50"
                    }`}
                  >
                    {f.dataUrl ? "파일 등록됨" : "파일 선택"}
                    <input
                      type="file"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (!file) return;
                        const dataUrl = await fileToDataUrl(file);
                        setField(
                          "attachments",
                          template.attachments.map((it, j) => (j === i ? { ...it, dataUrl } : it))
                        );
                      }}
                    />
                  </label>
                  <RemoveDot onClick={() => setField("attachments", template.attachments.filter((_, j) => j !== i))} />
                </>
              ) : (
                <p>{f.name}</p>
              )}
            </div>
          ))}
        </div>
        {editable && (
          <AddRow onClick={() => setField("attachments", [...template.attachments, { name: "" }])} label="붙임 파일 추가" />
        )}
        <p className="text-center mt-4">&quot;끝.&quot;</p>
      </div>

      {/* 발신 서명 */}
      <div className="pt-6 border-t border-dashed border-slate-300 flex justify-end">
        <div className="flex flex-col items-end gap-2">
          <p className="text-xl font-bold tracking-widest">{spaced(COMPANY_INFO.name)}</p>
          <div className="flex items-center gap-3">
            <div className="relative w-16 h-16 shrink-0">
              <Image src="/CEO_stamp.png" alt="대표이사 인" fill sizes="64px" className="object-contain" />
            </div>
            <p className="text-xl font-bold">대표이사 {COMPANY_INFO.ceoName}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
