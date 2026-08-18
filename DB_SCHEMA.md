# Samhwa DB 구조 설계 및 데이터 모델링

> 국가지원사업 참여 기업 및 수행기관의 과제코드 기준 연차별 수수료, 세금계산서, 미청구액, 미수금, 기관 정산 내역 통합 관리 ERP

> **2026-08-18 갱신**: 현재 `lib/mock.ts`(데이터 모델)·`lib/store.ts`(상태/변경 로직)로 구현된 실제 프론트엔드 도메인 모델을
> 기준으로 전면 재정비했다. 예전 버전은 실제 코드에 없는 개념(기업분류 별도 엔티티, 정책 규칙 다중 테이블,
> 청구/수금 이력 정규화 등)을 가정하고 있어 실제 구현과 크게 어긋나 있었다. 아래 스키마는 실제 도메인 모델을
> 그대로 정규화한 것이며, 백엔드/DB 전환 시 이 문서를 기준으로 삼는다.

---

## 전체 테이블 목록 (33개)

| 그룹 | 테이블명 | 한국어명 |
|------|---------|---------|
| 사용자/권한 | `users` | 사용자 |
| 사용자/권한 | `role_permissions` | 역할별 권한 매핑 *(현재는 `lib/permissions.ts`에 하드코딩 — DB화는 추후 과제)* |
| 사용자/권한 | `audit_logs` | 감사 로그(변경이력) |
| 전담기관 | `funding_agencies` | 전담기관 (KEIT/KETEP/IITP/KOFPI/RDA1/RDA2) *(신규)* |
| 기관 | `institutions` | 수행기관 (기업·대학·연구소 통합 단일 엔티티) |
| 기관 | `institution_contacts` | 기관 담당자 |
| 과제 | `projects` | 과제 |
| 과제 | `project_stages` | 단계협약 단계 구성 *(신규)* |
| 과제 | `project_assigned_manager_histories` | 과제 담당자 연차별 이력 *(신규)* |
| 참여기관 | `project_members` | 참여기관 (과제×기관, 과제 전체를 아우르는 1행 + 아래 이력 테이블로 연차별 예외 표현) |
| 참여기관 | `project_member_annual_budgets` | 참여기관 연차별 현금/현물 사업비 |
| 참여기관 | `project_member_grade_histories` | 참여기관 연차별 등급 변경이력 *(신규)* |
| 참여기관 | `project_member_settlement_type_histories` | 참여기관 연차별 정산구분 변경이력 *(신규)* |
| 참여기관 | `project_member_recipient_histories` | 참여기관 연차별 공문 수신자 변경이력 *(신규)* |
| 수수료 정책 | `fee_policies` | 수수료 정책 (전담기관별 버전 관리) |
| 수수료 정책 | `fee_policy_rate_brackets` | 현금사업비 구간별 기본수수료(정액) |
| 수수료 정책 | `policy_change_histories` | 정책 변경이력 |
| 수수료 관리 | `term_fees` | 기관별 연차 수수료 (청구/발행 관리 단위) |
| 수수료 관리 | `term_fee_calcs` | 과제 단위 연차 수수료 산정 스냅샷 *(신규)* |
| 수수료 관리 | `term_fee_calc_exempt_details` | 산정 스냅샷 내 면제기관별 배분 상세 *(신규)* |
| 수수료 관리 | `term_fee_calc_overrides` | 산정 스냅샷 수기조정 이력 *(신규)* |
| 수수료 관리 | `unclaimed_fees` | 미청구액 |
| 이슈/메모 | `project_issues` | 과제 이슈/메모 *(신규)* |
| 청구/채권 | `receivables` | 미수금/채권 (청구~수금을 한 행에서 직접 추적) |
| 세금계산서 | `tax_invoices` | 세금계산서 |
| 세금계산서 | `fee_invoice_templates` | 수수료 청구서 문구 양식 (유형별) *(신규)* |
| 세금계산서 | `fee_invoice_default_attachments` | 청구서 유형별 기본 첨부파일 *(신규)* |
| 세금계산서 | `standard_attachments` | 공문 공통 첨부파일 (사업자등록증 등) |
| 정산 | `settlements` | 기관 정산 |
| 공지/공문 | `notices` | 공지사항 |
| 공지/공문 | `agency_notice_templates` | 전담기관별 정산절차 안내 공문 양식 |
| 공지/공문 | `company_info` | 공문 발신 회사(삼화회계법인) 정보 — 싱글턴 |
| 이메일 | `email_dispatches` | 이메일/공문 발송 이력 |

> 삭제된 테이블(예전 버전에는 있었으나 실제 도메인에 대응 개념이 없음): `companies`, `company_contacts`,
> `company_classifications`, `company_classification_histories`(기관은 기업/대학/연구소 구분 없이 `institutions` 단일
> 엔티티로 통합 관리 — `institution_type`이 이 역할을 대신함), `project_terms`/`project_term_institutions`(정규화된
> 연차 조인 테이블 대신 `project_members` + 연차별 이력 테이블 구조로 대체), `fee_policy_institution_count_rules`
> · `fee_policy_project_type_rules` · `fee_policy_settlement_type_rules` · `fee_policy_company_class_rules` ·
> `fee_policy_billing_ratio_rules` · `fee_policy_exemption_rules` · `fee_policy_exception_rules`(실제 수수료 정책은
> 이런 다중 규칙 테이블이 아니라 `fee_policies`에 파라미터를 직접 갖는 단일 레코드 구조 — 아래 그룹 6 참조),
> `claims`, `payment_histories`(실제로는 `receivables` 한 행에 청구액/수금액/수금일을 직접 기록하며, 분할 입금
> 이력이나 청구 건별 별도 로그는 아직 없음), `tax_invoice_templates`/`tax_invoice_histories`(세금계산서 자체는
> 스냅샷·수정이력 없이 단순 상태값만 관리 — 대신 청구서 "문구 양식"은 `fee_invoice_templates`로 별도 관리),
> `settlement_histories`(정산도 별도 변경이력 테이블 없이 상태값만 관리).

---

## 전체 관계도 (ERD)

```
[users] ──────────────────────────────────────── (created_by / performed_by 참조)
    │
    ├─ [role_permissions]   (역할별 메뉴/기능 접근 권한 — 현재 코드 하드코딩)
    └─ [audit_logs]         (모든 엔티티의 생성/수정/삭제를 entity_type/entity_id로 범용 추적)

[funding_agencies] 1 ─── N [projects]
[funding_agencies] 1 ─── N [fee_policies]   (agency_id NULL = 공통/전역 정책)

[institutions] 1 ─── N [institution_contacts]
[institutions] 1 ─── N [projects]              (lead_institution_id)
[institutions] 1 ─── N [project_members]       (institution_id)

[projects] 1 ─── N [project_stages]                       (agreement_type='STAGED'일 때만)
[projects] 1 ─── N [project_assigned_manager_histories]
[projects] 1 ─── N [project_members]
[projects] 1 ─── N [term_fee_calcs]
[projects] 1 ─── N [project_issues]

[project_members] 1 ─── N [project_member_annual_budgets]
[project_members] 1 ─── N [project_member_grade_histories]
[project_members] 1 ─── N [project_member_settlement_type_histories]
[project_members] 1 ─── N [project_member_recipient_histories]
[project_members] 1 ─── N [term_fees]           (institution_id + project_id + term_number 기준 매칭)

[fee_policies] 1 ─── N [fee_policy_rate_brackets]
[fee_policies] 1 ─── N [policy_change_histories]

[term_fee_calcs] 1 ─── N [term_fee_calc_exempt_details]
[term_fee_calcs] 1 ─── N [term_fee_calc_overrides]

[term_fees] ─── 1 [receivables]   (동일 project+term(+institution)에 대해 1건, RDA2 등만 기관별 개별)
[term_fees] ─── 1 [tax_invoices]
[term_fees] ─── N [unclaimed_fees]
[project_members] ─── N [settlements]   (기관별 연구비 정산 — 연차상시/정산과 별개 트랙)

[funding_agencies] 1 ─── N [agency_notice_templates]
[fee_invoice_templates] 1 ─── N [fee_invoice_default_attachments]
[email_dispatches] ─── [projects], [institutions], [agency_notice_templates]?, [fee_invoice_templates]?
```

---

## ENUM 타입 정의

```sql
-- 사용자 역할 (lib/permissions.ts의 Role과 동일)
CREATE TYPE user_role AS ENUM (
  'ADMIN',        -- 시스템 관리자 — 전 메뉴 접근/쓰기
  'ACCOUNTANT',    -- 회계 담당자
  'SETTLEMENT',    -- 전문(전담)기관담당자
  'VIEWER'         -- 조회 전용 (기본 진입 페이지도 다름 — /fees)
);

-- 기관 유형 (기업/대학/연구소 구분 없이 institutions 하나로 통합, 이 값으로만 구분)
CREATE TYPE institution_type AS ENUM (
  '대기업', '중견기업', '중소기업', '스타트업', '대학', '정부출연연구소', '공공기관'
);

-- 참여기관 역할
CREATE TYPE member_role AS ENUM (
  'LEAD',         -- 주관기관 — 세금계산서/미수금/미청구 청구 대상
  'PARTICIPANT',  -- 참여(공동)기관
  'ENTRUSTED'     -- 위탁(공동 중 일부 연구를 위탁받아 참여, 넓은 의미로 참여기관에 포함)
);

-- 기관 등급 (정산면제리스트 기준) — 참여기관 화면 표시용 라벨이며, 수수료 면제/일반 버킷 분류는
-- ProjectMember.settlementType(정산구분)만으로 결정된다. 등급 자체는 계산에 직접 개입하지 않는다.
CREATE TYPE institution_grade AS ENUM (
  '최우수(S)', '우수(A)', '우수(B)', '우수(C)', '일반'
);

-- 정산구분 — 참여기관이 그 연차에 위탁정산(수탁 방식)인지 자체정산(직접 정산)인지.
-- 면제/일반 수수료 버킷 분류, 정산 연차 청구비율(100% vs 유지)에 직접 영향을 준다.
CREATE TYPE settlement_type AS ENUM ('위탁정산', '자체정산');

-- 과제 상태
CREATE TYPE project_status AS ENUM ('ACTIVE', 'COMPLETED', 'SUSPENDED');

-- 협약 구조 — 일괄협약(전 기간 단일 계약) vs 단계협약(단계마다 별도 계약, 단계 끝에 정산)
CREATE TYPE agreement_type AS ENUM ('BATCH', 'STAGED');

-- 과제 유형 — 자율성트랙은 수수료 계산 방식 자체가 다름(전 기간 85% 균일 청구 등)
CREATE TYPE project_type AS ENUM ('GENERAL', 'AUTONOMY_TRACK');

-- 사업 유형 — IITP 전용, ICT 기금사업은 국가연구개발사업과 완전히 다른 수수료 체계 사용
CREATE TYPE program_type AS ENUM ('GENERAL', 'ICT_FUND');

-- 세금계산서 발행구분
CREATE TYPE billing_type AS ENUM ('정발행', '역발행요청', '역발행', '대상아님', '면제');

-- 연차별 수수료(term_fees) 상태 — SCHEDULED: 연차 미시작, BILLED: 세금계산서 발행 완료
CREATE TYPE fee_status AS ENUM ('SCHEDULED', 'DRAFT', 'CONFIRMED', 'BILLED');

-- 과제단위 산정 스냅샷(term_fee_calcs) 상태
CREATE TYPE term_fee_calc_status AS ENUM ('DRAFT', 'CONFIRMED', 'BILLED');

-- 연차상시 vs 정산 — 단계 마지막 연차만 SETTLEMENT, 나머지는 ANNUAL
CREATE TYPE work_type AS ENUM ('ANNUAL', 'SETTLEMENT');

-- 정책의 면제기관 처리 방식
CREATE TYPE exemption_mode AS ENUM (
  'DISCOUNT',  -- 산정기준액엔 포함, 연차상시청구비율만 적용 (KEIT/KETEP)
  'EXCLUDE',   -- 산정기준액에서 완전 제외, 연차상시도 없음 (IITP/RDA1/RDA2)
  'CUSTOM'     -- DISCOUNT와 동일하되 면제기관 전용 청구비율(exempt_custom_rate)을 따로 적용
);

-- 공동기관 가산금 계산 방식
CREATE TYPE co_inst_addon_method AS ENUM ('TIERED', 'FLAT', 'CUSTOM');

-- 산정기준액 산출 기준 — 현금만 vs 현금+현물 합산(RDA1/RDA2)
CREATE TYPE fee_basis AS ENUM ('CASH', 'CASH_PLUS_INKIND');

-- 표준수수료 산정 모드 — AGGREGATE: 과제 전체로 산정 후 배분(기본) / PER_INSTITUTION: 기관별 개별 산정(IITP ICT기금)
CREATE TYPE calc_mode AS ENUM ('AGGREGATE', 'PER_INSTITUTION');

-- 정책 상태
CREATE TYPE fee_policy_status AS ENUM ('ACTIVE', 'EXPIRED', 'DRAFT');

-- 정책 변경이력 유형
CREATE TYPE policy_change_type AS ENUM ('CREATED', 'UPDATED', 'ROLLBACK');

-- 미수금/채권 상태
CREATE TYPE receivable_status AS ENUM ('PENDING', 'OVERDUE', 'PAID', 'PARTIAL');

-- 세금계산서 상태
CREATE TYPE tax_invoice_status AS ENUM ('ISSUED', 'MODIFIED', 'CANCELED');

-- 정산 상태
CREATE TYPE settlement_status AS ENUM ('SCHEDULED', 'PAID', 'PENDING');

-- 미청구액 상태
CREATE TYPE unclaimed_status AS ENUM ('PENDING', 'CARRIED_OVER', 'RESOLVED');

-- 이메일/공문 발송 상태 및 유형
CREATE TYPE email_dispatch_status AS ENUM ('SUCCESS', 'FAILED', 'PENDING');
CREATE TYPE email_type AS ENUM (
  'TAX_INVOICE', 'FEE_DETAIL', 'SETTLEMENT_NOTICE', 'DOC_REQUEST', 'PAYMENT_REMINDER', 'OTHER'
);
CREATE TYPE fee_email_category AS ENUM ('ANNUAL', 'SETTLEMENT');

-- 이슈/메모
CREATE TYPE issue_priority AS ENUM ('HIGH', 'MEDIUM', 'LOW');
CREATE TYPE issue_status AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED');
CREATE TYPE issue_recipient_group AS ENUM ('MANAGER', 'ACCOUNTANT', 'SETTLEMENT');

-- 전담기관 발송 대상 범위
CREATE TYPE notice_recipient_scope AS ENUM ('LEAD_ONLY', 'LEAD_AND_PARTICIPANTS');
```

---

## 테이블 스키마 상세

### 그룹 1. 사용자 및 권한

#### `users` — 사용자

| 컬럼명 | 타입 | 제약 | 설명 |
|--------|------|------|------|
| id | UUID | PK DEFAULT gen_random_uuid() | |
| email | VARCHAR(255) | UNIQUE NOT NULL | 로그인 ID |
| password_hash | VARCHAR(255) | NOT NULL | bcrypt 해시 (현재 데모 환경은 평문 매핑, 실서비스 전환 시 해시화 필요) |
| name | VARCHAR(100) | NOT NULL | |
| role | user_role | NOT NULL | |
| status | VARCHAR(20) | NOT NULL DEFAULT 'ACTIVE' | ACTIVE / INACTIVE — 비활성 계정은 비밀번호가 맞아도 로그인 거부 |
| last_login_at | TIMESTAMP | | |
| registered_at | DATE | NOT NULL | |
| hiworks_email | VARCHAR(255) | | 하이웍스 개인 메일 계정 (조회전용 계정은 대상 아님) |
| hiworks_mail_password | VARCHAR(255) | | 하이웍스 메일 SMTP 발송 전용 비밀번호 (로그인 비밀번호와 별개) |
| created_at | TIMESTAMP | DEFAULT NOW() | |
| updated_at | TIMESTAMP | DEFAULT NOW() | |

#### `role_permissions` — 역할별 권한 매핑

> **현재 상태**: DB가 아니라 `lib/permissions.ts`의 `PAGE_ACCESS`(페이지 접근)·`WRITE_ACCESS`(쓰기 권한) 맵에
> 하드코딩되어 있다. 권한 항목이 세분화되어 있어(예: `fees-sales`·`fees-other-firm`처럼 같은 메뉴 안에서도
> 액션별로 다른 역할 제한) 아래 스키마는 이 코드를 DB로 옮길 경우의 설계이며, 실제 마이그레이션 전까지는
> 참고용이다.

| 컬럼명 | 타입 | 제약 | 설명 |
|--------|------|------|------|
| id | UUID | PK | |
| role | user_role | NOT NULL | 대상 역할 |
| resource_key | VARCHAR(200) | NOT NULL | 리소스 식별자 (ex: `page.fees`, `write.fees-sales`) |
| is_allowed | BOOLEAN | NOT NULL DEFAULT true | |
| created_at | TIMESTAMP | DEFAULT NOW() | |
| — | UNIQUE | (role, resource_key) | |

#### `audit_logs` — 감사 로그(변경이력)

> 모든 엔티티(과제/참여기관/기관/전담기관/정책/수수료/이슈 등)의 생성·수정·삭제를 entity_type/entity_id로
> 범용 추적한다. 과제상세 페이지의 "변경이력" 탭, `/audit-log` 전체 변경이력 페이지가 모두 이 테이블을 조회한다.

| 컬럼명 | 타입 | 제약 | 설명 |
|--------|------|------|------|
| id | UUID | PK | |
| entity_type | VARCHAR(50) | NOT NULL | project / projectMember / institution / fundingAgency / feePolicy / termFee / unclaimed / receivable / settlement / taxInvoice / emailDispatch / user / projectIssue / notice 등 |
| entity_id | UUID | NOT NULL | |
| entity_label | VARCHAR(300) | NOT NULL | 목록에 바로 표시할 식별 라벨(예: "RS-2024-00214837 · 삼화전자(주)") — 원본 레코드가 삭제돼도 이력은 남아야 하므로 비정규화 저장 |
| action | VARCHAR(10) | NOT NULL | CREATE / UPDATE / DELETE |
| changed_fields | JSONB | | `{ 필드명: { before, after } }` — UPDATE일 때만. 등급/정산구분/담당자처럼 연차별 이력 배열 필드는 "N연차부터 X로 변경" 형태로 요약해 표시(`lib/audit-log-format.ts`) |
| performed_by | VARCHAR(100) | NOT NULL | 행위자 이름 (비정규화 — users.id 대신 표시용 이름을 직접 저장) |
| performed_at | TIMESTAMP | NOT NULL DEFAULT NOW() | |

---

### 그룹 2. 전담기관

#### `funding_agencies` — 전담기관 *(신규 — 예전 버전에 누락)*

> KEIT/KETEP/IITP/KOFPI/RDA1/RDA2처럼 과제를 배정하는 정부 산하 전담기관. 과제(`projects.agency_id`)·수수료
> 정책(`fee_policies.agency_id`)이 모두 이 테이블을 참조하는 핵심 마스터 테이블인데도 예전 버전 문서에는
> 테이블 자체가 없었다.

| 컬럼명 | 타입 | 제약 | 설명 |
|--------|------|------|------|
| id | UUID | PK | |
| name | VARCHAR(200) | NOT NULL | 정식명칭 |
| short_name | VARCHAR(50) | NOT NULL | 약칭 (KEIT 등) |
| code | VARCHAR(50) | UNIQUE NOT NULL | |
| contact_name | VARCHAR(100) | | |
| contact_email | VARCHAR(255) | | |
| contact_phone | VARCHAR(30) | | |
| website | VARCHAR(300) | | |
| status | VARCHAR(20) | DEFAULT 'ACTIVE' | ACTIVE / INACTIVE |
| notice_recipient_scope | notice_recipient_scope | NOT NULL | LEAD_ONLY: 주관기관만 발송 / LEAD_AND_PARTICIPANTS: 주관+참여기관 모두 |
| auto_detect_by_lead_institution | BOOLEAN | DEFAULT false | 주관기관명이 affiliated_institution_names에 있으면 사용자가 다른 전담기관을 골라도 이 전담기관으로 자동 교정 (RDA1/RDA2처럼 같은 실제 기관을 정책상 여러 레코드로 나눠 관리할 때 사용) |
| affiliated_institution_names | TEXT[] | | 소속기관명 목록 |
| special_notes | TEXT[] | | 수수료 산정 특성 자유 메모(자동계산 아님, 담당자 직접 관리) |
| registered_at | DATE | NOT NULL | |
| created_at | TIMESTAMP | DEFAULT NOW() | |
| updated_at | TIMESTAMP | DEFAULT NOW() | |

---

### 그룹 3. 기관

#### `institutions` — 수행기관 *(기업/대학/연구소 통합 단일 엔티티)*

> 예전 버전은 `companies`(기업)와 `institutions`(대학·연구소)를 별도 테이블로 나누고 `company_id` nullable FK로
> 연결하는 구조였다. 실제 구현은 애초에 그런 구분을 두지 않는다 — 기업이든 대학이든 연구소든 `institution_type`
> 값만 다를 뿐 완전히 동일한 하나의 엔티티로 관리된다(`lib/mock.ts` 상단 주석: "기관 관리 — 통합, 기업/대학/연구소
> 구분 없이 동일 엔티티"). `company_classifications`류의 기업분류·분류이력·분류별 수수료 계수 테이블도 실제로는
> 존재하지 않는다.

| 컬럼명 | 타입 | 제약 | 설명 |
|--------|------|------|------|
| id | UUID | PK | |
| name | VARCHAR(200) | NOT NULL | 기관명 |
| type | institution_type | NOT NULL | |
| biz_number | VARCHAR(20) | UNIQUE NOT NULL | 사업자/고유번호 |
| representative_name | VARCHAR(100) | | 대표자명 |
| contact_name | VARCHAR(100) | | 기관 회계담당자 — 세금계산서·공문 발송 수신처 (삼화 내부담당자·연구책임자와 별개) |
| contact_email | VARCHAR(255) | | |
| contact_phone | VARCHAR(30) | | |
| status | VARCHAR(20) | DEFAULT 'ACTIVE' | ACTIVE / INACTIVE |
| note | TEXT | | 기관 특이사항 메모 (이슈/메모 기능과 별개) |
| reference_grade | institution_grade | | 정산면제리스트(과기정통부 연구지원체계 등급평가) 기준 마스터 참고 등급. "정산면제리스트 업로드"로 갱신되며, 과제별 실제 등급(`project_members.institution_grade`)과는 별개의 참고값 — 새 참여기관 등록 시 자동으로 채워주지 않는다. |
| registered_at | DATE | NOT NULL | |
| created_at | TIMESTAMP | DEFAULT NOW() | |
| updated_at | TIMESTAMP | DEFAULT NOW() | |

#### `institution_contacts` — 기관 담당자

| 컬럼명 | 타입 | 제약 | 설명 |
|--------|------|------|------|
| id | UUID | PK | |
| institution_id | UUID | FK institutions NOT NULL | |
| name | VARCHAR(100) | NOT NULL | |
| department | VARCHAR(100) | | |
| position | VARCHAR(100) | | |
| phone | VARCHAR(30) | | |
| email | VARCHAR(255) | | |
| is_primary | BOOLEAN | DEFAULT false | |
| is_active | BOOLEAN | DEFAULT true | |
| created_at | TIMESTAMP | DEFAULT NOW() | |
| updated_at | TIMESTAMP | DEFAULT NOW() | |

---

### 그룹 4. 과제

#### `projects` — 과제

| 컬럼명 | 타입 | 제약 | 설명 |
|--------|------|------|------|
| id | UUID | PK | |
| project_number | VARCHAR(100) | UNIQUE NOT NULL | 과제번호 |
| project_name | VARCHAR(500) | NOT NULL | |
| agency_id | UUID | FK funding_agencies NOT NULL | 전담기관 |
| lead_institution_id | UUID | FK institutions NOT NULL | 주관기관 — 세금계산서/미수금/미청구 청구 대상 |
| total_budget | BIGINT | NOT NULL | 총사업비 (참여기관 사업비 합계로 자동 유지) |
| start_date | DATE | NOT NULL | 당해 시작일 |
| end_date | DATE | NOT NULL | 당해 종료일 |
| first_start_date | DATE | | 과제 전체 최초시작일 |
| final_end_date | DATE | | 과제 전체 최종종료일 |
| total_terms | INTEGER | NOT NULL | 총 연차 수 |
| current_term | INTEGER | NOT NULL | 현재 진행 연차 |
| status | project_status | DEFAULT 'ACTIVE' | |
| gov_grant | BIGINT | | 당해(current_term) 정부출연금 — 연차별 이력은 별도(annual_financials, 필요 시 신설) |
| private_cash | BIGINT | | 당해 민간현금 |
| private_in_kind | BIGINT | | 당해 민간현물 |
| usage_report_deadline | DATE | | 사용실적 제출기한 |
| agency_assigned_at | DATE | | 전담기관 배정일 |
| internal_assigned_at | DATE | | 내부 배정일 |
| project_category | VARCHAR(100) | | 과제 구분(자유 텍스트 — 예: "연차상시") |
| research_lead | VARCHAR(100) | | 연구책임자 |
| project_code | VARCHAR(100) | | 전담기관 과제코드 (전담기관 약칭-순번, 등록 시 자동 생성) |
| project_division | VARCHAR(10) | | 위탁 / 공동 |
| billing_type | billing_type | | 과제 기본 발행구분 — 비어있으면 연차별로 판별, 연차별 값이 있으면 `term_fees.billing_type`이 우선 |
| agreement_type | agreement_type | DEFAULT 'BATCH' | BATCH(일괄협약, 0단계) / STAGED(단계협약) — STAGED면 `project_stages`에 단계 구성 |
| project_type | project_type | DEFAULT 'GENERAL' | |
| autonomy_settlement_type | settlement_type | | project_type='AUTONOMY_TRACK'일 때만 의미 있는, 과제 전체 단위 정산구분. 참여기관별 정산구분과는 완전히 별개(계산 방식 자체가 다름). 미지정 시 자체정산 취급 |
| program_type | program_type | DEFAULT 'GENERAL' | ICT_FUND는 IITP 전용, 별도 수수료 체계 |
| assigned_manager | VARCHAR(100) | | 삼화 담당자(현재 진행연차 기준) — 연차별 이력은 `project_assigned_manager_histories` |
| registered_at | DATE | | 과제 등록일 — 연도별 대시보드 집계 기준 |
| created_at | TIMESTAMP | DEFAULT NOW() | |
| updated_at | TIMESTAMP | DEFAULT NOW() | |

> 삭제: 예전 `settlement_type VARCHAR(50) NOT NULL — "정산구분 (확정/개산 등)"` 컬럼은 실제 개념과 다르다.
> 정산구분(위탁정산/자체정산)은 과제 단위가 아니라 **참여기관별로, 연차마다 달라질 수 있는 값**이다 —
> `project_members.settlement_type` + `project_member_settlement_type_histories` 참조.

#### `project_stages` — 단계협약 단계 구성 *(신규)*

> `agreement_type='STAGED'`인 과제에서만 쓰인다. 단계 마지막 연차가 정산(SETTLEMENT) 연차이고, 나머지는
> 연차상시(ANNUAL)다. 정산구분·등급이 연차 중간에 바뀌면 "그 값이 바뀐 시점이 속한 단계 전체(과거 연차 포함)"로
> 소급 반영하는 로직이 이 테이블의 범위를 기준으로 동작한다(단, 이미 정산 완료된 단계는 소급하지 않음).

| 컬럼명 | 타입 | 제약 | 설명 |
|--------|------|------|------|
| id | UUID | PK | |
| project_id | UUID | FK projects NOT NULL | |
| stage_number | INTEGER | NOT NULL | 1부터 시작 |
| start_term_number | INTEGER | NOT NULL | |
| end_term_number | INTEGER | NOT NULL | |
| stage_start_date | DATE | | |
| stage_end_date | DATE | | |
| — | UNIQUE | (project_id, stage_number) | |

#### `project_assigned_manager_histories` — 과제 담당자 연차별 이력 *(신규)*

> 엑셀에 등록된 담당자는 삼화 담당자이며, 인사이동 등으로 연차마다 바뀔 수 있다. `projects.assigned_manager`는
> 현재 진행연차 기준값이고, 과거 연차 조회 시엔 이 테이블을 참조한다.

| 컬럼명 | 타입 | 제약 | 설명 |
|--------|------|------|------|
| id | UUID | PK | |
| project_id | UUID | FK projects NOT NULL | |
| term_number | INTEGER | NOT NULL | 이 담당자로 바뀐 시작 연차 |
| assigned_manager | VARCHAR(100) | NOT NULL | |
| — | UNIQUE | (project_id, term_number) | |

---

### 그룹 5. 참여기관

> 예전 버전은 "연차×기관" 조합마다 별도 행을 갖는 `project_term_institutions` 조인 테이블을 중심에 뒀다.
> 실제 구현은 반대다 — **참여기관(`project_members`)은 과제 전체를 통틀어 기관당 1행**이며, 등급·정산구분·
> 공문수신자처럼 연차 중간에 바뀔 수 있는 값은 "기본값 컬럼 + 연차별 예외를 담는 이력 테이블"로 표현한다
> (기본값과 다른 연차만 이력에 기록, 없는 연차는 기본값을 그대로 사용). 사업비(현금/현물)만은 애초부터
> 연차별로 다른 게 당연하므로 예외가 아니라 정규 이력 테이블(`project_member_annual_budgets`)로 둔다.

#### `project_members` — 참여기관

| 컬럼명 | 타입 | 제약 | 설명 |
|--------|------|------|------|
| id | UUID | PK | |
| project_id | UUID | FK projects NOT NULL | |
| institution_id | UUID | FK institutions NOT NULL | |
| role | member_role | NOT NULL | |
| total_budget | BIGINT | NOT NULL | 총 배정 연구비(현금+현물) — 레거시, 신규 산정은 cash_budget/in_kind_budget 및 연차별 사업비 사용 |
| cash_budget | BIGINT | | 총 현금사업비 |
| in_kind_budget | BIGINT | | 총 현물사업비 |
| institution_grade | institution_grade | | 등급 기본값 — `project_member_grade_histories`에 예외가 없는 연차에 적용. **화면 표시용 라벨이며 수수료 계산에는 직접 관여하지 않는다** — 면제/일반 버킷 분류는 오직 정산구분(아래)만으로 결정된다(2026-08 회계법인 실무 확인). 예: 우수등급 기관이 위탁정산으로 바뀌어도 등급 배지는 "우수"로 그대로 유지되지만 계산은 일반기관 방식으로 진행된다. |
| settlement_type | settlement_type | | 정산구분 기본값 — `project_member_settlement_type_histories`에 예외가 없는 연차에 적용. 면제/일반 수수료 버킷 분류(자체정산=면제기관처럼 계산, 위탁정산=일반기관처럼 계산)와 정산 연차 청구비율(위탁정산=100%, 자체정산=평소 비율 유지)을 직접 결정한다. |
| contact_name | VARCHAR(100) | | 공문 수신자 기본값 |
| contact_email | VARCHAR(255) | | |
| contact_phone | VARCHAR(30) | | |
| created_at | TIMESTAMP | DEFAULT NOW() | |
| updated_at | TIMESTAMP | DEFAULT NOW() | |
| — | UNIQUE | (project_id, institution_id) | |

#### `project_member_annual_budgets` — 참여기관 연차별 사업비

| 컬럼명 | 타입 | 제약 | 설명 |
|--------|------|------|------|
| id | UUID | PK | |
| project_member_id | UUID | FK project_members NOT NULL | |
| term_year | INTEGER | NOT NULL | |
| term_number | INTEGER | NOT NULL | |
| cash_budget | BIGINT | NOT NULL | |
| in_kind_budget | BIGINT | NOT NULL DEFAULT 0 | |
| term_start_date | DATE | | 엑셀 업로드로 받은 실제 연차 시작일 — 없으면 화면에서 총개발시작일+연차번호로 자동계산 |
| term_end_date | DATE | | |
| audit_firm | VARCHAR(100) | | 이 연차를 담당한 회계법인 — 삼화가 아니면 `term_fees.other_firm_handled`가 자동으로 켜짐 |
| — | UNIQUE | (project_member_id, term_number) | |

#### `project_member_grade_histories` — 참여기관 연차별 등급 변경이력 *(신규)*

> 등급평가는 연차마다 갱신될 수 있다(정산면제리스트 재업로드 등). 특정 연차부터 등급이 바뀐 경우만 기록—
> 없는 연차는 `project_members.institution_grade`를 그대로 쓴다. **등급은 여기서 표시용으로만 바뀔 뿐, 수수료
> 계산 버킷에는 영향을 주지 않는다**(정산구분만 영향을 준다 — 위 `project_members` 설명 참조). 등급이 자동으로
> "일반"으로 바뀌는 로직은 없다.

| 컬럼명 | 타입 | 제약 | 설명 |
|--------|------|------|------|
| id | UUID | PK | |
| project_member_id | UUID | FK project_members NOT NULL | |
| term_number | INTEGER | NOT NULL | 이 등급으로 바뀐 시작 연차 |
| grade | institution_grade | NOT NULL | |
| — | UNIQUE | (project_member_id, term_number) | |

#### `project_member_settlement_type_histories` — 참여기관 연차별 정산구분 변경이력 *(신규)*

> 정산구분은 연차 단위가 아니라 **참여기관이 속한 "단계" 전체의 특성**이다. 특정 연차에서 정산구분이
> 바뀌면(자체↔위탁 양방향) 그 연차가 속한 단계 전체(과거 연차 포함)로 소급 반영되고, 소급 반영된 내용은
> 이슈/메모로 남는다. 이미 정산 완료된 단계(정산 연차 수수료가 CONFIRMED/BILLED)는 소급하지 않고, 담당자가
> 직접 확인하도록 메모만 남긴다. 직접 수정과 엑셀 업로드(단일값 업데이트) 양쪽 경로 모두 이 소급 규칙을 탄다.

| 컬럼명 | 타입 | 제약 | 설명 |
|--------|------|------|------|
| id | UUID | PK | |
| project_member_id | UUID | FK project_members NOT NULL | |
| term_number | INTEGER | NOT NULL | |
| settlement_type | settlement_type | NOT NULL | |
| — | UNIQUE | (project_member_id, term_number) | |

#### `project_member_recipient_histories` — 참여기관 연차별 공문 수신자 변경이력 *(신규)*

> 담당자가 연차 중간에 바뀌는 경우가 많다(특히 RDA2처럼 기관별로 공문을 따로 보내는 과제).

| 컬럼명 | 타입 | 제약 | 설명 |
|--------|------|------|------|
| id | UUID | PK | |
| project_member_id | UUID | FK project_members NOT NULL | |
| term_number | INTEGER | NOT NULL | |
| recipient_name | VARCHAR(100) | | |
| recipient_email | VARCHAR(255) | | |
| recipient_phone | VARCHAR(30) | | |
| — | UNIQUE | (project_member_id, term_number) | |

---

### 그룹 6. 수수료 정책 엔진

> 예전 버전은 사업비구간/기관수가산/과제유형/정산구분/기업분류/청구비율/면제/예외 규칙을 각각 별도
> 테이블(다중 규칙 엔진 방식)로 뒀다. 실제 구현은 그런 범용 규칙 엔진이 아니라, **정책 하나가 파라미터를
> 직접 갖는 단일 레코드**다 — 전담기관마다 계산 방식 자체가 다르고(TIERED vs FLAT 가산, DISCOUNT vs EXCLUDE
> 면제 처리, CASH vs CASH_PLUS_INKIND 기준 등) 정책 개수도 적어(전담기관 6곳 + 공통) 규칙을 조합하는 엔진보다
> 정책별 파라미터를 직접 코드(`calcTermFee`)로 해석하는 편이 더 명확했기 때문이다.

#### `fee_policies` — 수수료 정책 (전담기관별 버전 관리)

| 컬럼명 | 타입 | 제약 | 설명 |
|--------|------|------|------|
| id | UUID | PK | |
| agency_id | UUID | FK funding_agencies | NULL = 공통(전역) 정책, 특정 전담기관에 자체 정책이 없으면 공통 정책을 사용 |
| name | VARCHAR(200) | NOT NULL | |
| version | VARCHAR(50) | NOT NULL | |
| effective_from | DATE | NOT NULL | |
| effective_to | DATE | | NULL = 현재 유효 |
| status | fee_policy_status | DEFAULT 'DRAFT' | |
| standard_rate | NUMERIC(6,3) | NOT NULL | 표준수수료율(%) — 실제 산정은 `fee_rate_brackets`(정액 구간표) 기준이며 이 값은 참고 표시용 |
| description | TEXT | | |
| created_by | VARCHAR(100) | | |
| created_at | TIMESTAMP | DEFAULT NOW() | |
| co_inst_addon_method | co_inst_addon_method | NOT NULL | TIERED: 1번째 10%+이후 5%, FLAT: 전체 10%×N, CUSTOM: 아래 두 필드로 직접 지정 |
| co_inst_first_rate | NUMERIC(6,4) | | CUSTOM 전용 — 1번째 공동기관 가산율 |
| co_inst_additional_rate | NUMERIC(6,4) | | CUSTOM 전용 — 이후 공동기관 1개당 가산율 |
| exempt_grades | TEXT[] | NOT NULL DEFAULT '{}' | 면제 대상 등급 — "S"/"A"/"B"/"C" 개별 조합(예: KEIT는 전체, KETEP/IITP는 S만) |
| exemption_mode | exemption_mode | NOT NULL | |
| exempt_custom_rate | NUMERIC(6,4) | | exemption_mode='CUSTOM' 전용, 면제기관만 다른 연차상시 청구비율 적용 |
| default_settlement_type | settlement_type | | 참여기관 화면에서 정산구분이 개별 지정되지 않았을 때의 기본값 |
| fee_basis | fee_basis | NOT NULL | |
| has_autonomy_track | BOOLEAN | DEFAULT false | |
| annual_billing_rate | NUMERIC(6,4) | NOT NULL | 연차상시 청구비율(0.85=KEIT/KETEP, 1.0=KOFPI 등 미청구 없는 기관) |
| minimum_fee | BIGINT | | 연차별 산정수수료 최소 하한액 — 미만이면 이 금액을 기준으로 하고 차액은 이월(RDA1/RDA2) |
| exclude_lead_from_calc | BOOLEAN | DEFAULT false | 주관기관을 산정기준액에서 완전 제외 + 공동기관수 -1 보정(RDA2: 주관기관이 농진청/소속기관인 경우) |
| calc_mode | calc_mode | DEFAULT 'AGGREGATE' | |
| program_type | program_type | DEFAULT 'GENERAL' | 동일 전담기관에 유형별 별도 정책을 둘 수 있음(IITP 일반 R&D vs ICT 기금사업) |
| legacy_transition_note | TEXT | | 수수료체계 변경 시점 경과조치 안내(예: KETEP 26년 전환 — 이전 과제 미청구수수료 수기조정 필요) |
| updated_at | TIMESTAMP | DEFAULT NOW() | |

#### `fee_policy_rate_brackets` — 현금사업비 구간별 기본수수료(정액)

> 사업비 구간별로 "비율"이 아니라 "정액"이 매겨진다(전담기관마다 별도 구간표 — KEIT/KETEP/KOFPI/IITP/RDA 등).

| 컬럼명 | 타입 | 제약 | 설명 |
|--------|------|------|------|
| id | UUID | PK | |
| policy_id | UUID | FK fee_policies NOT NULL | |
| min_amount | BIGINT | NOT NULL | 구간 최솟값 (이상, 원) |
| max_amount | BIGINT | | 구간 최댓값 (미만, null=상한 없음) |
| base_fee | BIGINT | NOT NULL | 이 구간의 기본수수료(정액) |
| — | UNIQUE | (policy_id, min_amount) | |

#### `policy_change_histories` — 정책 변경이력

| 컬럼명 | 타입 | 제약 | 설명 |
|--------|------|------|------|
| id | UUID | PK | |
| version | VARCHAR(50) | NOT NULL | |
| change_type | policy_change_type | NOT NULL | |
| change_summary | TEXT | NOT NULL | |
| reason | TEXT | | |
| affected_projects | INTEGER | DEFAULT 0 | |
| changed_by | VARCHAR(100) | NOT NULL | |
| changed_at | TIMESTAMP | DEFAULT NOW() | |

---

### 그룹 7. 수수료 관리

#### `term_fees` — 기관별 연차 수수료 (청구/발행 관리 단위)

| 컬럼명 | 타입 | 제약 | 설명 |
|--------|------|------|------|
| id | UUID | PK | |
| project_id | UUID | FK projects NOT NULL | |
| institution_id | UUID | FK institutions NOT NULL | |
| term_year | INTEGER | NOT NULL | |
| term_number | INTEGER | NOT NULL | |
| budget | BIGINT | NOT NULL | |
| fee_rate | NUMERIC(6,3) | | 적용 요율(%) — 레거시 표시용 |
| standard_fee | BIGINT | | 표준수수료 — 일반기관은 산정액과 동일, 면제기관은 청구비율 적용 전 원래 몫 |
| calculated_fee | BIGINT | NOT NULL | 산정액 |
| applied_fee | BIGINT | NOT NULL | 최종 적용액(청구액, 협의 후 조정 가능) |
| unclaimed_fee | BIGINT | | 이번 연차에 걷지 않고 남기는 몫 — 정산 연차의 일반(위탁)기관은 항상 0 |
| status | fee_status | DEFAULT 'DRAFT' | |
| is_auto_generated | BOOLEAN | DEFAULT true | |
| manual_override | BOOLEAN | DEFAULT false | 담당자가 적용액을 직접 수정했는지 — true면 재계산 시에도 이 값을 보존 |
| manual_override_reason | TEXT | | manual_override=true일 때 필수 |
| other_firm_handled | BOOLEAN | DEFAULT false | 이 연차를 삼화가 아닌 타 회계법인이 진행했는지 — true면 금액 정보를 숨기고 안내만 표시(시스템관리자/회계담당자만 설정 가능) |
| audit_firm | VARCHAR(100) | | 이 연차를 담당한 회계법인명 |
| doc_request_date | DATE | | 서류요청일 — 기관별로 다를 수 있어(RDA2 등) 과제가 아닌 여기서 관리 |
| doc_reply_date | DATE | | 서류회신일(공문발송일) |
| term_start_date | DATE | | |
| term_end_date | DATE | | |
| billing_type | billing_type | | 비어있으면 `projects.billing_type`을 대신 사용 |
| created_at | TIMESTAMP | DEFAULT NOW() | |
| updated_at | TIMESTAMP | DEFAULT NOW() | |
| — | UNIQUE | (project_id, institution_id, term_number) | |

#### `term_fee_calcs` — 과제 단위 연차 수수료 산정 스냅샷 *(신규)*

> `term_fees`가 "기관별 청구 관리 단위"라면, 이 테이블은 "과제 전체를 정액 구간표 기준으로 어떻게 산정했는지"를
> 통째로 남기는 계산 스냅샷이다(면제기관 분리, 일반/면제 배분, 이월 미청구액까지 한 번에 기록). 예전 버전
> 문서에는 이 개념 자체가 없어 `term_fees` 하나로 기관별 청구액과 과제단위 산정근거를 뭉뚱그렸었다.

| 컬럼명 | 타입 | 제약 | 설명 |
|--------|------|------|------|
| id | UUID | PK | |
| project_id | UUID | FK projects NOT NULL | |
| agency_id | UUID | FK funding_agencies NOT NULL | |
| term_year | INTEGER | NOT NULL | |
| term_number | INTEGER | NOT NULL | |
| stage_number | INTEGER | NOT NULL | 0 = 일괄협약, 1이상 = 단계 |
| work_type | work_type | NOT NULL | |
| total_cash_budget | BIGINT | NOT NULL | |
| co_inst_count | INTEGER | NOT NULL | |
| base_fee | BIGINT | NOT NULL | |
| addon_fee | BIGINT | NOT NULL | |
| standard_fee | BIGINT | NOT NULL | ① 표준수수료 |
| non_exempt_cash_budget | BIGINT | NOT NULL | |
| non_exempt_co_inst_count | INTEGER | NOT NULL | |
| non_exempt_base_fee | BIGINT | NOT NULL | |
| non_exempt_addon_fee | BIGINT | NOT NULL | |
| general_fee | BIGINT | NOT NULL | ② 일반수수료(면제기관 제외) |
| exempt_fee_total | BIGINT | NOT NULL | ③ 면제기관 수수료 합계 |
| calculated_fee | BIGINT | NOT NULL | ④ 과제 산정수수료 (= general_fee + exempt_fee_total × 청구비율) |
| general_calc_fee | BIGINT | NOT NULL | ⑤ 청구수수료 산출 기준액 |
| general_billing_fee | BIGINT | NOT NULL | |
| general_unclaimed_fee | BIGINT | NOT NULL | |
| carried_over_unclaimed | BIGINT | DEFAULT 0 | 이전 연도 일반 미청구 누적 — 정산 연차에만 함께 청구 |
| total_billing_fee | BIGINT | NOT NULL | 최종 청구액 |
| status | term_fee_calc_status | DEFAULT 'DRAFT' | |
| created_at | TIMESTAMP | DEFAULT NOW() | |
| updated_at | TIMESTAMP | | |
| — | UNIQUE | (project_id, term_number) | |

#### `term_fee_calc_exempt_details` — 산정 스냅샷 내 면제기관별 배분 상세 *(신규)*

| 컬럼명 | 타입 | 제약 | 설명 |
|--------|------|------|------|
| id | UUID | PK | |
| term_fee_calc_id | UUID | FK term_fee_calcs NOT NULL | |
| institution_id | UUID | FK institutions NOT NULL | |
| grade | institution_grade | NOT NULL | 산정 시점의 등급(표시용 스냅샷) |
| cash_budget | BIGINT | NOT NULL | |
| standard_fee | BIGINT | NOT NULL | 면제기관 표준수수료 배분액 |
| calculated_fee | BIGINT | NOT NULL | |
| billing_fee | BIGINT | NOT NULL | |
| unclaimed_fee | BIGINT | NOT NULL | |

#### `term_fee_calc_overrides` — 산정 스냅샷 수기조정 이력 *(신규)*

| 컬럼명 | 타입 | 제약 | 설명 |
|--------|------|------|------|
| id | UUID | PK | |
| term_fee_calc_id | UUID | FK term_fee_calcs NOT NULL | |
| field | VARCHAR(100) | NOT NULL | 수정된 필드명 (예: carriedOverUnclaimed) |
| original_value | BIGINT | NOT NULL | |
| adjusted_value | BIGINT | NOT NULL | |
| reason | TEXT | NOT NULL | |
| adjusted_by | VARCHAR(100) | NOT NULL | |
| adjusted_at | TIMESTAMP | DEFAULT NOW() | |

#### `unclaimed_fees` — 미청구액

> 예전 버전은 `carried_over_from_id` 자기참조 체인으로 연도 간 이월을 정규화했지만, 실제 이월 누적치는
> `term_fee_calcs.carried_over_unclaimed`가 매 연차 계산 시점에 직접 들고 있다. 이 테이블은 그와 별개로,
> 주관기관 기준으로 "미청구액이 발생했다"는 사실 자체를 알림/추적 목적으로 남기는 단순 목록이다.

| 컬럼명 | 타입 | 제약 | 설명 |
|--------|------|------|------|
| id | UUID | PK | |
| project_id | UUID | FK projects NOT NULL | |
| lead_institution_id | UUID | FK institutions NOT NULL | 청구 대상(주관기관) |
| term_year | INTEGER | NOT NULL | |
| term_number | INTEGER | NOT NULL | |
| amount | BIGINT | NOT NULL | 미청구 총액 |
| occurred_at | DATE | NOT NULL | |
| carried_over | BOOLEAN | DEFAULT false | |
| status | unclaimed_status | DEFAULT 'PENDING' | |

---

### 그룹 8. 이슈/메모

#### `project_issues` — 과제 이슈/메모 *(신규 — 예전 버전에 누락)*

> 사업비 조정 요청, 미납 독촉, 자동 소급반영 결과 확인 요청 등 담당자가 직접 확인해야 하는 항목을 남긴다.
> ("무엇이 바뀌었다"처럼 결과만 알리면 되는 변경은 `audit_logs`로 충분하므로 이슈로 만들지 않는다 — 담당자
> 조치가 필요한 경우만 이슈로 남긴다.)

| 컬럼명 | 타입 | 제약 | 설명 |
|--------|------|------|------|
| id | UUID | PK | |
| project_id | UUID | FK projects NOT NULL | |
| content | TEXT | NOT NULL | |
| author | VARCHAR(100) | NOT NULL | |
| priority | issue_priority | NOT NULL | |
| status | issue_status | DEFAULT 'OPEN' | |
| institution_name | VARCHAR(200) | | 이슈가 발생한 기관명(선택) |
| no_institution | BOOLEAN | DEFAULT false | 특정 기관과 무관한 이슈 표시 |
| created_at | TIMESTAMP | DEFAULT NOW() | |

#### `project_issue_recipient_groups` — 이슈 알림 대상(그룹)

| 컬럼명 | 타입 | 제약 | 설명 |
|--------|------|------|------|
| project_issue_id | UUID | FK project_issues NOT NULL | |
| recipient_group | issue_recipient_group | NOT NULL | |
| — | PK | (project_issue_id, recipient_group) | |

#### `project_issue_recipient_users` — 이슈 알림 대상(개인 지정)

| 컬럼명 | 타입 | 제약 | 설명 |
|--------|------|------|------|
| project_issue_id | UUID | FK project_issues NOT NULL | |
| user_id | UUID | FK users NOT NULL | |
| — | PK | (project_issue_id, user_id) | |

> 그룹·개인 지정 모두 비어있으면 과제 담당자(`projects.assigned_manager`)에게만 전달된다.

---

### 그룹 9. 청구 및 채권

#### `receivables` — 미수금/채권

> 예전 버전의 `claims`(청구)·`payment_histories`(수금 이력, 분할입금 로그) 정규화 테이블은 실제로 존재하지
> 않는다. 청구액·수금액·수금일을 이 한 행에서 직접 관리하며, 분할 수금이 있으면 `paid_amount`와 `paid_at`을
> "가장 최근 입금 기준"으로 갱신하는 방식이다(입금 건별 로그는 아직 없음 — 필요해지면
> `receivable_payment_histories`로 분리 검토).

| 컬럼명 | 타입 | 제약 | 설명 |
|--------|------|------|------|
| id | UUID | PK | |
| invoice_number | VARCHAR(100) | NOT NULL | 연결된 세금계산서 번호 |
| project_id | UUID | FK projects NOT NULL | |
| term_year | INTEGER | NOT NULL | |
| term_number | INTEGER | NOT NULL | |
| lead_institution_id | UUID | FK institutions NOT NULL | 수금 대상 — 연차 통합이면 주관기관 |
| institution_id | UUID | FK institutions | RDA2처럼 기관별로 세금계산서·수금을 따로 관리하는 과제에서만 채워짐. 없으면 연차 전체를 하나로 묶은 통합 레코드 |
| billed_at | DATE | NOT NULL | |
| billed_amount | BIGINT | NOT NULL | |
| paid_amount | BIGINT | DEFAULT 0 | |
| paid_at | DATE | | 실제 입금일(부분입금 시 최근 입금일) |
| receivable_amount | BIGINT | NOT NULL | = billed_amount − paid_amount |
| due_date | DATE | NOT NULL | |
| status | receivable_status | DEFAULT 'PENDING' | |
| created_at | TIMESTAMP | DEFAULT NOW() | |
| updated_at | TIMESTAMP | DEFAULT NOW() | |

---

### 그룹 10. 세금계산서

#### `tax_invoices` — 세금계산서

> 예전 버전의 템플릿 스냅샷(buyer 정보 등)·발행/취소 이력 테이블은 실제로 없다. 상태값만 관리하고, "문구
> 양식" 자체는 아래 `fee_invoice_templates`로 별도 관리한다(발행 건마다 스냅샷을 뜨는 게 아니라, 발송 시점에
> 현재 등록된 양식을 그대로 사용).

| 컬럼명 | 타입 | 제약 | 설명 |
|--------|------|------|------|
| id | UUID | PK | |
| invoice_number | VARCHAR(100) | UNIQUE NOT NULL | |
| project_id | UUID | FK projects NOT NULL | |
| term_year | INTEGER | NOT NULL | |
| term_number | INTEGER | NOT NULL | |
| lead_institution_id | UUID | FK institutions NOT NULL | 세금계산서 수신자 — 연차 통합이면 주관기관 |
| institution_id | UUID | FK institutions | RDA2처럼 기관별 개별 발행 과제에서만 채워짐 |
| issued_at | DATE | NOT NULL | |
| supply_amount | BIGINT | NOT NULL | 공급가액(통합이면 참여기관 수수료 합산) |
| tax_amount | BIGINT | NOT NULL | 부가세(10%) |
| total_amount | BIGINT | NOT NULL | |
| status | tax_invoice_status | DEFAULT 'ISSUED' | |
| created_at | TIMESTAMP | DEFAULT NOW() | |
| updated_at | TIMESTAMP | DEFAULT NOW() | |

#### `fee_invoice_templates` — 수수료 청구서 문구 양식 (유형별) *(신규)*

> 전담기관 공문(`agency_notice_templates`)과 달리 전담기관으로 스코프하지 않고 유형(category)별로만
> 관리한다 — 기관마다 문구가 갈릴 일이 없고, 기관명 자리는 `{agency}` 자리표시자로 저장해 발송 시 실제
> 전담기관 정식명칭으로 치환한다. 카테고리마다 `is_default=true`인 대표양식이 정확히 1개씩 있어야 한다.

| 컬럼명 | 타입 | 제약 | 설명 |
|--------|------|------|------|
| id | UUID | PK | |
| category | VARCHAR(20) | NOT NULL | ANNUAL / SETTLEMENT / REVERSE / OTHER |
| name | VARCHAR(200) | NOT NULL | |
| is_default | BOOLEAN | DEFAULT false | |
| title | VARCHAR(300) | NOT NULL | 예: "{agency} 전담과제 연차상시점검 수수료 청구의 건" |
| body_intro | TEXT[] | | 본문 안내문 |
| period_label | VARCHAR(100) | | 대상과제현황 표의 기간 행 라벨 |
| fee_section_title | VARCHAR(100) | | |
| fee_std_label | VARCHAR(100) | | 공급가액 행 라벨 |
| surcharge_label | VARCHAR(100) | | 부가세 행 라벨 |
| fee_total_label | VARCHAR(100) | | 합계(VAT포함) 행 라벨 |
| created_at | TIMESTAMP | DEFAULT NOW() | |
| updated_at | TIMESTAMP | DEFAULT NOW() | |

#### `fee_invoice_default_attachments` — 청구서 유형별 기본 첨부파일 *(신규)*

| 컬럼명 | 타입 | 제약 | 설명 |
|--------|------|------|------|
| id | UUID | PK | |
| fee_invoice_template_id | UUID | FK fee_invoice_templates NOT NULL | |
| name | VARCHAR(200) | NOT NULL | |
| file_path | TEXT | | 없으면 이름만 있는 자리표시자(미등록) |

#### `standard_attachments` — 공문 공통 첨부파일

> 사업자등록증 등, 발송마다 매번 새로 올리지 않는 공통 첨부파일. 여기서 파일을 교체하면 이후 새로 작성되는
> 모든 공문에 기본값으로 반영된다. 개별 발송 건에서 바꾸는 것은 그 발송에만 적용(발송 시점 개별 수정).

| 컬럼명 | 타입 | 제약 | 설명 |
|--------|------|------|------|
| id | UUID | PK | |
| name | VARCHAR(200) | NOT NULL | |
| file_path | TEXT | | |
| enabled_annual | BOOLEAN | DEFAULT true | 연차상시 발송 시 자동 첨부 여부 |
| enabled_settlement | BOOLEAN | DEFAULT true | 위탁정산 발송 시 자동 첨부 여부 |
| enabled_reverse | BOOLEAN | DEFAULT true | 역발행 발송 시 자동 첨부 여부 |
| enabled_other | BOOLEAN | DEFAULT true | 기타 발송 시 자동 첨부 여부 |
| updated_at | TIMESTAMP | DEFAULT NOW() | |

---

### 그룹 11. 기관 정산

#### `settlements` — 기관 정산

> 예전 버전의 `settlement_histories`(변경이력 테이블)는 실제로 없다 — 상태값만 관리한다.

| 컬럼명 | 타입 | 제약 | 설명 |
|--------|------|------|------|
| id | UUID | PK | |
| project_id | UUID | FK projects NOT NULL | |
| institution_id | UUID | FK institutions NOT NULL | |
| term_year | INTEGER | NOT NULL | |
| is_lead | BOOLEAN | NOT NULL | 주관기관 여부 |
| settlement_amount | BIGINT | NOT NULL | 정산 연구비 |
| additional_amount | BIGINT | DEFAULT 0 | 추가 지급액 |
| fee_amount | BIGINT | NOT NULL | 해당 기관 분담 수수료 |
| scheduled_amount | BIGINT | NOT NULL | 지급 예정액(= settlement_amount + additional_amount − fee_amount) |
| paid_at | DATE | | |
| status | settlement_status | DEFAULT 'SCHEDULED' | |
| created_at | TIMESTAMP | DEFAULT NOW() | |

---

### 그룹 12. 공지/공문

#### `notices` — 공지사항

| 컬럼명 | 타입 | 제약 | 설명 |
|--------|------|------|------|
| id | UUID | PK | |
| title | VARCHAR(300) | NOT NULL | |
| content | TEXT | NOT NULL | |
| author_name | VARCHAR(100) | NOT NULL | |
| author_role | user_role | NOT NULL | |
| created_at | TIMESTAMP | DEFAULT NOW() | |

#### `agency_notice_templates` — 전담기관별 정산절차 안내 공문 양식

> 전담기관 하나에 여러 템플릿을 등록해두고 발송 시 선택한다.

| 컬럼명 | 타입 | 제약 | 설명 |
|--------|------|------|------|
| id | UUID | PK | |
| agency_id | UUID | FK funding_agencies NOT NULL | |
| name | VARCHAR(200) | NOT NULL | 목록 선택용 템플릿 이름 |
| title | VARCHAR(300) | NOT NULL | |
| recipient | VARCHAR(200) | | |
| reference | VARCHAR(200) | | |
| legal_basis | TEXT | | |
| body_intro | TEXT[] | | |
| schedule_rows | JSONB | | `{category, institutionTask, firmTask}[]` |
| contact_rows | JSONB | | `{role, contact, email}[]` |
| fee_intro | TEXT | | |
| fee_required_docs | TEXT[] | | |
| fee_notes | TEXT[] | | |
| attachments | JSONB | | `{name, filePath?}[]` |
| created_at | TIMESTAMP | DEFAULT NOW() | |
| updated_at | TIMESTAMP | DEFAULT NOW() | |

#### `company_info` — 공문 발신 회사 정보 (싱글턴)

> 삼화회계법인 자체 정보 — 테이블이라기보다 설정값 1행(또는 애플리케이션 설정)에 가깝다.

| 컬럼명 | 타입 | 제약 | 설명 |
|--------|------|------|------|
| name | VARCHAR(200) | NOT NULL | |
| address_line | TEXT | | |
| tel | VARCHAR(30) | | |
| fax | VARCHAR(30) | | |
| prepared_by | VARCHAR(100) | | |
| ceo_name | VARCHAR(100) | | |
| doc_number_prefix | VARCHAR(50) | | |
| manager_name | VARCHAR(100) | | 세금계산서 공문 기본 담당자 |
| manager_email | VARCHAR(255) | | |
| manager_phone | VARCHAR(30) | | |
| deposit_account_note | TEXT | | |
| stamp_file_path | TEXT | | 대표이사 직인 이미지 — 미지정 시 기본 이미지 사용 |
| updated_at | TIMESTAMP | DEFAULT NOW() | |

---

### 그룹 13. 이메일

#### `email_dispatches` — 이메일/공문 발송 이력

> 예전 버전은 배치(`email_batches`)와 건별 로그(`email_logs`)를 분리했지만, 실제로는 `batch_id`를
> 문자열 그룹 키로만 갖는 단일 테이블이다(배치 자체의 집계 필드 — total/sent/failed count 등 — 는 조회
> 시점에 `batch_id`로 GROUP BY해서 계산하며 별도로 저장하지 않는다).

| 컬럼명 | 타입 | 제약 | 설명 |
|--------|------|------|------|
| id | UUID | PK | |
| batch_id | VARCHAR(100) | | 일괄 발송 그룹 키(단건 발송 시 null 또는 자기 자신) |
| sent_at | TIMESTAMP | NOT NULL | |
| sender_name | VARCHAR(100) | NOT NULL | |
| project_id | UUID | FK projects | |
| recipient_institution | VARCHAR(200) | NOT NULL | |
| recipient_email | VARCHAR(255) | NOT NULL | |
| subject | VARCHAR(500) | NOT NULL | |
| email_type | email_type | NOT NULL | |
| fee_category | fee_email_category | | ANNUAL / SETTLEMENT — TAX_INVOICE 발송일 때만 의미 있음 |
| is_reverse_request | BOOLEAN | DEFAULT false | |
| attachments | TEXT[] | | 첨부파일명 목록 |
| status | email_dispatch_status | DEFAULT 'PENDING' | |
| body | TEXT | | 발송된 이메일 본문(일반 안내 메일). 정산절차 안내 공문은 notice_snapshot을 대신 사용 |
| notice_snapshot | JSONB | | 정산절차 안내 공문(SETTLEMENT_NOTICE) 발송 시점의 공문 서식 + 산정액/청구액 요약 스냅샷 |
| created_at | TIMESTAMP | DEFAULT NOW() | |

---

## 수수료 계산 로직 흐름 (`lib/fee-calculator.ts` calcTermFee 기준)

```
1. 적용 정책 결정
   fee_policies WHERE agency_id = 과제.agency_id (없으면 agency_id IS NULL인 공통 정책)
     AND status = 'ACTIVE'
     AND program_type = 과제.program_type
     AND effective_from <= 해당 연차 기준일
     AND (effective_to IS NULL OR effective_to >= 해당 연차 기준일)

2. 참여기관 필터링
   a. EXCLUDE 모드(IITP/RDA1/RDA2)면 exempt_grades에 해당하는 등급 기관을 산정기준액에서 완전 제외
      (isExcludedMember) — 연차상시도 수행하지 않음, calculated_fee = 0
   b. exclude_lead_from_calc=true면 주관기관도 완전 제외 + 공동기관수 -1 보정 (RDA2)

3. 표준수수료 계산 (fee_rate_brackets 정액 구간표 기준, 비율 아님)
   a. 총 현금사업비(또는 fee_basis='CASH_PLUS_INKIND'면 현금+현물)를 구간표에 대입 → base_fee
   b. 공동기관 가산: co_inst_addon_method에 따라 TIERED(1번째10%+이후5%) / FLAT(10%×N) / CUSTOM
   c. standard_fee = base_fee + addon_fee

4. 면제/일반 버킷 분리 — DISCOUNT·CUSTOM 모드에서만 (EXCLUDE 모드는 2단계에서 이미 처리 완료)
   면제기관(exempt) 여부는 **오직 그 시점 참여기관의 settlement_type만으로 결정**:
     settlement_type = '자체정산'  →  면제기관 버킷(비례배분 + 청구비율 할인)
     settlement_type = '위탁정산'  →  일반기관 버킷(표준수수료 구간·배분)
   institution_grade(등급)는 이 분류에 전혀 관여하지 않는다 — 화면 표시용 라벨일 뿐이다.
   (2026-08-15 회계법인 실무 확인 — 이전에는 "ANNUAL 연차 + 위탁정산이면 등급과 무관하게 일반 취급,
    SETTLEMENT 연차는 등급 기준" 같은 예외 및 "위탁 전환 시 등급도 자동으로 일반으로 변경" 로직이
    있었으나, 최종적으로 등급 표시는 정산구분과 완전히 분리된 참고용 값으로 확정됨)

5. 일반수수료/면제수수료 배분
   generalFee = 일반 버킷 참여기관 현금사업비 비율로 standard_fee 재계산·배분
   exemptFeeTotal = 면제 버킷 참여기관 표준수수료 배분 × annual_billing_rate(또는 exempt_custom_rate)

6. 과제 산정수수료
   calculated_fee = generalFee + exemptFeeTotal × annual_billing_rate

7. 청구비율 적용 (work_type별)
   ANNUAL(연차상시): 일반기관 = calculated_fee × annual_billing_rate, 면제기관도 동일 비율 유지
   SETTLEMENT(정산 연차, 단계 마지막 연차): 일반기관(=위탁정산 버킷) 100% 청구 + 이전 연차 미청구 누적분(carried_over_unclaimed) 함께 청구
                                    자체정산 버킷은 정산 연차에도 평소 청구비율 유지(100%로 올라가지 않음)

8. 최소 하한액 보정 (minimum_fee 설정된 정책만 — RDA1/RDA2)
   연차별 산정수수료가 minimum_fee 미만이면 minimum_fee를 기준으로 하고 차액은 이월

9. 결과 저장
   term_fee_calcs = 과제단위 산정 스냅샷 (총계·일반/면제 breakdown)
   term_fees = 기관별 청구 관리 단위로 분해 저장 (청구/발행/수금 추적은 이쪽 기준)
```

---

## 정산구분·등급 변경의 소급 반영 로직 (`lib/store.ts`)

```
[정산구분 변경 시 — 양방향(자체↔위탁), UI 직접수정/엑셀업로드 모두]

1. 변경이 발생한 시작 연차(origin_term)와 그 단계 범위(project_stages 또는 일괄협약 전체 기간)를 구한다.
2. 해당 단계의 정산 연차(단계 마지막 연차) 수수료가 이미 CONFIRMED/BILLED 상태면(=정산 완료) 소급하지
   않고 종료 — "이미 정산 완료된 단계라 자동 반영되지 않았습니다" 메모(project_issues)만 남긴다.
3. 아직 정산 전이면 origin_term부터 단계 시작 연차까지 전부(과거 연차 포함) 동일한 정산구분으로
   project_member_settlement_type_histories를 갱신한다.
4. 등급(institution_grade / project_member_grade_histories)은 이 과정에서 전혀 건드리지 않는다 — 화면
   표시는 그대로 유지되고, 수수료 계산만 4번 규칙(정산구분 기준 버킷 분류)에 따라 자동으로 달라진다.
5. FEE_AFFECTING_FIELDS(budget/grade/settlementType 등)가 바뀌면 해당 과제의 연차별 수수료를
   1연차부터 자동 재계산한다(수동 "재계산" 버튼 없음).
```

---

## 인덱스 전략

```sql
-- 과제 계층 탐색
CREATE INDEX idx_project_stages_project_id ON project_stages(project_id);
CREATE INDEX idx_project_members_project_id ON project_members(project_id);
CREATE INDEX idx_project_members_institution_id ON project_members(institution_id);
CREATE INDEX idx_pm_annual_budgets_member_id ON project_member_annual_budgets(project_member_id);
CREATE INDEX idx_pm_grade_hist_member_id ON project_member_grade_histories(project_member_id);
CREATE INDEX idx_pm_settlement_hist_member_id ON project_member_settlement_type_histories(project_member_id);

-- 수수료 관련
CREATE INDEX idx_term_fees_project_id ON term_fees(project_id, term_number);
CREATE INDEX idx_term_fees_institution_id ON term_fees(institution_id);
CREATE INDEX idx_term_fee_calcs_project_id ON term_fee_calcs(project_id, term_number);
CREATE INDEX idx_tfc_exempt_details_calc_id ON term_fee_calc_exempt_details(term_fee_calc_id);
CREATE INDEX idx_unclaimed_fees_project_id ON unclaimed_fees(project_id);

-- 청구/채권/세금계산서
CREATE INDEX idx_receivables_project_id ON receivables(project_id, term_number);
CREATE INDEX idx_receivables_status ON receivables(status);
CREATE INDEX idx_tax_invoices_project_id ON tax_invoices(project_id, term_number);
CREATE INDEX idx_tax_invoices_status ON tax_invoices(status);

-- 정산
CREATE INDEX idx_settlements_project_id ON settlements(project_id);
CREATE INDEX idx_settlements_status ON settlements(status);

-- 정책 조회
CREATE INDEX idx_fee_policies_agency_status ON fee_policies(agency_id, status, effective_from, effective_to);
CREATE INDEX idx_fee_policy_rate_brackets_policy_id ON fee_policy_rate_brackets(policy_id);

-- 이메일
CREATE INDEX idx_email_dispatches_batch_id ON email_dispatches(batch_id);
CREATE INDEX idx_email_dispatches_project_id ON email_dispatches(project_id);
CREATE INDEX idx_email_dispatches_status ON email_dispatches(status);

-- 이슈
CREATE INDEX idx_project_issues_project_id ON project_issues(project_id);
CREATE INDEX idx_project_issues_status ON project_issues(status);

-- 감사 로그
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_performed_at ON audit_logs(performed_at DESC);

-- 대시보드 집계용
CREATE INDEX idx_projects_agency_status ON projects(agency_id, status);
CREATE INDEX idx_projects_registered_at ON projects(registered_at);
```

---

## 핵심 설계 결정 사항

| 항목 | 결정 | 이유 |
|------|------|------|
| 금액 타입 | BIGINT (원 단위) | NUMERIC보다 빠름, 소수점 불필요 |
| PK 타입 | UUID | 분산환경 확장성, 예측 불가능 ID |
| 기관 모델 | 기업/대학/연구소를 `institutions` 단일 엔티티로 통합 | 실제 업무에서 계산·발송 로직이 기관 유형을 가리지 않고 동일하게 동작함 |
| 등급 vs 정산구분 분리 | `institution_grade`는 표시 전용, `settlement_type`만 수수료 버킷을 결정 | 2026-08 회계법인 실무 확인 — 등급이 자동으로 바뀌면 화면과 실제 등급평가 결과가 어긋나 보이는 문제가 있었음 |
| 참여기관 연차별 값 | 기본값 컬럼 + "바뀐 연차만" 기록하는 예외 이력 테이블 | 대부분의 연차는 그대로 유지되고 일부만 바뀌므로, 매 연차 전체를 다 저장하는 것보다 예외만 남기는 편이 갱신 이력(언제부터 뭐가 바뀌었는지)도 자연히 남는다 |
| 정산구분 변경 소급 범위 | 연차가 아니라 "단계" 전체(과거 연차 포함) | 정산구분은 계약·정산 단위인 단계의 속성이지 개별 연차의 속성이 아님 — 단계 도중 부분적으로만 다르면 정산 자체가 성립하지 않음 |
| 수수료 정책 구조 | 규칙 다중 테이블 대신 정책 1레코드 + 파라미터 컬럼 | 전담기관마다 계산 로직 자체가 상이해서 일반화된 규칙 엔진보다 정책별 파라미터를 코드가 직접 해석하는 편이 더 명확하고 정책 개수도 적음(전담기관 6곳 내외) |
| 기관별 청구 vs 과제단위 산정 분리 | `term_fees`(청구 관리) / `term_fee_calcs`(산정 스냅샷) 이원화 | 청구·발행·수금은 기관 단위로 추적해야 하고, 산정 근거(면제/일반 배분, 이월액)는 과제·연차 단위로 한 번에 봐야 검증하기 쉬움 |
| 변경 이력 | audit_logs는 JSONB changed_fields로 범용 추적, 요약 문구는 조회 시점에 생성 | 엔티티가 다양해 테이블마다 이력 테이블을 두기보다 범용 테이블 하나로 통일하고, "N연차부터 X로 변경" 같은 사람이 읽기 쉬운 요약은 저장하지 않고 조회 시점에 만든다(원본 값만 있으면 언제든 재현 가능) |
| 권한 관리 | 현재는 코드 하드코딩, `role_permissions`는 향후 DB 전환 설계 | 역할이 4종뿐이고 세분화된 액션 단위 제어가 필요해 코드로 관리 중이며, 운영자가 직접 권한을 조정할 필요가 생기면 DB로 전환 |
