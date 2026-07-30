"use client";

import { useCallback, useMemo, useState, useRef } from "react";
import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import Modal from "@/components/common/Modal";
import { useStore, updateInstitution, applyInstitutionGradeToProjects } from "@/lib/store";
import type { Institution } from "@/lib/mock";
import { styleTemplateHeader, styleTemplateDataRows, applyDropdown, downloadWorkbook, TEMPLATE_BLANK_ROWS } from "@/lib/excel-template-style";

type ReferenceGrade = NonNullable<Institution["referenceGrade"]>;

type Step = "upload" | "preview" | "done";

interface PreviewRow {
  rawName: string;
  matched: Institution | null;
  oldGrade: ReferenceGrade | undefined;
  newGrade: ReferenceGrade | undefined;
}

// 정산면제리스트의 등급 칸은 "S"/"A"/"B"/"C" 같은 낱글자 또는 빈칸("-" 포함)으로만 채워져 있다
// (RCMS 엑셀의 "최우수(S)"/"우수(A)" 같은 서술형 표기와 다름 — 그래서 별도 파서를 둔다).
function parseGradeLetter(raw: string): ReferenceGrade | undefined {
  const s = raw.trim().toUpperCase();
  if (s === "S") return "최우수(S)";
  if (s === "A") return "우수(A)";
  if (s === "B") return "우수(B)";
  if (s === "C") return "우수(C)";
  return undefined;
}

// 헤더 셀 "연구지원체계 등급(24.11.21)\r\n(...)" 에서 날짜(YYYY.MM.DD)만 뽑아 비교 가능한 값으로 변환.
// "24.11.21"처럼 두 자리 연도는 "20"을 붙인다.
function extractHeaderDate(header: string): number | null {
  const m = header.match(/등급\s*\((\d{2,4})\.(\d{1,2})\.(\d{1,2})\)/);
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
    `선택 (S/A/B/C 중 하나, 미입력 시 반영 안 함)`,
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
  applyDropdown(ws, headers.indexOf(gradeHeader) + 1, ["S", "A", "B", "C", ""], 3, 2 + TEMPLATE_BLANK_ROWS);

  await downloadWorkbook(wb, "정산면제리스트_업로드_양식.xlsx");
}

export default function ExemptionListUploadModal({ onClose }: { onClose: () => void }) {
  const { institutions } = useStore();
  const [step, setStep] = useState<Step>("upload");
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [appliedCount, setAppliedCount] = useState(0);
  const [cascadeSummary, setCascadeSummary] = useState<{
    locked: number;
    projects: { institutionName: string; projectNumber: string; projectName: string; termNumbers: number[] }[];
  }>({ locked: 0, projects: [] });
  const inputRef = useRef<HTMLInputElement>(null);

  const matchedRows = useMemo(() => previewRows.filter((r) => r.matched), [previewRows]);
  const updateRows = useMemo(
    () => previewRows.filter((r) => r.matched && r.newGrade && r.newGrade !== r.oldGrade),
    [previewRows]
  );
  const unmatchedRows = useMemo(() => previewRows.filter((r) => !r.matched), [previewRows]);

  const handleFile = useCallback((file: File) => {
    setError(null);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const sheetName = wb.SheetNames.find((n) => n.includes("정산면제"));
        if (!sheetName) {
          setError('"정산면제리스트" 시트를 찾을 수 없습니다. 시트명에 "정산면제"가 포함되어야 합니다.');
          return;
        }
        const ws = wb.Sheets[sheetName];
        const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: "" }) as unknown[][];

        // 헤더 행(=컬럼명이 실제로 적힌 행) 탐색 — "기관명" 셀이 있는 첫 행
        let headerRowIdx = -1;
        for (let i = 0; i < Math.min(raw.length, 10); i++) {
          const cells = (raw[i] ?? []).map((c) => String(c ?? "").trim());
          if (cells.includes("기관명")) { headerRowIdx = i; break; }
        }
        if (headerRowIdx === -1) {
          setError('"기관명" 컬럼을 찾을 수 없습니다. 파일 형식을 확인해주세요.');
          return;
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
          setError('"연구지원체계 등급" 컬럼을 찾을 수 없습니다. 파일 형식을 확인해주세요.');
          return;
        }

        const instByName = new Map<string, Institution>();
        for (const inst of institutions) instByName.set(normName(inst.name), inst);

        const seen = new Set<string>();
        const rows: PreviewRow[] = [];
        for (let i = headerRowIdx + 1; i < raw.length; i++) {
          const cells = raw[i] ?? [];
          const rawName = String(cells[nameIdx] ?? "").trim();
          const rcmsName = rcmsNameIdx >= 0 ? String(cells[rcmsNameIdx] ?? "").trim() : "";
          // "RCMS 기준 기관명"이 진짜 식별자(필수)이므로 행 유효성/중복 판정도 이 값을 기준으로 한다.
          // "기관명"은 표기가 바뀔 수 있는 참고용이라 비어 있어도 되고, RCMS 기준 명칭이 없을 때만 대신 쓴다.
          const identityName = rcmsName || rawName;
          if (!identityName || seen.has(identityName)) continue;
          seen.add(identityName);
          const gradeRaw = String(cells[gradeIdx] ?? "").trim();

          const matched = (rcmsName ? instByName.get(normName(rcmsName)) : undefined) ?? (rawName ? instByName.get(normName(rawName)) : undefined) ?? null;
          rows.push({
            rawName: identityName,
            matched,
            oldGrade: matched?.referenceGrade,
            newGrade: parseGradeLetter(gradeRaw),
          });
        }

        setPreviewRows(rows);
        setStep("preview");
      } catch {
        setError("파일을 읽는 중 오류가 발생했습니다. xlsx/xls 파일인지 확인해주세요.");
      }
    };
    reader.readAsArrayBuffer(file);
  }, [institutions]);

  function apply() {
    let locked = 0;
    const projects: { institutionName: string; projectNumber: string; projectName: string; termNumbers: number[] }[] = [];
    for (const row of updateRows) {
      updateInstitution(row.matched!.id, { referenceGrade: row.newGrade });
      // 참고용 마스터 등급뿐 아니라, 이 기관이 참여 중인 과제들의 확정 안 된 연차에도 새 등급을 반영한다.
      // 이미 확정(CONFIRMED/BILLED)됐거나 수동조정된 연차는 applyInstitutionGradeToProjects가 알아서 건드리지 않는다.
      const result = applyInstitutionGradeToProjects(row.matched!.id, row.newGrade!);
      locked += result.lockedTermCount;
      // 건수만 보여주면 "그래서 어느 과제가 바뀌었는지" 알 수 없으므로, 과제명·연차까지 그대로 남긴다.
      for (const p of result.updatedProjects) {
        projects.push({ institutionName: row.matched!.name, projectNumber: p.projectNumber, projectName: p.projectName, termNumbers: p.termNumbers });
      }
    }
    setAppliedCount(updateRows.length);
    setCascadeSummary({ locked, projects });
    setStep("done");
  }

  const TITLES: Record<Step, string> = {
    upload: "정산면제리스트 업로드",
    preview: "미리보기 및 반영",
    done: "반영 완료",
  };

  return (
    <Modal title={TITLES[step]} onClose={onClose} size="lg">
      {error && (
        <div className="mx-6 mt-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-xs text-red-700">
          {error}
        </div>
      )}

      {step === "upload" && (
        <div className="p-6 space-y-3">
          <p className="text-xs text-slate-500">
            &quot;정산면제리스트&quot; 시트가 포함된 엑셀 파일을 올리면, 기관별 <strong>연구지원체계 등급</strong>(가장 최신 날짜 컬럼 기준)을
            읽어서 기존에 등록된 기관의 참고 등급에 반영합니다. 시스템에 없는 기관명은 반영하지 않고 건너뜁니다.
          </p>
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
            onClick={() => inputRef.current?.click()}
            className={`cursor-pointer border-2 border-dashed rounded-xl p-12 text-center transition-colors ${
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

      {step === "preview" && (
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-center">
              <p className="text-2xl font-bold text-emerald-700">{updateRows.length}</p>
              <p className="text-xs text-slate-500 mt-0.5">등급 반영 대상</p>
            </div>
            <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-center">
              <p className="text-2xl font-bold text-blue-700">{matchedRows.length}</p>
              <p className="text-xs text-slate-500 mt-0.5">기관 매칭됨 (변경 없음 포함)</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-center">
              <p className="text-2xl font-bold text-slate-500">{unmatchedRows.length}</p>
              <p className="text-xs text-slate-500 mt-0.5">매칭 안 됨 (건너뜀)</p>
            </div>
          </div>

          {updateRows.length > 0 && (
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200">
                <p className="text-xs font-semibold text-slate-700">등급 반영 대상 ({updateRows.length}건)</p>
              </div>
              <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
                {updateRows.map((r) => (
                  <div key={r.matched!.id} className="flex items-center gap-3 px-4 py-2 text-xs">
                    <span className="flex-1 font-medium text-slate-700 truncate">{r.matched!.name}</span>
                    <span className="text-slate-400">{r.oldGrade ?? "미설정"}</span>
                    <span className="text-slate-300">→</span>
                    <span className="font-semibold text-emerald-700">{r.newGrade}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {unmatchedRows.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold text-slate-600 mb-1.5">매칭 안 된 기관명 ({unmatchedRows.length}건) — 건너뜁니다</p>
              <div className="max-h-24 overflow-y-auto flex flex-wrap gap-1.5">
                {unmatchedRows.map((r) => (
                  <span key={r.rawName} className="text-[10px] bg-white border border-slate-200 text-slate-500 px-2 py-0.5 rounded">{r.rawName}</span>
                ))}
              </div>
            </div>
          )}

          {updateRows.length === 0 && (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
              반영할 변경 사항이 없습니다.
            </div>
          )}

          <div className="flex justify-between pt-2 border-t border-slate-100">
            <button onClick={() => setStep("upload")} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">이전</button>
            <button
              onClick={apply}
              disabled={updateRows.length === 0}
              className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-40 transition-colors"
            >
              {updateRows.length}건 반영
            </button>
          </div>
        </div>
      )}

      {step === "done" && (
        <div className="p-6 flex flex-col items-center gap-4">
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
                    <p className="text-slate-500 mt-0.5">{p.institutionName} · {p.termNumbers.map((t) => `${t}연차`).join(", ")}</p>
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
    </Modal>
  );
}
