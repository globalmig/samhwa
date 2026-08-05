"use client";

import { useCallback, useMemo, useState, useRef } from "react";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import { FiAlertTriangle, FiAlertOctagon, FiCheckCircle, FiEdit3, FiHome, FiHelpCircle } from "react-icons/fi";
import Modal from "@/components/common/Modal";
import { useStore, updateInstitution, applyInstitutionGradeToProjects } from "@/lib/store";
import type { Institution } from "@/lib/mock";
import { styleTemplateHeader, styleTemplateDataRows, applyDropdown, downloadWorkbook, TEMPLATE_BLANK_ROWS } from "@/lib/excel-template-style";
import { similarity } from "@/lib/rcms-columns";

type ReferenceGrade = NonNullable<Institution["referenceGrade"]>;

type Step = "upload" | "sheet" | "preview" | "done";

interface PreviewRow {
  rawName: string;
  matched: Institution | null;
  oldGrade: ReferenceGrade | undefined;
  newGrade: ReferenceGrade | undefined;
  // 매칭은 됐는데 등급 칸 값이 빈칸이 아니면서도 알아볼 수 없는 경우("S등급"처럼 오타·부가텍스트) —
  // 빈칸(의도적 미반영)과 구분해서 사용자에게 따로 보여줘야 조용히 누락되지 않는다.
  malformedGradeRaw?: string;
  // 같은 기관이 파일 안에서 표기가 달라 여러 행으로 나타났는데 등급 값이 서로 다른 경우 —
  // 어느 쪽이 맞는지 시스템이 임의로 고르지 않고 사용자가 파일을 고쳐 다시 올리게 한다.
  conflictGrades?: ReferenceGrade[];
  // 매칭 안 된 행에 한해, 이름이 비슷한 기존 기관이 있으면 추천으로 보여준다.
  suggestion?: { name: string; score: number };
}

// 정산면제리스트의 등급 칸은 "S"/"A"/"B"/"C" 같은 낱글자 또는 빈칸으로만 채워져 있다
// (RCMS 엑셀의 "최우수(S)"/"우수(A)" 같은 서술형 표기와 다름 — 그래서 별도 파서를 둔다).
// 진짜 빈칸(미입력)은 "이 리스트로는 알 수 없음"으로 보고 기존 등급을 그대로 두지만,
// "-"/"일반"/"해당없음"처럼 명시적으로 등급 없음을 나타내는 값은 "일반"으로 명시적 강등 반영한다 —
// 안 그러면 정산면제리스트에서 빠진(등급이 취소된) 기관을 이 업로드만으로는 영원히 되돌릴 수 없다.
const EXPLICIT_NORMAL_VALUES = new Set(["-", "－", "일반", "해당없음", "없음", "N/A", "NONE"]);

function parseGradeLetter(raw: string): ReferenceGrade | undefined {
  const s = raw.trim().toUpperCase();
  if (s === "S") return "최우수(S)";
  if (s === "A") return "우수(A)";
  if (s === "B") return "우수(B)";
  if (s === "C") return "우수(C)";
  if (EXPLICIT_NORMAL_VALUES.has(raw.trim()) || EXPLICIT_NORMAL_VALUES.has(s)) return "일반";
  return undefined;
}

// gradeRaw가 값은 있는데(공백이 아닌데) 위 파서가 알아보지 못한 경우 — 오타 등으로 등급이
// 조용히 누락되는 걸 막기 위해 "빈칸이라 반영 안 함"과 구분해서 미리보기에 별도로 보여준다.
function isMalformedGrade(raw: string, parsed: ReferenceGrade | undefined): boolean {
  return raw.trim() !== "" && parsed === undefined;
}

// 헤더 셀 "연구지원체계 등급(24.11.21)\r\n(...)" 에서 날짜(YYYY.MM.DD)만 뽑아 비교 가능한 값으로 변환.
// "24.11.21"처럼 두 자리 연도는 "20"을 붙인다. 구분자는 파일마다 "."뿐 아니라 "-"로 찍힌 경우도
// 봐서, 어느 쪽이든(둘이 섞여도) 인식하고 괄호 안 공백("24. 11. 21")도 허용한다.
function extractHeaderDate(header: string): number | null {
  const m = header.match(/등급\s*\(\s*(\d{2,4})\s*[.\-]\s*(\d{1,2})\s*[.\-]\s*(\d{1,2})\s*\)/);
  if (!m) return null;
  const year = m[1].length === 2 ? `20${m[1]}` : m[1];
  return Number(year) * 10000 + Number(m[2]) * 100 + Number(m[3]);
}

// .normalize("NFC")가 중요하다 — 엑셀에 입력된 한글이 결합형(NFC)이 아니라 조합형(NFD)으로
// 저장돼 있으면(다른 프로그램에서 복사해온 경우 종종 있음) 눈으로는 똑같아 보여도 문자열이
// 달라서 매칭이 실패한다. mock 데이터의 기관명은 NFC라서 양쪽을 다 NFC로 맞춰야 매칭된다.
function normName(s: string): string {
  return s.replace(/\s/g, "").trim().normalize("NFC");
}

// ============================================================
// 양식 다운로드
// ============================================================

export async function downloadExemptionListTemplate() {
  const today = new Date();
  const dateLabel = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, "0")}.${String(today.getDate()).padStart(2, "0")}`;
  const gradeHeader = `연구지원체계 등급(${dateLabel})`;

  // "기관명"은 표기가 바뀔 수 있어 필수에서 뺐다 — "RCMS 기준 기관명"이 안 바뀌는 진짜 식별자라 필수로 둔다.
  // "산업부 정산면제"/"수수료적용"은 등급(S/A/B/C 여부)만으로 100% 결정되는 값이라(실제 데이터 573건
  // 전수 검증, 예외 0건) 따로 반영하지 않고 양식에서도 뺐다 — 등급 하나만 있으면 충분하다.
  const notes = [
    "선택", "", "※필수",
    `선택 (S/A/B/C 중 하나 · "-"=일반으로 명시 강등 · 미입력=반영 안 함)`,
  ];
  const headers = [
    "구 분", "기관명", "RCMS 기준 기관명 정리", gradeHeader,
  ];
  const rows = [
    ["과학기술분야 정부출연연구기관 등", "한국건설기술연구원", "한국건설기술연구원", "S"],
    ["과학기술분야 정부출연연구기관 등", "한국기계연구원", "한국기계연구원", "A"],
    ["대학", "연세대학교", "연세대학교", ""],
  ];

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("정산면제리스트", { views: [{ state: "frozen", ySplit: 2 }] });
  ws.addRow(notes);
  ws.addRow(headers);
  rows.forEach((r) => ws.addRow(r));
  headers.forEach((_, i) => { ws.getColumn(i + 1).width = 24; });
  styleTemplateHeader(ws, notes, 2);
  styleTemplateDataRows(ws, 3, 2 + TEMPLATE_BLANK_ROWS, headers.length);
  applyDropdown(ws, headers.indexOf(gradeHeader) + 1, ["S", "A", "B", "C", "-", ""], 3, 2 + TEMPLATE_BLANK_ROWS);

  await downloadWorkbook(wb, "정산면제리스트_업로드_양식.xlsx");
}

// 후보 시트 하나를 골라 실제로 파싱한다 — "정산면제" 포함 시트가 여러 개일 때 어느 걸 읽었는지
// 사용자가 직접 고르게 하므로, 여기서는 이미 확정된 sheetName만 받는다.
function parseSheet(wb: XLSX.WorkBook, sheetName: string, institutions: Institution[]): { rows: PreviewRow[] } | { error: string } {
  const ws = wb.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" }) as unknown[][];

  // 헤더 행(=컬럼명이 실제로 적힌 행) 탐색 — "기관명" 셀이 있는 첫 행
  let headerRowIdx = -1;
  for (let i = 0; i < Math.min(raw.length, 10); i++) {
    const cells = (raw[i] ?? []).map((c) => String(c ?? "").trim());
    if (cells.includes("기관명")) { headerRowIdx = i; break; }
  }
  if (headerRowIdx === -1) {
    return { error: '"기관명" 컬럼을 찾을 수 없습니다. 파일 형식을 확인해주세요.' };
  }
  const header = (raw[headerRowIdx] ?? []).map((c) => String(c ?? "").trim());
  const nameIdx = header.indexOf("기관명");
  const rcmsNameIdx = header.findIndex((h) => h.includes("RCMS") && h.includes("기관명"));

  // "연구지원체계 등급(...)" 컬럼 중 날짜가 가장 최신인 컬럼을 채택
  let gradeIdx = -1;
  let latestDate = -1;
  header.forEach((h, i) => {
    if (!h.startsWith("연구지원체계 등급")) return;
    const d = extractHeaderDate(h);
    if (d !== null && d > latestDate) { latestDate = d; gradeIdx = i; }
  });
  if (gradeIdx === -1) {
    return { error: '"연구지원체계 등급" 컬럼을 찾을 수 없습니다. 파일 형식을 확인해주세요.' };
  }

  const instByName = new Map<string, Institution>();
  for (const inst of institutions) instByName.set(normName(inst.name), inst);

  // 1차: 파일의 모든 행을 그대로 훑어서 (식별명, 매칭기관, 등급) 원본 목록을 만든다.
  // 여기서는 아직 중복 제거를 하지 않는다 — 같은 기관이 표기가 달라 여러 행으로 나타날 수 있어서,
  // "매칭된 기관 ID" 기준으로 묶어야 정확히 중복 판정이 되기 때문이다(원문 텍스트 기준으로 하면
  // 같은 기관의 다른 표기 두 줄이 별개로 남아 미리보기가 중복되거나 서로 다른 등급이 둘 다 반영될 수 있음).
  const rawRows: { identityName: string; matched: Institution | null; gradeRaw: string; newGrade: ReferenceGrade | undefined }[] = [];
  for (let i = headerRowIdx + 1; i < raw.length; i++) {
    const cells = raw[i] ?? [];
    const rawName = String(cells[nameIdx] ?? "").trim();
    const rcmsName = rcmsNameIdx >= 0 ? String(cells[rcmsNameIdx] ?? "").trim() : "";
    // "RCMS 기준 기관명"이 진짜 식별자(필수)이므로 행 유효성 판정은 이 값을 기준으로 한다.
    // "기관명"은 표기가 바뀔 수 있는 참고용이라 비어 있어도 되고, RCMS 기준 명칭이 없을 때만 대신 쓴다.
    const identityName = rcmsName || rawName;
    if (!identityName) continue;
    const gradeRaw = String(cells[gradeIdx] ?? "").trim();
    const matched = (rcmsName ? instByName.get(normName(rcmsName)) : undefined) ?? (rawName ? instByName.get(normName(rawName)) : undefined) ?? null;
    rawRows.push({ identityName, matched, gradeRaw, newGrade: parseGradeLetter(gradeRaw) });
  }

  const rows: PreviewRow[] = [];

  // 2차: 매칭된 행은 기관 ID로 묶어서 중복을 제거하고, 서로 다른(정의된) 등급이 여러 번 나오면
  // 충돌로 표시한다 — 둘 중 아무거나 임의로 골라 반영하지 않는다.
  const byInstId = new Map<string, typeof rawRows>();
  for (const r of rawRows) {
    if (!r.matched) continue;
    const list = byInstId.get(r.matched.id) ?? [];
    list.push(r);
    byInstId.set(r.matched.id, list);
  }
  for (const list of byInstId.values()) {
    const inst = list[0].matched!;
    const definedGrades = [...new Set(list.map((r) => r.newGrade).filter((g): g is ReferenceGrade => !!g))];
    const conflict = definedGrades.length > 1;
    const rep = list.find((r) => r.newGrade) ?? list[0];
    rows.push({
      rawName: rep.identityName,
      matched: inst,
      oldGrade: inst.referenceGrade,
      newGrade: conflict ? undefined : definedGrades[0],
      malformedGradeRaw: !conflict && isMalformedGrade(rep.gradeRaw, definedGrades[0]) ? rep.gradeRaw : undefined,
      conflictGrades: conflict ? definedGrades : undefined,
    });
  }

  // 3차: 매칭 안 된 행은 원문 텍스트 기준으로만 중복 제거(같은 기관인지 알 수 없으니 ID로 묶을 수 없음).
  // 이름이 비슷한 기존 기관이 있으면 추천으로 보여준다.
  const seenUnmatched = new Set<string>();
  for (const r of rawRows) {
    if (r.matched) continue;
    if (seenUnmatched.has(r.identityName)) continue;
    seenUnmatched.add(r.identityName);

    let suggestion: { name: string; score: number } | undefined;
    let bestScore = 0;
    for (const inst of institutions) {
      const score = similarity(normName(r.identityName), normName(inst.name));
      if (score > bestScore) { bestScore = score; suggestion = { name: inst.name, score }; }
    }
    if (bestScore < 70) suggestion = undefined; // 너무 낮은 유사도는 추천 의미가 없어 숨김

    rows.push({
      rawName: r.identityName,
      matched: null,
      oldGrade: undefined,
      newGrade: r.newGrade,
      malformedGradeRaw: isMalformedGrade(r.gradeRaw, r.newGrade) ? r.gradeRaw : undefined,
      suggestion,
    });
  }

  return { rows };
}

// 탭 콘텐츠 목록이 비었을 때 공통으로 보여주는 안내 문구
function EmptyTabNote({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-6 text-center text-xs text-slate-400">{children}</div>;
}

export default function ExemptionListUploadModal({ onClose }: { onClose: () => void }) {
  const { institutions } = useStore();
  const [step, setStep] = useState<Step>("upload");
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [sheetCandidates, setSheetCandidates] = useState<string[]>([]);
  const [usedSheetName, setUsedSheetName] = useState<string>("");
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [appliedCount, setAppliedCount] = useState(0);
  const [cascadeSummary, setCascadeSummary] = useState<{
    locked: number;
    projects: { institutionName: string; projectNumber: string; projectName: string; termNumbers: number[]; pastTermNumbers: number[] }[];
  }>({ locked: 0, projects: [] });
  const inputRef = useRef<HTMLInputElement>(null);

  const matchedRows = useMemo(() => previewRows.filter((r) => r.matched), [previewRows]);
  const updateRows = useMemo(
    () => previewRows.filter((r) => r.matched && r.newGrade && r.newGrade !== r.oldGrade),
    [previewRows]
  );
  const unmatchedRows = useMemo(() => previewRows.filter((r) => !r.matched), [previewRows]);
  const conflictRows = useMemo(() => previewRows.filter((r) => r.conflictGrades), [previewRows]);
  const malformedRows = useMemo(() => previewRows.filter((r) => r.malformedGradeRaw), [previewRows]);

  const runParse = useCallback((wb: XLSX.WorkBook, sheetName: string) => {
    const result = parseSheet(wb, sheetName, institutions);
    if ("error" in result) {
      setError(result.error);
      return;
    }
    setUsedSheetName(sheetName);
    setPreviewRows(result.rows);
    setStep("preview");
  }, [institutions]);

  const handleFile = useCallback((file: File) => {
    setError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const candidates = wb.SheetNames.filter((n) => n.includes("정산면제"));
        if (candidates.length === 0) {
          setError('"정산면제리스트" 시트를 찾을 수 없습니다. 시트명에 "정산면제"가 포함되어야 합니다.');
          return;
        }
        if (candidates.length === 1) {
          runParse(wb, candidates[0]);
          return;
        }
        // 후보가 여러 개(예: 연도별 탭)면 조용히 첫 번째를 고르지 않고 직접 선택하게 한다.
        setWorkbook(wb);
        setSheetCandidates(candidates);
        setStep("sheet");
      } catch {
        setError("파일을 읽는 중 오류가 발생했습니다. xlsx/xls 파일인지 확인해주세요.");
      }
    };
    reader.readAsArrayBuffer(file);
  }, [runParse]);

  function apply() {
    let locked = 0;
    const projects: { institutionName: string; projectNumber: string; projectName: string; termNumbers: number[]; pastTermNumbers: number[] }[] = [];
    for (const row of updateRows) {
      updateInstitution(row.matched!.id, { referenceGrade: row.newGrade });
      // 참고용 마스터 등급뿐 아니라, 이 기관이 참여 중인 과제들의 확정 안 된 연차에도 새 등급을 반영한다.
      // 이미 확정(CONFIRMED/BILLED)됐거나 수동조정된 연차는 applyInstitutionGradeToProjects가 알아서 건드리지 않는다.
      const result = applyInstitutionGradeToProjects(row.matched!.id, row.newGrade!);
      locked += result.lockedTermCount;
      // 건수만 보여주면 "그래서 어느 과제가 바뀌었는지" 알 수 없으므로, 과제명·연차까지 그대로 남긴다.
      // 진행 중인 연차(currentTerm)보다 이전 연차는 "이미 지난 연차"인데도 소급 반영된 것이라 별도 표시한다.
      for (const p of result.updatedProjects) {
        projects.push({
          institutionName: row.matched!.name,
          projectNumber: p.projectNumber,
          projectName: p.projectName,
          termNumbers: p.termNumbers,
          pastTermNumbers: p.termNumbers.filter((t) => t < p.currentTerm),
        });
      }
    }
    setAppliedCount(updateRows.length);
    setCascadeSummary({ locked, projects });
    setStep("done");
  }

  const TITLES: Record<Step, string> = {
    upload: "정산면제리스트 업로드",
    sheet: "시트 선택",
    preview: "미리보기 및 반영",
    done: "반영 완료",
  };
  const STEPS: Step[] = ["upload", "sheet", "preview"];
  const stepIdx = STEPS.indexOf(step);

  const reviewCount = conflictRows.length + malformedRows.length + unmatchedRows.length;
  type PreviewTabKey = "apply" | "matched" | "review";
  const TABS: { key: PreviewTabKey; label: string; count: number; Icon: typeof FiCheckCircle; warn?: boolean }[] = [
    { key: "review", label: "확인필요", count: reviewCount, Icon: FiAlertTriangle, warn: true },
    { key: "apply", label: "등급 반영 대상", count: updateRows.length, Icon: FiEdit3 },
    { key: "matched", label: "기관 매칭됨", count: matchedRows.length, Icon: FiHome },
  ];
  const [previewTab, setPreviewTab] = useState<PreviewTabKey>(
    (["apply", "matched", "review"] as PreviewTabKey[]).find((key) => (TABS.find((t) => t.key === key)?.count ?? 0) > 0) ?? "apply"
  );

  return (
    <Modal title={TITLES[step]} onClose={onClose} size="lg" fixedHeight>
      {/* 진행 표시 */}
      {step !== "done" && (
        <div className="px-6 pt-4 pb-0 shrink-0">
          <div className="flex items-center gap-1.5">
            {["파일 선택", "시트 선택", "미리보기"].map((label, i) => (
              <div key={label} className="flex items-center gap-1.5">
                <div className={`flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold shrink-0 ${
                  i < stepIdx ? "bg-blue-600 text-white" : i === stepIdx ? "bg-blue-600 text-white ring-2 ring-blue-200" : "bg-slate-200 text-slate-500"
                }`}>{i + 1}</div>
                <span className={`text-[10px] whitespace-nowrap ${i === stepIdx ? "text-blue-600 font-semibold" : "text-slate-400"}`}>{label}</span>
                {i < 2 && <div className={`w-8 h-px shrink-0 ${i < stepIdx ? "bg-blue-400" : "bg-slate-200"}`} />}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 오류 */}
      {error && (
        <div className="mx-6 mt-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-xs text-red-700 shrink-0">
          {error}
        </div>
      )}

      {/* 스텝 콘텐츠 */}
      <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
        {step === "upload" && (
          <div className="p-6 h-full flex flex-col space-y-3">
            <p className="shrink-0 text-xs text-slate-500">
              &quot;정산면제리스트&quot; 시트가 포함된 엑셀 파일을 올리면, 기관별 <strong>연구지원체계 등급</strong>(가장 최신 날짜 컬럼 기준)을
              읽어서 기존에 등록된 기관의 참고 등급에 반영합니다. 시스템에 없는 기관명은 반영하지 않고 건너뜁니다.
              등급 칸이 빈칸이면 기존 등급을 그대로 두고, &quot;-&quot;로 명시되어 있으면 &quot;일반&quot;으로 낮춰 반영합니다.
            </p>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
              onClick={() => inputRef.current?.click()}
              className={`flex-1 flex flex-col items-center justify-center cursor-pointer border-2 border-dashed rounded-xl text-center transition-colors ${
                dragging ? "border-blue-400 bg-blue-50" : "border-slate-300 hover:border-blue-400 hover:bg-slate-50"
              }`}
            >
              <div className="flex flex-col items-center gap-3">
                <svg viewBox="0 0 48 48" className="w-12 h-12 text-slate-300" fill="none" stroke="currentColor" strokeWidth={1.5}>
                  <path d="M8 40h32M24 8v24m0-24-8 8m8-8 8 8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <p className="text-sm font-medium text-slate-600">엑셀 파일을 드래그하거나 클릭하여 업로드</p>
                <p className="text-xs text-slate-400">.xlsx / .xls 지원 · &quot;정산면제리스트&quot; 시트 포함 파일</p>
              </div>
              <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
            </div>
          </div>
        )}

        {step === "sheet" && (
          <div className="h-full flex flex-col">
            <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-3">
              <p className="text-xs text-slate-500">
                &quot;정산면제&quot;가 이름에 포함된 시트가 {sheetCandidates.length}개 있습니다. 읽을 시트를 선택해주세요.
              </p>
              <div className="space-y-2">
                {sheetCandidates.map((name) => (
                  <button
                    key={name}
                    onClick={() => { if (workbook) runParse(workbook, name); }}
                    className="w-full text-left px-4 py-3 rounded-xl border border-slate-200 hover:border-blue-400 hover:bg-blue-50 transition-colors text-sm text-slate-700 font-mono"
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>
            <div className="shrink-0 flex justify-start px-6 py-4 border-t border-slate-100">
              <button onClick={() => setStep("upload")} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">이전</button>
            </div>
          </div>
        )}

        {step === "preview" && (
          <div className="p-6 h-full flex flex-col">
            {usedSheetName && (
              <p className="shrink-0 text-[11px] text-slate-400 mb-2">읽은 시트: <span className="font-mono">{usedSheetName}</span></p>
            )}

            {/* 탭 — 항목 종류별로 실제 내역을 눌러서 확인할 수 있다 */}
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex-1 flex flex-col min-h-0 rounded-xl border border-slate-200 overflow-hidden">
                <div className="grid grid-cols-3 divide-x divide-slate-200 shrink-0">
                  {TABS.map((t) => {
                    const active = previewTab === t.key;
                    const cls = t.warn
                      ? {
                          wrap: active ? "bg-amber-50 border-amber-500" : "border-transparent hover:bg-amber-50/60",
                          icon: "text-amber-500",
                          count: active ? "text-amber-700" : "text-amber-600",
                          label: active ? "text-amber-600" : "text-amber-500",
                        }
                      : {
                          wrap: active ? "bg-blue-50 border-blue-600" : "border-transparent hover:bg-slate-50",
                          icon: active ? "text-blue-600" : "text-slate-400",
                          count: active ? "text-blue-700" : "text-slate-800",
                          label: active ? "text-blue-600" : "text-slate-500",
                        };
                    return (
                      <button
                        key={t.key}
                        type="button"
                        onClick={() => setPreviewTab(t.key)}
                        className={`px-2 py-3 flex items-center justify-center gap-2 border-b-2 transition-colors ${cls.wrap}`}
                      >
                        <t.Icon size={16} className={cls.icon} />
                        <div className="text-left">
                          <p className={`text-base font-bold leading-none ${cls.count}`}>{t.count}</p>
                          <p className={`text-[10px] mt-1 whitespace-nowrap ${cls.label}`}>{t.label}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* 탭 콘텐츠 */}
                <div className="border-t border-slate-200 flex-1 overflow-y-auto">
                  {previewTab === "apply" && (
                    updateRows.length === 0 ? <EmptyTabNote>등급이 반영될 기관이 없습니다.</EmptyTabNote> : (
                      <div className="divide-y divide-slate-100">
                        {updateRows.map((r) => (
                          <div key={r.matched!.id} className="flex items-center gap-3 px-4 py-2.5 text-xs">
                            <span className="flex-1 font-medium text-slate-700 truncate">{r.matched!.name}</span>
                            <span className="text-slate-400">{r.oldGrade ?? "미설정"}</span>
                            <span className="text-slate-300">→</span>
                            <span className="font-semibold text-emerald-700">{r.newGrade}</span>
                          </div>
                        ))}
                      </div>
                    )
                  )}

                  {previewTab === "matched" && (
                    matchedRows.length === 0 ? <EmptyTabNote>매칭된 기관이 없습니다.</EmptyTabNote> : (
                      <div className="divide-y divide-slate-100">
                        {matchedRows.map((r) => {
                          const changed = r.newGrade && r.newGrade !== r.oldGrade;
                          return (
                            <div key={r.matched!.id} className="flex items-center gap-3 px-4 py-2.5 text-xs">
                              <span className="flex-1 font-medium text-slate-700 truncate">{r.matched!.name}</span>
                              <span className="text-slate-400">{r.oldGrade ?? "미설정"}</span>
                              {changed ? (
                                <>
                                  <span className="text-slate-300">→</span>
                                  <span className="font-semibold text-emerald-700">{r.newGrade}</span>
                                </>
                              ) : (
                                <span className="text-[10px] text-slate-400">변경 없음</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )
                  )}

                  {previewTab === "review" && (
                    reviewCount === 0 ? <EmptyTabNote>확인이 필요한 항목이 없습니다.</EmptyTabNote> : (
                      <div className="divide-y divide-slate-200">
                        {conflictRows.length > 0 && (
                          <div>
                            <div className="px-4 py-2 bg-red-50 flex items-center gap-1.5">
                              <FiAlertOctagon size={13} className="text-red-500 shrink-0" />
                              <p className="text-xs font-semibold text-red-700">등급 충돌 ({conflictRows.length}건) — 반영하지 않습니다</p>
                            </div>
                            <div className="divide-y divide-slate-100">
                              {conflictRows.map((r) => (
                                <p key={r.matched!.id} className="px-4 py-2 text-[11px] text-slate-600">
                                  <span className="font-medium text-slate-700">{r.matched!.name}</span>: 파일 안에 서로 다른 등급 {r.conflictGrades!.join(" / ")}이(가) 함께 있습니다 — 어느 쪽이 맞는지 파일을 확인해 하나로 정리한 뒤 다시 올려주세요.
                                </p>
                              ))}
                            </div>
                          </div>
                        )}

                        {malformedRows.length > 0 && (
                          <div>
                            <div className="px-4 py-2 bg-amber-50 flex items-center gap-1.5">
                              <FiAlertTriangle size={13} className="text-amber-500 shrink-0" />
                              <p className="text-xs font-semibold text-amber-700">등급 값 인식 불가 ({malformedRows.length}건) — 반영하지 않습니다</p>
                            </div>
                            <div className="divide-y divide-slate-100">
                              {malformedRows.map((r) => (
                                <p key={r.matched?.id ?? r.rawName} className="px-4 py-2 text-[11px] text-slate-600">
                                  <span className="font-medium text-slate-700">{r.matched?.name ?? r.rawName}</span>: 등급 칸에 &quot;{r.malformedGradeRaw}&quot;로 적혀 있어 S/A/B/C/&quot;-&quot; 중 어느 것도 아닙니다. 빈칸이 아니라 값이 있는데 인식이 안 된 것이니 오타인지 확인해주세요.
                                </p>
                              ))}
                            </div>
                          </div>
                        )}

                        {unmatchedRows.length > 0 && (
                          <div>
                            <div className="px-4 py-2 bg-slate-50 flex items-center gap-1.5">
                              <FiHelpCircle size={13} className="text-slate-400 shrink-0" />
                              <p className="text-xs font-semibold text-slate-600">매칭 안 된 기관명 ({unmatchedRows.length}건) — 건너뜁니다</p>
                            </div>
                            <div className="divide-y divide-slate-100">
                              {unmatchedRows.map((r) => (
                                <div key={r.rawName} className="flex items-center gap-2 px-4 py-2 text-[11px]">
                                  <span className="text-slate-700">{r.rawName}</span>
                                  {r.suggestion && (
                                    <span className="ml-auto text-slate-400">혹시 &quot;{r.suggestion.name}&quot;? (유사도 {r.suggestion.score}%)</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  )}
                </div>
              </div>
            </div>

            {updateRows.length === 0 && matchedRows.length === 0 && unmatchedRows.length === 0 && (
              <div className="shrink-0 rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500 mt-4">
                반영할 변경 사항이 없습니다.
              </div>
            )}

            <div className="shrink-0 flex items-center justify-between pt-4 mt-4 border-t border-slate-100">
              <button onClick={() => setStep("upload")} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">이전</button>
              <button
                onClick={apply}
                disabled={updateRows.length === 0}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-40 transition-colors"
              >
                <FiCheckCircle size={14} /> {updateRows.length}건 반영
              </button>
            </div>
          </div>
        )}

        {step === "done" && (
          <div className="h-full overflow-y-auto p-6 flex flex-col items-center justify-center gap-4">
            <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center">
              <svg className="w-7 h-7 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-base font-semibold text-slate-800">{appliedCount}개 기관 등급 반영 완료</p>

            {cascadeSummary.projects.length > 0 ? (
              <div className="w-full rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200">
                  <p className="text-xs font-semibold text-slate-700">수수료 계산이 바뀐 과제 ({cascadeSummary.projects.length}건)</p>
                </div>
                <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
                  {cascadeSummary.projects.map((p, i) => (
                    <div key={i} className="px-4 py-2.5 text-xs">
                      <p className="font-medium text-slate-700">{p.projectName} <span className="text-slate-400 font-mono">({p.projectNumber})</span></p>
                      <p className="text-slate-500 mt-0.5">
                        {p.institutionName} · {p.termNumbers.map((t) => `${t}연차`).join(", ")}
                        {p.pastTermNumbers.length > 0 && (
                          <span className="text-amber-600 font-medium"> (이미 지난 연차 {p.pastTermNumbers.map((t) => `${t}연차`).join(", ")} 포함 — 소급 반영됨)</span>
                        )}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="w-full rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-xs text-slate-600 text-center">
                등급이 바뀐 과제는 없습니다 (참여 중인 과제가 없거나, 모든 연차가 이미 확정/수동조정됨).
              </div>
            )}
            {cascadeSummary.locked > 0 && (
              <p className="w-full text-[11px] text-amber-600 -mt-2">
                이미 확정(청구완료)되었거나 수동조정된 연차 {cascadeSummary.locked}개는 금액을 그대로 두었습니다 —
                등급이 실제로 달라진 건은 해당 과제에 이슈로 등록해뒀으니 과제 상세 페이지에서 확인해주세요.
              </p>
            )}

            <button onClick={onClose} className="mt-2 px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors">
              닫기
            </button>
          </div>
        )}
      </div>
    </Modal>
  );
}
