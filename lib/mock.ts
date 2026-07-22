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
    agency: "한국산업기술기획평가원",
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
    agency: "정보통신기획평가원",
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
    agency: "한국임업진흥원",
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
    agency: "한국산업기술기획평가원",
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
    agency: "농촌진흥청",
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
    agency: "농촌진흥청",
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
  billedFee: 428_600_000,
  unclaimed: 97_000_000,
  receivable: 151_250_000,
  collected: 277_350_000,
  totalFeeChange: "+12.4%",
  billedChange: "+8.5%",
  unclaimedChange: "+5.3%",
  receivableChange: "+3.1%",
  collectedChange: "+15.2%",
};

export const agencyBreakdown = [
  { name: "한국산업기술기획평가원", fee: 213_200_000, rate: 37 },
  { name: "한국에너지기술평가원", fee: 156_500_000, rate: 27 },
  { name: "한국임업진흥원", fee: 92_800_000, rate: 16 },
  { name: "정보통신기획평가원", fee: 58_400_000, rate: 10 },
  { name: "기타", fee: 62_200_000, rate: 10 },
];

export interface AgencyFeeRow {
  name: string;
  issuedAmount: number;
  collectedAmount: number;
  issuedCount: number;
  collectedCount: number;
}

export const agencyFeeRows: AgencyFeeRow[] = [
  { name: "한국산업기술기획평가원", issuedAmount: 71_600_000, collectedAmount: 71_600_000, issuedCount: 2, collectedCount: 2 },
  { name: "한국에너지기술평가원", issuedAmount: 112_500_000, collectedAmount: 0, issuedCount: 1, collectedCount: 0 },
  { name: "한국임업진흥원", issuedAmount: 77_500_000, collectedAmount: 38_750_000, issuedCount: 1, collectedCount: 0 },
  { name: "정보통신기획평가원", issuedAmount: 22_000_000, collectedAmount: 22_000_000, issuedCount: 1, collectedCount: 1 },
  { name: "기타", issuedAmount: 145_000_000, collectedAmount: 145_000_000, issuedCount: 1, collectedCount: 1 },
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
  note?: string; // 기관 특이사항 메모 (이슈/메모 기능과 별개) — 수행기관 상세 화면에 표시
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
// 전담기관 (전문기관) 관리
// ============================================================

export interface FundingAgency {
  id: string;
  name: string;        // 정식명칭
  shortName: string;   // 약칭 (e.g. KEIT)
  code: string;        // 기관 코드
  contactName: string;
  contactEmail: string;
  contactPhone: string;
  status: "ACTIVE" | "INACTIVE";
  registeredAt: string;
  website?: string;
  // 공문 · 세금계산서 발송 대상 — LEAD_ONLY: 주관기관만, LEAD_AND_PARTICIPANTS: 주관+참여(공동)기관 모두
  noticeRecipientScope: "LEAD_ONLY" | "LEAD_AND_PARTICIPANTS";
  // RDA2 전용 — 주관기관명이 이 목록에 있으면 RDA1 대신 RDA2 정책이 자동 적용된다(resolveRdaAgencyId).
  // 농촌진흥청 본청·소속기관 구성이 바뀔 수 있어 코드에 고정하지 않고 기관 데이터로 관리한다.
  rda2AffiliatedInstitutionNames?: string[];
}

export const fundingAgencies: FundingAgency[] = [
  {
    id: "fa-001",
    name: "한국산업기술기획평가원",
    shortName: "KEIT",
    code: "KEIT",
    contactName: "홍담당",
    contactEmail: "info@keit.re.kr",
    contactPhone: "042-714-0114",
    status: "ACTIVE",
    registeredAt: "2022-01-01",
    website: "https://www.keit.re.kr",
    noticeRecipientScope: "LEAD_ONLY",
  },
  {
    id: "fa-002",
    name: "한국에너지기술평가원",
    shortName: "KETEP",
    code: "KETEP",
    contactName: "김에너",
    contactEmail: "info@ketep.re.kr",
    contactPhone: "02-3469-8000",
    status: "ACTIVE",
    registeredAt: "2022-01-01",
    website: "https://www.ketep.re.kr",
    noticeRecipientScope: "LEAD_ONLY",
  },
  {
    id: "fa-003",
    name: "정보통신기획평가원",
    shortName: "IITP",
    code: "IITP",
    contactName: "박정보",
    contactEmail: "info@iitp.kr",
    contactPhone: "02-6131-1000",
    status: "ACTIVE",
    registeredAt: "2022-03-01",
    website: "https://www.iitp.kr",
    noticeRecipientScope: "LEAD_ONLY",
  },
  {
    id: "fa-004",
    name: "한국임업진흥원",
    shortName: "KOFPI",
    code: "KOFPI",
    contactName: "이임업",
    contactEmail: "info@kofpi.or.kr",
    contactPhone: "02-6311-1500",
    status: "ACTIVE",
    registeredAt: "2022-01-01",
    website: "https://www.kofpi.or.kr",
    noticeRecipientScope: "LEAD_ONLY",
  },
  {
    id: "fa-005",
    name: "농촌진흥청",
    shortName: "RDA1",
    code: "RDA1",
    contactName: "최농촌",
    contactEmail: "info@rda.go.kr",
    contactPhone: "063-238-0114",
    status: "ACTIVE",
    registeredAt: "2022-07-01",
    website: "https://www.rda.go.kr",
    noticeRecipientScope: "LEAD_AND_PARTICIPANTS",
  },
  {
    id: "fa-006",
    name: "농촌진흥청",
    shortName: "RDA2",
    code: "RDA2",
    contactName: "송농업",
    contactEmail: "info@rda.go.kr",
    contactPhone: "063-238-0114",
    status: "ACTIVE",
    registeredAt: "2023-09-01",
    website: "https://www.rda.go.kr",
    noticeRecipientScope: "LEAD_AND_PARTICIPANTS",
    rda2AffiliatedInstitutionNames: [
      "농촌진흥청",
      "국립농업과학원",
      "국립식량과학원",
      "농촌인력자원개발센터",
      "국립원예특작과학원",
      "국립축산과학원",
    ],
  },
];

// ============================================================
// 과제 관리
// ============================================================

export interface Project {
  id: string;
  projectNumber: string;
  projectName: string;
  agencyId: string;    // 전담기관 ID (FundingAgency.id)
  agency: string; // 지원기관명 (비정규화 — 표시용)
  leadInstitutionId: string; // 주관기관 ID
  leadInstitutionName: string; // 주관기관명 (비정규화)
  totalBudget: number;
  startDate: string;   // 당해시작일
  endDate: string;     // 당해종료일
  totalTerms: number;
  currentTerm: number;
  status: "ACTIVE" | "COMPLETED" | "SUSPENDED";
  firstStartDate?: string; // 최초시작일 (과제 전체 시작일)
  finalEndDate?: string;   // 최종종료일 (과제 전체 종료일)
  stageStartDate?: string; // 단계시작일
  stageEndDate?: string;   // 단계종료일
  govGrant?: number;             // 당해 정부출연금
  privateCash?: number;          // 당해 민간원금
  privateInKind?: number;        // 당해 민간현물
  usageReportDeadline?: string;  // 사용실적 제출기한
  agencyAssignedAt?: string;     // 전담기관 배정일자
  internalAssignedAt?: string;   // 내부 배정일
  projectCategory?: string;      // 과제 구분
  researchLead?: string;         // 연구책임자
  projectCode?: string;          // 전담기관 과제코드
  projectDivision?: "위탁" | "공동"; // 과제 구분 (위탁/공동)
  billingType?: "정발행" | "역발행요청" | "역발행" | "대상아님" | "면제"; // 발행구분 (없으면 계산서 유무로 자동 판별)
  // 협약 구조
  agreementType?: "BATCH" | "STAGED"; // 일괄협약(0단계) | 단계협약
  stages?: { stageNumber: number; startTermNumber: number; endTermNumber: number }[];
  projectType?: "GENERAL" | "AUTONOMY_TRACK"; // 일반과제 | 자율성트랙과제
  programType?: "GENERAL" | "ICT_FUND";        // 일반 R&D과제 | ICT 기금사업 (IITP 전용 별도 수수료체계)
  docRequestDate?: string;  // 서류 요청일
  docReplyDate?: string;    // 서류 회신일
  assignedManager?: string; // 삼화 담당자
  registeredAt?: string;    // 과제 등록일 — 연도별 대시보드 집계 기준(배정일). 과거 데이터는 미입력일 수 있음
}

export const projects: Project[] = [
  {
    id: "p-001",
    projectNumber: "RS-2024-00214837",
    projectName: "초정밀 광학 센서 모듈 개발 및 양산화",
    agencyId: "fa-001",
    agency: "한국산업기술기획평가원",
    leadInstitutionId: "inst-001",
    leadInstitutionName: "삼화전자(주)",
    totalBudget: 2_800_000_000,
    startDate: "2023-03-01",
    endDate: "2026-02-28",
    totalTerms: 3,
    currentTerm: 2,
    status: "ACTIVE",
    govGrant: 1_400_000_000,
    privateCash: 998_593_000,
    privateInKind: 560_882_000,
    usageReportDeadline: "2027-09-30",
    agencyAssignedAt: "2026-03-20",
    internalAssignedAt: "2026-04-01",
    projectCategory: "연차상시",
    researchLead: "김기술",
    projectCode: "KEIT-2024-001",
    projectDivision: "위탁",
    docRequestDate: "2024-07-10",
    docReplyDate: "2024-07-22",
    assignedManager: "박담당",
    registeredAt: "2023-03-15",
  },
  {
    id: "p-002",
    projectNumber: "RS-2024-00198321",
    projectName: "차세대 이차전지 양극재 소재 국산화",
    agencyId: "fa-002",
    agency: "한국에너지기술평가원",
    leadInstitutionId: "inst-003",
    leadInstitutionName: "(주)에너텍솔루션",
    totalBudget: 400_000_000,
    startDate: "2024-01-01",
    endDate: "2026-12-31",
    totalTerms: 3,
    currentTerm: 1,
    status: "ACTIVE",
    agreementType: "STAGED",
    stages: [{ stageNumber: 1, startTermNumber: 1, endTermNumber: 3 }],
    researchLead: "이연구",
    projectCode: "KETEP-2024-001",
    projectDivision: "위탁",
    docRequestDate: "2024-03-15",
    docReplyDate: "2024-03-28",
    assignedManager: "이회계",
    registeredAt: "2024-01-10",
  },
  {
    id: "p-003",
    projectNumber: "RS-2024-00201547",
    projectName: "스마트 제조공정 AI 품질예측 시스템",
    agencyId: "fa-003",
    agency: "정보통신기획평가원",
    leadInstitutionId: "inst-005",
    leadInstitutionName: "나노소재기술(주)",
    totalBudget: 1_200_000_000,
    startDate: "2022-06-01",
    endDate: "2025-05-31",
    totalTerms: 3,
    currentTerm: 3,
    status: "ACTIVE",
    researchLead: "박민준",
    projectCode: "SMTECH-2024-001",
    projectDivision: "공동",
    docRequestDate: "2024-11-05",
    assignedManager: "김관리",
    registeredAt: "2022-06-10",
  },
  {
    id: "p-004",
    projectNumber: "RS-2023-00187652",
    projectName: "바이오 플라스틱 생분해성 소재 개발",
    agencyId: "fa-004",
    agency: "한국임업진흥원",
    leadInstitutionId: "inst-004",
    leadInstitutionName: "연세대학교",
    totalBudget: 3_100_000_000,
    startDate: "2023-04-01",
    endDate: "2026-03-31",
    totalTerms: 3,
    currentTerm: 2,
    status: "ACTIVE",
    researchLead: "최지훈",
    projectCode: "KIAT-2023-001",
    projectDivision: "위탁",
    docRequestDate: "2024-09-20",
    docReplyDate: "2024-09-30",
    assignedManager: "박담당",
    registeredAt: "2023-04-12",
  },
  {
    id: "p-005",
    projectNumber: "RS-2024-00225198",
    projectName: "고효율 수소 연료전지 스택 성능 향상",
    agencyId: "fa-002",
    agency: "한국에너지기술평가원",
    leadInstitutionId: "inst-002",
    leadInstitutionName: "한국과학기술연구원",
    totalBudget: 2_200_000_000,
    startDate: "2024-03-01",
    endDate: "2027-02-28",
    totalTerms: 3,
    currentTerm: 1,
    status: "ACTIVE",
    researchLead: "정현우",
    projectCode: "KETEP-2024-002",
    billingType: "역발행요청",
    projectDivision: "위탁",
    docRequestDate: "2024-05-10",
    assignedManager: "이회계",
    registeredAt: "2024-03-08",
  },
  {
    id: "p-006",
    projectNumber: "RS-2024-00231087",
    projectName: "반도체 패키징 열관리 신소재 연구",
    agencyId: "fa-001",
    agency: "한국산업기술기획평가원",
    leadInstitutionId: "inst-009",
    leadInstitutionName: "(주)미래반도체",
    totalBudget: 980_000_000,
    startDate: "2024-04-01",
    endDate: "2026-03-31",
    totalTerms: 2,
    currentTerm: 1,
    status: "ACTIVE",
    researchLead: "한재원",
    projectCode: "KEIT-2024-002",
    projectDivision: "위탁",
    docRequestDate: "2024-06-15",
    docReplyDate: "2024-06-25",
    assignedManager: "김관리",
    registeredAt: "2024-04-15",
  },
  {
    id: "p-007",
    projectNumber: "RS-2023-00176431",
    projectName: "도심항공모빌리티(UAM) 경량화 구조재 개발",
    agencyId: "fa-005",
    agency: "농촌진흥청",
    leadInstitutionId: "inst-006",
    leadInstitutionName: "(주)한국항공우주",
    totalBudget: 5_800_000_000,
    startDate: "2022-07-01",
    endDate: "2025-06-30",
    totalTerms: 3,
    currentTerm: 3,
    status: "ACTIVE",
    researchLead: "송현구",
    projectCode: "KARI-2023-001",
    projectDivision: "위탁",
    docRequestDate: "2024-08-12",
    docReplyDate: "2024-08-20",
    assignedManager: "박담당",
    registeredAt: "2022-07-20",
  },
  {
    id: "p-008",
    projectNumber: "RS-2024-00219874",
    projectName: "의료용 생체흡수성 임플란트 소재 개발",
    agencyId: "fa-006",
    agency: "농촌진흥청",
    leadInstitutionId: "inst-008",
    leadInstitutionName: "그린바이오텍(주)",
    totalBudget: 1_650_000_000,
    startDate: "2023-09-01",
    endDate: "2026-08-31",
    researchLead: "임성훈",
    projectCode: "KHIDI-2024-001",
    billingType: "면제",
    projectDivision: "공동",
    totalTerms: 3,
    currentTerm: 2,
    status: "ACTIVE",
    assignedManager: "이회계",
    registeredAt: "2023-09-05",
  },
  {
    id: "p-009",
    projectNumber: "RS-2022-00158234",
    projectName: "탄소섬유 복합소재 고속 성형 기술 개발",
    agencyId: "fa-001",
    agency: "한국산업기술기획평가원",
    leadInstitutionId: "inst-007",
    leadInstitutionName: "부산대학교",
    totalBudget: 2_100_000_000,
    startDate: "2022-01-01",
    endDate: "2024-12-31",
    totalTerms: 3,
    currentTerm: 3,
    status: "COMPLETED",
    researchLead: "황재원",
    projectCode: "KEIT-2022-001",
    projectDivision: "위탁",
  },
  {
    id: "p-010",
    projectNumber: "RS-2022-00162891",
    projectName: "차량용 전력반도체 소자 국산화",
    agencyId: "fa-004",
    agency: "한국임업진흥원",
    leadInstitutionId: "inst-011",
    leadInstitutionName: "하이테크머티리얼(주)",
    totalBudget: 3_400_000_000,
    startDate: "2022-04-01",
    endDate: "2024-03-31",
    totalTerms: 2,
    currentTerm: 2,
    status: "COMPLETED",
    researchLead: "전병욱",
    projectCode: "KIAT-2022-001",
    projectDivision: "공동",
    billingType: "대상아님",
  },
  // p-011: KETEP 단계협약 예시 — "과제 구성 예시(P001·A과제)" 템플릿을 별도 과제로 재현
  // (기존 p-002와 동일한 예산 구조지만 서로 다른 기관·과제로 분리 구성)
  {
    id: "p-011",
    projectNumber: "RS-2024-00237560",
    projectName: "고효율 수소연료전지 스택 소재 개발",
    agencyId: "fa-002",
    agency: "한국에너지기술평가원",
    leadInstitutionId: "inst-001",
    leadInstitutionName: "삼화전자(주)",
    totalBudget: 1_050_000_000,
    startDate: "2024-01-01",
    endDate: "2026-12-31",
    totalTerms: 3,
    currentTerm: 3,
    status: "ACTIVE",
    agreementType: "STAGED",
    stages: [{ stageNumber: 1, startTermNumber: 1, endTermNumber: 3 }],
    researchLead: "박에너지",
    projectCode: "KETEP-2024-002",
    projectDivision: "위탁",
    assignedManager: "이회계",
    registeredAt: "2024-01-05",
  },
];

// ============================================================
// 참여기관 (과제-기관 연결, 수수료 산정용)
// ============================================================

export interface AnnualBudget {
  termYear: number;
  termNumber: number;
  cashBudget: number;
  inKindBudget: number;
}

export interface ProjectMember {
  id: string;
  projectId: string;
  projectNumber: string;
  institutionId: string;
  institutionName: string;
  institutionType: InstitutionType;
  role: "LEAD" | "PARTICIPANT"; // 주관 | 참여
  budget: number; // 총 배정 연구비 (현금+현물)
  feeRate: number; // 적용 요율 (%) — 레거시, 신규 산정은 fee-calculator 사용
  calculatedFee: number; // 산정 수수료 — 레거시
  institutionGrade?: "최우수(S)" | "우수(A)" | "우수(B)" | "우수(C)" | "일반";
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  // 수수료 산정 필드
  cashBudget?: number;         // 총 현금사업비
  inKindBudget?: number;       // 총 현물사업비
  settlementType?: "위탁정산" | "자체정산";
  annualBudgets?: AnnualBudget[]; // 연차별 현금/현물 분리 예산
}

export const projectMembers: ProjectMember[] = [
  // p-001: 삼화전자 주관, 4개 기관
  { id: "pm-001", projectId: "p-001", projectNumber: "RS-2024-00214837", institutionId: "inst-001", institutionName: "삼화전자(주)", institutionType: "중소기업", role: "LEAD", budget: 700_000_000, feeRate: 3.0, calculatedFee: 21_000_000, institutionGrade: "일반", contactName: "김연구", contactEmail: "research@samhwa.co.kr", contactPhone: "02-1234-5678", annualBudgets: [{ termYear: 2023, termNumber: 1, cashBudget: 500_000_000, inKindBudget: 0 }, { termYear: 2024, termNumber: 2, cashBudget: 700_000_000, inKindBudget: 0 }, { termYear: 2025, termNumber: 3, cashBudget: 600_000_000, inKindBudget: 0 }] },
  { id: "pm-002", projectId: "p-001", projectNumber: "RS-2024-00214837", institutionId: "inst-002", institutionName: "한국과학기술연구원", institutionType: "정부출연연구소", role: "PARTICIPANT", budget: 1_200_000_000, feeRate: 2.0, calculatedFee: 24_000_000, institutionGrade: "우수(A)", contactName: "이박사", contactEmail: "lee@kist.re.kr", contactPhone: "02-2055-1000", annualBudgets: [{ termYear: 2023, termNumber: 1, cashBudget: 900_000_000, inKindBudget: 0 }, { termYear: 2024, termNumber: 2, cashBudget: 1_200_000_000, inKindBudget: 0 }, { termYear: 2025, termNumber: 3, cashBudget: 1_000_000_000, inKindBudget: 0 }] },
  { id: "pm-003", projectId: "p-001", projectNumber: "RS-2024-00214837", institutionId: "inst-004", institutionName: "연세대학교", institutionType: "대학", role: "PARTICIPANT", budget: 500_000_000, feeRate: 2.0, calculatedFee: 10_000_000, institutionGrade: "최우수(S)", contactName: "박교수", contactEmail: "park@yonsei.ac.kr", contactPhone: "02-2123-3456", annualBudgets: [{ termYear: 2023, termNumber: 1, cashBudget: 400_000_000, inKindBudget: 0 }, { termYear: 2024, termNumber: 2, cashBudget: 500_000_000, inKindBudget: 0 }, { termYear: 2025, termNumber: 3, cashBudget: 450_000_000, inKindBudget: 0 }] },
  { id: "pm-004", projectId: "p-001", projectNumber: "RS-2024-00214837", institutionId: "inst-005", institutionName: "나노소재기술(주)", institutionType: "스타트업", role: "PARTICIPANT", budget: 400_000_000, feeRate: 2.5, calculatedFee: 10_000_000, institutionGrade: "일반", contactName: "최담당", contactEmail: "choi@nanomat.co.kr", contactPhone: "031-456-7890", annualBudgets: [{ termYear: 2023, termNumber: 1, cashBudget: 300_000_000, inKindBudget: 0 }, { termYear: 2024, termNumber: 2, cashBudget: 400_000_000, inKindBudget: 0 }, { termYear: 2025, termNumber: 3, cashBudget: 350_000_000, inKindBudget: 0 }] },

  // p-002: (주)에너텍솔루션 주관, 6개 기관
  // 과제 구성 예시(P001·A과제) 템플릿 기준 재구성 — 주관(기관A) + 공동 3개(기관B 최우수·기관C 우수·기관D 일반), 1단계 3년차.
  { id: "pm-005", projectId: "p-002", projectNumber: "RS-2024-00198321", institutionId: "inst-003", institutionName: "(주)에너텍솔루션", institutionType: "중견기업", role: "LEAD", budget: 900_000_000, feeRate: 3.5, calculatedFee: 0, institutionGrade: "일반", settlementType: "위탁정산", annualBudgets: [{ termYear: 2024, termNumber: 1, cashBudget: 200_000_000, inKindBudget: 0 }, { termYear: 2025, termNumber: 2, cashBudget: 300_000_000, inKindBudget: 0 }, { termYear: 2026, termNumber: 3, cashBudget: 400_000_000, inKindBudget: 0 }] },
  { id: "pm-006", projectId: "p-002", projectNumber: "RS-2024-00198321", institutionId: "inst-004", institutionName: "연세대학교", institutionType: "대학", role: "PARTICIPANT", budget: 550_000_000, feeRate: 3.5, calculatedFee: 0, institutionGrade: "최우수(S)", settlementType: "자체정산", annualBudgets: [{ termYear: 2024, termNumber: 1, cashBudget: 100_000_000, inKindBudget: 0 }, { termYear: 2025, termNumber: 2, cashBudget: 150_000_000, inKindBudget: 0 }, { termYear: 2026, termNumber: 3, cashBudget: 300_000_000, inKindBudget: 0 }] },
  { id: "pm-007", projectId: "p-002", projectNumber: "RS-2024-00198321", institutionId: "inst-002", institutionName: "한국과학기술연구원", institutionType: "정부출연연구소", role: "PARTICIPANT", budget: 350_000_000, feeRate: 3.5, calculatedFee: 0, institutionGrade: "우수(A)", settlementType: "위탁정산", annualBudgets: [{ termYear: 2024, termNumber: 1, cashBudget: 50_000_000, inKindBudget: 0 }, { termYear: 2025, termNumber: 2, cashBudget: 100_000_000, inKindBudget: 0 }, { termYear: 2026, termNumber: 3, cashBudget: 200_000_000, inKindBudget: 0 }] },
  { id: "pm-010", projectId: "p-002", projectNumber: "RS-2024-00198321", institutionId: "inst-011", institutionName: "하이테크머티리얼(주)", institutionType: "스타트업", role: "PARTICIPANT", budget: 300_000_000, feeRate: 3.5, calculatedFee: 0, institutionGrade: "일반", settlementType: "위탁정산", annualBudgets: [{ termYear: 2024, termNumber: 1, cashBudget: 50_000_000, inKindBudget: 0 }, { termYear: 2025, termNumber: 2, cashBudget: 100_000_000, inKindBudget: 0 }, { termYear: 2026, termNumber: 3, cashBudget: 150_000_000, inKindBudget: 0 }] },

  // p-003: 나노소재기술 주관, 3개 기관
  { id: "pm-011", projectId: "p-003", projectNumber: "RS-2024-00201547", institutionId: "inst-005", institutionName: "나노소재기술(주)", institutionType: "스타트업", role: "LEAD", budget: 600_000_000, feeRate: 2.5, calculatedFee: 15_000_000, institutionGrade: "일반", annualBudgets: [{ termYear: 2022, termNumber: 1, cashBudget: 600_000_000, inKindBudget: 0 }, { termYear: 2023, termNumber: 2, cashBudget: 700_000_000, inKindBudget: 0 }, { termYear: 2024, termNumber: 3, cashBudget: 800_000_000, inKindBudget: 0 }] },
  { id: "pm-012", projectId: "p-003", projectNumber: "RS-2024-00201547", institutionId: "inst-002", institutionName: "한국과학기술연구원", institutionType: "정부출연연구소", role: "PARTICIPANT", budget: 400_000_000, feeRate: 2.0, calculatedFee: 8_000_000, institutionGrade: "우수(A)", annualBudgets: [{ termYear: 2022, termNumber: 1, cashBudget: 400_000_000, inKindBudget: 0 }, { termYear: 2023, termNumber: 2, cashBudget: 450_000_000, inKindBudget: 0 }, { termYear: 2024, termNumber: 3, cashBudget: 500_000_000, inKindBudget: 0 }] },
  { id: "pm-013", projectId: "p-003", projectNumber: "RS-2024-00201547", institutionId: "inst-007", institutionName: "부산대학교", institutionType: "대학", role: "PARTICIPANT", budget: 200_000_000, feeRate: 2.0, calculatedFee: 4_000_000, institutionGrade: "우수(B)", annualBudgets: [{ termYear: 2022, termNumber: 1, cashBudget: 200_000_000, inKindBudget: 0 }, { termYear: 2023, termNumber: 2, cashBudget: 230_000_000, inKindBudget: 0 }, { termYear: 2024, termNumber: 3, cashBudget: 250_000_000, inKindBudget: 0 }] },

  // p-004: 연세대학교 주관, 5개 기관
  { id: "pm-014", projectId: "p-004", projectNumber: "RS-2023-00187652", institutionId: "inst-004", institutionName: "연세대학교", institutionType: "대학", role: "LEAD", budget: 1_500_000_000, feeRate: 2.0, calculatedFee: 30_000_000, institutionGrade: "최우수(S)", annualBudgets: [{ termYear: 2023, termNumber: 1, cashBudget: 1_300_000_000, inKindBudget: 0 }, { termYear: 2024, termNumber: 2, cashBudget: 1_500_000_000, inKindBudget: 0 }, { termYear: 2025, termNumber: 3, cashBudget: 1_600_000_000, inKindBudget: 0 }] },
  { id: "pm-015", projectId: "p-004", projectNumber: "RS-2023-00187652", institutionId: "inst-003", institutionName: "(주)에너텍솔루션", institutionType: "중견기업", role: "PARTICIPANT", budget: 800_000_000, feeRate: 2.5, calculatedFee: 20_000_000, institutionGrade: "우수(B)", annualBudgets: [{ termYear: 2023, termNumber: 1, cashBudget: 700_000_000, inKindBudget: 0 }, { termYear: 2024, termNumber: 2, cashBudget: 800_000_000, inKindBudget: 0 }, { termYear: 2025, termNumber: 3, cashBudget: 850_000_000, inKindBudget: 0 }] },
  { id: "pm-016", projectId: "p-004", projectNumber: "RS-2023-00187652", institutionId: "inst-008", institutionName: "그린바이오텍(주)", institutionType: "중소기업", role: "PARTICIPANT", budget: 500_000_000, feeRate: 3.0, calculatedFee: 15_000_000, institutionGrade: "우수(C)", annualBudgets: [{ termYear: 2023, termNumber: 1, cashBudget: 450_000_000, inKindBudget: 0 }, { termYear: 2024, termNumber: 2, cashBudget: 500_000_000, inKindBudget: 0 }, { termYear: 2025, termNumber: 3, cashBudget: 550_000_000, inKindBudget: 0 }] },
  { id: "pm-017", projectId: "p-004", projectNumber: "RS-2023-00187652", institutionId: "inst-002", institutionName: "한국과학기술연구원", institutionType: "정부출연연구소", role: "PARTICIPANT", budget: 200_000_000, feeRate: 2.0, calculatedFee: 4_000_000, institutionGrade: "우수(A)", annualBudgets: [{ termYear: 2023, termNumber: 1, cashBudget: 180_000_000, inKindBudget: 0 }, { termYear: 2024, termNumber: 2, cashBudget: 200_000_000, inKindBudget: 0 }, { termYear: 2025, termNumber: 3, cashBudget: 220_000_000, inKindBudget: 0 }] },
  { id: "pm-018", projectId: "p-004", projectNumber: "RS-2023-00187652", institutionId: "inst-007", institutionName: "부산대학교", institutionType: "대학", role: "PARTICIPANT", budget: 100_000_000, feeRate: 2.0, calculatedFee: 2_000_000, institutionGrade: "우수(B)", annualBudgets: [{ termYear: 2023, termNumber: 1, cashBudget: 90_000_000, inKindBudget: 0 }, { termYear: 2024, termNumber: 2, cashBudget: 100_000_000, inKindBudget: 0 }, { termYear: 2025, termNumber: 3, cashBudget: 110_000_000, inKindBudget: 0 }] },

  // p-005: 한국과학기술연구원 주관, 2개 기관
  { id: "pm-019", projectId: "p-005", projectNumber: "RS-2024-00225198", institutionId: "inst-002", institutionName: "한국과학기술연구원", institutionType: "정부출연연구소", role: "LEAD", budget: 800_000_000, feeRate: 2.0, calculatedFee: 16_000_000, institutionGrade: "최우수(S)", annualBudgets: [{ termYear: 2024, termNumber: 1, cashBudget: 800_000_000, inKindBudget: 0 }] },
  { id: "pm-020", projectId: "p-005", projectNumber: "RS-2024-00225198", institutionId: "inst-001", institutionName: "삼화전자(주)", institutionType: "중소기업", role: "PARTICIPANT", budget: 1_400_000_000, feeRate: 3.0, calculatedFee: 42_000_000, institutionGrade: "일반", annualBudgets: [{ termYear: 2024, termNumber: 1, cashBudget: 1_400_000_000, inKindBudget: 0 }] },

  // p-006: (주)미래반도체 주관, 3개 기관
  { id: "pm-023", projectId: "p-006", projectNumber: "RS-2024-00231087", institutionId: "inst-009", institutionName: "(주)미래반도체", institutionType: "중소기업", role: "LEAD", budget: 480_000_000, feeRate: 3.0, calculatedFee: 14_400_000, institutionGrade: "일반", annualBudgets: [{ termYear: 2024, termNumber: 1, cashBudget: 480_000_000, inKindBudget: 0 }] },
  { id: "pm-024", projectId: "p-006", projectNumber: "RS-2024-00231087", institutionId: "inst-005", institutionName: "나노소재기술(주)", institutionType: "스타트업", role: "PARTICIPANT", budget: 300_000_000, feeRate: 2.5, calculatedFee: 7_500_000, institutionGrade: "일반", annualBudgets: [{ termYear: 2024, termNumber: 1, cashBudget: 300_000_000, inKindBudget: 0 }] },
  { id: "pm-025", projectId: "p-006", projectNumber: "RS-2024-00231087", institutionId: "inst-002", institutionName: "한국과학기술연구원", institutionType: "정부출연연구소", role: "PARTICIPANT", budget: 200_000_000, feeRate: 2.0, calculatedFee: 4_000_000, institutionGrade: "우수(A)", annualBudgets: [{ termYear: 2024, termNumber: 1, cashBudget: 200_000_000, inKindBudget: 0 }] },

  // p-007: (주)한국항공우주 주관, 7개 기관
  { id: "pm-026", projectId: "p-007", projectNumber: "RS-2023-00176431", institutionId: "inst-006", institutionName: "(주)한국항공우주", institutionType: "중견기업", role: "LEAD", budget: 1_200_000_000, feeRate: 2.5, calculatedFee: 30_000_000, institutionGrade: "우수(B)", annualBudgets: [{ termYear: 2022, termNumber: 1, cashBudget: 900_000_000, inKindBudget: 90_000_000 }, { termYear: 2023, termNumber: 2, cashBudget: 1_050_000_000, inKindBudget: 100_000_000 }, { termYear: 2024, termNumber: 3, cashBudget: 1_200_000_000, inKindBudget: 120_000_000 }] },
  { id: "pm-027", projectId: "p-007", projectNumber: "RS-2023-00176431", institutionId: "inst-001", institutionName: "삼화전자(주)", institutionType: "중소기업", role: "PARTICIPANT", budget: 1_200_000_000, feeRate: 3.0, calculatedFee: 36_000_000, institutionGrade: "우수(C)", annualBudgets: [{ termYear: 2022, termNumber: 1, cashBudget: 900_000_000, inKindBudget: 90_000_000 }, { termYear: 2023, termNumber: 2, cashBudget: 1_050_000_000, inKindBudget: 100_000_000 }, { termYear: 2024, termNumber: 3, cashBudget: 1_200_000_000, inKindBudget: 120_000_000 }] },
  { id: "pm-028", projectId: "p-007", projectNumber: "RS-2023-00176431", institutionId: "inst-004", institutionName: "연세대학교", institutionType: "대학", role: "PARTICIPANT", budget: 1_500_000_000, feeRate: 2.0, calculatedFee: 30_000_000, institutionGrade: "최우수(S)", annualBudgets: [{ termYear: 2022, termNumber: 1, cashBudget: 1_100_000_000, inKindBudget: 110_000_000 }, { termYear: 2023, termNumber: 2, cashBudget: 1_300_000_000, inKindBudget: 130_000_000 }, { termYear: 2024, termNumber: 3, cashBudget: 1_500_000_000, inKindBudget: 150_000_000 }] },
  { id: "pm-029", projectId: "p-007", projectNumber: "RS-2023-00176431", institutionId: "inst-002", institutionName: "한국과학기술연구원", institutionType: "정부출연연구소", role: "PARTICIPANT", budget: 1_000_000_000, feeRate: 2.0, calculatedFee: 20_000_000, institutionGrade: "우수(A)", annualBudgets: [{ termYear: 2022, termNumber: 1, cashBudget: 750_000_000, inKindBudget: 75_000_000 }, { termYear: 2023, termNumber: 2, cashBudget: 900_000_000, inKindBudget: 90_000_000 }, { termYear: 2024, termNumber: 3, cashBudget: 1_000_000_000, inKindBudget: 100_000_000 }] },
  { id: "pm-030", projectId: "p-007", projectNumber: "RS-2023-00176431", institutionId: "inst-007", institutionName: "부산대학교", institutionType: "대학", role: "PARTICIPANT", budget: 500_000_000, feeRate: 2.0, calculatedFee: 10_000_000, institutionGrade: "우수(B)", annualBudgets: [{ termYear: 2022, termNumber: 1, cashBudget: 350_000_000, inKindBudget: 35_000_000 }, { termYear: 2023, termNumber: 2, cashBudget: 420_000_000, inKindBudget: 40_000_000 }, { termYear: 2024, termNumber: 3, cashBudget: 500_000_000, inKindBudget: 50_000_000 }] },
  { id: "pm-031", projectId: "p-007", projectNumber: "RS-2023-00176431", institutionId: "inst-003", institutionName: "(주)에너텍솔루션", institutionType: "중견기업", role: "PARTICIPANT", budget: 200_000_000, feeRate: 2.5, calculatedFee: 5_000_000, institutionGrade: "우수(C)", annualBudgets: [{ termYear: 2022, termNumber: 1, cashBudget: 150_000_000, inKindBudget: 15_000_000 }, { termYear: 2023, termNumber: 2, cashBudget: 170_000_000, inKindBudget: 20_000_000 }, { termYear: 2024, termNumber: 3, cashBudget: 200_000_000, inKindBudget: 20_000_000 }] },
  { id: "pm-032", projectId: "p-007", projectNumber: "RS-2023-00176431", institutionId: "inst-011", institutionName: "하이테크머티리얼(주)", institutionType: "스타트업", role: "PARTICIPANT", budget: 200_000_000, feeRate: 2.5, calculatedFee: 5_000_000, institutionGrade: "일반", annualBudgets: [{ termYear: 2022, termNumber: 1, cashBudget: 150_000_000, inKindBudget: 15_000_000 }, { termYear: 2023, termNumber: 2, cashBudget: 170_000_000, inKindBudget: 20_000_000 }, { termYear: 2024, termNumber: 3, cashBudget: 200_000_000, inKindBudget: 20_000_000 }] },

  // p-008: 그린바이오텍 주관, 3개 기관
  { id: "pm-033", projectId: "p-008", projectNumber: "RS-2024-00219874", institutionId: "inst-008", institutionName: "그린바이오텍(주)", institutionType: "중소기업", role: "LEAD", budget: 1_100_000_000, feeRate: 3.0, calculatedFee: 33_000_000, institutionGrade: "우수(C)", annualBudgets: [{ termYear: 2023, termNumber: 1, cashBudget: 1_100_000_000, inKindBudget: 0 }, { termYear: 2024, termNumber: 2, cashBudget: 1_250_000_000, inKindBudget: 100_000_000 }, { termYear: 2025, termNumber: 3, cashBudget: 1_400_000_000, inKindBudget: 120_000_000 }] },
  { id: "pm-034", projectId: "p-008", projectNumber: "RS-2024-00219874", institutionId: "inst-004", institutionName: "연세대학교", institutionType: "대학", role: "PARTICIPANT", budget: 350_000_000, feeRate: 2.0, calculatedFee: 7_000_000, institutionGrade: "최우수(S)", annualBudgets: [{ termYear: 2023, termNumber: 1, cashBudget: 350_000_000, inKindBudget: 0 }, { termYear: 2024, termNumber: 2, cashBudget: 400_000_000, inKindBudget: 40_000_000 }, { termYear: 2025, termNumber: 3, cashBudget: 450_000_000, inKindBudget: 45_000_000 }] },
  { id: "pm-035", projectId: "p-008", projectNumber: "RS-2024-00219874", institutionId: "inst-002", institutionName: "한국과학기술연구원", institutionType: "정부출연연구소", role: "PARTICIPANT", budget: 200_000_000, feeRate: 2.0, calculatedFee: 4_000_000, institutionGrade: "우수(A)", annualBudgets: [{ termYear: 2023, termNumber: 1, cashBudget: 200_000_000, inKindBudget: 0 }, { termYear: 2024, termNumber: 2, cashBudget: 230_000_000, inKindBudget: 20_000_000 }, { termYear: 2025, termNumber: 3, cashBudget: 260_000_000, inKindBudget: 25_000_000 }] },

  // p-009: 부산대학교 주관, 3개 기관 (탄소섬유 — 완료 과제)
  { id: "pm-036", projectId: "p-009", projectNumber: "RS-2022-00158234", institutionId: "inst-007", institutionName: "부산대학교", institutionType: "대학", role: "LEAD", budget: 1_400_000_000, feeRate: 2.0, calculatedFee: 28_000_000, institutionGrade: "우수(A)" },
  { id: "pm-037", projectId: "p-009", projectNumber: "RS-2022-00158234", institutionId: "inst-002", institutionName: "한국과학기술연구원", institutionType: "정부출연연구소", role: "PARTICIPANT", budget: 500_000_000, feeRate: 2.0, calculatedFee: 10_000_000, institutionGrade: "최우수(S)" },
  { id: "pm-038", projectId: "p-009", projectNumber: "RS-2022-00158234", institutionId: "inst-001", institutionName: "삼화전자(주)", institutionType: "중소기업", role: "PARTICIPANT", budget: 200_000_000, feeRate: 3.0, calculatedFee: 6_000_000, institutionGrade: "일반" },

  // p-010: 하이테크머티리얼 주관, 3개 기관 (전력반도체 — 완료 과제)
  { id: "pm-039", projectId: "p-010", projectNumber: "RS-2022-00162891", institutionId: "inst-011", institutionName: "하이테크머티리얼(주)", institutionType: "스타트업", role: "LEAD", budget: 2_000_000_000, feeRate: 2.5, calculatedFee: 50_000_000, institutionGrade: "일반" },
  { id: "pm-040", projectId: "p-010", projectNumber: "RS-2022-00162891", institutionId: "inst-002", institutionName: "한국과학기술연구원", institutionType: "정부출연연구소", role: "PARTICIPANT", budget: 800_000_000, feeRate: 2.0, calculatedFee: 16_000_000, institutionGrade: "우수(A)" },
  { id: "pm-041", projectId: "p-010", projectNumber: "RS-2022-00162891", institutionId: "inst-003", institutionName: "(주)에너텍솔루션", institutionType: "중견기업", role: "PARTICIPANT", budget: 600_000_000, feeRate: 2.5, calculatedFee: 15_000_000, institutionGrade: "우수(C)" },

  // p-011: 삼화전자 주관, 3개 기관 (KETEP 단계협약 예시 — "과제 구성 예시(P001·A과제)" 템플릿 재현, 1단계 3년차)
  { id: "pm-042", projectId: "p-011", projectNumber: "RS-2024-00237560", institutionId: "inst-001", institutionName: "삼화전자(주)", institutionType: "중소기업", role: "LEAD", budget: 900_000_000, feeRate: 3.5, calculatedFee: 0, institutionGrade: "일반", settlementType: "위탁정산", annualBudgets: [{ termYear: 2024, termNumber: 1, cashBudget: 200_000_000, inKindBudget: 0 }, { termYear: 2025, termNumber: 2, cashBudget: 300_000_000, inKindBudget: 0 }, { termYear: 2026, termNumber: 3, cashBudget: 400_000_000, inKindBudget: 0 }] },
  { id: "pm-043", projectId: "p-011", projectNumber: "RS-2024-00237560", institutionId: "inst-007", institutionName: "부산대학교", institutionType: "대학", role: "PARTICIPANT", budget: 550_000_000, feeRate: 3.5, calculatedFee: 0, institutionGrade: "최우수(S)", settlementType: "자체정산", annualBudgets: [{ termYear: 2024, termNumber: 1, cashBudget: 100_000_000, inKindBudget: 0 }, { termYear: 2025, termNumber: 2, cashBudget: 150_000_000, inKindBudget: 0 }, { termYear: 2026, termNumber: 3, cashBudget: 300_000_000, inKindBudget: 0 }] },
  { id: "pm-044", projectId: "p-011", projectNumber: "RS-2024-00237560", institutionId: "inst-008", institutionName: "그린바이오텍(주)", institutionType: "중소기업", role: "PARTICIPANT", budget: 350_000_000, feeRate: 3.5, calculatedFee: 0, institutionGrade: "우수(A)", settlementType: "위탁정산", annualBudgets: [{ termYear: 2024, termNumber: 1, cashBudget: 50_000_000, inKindBudget: 0 }, { termYear: 2025, termNumber: 2, cashBudget: 100_000_000, inKindBudget: 0 }, { termYear: 2026, termNumber: 3, cashBudget: 200_000_000, inKindBudget: 0 }] },
  { id: "pm-045", projectId: "p-011", projectNumber: "RS-2024-00237560", institutionId: "inst-009", institutionName: "(주)미래반도체", institutionType: "중소기업", role: "PARTICIPANT", budget: 300_000_000, feeRate: 3.5, calculatedFee: 0, institutionGrade: "일반", settlementType: "위탁정산", annualBudgets: [{ termYear: 2024, termNumber: 1, cashBudget: 50_000_000, inKindBudget: 0 }, { termYear: 2025, termNumber: 2, cashBudget: 100_000_000, inKindBudget: 0 }, { termYear: 2026, termNumber: 3, cashBudget: 150_000_000, inKindBudget: 0 }] },
];

// ============================================================
// 수수료 기준 정책 (등급별 산출 비율 + 버전 이력)
// ─ PolicyRule: 대상·등급·정산구분별 수수료 적용 비율 (standardRate에 곱하는 배율) — buildPolicyDisplayRules()가 정책 파라미터로부터 생성
// ─ FeePolicy: 특정 기간에 적용된 수수료 기준표의 버전 스냅샷
// ─ agencyId=null은 공통(전역) 기준, 기관별 정책이 없으면 공통 기준 사용
// ============================================================

export interface PolicyRule {
  subject: "기관" | "과제";
  grade: string;
  gradeName: string;
  settlementType: "자체정산" | "위탁정산" | "제외대상";
  annualRate: number;
  settlementRate: number;
}

// 현금사업비 구간별 기본수수료 (정액)
export interface FeeRateBracket {
  minAmount: number;        // 이상 (inclusive)
  maxAmount: number | null; // 미만 (null = 상한 없음)
  baseFee: number;
}

export interface FeePolicy {
  id: string;
  agencyId: string | null;
  name: string;
  version: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  status: "ACTIVE" | "EXPIRED" | "DRAFT";
  standardRate: number;
  description: string;
  createdAt: string;
  createdBy: string;
  // 수수료 산정 파라미터
  feeRateBrackets: FeeRateBracket[];
  coInstAddonMethod: "TIERED" | "FLAT"; // TIERED: 1개10%+추가5%, FLAT: 전체10%×N
  exemptGrades: string[];              // 면제기관 등급 ["S","A~C"] or ["S"] or []
  // DISCOUNT: 면제등급도 산정기준액에 포함해 계산한 뒤 85% 할인 (KEIT/KETEP)
  // EXCLUDE: 면제등급을 산정기준액에서 완전히 제외 — 연차상시도 수행하지 않음 (IITP/RDA1/RDA2)
  exemptionMode: "DISCOUNT" | "EXCLUDE";
  // 면제기관(정산면제 등급)의 정산구분이 참여기관 화면에서 개별 지정되지 않았을 때 적용할 기본값.
  // 정산구분은 연차상시(ANNUAL)에는 영향이 없고 정산 연차(SETTLEMENT)에만 영향을 준다 —
  // 위탁정산=정산 연차 100%, 자체정산=정산 연차에도 85% 유지.
  defaultSettlementType?: "위탁정산" | "자체정산";
  feeBasis: "CASH" | "CASH_PLUS_INKIND"; // CASH_PLUS_INKIND: RDA1/RDA2 — 현금+현물 합산 기준
  hasAutonomyTrack: boolean;           // 자율성트랙 과제 존재 여부
  annualBillingRate: number;           // 연차상시 청구 비율 (0.85=KEIT/KETEP, 1.0=KOFPI 등 미청구 없는 기관)
  minimumFee?: number;                 // 연차별 산정수수료 최소 하한액 — 미만이면 이 금액을 기준으로 하고 차액은 이월 (RDA1/RDA2: 100,000원)
  excludeLeadFromCalc?: boolean;       // 주관기관을 산정기준액에서 완전 제외 + 공동기관수 -1 보정 (RDA2: 주관기관이 농진청/소속기관인 경우)
  calcMode?: "AGGREGATE" | "PER_INSTITUTION"; // AGGREGATE(기본): 과제 전체 사업비로 표준수수료 산정 후 배분 / PER_INSTITUTION: 기관별 사업비를 각각 구간표에 대입해 개별 산정 (IITP ICT기금사업)
  programType?: "GENERAL" | "ICT_FUND"; // 정책이 적용되는 사업 유형 — 동일 전담기관에 유형별로 별도 정책을 둘 수 있음 (미지정 시 GENERAL)
  legacyTransitionNote?: string;       // 수수료체계 변경 시점의 경과조치 안내 (예: KETEP 26년 전환 — 이전 과제 미청구수수료 수기조정 필요)
}

// ─── 전담기관별 현금사업비 구간 요율표 ──────────────────────────

export const KEIT_BRACKETS: FeeRateBracket[] = [
  { minAmount: 0,              maxAmount: 100_000_000,    baseFee: 987_000   },
  { minAmount: 100_000_000,    maxAmount: 300_000_000,    baseFee: 1_185_000 },
  { minAmount: 300_000_000,    maxAmount: 500_000_000,    baseFee: 1_515_000 },
  { minAmount: 500_000_000,    maxAmount: 1_000_000_000,  baseFee: 1_647_000 },
  { minAmount: 1_000_000_000,  maxAmount: 3_000_000_000,  baseFee: 1_845_000 },
  { minAmount: 3_000_000_000,  maxAmount: null,            baseFee: 2_043_000 },
];

export const KETEP_BRACKETS: FeeRateBracket[] = [
  { minAmount: 0,               maxAmount: 100_000_000,    baseFee: 987_000   },
  { minAmount: 100_000_000,     maxAmount: 300_000_000,    baseFee: 1_185_000 },
  { minAmount: 300_000_000,     maxAmount: 500_000_000,    baseFee: 1_515_000 },
  { minAmount: 500_000_000,     maxAmount: 1_000_000_000,  baseFee: 1_647_000 },
  { minAmount: 1_000_000_000,   maxAmount: 3_000_000_000,  baseFee: 1_845_000 },
  { minAmount: 3_000_000_000,   maxAmount: 5_000_000_000,  baseFee: 2_043_000 },
  { minAmount: 5_000_000_000,   maxAmount: 10_000_000_000, baseFee: 2_241_000 },
  { minAmount: 10_000_000_000,  maxAmount: 30_000_000_000, baseFee: 2_439_000 },
  { minAmount: 30_000_000_000,  maxAmount: null,            baseFee: 2_637_000 },
];

// KOFPI: 최대 50억 10구간, 50억 초과는 별도 협의
export const KOFPI_BRACKETS: FeeRateBracket[] = [
  { minAmount: 0,              maxAmount: 50_000_000,    baseFee: 700_000   },
  { minAmount: 50_000_000,     maxAmount: 100_000_000,   baseFee: 900_000   },
  { minAmount: 100_000_000,    maxAmount: 200_000_000,   baseFee: 1_100_000 },
  { minAmount: 200_000_000,    maxAmount: 300_000_000,   baseFee: 1_300_000 },
  { minAmount: 300_000_000,    maxAmount: 500_000_000,   baseFee: 1_500_000 },
  { minAmount: 500_000_000,    maxAmount: 1_000_000_000, baseFee: 1_700_000 },
  { minAmount: 1_000_000_000,  maxAmount: 2_000_000_000, baseFee: 1_900_000 },
  { minAmount: 2_000_000_000,  maxAmount: 3_000_000_000, baseFee: 2_100_000 },
  { minAmount: 3_000_000_000,  maxAmount: 4_000_000_000, baseFee: 2_300_000 },
  { minAmount: 4_000_000_000,  maxAmount: 5_000_000_000, baseFee: 2_500_000 },
];

// IITP: KEIT 대비 5천만원 미만 구간이 추가로 있음
export const IITP_BRACKETS: FeeRateBracket[] = [
  { minAmount: 0,              maxAmount: 50_000_000,     baseFee: 600_000   },
  { minAmount: 50_000_000,     maxAmount: 100_000_000,    baseFee: 987_000   },
  { minAmount: 100_000_000,    maxAmount: 300_000_000,    baseFee: 1_185_000 },
  { minAmount: 300_000_000,    maxAmount: 500_000_000,    baseFee: 1_515_000 },
  { minAmount: 500_000_000,    maxAmount: 1_000_000_000,  baseFee: 1_647_000 },
  { minAmount: 1_000_000_000,  maxAmount: 3_000_000_000,  baseFee: 1_845_000 },
  { minAmount: 3_000_000_000,  maxAmount: null,            baseFee: 2_043_000 },
];

// IITP ICT 기금사업 전용 — 국가연구개발사업이 아닌 기금사업. 단계정산 없이 매년 100% 청구,
// 공동기관 구분 없이 참여기관별로 각자의 사업비를 이 구간표에 대입해 개별 산정한다 (calcMode: "PER_INSTITUTION").
export const IITP_ICT_BRACKETS: FeeRateBracket[] = [
  { minAmount: 0,              maxAmount: 50_000_000,     baseFee: 600_000   },
  { minAmount: 50_000_000,     maxAmount: 100_000_000,    baseFee: 800_000   },
  { minAmount: 100_000_000,    maxAmount: 300_000_000,    baseFee: 1_000_000 },
  { minAmount: 300_000_000,    maxAmount: 500_000_000,    baseFee: 1_500_000 },
  { minAmount: 500_000_000,    maxAmount: 1_000_000_000,  baseFee: 1_600_000 },
  { minAmount: 1_000_000_000,  maxAmount: 3_000_000_000,  baseFee: 1_800_000 },
  { minAmount: 3_000_000_000,  maxAmount: null,            baseFee: 2_100_000 },
];

// 농촌진흥청(RDA1/RDA2) 공용 — 현금+현물 합산 기준
export const RDA_BRACKETS: FeeRateBracket[] = [
  { minAmount: 0,              maxAmount: 50_000_000,     baseFee: 750_000   },
  { minAmount: 50_000_000,     maxAmount: 100_000_000,    baseFee: 820_000   },
  { minAmount: 100_000_000,    maxAmount: 200_000_000,    baseFee: 980_000   },
  { minAmount: 200_000_000,    maxAmount: 300_000_000,    baseFee: 1_080_000 },
  { minAmount: 300_000_000,    maxAmount: 500_000_000,    baseFee: 1_320_000 },
  { minAmount: 500_000_000,    maxAmount: 1_000_000_000,  baseFee: 1_440_000 },
  { minAmount: 1_000_000_000,  maxAmount: null,            baseFee: 1_800_000 },
];

export const feePolicies: FeePolicy[] = [
  // ─── 공통(전역) 정책 ───────────────────────────────────────
  {
    id: "pol-003",
    agencyId: null,
    name: "2024년 하반기 정책",
    version: "v2024.2",
    effectiveFrom: "2024-07-01",
    effectiveTo: null,
    status: "ACTIVE",
    standardRate: 3.0,
    description: "표준수수료율 3.0% 기준 — 등급별 산출 비율은 아래 기준표 참조",
    createdAt: "2024-06-20",
    createdBy: "김관리",
    feeRateBrackets: KEIT_BRACKETS,
    coInstAddonMethod: "TIERED" as const,
    exemptGrades: ["S", "A~C"],
    exemptionMode: "DISCOUNT" as const,
    feeBasis: "CASH" as const,
    hasAutonomyTrack: true,
    annualBillingRate: 0.85,
  },
  {
    id: "pol-002",
    agencyId: null,
    name: "2024년 상반기 정책",
    version: "v2024.1",
    effectiveFrom: "2024-01-01",
    effectiveTo: "2024-06-30",
    status: "EXPIRED",
    standardRate: 2.8,
    description: "표준수수료율 2.8% 기준",
    createdAt: "2023-12-15",
    createdBy: "김관리",
    feeRateBrackets: KEIT_BRACKETS,
    coInstAddonMethod: "TIERED" as const,
    exemptGrades: ["S", "A~C"],
    exemptionMode: "DISCOUNT" as const,
    feeBasis: "CASH" as const,
    hasAutonomyTrack: true,
    annualBillingRate: 0.85,
  },
  {
    id: "pol-001",
    agencyId: null,
    name: "2023년 정책",
    version: "v2023.1",
    effectiveFrom: "2023-01-01",
    effectiveTo: "2023-12-31",
    status: "EXPIRED",
    standardRate: 2.8,
    description: "표준수수료율 2.8% 기준",
    createdAt: "2022-12-20",
    createdBy: "이회계",
    feeRateBrackets: KEIT_BRACKETS,
    coInstAddonMethod: "TIERED" as const,
    exemptGrades: ["S", "A~C"],
    exemptionMode: "DISCOUNT" as const,
    feeBasis: "CASH" as const,
    hasAutonomyTrack: true,
    annualBillingRate: 0.85,
  },
  // ─── KEIT (fa-001) 전담기관 자체 정책 ───────────────────────
  {
    id: "pol-keit-002",
    agencyId: "fa-001",
    name: "KEIT 2024 정책",
    version: "v2024.KEIT",
    effectiveFrom: "2024-07-01",
    effectiveTo: null,
    status: "ACTIVE",
    standardRate: 2.8,
    description: "KEIT 자체 표준수수료율 2.8% — 공통 대비 0.2%p 인하",
    createdAt: "2024-06-15",
    createdBy: "김관리",
    feeRateBrackets: KEIT_BRACKETS,
    coInstAddonMethod: "TIERED" as const,
    exemptGrades: ["S", "A~C"],
    exemptionMode: "DISCOUNT" as const,
    defaultSettlementType: "자체정산" as const,
    feeBasis: "CASH" as const,
    hasAutonomyTrack: true,
    annualBillingRate: 0.85,
  },
  {
    id: "pol-keit-001",
    agencyId: "fa-001",
    name: "KEIT 2023 정책",
    version: "v2023.KEIT",
    effectiveFrom: "2023-01-01",
    effectiveTo: "2024-06-30",
    status: "EXPIRED",
    standardRate: 2.8,
    description: "KEIT 최초 자체 정책 도입",
    createdAt: "2022-12-10",
    createdBy: "이회계",
    feeRateBrackets: KEIT_BRACKETS,
    coInstAddonMethod: "TIERED" as const,
    exemptGrades: ["S", "A~C"],
    exemptionMode: "DISCOUNT" as const,
    defaultSettlementType: "자체정산" as const,
    feeBasis: "CASH" as const,
    hasAutonomyTrack: true,
    annualBillingRate: 0.85,
  },
  // ─── KETEP (fa-002) 전담기관 자체 정책 ──────────────────────
  {
    id: "pol-ketep-001",
    agencyId: "fa-002",
    name: "KETEP 2024 정책",
    version: "v2024.KETEP",
    effectiveFrom: "2024-01-01",
    effectiveTo: null,
    status: "ACTIVE",
    standardRate: 3.5,
    description: "KETEP 자체 정책 — S등급만 면제, 가산금 일률 10%×N, 자율성트랙 없음",
    createdAt: "2023-12-20",
    createdBy: "김관리",
    feeRateBrackets: KETEP_BRACKETS,
    coInstAddonMethod: "FLAT" as const,
    exemptGrades: ["S"],
    exemptionMode: "DISCOUNT" as const,
    feeBasis: "CASH" as const,
    hasAutonomyTrack: false,
    annualBillingRate: 0.85,
    legacyTransitionNote:
      "26년 이후 수수료체계 변경 — 26년 이전(pre-2026) 과제의 미청구수수료는 이전 수수료체계로 산정된 금액의 15%를 적용해야 하며, " +
      "새 구간표로 소급 재계산하지 말고 해당 연차의 실제 청구/미청구 금액을 그대로 유지한 뒤 수기 입력으로 조정할 것.",
  },
  // ─── IITP (fa-003) 전담기관 자체 정책 ───────────────────────
  // IITP 특이사항: S등급은 업무 자체를 안 하므로 산정기준액에서 완전 제외, A~C는 면제 없음(일반과 동일 위탁정산), 자율성트랙 없음
  {
    id: "pol-iitp-001",
    agencyId: "fa-003",
    name: "IITP 2024 정책",
    version: "v2024.IITP",
    effectiveFrom: "2024-01-01",
    effectiveTo: null,
    status: "ACTIVE",
    standardRate: 3.0,
    description: "정보통신 분야 표준수수료율 3.0% — IITP 전용 구간표, S등급 완전 제외, 자율성트랙 없음",
    createdAt: "2023-12-20",
    createdBy: "김관리",
    feeRateBrackets: IITP_BRACKETS,
    coInstAddonMethod: "TIERED" as const,
    exemptGrades: ["S"],
    exemptionMode: "EXCLUDE" as const,
    feeBasis: "CASH" as const,
    hasAutonomyTrack: false,
    annualBillingRate: 0.85,
    programType: "GENERAL" as const,
  },
  // ─── IITP ICT 기금사업 (fa-003) — 국가연구개발사업이 아닌 별도 기금사업 ──
  // 단계정산 없이 매년 100% 청구, 공동기관 구분 없이 참여기관별로 개별 산정·청구함
  {
    id: "pol-iitp-ict-001",
    agencyId: "fa-003",
    name: "IITP ICT 기금사업 2024 정책",
    version: "v2024.IITP-ICT",
    effectiveFrom: "2024-01-01",
    effectiveTo: null,
    status: "ACTIVE",
    standardRate: 3.0,
    description: "ICT 기금사업 전용 — IITP 일반 R&D 구간표와 다른 별도 구간표 적용, 참여기관별 개별 산정, 매년 100% 청구(단계정산 없음)",
    createdAt: "2023-12-20",
    createdBy: "김관리",
    feeRateBrackets: IITP_ICT_BRACKETS,
    coInstAddonMethod: "TIERED" as const,
    exemptGrades: [],
    exemptionMode: "DISCOUNT" as const,
    feeBasis: "CASH" as const,
    hasAutonomyTrack: false,
    annualBillingRate: 1.0,
    calcMode: "PER_INSTITUTION" as const,
    programType: "ICT_FUND" as const,
  },
  // ─── KOFPI (fa-004) 전담기관 자체 정책 ──────────────────────
  // KOFPI 특이사항: 면제기관 없음(S/A~C 전부 일반 취급), 연차상시도 100%, 자율성트랙 없음
  {
    id: "pol-kofpi-001",
    agencyId: "fa-004",
    name: "KOFPI 2024 정책",
    version: "v2024.KOFPI",
    effectiveFrom: "2024-01-01",
    effectiveTo: null,
    status: "ACTIVE",
    standardRate: 2.5,
    description: "KOFPI — S·A~C 면제 없음, 연차상시 100% 청구, 자율성트랙 없음",
    createdAt: "2023-12-20",
    createdBy: "김관리",
    feeRateBrackets: KOFPI_BRACKETS,
    coInstAddonMethod: "TIERED" as const,
    exemptGrades: [],
    exemptionMode: "DISCOUNT" as const,
    feeBasis: "CASH" as const,
    hasAutonomyTrack: false,
    annualBillingRate: 1.0,
  },
  // ─── RDA1 (fa-005) 전담기관 자체 정책 ───────────────────────
  // RDA1 특이사항: 현금+현물 합산 기준, S등급은 산정기준액에서 완전 제외, A~C는 면제 없음, 자율성트랙 없음
  {
    id: "pol-rda1-001",
    agencyId: "fa-005",
    name: "농진청(RDA1) 2024 정책",
    version: "v2024.RDA1",
    effectiveFrom: "2024-01-01",
    effectiveTo: null,
    status: "ACTIVE",
    standardRate: 2.8,
    description: "농촌진흥청 1유형(일반기관 트랙) — RDA 전용 구간표(현금+현물 기준), S등급 완전 제외, 자율성트랙 없음",
    createdAt: "2023-12-20",
    createdBy: "김관리",
    feeRateBrackets: RDA_BRACKETS,
    coInstAddonMethod: "TIERED" as const,
    exemptGrades: ["S"],
    exemptionMode: "EXCLUDE" as const,
    feeBasis: "CASH_PLUS_INKIND" as const,
    hasAutonomyTrack: false,
    annualBillingRate: 0.85,
    minimumFee: 100_000,
  },
  // ─── RDA2 (fa-006) 전담기관 자체 정책 ───────────────────────
  {
    id: "pol-rda2-001",
    agencyId: "fa-006",
    name: "농진청(RDA2) 2024 정책",
    version: "v2024.RDA2",
    effectiveFrom: "2024-01-01",
    effectiveTo: null,
    status: "ACTIVE",
    standardRate: 2.8,
    description: "농촌진흥청 2유형(소속기관 트랙) — RDA1과 동일 기준(현금+현물, S등급 완전 제외). " +
      "주관기관이 농촌진흥청 소속기관인 경우 주관기관을 산정기준에서 제외하고 공동기관수를 -1 보정한 뒤 " +
      "일반 수수료를 공동기관별 사업비 비율로 배분해 표시함(excludeLeadFromCalc). " +
      "(*) 다만 공동기관별 개별 세금계산서 발행(분리 청구) 워크플로는 아직 미구현 — 현재는 참여기관 목록에서 배분된 산정액만 확인 가능.",
    createdAt: "2023-12-20",
    createdBy: "김관리",
    feeRateBrackets: RDA_BRACKETS,
    coInstAddonMethod: "TIERED" as const,
    exemptGrades: ["S"],
    exemptionMode: "EXCLUDE" as const,
    feeBasis: "CASH_PLUS_INKIND" as const,
    hasAutonomyTrack: false,
    annualBillingRate: 0.85,
    minimumFee: 100_000,
    excludeLeadFromCalc: true,
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
  status: "SCHEDULED" | "DRAFT" | "CONFIRMED" | "BILLED"; // SCHEDULED = 연차 미시작, BILLED = 세금계산서 발행됨
  isAutoGenerated?: boolean; // 자동 산정 여부
  standardFee?: number; // 표준수수료 — 일반기관은 산정액과 동일, 면제기관은 할인 반영 전 원래 몫
  unclaimedFee?: number; // 미청구수수료 — 이번 연차에 걷지 않고 남기는 몫 (정산 연차의 일반기관은 항상 0)
}

// 전담기관(6곳)당 1건씩만 남긴 더미 — 발송대상(noticeRecipientScope) 차이를 바로 확인할 수 있도록
// LEAD_ONLY(KEIT/KETEP/IITP/KOFPI)는 주관기관만 BILLED·참여기관은 CONFIRMED, LEAD_AND_PARTICIPANTS(RDA1/RDA2)는 전원 BILLED로 맞춰둠.
// KEIT/KETEP/IITP/KOFPI 4건은 calcTermFee 실제 정책 로직으로 재계산한 값으로 교체함(참여기관 annualBudgets도 동일 값으로 채움).
// RDA1/RDA2 2건은 아직 예전 손입력 더미 그대로 — RDA는 S등급 완전제외(EXCLUDE) 규칙이 있어 별도 확인 후 정정 필요.
export const termFees: TermFee[] = [
  // p-001 2연차 — 주관: 삼화전자 (KEIT · 주관기관만 발송)
  { id: "tf-001", projectNumber: "RS-2024-00214837", projectName: "초정밀 광학 센서 모듈 개발 및 양산화", termYear: 2024, termNumber: 2, institutionId: "inst-001", institutionName: "삼화전자(주)", institutionType: "중소기업", budget: 700_000_000, feeRate: 2.8, calculatedFee: 1_291_500, appliedFee: 1_097_775, standardFee: 1_291_500, unclaimedFee: 193_725, status: "BILLED" },
  { id: "tf-002", projectNumber: "RS-2024-00214837", projectName: "초정밀 광학 센서 모듈 개발 및 양산화", termYear: 2024, termNumber: 2, institutionId: "inst-002", institutionName: "한국과학기술연구원", institutionType: "정부출연연구소", budget: 1_200_000_000, feeRate: 2.8, calculatedFee: 130_235, appliedFee: 110_700, standardFee: 130_235, unclaimedFee: 19_535, status: "CONFIRMED" },
  { id: "tf-003", projectNumber: "RS-2024-00214837", projectName: "초정밀 광학 센서 모듈 개발 및 양산화", termYear: 2024, termNumber: 2, institutionId: "inst-004", institutionName: "연세대학교", institutionType: "대학", budget: 500_000_000, feeRate: 2.8, calculatedFee: 54_265, appliedFee: 46_125, standardFee: 54_265, unclaimedFee: 8_140, status: "CONFIRMED" },
  { id: "tf-004", projectNumber: "RS-2024-00214837", projectName: "초정밀 광학 센서 모듈 개발 및 양산화", termYear: 2024, termNumber: 2, institutionId: "inst-005", institutionName: "나노소재기술(주)", institutionType: "스타트업", budget: 400_000_000, feeRate: 2.8, calculatedFee: 738_000, appliedFee: 627_300, standardFee: 738_000, unclaimedFee: 110_700, status: "CONFIRMED" },

  // p-002 1~3연차 — 과제 구성 예시(P001·A과제) 템플릿 기준 재구성 후 calcTermFee 실제 정책 로직으로
  // 재계산한 값(KETEP DISCOUNT 모드, 연세대=최우수·자체정산 유지). 시딩 시점에 바로 "수수료 청구 관리"
  // 목록에 나타나도록 autoGenerateTermFees를 거치지 않고 정적으로 채워둠 — 참여기관 추가/사업비 수정
  // 등으로 실제 편집이 발생하면 이후엔 자동 재계산 경로를 탄다.
  // (아래 receivables/taxInvoices/emailDispatches/settlements/projectIssues의 옛 1연차 관련 기록은
  //  구성 변경 전 금액·기관 기준으로 남아 있으므로 별도로 정리가 필요함)
  { id: "tf-005", projectNumber: "RS-2024-00198321", projectName: "차세대 이차전지 양극재 소재 국산화", termYear: 2024, termNumber: 1, institutionId: "inst-003", institutionName: "(주)에너텍솔루션", institutionType: "중견기업", budget: 200_000_000, feeRate: 3.5, calculatedFee: 1_212_000, appliedFee: 1_030_200, standardFee: 1_212_000, unclaimedFee: 181_800, status: "DRAFT" },
  { id: "tf-006", projectNumber: "RS-2024-00198321", projectName: "차세대 이차전지 양극재 소재 국산화", termYear: 2024, termNumber: 1, institutionId: "inst-004", institutionName: "연세대학교", institutionType: "대학", budget: 100_000_000, feeRate: 3.5, calculatedFee: 151_500, appliedFee: 128_775, standardFee: 151_500, unclaimedFee: 22_725, status: "DRAFT" },
  { id: "tf-007", projectNumber: "RS-2024-00198321", projectName: "차세대 이차전지 양극재 소재 국산화", termYear: 2024, termNumber: 1, institutionId: "inst-002", institutionName: "한국과학기술연구원", institutionType: "정부출연연구소", budget: 50_000_000, feeRate: 3.5, calculatedFee: 303_000, appliedFee: 257_550, standardFee: 303_000, unclaimedFee: 45_450, status: "DRAFT" },
  { id: "tf-010", projectNumber: "RS-2024-00198321", projectName: "차세대 이차전지 양극재 소재 국산화", termYear: 2024, termNumber: 1, institutionId: "inst-011", institutionName: "하이테크머티리얼(주)", institutionType: "스타트업", budget: 50_000_000, feeRate: 3.5, calculatedFee: 303_000, appliedFee: 257_550, standardFee: 303_000, unclaimedFee: 45_450, status: "DRAFT" },
  { id: "tf-p002-y2-lead", projectNumber: "RS-2024-00198321", projectName: "차세대 이차전지 양극재 소재 국산화", termYear: 2025, termNumber: 2, institutionId: "inst-003", institutionName: "(주)에너텍솔루션", institutionType: "중견기업", budget: 300_000_000, feeRate: 3.5, calculatedFee: 1_185_840, appliedFee: 1_007_964, standardFee: 1_185_840, unclaimedFee: 177_876, status: "DRAFT" },
  { id: "tf-p002-y2-s", projectNumber: "RS-2024-00198321", projectName: "차세대 이차전지 양극재 소재 국산화", termYear: 2025, termNumber: 2, institutionId: "inst-004", institutionName: "연세대학교", institutionType: "대학", budget: 150_000_000, feeRate: 3.5, calculatedFee: 164_700, appliedFee: 139_995, standardFee: 164_700, unclaimedFee: 24_705, status: "DRAFT" },
  { id: "tf-p002-y2-a", projectNumber: "RS-2024-00198321", projectName: "차세대 이차전지 양극재 소재 국산화", termYear: 2025, termNumber: 2, institutionId: "inst-002", institutionName: "한국과학기술연구원", institutionType: "정부출연연구소", budget: 100_000_000, feeRate: 3.5, calculatedFee: 395_280, appliedFee: 335_988, standardFee: 395_280, unclaimedFee: 59_292, status: "DRAFT" },
  { id: "tf-p002-y2-b", projectNumber: "RS-2024-00198321", projectName: "차세대 이차전지 양극재 소재 국산화", termYear: 2025, termNumber: 2, institutionId: "inst-011", institutionName: "하이테크머티리얼(주)", institutionType: "스타트업", budget: 100_000_000, feeRate: 3.5, calculatedFee: 395_280, appliedFee: 335_988, standardFee: 395_280, unclaimedFee: 59_292, status: "DRAFT" },
  { id: "tf-p002-y3-lead", projectNumber: "RS-2024-00198321", projectName: "차세대 이차전지 양극재 소재 국산화", termYear: 2026, termNumber: 3, institutionId: "inst-003", institutionName: "(주)에너텍솔루션", institutionType: "중견기업", budget: 400_000_000, feeRate: 3.5, calculatedFee: 1_054_080, appliedFee: 1_413_756, standardFee: 1_054_080, unclaimedFee: 0, status: "DRAFT" },
  { id: "tf-p002-y3-s", projectNumber: "RS-2024-00198321", projectName: "차세대 이차전지 양극재 소재 국산화", termYear: 2026, termNumber: 3, institutionId: "inst-004", institutionName: "연세대학교", institutionType: "대학", budget: 300_000_000, feeRate: 3.5, calculatedFee: 422_100, appliedFee: 358_785, standardFee: 422_100, unclaimedFee: 63_315, status: "DRAFT" },
  { id: "tf-p002-y3-a", projectNumber: "RS-2024-00198321", projectName: "차세대 이차전지 양극재 소재 국산화", termYear: 2026, termNumber: 3, institutionId: "inst-002", institutionName: "한국과학기술연구원", institutionType: "정부출연연구소", budget: 200_000_000, feeRate: 3.5, calculatedFee: 527_040, appliedFee: 631_782, standardFee: 527_040, unclaimedFee: 0, status: "DRAFT" },
  { id: "tf-p002-y3-b", projectNumber: "RS-2024-00198321", projectName: "차세대 이차전지 양극재 소재 국산화", termYear: 2026, termNumber: 3, institutionId: "inst-011", institutionName: "하이테크머티리얼(주)", institutionType: "스타트업", budget: 150_000_000, feeRate: 3.5, calculatedFee: 395_280, appliedFee: 500_022, standardFee: 395_280, unclaimedFee: 0, status: "DRAFT" },

  // p-011 1~3연차 — p-002와 동일한 "과제 구성 예시(P001·A과제)" 템플릿을 다른 기관 구성으로 재현
  // (KETEP DISCOUNT 모드, 부산대학교=최우수·자체정산 유지). p-002와 마찬가지로 시딩 시점에 바로
  // "수수료 청구 관리" 목록에 나타나도록 autoGenerateTermFees를 거치지 않고 정적으로 채워둠.
  { id: "tf-p011-y1-lead", projectNumber: "RS-2024-00237560", projectName: "고효율 수소연료전지 스택 소재 개발", termYear: 2024, termNumber: 1, institutionId: "inst-001", institutionName: "삼화전자(주)", institutionType: "중소기업", budget: 200_000_000, feeRate: 3.5, calculatedFee: 1_212_000, appliedFee: 1_030_200, standardFee: 1_212_000, unclaimedFee: 181_800, status: "DRAFT" },
  { id: "tf-p011-y1-s", projectNumber: "RS-2024-00237560", projectName: "고효율 수소연료전지 스택 소재 개발", termYear: 2024, termNumber: 1, institutionId: "inst-007", institutionName: "부산대학교", institutionType: "대학", budget: 100_000_000, feeRate: 3.5, calculatedFee: 151_500, appliedFee: 128_775, standardFee: 151_500, unclaimedFee: 22_725, status: "DRAFT" },
  { id: "tf-p011-y1-a", projectNumber: "RS-2024-00237560", projectName: "고효율 수소연료전지 스택 소재 개발", termYear: 2024, termNumber: 1, institutionId: "inst-008", institutionName: "그린바이오텍(주)", institutionType: "중소기업", budget: 50_000_000, feeRate: 3.5, calculatedFee: 303_000, appliedFee: 257_550, standardFee: 303_000, unclaimedFee: 45_450, status: "DRAFT" },
  { id: "tf-p011-y1-b", projectNumber: "RS-2024-00237560", projectName: "고효율 수소연료전지 스택 소재 개발", termYear: 2024, termNumber: 1, institutionId: "inst-009", institutionName: "(주)미래반도체", institutionType: "중소기업", budget: 50_000_000, feeRate: 3.5, calculatedFee: 303_000, appliedFee: 257_550, standardFee: 303_000, unclaimedFee: 45_450, status: "DRAFT" },
  { id: "tf-p011-y2-lead", projectNumber: "RS-2024-00237560", projectName: "고효율 수소연료전지 스택 소재 개발", termYear: 2025, termNumber: 2, institutionId: "inst-001", institutionName: "삼화전자(주)", institutionType: "중소기업", budget: 300_000_000, feeRate: 3.5, calculatedFee: 1_185_840, appliedFee: 1_007_964, standardFee: 1_185_840, unclaimedFee: 177_876, status: "DRAFT" },
  { id: "tf-p011-y2-s", projectNumber: "RS-2024-00237560", projectName: "고효율 수소연료전지 스택 소재 개발", termYear: 2025, termNumber: 2, institutionId: "inst-007", institutionName: "부산대학교", institutionType: "대학", budget: 150_000_000, feeRate: 3.5, calculatedFee: 164_700, appliedFee: 139_995, standardFee: 164_700, unclaimedFee: 24_705, status: "DRAFT" },
  { id: "tf-p011-y2-a", projectNumber: "RS-2024-00237560", projectName: "고효율 수소연료전지 스택 소재 개발", termYear: 2025, termNumber: 2, institutionId: "inst-008", institutionName: "그린바이오텍(주)", institutionType: "중소기업", budget: 100_000_000, feeRate: 3.5, calculatedFee: 395_280, appliedFee: 335_988, standardFee: 395_280, unclaimedFee: 59_292, status: "DRAFT" },
  { id: "tf-p011-y2-b", projectNumber: "RS-2024-00237560", projectName: "고효율 수소연료전지 스택 소재 개발", termYear: 2025, termNumber: 2, institutionId: "inst-009", institutionName: "(주)미래반도체", institutionType: "중소기업", budget: 100_000_000, feeRate: 3.5, calculatedFee: 395_280, appliedFee: 335_988, standardFee: 395_280, unclaimedFee: 59_292, status: "DRAFT" },
  { id: "tf-p011-y3-lead", projectNumber: "RS-2024-00237560", projectName: "고효율 수소연료전지 스택 소재 개발", termYear: 2026, termNumber: 3, institutionId: "inst-001", institutionName: "삼화전자(주)", institutionType: "중소기업", budget: 400_000_000, feeRate: 3.5, calculatedFee: 1_054_080, appliedFee: 1_413_756, standardFee: 1_054_080, unclaimedFee: 0, status: "DRAFT" },
  { id: "tf-p011-y3-s", projectNumber: "RS-2024-00237560", projectName: "고효율 수소연료전지 스택 소재 개발", termYear: 2026, termNumber: 3, institutionId: "inst-007", institutionName: "부산대학교", institutionType: "대학", budget: 300_000_000, feeRate: 3.5, calculatedFee: 422_100, appliedFee: 358_785, standardFee: 422_100, unclaimedFee: 63_315, status: "DRAFT" },
  { id: "tf-p011-y3-a", projectNumber: "RS-2024-00237560", projectName: "고효율 수소연료전지 스택 소재 개발", termYear: 2026, termNumber: 3, institutionId: "inst-008", institutionName: "그린바이오텍(주)", institutionType: "중소기업", budget: 200_000_000, feeRate: 3.5, calculatedFee: 527_040, appliedFee: 631_782, standardFee: 527_040, unclaimedFee: 0, status: "DRAFT" },
  { id: "tf-p011-y3-b", projectNumber: "RS-2024-00237560", projectName: "고효율 수소연료전지 스택 소재 개발", termYear: 2026, termNumber: 3, institutionId: "inst-009", institutionName: "(주)미래반도체", institutionType: "중소기업", budget: 150_000_000, feeRate: 3.5, calculatedFee: 395_280, appliedFee: 500_022, standardFee: 395_280, unclaimedFee: 0, status: "DRAFT" },

  // p-003 1연차 2022 — 주관: 나노소재기술 (IITP · 주관기관만 발송)
  { id: "tf-031", projectNumber: "RS-2024-00201547", projectName: "스마트 제조공정 AI 품질예측 시스템", termYear: 2022, termNumber: 1, institutionId: "inst-005", institutionName: "나노소재기술(주)", institutionType: "스타트업", budget: 600_000_000, feeRate: 3.0, calculatedFee: 1_060_875, appliedFee: 901_744, status: "BILLED" },
  { id: "tf-032", projectNumber: "RS-2024-00201547", projectName: "스마트 제조공정 AI 품질예측 시스템", termYear: 2022, termNumber: 1, institutionId: "inst-002", institutionName: "한국과학기술연구원", institutionType: "정부출연연구소", budget: 400_000_000, feeRate: 3.0, calculatedFee: 707_250, appliedFee: 601_163, status: "CONFIRMED" },
  { id: "tf-033", projectNumber: "RS-2024-00201547", projectName: "스마트 제조공정 AI 품질예측 시스템", termYear: 2022, termNumber: 1, institutionId: "inst-007", institutionName: "부산대학교", institutionType: "대학", budget: 200_000_000, feeRate: 3.0, calculatedFee: 353_625, appliedFee: 300_581, status: "CONFIRMED" },

  // p-004 2연차 — 주관: 연세대학교 (KOFPI · 주관기관만 발송)
  { id: "tf-013", projectNumber: "RS-2023-00187652", projectName: "바이오 플라스틱 생분해성 소재 개발", termYear: 2024, termNumber: 2, institutionId: "inst-004", institutionName: "연세대학교", institutionType: "대학", budget: 1_500_000_000, feeRate: 2.5, calculatedFee: 1_391_129, appliedFee: 1_391_129, status: "BILLED" },
  { id: "tf-014", projectNumber: "RS-2023-00187652", projectName: "바이오 플라스틱 생분해성 소재 개발", termYear: 2024, termNumber: 2, institutionId: "inst-003", institutionName: "(주)에너텍솔루션", institutionType: "중견기업", budget: 800_000_000, feeRate: 2.5, calculatedFee: 741_935, appliedFee: 741_935, status: "CONFIRMED" },
  { id: "tf-015", projectNumber: "RS-2023-00187652", projectName: "바이오 플라스틱 생분해성 소재 개발", termYear: 2024, termNumber: 2, institutionId: "inst-008", institutionName: "그린바이오텍(주)", institutionType: "중소기업", budget: 500_000_000, feeRate: 2.5, calculatedFee: 463_710, appliedFee: 463_710, status: "CONFIRMED" },
  { id: "tf-016", projectNumber: "RS-2023-00187652", projectName: "바이오 플라스틱 생분해성 소재 개발", termYear: 2024, termNumber: 2, institutionId: "inst-002", institutionName: "한국과학기술연구원", institutionType: "정부출연연구소", budget: 200_000_000, feeRate: 2.5, calculatedFee: 185_484, appliedFee: 185_484, status: "CONFIRMED" },
  { id: "tf-017", projectNumber: "RS-2023-00187652", projectName: "바이오 플라스틱 생분해성 소재 개발", termYear: 2024, termNumber: 2, institutionId: "inst-007", institutionName: "부산대학교", institutionType: "대학", budget: 100_000_000, feeRate: 2.5, calculatedFee: 92_742, appliedFee: 92_742, status: "CONFIRMED" },

  // p-007 3연차 — 주관: (주)한국항공우주 (RDA1 · 주관+참여기관 모두 발송 → 전원 청구완료)
  { id: "tf-022", projectNumber: "RS-2023-00176431", projectName: "도심항공모빌리티(UAM) 경량화 구조재 개발", termYear: 2024, termNumber: 3, institutionId: "inst-006", institutionName: "(주)한국항공우주", institutionType: "중견기업", budget: 1_200_000_000, feeRate: 2.5, calculatedFee: 30_000_000, appliedFee: 30_000_000, status: "BILLED" },
  { id: "tf-023", projectNumber: "RS-2023-00176431", projectName: "도심항공모빌리티(UAM) 경량화 구조재 개발", termYear: 2024, termNumber: 3, institutionId: "inst-001", institutionName: "삼화전자(주)", institutionType: "중소기업", budget: 1_200_000_000, feeRate: 3.0, calculatedFee: 36_000_000, appliedFee: 36_000_000, status: "BILLED" },
  { id: "tf-024", projectNumber: "RS-2023-00176431", projectName: "도심항공모빌리티(UAM) 경량화 구조재 개발", termYear: 2024, termNumber: 3, institutionId: "inst-004", institutionName: "연세대학교", institutionType: "대학", budget: 1_500_000_000, feeRate: 2.0, calculatedFee: 30_000_000, appliedFee: 30_000_000, status: "BILLED" },
  { id: "tf-025", projectNumber: "RS-2023-00176431", projectName: "도심항공모빌리티(UAM) 경량화 구조재 개발", termYear: 2024, termNumber: 3, institutionId: "inst-002", institutionName: "한국과학기술연구원", institutionType: "정부출연연구소", budget: 1_000_000_000, feeRate: 2.0, calculatedFee: 20_000_000, appliedFee: 20_000_000, status: "BILLED" },

  // p-008 1연차 2023 — 주관: 그린바이오텍 (RDA2 · 주관+참여기관 모두 발송 → 전원 청구완료)
  { id: "tf-037", projectNumber: "RS-2024-00219874", projectName: "의료용 생체흡수성 임플란트 소재 개발", termYear: 2023, termNumber: 1, institutionId: "inst-008", institutionName: "그린바이오텍(주)", institutionType: "중소기업", budget: 1_100_000_000, feeRate: 3.0, calculatedFee: 33_000_000, appliedFee: 33_000_000, status: "BILLED" },
  { id: "tf-038", projectNumber: "RS-2024-00219874", projectName: "의료용 생체흡수성 임플란트 소재 개발", termYear: 2023, termNumber: 1, institutionId: "inst-004", institutionName: "연세대학교", institutionType: "대학", budget: 350_000_000, feeRate: 2.0, calculatedFee: 7_000_000, appliedFee: 7_000_000, status: "BILLED" },
  { id: "tf-039", projectNumber: "RS-2024-00219874", projectName: "의료용 생체흡수성 임플란트 소재 개발", termYear: 2023, termNumber: 1, institutionId: "inst-002", institutionName: "한국과학기술연구원", institutionType: "정부출연연구소", budget: 200_000_000, feeRate: 2.0, calculatedFee: 4_000_000, appliedFee: 4_000_000, status: "BILLED" },
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
    dueDate: "2024-07-29",
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
    dueDate: "2025-01-14",
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
    dueDate: "2024-11-14",
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
    dueDate: "2024-12-19",
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
    dueDate: "2024-10-19",
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
    dueDate: "2023-10-14",
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
    dueDate: "2023-03-30",
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
    dueDate: "2024-03-27",
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
    dueDate: "2024-03-30",
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
    dueDate: "2023-03-30",
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
    dueDate: "2023-09-29",
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
    dueDate: "2024-03-19",
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
    dueDate: "2024-01-19",
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
    dueDate: "2022-12-29",
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
    dueDate: "2023-12-24",
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

// emailType: TAX_INVOICE=세금계산서 공문(청구서/역발행 요청), FEE_DETAIL=수수료 산출내역 안내,
//            SETTLEMENT_NOTICE=정산절차 안내 공문, OTHER=기타 공문(자유 양식)
// feeCategory: TAX_INVOICE일 때만 사용 — ANNUAL=연차상시점검수수료, SETTLEMENT=위탁정산수수료
// isReverseRequest: TAX_INVOICE이면서 역발행 요청 공문으로 발송된 경우 true
// 발송 당시 실제 화면에 표시됐던 정산절차 안내 공문 내용을 그대로 재현하기 위한 스냅샷.
// 템플릿은 이후에도 계속 수정될 수 있으므로, 발송 시점의 값을 EmailDispatch에 그대로 복제해 저장한다.
export interface NoticeSnapshot {
  template: AgencyNoticeTemplate;
  statusRows: { label: string; value: string }[];
  docNumber: string;
  issuedDate: string;
}

export interface EmailDispatch {
  id: string;
  batchId: string;
  sentAt: string;
  senderName: string;      // 발송인
  recipientInstitution: string;
  recipientEmail: string;
  subject: string;
  emailType: "TAX_INVOICE" | "FEE_DETAIL" | "SETTLEMENT_NOTICE" | "OTHER";
  feeCategory?: "ANNUAL" | "SETTLEMENT";
  isReverseRequest?: boolean;
  attachments: string[];
  status: "SUCCESS" | "FAILED" | "PENDING";
  /** 발송된 이메일 본문 (일반 안내 메일). 정산절차 안내 공문은 noticeSnapshot을 대신 사용. */
  body?: string;
  /** 정산절차 안내 공문(SETTLEMENT_NOTICE) 발송 시점의 공문 서식 스냅샷 */
  noticeSnapshot?: NoticeSnapshot;
}

export const emailDispatches: EmailDispatch[] = [
  {
    id: "em-001", batchId: "BATCH-2024-1115", sentAt: "2024-11-15 09:10",
    senderName: "이회계",
    recipientInstitution: "삼화전자(주)", recipientEmail: "lee.ys@samhwa.co.kr",
    subject: "[RS-2024-00214837] 2연차 연차상시점검수수료 청구서",
    emailType: "TAX_INVOICE", feeCategory: "ANNUAL",
    attachments: ["청구서_RS-2024-00214837_2연차.pdf", "사업자등록증.pdf"],
    status: "SUCCESS",
  },
  {
    id: "em-002", batchId: "BATCH-2024-1115", sentAt: "2024-11-15 09:11",
    senderName: "이회계",
    recipientInstitution: "(주)에너텍솔루션", recipientEmail: "kim.mj@enertech.co.kr",
    subject: "[RS-2023-00187652] 2연차 수수료 산출내역 안내",
    emailType: "FEE_DETAIL",
    attachments: ["수수료산출내역_RS-2023-00187652_2연차.pdf"],
    status: "SUCCESS",
  },
  {
    id: "em-003", batchId: "BATCH-2024-1115", sentAt: "2024-11-15 09:11",
    senderName: "박정산",
    recipientInstitution: "(주)에너텍솔루션", recipientEmail: "kim.mj@enertech.co.kr",
    subject: "[RS-2024-00198321] 1연차 연차상시점검수수료 청구서",
    emailType: "TAX_INVOICE", feeCategory: "ANNUAL",
    attachments: ["청구서_RS-2024-00198321_1연차.pdf", "사업자등록증.pdf"],
    status: "FAILED",
  },
  {
    id: "em-004", batchId: "BATCH-2024-1010", sentAt: "2024-10-10 14:20",
    senderName: "이회계",
    recipientInstitution: "(주)한국항공우주", recipientEmail: "yoon.sj@kaitech.co.kr",
    subject: "[RS-2023-00176431] 3연차 위탁정산수수료 청구서",
    emailType: "TAX_INVOICE", feeCategory: "SETTLEMENT",
    attachments: ["청구서_RS-2023-00176431_3연차.pdf", "사업자등록증.pdf", "위탁정산내역서.pdf"],
    status: "SUCCESS",
  },
  {
    id: "em-005", batchId: "BATCH-2024-0825", sentAt: "2024-08-25 10:05",
    senderName: "박정산",
    recipientInstitution: "(주)미래반도체", recipientEmail: "choi.jw@futuresemi.co.kr",
    subject: "[RS-2024-00231087] 1연차 수수료 산출내역 안내",
    emailType: "FEE_DETAIL",
    attachments: ["수수료산출내역_RS-2024-00231087_1연차.pdf"],
    status: "SUCCESS",
  },
  {
    id: "em-006", batchId: "BATCH-2024-0825", sentAt: "2024-08-25 10:06",
    senderName: "이회계",
    recipientInstitution: "삼화전자(주)", recipientEmail: "lee.ys@samhwa.co.kr",
    subject: "[RS-2024-00214837] 2연차 수수료 산출내역 안내",
    emailType: "FEE_DETAIL",
    attachments: ["수수료산출내역_RS-2024-00214837_2연차.pdf"],
    status: "SUCCESS",
  },
  {
    id: "em-007", batchId: "BATCH-2024-0501", sentAt: "2024-05-01 09:00",
    senderName: "이회계",
    recipientInstitution: "나노소재기술(주)", recipientEmail: "kang.hw@nanomat.co.kr",
    subject: "[RS-2024-00201547] 3연차 연차상시점검수수료 청구서",
    emailType: "TAX_INVOICE", feeCategory: "ANNUAL",
    attachments: ["청구서_RS-2024-00201547_3연차.pdf", "사업자등록증.pdf"],
    status: "SUCCESS",
  },
  {
    id: "em-008", batchId: "BATCH-2024-0501", sentAt: "2024-05-01 09:00",
    senderName: "박정산",
    recipientInstitution: "그린바이오텍(주)", recipientEmail: "lim.sa@greenbiotech.co.kr",
    subject: "[RS-2024-00219874] 2연차 위탁정산수수료 청구서",
    emailType: "TAX_INVOICE", feeCategory: "SETTLEMENT",
    attachments: ["청구서_RS-2024-00219874_2연차.pdf", "사업자등록증.pdf"],
    status: "FAILED",
  },
  {
    id: "em-009", batchId: "BATCH-2024-1201", sentAt: "2024-12-01 08:30",
    senderName: "이회계",
    recipientInstitution: "삼화전자(주)", recipientEmail: "lee.ys@samhwa.co.kr",
    subject: "[RS-2024-00225198] 1연차 수수료 산출내역 안내",
    emailType: "FEE_DETAIL",
    attachments: ["수수료산출내역_RS-2024-00225198_1연차.pdf"],
    status: "PENDING",
  },
  {
    id: "em-010", batchId: "BATCH-2024-1201", sentAt: "2024-12-01 08:30",
    senderName: "이회계",
    recipientInstitution: "그린바이오텍(주)", recipientEmail: "lim.sa@greenbiotech.co.kr",
    subject: "[RS-2024-00219874] 2연차 수수료 산출내역 안내",
    emailType: "FEE_DETAIL",
    attachments: ["수수료산출내역_RS-2024-00219874_2연차.pdf"],
    status: "PENDING",
  },
  {
    id: "em-011", batchId: "BATCH-2025-0115", sentAt: "2025-01-15 11:20",
    senderName: "이회계",
    recipientInstitution: "삼화전자(주)", recipientEmail: "lee.ys@samhwa.co.kr",
    subject: "[RS-2024-00214837] 한국산업기술기획평가원(KEIT) 협약체결과제에 대한 정산 절차 안내 및 수수료 청구",
    emailType: "SETTLEMENT_NOTICE",
    attachments: [
      "산업기술혁신사업 공통 운영요령",
      "[서식] 산업기술혁신사업 공통 운영요령",
      "2026년 산업기술혁신사업 연구개발비 설명자료_삼화회계법인",
      "권익위_복지보조금 부정신고선터",
      "삼화회계법인_연구수당 간접비 관련 직접비 집행비율 산정 방법 template_참고용",
      "인건비계상률 관리 예시 참고용_2026",
    ],
    status: "SUCCESS",
    noticeSnapshot: {
      docNumber: "삼화 2025-0003",
      issuedDate: "2025.01.15",
      statusRows: [
        { label: "과제번호 (RCMS)", value: "RS-2024-00214837" },
        { label: "과제명", value: "초정밀 광학 센서 모듈 개발 및 양산화" },
        { label: "단계연구개발기간", value: "2023 년 03 월 01 일 ~ 2026 년 02 월 28 일" },
        { label: "대상기간", value: "2023 년 03 월 01 일 ~ 2026 년 02 월 28 일" },
        { label: "정산구분", value: "위탁정산" },
        { label: "주관연구개발기관", value: "삼화전자(주)" },
        { label: "연구책임자", value: "김기술" },
        { label: "공동연구개발기관수", value: "2개" },
      ],
      template: {
        title: "한국산업기술기획평가원(KEIT) 협약체결과제에 대한 정산 절차 안내 및 수수료 청구",
        recipient: "주관연구개발기관 및 공동연구개발기관 대표",
        reference: "연구책임자 및 실무담당자",
        legalBasis: "산업기술혁신사업 공통운영요령 제7장 제34조(연구개발비 사용실적 보고 및 정산)",
        bodyIntro: [
          "귀 기관의 일익 번창하심을 기원합니다.",
          "관련근거",
          "당 회계법인은 한국산업기술기획평가원으로부터 산업기술개발사업을 수행하는 귀 기관의 위탁정산기관으로 통보를 받아 다음 사항을 안내하오니 업무에 참조하여 주시기 바랍니다.",
        ],
        scheduleRows: [
          { category: "상시점검", institutionTask: "연구비 사용 및 증빙 업로드", firmTask: "과제 시작일 기준 월 단위 실시\n(RCMS 이체월 익월 점검 실시)" },
          { category: "연차상시점검", institutionTask: "연차종료 후 2개월 이내\n계속비 설정 및 연차사용내역 보고", firmTask: "연차 사용내역 보고 후 2개월간\n해당 연차에 대한 상시점검 실시" },
          { category: "최종정산", institutionTask: "단계종료 후 3개월 이내\nRCMS에 사용실적보고", firmTask: "사용실적 보고 후 2개월간\n단계 전체에 대한 정산 실시" },
        ],
        contactRows: [
          { role: "KEIT 문의 전용", contact: "02-3453-9422~5", email: "keit_samhwa@shcpa.co.kr" },
          { role: "총괄 : 강상일", contact: "02-3453-9422~5", email: "kangsi727@shcpa.co.kr" },
          { role: "과제담당(정) : 김철진", contact: "070-4347-7505", email: "luffy1.5@shcpa.co.kr" },
          { role: "과제담당(부) : 이청아", contact: "070-4347-7511", email: "cayi@shcpa.co.kr" },
          { role: "세금계산서 : 천기현", contact: "070-4347-7516", email: "cgh62@shcpa.co.kr" },
        ],
        feeIntro: "세금계산서 발행을 위한 필요서류",
        feeRequiredDocs: [
          "사업자등록증 사본",
          "연구개발계획서 앞장 혹은 연구개발비 구성 내역 표(연구비 재원 확인 용)",
          "세금계산서 발행 담당 실무자 정보(성명, 전화번호, 이메일주소)",
          "정산업무 실무담당자 정보(성명, 전화번호, 이메일 주소)",
        ],
        feeNotes: [
          "상기 서류를 세금계산서 담당자(천기현 대리) 메일(cgh62@shcpa.co.kr)로 송부 부탁드립니다.",
          "세부 산정내역은 첨부 파일 참조바랍니다.",
          "협약 당시와 달리 공동기관 등의 변경이 있는 경우 수수료는 변경될 수 있습니다.",
          "정산수수료는 주관연구개발기관이 부담하고 \"직접비>연구활동비>기타비용\"에서 처리하시면 됩니다.",
        ],
        attachments: [
          "산업기술혁신사업 공통 운영요령",
          "[서식] 산업기술혁신사업 공통 운영요령",
          "2026년 산업기술혁신사업 연구개발비 설명자료_삼화회계법인",
          "권익위_복지보조금 부정신고선터",
          "삼화회계법인_연구수당 간접비 관련 직접비 집행비율 산정 방법 template_참고용",
          "인건비계상률 관리 예시 참고용_2026",
        ],
      },
    },
  },
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
  /** 하이웍스 개인 메일 계정 (조회 전용 계정은 대상 아님) */
  hiworksEmail?: string;
  /** 하이웍스 메일 전용 비밀번호 (로그인 비밀번호 아님, SMTP 발송용) */
  hiworksMailPassword?: string;
}

export const systemUsers: SystemUser[] = [
  { id: "u-001", name: "김관리", email: "admin@samhwa.co.kr", role: "ADMIN", status: "ACTIVE", lastLoginAt: "2024-12-10 09:32", registeredAt: "2022-01-01" },
  { id: "u-002", name: "이회계", email: "lee.acc@samhwa.co.kr", role: "ACCOUNTANT", status: "ACTIVE", lastLoginAt: "2024-12-09 17:45", registeredAt: "2022-01-15" },
  { id: "u-003", name: "박정산", email: "park.set@samhwa.co.kr", role: "SETTLEMENT", status: "ACTIVE", lastLoginAt: "2024-12-10 08:10", registeredAt: "2022-03-01" },
  { id: "u-004", name: "최담당", email: "choi.view@samhwa.co.kr", role: "VIEWER", status: "ACTIVE", lastLoginAt: "2024-11-28 14:22", registeredAt: "2023-06-01" },
  { id: "u-005", name: "정수정", email: "jung.acc@samhwa.co.kr", role: "ACCOUNTANT", status: "INACTIVE", lastLoginAt: "2024-09-05 11:00", registeredAt: "2022-09-01" },
];

// ============================================================
// 공지사항 (알림 - 회계담당자/전문기관담당자 공유용)
// ============================================================

export interface Notice {
  id: string;
  title: string;
  content: string;
  authorName: string;
  authorRole: SystemUser["role"];
  createdAt: string; // "YYYY-MM-DD HH:mm"
}

export const notices: Notice[] = [
  {
    id: "notice-001",
    title: "12월 세금계산서 마감 안내",
    content: "12월 세금계산서는 12/27(금)까지 발행 요청 부탁드립니다. 이후 요청 건은 익월로 이월됩니다.",
    authorName: "이회계",
    authorRole: "ACCOUNTANT",
    createdAt: "2024-12-05 10:00",
  },
];

// ============================================================
// 이슈/메모 관리
// ============================================================

export type IssueRecipientGroup = "MANAGER" | "ACCOUNTANT" | "SETTLEMENT";

export interface ProjectIssue {
  id: string;
  projectId: string;
  projectNumber: string;
  content: string;
  author: string;
  createdAt: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED";
  // 알림 받을 대상(그룹 단위). 비어있고 recipientUserIds도 비어있으면 과제 담당자에게만 전달
  recipientGroups?: IssueRecipientGroup[];
  // 알림 받을 대상(개인 지정) — SystemUser.id 목록. recipientGroups와 함께 선택 가능(합집합으로 전달)
  recipientUserIds?: string[];
  // 이슈가 발생한 기관명 (선택 입력) — 특정 기관과 무관한 이슈는 noInstitution으로 표시
  institutionName?: string;
  noInstitution?: boolean;
}

export const projectIssues: ProjectIssue[] = [
  {
    id: "pi-001",
    projectId: "p-001",
    projectNumber: "RS-2024-00214837",
    content: "3연차 협약사업비 조정 필요. 삼화전자 요청으로 배분 비율 재검토 예정",
    author: "김관리",
    createdAt: "2024-11-20 14:30",
    priority: "HIGH",
    status: "IN_PROGRESS",
  },
  {
    id: "pi-002",
    projectId: "p-001",
    projectNumber: "RS-2024-00214837",
    content: "2연차 세금계산서 미납 4M 이월 처리 완료",
    author: "이회계",
    createdAt: "2024-09-05 10:15",
    priority: "MEDIUM",
    status: "RESOLVED",
  },
  {
    id: "pi-003",
    projectId: "p-002",
    projectNumber: "RS-2024-00198321",
    content: "에너텍솔루션 수금 독촉 필요. 1연차 112.5M 미납 상태 지속",
    author: "김관리",
    createdAt: "2024-08-01 09:00",
    priority: "HIGH",
    status: "OPEN",
  },
];

// ============================================================
// 과제단위 수수료 산정 내역 (TermFeeCalc)
// — 정액 구간표 기반으로 과제 전체를 산정한 결과 스냅샷
// — 수기 수정(override) 이력 포함
// ============================================================

export interface FeeOverride {
  field: string;        // 수정된 필드명 (e.g. "carriedOverUnclaimed")
  originalValue: number;
  adjustedValue: number;
  reason: string;
  adjustedBy: string;
  adjustedAt: string;
}

export interface ExemptInstDetail {
  institutionId: string;
  institutionName: string;
  grade: string;
  cashBudget: number;
  standardFee: number;   // 면제기관 표준수수료 배분액
  calculatedFee: number; // standardFee × 0.85
  billingFee: number;    // calculatedFee × 0.85 (연차상시 동일)
  unclaimedFee: number;  // calculatedFee × 0.15
}

export interface TermFeeCalc {
  id: string;
  projectId: string;
  projectNumber: string;
  projectName: string;
  agencyId: string;
  termYear: number;
  termNumber: number;
  stageNumber: number;           // 0 = 일괄협약, 1이상 = 단계
  workType: "ANNUAL" | "SETTLEMENT"; // 연차상시 | 정산

  // 1. 표준수수료
  totalCashBudget: number;
  coInstCount: number;
  baseFee: number;
  addonFee: number;
  standardFee: number;

  // 2. 일반수수료 (면제기관 제외)
  nonExemptCashBudget: number;
  nonExemptCoInstCount: number;
  nonExemptBaseFee: number;
  nonExemptAddonFee: number;
  generalFee: number;

  // 3. 면제기관 수수료
  exemptFeeTotal: number;
  exemptBreakdown: ExemptInstDetail[];

  // 4. 과제 산정수수료 = generalFee + exemptFeeTotal × 0.85
  calculatedFee: number;

  // 5. 청구수수료
  generalCalcFee: number;
  generalBillingFee: number;
  generalUnclaimedFee: number;
  carriedOverUnclaimed: number;  // 이전 연도 일반 미청구 누적
  totalBillingFee: number;       // 최종 청구액

  overrides: FeeOverride[];
  status: "DRAFT" | "CONFIRMED" | "BILLED";
  createdAt: string;
  updatedAt?: string;
}

// 도메인 문서 예시 P001/A과제 (KEIT, 단계협약3, 1~3연차)
export const termFeeCalcs: TermFeeCalc[] = [
  // 1년차 — 연차상시 (KEIT 예시 그대로)
  {
    id: "tfc-p001-2022-1",
    projectId: "p-001",
    projectNumber: "RS-2024-00214837",
    projectName: "초정밀 광학 센서 모듈 개발 및 양산화",
    agencyId: "fa-001",
    termYear: 2023,
    termNumber: 1,
    stageNumber: 1,
    workType: "ANNUAL",
    totalCashBudget: 400_000_000,
    coInstCount: 3,
    baseFee: 1_515_000,
    addonFee: 303_000,
    standardFee: 1_818_000,
    nonExemptCashBudget: 250_000_000,
    nonExemptCoInstCount: 1,
    nonExemptBaseFee: 1_185_000,
    nonExemptAddonFee: 118_500,
    generalFee: 1_303_500,
    exemptFeeTotal: 514_500,
    exemptBreakdown: [
      { institutionId: "inst-002", institutionName: "한국과학기술연구원", grade: "S", cashBudget: 100_000_000, standardFee: 343_000, calculatedFee: 291_550, billingFee: 247_818, unclaimedFee: 43_733 },
      { institutionId: "inst-004", institutionName: "연세대학교", grade: "A~C", cashBudget: 50_000_000, standardFee: 171_500, calculatedFee: 145_775, billingFee: 123_909, unclaimedFee: 21_866 },
    ],
    calculatedFee: 1_740_825,
    generalCalcFee: 1_303_500,
    generalBillingFee: 1_107_975,
    generalUnclaimedFee: 195_525,
    carriedOverUnclaimed: 0,
    totalBillingFee: 1_479_701,
    overrides: [],
    status: "BILLED",
    createdAt: "2023-12-31",
  },
  // 2년차 — 연차상시
  {
    id: "tfc-p001-2023-2",
    projectId: "p-001",
    projectNumber: "RS-2024-00214837",
    projectName: "초정밀 광학 센서 모듈 개발 및 양산화",
    agencyId: "fa-001",
    termYear: 2024,
    termNumber: 2,
    stageNumber: 1,
    workType: "ANNUAL",
    totalCashBudget: 650_000_000,
    coInstCount: 3,
    baseFee: 1_647_000,
    addonFee: 329_400,
    standardFee: 1_976_400,
    nonExemptCashBudget: 400_000_000,
    nonExemptCoInstCount: 1,
    nonExemptBaseFee: 1_515_000,
    nonExemptAddonFee: 151_500,
    generalFee: 1_666_500,
    exemptFeeTotal: 309_900,
    exemptBreakdown: [
      { institutionId: "inst-002", institutionName: "한국과학기술연구원", grade: "S", cashBudget: 150_000_000, standardFee: 185_940, calculatedFee: 158_049, billingFee: 134_342, unclaimedFee: 23_707 },
      { institutionId: "inst-004", institutionName: "연세대학교", grade: "A~C", cashBudget: 100_000_000, standardFee: 123_960, calculatedFee: 105_366, billingFee: 89_561, unclaimedFee: 15_805 },
    ],
    calculatedFee: 1_929_915,
    generalCalcFee: 1_666_500,
    generalBillingFee: 1_416_525,
    generalUnclaimedFee: 249_975,
    carriedOverUnclaimed: 0,
    totalBillingFee: 1_640_428,
    overrides: [],
    status: "BILLED",
    createdAt: "2024-12-31",
  },
];

// ─── 전담기관 운용 안내 타입 ──────────────────────────────────
export interface AgencyGuideRow { cells: string[]; em?: boolean }
export interface AgencyGuideTable { caption?: string; headers: string[]; rows: AgencyGuideRow[]; note?: string }
export interface AgencyGuideTab { label: string; tables: AgencyGuideTable[] }

// ─── 공문 발신 회사 정보 (전담기관과 무관한 고정 레터헤드) ──────
export const COMPANY_INFO = {
  name: "삼화회계법인",
  addressLine: "우 06097 서울특별시 강남구 봉은사로 407 (삼성동, 삼화빌딩 8층)",
  tel: "02-3453-9422",
  fax: "02-6442-9129",
  preparedBy: "이진아",
  ceoName: "구병주",
  docNumberPrefix: "삼화",
  // 세금계산서 공문(수수료 청구서) 기본 본문에 쓰이는 담당자·입금계좌 안내
  managerName: "천기현대리",
  managerEmail: "cgh62@shcpa.co.kr",
  managerPhone: "070-4347-7516",
  depositAccountNote: "세금계산서 비고란 가상 계좌번호 참고 (예금주: 삼화회계법인)",
};

// ─── 세금계산서 공문 표준 첨부서류 (일괄 관리) ───────────────────
// 사업자등록증 등, 발송마다 매번 새로 올리지 않고 공통으로 붙는 서류.
// 여기서 파일을 교체하면 이후 새로 작성되는 모든 공문에 기본값으로 반영된다(일괄 수정).
// 개별 발송 건에서 별도로 파일을 바꾸는 것은 그 발송에만 적용된다(개별 수정, DispatchModal에서 처리).
export interface StandardAttachment {
  id: string;
  name: string;          // 첨부파일명 (예: 사업자등록증.pdf)
  fileDataUrl?: string;  // 업로드된 실제 파일 (data URL) — 없으면 이름만 있는 자리표시자
  updatedAt: string;
}

export const standardAttachments: StandardAttachment[] = [
  { id: "sa-biz-reg",   name: "사업자등록증.pdf", updatedAt: "2024-01-02" },
  { id: "sa-bankbook",  name: "통장사본.pdf",     updatedAt: "2024-01-02" },
];

// ─── 전담기관 공문(정산절차 안내) 템플릿 ──────────────────────
export interface NoticeScheduleRow { category: string; institutionTask: string; firmTask: string }
export interface NoticeContactRow { role: string; contact: string; email: string }
export interface AgencyNoticeTemplate {
  title: string;
  recipient: string;
  reference: string;
  legalBasis: string;
  bodyIntro: string[];
  scheduleRows: NoticeScheduleRow[];
  contactRows: NoticeContactRow[];
  feeIntro: string;
  feeRequiredDocs: string[];
  feeNotes: string[];
  attachments: string[];
}
// 전담기관 하나에 여러 개의 템플릿을 등록해두고 발송 시 선택할 수 있도록 리스트로 관리한다.
export interface AgencyNoticeTemplateEntry {
  id: string;
  agencyShortName: string; // FundingAgency.shortName (KEIT 등)
  name: string;            // 템플릿 이름 (목록에서 선택할 때 표시)
  content: AgencyNoticeTemplate;
}

export const EMPTY_NOTICE_TEMPLATE: AgencyNoticeTemplate = {
  title: "",
  recipient: "주관연구개발기관 및 공동연구개발기관 대표",
  reference: "연구책임자 및 실무담당자",
  legalBasis: "",
  bodyIntro: ["귀 기관의 일익 번창하심을 기원합니다."],
  scheduleRows: [],
  contactRows: [],
  feeIntro: "세금계산서 발행을 위한 필요서류",
  feeRequiredDocs: [],
  feeNotes: [],
  attachments: [],
};

export const agencyNoticeTemplates: AgencyNoticeTemplateEntry[] = [
  {
    id: "ant-keit-001",
    agencyShortName: "KEIT",
    name: "정산절차 안내 공문 (기본)",
    content: {
      title: "한국산업기술기획평가원(KEIT) 협약체결과제에 대한 정산 절차 안내 및 수수료 청구",
      recipient: "주관연구개발기관 및 공동연구개발기관 대표",
      reference: "연구책임자 및 실무담당자",
      legalBasis: "산업기술혁신사업 공통운영요령 제7장 제34조(연구개발비 사용실적 보고 및 정산)",
      bodyIntro: [
        "귀 기관의 일익 번창하심을 기원합니다.",
        "관련근거",
        "당 회계법인은 한국산업기술기획평가원으로부터 산업기술개발사업을 수행하는 귀 기관의 위탁정산기관으로 통보를 받아 다음 사항을 안내하오니 업무에 참조하여 주시기 바랍니다.",
      ],
      scheduleRows: [
        { category: "상시점검", institutionTask: "연구비 사용 및 증빙 업로드", firmTask: "과제 시작일 기준 월 단위 실시\n(RCMS 이체월 익월 점검 실시)" },
        { category: "연차상시점검", institutionTask: "연차종료 후 2개월 이내\n계속비 설정 및 연차사용내역 보고", firmTask: "연차 사용내역 보고 후 2개월간\n해당 연차에 대한 상시점검 실시" },
        { category: "최종정산", institutionTask: "단계종료 후 3개월 이내\nRCMS에 사용실적보고", firmTask: "사용실적 보고 후 2개월간\n단계 전체에 대한 정산 실시" },
      ],
      contactRows: [
        { role: "KEIT 문의 전용", contact: "02-3453-9422~5", email: "keit_samhwa@shcpa.co.kr" },
        { role: "총괄 : 강상일", contact: "02-3453-9422~5", email: "kangsi727@shcpa.co.kr" },
        { role: "과제담당(정) : 김철진", contact: "070-4347-7505", email: "luffy1.5@shcpa.co.kr" },
        { role: "과제담당(부) : 이청아", contact: "070-4347-7511", email: "cayi@shcpa.co.kr" },
        { role: "세금계산서 : 천기현", contact: "070-4347-7516", email: "cgh62@shcpa.co.kr" },
      ],
      feeIntro: "세금계산서 발행을 위한 필요서류",
      feeRequiredDocs: [
        "사업자등록증 사본",
        "연구개발계획서 앞장 혹은 연구개발비 구성 내역 표(연구비 재원 확인 용)",
        "세금계산서 발행 담당 실무자 정보(성명, 전화번호, 이메일주소)",
        "정산업무 실무담당자 정보(성명, 전화번호, 이메일 주소)",
      ],
      feeNotes: [
        "상기 서류를 세금계산서 담당자(천기현 대리) 메일(cgh62@shcpa.co.kr)로 송부 부탁드립니다.",
        "세부 산정내역은 첨부 파일 참조바랍니다.",
        "협약 당시와 달리 공동기관 등의 변경이 있는 경우 수수료는 변경될 수 있습니다.",
        "정산수수료는 주관연구개발기관이 부담하고 \"직접비>연구활동비>기타비용\"에서 처리하시면 됩니다.",
      ],
      attachments: [
        "산업기술혁신사업 공통 운영요령",
        "[서식] 산업기술혁신사업 공통 운영요령",
        "2026년 산업기술혁신사업 연구개발비 설명자료_삼화회계법인",
        "권익위_복지보조금 부정신고선터",
        "삼화회계법인_연구수당 간접비 관련 직접비 집행비율 산정 방법 template_참고용",
        "인건비계상률 관리 예시 참고용_2026",
      ],
    },
  },
  {
    id: "ant-ketep-001",
    agencyShortName: "KETEP",
    name: "정산절차 안내 공문 (기본)",
    content: {
      title: "한국에너지기술평가원(KETEP) 협약체결과제에 대한 정산 절차 안내 및 수수료 청구",
      recipient: "주관연구개발기관 및 공동연구개발기관 대표",
      reference: "연구책임자 및 실무담당자",
      legalBasis: "에너지기술개발사업 공통운영요령 중 연구개발비 사용실적 보고 및 정산 관련 조항",
      bodyIntro: [
        "귀 기관의 일익 번창하심을 기원합니다.",
        "관련근거",
        "당 회계법인은 한국에너지기술평가원으로부터 에너지기술개발사업을 수행하는 귀 기관의 위탁정산기관으로 통보를 받아 다음 사항을 안내하오니 업무에 참조하여 주시기 바랍니다.",
      ],
      scheduleRows: [
        { category: "상시점검", institutionTask: "연구비 사용 및 증빙 업로드", firmTask: "과제 시작일 기준 월 단위 실시" },
        { category: "연차상시점검", institutionTask: "연차종료 후 2개월 이내\n연차사용내역 보고", firmTask: "연차 사용내역 보고 후 2개월간\n상시점검 실시" },
        { category: "최종정산", institutionTask: "단계종료 후 3개월 이내\n사용실적보고", firmTask: "사용실적 보고 후 2개월간\n정산 실시" },
      ],
      contactRows: [
        { role: "KETEP 문의 전용", contact: "02-3453-9422~5", email: "ketep_samhwa@shcpa.co.kr" },
        { role: "총괄 : 강상일", contact: "02-3453-9422~5", email: "kangsi727@shcpa.co.kr" },
        { role: "세금계산서 : 천기현", contact: "070-4347-7516", email: "cgh62@shcpa.co.kr" },
      ],
      feeIntro: "세금계산서 발행을 위한 필요서류",
      feeRequiredDocs: [
        "사업자등록증 사본",
        "연구개발계획서 앞장 혹은 연구개발비 구성 내역 표",
        "세금계산서 발행 담당 실무자 정보(성명, 전화번호, 이메일주소)",
        "정산업무 실무담당자 정보(성명, 전화번호, 이메일 주소)",
      ],
      feeNotes: [
        "상기 서류를 세금계산서 담당자(천기현 대리) 메일(cgh62@shcpa.co.kr)로 송부 부탁드립니다.",
        "협약 당시와 달리 공동기관 등의 변경이 있는 경우 수수료는 변경될 수 있습니다.",
      ],
      attachments: [
        "에너지기술개발사업 공통 운영요령",
        "세부 산정내역서",
      ],
    },
  },
  {
    id: "ant-kofpi-001",
    agencyShortName: "KOFPI",
    name: "정산절차 안내 공문 (기본)",
    content: {
      title: "한국임업진흥원(KOFPI) 협약체결과제에 대한 정산 절차 안내 및 수수료 청구",
      recipient: "주관연구개발기관 및 공동연구개발기관 대표",
      reference: "연구책임자 및 실무담당자",
      legalBasis: "임업기술개발사업 운영요령 중 연구개발비 사용실적 보고 및 정산 관련 조항",
      bodyIntro: [
        "귀 기관의 일익 번창하심을 기원합니다.",
        "관련근거",
        "당 회계법인은 한국임업진흥원으로부터 임업기술개발사업을 수행하는 귀 기관의 위탁정산기관으로 통보를 받아 다음 사항을 안내하오니 업무에 참조하여 주시기 바랍니다.",
      ],
      scheduleRows: [
        { category: "상시점검", institutionTask: "연구비 사용 및 증빙 업로드", firmTask: "과제 시작일 기준 월 단위 실시" },
        { category: "정산", institutionTask: "단계종료 후 3개월 이내\n사용실적보고", firmTask: "사용실적 보고 후 2개월간\n정산 실시" },
      ],
      contactRows: [
        { role: "KOFPI 문의 전용", contact: "02-3453-9422~5", email: "kofpi_samhwa@shcpa.co.kr" },
        { role: "총괄 : 강상일", contact: "02-3453-9422~5", email: "kangsi727@shcpa.co.kr" },
        { role: "세금계산서 : 천기현", contact: "070-4347-7516", email: "cgh62@shcpa.co.kr" },
      ],
      feeIntro: "세금계산서 발행을 위한 필요서류",
      feeRequiredDocs: [
        "사업자등록증 사본",
        "연구개발계획서 앞장 혹은 연구개발비 구성 내역 표",
        "세금계산서 발행 담당 실무자 정보(성명, 전화번호, 이메일주소)",
        "정산업무 실무담당자 정보(성명, 전화번호, 이메일 주소)",
      ],
      feeNotes: [
        "상기 서류를 세금계산서 담당자(천기현 대리) 메일(cgh62@shcpa.co.kr)로 송부 부탁드립니다.",
      ],
      attachments: [
        "임업기술개발사업 운영요령",
      ],
    },
  },
];
