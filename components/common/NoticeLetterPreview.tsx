import Image from "next/image";
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

// 전담기관 공문 템플릿 + (선택적) 과제현황 데이터를 실제 삼화회계법인 공문 양식과
// 최대한 동일한 순서 · 표기로 읽기 전용 렌더링한다.
// docNumber/issuedDate가 없으면 발송 전 미리보기이므로 자동 채번 안내 문구를 대신 보여준다.
export default function NoticeLetterPreview({
  template,
  statusRows,
  docNumber,
  issuedDate,
  previewMode = false,
}: {
  template: AgencyNoticeTemplate;
  statusRows?: NoticeStatusRow[];
  docNumber?: string;
  issuedDate?: string;
  // true면 아직 실제 값으로 채워지지 않은, 과제별로 자동 치환될 영역을 회색으로 표시하고 안내 문구를 덧붙인다.
  // 템플릿 관리 화면(과제 미지정)에서만 켜고, 실제 발송 모달(값이 이미 채워진 상태)에서는 꺼서 쓴다.
  previewMode?: boolean;
}) {
  const metaRows: { label: string; value: string; dynamic?: boolean }[] = [
    { label: "문 서 번 호", value: docNumber || `${COMPANY_INFO.docNumberPrefix} · 발송 시 자동 채번`, dynamic: true },
    { label: "시 행 일 자", value: issuedDate || "발송일 기준 자동 입력", dynamic: true },
    { label: "수 신", value: template.recipient || "—" },
    { label: "참 조", value: template.reference || "—" },
    { label: "제 목", value: template.title || "—" },
  ];

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
        {metaRows.map((row) => {
          const isDynamic = previewMode && row.dynamic;
          return (
            <div key={row.label} className={`flex border-b border-slate-200 ${isDynamic ? "bg-slate-100" : ""}`}>
              <div className="w-36 shrink-0 px-3 py-2.5 text-sm font-semibold text-slate-600 whitespace-nowrap">{row.label}</div>
              <div className="w-4 shrink-0 text-center text-slate-400">:</div>
              <div className="flex-1 px-3 py-2.5 text-slate-800 flex items-center justify-between gap-2">
                <span>{row.value}</span>
                {isDynamic && <span className="text-xs text-slate-400 shrink-0">데이터에 따라 변경될 예정</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* 본문 안내 문구 */}
      <ol className="mt-5 space-y-2.5 list-decimal list-outside pl-5 marker:text-slate-500">
        {template.bodyIntro.map((line, i) => (
          <li key={i}>
            {line}
            {line === "관련근거" && template.legalBasis && (
              <p className="pl-4 mt-0.5 text-slate-600">: {template.legalBasis}</p>
            )}
          </li>
        ))}
      </ol>

      <p className="text-center text-lg font-bold tracking-[0.5em] my-5">- 다 음 -</p>

      {/* 과제현황 — 과제별로 자동 치환되는 영역 */}
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
              </tr>
            </thead>
            <tbody>
              {template.scheduleRows.map((row, i) => (
                <tr key={i} className={i > 0 ? "border-t border-slate-300" : ""}>
                  <td className="px-3 py-2.5 text-center font-medium whitespace-nowrap align-middle border-r border-slate-300">{row.category}</td>
                  <td className="px-3 py-2.5 text-center whitespace-pre-line align-middle border-r border-slate-300">{row.institutionTask}</td>
                  <td className="px-3 py-2.5 text-center whitespace-pre-line align-middle">{row.firmTask}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
              </tr>
            </thead>
            <tbody>
              {template.contactRows.map((row, i) => (
                <tr key={i} className={i > 0 ? "border-t border-slate-300" : ""}>
                  <td className="px-3 py-2.5 text-center font-medium whitespace-nowrap border-r border-slate-300">{row.role}</td>
                  <td className="px-3 py-2.5 text-center whitespace-nowrap border-r border-slate-300">{row.contact}</td>
                  <td className="px-3 py-2.5 text-center text-blue-700">{row.email}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 수수료 안내 */}
      <div className="mb-5">
        <p className="font-bold mb-1.5">■ 수수료</p>
        <div className="bg-slate-100 px-3 py-3 space-y-2">
          <p className="font-medium">{template.feeIntro}</p>
          <ol className="space-y-1 text-blue-700">
            {template.feeRequiredDocs.map((d, i) => (
              <li key={i}>({i + 1}) {d}</li>
            ))}
          </ol>
        </div>
        <div className="mt-2 space-y-1 text-slate-700">
          {template.feeNotes.map((n, i) => (
            <p key={i} className={i === 0 ? "" : "pl-3"}>{i === 0 ? "" : "- "}{n}</p>
          ))}
        </div>
      </div>

      {/* 붙임 */}
      <div className="mb-6">
        <p className="font-semibold mb-1">[붙임]</p>
        <div className="space-y-0.5 text-slate-800">
          {template.attachments.map((f, i) => (
            <p key={i}>붙임 {i + 1}. {f}</p>
          ))}
        </div>
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
