"use client";

import { useRef, useState } from "react";
import { addInstitution } from "@/lib/store";
import { type Institution } from "@/lib/mock";
import { todayKST } from "@/lib/utils";

const inputCls = "w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400";
const selectCls = `${inputCls} bg-white`;

type Grade = NonNullable<Institution["referenceGrade"]>;
const GRADE_OPTIONS: Grade[] = ["최우수(S)", "우수(A)", "우수(B)", "우수(C)", "일반"];

// 등록된 기관이 수천 곳 이상이라 드롭다운 전체 나열은 비현실적 — 검색어로 걸러진 결과만
// 최대 이 개수만큼 보여준다.
const MAX_SUGGESTIONS = 50;

// 과제/참여기관 등록 폼에서 새 기관을 그 자리에서 만들 수 있게 하는 공용 위젯.
// "새 기관 추가" 토글 시 최소 필드만 입력받아 addInstitution 호출 후 바로 선택된 상태로 전환한다.
export default function InstitutionQuickAdd({
  value,
  onChange,
  institutions,
  label,
}: {
  value: string;
  onChange: (institutionId: string) => void;
  institutions: Institution[];
  label: string;
}) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [bizNumber, setBizNumber] = useState("");
  const [grade, setGrade] = useState<Grade>("일반");
  const [representativeName, setRepresentativeName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [error, setError] = useState("");

  const selectedInstitution = institutions.find((i) => i.id === value) ?? null;
  // null = 편집 중이 아님(선택된 기관명을 그대로 보여줌). 문자열 = 사용자가 입력 중인 검색어.
  const [draftQuery, setDraftQuery] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const displayValue = draftQuery ?? selectedInstitution?.name ?? "";
  const trimmedQuery = (draftQuery ?? "").trim().toLowerCase();
  const suggestions = (
    trimmedQuery
      ? institutions.filter(
          (i) => i.name.toLowerCase().includes(trimmedQuery) || i.bizNumber.includes(trimmedQuery)
        )
      : institutions
  ).slice(0, MAX_SUGGESTIONS);

  function selectInstitution(i: Institution) {
    onChange(i.id);
    setDraftQuery(null);
    setOpen(false);
  }

  function handleBlur(e: React.FocusEvent<HTMLDivElement>) {
    if (wrapRef.current?.contains(e.relatedTarget as Node)) return;
    setOpen(false);
    setDraftQuery(null);
  }

  function reset() {
    setName(""); setBizNumber(""); setGrade("일반");
    setRepresentativeName(""); setContactName(""); setContactEmail(""); setContactPhone("");
    setError("");
  }

  function register() {
    if (!name.trim() || !bizNumber.trim()) {
      setError("기관명과 사업자등록번호는 필수입니다.");
      return;
    }
    if (institutions.some((i) => i.bizNumber === bizNumber.trim())) {
      setError("이미 등록된 사업자등록번호입니다.");
      return;
    }
    const created = addInstitution({
      name: name.trim(),
      type: "중소기업",
      referenceGrade: grade,
      bizNumber: bizNumber.trim(),
      representativeName,
      contactName,
      contactEmail,
      contactPhone,
      registeredAt: todayKST(),
      status: "ACTIVE",
    });
    onChange(created.id);
    setAdding(false);
    reset();
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-xs font-medium text-slate-600">{label}</label>
        <button type="button" onClick={() => { setAdding((v) => !v); setError(""); }}
          className="text-[11px] font-medium text-blue-600 hover:underline">
          {adding ? "취소" : "+ 새 기관 추가"}
        </button>
      </div>
      {!adding ? (
        <div ref={wrapRef} onBlur={handleBlur} className="relative">
          <input
            className={inputCls}
            value={displayValue}
            onChange={(e) => { setDraftQuery(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder="기관명 또는 사업자등록번호로 검색"
          />
          {open && (
            <div className="absolute z-20 mt-1 w-full max-h-64 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
              {suggestions.length === 0 ? (
                <div className="px-3 py-2 text-xs text-slate-400">검색 결과가 없습니다</div>
              ) : (
                suggestions.map((i) => (
                  <button
                    key={i.id}
                    type="button"
                    onClick={() => selectInstitution(i)}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-blue-50 transition-colors ${
                      i.id === value ? "bg-blue-50 text-blue-700" : "text-slate-700"
                    }`}
                  >
                    <span className="truncate">{i.name}</span>
                    <span className="shrink-0 text-[11px] text-slate-400">{i.bizNumber}</span>
                  </button>
                ))
              )}
              {suggestions.length === MAX_SUGGESTIONS && (
                <div className="px-3 py-1.5 text-[10px] text-slate-400 border-t border-slate-100">
                  검색어를 입력하면 더 정확히 찾을 수 있습니다
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-lg border border-blue-100 bg-blue-50/40 p-3 space-y-2">
          {error && <p className="text-[11px] text-red-600">{error}</p>}
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">기관명 *</label>
            <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="(주)기관명" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">사업자등록번호 *</label>
              <input className={inputCls} value={bizNumber} onChange={(e) => setBizNumber(e.target.value)} placeholder="000-00-00000" />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">등급</label>
              <select className={selectCls} value={grade} onChange={(e) => setGrade(e.target.value as Grade)}>
                {GRADE_OPTIONS.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-500 mb-1">대표자명</label>
            <input className={inputCls} value={representativeName} onChange={(e) => setRepresentativeName(e.target.value)} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">담당자명</label>
              <input className={inputCls} value={contactName} onChange={(e) => setContactName(e.target.value)} />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">연락처</label>
              <input className={inputCls} value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="02-0000-0000" />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">이메일</label>
              <input className={inputCls} type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="contact@institution.kr" />
            </div>
          </div>
          <div className="flex justify-end">
            <button type="button" onClick={register}
              className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
              이 기관으로 등록
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
