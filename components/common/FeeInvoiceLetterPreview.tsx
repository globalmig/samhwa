import Image from "next/image";
import type { ReactNode } from "react";
import { type FeeInvoiceTemplate } from "@/lib/mock";
import { fmtWonFull } from "@/lib/utils";
import { useStore, updateCompanyInfo } from "@/lib/store";

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// 대상과제현황 표에 들어가는 값 — 실제 발송 시엔 과제/연차 데이터로 채워지고, 이 컴포넌트가 쓰이는
// 관리 화면(/notice-templates/invoices)에서는 샘플 값으로 미리보기만 제공한다. 행 순서가 실제 청구서
// 양식(lib/fee-invoice-pdf.ts)과 동일하게 고정돼 있어 NoticeLetterPreview의 범용 NoticeStatusRow[]와
// 달리 필드를 명시적으로 나열한다.
export interface FeeInvoiceStatusData {
  projectNumber: string;
  projectName: string;
  periodValue: string; // 기간 표시값 (예: "2026.01.01~2026.12.31") — 라벨은 template.periodLabel
  leadInstitutionName: string;
  researchLead: string;
  recipientName: string; // 정산담당자
  participantCount: number;
}

function spaced(label: string) {
  return label.split("").join(" ");
}

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

function MetaRow({ label, dynamic, children }: { label: string; dynamic?: boolean; children: ReactNode }) {
  return (
    <div className={`flex border-b border-slate-200 ${dynamic ? "bg-slate-100" : ""}`}>
      <div className="w-36 shrink-0 px-3 py-2.5 text-sm font-semibold text-slate-600 whitespace-nowrap">{label}</div>
      <div className="w-4 shrink-0 text-center text-slate-400">:</div>
      <div className="flex-1 px-3 py-2.5 text-slate-800 flex items-center justify-between gap-2">{children}</div>
    </div>
  );
}

function StatusRow({ label, value, first }: { label: string; value: string; first?: boolean }) {
  return (
    <div className={`flex ${first ? "" : "border-t border-dashed border-slate-400"}`}>
      <div className="w-48 shrink-0 px-2 py-3 text-sm font-medium text-slate-700 border-r border-dashed border-slate-400">
        <span className="block" style={{ textAlign: "justify", textAlignLast: "justify" }}>{spaced(label)}</span>
      </div>
      <div className="flex-1 px-3 py-3 text-slate-800 text-center flex items-center justify-center">{value}</div>
    </div>
  );
}

type FieldSetter = <K extends keyof FeeInvoiceTemplate>(key: K, value: FeeInvoiceTemplate[K]) => void;

// 수수료 청구서 양식 미리보기/편집 — NoticeLetterPreview(정산절차 안내 공문)와 시각적 관례(레터헤드,
// MetaRow, previewMode 회색 처리)는 맞추되, 표 구조(대상과제현황 + 단일 수수료 표)가 근본적으로 달라
// 별도 컴포넌트로 둔다. /notice-templates/invoices(관리 화면)에서만 쓰인다 — 실제 발송 PDF는
// lib/fee-invoice-pdf.ts가 독립적으로 생성한다(둘 다 같은 FeeInvoiceTemplate 데이터를 렌더링 소스로 쓸 뿐).
export default function FeeInvoiceLetterPreview({
  template,
  status,
  feeAmounts,
  docNumber,
  issuedDate,
  previewMode = false,
  editable = false,
  onFieldChange,
}: {
  template: FeeInvoiceTemplate;
  status: FeeInvoiceStatusData;
  feeAmounts: { standard: number; surcharge: number; total: number };
  docNumber?: string;
  issuedDate?: string;
  previewMode?: boolean;
  editable?: boolean;
  onFieldChange?: FieldSetter;
}) {
  const { companyInfo } = useStore();

  function setField<K extends keyof FeeInvoiceTemplate>(key: K, value: FeeInvoiceTemplate[K]) {
    onFieldChange?.(key, value);
  }
  function setBodyLine(i: number, value: string) {
    setField("bodyIntro", template.bodyIntro.map((l, j) => (j === i ? value : l)));
  }

  return (
    <div className="text-base text-slate-800 bg-white">
      {/* 레터헤드 */}
      <div className="pb-3 border-b-4 border-double border-slate-800">
        <h1 className="text-3xl font-extrabold tracking-[0.3em] text-slate-900">{spaced(companyInfo.name)}</h1>
      </div>
      <p className="text-sm text-slate-500 py-2 border-b border-slate-200">
        {companyInfo.addressLine} Tel : {companyInfo.tel} Fax : {companyInfo.fax} 담당 : {companyInfo.preparedBy}
      </p>

      {/* 문서 메타 */}
      <div className="mt-4 border-t-2 border-slate-700">
        <MetaRow label="문 서 번 호" dynamic={previewMode}>
          <span>{docNumber || `${companyInfo.docNumberPrefix} · 발송 시 자동 채번`}</span>
          {previewMode && <span className="text-xs text-slate-400 shrink-0">데이터에 따라 변경될 예정</span>}
        </MetaRow>
        <MetaRow label="발 송 일 자" dynamic={previewMode}>
          <span>{issuedDate || "발송일 기준 자동 입력"}</span>
          {previewMode && <span className="text-xs text-slate-400 shrink-0">데이터에 따라 변경될 예정</span>}
        </MetaRow>
        <MetaRow label="수 신" dynamic={previewMode}>
          <span>{status.leadInstitutionName}</span>
          {previewMode && <span className="text-xs text-slate-400 shrink-0">과제 데이터로 자동 입력</span>}
        </MetaRow>
        <MetaRow label="참 조" dynamic={previewMode}>
          <span>총괄책임자:{status.researchLead} 정산담당자:{status.recipientName}</span>
          {previewMode && <span className="text-xs text-slate-400 shrink-0">과제 데이터로 자동 입력</span>}
        </MetaRow>
        <MetaRow label="제 목">
          {editable ? (
            <InlineInput
              value={template.title}
              onChange={(v) => setField("title", v)}
              className="font-medium"
              placeholder="{agency} 전담과제 연차상시점검 수수료 청구의 건"
            />
          ) : (
            <span>{template.title || "—"}</span>
          )}
        </MetaRow>
      </div>
      {editable && (
        <p className="mt-1.5 text-[11px] text-slate-400">
          <code className="px-1 py-0.5 bg-slate-100 rounded">{"{agency}"}</code>{" "}
          부분은 발송 시 실제 전담기관 정식명칭으로 자동 치환됩니다.
        </p>
      )}

      {/* 본문 안내 문구 */}
      <ol className="mt-5 space-y-2.5 list-decimal list-outside pl-5 marker:text-slate-500">
        {template.bodyIntro.map((line, i) => (
          <li key={i}>
            {editable ? (
              <InlineInput value={line} onChange={(v) => setBodyLine(i, v)} className="w-full" />
            ) : (
              line
            )}
          </li>
        ))}
      </ol>

      <p className="text-center text-lg font-bold tracking-[0.5em] my-5">- 다 음 -</p>

      {/* 대상과제현황 — 과제/연차 데이터로 자동 치환되는 영역 (항상 읽기전용) */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-1.5">
          <p className="font-bold">■ 대상과제 현황</p>
          {previewMode && <span className="text-xs text-slate-400">과제 데이터로 자동 입력</span>}
        </div>
        <div className={`border border-slate-400 ${previewMode ? "bg-slate-100" : ""}`}>
          <StatusRow label="과제번호" value={status.projectNumber} first />
          <StatusRow label="과제명" value={status.projectName} />
          {editable ? (
            <div className="flex border-t border-dashed border-slate-400">
              <div className="w-48 shrink-0 px-2 py-2 border-r border-dashed border-slate-400 flex items-center">
                <InlineInput
                  value={template.periodLabel}
                  onChange={(v) => setField("periodLabel", v)}
                  className="text-sm font-medium text-center"
                  placeholder="당해사업연도"
                />
              </div>
              <div className="flex-1 px-3 py-3 text-slate-800 text-center flex items-center justify-center">{status.periodValue}</div>
            </div>
          ) : (
            <StatusRow label={template.periodLabel || "당해사업연도"} value={status.periodValue} />
          )}
          <StatusRow label="주관연구개발기관" value={status.leadInstitutionName} />
          <StatusRow label="연구책임자" value={status.researchLead} />
          <StatusRow label="참여기관수" value={`${status.participantCount}개`} />
        </div>
      </div>

      {/* 수수료 표 — 라벨은 편집 가능, 금액은 항상 샘플/실데이터 표시 전용 */}
      <div className="mb-5">
        {editable ? (
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="font-bold shrink-0">■</span>
            <InlineInput
              value={template.feeSectionTitle}
              onChange={(v) => setField("feeSectionTitle", v)}
              className="font-bold max-w-sm"
              placeholder="연차상시점검 수수료"
            />
          </div>
        ) : (
          <p className="font-bold mb-1.5">■ {template.feeSectionTitle || "—"}</p>
        )}
        <div className="overflow-x-auto border border-slate-400">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-slate-100 border-b border-slate-400">
                <th className="px-3 py-2.5 text-sm font-semibold text-slate-700 border-r border-slate-300">구분</th>
                <th className="px-3 py-2.5 text-sm font-semibold text-slate-700">금액</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="px-2 py-2 text-center border-r border-slate-300 align-middle">
                  {editable ? (
                    <InlineInput value={template.feeStdLabel} onChange={(v) => setField("feeStdLabel", v)} className="text-center" />
                  ) : (
                    template.feeStdLabel
                  )}
                </td>
                <td className="px-3 py-2.5 text-right text-slate-500">{fmtWonFull(feeAmounts.standard)}</td>
              </tr>
              <tr className="border-t border-slate-300">
                <td className="px-2 py-2 text-center border-r border-slate-300 align-middle">
                  {editable ? (
                    <InlineInput value={template.surchargeLabel} onChange={(v) => setField("surchargeLabel", v)} className="text-center" />
                  ) : (
                    template.surchargeLabel
                  )}
                </td>
                <td className="px-3 py-2.5 text-right text-slate-500">{fmtWonFull(feeAmounts.surcharge)}</td>
              </tr>
              <tr className="border-t border-slate-300 bg-slate-50">
                <td className="px-2 py-2 text-center font-bold border-r border-slate-300 align-middle">
                  {editable ? (
                    <InlineInput value={template.feeTotalLabel} onChange={(v) => setField("feeTotalLabel", v)} className="text-center font-bold" />
                  ) : (
                    template.feeTotalLabel
                  )}
                </td>
                <td className="px-3 py-2.5 text-right font-bold text-slate-700">{fmtWonFull(feeAmounts.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        {previewMode && <p className="text-[11px] text-slate-400 mt-1">금액은 예시이며, 실제 발송 시 과제·연차 데이터로 자동 계산됩니다.</p>}
      </div>

      <p className="text-sm mb-6">■ 입금계좌 : {companyInfo.depositAccountNote}</p>

      {/* 발신 서명 */}
      <div className="pt-6 border-t border-dashed border-slate-300 flex justify-end">
        <div className="flex flex-col items-start gap-2">
          {editable && (
            <p className="text-[10px] text-slate-400">회사명·대표이사명·직인은 이 템플릿뿐 아니라 모든 공문·청구서에 공통 적용됩니다</p>
          )}
          {editable ? (
            <InlineInput
              value={companyInfo.name}
              onChange={(v) => updateCompanyInfo({ name: v })}
              className="text-xl font-bold tracking-widest w-56"
            />
          ) : (
            <p className="text-xl font-bold tracking-widest">{spaced(companyInfo.name)}</p>
          )}
          <div className="flex items-center gap-3">
            {editable ? (
              <div className="flex items-center gap-1.5">
                <span className="text-xl font-bold shrink-0">대표이사</span>
                <InlineInput
                  value={companyInfo.ceoName}
                  onChange={(v) => updateCompanyInfo({ ceoName: v })}
                  className="text-xl font-bold w-28"
                />
              </div>
            ) : (
              <p className="text-xl font-bold">대표이사 {companyInfo.ceoName}</p>
            )}
            <div className="relative w-16 h-16 shrink-0">
              <Image src={companyInfo.stampDataUrl || "/CEO_stamp.png"} alt="대표이사 인" fill sizes="64px" className="object-contain" />
            </div>
            {editable && (
              <div className="flex flex-col gap-1">
                <label className="shrink-0 text-xs font-medium text-blue-600 border border-blue-200 rounded px-2 py-1 cursor-pointer hover:bg-blue-50 transition-colors whitespace-nowrap">
                  직인 이미지 변경
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (!file) return;
                      const dataUrl = await fileToDataUrl(file);
                      updateCompanyInfo({ stampDataUrl: dataUrl });
                    }}
                  />
                </label>
                {companyInfo.stampDataUrl && (
                  <button
                    type="button"
                    onClick={() => updateCompanyInfo({ stampDataUrl: undefined })}
                    className="text-xs text-slate-400 hover:text-slate-600 hover:underline"
                  >
                    기본 이미지로 되돌리기
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
