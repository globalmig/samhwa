"use client";

import { useState, useCallback, useRef } from "react";
import * as XLSX from "xlsx";
import Modal from "@/components/common/Modal";
import {
  SHEET_DEFS,
  matchSheet,
  buildColumnMapping,
  type SheetDef,
  type ColMappingResult,
  type UnknownColumn,
} from "@/lib/rcms-columns";
import {
  useStore,
  addFundingAgency,
  addInstitution,
  addProject,
} from "@/lib/store";

// ============================================================
// 타입
// ============================================================

type Step = "upload" | "sheet" | "mapping" | "duplicate" | "preview" | "done";

interface ParsedSheet {
  sheetName: string;
  def: SheetDef;
  headers: string[];
  rows: Record<string, string>[];
  mapping: ColMappingResult[];
  unknown: UnknownColumn[];
}

interface ExtractedRow {
  agencyName: string;
  projectNumber: string;
  projectName: string;
  startDate: string;
  endDate: string;
  institutionName: string;
  bizNumber: string;
  institutionRole: string;
  sheetKey: string;
}

interface DuplicateInfo {
  type: "agency" | "project" | "institution";
  key: string;
  existing: string;
  status: "exact" | "similar";
  score?: number;
}

interface PreviewRow extends ExtractedRow {
  duplicates: DuplicateInfo[];
  willRegister: { agency: boolean; project: boolean; institution: boolean };
}

// ============================================================
// 유틸
// ============================================================

function normBiz(s: string): string {
  return s.replace(/[^0-9]/g, "");
}

function normProjectNum(s: string): string {
  return s.replace(/\s/g, "").toUpperCase();
}

function simpleLevenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function strSimilarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 100;
  return Math.round((1 - simpleLevenshtein(a, b) / maxLen) * 100);
}

function getCellVal(row: Record<string, string>, mappedTo: string | null): string {
  if (!mappedTo) return "";
  return (row[mappedTo] ?? "").toString().trim();
}

// ============================================================
// 스텝 컴포넌트들
// ============================================================

// ── 1. 파일 업로드 영역 ──────────────────────────────────────────

function UploadZone({ onFile }: { onFile: (f: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const handle = (f: File) => {
    if (!f.name.match(/\.(xlsx|xls)$/i)) {
      alert("xlsx 또는 xls 파일만 업로드할 수 있습니다.");
      return;
    }
    onFile(f);
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handle(f); }}
      onClick={() => inputRef.current?.click()}
      className={`cursor-pointer border-2 border-dashed rounded-xl p-12 text-center transition-colors ${
        dragging ? "border-blue-400 bg-blue-50" : "border-slate-300 hover:border-blue-400 hover:bg-slate-50"
      }`}
    >
      <div className="flex flex-col items-center gap-3">
        <svg viewBox="0 0 48 48" className="w-12 h-12 text-slate-300" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path d="M8 40h32M24 8v24m0-24-8 8m8-8 8 8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <p className="text-sm font-medium text-slate-600">RCMS 엑셀 파일을 드래그하거나 클릭하여 업로드</p>
        <p className="text-xs text-slate-400">.xlsx / .xls 지원</p>
      </div>
      <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handle(f); }} />
    </div>
  );
}

// ── 2. 시트 탐색 결과 ────────────────────────────────────────────

function SheetStep({
  allSheetNames,
  matched,
  onConfirm,
  onBack,
}: {
  allSheetNames: string[];
  matched: { sheetName: string; def: SheetDef }[];
  onConfirm: () => void;
  onBack: () => void;
}) {
  const matchedKeys = new Set(matched.map((m) => m.sheetName));
  const unmatchedExpected = SHEET_DEFS.filter(
    (d) => !matched.find((m) => m.def.key === d.key)
  );

  return (
    <div className="p-6 space-y-4">
      <p className="text-sm font-semibold text-slate-700">시트 탐색 결과</p>
      <div className="space-y-2">
        {allSheetNames.map((name) => {
          const m = matched.find((x) => x.sheetName === name);
          return (
            <div key={name} className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${m ? "border-emerald-200 bg-emerald-50" : "border-slate-200 bg-slate-50"}`}>
              {m ? (
                <span className="text-emerald-600 font-bold text-xs bg-emerald-100 px-2 py-0.5 rounded shrink-0">인식됨</span>
              ) : (
                <span className="text-slate-400 text-xs bg-slate-200 px-2 py-0.5 rounded shrink-0">미인식</span>
              )}
              <span className="text-sm text-slate-700 font-mono">{name}</span>
              {m && <span className="ml-auto text-xs text-emerald-600">→ {m.def.label}</span>}
            </div>
          );
        })}
      </div>

      {unmatchedExpected.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 space-y-1">
          <p className="text-xs font-semibold text-amber-700">누락된 시트</p>
          {unmatchedExpected.map((d) => (
            <p key={d.key} className="text-xs text-amber-600">· {d.label}</p>
          ))}
        </div>
      )}

      <div className="flex justify-between pt-2 border-t border-slate-100">
        <button onClick={onBack} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">이전</button>
        <button
          onClick={onConfirm}
          disabled={matched.length === 0}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
        >
          컬럼 매핑 확인 →
        </button>
      </div>
    </div>
  );
}

// ── 3. 컬럼 매핑 확인 ───────────────────────────────────────────

function MappingStep({
  parsedSheets,
  onUpdateMapping,
  onConfirm,
  onBack,
}: {
  parsedSheets: ParsedSheet[];
  onUpdateMapping: (sheetKey: string, field: string, mappedTo: string | null) => void;
  onConfirm: () => void;
  onBack: () => void;
}) {
  const hasMissingRequired = parsedSheets.some((s) =>
    s.mapping.some((m) => m.required && !m.mappedTo)
  );

  return (
    <div className="p-6 space-y-6">
      {parsedSheets.map((sheet) => (
        <div key={sheet.def.key} className="space-y-3">
          <p className="text-sm font-semibold text-slate-700">{sheet.def.label} <span className="font-mono text-xs text-slate-400">({sheet.sheetName})</span></p>

          {/* 신규 컬럼 */}
          {sheet.unknown.length > 0 && (
            <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3">
              <p className="text-xs font-semibold text-blue-700 mb-1">신규 컬럼 (시스템 미인식) — 참고용</p>
              <div className="flex flex-wrap gap-1.5">
                {sheet.unknown.map((u) => (
                  <span key={u.headerName} className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-mono">{u.headerName}</span>
                ))}
              </div>
            </div>
          )}

          {/* 컬럼 매핑 테이블 */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                  <th className="text-left px-4 py-2.5 w-8"></th>
                  <th className="text-left px-4 py-2.5">시스템 필드</th>
                  <th className="text-left px-4 py-2.5">파일 컬럼</th>
                  <th className="text-left px-4 py-2.5 w-24">매핑 방식</th>
                </tr>
              </thead>
              <tbody>
                {sheet.mapping.map((m) => {
                  const isMissing = !m.mappedTo;
                  const rowCls = m.required && isMissing
                    ? "bg-red-50 border-red-100"
                    : isMissing
                    ? "bg-amber-50 border-amber-100"
                    : "";
                  return (
                    <tr key={m.field} className={`border-b border-slate-100 last:border-0 ${rowCls}`}>
                      <td className="px-4 py-2.5 text-center">
                        {m.required ? (
                          <span className="text-[9px] font-bold text-red-500 bg-red-50 border border-red-200 px-1 rounded">필수</span>
                        ) : (
                          <span className="text-[9px] text-slate-400 bg-slate-100 border border-slate-200 px-1 rounded">선택</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-slate-700">{m.label}</p>
                        {m.description && <p className="text-[10px] text-slate-400 mt-0.5">{m.description}</p>}
                      </td>
                      <td className="px-4 py-2.5">
                        <select
                          value={m.mappedTo ?? ""}
                          onChange={(e) => onUpdateMapping(sheet.def.key, m.field, e.target.value || null)}
                          className={`text-xs border rounded-lg px-2 py-1.5 w-full bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 ${
                            m.required && isMissing ? "border-red-300" : "border-slate-200"
                          }`}
                        >
                          <option value="">— 연결 안 함 —</option>
                          {sheet.headers.map((h) => (
                            <option key={h} value={h}>{h}</option>
                          ))}
                        </select>
                        {m.suggestions.length > 0 && isMissing && (
                          <p className="text-[10px] text-blue-500 mt-0.5">추천: {m.suggestions[0].headerName} ({m.suggestions[0].score}%)</p>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {m.matchType === "exact" && <span className="text-emerald-600 font-medium">완전일치</span>}
                        {m.matchType === "alias" && <span className="text-blue-600 font-medium">별칭</span>}
                        {m.matchType === "similar" && (
                          <span className="text-amber-600 font-medium">
                            유사 {m.suggestions[0]?.score ?? ""}%
                          </span>
                        )}
                        {m.matchType === "none" && isMissing && (
                          <span className="text-red-500">미연결</span>
                        )}
                        {m.matchType === "none" && !isMissing && (
                          <span className="text-amber-600">수동</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {hasMissingRequired && (
        <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-xs text-red-700">
          필수 컬럼이 연결되지 않았습니다. 위에서 직접 연결하거나 파일을 확인해주세요.
        </div>
      )}

      <div className="flex justify-between pt-2 border-t border-slate-100">
        <button onClick={onBack} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">이전</button>
        <button
          onClick={onConfirm}
          disabled={hasMissingRequired}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
        >
          중복 검사 →
        </button>
      </div>
    </div>
  );
}

// ── 4. 미리보기 + 등록 ──────────────────────────────────────────

function PreviewStep({
  previewRows,
  onConfirm,
  onBack,
  loading,
}: {
  previewRows: PreviewRow[];
  onConfirm: () => void;
  onBack: () => void;
  loading: boolean;
}) {
  const agencySet = new Set<string>();
  const projectSet = new Set<string>();
  const instSet = new Set<string>();
  let newAgency = 0, newProject = 0, newInst = 0;

  for (const r of previewRows) {
    if (r.agencyName && r.willRegister.agency && !agencySet.has(r.agencyName)) {
      agencySet.add(r.agencyName); newAgency++;
    }
    if (r.projectNumber && r.willRegister.project && !projectSet.has(r.projectNumber)) {
      projectSet.add(r.projectNumber); newProject++;
    }
    if (r.bizNumber && r.willRegister.institution && !instSet.has(r.bizNumber)) {
      instSet.add(r.bizNumber); newInst++;
    }
  }

  const dupRows = previewRows.filter((r) => r.duplicates.length > 0);

  return (
    <div className="p-6 space-y-4">
      {/* 요약 */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "신규 전담기관", count: newAgency, color: "blue" },
          { label: "신규 과제", count: newProject, color: "emerald" },
          { label: "신규 기관", count: newInst, color: "purple" },
        ].map((c) => (
          <div key={c.label} className={`rounded-xl border border-${c.color}-100 bg-${c.color}-50 px-4 py-3 text-center`}>
            <p className={`text-2xl font-bold text-${c.color}-700`}>{c.count}</p>
            <p className="text-xs text-slate-500 mt-0.5">{c.label}</p>
          </div>
        ))}
      </div>

      {/* 중복/유사 경고 */}
      {dupRows.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 space-y-2">
          <p className="text-xs font-semibold text-amber-700">중복/유사 항목 ({dupRows.length}건) — 등록에서 자동 제외됩니다</p>
          <div className="max-h-32 overflow-y-auto space-y-1">
            {dupRows.map((r, i) => (
              <div key={i} className="text-[10px] text-amber-700">
                {r.duplicates.map((d, j) => (
                  <span key={j} className="block">
                    {d.type === "agency" ? "전담기관" : d.type === "project" ? "과제" : "기관"}: {d.key}
                    {d.status === "similar" ? ` (유사 ${d.score}% — "${d.existing}")` : " — 이미 등록됨"}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {newAgency + newProject + newInst === 0 && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
          등록할 신규 항목이 없습니다.
        </div>
      )}

      <div className="flex justify-between pt-2 border-t border-slate-100">
        <button onClick={onBack} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">이전</button>
        <button
          onClick={onConfirm}
          disabled={loading || newAgency + newProject + newInst === 0}
          className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-40 transition-colors"
        >
          {loading ? "등록 중..." : `등록 (전담기관 ${newAgency} · 과제 ${newProject} · 기관 ${newInst})`}
        </button>
      </div>
    </div>
  );
}

// ── 완료 ────────────────────────────────────────────────────────

function DoneStep({ result, onClose }: { result: { agency: number; project: number; inst: number }; onClose: () => void }) {
  return (
    <div className="p-6 flex flex-col items-center gap-4">
      <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center">
        <svg className="w-7 h-7 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <p className="text-base font-semibold text-slate-800">등록 완료</p>
      <div className="grid grid-cols-3 gap-3 w-full">
        {[
          { label: "전담기관", count: result.agency },
          { label: "과제", count: result.project },
          { label: "기관", count: result.inst },
        ].map((c) => (
          <div key={c.label} className="bg-slate-50 rounded-xl border border-slate-200 px-4 py-3 text-center">
            <p className="text-xl font-bold text-slate-800">{c.count}</p>
            <p className="text-xs text-slate-500 mt-0.5">{c.label}</p>
          </div>
        ))}
      </div>
      <button onClick={onClose} className="mt-2 px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
        닫기
      </button>
    </div>
  );
}

// ============================================================
// 양식 다운로드
// ============================================================

export function downloadExcelTemplate() {
  const notes = [
    "※필수", "※필수", "※필수",
    "※필수 (YYYY-MM-DD)", "※필수 (YYYY-MM-DD)",
    "선택", "선택", "선택",
    "※필수", "※필수 (000-00-00000)",
    "선택 (주관/공동/위탁)", "선택 (원 단위)", "선택 (Y/N)",
  ];
  const headers = [
    "전문기관명", "과제번호", "과제명",
    "총개발시작일자", "총개발종료일자",
    "단계", "연차", "지원연도",
    "연구개발기관명", "기관사업자등록번호",
    "기관역할구분", "현금사업비총액", "배정대상",
  ];
  const rows = [
    [
      "한국산업기술기획평가원", "RS-2024-00000001", "스마트 제조 AI 시스템 개발",
      "2024-03-01", "2027-02-28", "1", "1", "2024",
      "삼화기술경영(주)", "123-45-67890", "주관", "500000000", "Y",
    ],
    [
      "한국산업기술기획평가원", "RS-2024-00000001", "스마트 제조 AI 시스템 개발",
      "2024-03-01", "2027-02-28", "1", "1", "2024",
      "참여기업(주)", "234-56-78901", "공동", "200000000", "Y",
    ],
    [
      "한국에너지기술평가원", "RS-2024-00000002", "신재생에너지 효율화 연구",
      "2024-06-01", "2026-05-31", "0", "1", "2024",
      "에너지연구소", "345-67-89012", "주관", "800000000", "Y",
    ],
  ];

  const ws = XLSX.utils.aoa_to_sheet([notes, headers, ...rows]);
  ws["!cols"] = headers.map(() => ({ wch: 22 }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "연차별기관별_연구비 집행");
  XLSX.writeFile(wb, "RCMS_업로드_양식.xlsx");
}

// ============================================================
// 메인 컴포넌트
// ============================================================

export default function ExcelUploadModal({ onClose }: { onClose: () => void }) {
  const { fundingAgencies, institutions, projects } = useStore();
  const [step, setStep] = useState<Step>("upload");
  const [allSheetNames, setAllSheetNames] = useState<string[]>([]);
  const [matchedSheets, setMatchedSheets] = useState<{ sheetName: string; def: SheetDef }[]>([]);
  const [parsedSheets, setParsedSheets] = useState<ParsedSheet[]>([]);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [doneResult, setDoneResult] = useState({ agency: 0, project: 0, inst: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewBackStep, setPreviewBackStep] = useState<Step>("mapping");

  // ── 파일 파싱 ───────────────────────────────────────────────

  const handleFile = useCallback((file: File) => {
    setError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const names = wb.SheetNames;
        setAllSheetNames(names);

        const matched: { sheetName: string; def: SheetDef; wb: XLSX.WorkBook }[] = [];
        for (const name of names) {
          const def = matchSheet(name);
          if (def && !matched.find((m) => m.def.key === def.key)) {
            matched.push({ sheetName: name, def, wb });
          }
        }

        setMatchedSheets(matched.map((m) => ({ sheetName: m.sheetName, def: m.def })));

        // 헤더 + 행 파싱
        const sheets: ParsedSheet[] = matched.map(({ sheetName, def, wb }) => {
          const ws = wb.Sheets[sheetName];
          const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" }) as unknown[][];
          // 양식 다운로드 파일의 1행(※필수/선택 안내)을 자동 건너뜀
          const firstRow = (raw[0] as unknown[] ?? []).map((c) => String(c ?? "").trim());
          const headerRowIdx = firstRow.some((c) => c.includes("필수") || c.includes("선택")) ? 1 : 0;
          const headerRow = (raw[headerRowIdx] as unknown[] ?? []).map((c) => String(c ?? "").trim());
          const dataRows = raw.slice(headerRowIdx + 1).map((r) => {
            const row: Record<string, string> = {};
            headerRow.forEach((h, i) => { row[h] = String((r as unknown[])[i] ?? "").trim(); });
            return row;
          }).filter((r) => Object.values(r).some((v) => v !== ""));
          const { mapping, unknown } = buildColumnMapping(def, headerRow);
          return { sheetName, def, headers: headerRow, rows: dataRows, mapping, unknown };
        });

        setParsedSheets(sheets);
        setStep("sheet");
      } catch {
        setError("파일을 읽는 중 오류가 발생했습니다. xlsx/xls 파일인지 확인해주세요.");
      }
    };
    reader.readAsArrayBuffer(file);
  }, []);

  // ── 매핑 업데이트 ───────────────────────────────────────────

  function updateMapping(sheetKey: string, field: string, mappedTo: string | null) {
    setParsedSheets((prev) =>
      prev.map((s) =>
        s.def.key !== sheetKey ? s : {
          ...s,
          mapping: s.mapping.map((m) =>
            m.field !== field ? m : { ...m, mappedTo, matchType: mappedTo ? "none" : "none" }
          ),
        }
      )
    );
  }

  // ── 중복 검사 + 미리보기 생성 ───────────────────────────────

  function buildPreview() {
    const rowMap = new Map<string, ExtractedRow>();

    for (const sheet of parsedSheets) {
      const get = (field: string, row: Record<string, string>) => {
        const m = sheet.mapping.find((x) => x.field === field);
        return getCellVal(row, m?.mappedTo ?? null);
      };

      for (const row of sheet.rows) {
        const projectNumber = get("projectNumber", row);
        if (!projectNumber) continue;
        const key = normProjectNum(projectNumber) + "|" + (get("bizNumber", row) || "");
        if (!rowMap.has(key)) {
          rowMap.set(key, {
            agencyName: get("agencyName", row),
            projectNumber,
            projectName: get("projectName", row),
            startDate: get("startDate", row),
            endDate: get("endDate", row),
            institutionName: get("institutionName", row),
            bizNumber: get("bizNumber", row),
            institutionRole: get("institutionRole", row),
            sheetKey: sheet.def.key,
          });
        }
      }
    }

    const extracted = Array.from(rowMap.values());

    // 중복 검사
    const preview: PreviewRow[] = extracted.map((row) => {
      const duplicates: DuplicateInfo[] = [];

      // 전담기관 중복
      const existingAgency = fundingAgencies.find((a) => a.name === row.agencyName);
      if (existingAgency) {
        duplicates.push({ type: "agency", key: row.agencyName, existing: existingAgency.name, status: "exact" });
      } else {
        for (const a of fundingAgencies) {
          const sc = strSimilarity(row.agencyName, a.name);
          if (sc >= 80) {
            duplicates.push({ type: "agency", key: row.agencyName, existing: a.name, status: "similar", score: sc });
            break;
          }
        }
      }

      // 과제 중복
      const normNum = normProjectNum(row.projectNumber);
      const existingProj = projects.find((p) => normProjectNum(p.projectNumber) === normNum);
      if (existingProj) {
        duplicates.push({ type: "project", key: row.projectNumber, existing: existingProj.projectNumber, status: "exact" });
      } else {
        for (const p of projects) {
          const sc = strSimilarity(normNum, normProjectNum(p.projectNumber));
          if (sc >= 85) {
            duplicates.push({ type: "project", key: row.projectNumber, existing: p.projectNumber, status: "similar", score: sc });
            break;
          }
        }
      }

      // 기관 중복
      const normBizNum = normBiz(row.bizNumber);
      if (normBizNum) {
        const existingInst = institutions.find((i) => normBiz(i.bizNumber) === normBizNum);
        if (existingInst) {
          duplicates.push({ type: "institution", key: row.bizNumber, existing: existingInst.name, status: "exact" });
        }
      }

      const agencyDup = duplicates.some((d) => d.type === "agency");
      const projectDup = duplicates.some((d) => d.type === "project");
      const instDup = duplicates.some((d) => d.type === "institution");

      return {
        ...row,
        duplicates,
        willRegister: {
          agency: !agencyDup,
          project: !projectDup,
          institution: !instDup && !!normBizNum,
        },
      };
    });

    setPreviewRows(preview);
    setStep("preview");
  }

  // 시트 확인 후 필수 컬럼이 모두 자동 인식되면 매핑 단계 건너뜀
  function handleSheetConfirm(sheets: ParsedSheet[]) {
    const allMapped = sheets.every((s) =>
      s.mapping.filter((m) => m.required).every((m) => m.mappedTo !== null)
    );
    if (allMapped) {
      setPreviewBackStep("sheet");
      buildPreview();
    } else {
      setPreviewBackStep("mapping");
      setStep("mapping");
    }
  }

  // ── 등록 실행 ───────────────────────────────────────────────

  function doRegister() {
    setLoading(true);
    const today = new Date().toISOString().slice(0, 10);

    const registeredAgencies = new Map<string, string>(); // name → id
    const registeredProjects = new Set<string>();
    const registeredInst = new Set<string>();
    let agencyCount = 0, projectCount = 0, instCount = 0;

    // 기존 전담기관 미리 채워두기
    for (const a of fundingAgencies) registeredAgencies.set(a.name, a.id);

    for (const row of previewRows) {
      // 전담기관
      if (row.willRegister.agency && row.agencyName && !registeredAgencies.has(row.agencyName)) {
        const created = addFundingAgency({
          name: row.agencyName,
          shortName: row.agencyName.slice(0, 4),
          code: row.agencyName.slice(0, 4),
          contactName: "",
          contactEmail: "",
          contactPhone: "",
          feePolicyId: null,
          status: "ACTIVE",
          registeredAt: today,
        });
        registeredAgencies.set(row.agencyName, created.id);
        agencyCount++;
      }

      // 기관
      const normBizNum = normBiz(row.bizNumber);
      if (row.willRegister.institution && normBizNum && !registeredInst.has(normBizNum)) {
        addInstitution({
          name: row.institutionName || "미입력",
          type: "중소기업",
          bizNumber: row.bizNumber,
          representativeName: "",
          contactName: "",
          contactEmail: "",
          contactPhone: "",
          projectCount: 0,
          registeredAt: today,
          status: "ACTIVE",
        });
        registeredInst.add(normBizNum);
        instCount++;
      }

      // 과제
      const normNum = normProjectNum(row.projectNumber);
      if (row.willRegister.project && normNum && !registeredProjects.has(normNum)) {
        const agencyId = registeredAgencies.get(row.agencyName) ?? "";
        addProject({
          projectNumber: row.projectNumber,
          projectName: row.projectName || "미입력",
          agencyId,
          agency: row.agencyName,
          leadInstitutionId: "",
          leadInstitutionName: row.institutionName || "",
          totalBudget: 0,
          startDate: row.startDate || today,
          endDate: row.endDate || today,
          totalTerms: 1,
          currentTerm: 1,
          status: "ACTIVE",
        });
        registeredProjects.add(normNum);
        projectCount++;
      }
    }

    setDoneResult({ agency: agencyCount, project: projectCount, inst: instCount });
    setLoading(false);
    setStep("done");
  }

  // ── 스텝 제목 ────────────────────────────────────────────────

  const TITLES: Record<Step, string> = {
    upload: "RCMS 엑셀 업로드",
    sheet: "시트 탐색",
    mapping: "컬럼 매핑 확인",
    duplicate: "중복 검사",
    preview: "미리보기 및 등록",
    done: "등록 완료",
  };

  const STEPS: Step[] = ["upload", "sheet", "mapping", "preview", "done"];
  const stepIdx = STEPS.indexOf(step);

  return (
    <Modal title={TITLES[step]} onClose={onClose} size="xl">
      {/* 진행 표시 */}
      {step !== "done" && (
        <div className="px-6 pt-4 pb-0">
          <div className="flex items-center gap-1">
            {["파일 선택", "시트 탐색", "컬럼 매핑", "미리보기"].map((label, i) => (
              <div key={label} className="flex items-center gap-1 flex-1">
                <div className={`flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold shrink-0 ${
                  i < stepIdx ? "bg-blue-600 text-white" : i === stepIdx ? "bg-blue-600 text-white ring-2 ring-blue-200" : "bg-slate-200 text-slate-500"
                }`}>{i + 1}</div>
                <span className={`text-[10px] ${i === stepIdx ? "text-blue-600 font-semibold" : "text-slate-400"}`}>{label}</span>
                {i < 3 && <div className={`flex-1 h-px ${i < stepIdx ? "bg-blue-400" : "bg-slate-200"}`} />}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 오류 */}
      {error && (
        <div className="mx-6 mt-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* 스텝 콘텐츠 */}
      {step === "upload" && (
        <div className="p-6">
          <UploadZone onFile={handleFile} />
        </div>
      )}

      {step === "sheet" && (
        <SheetStep
          allSheetNames={allSheetNames}
          matched={matchedSheets}
          onConfirm={() => handleSheetConfirm(parsedSheets)}
          onBack={() => setStep("upload")}
        />
      )}

      {step === "mapping" && (
        <MappingStep
          parsedSheets={parsedSheets}
          onUpdateMapping={updateMapping}
          onConfirm={buildPreview}
          onBack={() => setStep("sheet")}
        />
      )}

      {step === "preview" && (
        <PreviewStep
          previewRows={previewRows}
          onConfirm={doRegister}
          onBack={() => setStep(previewBackStep)}
          loading={loading}
        />
      )}

      {step === "done" && (
        <DoneStep result={doneResult} onClose={onClose} />
      )}
    </Modal>
  );
}
