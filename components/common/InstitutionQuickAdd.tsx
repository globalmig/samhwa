"use client";

import { useRef, useState } from "react";
import { addInstitution } from "@/lib/store";
import { type Institution, type InstitutionType } from "@/lib/mock";

const inputCls = "w-full text-sm border border-slate-200 rounded-lg px-3 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400";
const selectCls = `${inputCls} bg-white`;

const INSTITUTION_TYPES: InstitutionType[] = ["대기업", "중견기업", "중소기업", "스타트업", "대학", "정부출연연구소", "공공기관"];

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
  const [type, setType] = useState<InstitutionType>("중소기업");
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
    setName(""); setBizNumber(""); setType("중소기업");
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
      type,
      bizNumber: bizNumber.trim(),
      representativeName,
      contactName,
      contactEmail,
      contactPhone,
      projectCount: 0,
      registeredAt: new Date().toISOString().slice(0, 10),
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
          <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="기관명 *" />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">사업자등록번호 *</label>
              <input className={inputCls} value={bizNumber} onChange={(e) => setBizNumber(e.target.value)} placeholder="000-00-00000" />
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">기관유형</label>
              <select className={selectCls} value={type} onChange={(e) => setType(e.target.value as InstitutionType)}>
                {INSTITUTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <input className={inputCls} value={representativeName} onChange={(e) => setRepresentativeName(e.target.value)} placeholder="대표자명" />
          <div className="grid grid-cols-3 gap-2">
            <input className={inputCls} value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="담당자명" />
            <input className={inputCls} value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="연락처" />
            <input className={inputCls} type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="이메일" />
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
