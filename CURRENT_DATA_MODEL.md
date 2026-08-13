# 현재 사이트의 실제 데이터 구조 (Current Runtime Data Model)

> ⚠️ **먼저 읽어주세요**: 이 저장소에는 이미 `DB_SCHEMA.md`(35개 테이블 설계)와 그걸 그대로 옮긴
> `prisma/schema.prisma`(SQL Server 대상)가 있습니다. 하지만 **둘 다 지금 실제로 돌아가는
> 사이트와 연결되어 있지 않습니다.** 이 문서는 그 "설계도"가 아니라, **지금 사이트를 실제로
> 움직이는 데이터 구조**(`lib/mock.ts`의 TypeScript 타입 + `lib/store.ts`의 인메모리 상태)를
> 있는 그대로 정리한 것입니다. 아래 "리팩토링/정리 후보" 0번에 이 둘의 관계를 자세히 설명합니다.
>
> **DB/영속성 관련**: 지금은 테스트 단계라 의도적으로 DB를 붙이지 않은 상태이며, 당장 고쳐야
> 할 결함이 아닙니다. 실제 DB를 구축할 때 이 문서(특히 아래 2~7장의 엔티티·관계·비즈니스 규칙)를
> 스키마 설계 기준으로 참고해 연동할 예정입니다. (정정: 업무 데이터는 전부 인메모리라 새로고침하면
> 사라지는 게 맞지만, 로그인한 사용자 id 하나만은 `localStorage`에 저장되어 로그인 상태는 유지됩니다 — 7.1 참고.)
>
> 이 문서는 기존 파일을 하나도 수정·삭제하지 않고 새로 만든 것입니다. 코드 변경은
> 포함하지 않았습니다 — 구조 정리와 개선 후보 나열만 담았습니다.

---

## 1. 큰 그림

```
FundingAgency(전담기관) ──┐
                          ├─ FeePolicy(수수료 정책, agencyId로 연결, agencyId=null이면 공통)
Institution(수행기관) ────┤
                          │
                     Project(과제)
                          │
                          ├─ ProjectMember[] (참여기관 — 주관 1 + 공동/위탁 N)
                          │     └─ annualBudgets[] (연차별 현금/현물 예산)
                          │     └─ gradeOverrides[] / settlementTypeOverrides[] / recipientOverrides[]
                          │
                          ├─ ProjectIssue[] (이슈/메모)
                          │
                          └─ (매 연차마다 autoGenerateTermFees가 자동 생성)
                                ├─ TermFeeCalc (연차 단위 산정 스냅샷 1건 — 프로젝트 합계)
                                └─ TermFee[] (연차×기관 단위 결과 N건 — 기관별 산정/청구액)
                                      │
                                      ├─ TaxInvoice (세금계산서, 연차 단위 또는 기관별 분리)
                                      ├─ Receivable (미수금/채권)
                                      ├─ Settlement (기관별 정산)
                                      └─ UnclaimedFee (미청구 이월 추적 — TermFee.unclaimedFee와는 별개 테이블, 4번 항목 참고)
```

파일 3개가 전체 도메인 로직을 담당합니다:

| 파일 | 역할 |
|---|---|
| `lib/mock.ts` | 모든 엔티티의 TypeScript 타입 정의 + 초기 시드 데이터(하드코딩된 배열) |
| `lib/store.ts` | 인메모리 상태(`StoreState`) + CRUD 함수들 + `autoGenerateTermFees`(연차별 수수료 자동 재계산 엔진) |
| `lib/fee-calculator.ts` | 순수 계산 함수(`calcTermFee` 등) — 정책 파라미터로부터 산정/청구액을 계산 |

**영속성 없음**: `lib/store.ts`는 브라우저 메모리에만 존재하는 모듈 전역 변수(`let _state`)이고,
localStorage/API/DB 어디에도 저장하지 않습니다. 새로고침하면 `lib/mock.ts`의 시드 데이터로
완전히 리셋됩니다(자세한 내용은 아래 리팩토링 참고사항 1번).

---

## 2. 마스터 데이터

### 2.1 `Institution` (수행기관) — `lib/mock.ts:26`
과제에 참여하는 기업/대학/연구소를 구분 없이 하나의 엔티티로 관리합니다.

| 필드 | 타입 | 설명 |
|---|---|---|
| id, name, bizNumber, representativeName | string | 기본 식별 정보 |
| type | `대기업\|중견기업\|중소기업\|스타트업\|대학\|정부출연연구소\|공공기관` | 영리/비영리 판정에 사용(대학·정부출연연구소·공공기관만 비영리) |
| contactName/Email/Phone | string | 세금계산서·공문 발송 수신처 (삼화 내부 담당자와 별개) |
| status | `ACTIVE\|INACTIVE` | |
| referenceGrade | `최우수(S)\|우수(A)\|우수(B)\|우수(C)\|일반` (옵션) | 정산면제리스트 업로드로 갱신되는 **참고용** 등급. 과제별 실제 등급(`ProjectMember.institutionGrade`)과 별개이며 자동 반영되지 않음 |

### 2.2 `FundingAgency` (전담기관) — `lib/mock.ts:336`
KEIT/KETEP/IITP/KOFPI/RDA1/RDA2 등 6개 전담기관.

| 필드 | 설명 |
|---|---|
| noticeRecipientScope | `LEAD_ONLY`(주관기관만 발송) \| `LEAD_AND_PARTICIPANTS`(주관+공동 모두 발송) |
| rda2AffiliatedInstitutionNames | RDA2 전용 — 주관기관명이 이 목록에 있으면 RDA1 대신 RDA2 정책 자동 적용(`resolveRdaAgencyId`). "농촌진흥청"이라는 같은 표시명을 가진 fa-005(RDA1)/fa-006(RDA2) 두 레코드를 구분하는 유일한 근거 |

---

## 3. 과제 & 참여기관

### 3.1 `Project` — `lib/mock.ts:459`
과제 자체의 정보. 주요 필드군:

- **식별/기간**: projectNumber, projectName, agencyId, leadInstitutionId/Name, startDate/endDate, firstStartDate/finalEndDate(과제 전체 기간), totalTerms, currentTerm, status
- **협약 구조**: `agreementType: "BATCH"(일괄) | "STAGED"(단계)`, `stages: { stageNumber, startTermNumber, endTermNumber, stageStartDate?, stageEndDate? }[]`
- **과제 유형**: `projectType: "GENERAL" | "AUTONOMY_TRACK"`(자율성트랙), `autonomySettlementType`(자율성트랙 전용, 참여기관 개별 정산구분과 별개로 과제 전체 적용), `programType: "GENERAL" | "ICT_FUND"`(IITP 전용 — 동일 전담기관이 사업유형별 별도 정책을 가질 수 있음)
- **당해 사업비**: `govGrant/privateCash/privateInKind`(지금 진행 연차의 단일 값) + `annualFinancials?: AnnualFinancials[]`(연차별 이력 — 최근 추가, 3.3 참고)
- **행정 정보**: usageReportDeadline, agencyAssignedAt, internalAssignedAt, projectCategory("연차상시"/"정산"), researchLead, projectCode(전담기관 약칭-순번 자동생성), assignedManager, billingType(발행구분 — 과제 단위 기본값, TermFee.billingType이 있으면 그게 우선)

### 3.2 `ProjectMember` (참여기관) — `lib/mock.ts:907`
과제당 여러 건(주관 1 + 공동/위탁 N). 핵심 필드:

- role: `LEAD`(주관) `PARTICIPANT`(공동) `ENTRUSTED`(위탁, 공동의 하위 개념)
- **연차별 오버라이드 3종 패턴** — 기본값 필드 하나 + `{termNumber, ...}[]` 오버라이드 배열 하나가 세트로 존재:
  | 기본값 필드 | 오버라이드 배열 | 용도 |
  |---|---|---|
  | institutionGrade | gradeOverrides | 등급평가 갱신(정산면제리스트 재업로드 등) |
  | settlementType | settlementTypeOverrides | 위탁↔자체 정산 전환(계약변경 등) |
  | contactName/Email/Phone | recipientOverrides | 공문 수신 담당자 교체 |

  세 경우 모두 `resolveMember*ForTerm(member, termNumber)` 헬퍼(`lib/fee-calculator.ts`)가 "오버라이드에 그 연차가 있으면 그 값, 없으면 기본값"으로 귀결시킵니다.
- `annualBudgets?: AnnualBudget[]` — `{termYear, termNumber, cashBudget, inKindBudget, termStartDate?, termEndDate?, auditFirm?}`. **연차별 수수료 계산의 실제 입력값**이 여기 있습니다. 특정 연차에 이 배열 항목이 없으면(또는 금액이 0이면) "그 연차엔 미참여"로 취급되어 산정에서 빠집니다.
- `feeRate`, `calculatedFee`, `budget` — 코드 주석에 "레거시"로 명시. 실제 산정은 `lib/fee-calculator.ts`가 담당하고 이 필드들은 더 이상 계산에 쓰이지 않음(리팩토링 참고사항 5번).

### 3.3 `AnnualFinancials` — `lib/mock.ts:451` (최근 추가)
`Project.annualFinancials`의 원소. `{termYear, termNumber, govGrant, privateCash, privateInKind}`.
엑셀 업로드에서 연차·기관별로 입력받은 정부출연금/민간현금/민간현물을 참여기관 전체 합산해 연차마다 쌓습니다. `Project.govGrant/privateCash/privateInKind`(단일값, "당해" 필드)는 이 배열 중 `currentTerm`에 해당하는 원소와 항상 같은 값으로 유지되도록 저장 시점에 동기화됩니다(둘 다 갱신).

### 3.4 `ProjectIssue` (이슈/메모) — `lib/mock.ts:2806`
과제별 자유 메모. priority(HIGH/MEDIUM/LOW), status(OPEN/IN_PROGRESS/RESOLVED), 알림 대상(recipientGroups: 역할 단위 + recipientUserIds: 개인 지정, 둘 다 비면 과제 담당자에게만).

---

## 4. 수수료 정책 & 계산 결과

### 4.1 `FeePolicy` — `lib/mock.ts:1062`
전담기관별(또는 공통, agencyId=null) 수수료 산정 규칙의 버전 스냅샷. `resolvePolicy(agencyId, policies, programType)`가 "전담기관 전용 ACTIVE 정책 → 없으면 공통 ACTIVE 정책" 순으로 찾습니다.

핵심 파라미터:

| 필드 | 의미 |
|---|---|
| feeRateBrackets | 현금사업비 구간별 기본수수료(정액) — 전담기관마다 다른 구간표(KEIT/KETEP/KOFPI/IITP 브라켓 등) |
| coInstAddonMethod | `TIERED`(첫1개10%+추가5%) `FLAT`(전체10%×N) `CUSTOM`(coInstFirstRate/coInstAdditionalRate 직접 지정) |
| exemptGrades | 면제기관 등급 조합(S/A/B/C 개별 선택 가능) |
| exemptionMode | `DISCOUNT`(면제등급도 산정기준액 포함, 청구비율만 할인 — KEIT/KETEP) `EXCLUDE`(산정기준액에서 완전 제외, 연차상시도 안함 — IITP/RDA1/RDA2) `CUSTOM`(DISCOUNT와 동일하되 면제기관 전용 요율 별도 지정) |
| annualBillingRate | 연차상시 청구비율(예: 0.85) |
| excludeLeadFromCalc | 주관기관을 산정기준액에서 완전 제외 + 공동기관수 -1 보정(RDA2, 주관이 농진청/소속기관인 경우) |
| calcMode | `AGGREGATE`(기본, 과제 전체 사업비로 산정 후 배분) `PER_INSTITUTION`(기관별 개별 산정 — IITP ICT기금사업) |
| hasAutonomyTrack | 자율성트랙 과제 허용 여부 |

### 4.2 계산 흐름 (`lib/fee-calculator.ts` → `calcTermFee`)
연차마다(각 참여기관의 그 연차 예산을 모아) 아래 순서로 계산합니다:

1. **표준수수료**: 전체 현금(혹은 현금+현물, `feeBasis`에 따라)을 구간표에 대입 + 공동기관 가산금
2. **일반수수료**: 면제등급 기관을 뺀 나머지로 같은 계산을 반복
3. **면제기관 수수료**: (표준-일반)을 면제기관들에 사업비 비례 배분(`allocateExact`, 최대잉여법으로 원단위까지 정확히 배분). **표준→산정 단계에서 이미 청구비율이 반영되고**(예: ×85%), **산정→청구 단계에서 정산구분에 따라 한 번 더 비율이 적용**됩니다(정산 연차에 위탁정산으로 전환한 기관만 100% 청구, 그 외는 한 번 더 청구비율 적용 — 자체정산을 계속 유지하면 정산 연차에도 100%에 도달하지 못하고 차액은 매몰비용으로 소멸)
4. **과제 산정수수료** = 일반수수료 + 면제기관 산정 합계
5. **청구수수료**: 연차상시엔 산정액×청구비율만 청구하고 나머지는 미청구로 이월, 정산 연차엔 100%+이월분 합산

`AUTONOMY_TRACK`(자율성트랙)+자체정산은 이 전체 흐름을 타지 않고 **표준수수료×청구비율**만으로 조기 반환합니다(정산 개념 자체가 없음, 면제기관 구분도 안 함). 자율성트랙+위탁정산은 일반과제와 동일한 흐름을 그대로 탑니다.

### 4.3 `TermFeeCalc` (연차 단위 산정 스냅샷) — `lib/mock.ts:2883`
과제 하나·연차 하나당 1건. `calcTermFee`의 출력 전체(표준/일반/면제/산정/청구액, `exemptBreakdown: ExemptInstDetail[]`)를 그대로 저장. `overrides: FeeOverride[]`로 수기 조정 이력을 남길 수 있음(필드명·원래값·조정값·사유·조정자).

> ⚠️ 시드 데이터의 `termFeeCalcs` 배열 중 `tfc-p001-*` 2건은 `autoGenerateTermFees`가 생성한 게 아니라 **손으로 입력한 예시값**입니다(도메인 문서 예시 재현용). 나머지 모든 과제의 실제 TermFeeCalc는 `autoGenerateTermFees` 호출로 매번 새로 계산되어 만들어집니다.

### 4.4 `TermFee` (연차×기관 단위 결과) — `lib/mock.ts:1430`
`TermFeeCalc` 하나에 대해 참여기관 수만큼 생성. 화면에 실제로 뿌려지는 기관별 산정액/청구액이 여기 있습니다.

| 필드 | 설명 |
|---|---|
| calculatedFee | 산정액 |
| appliedFee | 청구액(협의 후 조정 가능) |
| standardFee | 표준수수료(일반기관은 산정액과 동일, 면제기관은 청구비율 적용 전 원래 몫) |
| unclaimedFee | 미청구수수료(이번 연차에 걷지 않고 남기는 몫) |
| status | `SCHEDULED`(연차 미시작) `DRAFT` `CONFIRMED` `BILLED` |
| manualOverride / manualOverrideReason | 담당자가 청구액을 직접 수정했는지 — true면 재계산 시 보존됨 |
| otherFirmHandled | 이 연차를 삼화가 아닌 타회계법인이 진행했는지 — true면 화면에서 청구액을 숨김 |
| billingType | 이 연차만의 발행구분(정발행/역발행요청/역발행/대상아님/면제) — 없으면 `Project.billingType` 대체 사용 |

**재계산 잠금 규칙** (`autoGenerateTermFees`, `lib/store.ts:1470`): `CONFIRMED`/`BILLED`/`manualOverride`인 기관×연차는 정책·참여기관 정보가 바뀌어도 절대 건드리지 않고 그대로 보존. 그 외(DRAFT)는 매번 정책 파라미터·참여기관 데이터를 기준으로 새로 계산해서 덮어씀. `COMPLETED` 상태 과제는 통째로 재산정 대상에서 제외.

---

## 5. 청구 / 수금 / 세금계산서 / 정산

| 엔티티 | 라인 | 역할 | 비고 |
|---|---|---|---|
| `TaxInvoice` | mock.ts:2256 | 세금계산서. 연차 통합 발행이 기본이나 `institutionId`가 있으면 기관별 분리 발행(RDA2 등) | status: ISSUED/MODIFIED/CANCELED |
| `Receivable` | mock.ts:1712 | 미수금/채권(주관기관 또는 분리 기관 기준) | invoiceNumber로 TaxInvoice와 연결(느슨한 문자열 참조, FK 아님) |
| `Settlement` | mock.ts:1991 | 기관별 연구비 정산(수수료와 별개 — 연구비 지급액에서 수수료를 뗀 지급예정액 계산) | |
| `UnclaimedFee` | mock.ts:1625 | 미청구액 이월 추적(project+term+주관기관 단위, 자체 status 머신) | **`TermFee.unclaimedFee`(숫자 필드)와는 별개의 테이블** — 4번 참고 |

---

## 6. 커뮤니케이션 (공문/이메일/템플릿)

| 엔티티 | 역할 |
|---|---|
| `EmailDispatch` | 발송 이력. `emailType`(TAX_INVOICE/FEE_DETAIL/SETTLEMENT_NOTICE/DOC_REQUEST/PAYMENT_REMINDER/OTHER)별로 상이한 첨부/본문 구조. `SETTLEMENT_NOTICE`는 `noticeSnapshot`(발송 당시 공문 서식+금액 스냅샷)을 별도 보관 |
| `AgencyNoticeTemplateEntry` | 전담기관별 "정산절차 안내 공문" 템플릿(제목/본문/일정표/문의처/첨부서류 등 구조화) |
| `FeeInvoiceTemplateEntry` | 수수료 청구서 템플릿. 전담기관이 아니라 유형(ANNUAL/SETTLEMENT/REVERSE/OTHER)별로 관리 — 문구에 `{agency}` 자리표시자를 넣으면 발송 시 실제 전담기관명으로 치환 |
| `SimpleNoticeTemplateEntry` | 서류요청/입금확인 안내메일(첨부·표 없이 본문 텍스트만) — `{과제번호}` 등 토큰 치환 |
| `StandardAttachment` | 공문에 공통으로 붙는 첨부파일(사업자등록증 등), 유형별 자동첨부 on/off |

---

## 7. 시스템 / 관리

| 엔티티 | 역할 |
|---|---|
| `SystemUser` | role: ADMIN/ACCOUNTANT/SETTLEMENT/VIEWER. hiworksEmail/hiworksMailPassword로 이메일 발송(SMTP) |
| `Notice` | 사내 공지사항(회계담당자/전담기관담당자 공유) |
| `AuditEntry` (`lib/store.ts`) | 범용 변경이력 — entityType/entityId/action(CREATE/UPDATE/DELETE)/changedFields(before/after)/performedBy/performedAt. `record()` 헬퍼가 거의 모든 CRUD 함수에서 자동 호출됨 |
| `CompanyInfo` | 삼화회계법인 자체 정보(공문 발신자 정보, 대표이사 직인 등) — 싱글턴 |
| `PolicyHistoryEntry` | "정책 변경이력" 화면용 데이터 — **실제 정책 변경과 연결되어 있지 않은 정적 목데이터**(리팩토링 참고사항 2번) |
| `notificationState` (`StoreState`) | `Record<userId, {readIds, dismissedIds}>` — 헤더 알림(연체 채권·미해결 이슈, `lib/notifications.ts`가 매번 계산)에 대해 사용자별로 무엇을 읽었는지/닫았는지만 기록. 알림 목록 자체는 저장되지 않고 매번 원본 데이터(Receivable/ProjectIssue)에서 다시 계산됨 |
| `agencyGuides` (`StoreState`) | `Record<agencyShortName, AgencyGuideTab[]>` — 전담기관별 "운용 안내" 자유 형식 콘텐츠(탭 안에 caption/headers/rows로 이뤄진 표 여러 개). `updateAgencyGuide(shortName, tabs)`로 통째로 교체 |

### 7.1 인증/권한 — `StoreState` 밖에서 별도로 관리됨
- **로그인 세션** (`lib/auth.ts`): `StoreState`와 무관한 별도의 모듈 전역 상태(`AuthState = { user, isLoading }`). 로그인 시 **`localStorage`에 로그인한 사용자의 id 하나만** 저장합니다(`samhwa_auth_user_id`) — 이 앱에서 유일하게 새로고침 후에도 살아남는 값입니다(업무 데이터는 여전히 전부 사라짐). 비밀번호는 `DEMO_PASSWORDS`라는 이메일→평문비밀번호 `Record`로 소스코드에 하드코딩되어 있습니다(데모용 주석 명시).
- **권한 매트릭스** (`lib/permissions.ts`): 역할(ADMIN/ACCOUNTANT/SETTLEMENT/VIEWER)별로 어떤 페이지에 접근 가능한지(`PAGE_ACCESS`), 어떤 도메인에 쓰기 가능한지(`WRITE_ACCESS`)가 소스코드에 하드코딩된 `Record<string, Role[]>` 상수 2개로 정의되어 있습니다. `StoreState`에도, DB 설계에도 들어있지 않은 완전히 별도의 정적 설정입니다. (`prisma/schema.prisma`에는 이걸 위한 `RolePermission` 테이블이 이미 설계되어 있음 — 리팩토링 참고사항 7번 참고)

---

## 8. 상태 계층과 연산 (`lib/store.ts`)

`StoreState`(23개 필드 배열/객체)를 모듈 전역 변수 하나(`_state`)로 들고, `notify()`로 구독자(React 컴포넌트, `useStore()` 훅)에게 리렌더를 트리거하는 매우 단순한 Flux 유사 패턴입니다. Redux/Zustand 등 외부 상태관리 라이브러리 없이 직접 구현. (로그인 세션은 `lib/auth.ts`가 이 `StoreState`와 별도로 자체 관리합니다 — 7.1 참고.)

CRUD 함수는 도메인별로 40개 이상 존재하며 전부 `add*`/`update*`/`delete*` 네이밍 규칙을 따릅니다. 특이 지점만 정리:

- **재계산 트리거**: `PROJECT_FEE_AFFECTING_FIELDS`(agencyId/startDate/totalTerms/agreementType/stages/projectType/autonomySettlementType/programType)와 `FEE_AFFECTING_FIELDS`(budget/cashBudget/inKindBudget/institutionGrade/gradeOverrides/settlementType/settlementTypeOverrides/annualBudgets/role)에 해당하는 필드가 바뀌면 `updateProject`/`updateProjectMember`가 자동으로 `autoGenerateTermFees`를 호출합니다. 이 목록에 없는 필드 변경은 재계산을 트리거하지 않습니다.
- **`applyInstitutionGradeToProjects`**: 정산면제리스트 업로드로 특정 기관의 등급이 갱신되면, 그 기관이 참여 중인 모든 과제의 해당 연차에 소급 반영(단, CONFIRMED/BILLED/manualOverride/COMPLETED는 보호).
- **`getUnissuedInvoiceGroups`**: TermFee를 과제×연차(또는 RDA2면 과제×연차×기관) 단위로 묶어 세금계산서 미발행 건을 찾아주는 조회 함수.

---

## 9. 리팩토링/정리 후보 (변경 없이 보고만)

아래 0번은 결함이 아니라 **확인된 예정 작업**(DB 구축 시 진행)이라 따로 분리했고, 1~6번은 지금 코드 구조 안에서 정리해볼 만한 항목입니다.

### 0. (예정 작업, 지금 손대지 않음) Prisma 스키마·`DB_SCHEMA.md`가 실제 앱과 분리되어 있고, 영속성이 없음
지금은 테스트 단계라 의도적으로 DB를 안 붙인 상태— 결함이 아니라 다음 단계(실제 DB 구축)에서
진행할 작업입니다. 나중에 DB를 연동할 때 참고하시라고 현재 상태를 기록해둡니다.
- `lib/db.ts`가 `PrismaClient`를 export하지만 **앱 코드 어디에서도 import하지 않습니다**(grep 결과 0건).
- API 라우트는 `app/api/notices/send/route.ts` 단 하나뿐이고, 이마저 SMTP 메일 발송용이라 Prisma/DB와 무관합니다.
- 즉 지금 사이트는 **완전히 브라우저 메모리에서만 동작**합니다. `lib/store.ts`의 `_state`는 새로고침하면 `lib/mock.ts`의 하드코딩된 시드 데이터로 초기화됩니다 — 사용자가 화면에서 입력/수정한 모든 내용(과제 등록, 엑셀 업로드, 수수료 확정, 세금계산서 발행 등)이 새로고침 한 번에 사라집니다.
- 게다가 `DB_SCHEMA.md`/`prisma/schema.prisma`의 35개 테이블 설계는 지금 앱이 실제로 구현한 핵심 로직(자율성트랙, 면제기관 이중비율, RDA2 주관기관 제외, 연차별 오버라이드 3종, 단계협약 구조, `calcMode: PER_INSTITUTION` 등)을 전혀 반영하고 있지 않습니다.
- **참고**: 실제로 DB를 연동할 때는 스키마를 일부만 손보는 게 아니라, 이 문서에 정리된 실제 데이터 모델(2~7장)을 기준으로 스키마를 다시 설계하는 편이 안전해 보입니다.

### 1. `Project.govGrant/privateCash/privateInKind` ↔ `annualFinancials` 이중 저장
같은 값을 단일 필드(당해)와 배열(연차별 이력) 양쪽에 저장하고 저장 시점마다 수동으로 동기화하고 있습니다(현재는 `app/projects/[id]/page.tsx`의 `doSaveEdit()`과 엑셀 업로드 두 경로 모두에서 동기화 코드를 각각 작성). 두 경로 중 하나가 나중에 동기화를 빠뜨리면 조용히 어긋날 수 있는 구조입니다. 장기적으로는 `annualFinancials`를 단일 진실 소스로 삼고, "당해" 값은 `annualFinancials.find(currentTerm)`에서 파생시키는 편이 안전합니다.

### 2. `policyHistory`(정책 변경이력)가 정적 목데이터로 고립되어 있음
`app/policy-history/page.tsx`가 `lib/mock.ts`의 `policyHistory` 배열을 직접 import해서 보여주는데, 이 배열은 `StoreState`에 포함되어 있지 않고 `addFeePolicy`/`updateFeePolicy`도 여기에 아무것도 기록하지 않습니다. 즉 이 화면은 실제 정책 변경과 무관하게 항상 같은 6건의 데모 데이터만 보여줍니다 — 실제 변경이력은 범용 `AuditEntry`(entityType: "feePolicy")로만 남습니다. 화면 목적이 유효하다면 `AuditEntry`를 소스로 바꾸거나, 데모용이 아니라면 화면을 걷어내는 정리가 필요해 보입니다.

### 3. "미청구"가 두 군데서 따로 추적됨
- `TermFee.unclaimedFee`(기관×연차 단위 숫자 필드) — 실제 계산 엔진(`calcTermFee`, `autoGenerateTermFees`)이 쓰고 화면에도 표시되는, **살아있는** 값.
- `UnclaimedFee`(project+term+주관기관 단위의 독립 엔티티, 자체 status: PENDING/CARRIED_OVER/RESOLVED) — `app/unclaimed/page.tsx`가 쓰는 것으로 보이는 별도 목록.

두 개념이 같은 걸 가리키는지, 서로 다른 시점의 스냅샷인지 코드만으로는 명확하지 않았습니다. 실제 화면에서 두 값이 항상 일치하는지, 하나가 다른 하나로부터 파생되어야 하는 건 아닌지 확인이 필요해 보입니다.

### 4. `ProjectMember.feeRate` / `calculatedFee` / `budget` — 레거시 필드
코드 주석에 "레거시, 신규 산정은 fee-calculator 사용"이라고 명시되어 있음에도 시드 데이터 전체에 계속 값이 채워지고 있습니다(예: `feeRate: 3.0, calculatedFee: 21_000_000`). 실제 계산에는 안 쓰이지만 계속 유지보수 대상이 되고 있어, 신규 데이터 입력 시 혼란을 줄 수 있습니다.

### 5. 연차별 오버라이드 패턴이 3벌 반복됨
`gradeOverrides`/`settlementTypeOverrides`/`recipientOverrides`가 구조·해석 로직(`resolveMemberGradeForTerm`/`resolveMemberSettlementTypeForTerm`/`resolveMemberRecipientForTerm`)까지 거의 동일하게 반복 구현되어 있습니다. 지금도 잘 동작하고 있어 급하게 통합할 필요는 없어 보이지만, 네 번째 "연차별 오버라이드 필드"가 추가될 일이 생긴다면 공용 유틸(`resolveOverrideForTerm<T>(base, overrides, termNumber)`)로 일반화하는 걸 고려할 만합니다.

### 6. `TermFeeCalc` 시드 데이터 중 일부가 손으로 입력된 예시값
`tfc-p001-2022-1`/`tfc-p001-2023-2` 2건은 `autoGenerateTermFees`가 아니라 사람이 직접 입력한 예시(도메인 문서 재현용)입니다. 계산 엔진이 수정될 때(예: 이번 세션에서 있었던 면제기관 이중비율 수정) 이런 손입력 값은 자동으로 따라 바뀌지 않으므로, 계산 로직이 바뀔 때마다 이 값들이 여전히 "정답"인지 별도로 확인해야 하는 부담이 있습니다.

### 7. 로그인 비밀번호·권한 매트릭스가 소스코드에 하드코딩됨 (DB 설계 시 함께 고려할 항목)
- `lib/auth.ts`의 `DEMO_PASSWORDS`(이메일→평문 비밀번호)와 `lib/permissions.ts`의 `PAGE_ACCESS`/`WRITE_ACCESS`(역할→허용 페이지/도메인)가 둘 다 `StoreState`가 아니라 소스코드 상수로 존재합니다. 사용자를 추가해도 비밀번호는 `SystemUser`에 저장되지 않고, 권한도 화면에서 바꿀 방법이 없습니다.
- `prisma/schema.prisma`에는 이미 `users.password_hash`(해시 필드)와 `role_permissions` 테이블이 설계되어 있어, DB 설계 관점에서는 이 부분이 "새로 만들 것"이 아니라 "이미 설계된 걸 실제로 연결할 것"에 가깝습니다. 다만 지금 `PAGE_ACCESS`/`WRITE_ACCESS`의 키(페이지 경로 문자열, 도메인 문자열)와 `role_permissions`의 `resource_type`(MENU/FEATURE/DATA)+`resource_key`+`action`(READ/WRITE/DELETE/EXPORT/APPROVE) 조합은 구조가 달라서, 매핑 규칙을 새로 정해야 합니다.
- 평문 비밀번호(`DEMO_PASSWORDS`)는 데모용이라고 주석에 명시돼 있지만, DB 연동 시점엔 실제 해시(`bcrypt` 등)로 바뀌어야 할 부분이라 짚어둡니다.

---

## 부록: 엔티티 인덱스 (파일 위치)

| 엔티티 | 정의 위치 |
|---|---|
| Institution | lib/mock.ts:26 |
| FundingAgency | lib/mock.ts:336 |
| AnnualFinancials | lib/mock.ts:451 |
| Project | lib/mock.ts:459 |
| AnnualBudget | lib/mock.ts:877 |
| GradeOverride | lib/mock.ts:890 |
| SettlementTypeOverride | lib/mock.ts:895 |
| RecipientOverride | lib/mock.ts:900 |
| ProjectMember | lib/mock.ts:907 |
| PolicyRule | lib/mock.ts:1046 |
| FeeRateBracket | lib/mock.ts:1056 |
| FeePolicy | lib/mock.ts:1062 |
| TermFee | lib/mock.ts:1430 |
| UnclaimedFee | lib/mock.ts:1625 |
| Receivable | lib/mock.ts:1712 |
| Settlement | lib/mock.ts:1991 |
| TaxInvoice | lib/mock.ts:2256 |
| NoticeSnapshot | lib/mock.ts:2530 |
| EmailDispatch | lib/mock.ts:2540 |
| PolicyHistoryEntry | lib/mock.ts:2730 |
| SystemUser | lib/mock.ts:2754 |
| Notice | lib/mock.ts:2780 |
| ProjectIssue | lib/mock.ts:2806 |
| FeeOverride | lib/mock.ts:2863 |
| ExemptInstDetail | lib/mock.ts:2872 |
| TermFeeCalc | lib/mock.ts:2883 |
| CompanyInfo | lib/mock.ts:3010 |
| StandardAttachment | lib/mock.ts:3045 |
| AgencyNoticeTemplate(Entry) | lib/mock.ts:3067 / 3082 |
| FeeInvoiceTemplate(Entry) | lib/mock.ts:3093 / 3115 |
| SimpleNoticeTemplate(Entry) | lib/mock.ts:3366 / 3370 |
| AgencyGuideRow/Table/Tab | lib/mock.ts:3005-3007 |
| StoreState / CRUD 함수 전체 | lib/store.ts:96 이하 |
| AuditEntry | lib/store.ts:58 |
| notificationState 관련 함수 | lib/store.ts:1080-1108 |
| agencyGuides 관련 함수(updateAgencyGuide) | lib/store.ts:1325 |
| calcTermFee(계산 엔진) | lib/fee-calculator.ts:366 |
| AuthState / login / DEMO_PASSWORDS | lib/auth.ts |
| PAGE_ACCESS / WRITE_ACCESS(권한 매트릭스) | lib/permissions.ts |
