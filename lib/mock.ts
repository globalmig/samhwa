// ============================================================
// 도메인 구조
//
// 과제(Project)
//   ├─ 주관기관(Institution, role=LEAD) ← 세금계산서/미수금/미청구 청구 대상
//   └─ 참여기관 목록(ProjectMember)     ← 수수료 산정 정보 (청구 대상 아님)
//
// 수수료 흐름
//   참여기관별 예산 × 유형별 요율 → 합산 → 주관기관에 세금계산서 1건 발행
//   → 미수금 추적(주관기관) → 정산(연구비는 기관별로 별도 정산)
// ============================================================

// ============================================================
// 대시보드 데이터
// ============================================================

export interface ProjectFeeRow {
  projectNumber: string;
  projectName: string;
  agency: string; // 지원기관 (정부)
  leadInstitutionName: string; // 주관기관
  termYear: number;
  termNumber: number;
  memberCount: number; // 참여기관 수 (주관 포함)
  totalBudget: number;
  calculatedFee: number; // 산정 수수료
  appliedFee: number; // 적용 수수료
  billedFee: number;
  unclaimedFee: number;
  receivable: number;
  status: "BILLED" | "CONFIRMED" | "DRAFT" | "UNCLAIMED" | "OVERDUE";
}

export interface InstitutionSummaryRow {
  name: string;
  type: string;
  projectCount: number;
  totalBudget: number;
  totalFee: number;
  unclaimed: number;
  receivable: number;
  settlement: number;
}

export const projectFeeRows: ProjectFeeRow[] = [
  {
    projectNumber: "RS-2024-00214837",
    projectName: "초정밀 광학 센서 모듈 개발 및 양산화",
    agency: "산업기술평가관리원",
    leadInstitutionName: "삼화전자(주)",
    termYear: 2024,
    termNumber: 2,
    memberCount: 4,
    totalBudget: 2_800_000_000,
    calculatedFee: 65_000_000,
    appliedFee: 52_000_000,
    billedFee: 52_000_000,
    unclaimedFee: 4_000_000,
    receivable: 0,
    status: "BILLED",
  },
  {
    projectNumber: "RS-2024-00198321",
    projectName: "차세대 이차전지 양극재 소재 국산화",
    agency: "한국에너지기술평가원",
    leadInstitutionName: "(주)에너텍솔루션",
    termYear: 2024,
    termNumber: 1,
    memberCount: 6,
    totalBudget: 4_500_000_000,
    calculatedFee: 112_500_000,
    appliedFee: 112_500_000,
    billedFee: 112_500_000,
    unclaimedFee: 0,
    receivable: 112_500_000,
    status: "OVERDUE",
  },
  {
    projectNumber: "RS-2024-00201547",
    projectName: "스마트 제조공정 AI 품질예측 시스템",
    agency: "중소기업기술정보진흥원",
    leadInstitutionName: "나노소재기술(주)",
    termYear: 2024,
    termNumber: 3,
    memberCount: 3,
    totalBudget: 1_200_000_000,
    calculatedFee: 24_000_000,
    appliedFee: 22_000_000,
    billedFee: 22_000_000,
    unclaimedFee: 2_000_000,
    receivable: 0,
    status: "CONFIRMED",
  },
  {
    projectNumber: "RS-2023-00187652",
    projectName: "바이오 플라스틱 생분해성 소재 개발",
    agency: "한국산업기술진흥원",
    leadInstitutionName: "연세대학교",
    termYear: 2024,
    termNumber: 2,
    memberCount: 5,
    totalBudget: 3_100_000_000,
    calculatedFee: 77_500_000,
    appliedFee: 77_500_000,
    billedFee: 77_500_000,
    unclaimedFee: 0,
    receivable: 38_750_000,
    status: "BILLED",
  },
  {
    projectNumber: "RS-2024-00225198",
    projectName: "고효율 수소 연료전지 스택 성능 향상",
    agency: "한국에너지기술평가원",
    leadInstitutionName: "한국과학기술연구원",
    termYear: 2024,
    termNumber: 1,
    memberCount: 2,
    totalBudget: 2_200_000_000,
    calculatedFee: 58_000_000,
    appliedFee: 0,
    billedFee: 0,
    unclaimedFee: 58_000_000,
    receivable: 0,
    status: "UNCLAIMED",
  },
  {
    projectNumber: "RS-2024-00231087",
    projectName: "반도체 패키징 열관리 신소재 연구",
    agency: "산업기술평가관리원",
    leadInstitutionName: "(주)미래반도체",
    termYear: 2024,
    termNumber: 1,
    memberCount: 3,
    totalBudget: 980_000_000,
    calculatedFee: 19_600_000,
    appliedFee: 19_600_000,
    billedFee: 19_600_000,
    unclaimedFee: 0,
    receivable: 0,
    status: "BILLED",
  },
  {
    projectNumber: "RS-2023-00176431",
    projectName: "도심항공모빌리티(UAM) 경량화 구조재 개발",
    agency: "항공우주연구원",
    leadInstitutionName: "(주)한국항공우주",
    termYear: 2024,
    termNumber: 3,
    memberCount: 7,
    totalBudget: 5_800_000_000,
    calculatedFee: 145_000_000,
    appliedFee: 145_000_000,
    billedFee: 145_000_000,
    unclaimedFee: 0,
    receivable: 0,
    status: "BILLED",
  },
  {
    projectNumber: "RS-2024-00219874",
    projectName: "의료용 생체흡수성 임플란트 소재 개발",
    agency: "보건산업진흥원",
    leadInstitutionName: "그린바이오텍(주)",
    termYear: 2024,
    termNumber: 2,
    memberCount: 3,
    totalBudget: 1_650_000_000,
    calculatedFee: 33_000_000,
    appliedFee: 0,
    billedFee: 0,
    unclaimedFee: 33_000_000,
    receivable: 0,
    status: "DRAFT",
  },
];

export const institutionSummaryRows: InstitutionSummaryRow[] = [
  { name: "삼화전자(주)", type: "중소기업", projectCount: 4, totalBudget: 6_800_000_000, totalFee: 136_000_000, unclaimed: 18_000_000, receivable: 52_000_000, settlement: 420_000_000 },
  { name: "한국과학기술연구원", type: "정부출연연구소", projectCount: 6, totalBudget: 12_500_000_000, totalFee: 312_500_000, unclaimed: 45_000_000, receivable: 98_750_000, settlement: 780_000_000 },
  { name: "(주)에너텍솔루션", type: "중견기업", projectCount: 3, totalBudget: 4_200_000_000, totalFee: 84_000_000, unclaimed: 0, receivable: 36_000_000, settlement: 210_000_000 },
  { name: "연세대학교", type: "대학", projectCount: 5, totalBudget: 8_900_000_000, totalFee: 178_000_000, unclaimed: 62_000_000, receivable: 0, settlement: 560_000_000 },
  { name: "나노소재기술(주)", type: "스타트업", projectCount: 2, totalBudget: 980_000_000, totalFee: 14_700_000, unclaimed: 4_150_000, receivable: 0, settlement: 98_000_000 },
];

export const summary = {
  totalFee: 583_100_000,
  unclaimedFee: 83_000_000,
  receivable: 151_250_000,
  scheduledSettlement: 892_450_000,
  totalFeeChange: "+12.4%",
  unclaimedChange: "-8.2%",
  receivableChange: "+3.1%",
  settlementChange: "+6.8%",
};

export const agencyBreakdown = [
  { name: "산업기술평가관리원", fee: 213_200_000, rate: 37 },
  { name: "한국에너지기술평가원", fee: 156_500_000, rate: 27 },
  { name: "한국산업기술진흥원", fee: 92_800_000, rate: 16 },
  { name: "중소기업기술정보진흥원", fee: 58_400_000, rate: 10 },
  { name: "기타", fee: 62_200_000, rate: 10 },
];

// ============================================================
// 기관 관리 (통합 — 기업/대학/연구소 구분 없이 동일 엔티티)
// ============================================================

export type InstitutionType =
  | "대기업"
  | "중견기업"
  | "중소기업"
  | "스타트업"
  | "대학"
  | "정부출연연구소"
  | "공공기관";

export interface Institution {
  id: string;
  name: string;
  type: InstitutionType;
  bizNumber: string;
  representativeName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  projectCount: number;
  registeredAt: string;
  status: "ACTIVE" | "INACTIVE";
}

export const institutions: Institution[] = [
  {
    id: "inst-001",
    name: "삼화전자(주)",
    type: "중소기업",
    bizNumber: "123-45-67890",
    representativeName: "김삼화",
    contactName: "이영수",
    contactEmail: "lee.ys@samhwa.co.kr",
    contactPhone: "02-1234-5678",
    projectCount: 4,
    registeredAt: "2022-01-15",
    status: "ACTIVE",
  },
  {
    id: "inst-002",
    name: "한국과학기술연구원",
    type: "정부출연연구소",
    bizNumber: "214-82-00112",
    representativeName: "박연구",
    contactName: "최수진",
    contactEmail: "choi.sj@kist.re.kr",
    contactPhone: "02-958-5000",
    projectCount: 6,
    registeredAt: "2022-01-15",
    status: "ACTIVE",
  },
  {
    id: "inst-003",
    name: "(주)에너텍솔루션",
    type: "중견기업",
    bizNumber: "456-78-91234",
    representativeName: "정에너",
    contactName: "김민준",
    contactEmail: "kim.mj@enertech.co.kr",
    contactPhone: "031-456-7890",
    projectCount: 3,
    registeredAt: "2022-03-20",
    status: "ACTIVE",
  },
  {
    id: "inst-004",
    name: "연세대학교",
    type: "대학",
    bizNumber: "204-82-00116",
    representativeName: "이총장",
    contactName: "박지혜",
    contactEmail: "park.jh@yonsei.ac.kr",
    contactPhone: "02-2123-2000",
    projectCount: 5,
    registeredAt: "2022-01-15",
    status: "ACTIVE",
  },
  {
    id: "inst-005",
    name: "나노소재기술(주)",
    type: "스타트업",
    bizNumber: "789-10-23456",
    representativeName: "한나노",
    contactName: "강현우",
    contactEmail: "kang.hw@nanomat.co.kr",
    contactPhone: "042-867-1234",
    projectCount: 2,
    registeredAt: "2023-02-10",
    status: "ACTIVE",
  },
  {
    id: "inst-006",
    name: "(주)한국항공우주",
    type: "중견기업",
    bizNumber: "321-65-48920",
    representativeName: "조항공",
    contactName: "윤서진",
    contactEmail: "yoon.sj@kaitech.co.kr",
    contactPhone: "042-870-2000",
    projectCount: 3,
    registeredAt: "2022-07-05",
    status: "ACTIVE",
  },
  {
    id: "inst-007",
    name: "부산대학교",
    type: "대학",
    bizNumber: "208-82-00056",
    representativeName: "류총장",
    contactName: "신현철",
    contactEmail: "shin.hc@pusan.ac.kr",
    contactPhone: "051-510-1000",
    projectCount: 2,
    registeredAt: "2022-06-01",
    status: "ACTIVE",
  },
  {
    id: "inst-008",
    name: "그린바이오텍(주)",
    type: "중소기업",
    bizNumber: "654-32-10987",
    representativeName: "오그린",
    contactName: "임수아",
    contactEmail: "lim.sa@greenbiotech.co.kr",
    contactPhone: "031-789-4567",
    projectCount: 2,
    registeredAt: "2023-09-01",
    status: "ACTIVE",
  },
  {
    id: "inst-009",
    name: "(주)미래반도체",
    type: "중소기업",
    bizNumber: "111-22-33456",
    representativeName: "서미래",
    contactName: "최재원",
    contactEmail: "choi.jw@futuresemi.co.kr",
    contactPhone: "031-300-5678",
    projectCount: 1,
    registeredAt: "2024-01-20",
    status: "ACTIVE",
  },
  {
    id: "inst-010",
    name: "(주)클린에너지솔루션",
    type: "중견기업",
    bizNumber: "222-33-44567",
    representativeName: "문클린",
    contactName: "장하늘",
    contactEmail: "jang.hn@cleanenergy.co.kr",
    contactPhone: "02-555-1234",
    projectCount: 2,
    registeredAt: "2022-11-30",
    status: "INACTIVE",
  },
  {
    id: "inst-011",
    name: "하이테크머티리얼(주)",
    type: "스타트업",
    bizNumber: "333-44-55678",
    representativeName: "홍하이",
    contactName: "송지은",
    contactEmail: "song.je@hightechmat.co.kr",
    contactPhone: "051-444-7890",
    projectCount: 1,
    registeredAt: "2024-03-15",
    status: "ACTIVE",
  },
];

// ============================================================
// 과제 관리
// ============================================================

export interface Project {
  id: string;
  projectNumber: string;
  projectName: string;
  agency: string; // 지원기관 (정부)
  leadInstitutionId: string; // 주관기관 ID
  leadInstitutionName: string; // 주관기관명 (비정규화)
  totalBudget: number;
  startDate: string;
  endDate: string;
  totalTerms: number;
  currentTerm: number;
  status: "ACTIVE" | "COMPLETED" | "SUSPENDED";
}

export const projects: Project[] = [
  {
    id: "p-001",
    projectNumber: "RS-2024-00214837",
    projectName: "초정밀 광학 센서 모듈 개발 및 양산화",
    agency: "산업기술평가관리원",
    leadInstitutionId: "inst-001",
    leadInstitutionName: "삼화전자(주)",
    totalBudget: 2_800_000_000,
    startDate: "2023-03-01",
    endDate: "2026-02-28",
    totalTerms: 3,
    currentTerm: 2,
    status: "ACTIVE",
  },
  {
    id: "p-002",
    projectNumber: "RS-2024-00198321",
    projectName: "차세대 이차전지 양극재 소재 국산화",
    agency: "한국에너지기술평가원",
    leadInstitutionId: "inst-003",
    leadInstitutionName: "(주)에너텍솔루션",
    totalBudget: 4_500_000_000,
    startDate: "2024-01-01",
    endDate: "2027-12-31",
    totalTerms: 4,
    currentTerm: 1,
    status: "ACTIVE",
  },
  {
    id: "p-003",
    projectNumber: "RS-2024-00201547",
    projectName: "스마트 제조공정 AI 품질예측 시스템",
    agency: "중소기업기술정보진흥원",
    leadInstitutionId: "inst-005",
    leadInstitutionName: "나노소재기술(주)",
    totalBudget: 1_200_000_000,
    startDate: "2022-06-01",
    endDate: "2025-05-31",
    totalTerms: 3,
    currentTerm: 3,
    status: "ACTIVE",
  },
  {
    id: "p-004",
    projectNumber: "RS-2023-00187652",
    projectName: "바이오 플라스틱 생분해성 소재 개발",
    agency: "한국산업기술진흥원",
    leadInstitutionId: "inst-004",
    leadInstitutionName: "연세대학교",
    totalBudget: 3_100_000_000,
    startDate: "2023-04-01",
    endDate: "2026-03-31",
    totalTerms: 3,
    currentTerm: 2,
    status: "ACTIVE",
  },
  {
    id: "p-005",
    projectNumber: "RS-2024-00225198",
    projectName: "고효율 수소 연료전지 스택 성능 향상",
    agency: "한국에너지기술평가원",
    leadInstitutionId: "inst-002",
    leadInstitutionName: "한국과학기술연구원",
    totalBudget: 2_200_000_000,
    startDate: "2024-03-01",
    endDate: "2027-02-28",
    totalTerms: 3,
    currentTerm: 1,
    status: "ACTIVE",
  },
  {
    id: "p-006",
    projectNumber: "RS-2024-00231087",
    projectName: "반도체 패키징 열관리 신소재 연구",
    agency: "산업기술평가관리원",
    leadInstitutionId: "inst-009",
    leadInstitutionName: "(주)미래반도체",
    totalBudget: 980_000_000,
    startDate: "2024-04-01",
    endDate: "2026-03-31",
    totalTerms: 2,
    currentTerm: 1,
    status: "ACTIVE",
  },
  {
    id: "p-007",
    projectNumber: "RS-2023-00176431",
    projectName: "도심항공모빌리티(UAM) 경량화 구조재 개발",
    agency: "항공우주연구원",
    leadInstitutionId: "inst-006",
    leadInstitutionName: "(주)한국항공우주",
    totalBudget: 5_800_000_000,
    startDate: "2022-07-01",
    endDate: "2025-06-30",
    totalTerms: 3,
    currentTerm: 3,
    status: "ACTIVE",
  },
  {
    id: "p-008",
    projectNumber: "RS-2024-00219874",
    projectName: "의료용 생체흡수성 임플란트 소재 개발",
    agency: "보건산업진흥원",
    leadInstitutionId: "inst-008",
    leadInstitutionName: "그린바이오텍(주)",
    totalBudget: 1_650_000_000,
    startDate: "2023-09-01",
    endDate: "2026-08-31",
    totalTerms: 3,
    currentTerm: 2,
    status: "ACTIVE",
  },
  {
    id: "p-009",
    projectNumber: "RS-2022-00158234",
    projectName: "탄소섬유 복합소재 고속 성형 기술 개발",
    agency: "산업기술평가관리원",
    leadInstitutionId: "inst-007",
    leadInstitutionName: "부산대학교",
    totalBudget: 2_100_000_000,
    startDate: "2022-01-01",
    endDate: "2024-12-31",
    totalTerms: 3,
    currentTerm: 3,
    status: "COMPLETED",
  },
  {
    id: "p-010",
    projectNumber: "RS-2022-00162891",
    projectName: "차량용 전력반도체 소자 국산화",
    agency: "한국산업기술진흥원",
    leadInstitutionId: "inst-011",
    leadInstitutionName: "하이테크머티리얼(주)",
    totalBudget: 3_400_000_000,
    startDate: "2022-04-01",
    endDate: "2024-03-31",
    totalTerms: 2,
    currentTerm: 2,
    status: "COMPLETED",
  },
];

// ============================================================
// 참여기관 (과제-기관 연결, 수수료 산정용)
// ============================================================

export interface ProjectMember {
  id: string;
  projectId: string;
  projectNumber: string;
  institutionId: string;
  institutionName: string;
  institutionType: InstitutionType;
  role: "LEAD" | "PARTICIPANT"; // 주관 | 참여
  budget: number; // 해당 기관 배정 연구비
  feeRate: number; // 적용 요율 (%)
  calculatedFee: number; // 산정 수수료
}

export const projectMembers: ProjectMember[] = [
  // p-001: 삼화전자 주관, 4개 기관
  { id: "pm-001", projectId: "p-001", projectNumber: "RS-2024-00214837", institutionId: "inst-001", institutionName: "삼화전자(주)", institutionType: "중소기업", role: "LEAD", budget: 700_000_000, feeRate: 3.0, calculatedFee: 21_000_000 },
  { id: "pm-002", projectId: "p-001", projectNumber: "RS-2024-00214837", institutionId: "inst-002", institutionName: "한국과학기술연구원", institutionType: "정부출연연구소", role: "PARTICIPANT", budget: 1_200_000_000, feeRate: 2.0, calculatedFee: 24_000_000 },
  { id: "pm-003", projectId: "p-001", projectNumber: "RS-2024-00214837", institutionId: "inst-004", institutionName: "연세대학교", institutionType: "대학", role: "PARTICIPANT", budget: 500_000_000, feeRate: 2.0, calculatedFee: 10_000_000 },
  { id: "pm-004", projectId: "p-001", projectNumber: "RS-2024-00214837", institutionId: "inst-005", institutionName: "나노소재기술(주)", institutionType: "스타트업", role: "PARTICIPANT", budget: 400_000_000, feeRate: 2.5, calculatedFee: 10_000_000 },

  // p-002: (주)에너텍솔루션 주관, 6개 기관
  { id: "pm-005", projectId: "p-002", projectNumber: "RS-2024-00198321", institutionId: "inst-003", institutionName: "(주)에너텍솔루션", institutionType: "중견기업", role: "LEAD", budget: 1_500_000_000, feeRate: 2.5, calculatedFee: 37_500_000 },
  { id: "pm-006", projectId: "p-002", projectNumber: "RS-2024-00198321", institutionId: "inst-004", institutionName: "연세대학교", institutionType: "대학", role: "PARTICIPANT", budget: 2_000_000_000, feeRate: 2.0, calculatedFee: 40_000_000 },
  { id: "pm-007", projectId: "p-002", projectNumber: "RS-2024-00198321", institutionId: "inst-002", institutionName: "한국과학기술연구원", institutionType: "정부출연연구소", role: "PARTICIPANT", budget: 500_000_000, feeRate: 2.0, calculatedFee: 10_000_000 },
  { id: "pm-008", projectId: "p-002", projectNumber: "RS-2024-00198321", institutionId: "inst-007", institutionName: "부산대학교", institutionType: "대학", role: "PARTICIPANT", budget: 300_000_000, feeRate: 2.0, calculatedFee: 6_000_000 },
  { id: "pm-009", projectId: "p-002", projectNumber: "RS-2024-00198321", institutionId: "inst-010", institutionName: "(주)클린에너지솔루션", institutionType: "중견기업", role: "PARTICIPANT", budget: 100_000_000, feeRate: 2.5, calculatedFee: 2_500_000 },
  { id: "pm-010", projectId: "p-002", projectNumber: "RS-2024-00198321", institutionId: "inst-011", institutionName: "하이테크머티리얼(주)", institutionType: "스타트업", role: "PARTICIPANT", budget: 100_000_000, feeRate: 2.5, calculatedFee: 2_500_000 },

  // p-003: 나노소재기술 주관, 3개 기관
  { id: "pm-011", projectId: "p-003", projectNumber: "RS-2024-00201547", institutionId: "inst-005", institutionName: "나노소재기술(주)", institutionType: "스타트업", role: "LEAD", budget: 600_000_000, feeRate: 2.5, calculatedFee: 15_000_000 },
  { id: "pm-012", projectId: "p-003", projectNumber: "RS-2024-00201547", institutionId: "inst-002", institutionName: "한국과학기술연구원", institutionType: "정부출연연구소", role: "PARTICIPANT", budget: 400_000_000, feeRate: 2.0, calculatedFee: 8_000_000 },
  { id: "pm-013", projectId: "p-003", projectNumber: "RS-2024-00201547", institutionId: "inst-007", institutionName: "부산대학교", institutionType: "대학", role: "PARTICIPANT", budget: 200_000_000, feeRate: 2.0, calculatedFee: 4_000_000 },

  // p-004: (주)에너텍솔루션 주관, 5개 기관
  { id: "pm-014", projectId: "p-004", projectNumber: "RS-2023-00187652", institutionId: "inst-004", institutionName: "연세대학교", institutionType: "대학", role: "LEAD", budget: 1_500_000_000, feeRate: 2.0, calculatedFee: 30_000_000 },
  { id: "pm-015", projectId: "p-004", projectNumber: "RS-2023-00187652", institutionId: "inst-003", institutionName: "(주)에너텍솔루션", institutionType: "중견기업", role: "PARTICIPANT", budget: 800_000_000, feeRate: 2.5, calculatedFee: 20_000_000 },
  { id: "pm-016", projectId: "p-004", projectNumber: "RS-2023-00187652", institutionId: "inst-008", institutionName: "그린바이오텍(주)", institutionType: "중소기업", role: "PARTICIPANT", budget: 500_000_000, feeRate: 3.0, calculatedFee: 15_000_000 },
  { id: "pm-017", projectId: "p-004", projectNumber: "RS-2023-00187652", institutionId: "inst-002", institutionName: "한국과학기술연구원", institutionType: "정부출연연구소", role: "PARTICIPANT", budget: 200_000_000, feeRate: 2.0, calculatedFee: 4_000_000 },
  { id: "pm-018", projectId: "p-004", projectNumber: "RS-2023-00187652", institutionId: "inst-007", institutionName: "부산대학교", institutionType: "대학", role: "PARTICIPANT", budget: 100_000_000, feeRate: 2.0, calculatedFee: 2_000_000 },

  // p-005: 삼화전자 주관, 4개 기관
  { id: "pm-019", projectId: "p-005", projectNumber: "RS-2024-00225198", institutionId: "inst-002", institutionName: "한국과학기술연구원", institutionType: "정부출연연구소", role: "LEAD", budget: 800_000_000, feeRate: 2.0, calculatedFee: 16_000_000 },
  { id: "pm-020", projectId: "p-005", projectNumber: "RS-2024-00225198", institutionId: "inst-001", institutionName: "삼화전자(주)", institutionType: "중소기업", role: "PARTICIPANT", budget: 1_400_000_000, feeRate: 3.0, calculatedFee: 42_000_000 },

  // p-006: (주)미래반도체 주관, 3개 기관
  { id: "pm-023", projectId: "p-006", projectNumber: "RS-2024-00231087", institutionId: "inst-009", institutionName: "(주)미래반도체", institutionType: "중소기업", role: "LEAD", budget: 480_000_000, feeRate: 3.0, calculatedFee: 14_400_000 },
  { id: "pm-024", projectId: "p-006", projectNumber: "RS-2024-00231087", institutionId: "inst-005", institutionName: "나노소재기술(주)", institutionType: "스타트업", role: "PARTICIPANT", budget: 300_000_000, feeRate: 2.5, calculatedFee: 7_500_000 },
  { id: "pm-025", projectId: "p-006", projectNumber: "RS-2024-00231087", institutionId: "inst-002", institutionName: "한국과학기술연구원", institutionType: "정부출연연구소", role: "PARTICIPANT", budget: 200_000_000, feeRate: 2.0, calculatedFee: 4_000_000 },

  // p-007: (주)한국항공우주 주관, 7개 기관
  { id: "pm-026", projectId: "p-007", projectNumber: "RS-2023-00176431", institutionId: "inst-006", institutionName: "(주)한국항공우주", institutionType: "중견기업", role: "LEAD", budget: 1_200_000_000, feeRate: 2.5, calculatedFee: 30_000_000 },
  { id: "pm-027", projectId: "p-007", projectNumber: "RS-2023-00176431", institutionId: "inst-001", institutionName: "삼화전자(주)", institutionType: "중소기업", role: "PARTICIPANT", budget: 1_200_000_000, feeRate: 3.0, calculatedFee: 36_000_000 },
  { id: "pm-028", projectId: "p-007", projectNumber: "RS-2023-00176431", institutionId: "inst-004", institutionName: "연세대학교", institutionType: "대학", role: "PARTICIPANT", budget: 1_500_000_000, feeRate: 2.0, calculatedFee: 30_000_000 },
  { id: "pm-029", projectId: "p-007", projectNumber: "RS-2023-00176431", institutionId: "inst-002", institutionName: "한국과학기술연구원", institutionType: "정부출연연구소", role: "PARTICIPANT", budget: 1_000_000_000, feeRate: 2.0, calculatedFee: 20_000_000 },
  { id: "pm-030", projectId: "p-007", projectNumber: "RS-2023-00176431", institutionId: "inst-007", institutionName: "부산대학교", institutionType: "대학", role: "PARTICIPANT", budget: 500_000_000, feeRate: 2.0, calculatedFee: 10_000_000 },
  { id: "pm-031", projectId: "p-007", projectNumber: "RS-2023-00176431", institutionId: "inst-003", institutionName: "(주)에너텍솔루션", institutionType: "중견기업", role: "PARTICIPANT", budget: 200_000_000, feeRate: 2.5, calculatedFee: 5_000_000 },
  { id: "pm-032", projectId: "p-007", projectNumber: "RS-2023-00176431", institutionId: "inst-011", institutionName: "하이테크머티리얼(주)", institutionType: "스타트업", role: "PARTICIPANT", budget: 200_000_000, feeRate: 2.5, calculatedFee: 5_000_000 },

  // p-008: 그린바이오텍 주관, 3개 기관
  { id: "pm-033", projectId: "p-008", projectNumber: "RS-2024-00219874", institutionId: "inst-008", institutionName: "그린바이오텍(주)", institutionType: "중소기업", role: "LEAD", budget: 1_100_000_000, feeRate: 3.0, calculatedFee: 33_000_000 },
  { id: "pm-034", projectId: "p-008", projectNumber: "RS-2024-00219874", institutionId: "inst-004", institutionName: "연세대학교", institutionType: "대학", role: "PARTICIPANT", budget: 350_000_000, feeRate: 2.0, calculatedFee: 7_000_000 },
  { id: "pm-035", projectId: "p-008", projectNumber: "RS-2024-00219874", institutionId: "inst-002", institutionName: "한국과학기술연구원", institutionType: "정부출연연구소", role: "PARTICIPANT", budget: 200_000_000, feeRate: 2.0, calculatedFee: 4_000_000 },

  // p-009: 삼화전자 주관, 3개 기관 (탄소섬유 — 완료 과제)
  { id: "pm-036", projectId: "p-009", projectNumber: "RS-2022-00158234", institutionId: "inst-007", institutionName: "부산대학교", institutionType: "대학", role: "LEAD", budget: 1_400_000_000, feeRate: 2.0, calculatedFee: 28_000_000 },
  { id: "pm-037", projectId: "p-009", projectNumber: "RS-2022-00158234", institutionId: "inst-002", institutionName: "한국과학기술연구원", institutionType: "정부출연연구소", role: "PARTICIPANT", budget: 500_000_000, feeRate: 2.0, calculatedFee: 10_000_000 },
  { id: "pm-038", projectId: "p-009", projectNumber: "RS-2022-00158234", institutionId: "inst-001", institutionName: "삼화전자(주)", institutionType: "중소기업", role: "PARTICIPANT", budget: 200_000_000, feeRate: 3.0, calculatedFee: 6_000_000 },

  // p-010: (주)에너텍솔루션 주관, 3개 기관 (전력반도체 — 완료 과제)
  { id: "pm-039", projectId: "p-010", projectNumber: "RS-2022-00162891", institutionId: "inst-011", institutionName: "하이테크머티리얼(주)", institutionType: "스타트업", role: "LEAD", budget: 2_000_000_000, feeRate: 2.5, calculatedFee: 50_000_000 },
  { id: "pm-040", projectId: "p-010", projectNumber: "RS-2022-00162891", institutionId: "inst-002", institutionName: "한국과학기술연구원", institutionType: "정부출연연구소", role: "PARTICIPANT", budget: 800_000_000, feeRate: 2.0, calculatedFee: 16_000_000 },
  { id: "pm-041", projectId: "p-010", projectNumber: "RS-2022-00162891", institutionId: "inst-003", institutionName: "(주)에너텍솔루션", institutionType: "중견기업", role: "PARTICIPANT", budget: 600_000_000, feeRate: 2.5, calculatedFee: 15_000_000 },
];

// ============================================================
// 기관 유형별 수수료 기준
// ============================================================

export interface CompanyClass {
  id: string;
  name: string;
  feeRate: number;
  criteria: string;
  projectCount: number;
  updatedAt: string;
}

export const companyClasses: CompanyClass[] = [
  { id: "cls-001", name: "대기업", feeRate: 2.0, criteria: "공정거래법상 상호출자제한기업집단 소속", projectCount: 0, updatedAt: "2024-07-01" },
  { id: "cls-002", name: "중견기업", feeRate: 2.5, criteria: "중견기업 성장촉진법상 중견기업", projectCount: 8, updatedAt: "2024-07-01" },
  { id: "cls-003", name: "중소기업", feeRate: 3.0, criteria: "중소기업기본법상 중소기업", projectCount: 14, updatedAt: "2024-07-01" },
  { id: "cls-004", name: "스타트업", feeRate: 2.5, criteria: "업력 7년 이하 중소기업 (창업기업)", projectCount: 4, updatedAt: "2024-07-01" },
  { id: "cls-005", name: "대학/연구소", feeRate: 2.0, criteria: "대학, 정부출연연구소, 공공기관", projectCount: 12, updatedAt: "2024-07-01" },
];

// ============================================================
// 수수료 정책 엔진
// ============================================================

export interface FeePolicy {
  id: string;
  name: string;
  version: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: "ACTIVE" | "EXPIRED" | "DRAFT";
  rates: Record<string, number>;
  description: string;
  createdAt: string;
  createdBy: string;
}

export const feePolicies: FeePolicy[] = [
  {
    id: "pol-003",
    name: "2024년 하반기 정책",
    version: "v2024.2",
    effectiveFrom: "2024-07-01",
    effectiveTo: null,
    status: "ACTIVE",
    rates: { 대기업: 2.0, 중견기업: 2.5, 중소기업: 3.0, 스타트업: 2.5, "대학/연구소": 2.0 },
    description: "중소기업 지원 강화를 위해 중소기업 요율 0.2%p 인상, 스타트업 요율 신설",
    createdAt: "2024-06-20",
    createdBy: "김관리",
  },
  {
    id: "pol-002",
    name: "2024년 상반기 정책",
    version: "v2024.1",
    effectiveFrom: "2024-01-01",
    effectiveTo: "2024-06-30",
    status: "EXPIRED",
    rates: { 대기업: 2.0, 중견기업: 2.5, 중소기업: 2.8, 스타트업: 2.5, "대학/연구소": 2.0 },
    description: "스타트업 분류 신설 및 대학/연구소 요율 통합",
    createdAt: "2023-12-15",
    createdBy: "김관리",
  },
  {
    id: "pol-001",
    name: "2023년 정책",
    version: "v2023.1",
    effectiveFrom: "2023-01-01",
    effectiveTo: "2023-12-31",
    status: "EXPIRED",
    rates: { 대기업: 2.0, 중견기업: 2.5, 중소기업: 2.8, 대학: 2.0, 연구소: 2.0 },
    description: "기존 4개 분류 체계 적용",
    createdAt: "2022-12-20",
    createdBy: "이회계",
  },
];

// ============================================================
// 연차별 수수료 산정 내역
// (참여기관별 수수료 계산 세부 내역 — 합산 후 주관기관에 청구)
// ============================================================

export interface TermFee {
  id: string;
  projectNumber: string;
  projectName: string;
  termYear: number;
  termNumber: number;
  institutionId: string;
  institutionName: string;
  institutionType: string;
  budget: number;
  feeRate: number; // 적용 요율 (%)
  calculatedFee: number; // 산정액 (budget × feeRate)
  appliedFee: number; // 최종 적용액 (협의 후 조정 가능)
  status: "DRAFT" | "CONFIRMED" | "BILLED"; // BILLED = 세금계산서 발행됨
}

export const termFees: TermFee[] = [
  // p-001 2연차 — 주관: 삼화전자, 청구액 합계 52M
  { id: "tf-001", projectNumber: "RS-2024-00214837", projectName: "초정밀 광학 센서 모듈 개발 및 양산화", termYear: 2024, termNumber: 2, institutionId: "inst-001", institutionName: "삼화전자(주)", institutionType: "중소기업", budget: 700_000_000, feeRate: 3.0, calculatedFee: 21_000_000, appliedFee: 21_000_000, status: "BILLED" },
  { id: "tf-002", projectNumber: "RS-2024-00214837", projectName: "초정밀 광학 센서 모듈 개발 및 양산화", termYear: 2024, termNumber: 2, institutionId: "inst-002", institutionName: "한국과학기술연구원", institutionType: "정부출연연구소", budget: 1_200_000_000, feeRate: 2.0, calculatedFee: 24_000_000, appliedFee: 24_000_000, status: "BILLED" },
  { id: "tf-003", projectNumber: "RS-2024-00214837", projectName: "초정밀 광학 센서 모듈 개발 및 양산화", termYear: 2024, termNumber: 2, institutionId: "inst-004", institutionName: "연세대학교", institutionType: "대학", budget: 500_000_000, feeRate: 2.0, calculatedFee: 10_000_000, appliedFee: 7_000_000, status: "BILLED" },
  { id: "tf-004", projectNumber: "RS-2024-00214837", projectName: "초정밀 광학 센서 모듈 개발 및 양산화", termYear: 2024, termNumber: 2, institutionId: "inst-005", institutionName: "나노소재기술(주)", institutionType: "스타트업", budget: 400_000_000, feeRate: 2.5, calculatedFee: 10_000_000, appliedFee: 0, status: "BILLED" },

  // p-002 1연차 — 주관: (주)에너텍솔루션, 청구액 합계 112.5M
  { id: "tf-005", projectNumber: "RS-2024-00198321", projectName: "차세대 이차전지 양극재 소재 국산화", termYear: 2024, termNumber: 1, institutionId: "inst-003", institutionName: "(주)에너텍솔루션", institutionType: "중견기업", budget: 1_500_000_000, feeRate: 2.5, calculatedFee: 37_500_000, appliedFee: 37_500_000, status: "BILLED" },
  { id: "tf-006", projectNumber: "RS-2024-00198321", projectName: "차세대 이차전지 양극재 소재 국산화", termYear: 2024, termNumber: 1, institutionId: "inst-004", institutionName: "연세대학교", institutionType: "대학", budget: 2_000_000_000, feeRate: 2.0, calculatedFee: 40_000_000, appliedFee: 40_000_000, status: "BILLED" },
  { id: "tf-007", projectNumber: "RS-2024-00198321", projectName: "차세대 이차전지 양극재 소재 국산화", termYear: 2024, termNumber: 1, institutionId: "inst-002", institutionName: "한국과학기술연구원", institutionType: "정부출연연구소", budget: 500_000_000, feeRate: 2.0, calculatedFee: 10_000_000, appliedFee: 10_000_000, status: "BILLED" },
  { id: "tf-008", projectNumber: "RS-2024-00198321", projectName: "차세대 이차전지 양극재 소재 국산화", termYear: 2024, termNumber: 1, institutionId: "inst-007", institutionName: "부산대학교", institutionType: "대학", budget: 300_000_000, feeRate: 2.0, calculatedFee: 6_000_000, appliedFee: 6_000_000, status: "BILLED" },
  { id: "tf-009", projectNumber: "RS-2024-00198321", projectName: "차세대 이차전지 양극재 소재 국산화", termYear: 2024, termNumber: 1, institutionId: "inst-010", institutionName: "(주)클린에너지솔루션", institutionType: "중견기업", budget: 100_000_000, feeRate: 2.5, calculatedFee: 2_500_000, appliedFee: 2_500_000, status: "BILLED" },
  { id: "tf-010", projectNumber: "RS-2024-00198321", projectName: "차세대 이차전지 양극재 소재 국산화", termYear: 2024, termNumber: 1, institutionId: "inst-011", institutionName: "하이테크머티리얼(주)", institutionType: "스타트업", budget: 100_000_000, feeRate: 2.5, calculatedFee: 2_500_000, appliedFee: 2_500_000, status: "BILLED" },

  // p-003 3연차 — 주관: 나노소재기술, 청구액 합계 22M
  { id: "tf-011", projectNumber: "RS-2024-00201547", projectName: "스마트 제조공정 AI 품질예측 시스템", termYear: 2024, termNumber: 3, institutionId: "inst-005", institutionName: "나노소재기술(주)", institutionType: "스타트업", budget: 600_000_000, feeRate: 2.5, calculatedFee: 15_000_000, appliedFee: 14_000_000, status: "CONFIRMED" },
  { id: "tf-012", projectNumber: "RS-2024-00201547", projectName: "스마트 제조공정 AI 품질예측 시스템", termYear: 2024, termNumber: 3, institutionId: "inst-002", institutionName: "한국과학기술연구원", institutionType: "정부출연연구소", budget: 400_000_000, feeRate: 2.0, calculatedFee: 8_000_000, appliedFee: 8_000_000, status: "CONFIRMED" },

  // p-004 2연차 — 주관: (주)에너텍솔루션, 청구액 합계 77.5M
  { id: "tf-013", projectNumber: "RS-2023-00187652", projectName: "바이오 플라스틱 생분해성 소재 개발", termYear: 2024, termNumber: 2, institutionId: "inst-004", institutionName: "연세대학교", institutionType: "대학", budget: 1_500_000_000, feeRate: 2.0, calculatedFee: 30_000_000, appliedFee: 30_000_000, status: "BILLED" },
  { id: "tf-014", projectNumber: "RS-2023-00187652", projectName: "바이오 플라스틱 생분해성 소재 개발", termYear: 2024, termNumber: 2, institutionId: "inst-003", institutionName: "(주)에너텍솔루션", institutionType: "중견기업", budget: 800_000_000, feeRate: 2.5, calculatedFee: 20_000_000, appliedFee: 20_000_000, status: "BILLED" },
  { id: "tf-015", projectNumber: "RS-2023-00187652", projectName: "바이오 플라스틱 생분해성 소재 개발", termYear: 2024, termNumber: 2, institutionId: "inst-008", institutionName: "그린바이오텍(주)", institutionType: "중소기업", budget: 500_000_000, feeRate: 3.0, calculatedFee: 15_000_000, appliedFee: 15_000_000, status: "BILLED" },
  { id: "tf-016", projectNumber: "RS-2023-00187652", projectName: "바이오 플라스틱 생분해성 소재 개발", termYear: 2024, termNumber: 2, institutionId: "inst-002", institutionName: "한국과학기술연구원", institutionType: "정부출연연구소", budget: 200_000_000, feeRate: 2.0, calculatedFee: 4_000_000, appliedFee: 4_000_000, status: "BILLED" },
  { id: "tf-017", projectNumber: "RS-2023-00187652", projectName: "바이오 플라스틱 생분해성 소재 개발", termYear: 2024, termNumber: 2, institutionId: "inst-007", institutionName: "부산대학교", institutionType: "대학", budget: 100_000_000, feeRate: 2.0, calculatedFee: 2_000_000, appliedFee: 2_000_000, status: "BILLED" },

  // p-005 1연차 — 주관: 삼화전자, DRAFT (미청구)
  { id: "tf-018", projectNumber: "RS-2024-00225198", projectName: "고효율 수소 연료전지 스택 성능 향상", termYear: 2024, termNumber: 1, institutionId: "inst-002", institutionName: "한국과학기술연구원", institutionType: "정부출연연구소", budget: 800_000_000, feeRate: 2.0, calculatedFee: 16_000_000, appliedFee: 16_000_000, status: "DRAFT" },
  { id: "tf-019", projectNumber: "RS-2024-00225198", projectName: "고효율 수소 연료전지 스택 성능 향상", termYear: 2024, termNumber: 1, institutionId: "inst-001", institutionName: "삼화전자(주)", institutionType: "중소기업", budget: 1_400_000_000, feeRate: 3.0, calculatedFee: 42_000_000, appliedFee: 42_000_000, status: "DRAFT" },

  // p-006 1연차 — 주관: (주)미래반도체
  { id: "tf-020", projectNumber: "RS-2024-00231087", projectName: "반도체 패키징 열관리 신소재 연구", termYear: 2024, termNumber: 1, institutionId: "inst-009", institutionName: "(주)미래반도체", institutionType: "중소기업", budget: 480_000_000, feeRate: 3.0, calculatedFee: 14_400_000, appliedFee: 14_400_000, status: "BILLED" },
  { id: "tf-021", projectNumber: "RS-2024-00231087", projectName: "반도체 패키징 열관리 신소재 연구", termYear: 2024, termNumber: 1, institutionId: "inst-005", institutionName: "나노소재기술(주)", institutionType: "스타트업", budget: 300_000_000, feeRate: 2.5, calculatedFee: 7_500_000, appliedFee: 7_500_000, status: "BILLED" },

  // p-007 3연차 — 주관: (주)한국항공우주
  { id: "tf-022", projectNumber: "RS-2023-00176431", projectName: "도심항공모빌리티(UAM) 경량화 구조재 개발", termYear: 2024, termNumber: 3, institutionId: "inst-006", institutionName: "(주)한국항공우주", institutionType: "중견기업", budget: 1_200_000_000, feeRate: 2.5, calculatedFee: 30_000_000, appliedFee: 30_000_000, status: "BILLED" },
  { id: "tf-023", projectNumber: "RS-2023-00176431", projectName: "도심항공모빌리티(UAM) 경량화 구조재 개발", termYear: 2024, termNumber: 3, institutionId: "inst-001", institutionName: "삼화전자(주)", institutionType: "중소기업", budget: 1_200_000_000, feeRate: 3.0, calculatedFee: 36_000_000, appliedFee: 36_000_000, status: "BILLED" },
  { id: "tf-024", projectNumber: "RS-2023-00176431", projectName: "도심항공모빌리티(UAM) 경량화 구조재 개발", termYear: 2024, termNumber: 3, institutionId: "inst-004", institutionName: "연세대학교", institutionType: "대학", budget: 1_500_000_000, feeRate: 2.0, calculatedFee: 30_000_000, appliedFee: 30_000_000, status: "CONFIRMED" },
  { id: "tf-025", projectNumber: "RS-2023-00176431", projectName: "도심항공모빌리티(UAM) 경량화 구조재 개발", termYear: 2024, termNumber: 3, institutionId: "inst-002", institutionName: "한국과학기술연구원", institutionType: "정부출연연구소", budget: 1_000_000_000, feeRate: 2.0, calculatedFee: 20_000_000, appliedFee: 20_000_000, status: "CONFIRMED" },

  // p-008 2연차 — 주관: 그린바이오텍, DRAFT
  { id: "tf-026", projectNumber: "RS-2024-00219874", projectName: "의료용 생체흡수성 임플란트 소재 개발", termYear: 2024, termNumber: 2, institutionId: "inst-008", institutionName: "그린바이오텍(주)", institutionType: "중소기업", budget: 1_100_000_000, feeRate: 3.0, calculatedFee: 33_000_000, appliedFee: 33_000_000, status: "DRAFT" },

  // p-001 1연차 2023 — 주관: 삼화전자 (61M 청구, 4M 미회수 → uc-003)
  { id: "tf-027", projectNumber: "RS-2024-00214837", projectName: "초정밀 광학 센서 모듈 개발 및 양산화", termYear: 2023, termNumber: 1, institutionId: "inst-001", institutionName: "삼화전자(주)", institutionType: "중소기업", budget: 700_000_000, feeRate: 3.0, calculatedFee: 21_000_000, appliedFee: 21_000_000, status: "BILLED" },
  { id: "tf-028", projectNumber: "RS-2024-00214837", projectName: "초정밀 광학 센서 모듈 개발 및 양산화", termYear: 2023, termNumber: 1, institutionId: "inst-002", institutionName: "한국과학기술연구원", institutionType: "정부출연연구소", budget: 1_200_000_000, feeRate: 2.0, calculatedFee: 24_000_000, appliedFee: 24_000_000, status: "BILLED" },
  { id: "tf-029", projectNumber: "RS-2024-00214837", projectName: "초정밀 광학 센서 모듈 개발 및 양산화", termYear: 2023, termNumber: 1, institutionId: "inst-004", institutionName: "연세대학교", institutionType: "대학", budget: 500_000_000, feeRate: 2.0, calculatedFee: 10_000_000, appliedFee: 10_000_000, status: "BILLED" },
  { id: "tf-030", projectNumber: "RS-2024-00214837", projectName: "초정밀 광학 센서 모듈 개발 및 양산화", termYear: 2023, termNumber: 1, institutionId: "inst-005", institutionName: "나노소재기술(주)", institutionType: "스타트업", budget: 400_000_000, feeRate: 2.5, calculatedFee: 10_000_000, appliedFee: 6_000_000, status: "BILLED" },

  // p-003 1연차 2022 — 주관: 나노소재기술 (27M 전액 납부)
  { id: "tf-031", projectNumber: "RS-2024-00201547", projectName: "스마트 제조공정 AI 품질예측 시스템", termYear: 2022, termNumber: 1, institutionId: "inst-005", institutionName: "나노소재기술(주)", institutionType: "스타트업", budget: 600_000_000, feeRate: 2.5, calculatedFee: 15_000_000, appliedFee: 15_000_000, status: "BILLED" },
  { id: "tf-032", projectNumber: "RS-2024-00201547", projectName: "스마트 제조공정 AI 품질예측 시스템", termYear: 2022, termNumber: 1, institutionId: "inst-002", institutionName: "한국과학기술연구원", institutionType: "정부출연연구소", budget: 400_000_000, feeRate: 2.0, calculatedFee: 8_000_000, appliedFee: 8_000_000, status: "BILLED" },
  { id: "tf-033", projectNumber: "RS-2024-00201547", projectName: "스마트 제조공정 AI 품질예측 시스템", termYear: 2022, termNumber: 1, institutionId: "inst-007", institutionName: "부산대학교", institutionType: "대학", budget: 200_000_000, feeRate: 2.0, calculatedFee: 4_000_000, appliedFee: 4_000_000, status: "BILLED" },

  // p-003 2연차 2023 — 주관: 나노소재기술 (26M 청구, 2M 미회수 → uc-004)
  { id: "tf-034", projectNumber: "RS-2024-00201547", projectName: "스마트 제조공정 AI 품질예측 시스템", termYear: 2023, termNumber: 2, institutionId: "inst-005", institutionName: "나노소재기술(주)", institutionType: "스타트업", budget: 600_000_000, feeRate: 2.5, calculatedFee: 15_000_000, appliedFee: 14_000_000, status: "BILLED" },
  { id: "tf-035", projectNumber: "RS-2024-00201547", projectName: "스마트 제조공정 AI 품질예측 시스템", termYear: 2023, termNumber: 2, institutionId: "inst-002", institutionName: "한국과학기술연구원", institutionType: "정부출연연구소", budget: 400_000_000, feeRate: 2.0, calculatedFee: 8_000_000, appliedFee: 8_000_000, status: "BILLED" },
  { id: "tf-036", projectNumber: "RS-2024-00201547", projectName: "스마트 제조공정 AI 품질예측 시스템", termYear: 2023, termNumber: 2, institutionId: "inst-007", institutionName: "부산대학교", institutionType: "대학", budget: 200_000_000, feeRate: 2.0, calculatedFee: 4_000_000, appliedFee: 4_000_000, status: "BILLED" },

  // p-008 1연차 2023 — 주관: 그린바이오텍 (44M 전액 납부)
  { id: "tf-037", projectNumber: "RS-2024-00219874", projectName: "의료용 생체흡수성 임플란트 소재 개발", termYear: 2023, termNumber: 1, institutionId: "inst-008", institutionName: "그린바이오텍(주)", institutionType: "중소기업", budget: 1_100_000_000, feeRate: 3.0, calculatedFee: 33_000_000, appliedFee: 33_000_000, status: "BILLED" },
  { id: "tf-038", projectNumber: "RS-2024-00219874", projectName: "의료용 생체흡수성 임플란트 소재 개발", termYear: 2023, termNumber: 1, institutionId: "inst-004", institutionName: "연세대학교", institutionType: "대학", budget: 350_000_000, feeRate: 2.0, calculatedFee: 7_000_000, appliedFee: 7_000_000, status: "BILLED" },
  { id: "tf-039", projectNumber: "RS-2024-00219874", projectName: "의료용 생체흡수성 임플란트 소재 개발", termYear: 2023, termNumber: 1, institutionId: "inst-002", institutionName: "한국과학기술연구원", institutionType: "정부출연연구소", budget: 200_000_000, feeRate: 2.0, calculatedFee: 4_000_000, appliedFee: 4_000_000, status: "BILLED" },

  // p-009 탄소섬유 — 1/2/3연차 (완료 과제)
  { id: "tf-040", projectNumber: "RS-2022-00158234", projectName: "탄소섬유 복합소재 고속 성형 기술 개발", termYear: 2022, termNumber: 1, institutionId: "inst-007", institutionName: "부산대학교", institutionType: "대학", budget: 1_400_000_000, feeRate: 2.0, calculatedFee: 28_000_000, appliedFee: 28_000_000, status: "BILLED" },
  { id: "tf-041", projectNumber: "RS-2022-00158234", projectName: "탄소섬유 복합소재 고속 성형 기술 개발", termYear: 2022, termNumber: 1, institutionId: "inst-002", institutionName: "한국과학기술연구원", institutionType: "정부출연연구소", budget: 500_000_000, feeRate: 2.0, calculatedFee: 10_000_000, appliedFee: 10_000_000, status: "BILLED" },
  { id: "tf-042", projectNumber: "RS-2022-00158234", projectName: "탄소섬유 복합소재 고속 성형 기술 개발", termYear: 2022, termNumber: 1, institutionId: "inst-001", institutionName: "삼화전자(주)", institutionType: "중소기업", budget: 200_000_000, feeRate: 3.0, calculatedFee: 6_000_000, appliedFee: 6_000_000, status: "BILLED" },
  { id: "tf-043", projectNumber: "RS-2022-00158234", projectName: "탄소섬유 복합소재 고속 성형 기술 개발", termYear: 2023, termNumber: 2, institutionId: "inst-007", institutionName: "부산대학교", institutionType: "대학", budget: 1_400_000_000, feeRate: 2.0, calculatedFee: 28_000_000, appliedFee: 28_000_000, status: "BILLED" },
  { id: "tf-044", projectNumber: "RS-2022-00158234", projectName: "탄소섬유 복합소재 고속 성형 기술 개발", termYear: 2023, termNumber: 2, institutionId: "inst-002", institutionName: "한국과학기술연구원", institutionType: "정부출연연구소", budget: 500_000_000, feeRate: 2.0, calculatedFee: 10_000_000, appliedFee: 10_000_000, status: "BILLED" },
  { id: "tf-045", projectNumber: "RS-2022-00158234", projectName: "탄소섬유 복합소재 고속 성형 기술 개발", termYear: 2023, termNumber: 2, institutionId: "inst-001", institutionName: "삼화전자(주)", institutionType: "중소기업", budget: 200_000_000, feeRate: 3.0, calculatedFee: 6_000_000, appliedFee: 6_000_000, status: "BILLED" },
  { id: "tf-046", projectNumber: "RS-2022-00158234", projectName: "탄소섬유 복합소재 고속 성형 기술 개발", termYear: 2024, termNumber: 3, institutionId: "inst-007", institutionName: "부산대학교", institutionType: "대학", budget: 1_400_000_000, feeRate: 2.0, calculatedFee: 28_000_000, appliedFee: 28_000_000, status: "BILLED" },
  { id: "tf-047", projectNumber: "RS-2022-00158234", projectName: "탄소섬유 복합소재 고속 성형 기술 개발", termYear: 2024, termNumber: 3, institutionId: "inst-002", institutionName: "한국과학기술연구원", institutionType: "정부출연연구소", budget: 200_000_000, feeRate: 2.0, calculatedFee: 4_000_000, appliedFee: 4_000_000, status: "BILLED" },
];

// ============================================================
// 미청구액 관리
// (주관기관 기준 — 해당 연차 수수료가 아직 청구되지 않은 건)
// ============================================================

export interface UnclaimedFee {
  id: string;
  projectNumber: string;
  projectName: string;
  leadInstitutionId: string;
  leadInstitutionName: string; // 주관기관 (청구 대상)
  termYear: number;
  termNumber: number;
  amount: number; // 미청구 총액
  occurredAt: string;
  carriedOver: boolean;
  status: "PENDING" | "CARRIED_OVER" | "RESOLVED";
}

export const unclaimedFees: UnclaimedFee[] = [
  {
    id: "uc-001",
    projectNumber: "RS-2024-00225198",
    projectName: "고효율 수소 연료전지 스택 성능 향상",
    leadInstitutionId: "inst-002",
    leadInstitutionName: "한국과학기술연구원",
    termYear: 2024,
    termNumber: 1,
    amount: 58_000_000,
    occurredAt: "2024-06-30",
    carriedOver: false,
    status: "PENDING",
  },
  {
    id: "uc-002",
    projectNumber: "RS-2024-00219874",
    projectName: "의료용 생체흡수성 임플란트 소재 개발",
    leadInstitutionId: "inst-008",
    leadInstitutionName: "그린바이오텍(주)",
    termYear: 2024,
    termNumber: 2,
    amount: 33_000_000,
    occurredAt: "2024-09-30",
    carriedOver: false,
    status: "PENDING",
  },
  {
    id: "uc-003",
    projectNumber: "RS-2024-00214837",
    projectName: "초정밀 광학 센서 모듈 개발 및 양산화",
    leadInstitutionId: "inst-001",
    leadInstitutionName: "삼화전자(주)",
    termYear: 2023,
    termNumber: 1,
    amount: 4_000_000,
    occurredAt: "2023-12-31",
    carriedOver: true,
    status: "CARRIED_OVER",
  },
  {
    id: "uc-004",
    projectNumber: "RS-2024-00201547",
    projectName: "스마트 제조공정 AI 품질예측 시스템",
    leadInstitutionId: "inst-005",
    leadInstitutionName: "나노소재기술(주)",
    termYear: 2023,
    termNumber: 2,
    amount: 2_000_000,
    occurredAt: "2023-09-30",
    carriedOver: true,
    status: "CARRIED_OVER",
  },
  {
    id: "uc-005",
    projectNumber: "RS-2022-00158234",
    projectName: "탄소섬유 복합소재 고속 성형 기술 개발",
    leadInstitutionId: "inst-007",
    leadInstitutionName: "부산대학교",
    termYear: 2022,
    termNumber: 1,
    amount: 6_000_000,
    occurredAt: "2022-12-31",
    carriedOver: false,
    status: "RESOLVED",
  },
];

// ============================================================
// 미수금/채권 관리
// (주관기관 기준 — 발행한 세금계산서의 미납 추적)
// ============================================================

export interface Receivable {
  id: string;
  invoiceNumber: string; // 연결된 세금계산서 번호
  projectNumber: string;
  projectName: string;
  termYear: number;
  termNumber: number;
  leadInstitutionId: string;
  leadInstitutionName: string; // 주관기관 (수금 대상)
  billedAt: string;
  billedAmount: number;
  paidAmount: number;
  receivableAmount: number;
  dueDate: string;
  status: "PENDING" | "OVERDUE" | "PAID" | "PARTIAL";
}

export const receivables: Receivable[] = [
  {
    id: "rv-001",
    invoiceNumber: "2024-04-00021",
    projectNumber: "RS-2024-00198321",
    projectName: "차세대 이차전지 양극재 소재 국산화",
    termYear: 2024,
    termNumber: 1,
    leadInstitutionId: "inst-003",
    leadInstitutionName: "(주)에너텍솔루션",
    billedAt: "2024-04-30",
    billedAmount: 112_500_000,
    paidAmount: 0,
    receivableAmount: 112_500_000,
    dueDate: "2024-05-31",
    status: "OVERDUE",
  },
  {
    id: "rv-002",
    invoiceNumber: "2024-10-00061",
    projectNumber: "RS-2023-00187652",
    projectName: "바이오 플라스틱 생분해성 소재 개발",
    termYear: 2024,
    termNumber: 2,
    leadInstitutionId: "inst-004",
    leadInstitutionName: "연세대학교",
    billedAt: "2024-10-15",
    billedAmount: 77_500_000,
    paidAmount: 38_750_000,
    receivableAmount: 38_750_000,
    dueDate: "2024-11-30",
    status: "PARTIAL",
  },
  {
    id: "rv-003",
    invoiceNumber: "2024-08-00041",
    projectNumber: "RS-2024-00214837",
    projectName: "초정밀 광학 센서 모듈 개발 및 양산화",
    termYear: 2024,
    termNumber: 2,
    leadInstitutionId: "inst-001",
    leadInstitutionName: "삼화전자(주)",
    billedAt: "2024-08-15",
    billedAmount: 52_000_000,
    paidAmount: 52_000_000,
    receivableAmount: 0,
    dueDate: "2024-09-15",
    status: "PAID",
  },
  {
    id: "rv-004",
    invoiceNumber: "2024-09-00055",
    projectNumber: "RS-2023-00176431",
    projectName: "도심항공모빌리티(UAM) 경량화 구조재 개발",
    termYear: 2024,
    termNumber: 3,
    leadInstitutionId: "inst-006",
    leadInstitutionName: "(주)한국항공우주",
    billedAt: "2024-09-20",
    billedAmount: 145_000_000,
    paidAmount: 145_000_000,
    receivableAmount: 0,
    dueDate: "2024-10-31",
    status: "PAID",
  },
  {
    id: "rv-005",
    invoiceNumber: "2024-07-00032",
    projectNumber: "RS-2024-00231087",
    projectName: "반도체 패키징 열관리 신소재 연구",
    termYear: 2024,
    termNumber: 1,
    leadInstitutionId: "inst-009",
    leadInstitutionName: "(주)미래반도체",
    billedAt: "2024-07-20",
    billedAmount: 21_900_000,
    paidAmount: 21_900_000,
    receivableAmount: 0,
    dueDate: "2024-08-31",
    status: "PAID",
  },
  // uc-003 연결 — RS-2024-00214837 1연차 2023 (4M 미회수 → 이월)
  {
    id: "rv-006",
    invoiceNumber: "2023-07-00031",
    projectNumber: "RS-2024-00214837",
    projectName: "초정밀 광학 센서 모듈 개발 및 양산화",
    termYear: 2023,
    termNumber: 1,
    leadInstitutionId: "inst-001",
    leadInstitutionName: "삼화전자(주)",
    billedAt: "2023-07-15",
    billedAmount: 65_000_000,
    paidAmount: 61_000_000,
    receivableAmount: 4_000_000,
    dueDate: "2023-08-31",
    status: "PARTIAL",
  },
  // uc-004 연결 — RS-2024-00201547 1연차 2022 (완납)
  {
    id: "rv-007",
    invoiceNumber: "2022-12-00015",
    projectNumber: "RS-2024-00201547",
    projectName: "스마트 제조공정 AI 품질예측 시스템",
    termYear: 2022,
    termNumber: 1,
    leadInstitutionId: "inst-005",
    leadInstitutionName: "나노소재기술(주)",
    billedAt: "2022-12-31",
    billedAmount: 27_000_000,
    paidAmount: 27_000_000,
    receivableAmount: 0,
    dueDate: "2023-01-31",
    status: "PAID",
  },
  // uc-004 연결 — RS-2024-00201547 2연차 2023 (2M 미회수 → 이월)
  {
    id: "rv-008",
    invoiceNumber: "2023-12-00092",
    projectNumber: "RS-2024-00201547",
    projectName: "스마트 제조공정 AI 품질예측 시스템",
    termYear: 2023,
    termNumber: 2,
    leadInstitutionId: "inst-005",
    leadInstitutionName: "나노소재기술(주)",
    billedAt: "2023-12-28",
    billedAmount: 26_000_000,
    paidAmount: 24_000_000,
    receivableAmount: 2_000_000,
    dueDate: "2024-01-31",
    status: "PARTIAL",
  },
  // uc-002 연결 — RS-2024-00219874 1연차 2023 (완납)
  {
    id: "rv-009",
    invoiceNumber: "2023-12-00095",
    projectNumber: "RS-2024-00219874",
    projectName: "의료용 생체흡수성 임플란트 소재 개발",
    termYear: 2023,
    termNumber: 1,
    leadInstitutionId: "inst-008",
    leadInstitutionName: "그린바이오텍(주)",
    billedAt: "2023-12-31",
    billedAmount: 44_000_000,
    paidAmount: 44_000_000,
    receivableAmount: 0,
    dueDate: "2024-01-31",
    status: "PAID",
  },
  // uc-005 연결 — RS-2022-00158234 1연차 2022 (6M 연체 후 해소)
  {
    id: "rv-010",
    invoiceNumber: "2022-12-00018",
    projectNumber: "RS-2022-00158234",
    projectName: "탄소섬유 복합소재 고속 성형 기술 개발",
    termYear: 2022,
    termNumber: 1,
    leadInstitutionId: "inst-007",
    leadInstitutionName: "부산대학교",
    billedAt: "2022-12-31",
    billedAmount: 53_200_000,
    paidAmount: 53_200_000,
    receivableAmount: 0,
    dueDate: "2023-01-31",
    status: "PAID",
  },
  // RS-2022-00158234 2연차 2023 (완납)
  {
    id: "rv-011",
    invoiceNumber: "2023-06-00042",
    projectNumber: "RS-2022-00158234",
    projectName: "탄소섬유 복합소재 고속 성형 기술 개발",
    termYear: 2023,
    termNumber: 2,
    leadInstitutionId: "inst-007",
    leadInstitutionName: "부산대학교",
    billedAt: "2023-06-30",
    billedAmount: 53_200_000,
    paidAmount: 53_200_000,
    receivableAmount: 0,
    dueDate: "2023-07-31",
    status: "PAID",
  },
  // RS-2022-00158234 3연차 2024 — ti-006 연결 (완납)
  {
    id: "rv-012",
    invoiceNumber: "2023-12-00098",
    projectNumber: "RS-2022-00158234",
    projectName: "탄소섬유 복합소재 고속 성형 기술 개발",
    termYear: 2024,
    termNumber: 3,
    leadInstitutionId: "inst-007",
    leadInstitutionName: "부산대학교",
    billedAt: "2023-12-20",
    billedAmount: 44_000_000,
    paidAmount: 44_000_000,
    receivableAmount: 0,
    dueDate: "2024-01-20",
    status: "PAID",
  },
  // RS-2023-00187652 에너텍 1연차 2023 (완납)
  {
    id: "rv-013",
    invoiceNumber: "2023-10-00071",
    projectNumber: "RS-2023-00187652",
    projectName: "바이오 플라스틱 생분해성 소재 개발",
    termYear: 2023,
    termNumber: 1,
    leadInstitutionId: "inst-004",
    leadInstitutionName: "연세대학교",
    billedAt: "2023-10-20",
    billedAmount: 74_500_000,
    paidAmount: 74_500_000,
    receivableAmount: 0,
    dueDate: "2023-11-30",
    status: "PAID",
  },
  // RS-2023-00176431 한국항공우주 1연차 2022 (완납)
  {
    id: "rv-014",
    invoiceNumber: "2022-09-00011",
    projectNumber: "RS-2023-00176431",
    projectName: "도심항공모빌리티(UAM) 경량화 구조재 개발",
    termYear: 2022,
    termNumber: 1,
    leadInstitutionId: "inst-006",
    leadInstitutionName: "(주)한국항공우주",
    billedAt: "2022-09-30",
    billedAmount: 136_000_000,
    paidAmount: 136_000_000,
    receivableAmount: 0,
    dueDate: "2022-10-31",
    status: "PAID",
  },
  // RS-2023-00176431 한국항공우주 2연차 2023 (완납)
  {
    id: "rv-015",
    invoiceNumber: "2023-09-00051",
    projectNumber: "RS-2023-00176431",
    projectName: "도심항공모빌리티(UAM) 경량화 구조재 개발",
    termYear: 2023,
    termNumber: 2,
    leadInstitutionId: "inst-006",
    leadInstitutionName: "(주)한국항공우주",
    billedAt: "2023-09-25",
    billedAmount: 140_000_000,
    paidAmount: 140_000_000,
    receivableAmount: 0,
    dueDate: "2023-10-31",
    status: "PAID",
  },
];

// ============================================================
// 정산 관리
// (연구비 정산 — 기관별로 정부에 연구비 사용 실적 정산)
// ============================================================

export interface Settlement {
  id: string;
  projectNumber: string;
  projectName: string;
  termYear: number;
  institutionId: string;
  institutionName: string; // 정산 기관 (기관별 연구비 정산)
  isLead: boolean; // 주관기관 여부
  settlementAmount: number; // 정산 연구비
  additionalAmount: number; // 추가 지급액
  feeAmount: number; // 해당 기관 분담 수수료
  scheduledAmount: number; // 지급 예정액 (= settlementAmount + additionalAmount - feeAmount)
  paidAt: string | null;
  status: "SCHEDULED" | "PAID" | "PENDING";
}

export const settlements: Settlement[] = [
  {
    id: "st-001",
    projectNumber: "RS-2024-00214837",
    projectName: "초정밀 광학 센서 모듈 개발 및 양산화",
    termYear: 2024,
    institutionId: "inst-001",
    institutionName: "삼화전자(주)",
    isLead: true,
    settlementAmount: 680_000_000,
    additionalAmount: 20_000_000,
    feeAmount: 21_000_000,
    scheduledAmount: 679_000_000,
    paidAt: "2024-10-31",
    status: "PAID",
  },
  {
    id: "st-002",
    projectNumber: "RS-2024-00198321",
    projectName: "차세대 이차전지 양극재 소재 국산화",
    termYear: 2024,
    institutionId: "inst-003",
    institutionName: "(주)에너텍솔루션",
    isLead: true,
    settlementAmount: 1_500_000_000,
    additionalAmount: 0,
    feeAmount: 37_500_000,
    scheduledAmount: 1_462_500_000,
    paidAt: null,
    status: "SCHEDULED",
  },
  {
    id: "st-003",
    projectNumber: "RS-2024-00198321",
    projectName: "차세대 이차전지 양극재 소재 국산화",
    termYear: 2024,
    institutionId: "inst-004",
    institutionName: "연세대학교",
    isLead: false,
    settlementAmount: 2_000_000_000,
    additionalAmount: 0,
    feeAmount: 0,
    scheduledAmount: 2_000_000_000,
    paidAt: null,
    status: "SCHEDULED",
  },
  {
    id: "st-004",
    projectNumber: "RS-2023-00187652",
    projectName: "바이오 플라스틱 생분해성 소재 개발",
    termYear: 2024,
    institutionId: "inst-004",
    institutionName: "연세대학교",
    isLead: true,
    settlementAmount: 1_500_000_000,
    additionalAmount: 50_000_000,
    feeAmount: 37_500_000,
    scheduledAmount: 1_512_500_000,
    paidAt: null,
    status: "PENDING",
  },
  {
    id: "st-005",
    projectNumber: "RS-2023-00176431",
    projectName: "도심항공모빌리티(UAM) 경량화 구조재 개발",
    termYear: 2024,
    institutionId: "inst-006",
    institutionName: "(주)한국항공우주",
    isLead: true,
    settlementAmount: 1_200_000_000,
    additionalAmount: 0,
    feeAmount: 30_000_000,
    scheduledAmount: 1_170_000_000,
    paidAt: "2024-11-15",
    status: "PAID",
  },
  {
    id: "st-006",
    projectNumber: "RS-2024-00231087",
    projectName: "반도체 패키징 열관리 신소재 연구",
    termYear: 2024,
    institutionId: "inst-009",
    institutionName: "(주)미래반도체",
    isLead: true,
    settlementAmount: 480_000_000,
    additionalAmount: 0,
    feeAmount: 14_400_000,
    scheduledAmount: 465_600_000,
    paidAt: "2024-10-01",
    status: "PAID",
  },
  // 과거 연차 정산
  {
    id: "st-007",
    projectNumber: "RS-2024-00214837",
    projectName: "초정밀 광학 센서 모듈 개발 및 양산화",
    termYear: 2023,
    institutionId: "inst-001",
    institutionName: "삼화전자(주)",
    isLead: true,
    settlementAmount: 680_000_000,
    additionalAmount: 0,
    feeAmount: 21_000_000,
    scheduledAmount: 659_000_000,
    paidAt: "2023-10-15",
    status: "PAID",
  },
  {
    id: "st-008",
    projectNumber: "RS-2024-00201547",
    projectName: "스마트 제조공정 AI 품질예측 시스템",
    termYear: 2022,
    institutionId: "inst-005",
    institutionName: "나노소재기술(주)",
    isLead: true,
    settlementAmount: 580_000_000,
    additionalAmount: 0,
    feeAmount: 15_000_000,
    scheduledAmount: 565_000_000,
    paidAt: "2023-02-28",
    status: "PAID",
  },
  {
    id: "st-009",
    projectNumber: "RS-2024-00201547",
    projectName: "스마트 제조공정 AI 품질예측 시스템",
    termYear: 2023,
    institutionId: "inst-005",
    institutionName: "나노소재기술(주)",
    isLead: true,
    settlementAmount: 580_000_000,
    additionalAmount: 0,
    feeAmount: 14_000_000,
    scheduledAmount: 566_000_000,
    paidAt: "2024-02-29",
    status: "PAID",
  },
  {
    id: "st-010",
    projectNumber: "RS-2024-00201547",
    projectName: "스마트 제조공정 AI 품질예측 시스템",
    termYear: 2024,
    institutionId: "inst-005",
    institutionName: "나노소재기술(주)",
    isLead: true,
    settlementAmount: 580_000_000,
    additionalAmount: 0,
    feeAmount: 14_000_000,
    scheduledAmount: 566_000_000,
    paidAt: null,
    status: "SCHEDULED",
  },
  {
    id: "st-011",
    projectNumber: "RS-2024-00219874",
    projectName: "의료용 생체흡수성 임플란트 소재 개발",
    termYear: 2023,
    institutionId: "inst-008",
    institutionName: "그린바이오텍(주)",
    isLead: true,
    settlementAmount: 1_050_000_000,
    additionalAmount: 0,
    feeAmount: 33_000_000,
    scheduledAmount: 1_017_000_000,
    paidAt: "2024-03-15",
    status: "PAID",
  },
  {
    id: "st-012",
    projectNumber: "RS-2022-00158234",
    projectName: "탄소섬유 복합소재 고속 성형 기술 개발",
    termYear: 2024,
    institutionId: "inst-007",
    institutionName: "부산대학교",
    isLead: true,
    settlementAmount: 1_350_000_000,
    additionalAmount: 30_000_000,
    feeAmount: 40_000_000,
    scheduledAmount: 1_340_000_000,
    paidAt: "2024-12-20",
    status: "PAID",
  },
  {
    id: "st-013",
    projectNumber: "RS-2024-00214837",
    projectName: "초정밀 광학 센서 모듈 개발 및 양산화",
    termYear: 2023,
    institutionId: "inst-002",
    institutionName: "한국과학기술연구원",
    isLead: false,
    settlementAmount: 1_180_000_000,
    additionalAmount: 0,
    feeAmount: 0,
    scheduledAmount: 1_180_000_000,
    paidAt: "2023-11-30",
    status: "PAID",
  },
  {
    id: "st-014",
    projectNumber: "RS-2024-00214837",
    projectName: "초정밀 광학 센서 모듈 개발 및 양산화",
    termYear: 2024,
    institutionId: "inst-002",
    institutionName: "한국과학기술연구원",
    isLead: false,
    settlementAmount: 1_180_000_000,
    additionalAmount: 0,
    feeAmount: 0,
    scheduledAmount: 1_180_000_000,
    paidAt: null,
    status: "SCHEDULED",
  },
  {
    id: "st-015",
    projectNumber: "RS-2023-00176431",
    projectName: "도심항공모빌리티(UAM) 경량화 구조재 개발",
    termYear: 2022,
    institutionId: "inst-006",
    institutionName: "(주)한국항공우주",
    isLead: true,
    settlementAmount: 1_180_000_000,
    additionalAmount: 0,
    feeAmount: 30_000_000,
    scheduledAmount: 1_150_000_000,
    paidAt: "2022-11-30",
    status: "PAID",
  },
  {
    id: "st-016",
    projectNumber: "RS-2023-00176431",
    projectName: "도심항공모빌리티(UAM) 경량화 구조재 개발",
    termYear: 2023,
    institutionId: "inst-006",
    institutionName: "(주)한국항공우주",
    isLead: true,
    settlementAmount: 1_180_000_000,
    additionalAmount: 0,
    feeAmount: 30_000_000,
    scheduledAmount: 1_150_000_000,
    paidAt: "2023-11-25",
    status: "PAID",
  },
];

// ============================================================
// 세금계산서 관리
// (주관기관 앞으로 과제·연차 단위 1건 발행)
// ============================================================

export interface TaxInvoice {
  id: string;
  invoiceNumber: string;
  projectNumber: string;
  projectName: string;
  termYear: number;
  termNumber: number;
  leadInstitutionId: string;
  leadInstitutionName: string; // 주관기관 (세금계산서 수신자)
  issuedAt: string;
  supplyAmount: number; // 공급가액 (참여기관 수수료 합산)
  taxAmount: number; // 부가세 (10%)
  totalAmount: number;
  status: "ISSUED" | "MODIFIED" | "CANCELED";
}

export const taxInvoices: TaxInvoice[] = [
  {
    id: "ti-001",
    invoiceNumber: "2024-08-00041",
    projectNumber: "RS-2024-00214837",
    projectName: "초정밀 광학 센서 모듈 개발 및 양산화",
    termYear: 2024,
    termNumber: 2,
    leadInstitutionId: "inst-001",
    leadInstitutionName: "삼화전자(주)",
    issuedAt: "2024-08-15",
    supplyAmount: 52_000_000,
    taxAmount: 5_200_000,
    totalAmount: 57_200_000,
    status: "ISSUED",
  },
  {
    id: "ti-002",
    invoiceNumber: "2024-04-00021",
    projectNumber: "RS-2024-00198321",
    projectName: "차세대 이차전지 양극재 소재 국산화",
    termYear: 2024,
    termNumber: 1,
    leadInstitutionId: "inst-003",
    leadInstitutionName: "(주)에너텍솔루션",
    issuedAt: "2024-04-30",
    supplyAmount: 112_500_000,
    taxAmount: 11_250_000,
    totalAmount: 123_750_000,
    status: "ISSUED",
  },
  {
    id: "ti-003",
    invoiceNumber: "2024-10-00061",
    projectNumber: "RS-2023-00187652",
    projectName: "바이오 플라스틱 생분해성 소재 개발",
    termYear: 2024,
    termNumber: 2,
    leadInstitutionId: "inst-004",
    leadInstitutionName: "연세대학교",
    issuedAt: "2024-10-15",
    supplyAmount: 77_500_000,
    taxAmount: 7_750_000,
    totalAmount: 85_250_000,
    status: "ISSUED",
  },
  {
    id: "ti-004",
    invoiceNumber: "2024-09-00055",
    projectNumber: "RS-2023-00176431",
    projectName: "도심항공모빌리티(UAM) 경량화 구조재 개발",
    termYear: 2024,
    termNumber: 3,
    leadInstitutionId: "inst-006",
    leadInstitutionName: "(주)한국항공우주",
    issuedAt: "2024-09-20",
    supplyAmount: 145_000_000,
    taxAmount: 14_500_000,
    totalAmount: 159_500_000,
    status: "ISSUED",
  },
  {
    id: "ti-005",
    invoiceNumber: "2024-07-00032",
    projectNumber: "RS-2024-00231087",
    projectName: "반도체 패키징 열관리 신소재 연구",
    termYear: 2024,
    termNumber: 1,
    leadInstitutionId: "inst-009",
    leadInstitutionName: "(주)미래반도체",
    issuedAt: "2024-07-20",
    supplyAmount: 21_900_000,
    taxAmount: 2_190_000,
    totalAmount: 24_090_000,
    status: "ISSUED",
  },
  {
    id: "ti-006",
    invoiceNumber: "2023-12-00098",
    projectNumber: "RS-2022-00158234",
    projectName: "탄소섬유 복합소재 고속 성형 기술 개발",
    termYear: 2023,
    termNumber: 3,
    leadInstitutionId: "inst-007",
    leadInstitutionName: "부산대학교",
    issuedAt: "2023-12-20",
    supplyAmount: 44_000_000,
    taxAmount: 4_400_000,
    totalAmount: 48_400_000,
    status: "MODIFIED",
  },
  {
    id: "ti-007",
    invoiceNumber: "2023-06-00043",
    projectNumber: "RS-2022-00162891",
    projectName: "차량용 전력반도체 소자 국산화",
    termYear: 2023,
    termNumber: 1,
    leadInstitutionId: "inst-011",
    leadInstitutionName: "하이테크머티리얼(주)",
    issuedAt: "2023-06-30",
    supplyAmount: 68_000_000,
    taxAmount: 6_800_000,
    totalAmount: 74_800_000,
    status: "CANCELED",
  },
  // 과거 연차 세금계산서
  {
    id: "ti-008",
    invoiceNumber: "2023-07-00031",
    projectNumber: "RS-2024-00214837",
    projectName: "초정밀 광학 센서 모듈 개발 및 양산화",
    termYear: 2023,
    termNumber: 1,
    leadInstitutionId: "inst-001",
    leadInstitutionName: "삼화전자(주)",
    issuedAt: "2023-07-15",
    supplyAmount: 65_000_000,
    taxAmount: 6_500_000,
    totalAmount: 71_500_000,
    status: "ISSUED",
  },
  {
    id: "ti-009",
    invoiceNumber: "2022-12-00015",
    projectNumber: "RS-2024-00201547",
    projectName: "스마트 제조공정 AI 품질예측 시스템",
    termYear: 2022,
    termNumber: 1,
    leadInstitutionId: "inst-005",
    leadInstitutionName: "나노소재기술(주)",
    issuedAt: "2022-12-31",
    supplyAmount: 27_000_000,
    taxAmount: 2_700_000,
    totalAmount: 29_700_000,
    status: "ISSUED",
  },
  {
    id: "ti-010",
    invoiceNumber: "2023-12-00092",
    projectNumber: "RS-2024-00201547",
    projectName: "스마트 제조공정 AI 품질예측 시스템",
    termYear: 2023,
    termNumber: 2,
    leadInstitutionId: "inst-005",
    leadInstitutionName: "나노소재기술(주)",
    issuedAt: "2023-12-28",
    supplyAmount: 26_000_000,
    taxAmount: 2_600_000,
    totalAmount: 28_600_000,
    status: "ISSUED",
  },
  {
    id: "ti-011",
    invoiceNumber: "2023-12-00095",
    projectNumber: "RS-2024-00219874",
    projectName: "의료용 생체흡수성 임플란트 소재 개발",
    termYear: 2023,
    termNumber: 1,
    leadInstitutionId: "inst-008",
    leadInstitutionName: "그린바이오텍(주)",
    issuedAt: "2023-12-31",
    supplyAmount: 44_000_000,
    taxAmount: 4_400_000,
    totalAmount: 48_400_000,
    status: "ISSUED",
  },
  {
    id: "ti-012",
    invoiceNumber: "2022-12-00018",
    projectNumber: "RS-2022-00158234",
    projectName: "탄소섬유 복합소재 고속 성형 기술 개발",
    termYear: 2022,
    termNumber: 1,
    leadInstitutionId: "inst-007",
    leadInstitutionName: "부산대학교",
    issuedAt: "2022-12-31",
    supplyAmount: 53_200_000,
    taxAmount: 5_320_000,
    totalAmount: 58_520_000,
    status: "ISSUED",
  },
  {
    id: "ti-013",
    invoiceNumber: "2023-06-00042",
    projectNumber: "RS-2022-00158234",
    projectName: "탄소섬유 복합소재 고속 성형 기술 개발",
    termYear: 2023,
    termNumber: 2,
    leadInstitutionId: "inst-007",
    leadInstitutionName: "부산대학교",
    issuedAt: "2023-06-30",
    supplyAmount: 53_200_000,
    taxAmount: 5_320_000,
    totalAmount: 58_520_000,
    status: "ISSUED",
  },
  {
    id: "ti-014",
    invoiceNumber: "2023-10-00071",
    projectNumber: "RS-2023-00187652",
    projectName: "바이오 플라스틱 생분해성 소재 개발",
    termYear: 2023,
    termNumber: 1,
    leadInstitutionId: "inst-004",
    leadInstitutionName: "연세대학교",
    issuedAt: "2023-10-20",
    supplyAmount: 74_500_000,
    taxAmount: 7_450_000,
    totalAmount: 81_950_000,
    status: "ISSUED",
  },
  {
    id: "ti-015",
    invoiceNumber: "2022-09-00011",
    projectNumber: "RS-2023-00176431",
    projectName: "도심항공모빌리티(UAM) 경량화 구조재 개발",
    termYear: 2022,
    termNumber: 1,
    leadInstitutionId: "inst-006",
    leadInstitutionName: "(주)한국항공우주",
    issuedAt: "2022-09-30",
    supplyAmount: 136_000_000,
    taxAmount: 13_600_000,
    totalAmount: 149_600_000,
    status: "ISSUED",
  },
  {
    id: "ti-016",
    invoiceNumber: "2023-09-00051",
    projectNumber: "RS-2023-00176431",
    projectName: "도심항공모빌리티(UAM) 경량화 구조재 개발",
    termYear: 2023,
    termNumber: 2,
    leadInstitutionId: "inst-006",
    leadInstitutionName: "(주)한국항공우주",
    issuedAt: "2023-09-25",
    supplyAmount: 140_000_000,
    taxAmount: 14_000_000,
    totalAmount: 154_000_000,
    status: "ISSUED",
  },
];

// ============================================================
// 이메일 발송 관리
// ============================================================

export interface EmailDispatch {
  id: string;
  batchId: string;
  sentAt: string;
  recipientInstitution: string;
  recipientEmail: string;
  subject: string;
  status: "SUCCESS" | "FAILED" | "PENDING";
}

export const emailDispatches: EmailDispatch[] = [
  { id: "em-001", batchId: "BATCH-2024-1115", sentAt: "2024-11-15 09:10", recipientInstitution: "삼화전자(주)", recipientEmail: "lee.ys@samhwa.co.kr", subject: "[RS-2024-00214837] 2연차 수수료 산출 내역 안내", status: "SUCCESS" },
  { id: "em-002", batchId: "BATCH-2024-1115", sentAt: "2024-11-15 09:11", recipientInstitution: "(주)에너텍솔루션", recipientEmail: "kim.mj@enertech.co.kr", subject: "[RS-2023-00187652] 2연차 수수료 산출 내역 안내", status: "SUCCESS" },
  { id: "em-003", batchId: "BATCH-2024-1115", sentAt: "2024-11-15 09:11", recipientInstitution: "(주)에너텍솔루션", recipientEmail: "kim.mj@enertech.co.kr", subject: "[RS-2024-00198321] 1연차 수수료 미납 재안내", status: "FAILED" },
  { id: "em-004", batchId: "BATCH-2024-1010", sentAt: "2024-10-10 14:20", recipientInstitution: "(주)한국항공우주", recipientEmail: "yoon.sj@kaitech.co.kr", subject: "[RS-2023-00176431] 3연차 수수료 산출 내역 안내", status: "SUCCESS" },
  { id: "em-005", batchId: "BATCH-2024-0825", sentAt: "2024-08-25 10:05", recipientInstitution: "(주)미래반도체", recipientEmail: "choi.jw@futuresemi.co.kr", subject: "[RS-2024-00231087] 1연차 수수료 산출 내역 안내", status: "SUCCESS" },
  { id: "em-006", batchId: "BATCH-2024-0825", sentAt: "2024-08-25 10:06", recipientInstitution: "삼화전자(주)", recipientEmail: "lee.ys@samhwa.co.kr", subject: "[RS-2024-00214837] 2연차 수수료 산출 내역 안내", status: "SUCCESS" },
  { id: "em-007", batchId: "BATCH-2024-0501", sentAt: "2024-05-01 09:00", recipientInstitution: "나노소재기술(주)", recipientEmail: "kang.hw@nanomat.co.kr", subject: "[RS-2024-00201547] 3연차 수수료 산출 내역 안내", status: "SUCCESS" },
  { id: "em-008", batchId: "BATCH-2024-0501", sentAt: "2024-05-01 09:00", recipientInstitution: "그린바이오텍(주)", recipientEmail: "lim.sa@greenbiotech.co.kr", subject: "[RS-2024-00219874] 2연차 수수료 사전 안내", status: "FAILED" },
  { id: "em-009", batchId: "BATCH-2024-1201", sentAt: "2024-12-01 08:30", recipientInstitution: "삼화전자(주)", recipientEmail: "lee.ys@samhwa.co.kr", subject: "[RS-2024-00225198] 1연차 미청구 수수료 청구 예정 안내", status: "PENDING" },
  { id: "em-010", batchId: "BATCH-2024-1201", sentAt: "2024-12-01 08:30", recipientInstitution: "그린바이오텍(주)", recipientEmail: "lim.sa@greenbiotech.co.kr", subject: "[RS-2024-00219874] 2연차 미청구 수수료 청구 예정 안내", status: "PENDING" },
];

// ============================================================
// 정책 변경 이력
// ============================================================

export interface PolicyHistoryEntry {
  id: string;
  version: string;
  changedAt: string;
  changedBy: string;
  changeType: "CREATED" | "UPDATED" | "ROLLBACK";
  changeSummary: string;
  reason: string;
  affectedProjects: number;
}

export const policyHistory: PolicyHistoryEntry[] = [
  { id: "ph-001", version: "v2024.2", changedAt: "2024-06-20 15:30", changedBy: "김관리", changeType: "CREATED", changeSummary: "중소기업 2.8% → 3.0%, 스타트업 분류 신설 2.5%", reason: "중소기업 R&D 지원 강화 정책 반영 및 스타트업 기업 유형 분리", affectedProjects: 8 },
  { id: "ph-002", version: "v2024.1", changedAt: "2023-12-15 11:00", changedBy: "김관리", changeType: "CREATED", changeSummary: "스타트업 분류 신설, 대학/연구소 통합 2.0%", reason: "창업기업 지원 확대 및 대학·연구소 구분 통합 간소화", affectedProjects: 12 },
  { id: "ph-003", version: "v2023.1", changedAt: "2022-12-20 09:00", changedBy: "이회계", changeType: "CREATED", changeSummary: "기존 4개 분류 체계 (대기업 2.0%, 중견 2.5%, 중소 2.8%, 대학 2.0%)", reason: "신규 ERP 시스템 도입에 따른 최초 정책 등록", affectedProjects: 6 },
  { id: "ph-004", version: "v2024.2", changedAt: "2024-07-05 10:15", changedBy: "이회계", changeType: "UPDATED", changeSummary: "연구소 요율 2.0% → 2.2% 수정 (오타 정정)", reason: "정책 등록 시 오기 수정", affectedProjects: 5 },
  { id: "ph-005", version: "v2024.2", changedAt: "2024-07-06 14:00", changedBy: "김관리", changeType: "ROLLBACK", changeSummary: "연구소 요율 2.2% → 2.0% 롤백", reason: "관련 부서 확인 결과 원안(2.0%)이 정확한 수치로 확인되어 롤백", affectedProjects: 5 },
  { id: "ph-006", version: "v2024.1", changedAt: "2024-01-10 09:30", changedBy: "박정산", changeType: "UPDATED", changeSummary: "중견기업 요율 설명 문구 수정", reason: "기업 분류 판단 기준 문구 명확화 (요율 변경 없음)", affectedProjects: 0 },
];

// ============================================================
// 사용자/권한 관리
// ============================================================

export interface SystemUser {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "ACCOUNTANT" | "SETTLEMENT" | "VIEWER";
  status: "ACTIVE" | "INACTIVE";
  lastLoginAt: string | null;
  registeredAt: string;
}

export const systemUsers: SystemUser[] = [
  { id: "u-001", name: "김관리", email: "admin@samhwa.co.kr", role: "ADMIN", status: "ACTIVE", lastLoginAt: "2024-12-10 09:32", registeredAt: "2022-01-01" },
  { id: "u-002", name: "이회계", email: "lee.acc@samhwa.co.kr", role: "ACCOUNTANT", status: "ACTIVE", lastLoginAt: "2024-12-09 17:45", registeredAt: "2022-01-15" },
  { id: "u-003", name: "박정산", email: "park.set@samhwa.co.kr", role: "SETTLEMENT", status: "ACTIVE", lastLoginAt: "2024-12-10 08:10", registeredAt: "2022-03-01" },
  { id: "u-004", name: "최담당", email: "choi.view@samhwa.co.kr", role: "VIEWER", status: "ACTIVE", lastLoginAt: "2024-11-28 14:22", registeredAt: "2023-06-01" },
  { id: "u-005", name: "정수정", email: "jung.acc@samhwa.co.kr", role: "ACCOUNTANT", status: "INACTIVE", lastLoginAt: "2024-09-05 11:00", registeredAt: "2022-09-01" },
];
