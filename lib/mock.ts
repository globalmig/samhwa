export interface ProjectFeeRow {
  projectNumber: string;
  projectName: string;
  agency: string;
  termYear: number;
  termNumber: number;
  institutionCount: number;
  totalBudget: number;
  standardFee: number;
  appliedFee: number;
  billedFee: number;
  unclaimedFee: number;
  receivable: number;
  status: "BILLED" | "CONFIRMED" | "DRAFT" | "UNCLAIMED" | "OVERDUE";
}

export interface InstitutionRow {
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
    termYear: 2024,
    termNumber: 2,
    institutionCount: 4,
    totalBudget: 2_800_000_000,
    standardFee: 56_000_000,
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
    termYear: 2024,
    termNumber: 1,
    institutionCount: 6,
    totalBudget: 4_500_000_000,
    standardFee: 112_500_000,
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
    termYear: 2024,
    termNumber: 3,
    institutionCount: 3,
    totalBudget: 1_200_000_000,
    standardFee: 24_000_000,
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
    termYear: 2024,
    termNumber: 2,
    institutionCount: 5,
    totalBudget: 3_100_000_000,
    standardFee: 77_500_000,
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
    termYear: 2024,
    termNumber: 1,
    institutionCount: 4,
    totalBudget: 2_200_000_000,
    standardFee: 44_000_000,
    appliedFee: 0,
    billedFee: 0,
    unclaimedFee: 44_000_000,
    receivable: 0,
    status: "UNCLAIMED",
  },
  {
    projectNumber: "RS-2024-00231087",
    projectName: "반도체 패키징 열관리 신소재 연구",
    agency: "산업기술평가관리원",
    termYear: 2024,
    termNumber: 1,
    institutionCount: 3,
    totalBudget: 980_000_000,
    standardFee: 19_600_000,
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
    termYear: 2024,
    termNumber: 3,
    institutionCount: 7,
    totalBudget: 5_800_000_000,
    standardFee: 145_000_000,
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
    termYear: 2024,
    termNumber: 2,
    institutionCount: 3,
    totalBudget: 1_650_000_000,
    standardFee: 33_000_000,
    appliedFee: 0,
    billedFee: 0,
    unclaimedFee: 33_000_000,
    receivable: 0,
    status: "DRAFT",
  },
];

export const institutionRows: InstitutionRow[] = [
  {
    name: "삼화전자(주)",
    type: "중소기업",
    projectCount: 4,
    totalBudget: 6_800_000_000,
    totalFee: 136_000_000,
    unclaimed: 18_000_000,
    receivable: 52_000_000,
    settlement: 420_000_000,
  },
  {
    name: "한국과학기술연구원",
    type: "정부출연연구소",
    projectCount: 6,
    totalBudget: 12_500_000_000,
    totalFee: 312_500_000,
    unclaimed: 45_000_000,
    receivable: 98_750_000,
    settlement: 780_000_000,
  },
  {
    name: "(주)에너텍솔루션",
    type: "중견기업",
    projectCount: 3,
    totalBudget: 4_200_000_000,
    totalFee: 84_000_000,
    unclaimed: 0,
    receivable: 36_000_000,
    settlement: 210_000_000,
  },
  {
    name: "연세대학교",
    type: "대학",
    projectCount: 5,
    totalBudget: 8_900_000_000,
    totalFee: 178_000_000,
    unclaimed: 62_000_000,
    receivable: 0,
    settlement: 560_000_000,
  },
  {
    name: "나노소재기술(주)",
    type: "스타트업",
    projectCount: 2,
    totalBudget: 980_000_000,
    totalFee: 14_700_000,
    unclaimed: 4_150_000,
    receivable: 0,
    settlement: 98_000_000,
  },
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
  { name: "한국산업기술진흥원", rate: 16, fee: 92_800_000 },
  { name: "중소기업기술정보진흥원", fee: 58_400_000, rate: 10 },
  { name: "기타", fee: 62_200_000, rate: 10 },
];
