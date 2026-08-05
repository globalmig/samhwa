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

export function fmtValue(raw: unknown, entityType?: string, field?: string): string {
  if (raw === null || raw === undefined) return "-";
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
