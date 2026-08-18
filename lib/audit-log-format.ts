// 변경이력(AuditEntry.changedFields) 표시용 공통 포맷터 — 과제상세 페이지의 변경이력 표와
// 전체 변경이력(/audit-log) 페이지가 필드명/값을 서로 다르게 보여주면 헷갈리므로 하나로 공유한다.
export const FIELD_LABELS: Record<string, string> = {
  status:              "상태",
  priority:            "우선순위",
  content:             "내용",
  projectNumber:       "과제번호",
  projectName:         "과제명",
  leadInstitutionId:   "주관기관 ID",
  leadInstitutionName: "주관기관명",
  agencyId:            "전담기관 ID",
  agency:              "전담기관명",
  startDate:           "시작일",
  endDate:             "종료일",
  totalTerms:          "총연차",
  currentTerm:         "현재연차",
  govGrant:            "정부출연금",
  privateCash:         "민간현금",
  privateInKind:       "민간현물",
  totalBudget:         "총사업비",
  feeRate:             "수수료율",
  calculatedFee:       "산정수수료",
  appliedFee:          "적용수수료",
  paidAmount:          "납부금액",
  receivableAmount:    "미수금",
  carriedOver:         "이월처리",
  institutionGrade:    "기관등급",
  budget:              "배정예산",
  name:                "이름",
  role:                "역할",
  dueDate:             "납기일",
  issuedAt:            "발행일",
  supplyAmount:        "공급가액",
  taxAmount:           "부가세",
  totalAmount:         "합계금액",
  projectCategory:     "과제구분",
  usageReportDeadline: "사용실적제출기한",
  internalAssignedAt:  "내부배정일",
  agencyAssignedAt:    "전담기관배정일",
  agreementType:       "협약유형",
  stages:              "단계 구성",
  stageStartDate:      "단계 시작일",
  stageEndDate:        "단계 종료일",
  annualFinancials:    "연차별 사업비 이력",
  annualBudgets:       "연차별 사업비",
  gradeOverrides:      "연차별 등급",
  settlementTypeOverrides: "연차별 정산구분",
  recipientOverrides:  "연차별 공문 수신자",
  projectDivision:     "과제구분(위탁/공동)",
  assignedManager:     "담당자",
  registeredAt:        "등록일",
  researchLead:        "연구책임자",
  projectCode:         "과제코드",
  institutionType:     "기관유형",
  settlementType:       "정산구분",
  cashBudget:          "현금사업비",
  inKindBudget:        "현물사업비",
  assignedManagerHistory: "연차별 담당자",
};

// 엔티티별 상태값 라벨 — 같은 영문 토큰(예: ACTIVE, PENDING)이 엔티티마다 다른 의미를 가지므로
// 전역으로 하나만 두면(과거 버그) 예: 기관 상태 "활성"이 과제 상태 "진행중"으로 잘못 표시된다.
// entityType은 AuditEntry.entityType / ENTITY_NAMES(store.ts)와 동일한 키를 쓴다.
const VALUE_LABELS_BY_ENTITY: Record<string, Record<string, string>> = {
  project: {
    ACTIVE:    "진행중",
    COMPLETED: "완료",
    SUSPENDED: "중단",
  },
  institution: {
    ACTIVE:   "활성",
    INACTIVE: "비활성",
  },
  fundingAgency: {
    ACTIVE:   "활성",
    INACTIVE: "비활성",
  },
  user: {
    ACTIVE:      "활성",
    INACTIVE:    "비활성",
    ADMIN:       "시스템 관리자",
    ACCOUNTANT:  "회계 담당자",
    SETTLEMENT:  "전문기관담당자",
    VIEWER:      "조회 전용",
  },
  feePolicy: {
    ACTIVE:  "활성",
    EXPIRED: "만료",
    DRAFT:   "초안",
  },
  termFee: {
    SCHEDULED: "예정",
    DRAFT:     "초안",
    CONFIRMED: "확정",
    BILLED:    "청구완료",
  },
  termFeeCalc: {
    DRAFT:     "초안",
    CONFIRMED: "확정",
    BILLED:    "청구완료",
  },
  unclaimed: {
    PENDING:      "미청구",
    CARRIED_OVER: "이월됨",
    RESOLVED:     "해결됨",
  },
  receivable: {
    PENDING: "미납/대기",
    OVERDUE: "미수",
    PAID:    "완납",
    PARTIAL: "일부납부",
  },
  settlement: {
    SCHEDULED: "예정",
    PAID:      "지급완료",
    PENDING:   "처리중",
  },
  taxInvoice: {
    ISSUED:   "발행",
    MODIFIED: "수정발행",
    CANCELED: "취소",
  },
  emailDispatch: {
    SUCCESS: "발송완료",
    FAILED:  "발송실패",
    PENDING: "대기",
  },
  projectIssue: {
    OPEN:        "미처리",
    IN_PROGRESS: "진행중",
    RESOLVED:    "완료",
    HIGH:        "높음",
    MEDIUM:      "보통",
    LOW:         "낮음",
  },
  projectMember: {
    LEAD:        "주관",
    PARTICIPANT: "참여",
    ENTRUSTED:   "위탁",
  },
};

// 엔티티에 상관없이 항상 같은 뜻인 값들만 여기 둔다 (엔티티별 버킷에 없을 때의 최종 폴백).
const DEFAULT_VALUE_LABELS: Record<string, string> = {
  true:  "예",
  false: "아니오",
};

// 배열·객체 항목 하나를 사람이 읽을 수 있는 문장으로 요약한다. gradeOverrides/settlementTypeOverrides/
// annualBudgets/annualFinancials처럼 {termNumber, ...} 형태인 연차별 항목은 "N연차: 값" 식으로,
// stages처럼 {startTermNumber, endTermNumber}인 구간 항목은 "N단계(시작~끝연차)" 식으로 요약한다.
// 그 외 일반 객체는 "key:value" 나열로 최소한 값 자체는 보이게 한다(String()이면 전부
// "[object Object]"로 뭉개져 무엇이 바뀌었는지 전혀 알 수 없었다).
function summarizeItem(item: unknown): string {
  if (item === null || item === undefined) return "-";
  if (typeof item !== "object") return String(item);
  if (Array.isArray(item)) return item.map(summarizeItem).join(", ");
  const obj = item as Record<string, unknown>;
  if (typeof obj.termNumber === "number") {
    const rest = Object.entries(obj)
      .filter(([k, v]) => k !== "termNumber" && k !== "termYear" && v !== undefined && v !== null && v !== "")
      .map(([, v]) => (typeof v === "number" ? v.toLocaleString("ko-KR") : String(v)));
    return `${obj.termNumber}연차:${rest.join("/")}`;
  }
  if (typeof obj.startTermNumber === "number" && typeof obj.endTermNumber === "number") {
    const label = typeof obj.stageNumber === "number" ? `${obj.stageNumber}단계` : "구간";
    return `${label}(${obj.startTermNumber}~${obj.endTermNumber}연차)`;
  }
  const entries = Object.entries(obj)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}:${typeof v === "number" ? v.toLocaleString("ko-KR") : v}`);
  return entries.length > 0 ? entries.join(", ") : "-";
}

function summarizeValue(raw: unknown): string {
  if (Array.isArray(raw)) {
    if (raw.length === 0) return "없음";
    const items = raw.map(summarizeItem);
    return items.length > 4 ? `${items.slice(0, 4).join(", ")} 외 ${items.length - 4}건` : items.join(", ");
  }
  return summarizeItem(raw);
}

// gradeOverrides/settlementTypeOverrides는 "{termNumber, 값}[]" 형태라, 있는 그대로 나열하면
// (예: "1연차:위탁정산, 2연차:위탁정산, 3연차:위탁정산") 장황해서 읽기 어렵다. 실무자 입장에선
// "몇 연차부터 값이 바뀌었는지"가 궁금한 것이므로, 최신 값이 이어지는 연속 구간의 시작점을 찾아
// "3연차부터 위탁정산으로 변경"처럼 한 문장으로 요약한다. 이 요약이 가능한 필드가 아니면 null을
// 반환해 호출부가 기존의 전/후 값 비교 표시로 대신하게 한다.
const TERM_OVERRIDE_VALUE_KEY: Record<string, string> = {
  gradeOverrides: "grade",
  settlementTypeOverrides: "settlementType",
  assignedManagerHistory: "assignedManager",
};

export function describeOverrideChange(field: string, after: unknown): string | null {
  const valueKey = TERM_OVERRIDE_VALUE_KEY[field];
  if (!valueKey) return null;
  if (!Array.isArray(after) || after.length === 0) return "설정 해제(기본값으로 복귀)";
  const arr = (after as Record<string, unknown>[]).filter((x) => typeof x.termNumber === "number");
  if (arr.length === 0) return null;
  const sorted = [...arr].sort((a, b) => (a.termNumber as number) - (b.termNumber as number));
  const last = sorted[sorted.length - 1];
  const lastValue = last[valueKey];
  let startIdx = sorted.length - 1;
  while (startIdx > 0 && sorted[startIdx - 1][valueKey] === lastValue) startIdx--;
  const startTerm = sorted[startIdx].termNumber as number;
  const endTerm = last.termNumber as number;
  const valueLabel = String(lastValue);
  return startTerm === endTerm
    ? `${startTerm}연차 ${valueLabel}으로 변경`
    : `${startTerm}연차부터 ${valueLabel}으로 변경`;
}

export function fmtValue(raw: unknown, entityType?: string, field?: string): string {
  if (raw === null || raw === undefined) return "-";
  if (Array.isArray(raw) || typeof raw === "object") return summarizeValue(raw);
  const str = String(raw);
  const byEntity = entityType ? VALUE_LABELS_BY_ENTITY[entityType]?.[str] : undefined;
  if (byEntity) return byEntity;
  if (DEFAULT_VALUE_LABELS[str]) return DEFAULT_VALUE_LABELS[str];
  if (typeof raw === "number") return raw.toLocaleString("ko-KR") + (raw > 9999 ? "원" : "");
  return str;
}

export function fieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key;
}
