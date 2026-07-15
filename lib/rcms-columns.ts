// ============================================================
// RCMS 엑셀 컬럼 매핑 설정
// - 시트명/컬럼명이 변경되어도 alias로 대응 가능
// - required: true → 없으면 등록 불가
// - required: false → 없으면 경고만 표시
// ============================================================

export interface SheetDef {
  key: "annual" | "stage";
  label: string;
  aliases: string[]; // 부분 일치 허용
  columns: ColumnDef[];
}

export interface ColumnDef {
  field: string;       // 내부 필드명 (코드에서 사용)
  label: string;       // 한글 표시명
  aliases: string[];   // 헤더에서 인식할 컬럼명 후보
  required: boolean;
  description?: string;
}

// ── 시트 1: 연차별기관별 연구비 집행 ──────────────────────────────
const annualColumns: ColumnDef[] = [
  {
    field: "agencyName",
    label: "전문기관명",
    aliases: ["전문기관명", "전담기관명", "주관기관명", "기관명"],
    required: true,
    description: "전담기관 등록에 사용",
  },
  {
    field: "projectNumber",
    label: "과제번호",
    aliases: ["과제번호", "국가R&D과제번호", "R&D과제번호", "과제 번호"],
    required: true,
    description: "과제 등록 기준 키",
  },
  {
    field: "projectName",
    label: "과제명",
    aliases: ["과제명", "과제 명", "연구과제명", "R&D과제명"],
    required: true,
  },
  {
    field: "startDate",
    label: "총개발시작일자",
    aliases: ["총개발시작일자", "개발시작일", "시작일자", "시작일", "연구시작일"],
    required: true,
  },
  {
    field: "endDate",
    label: "총개발종료일자",
    aliases: ["총개발종료일자", "개발종료일", "종료일자", "종료일", "연구종료일"],
    required: true,
  },
  {
    field: "term",
    label: "단계",
    aliases: ["단계", "연구단계", "과제단계"],
    required: false,
  },
  {
    field: "termYear",
    label: "연차",
    aliases: ["연차", "지원연차", "연구연차"],
    required: false,
  },
  {
    field: "supportYear",
    label: "지원연도",
    aliases: ["지원연도", "연도", "지원년도"],
    required: false,
  },
  {
    field: "institutionName",
    label: "연구개발기관명",
    aliases: ["연구개발기관명", "연구기관명", "기관명", "참여기관명"],
    required: true,
    description: "기관 등록에 사용",
  },
  {
    field: "bizNumber",
    label: "기관사업자등록번호",
    aliases: ["기관사업자등록번호", "사업자등록번호", "기관사업자번호", "사업자번호"],
    required: true,
    description: "기관 중복 체크 기준",
  },
  {
    field: "institutionRole",
    label: "기관역할구분",
    aliases: ["기관역할구분", "역할구분", "기관역할", "역할"],
    required: false,
  },
  {
    field: "cashBudget",
    label: "현금사업비총액",
    aliases: ["현금사업비총액", "현금사업비 총액", "현금총액", "사업비(현금)"],
    required: false,
  },
  {
    field: "inKindBudget",
    label: "현물사업비총액",
    aliases: ["현물사업비총액", "현물사업비 총액", "현물총액", "사업비(현물)"],
    required: false,
  },
  {
    field: "isTarget",
    label: "배정대상",
    aliases: ["배정대상", "이번배정대상", "배정 대상"],
    required: false,
  },
];

// ── 시트 2: 단계기관별 ────────────────────────────────────────────
const stageColumns: ColumnDef[] = [
  {
    field: "projectNumberNumeric",
    label: "과제번호(숫자)",
    aliases: ["과제번호(숫자)", "과제번호 숫자", "과제번호숫자"],
    required: false,
  },
  {
    field: "agencyName",
    label: "전문기관명",
    aliases: ["전문기관명", "전담기관명", "주관기관명"],
    required: true,
    description: "전담기관 등록에 사용",
  },
  {
    field: "programName",
    label: "RCMS사업명",
    aliases: ["RCMS사업명", "사업명", "연구사업명"],
    required: false,
  },
  {
    field: "projectNumber",
    label: "과제번호",
    aliases: ["과제번호", "국가R&D과제번호", "R&D과제번호"],
    required: true,
    description: "과제 등록 기준 키",
  },
  {
    field: "projectName",
    label: "과제명",
    aliases: ["과제명", "연구과제명", "R&D과제명"],
    required: true,
  },
  {
    field: "startDate",
    label: "총개발시작일자",
    aliases: ["총개발시작일자", "개발시작일", "시작일자", "시작일"],
    required: true,
  },
  {
    field: "endDate",
    label: "총개발종료일자",
    aliases: ["총개발종료일자", "개발종료일", "종료일자", "종료일"],
    required: true,
  },
  {
    field: "settlementType",
    label: "정산형태구분",
    aliases: ["정산형태구분", "정산형태", "정산구분"],
    required: false,
  },
  {
    field: "institutionName",
    label: "연구기관명",
    aliases: ["연구기관명", "연구개발기관명", "기관명", "참여기관명"],
    required: true,
    description: "기관 등록에 사용",
  },
  {
    field: "bizNumber",
    label: "기관사업자등록번호",
    aliases: ["기관사업자등록번호", "사업자등록번호", "기관사업자번호", "사업자번호"],
    required: true,
    description: "기관 중복 체크 기준",
  },
  {
    field: "institutionRole",
    label: "기관역할구분",
    aliases: ["기관역할구분", "역할구분", "기관역할", "역할"],
    required: false,
  },
  {
    field: "institutionGrade",
    label: "기관등급",
    aliases: ["기관등급", "참여기관등급", "기관평가등급", "등급"],
    required: false,
  },
  {
    field: "institutionLead",
    label: "기관책임자",
    aliases: ["기관책임자", "책임자", "연구책임자"],
    required: false,
  },
  {
    field: "totalCashBudget",
    label: "기관_총사업비(현금)",
    aliases: ["기관_총사업비(현금)", "총사업비(현금)", "현금사업비"],
    required: false,
  },
  {
    field: "auditFirm",
    label: "회계법인",
    aliases: ["회계법인", "담당회계법인", "감사법인"],
    required: false,
  },
];

export const SHEET_DEFS: SheetDef[] = [
  {
    key: "annual",
    label: "연차별기관별 연구비 집행",
    aliases: [
      "RCMS(연차별기관별_연구비 집행)(DB)",
      "RCMS(연차별기관별_연구비집행)(DB)",
      "RCMS(연차별기관별)",
      "연차별기관별_연구비 집행",
      "연차별기관별",
      "연차별",
    ],
    columns: annualColumns,
  },
  {
    key: "stage",
    label: "단계기관별",
    aliases: [
      "RCMS(단계기관별)(DB)",
      "RCMS(단계기관별)",
      "단계기관별",
      "단계별기관별",
      "단계별",
    ],
    columns: stageColumns,
  },
];

// ── 유틸: 레벤슈타인 거리 ────────────────────────────────────────

export function levenshtein(a: string, b: string): number {
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

export function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 100;
  return Math.round((1 - levenshtein(a, b) / maxLen) * 100);
}

// ── 유틸: 시트명 매핑 ───────────────────────────────────────────

export function matchSheet(sheetName: string): SheetDef | null {
  const norm = sheetName.trim();
  for (const def of SHEET_DEFS) {
    for (const alias of def.aliases) {
      if (norm.includes(alias) || alias.includes(norm)) return def;
    }
    // 유사도 기반 fallback (80% 이상)
    for (const alias of def.aliases) {
      if (similarity(norm, alias) >= 80) return def;
    }
  }
  return null;
}

// ── 유틸: 컬럼 매핑 결과 타입 ──────────────────────────────────

export interface ColMappingResult {
  field: string;
  label: string;
  required: boolean;
  description?: string;
  /** 파일 헤더에서 매핑된 실제 컬럼명 (null = 매핑 안 됨) */
  mappedTo: string | null;
  /** 자동 매핑 방식: exact=완전일치, alias=별칭, similar=유사도 */
  matchType: "exact" | "alias" | "similar" | "none";
  /** 유사도 추천 후보 (matchType=none 일 때 채워짐) */
  suggestions: { headerName: string; score: number }[];
}

export interface UnknownColumn {
  headerName: string; // 파일에는 있는데 시스템이 모르는 컬럼
}

export function buildColumnMapping(
  sheetDef: SheetDef,
  fileHeaders: string[]
): { mapping: ColMappingResult[]; unknown: UnknownColumn[] } {
  const usedHeaders = new Set<string>();

  const mapping: ColMappingResult[] = sheetDef.columns.map((col) => {
    // 1) exact match
    for (const h of fileHeaders) {
      if (h.trim() === col.aliases[0] || col.aliases.includes(h.trim())) {
        usedHeaders.add(h);
        return { field: col.field, label: col.label, required: col.required, description: col.description, mappedTo: h, matchType: "exact", suggestions: [] };
      }
    }
    // 2) alias match (includes)
    for (const alias of col.aliases) {
      for (const h of fileHeaders) {
        if (h.trim().includes(alias) || alias.includes(h.trim())) {
          usedHeaders.add(h);
          return { field: col.field, label: col.label, required: col.required, description: col.description, mappedTo: h, matchType: "alias", suggestions: [] };
        }
      }
    }
    // 3) similarity
    const scored = fileHeaders
      .filter((h) => !usedHeaders.has(h))
      .map((h) => ({ headerName: h, score: Math.max(...col.aliases.map((a) => similarity(h.trim(), a))) }))
      .filter((s) => s.score >= 70)
      .sort((a, b) => b.score - a.score);

    if (scored.length > 0) {
      // 90% 이상이면 자동 연결
      if (scored[0].score >= 90) {
        usedHeaders.add(scored[0].headerName);
        return { field: col.field, label: col.label, required: col.required, description: col.description, mappedTo: scored[0].headerName, matchType: "similar", suggestions: scored.slice(0, 3) };
      }
      return { field: col.field, label: col.label, required: col.required, description: col.description, mappedTo: null, matchType: "none", suggestions: scored.slice(0, 3) };
    }

    return { field: col.field, label: col.label, required: col.required, description: col.description, mappedTo: null, matchType: "none", suggestions: [] };
  });

  const unknown: UnknownColumn[] = fileHeaders
    .filter((h) => !usedHeaders.has(h))
    .map((h) => ({ headerName: h }));

  return { mapping, unknown };
}
