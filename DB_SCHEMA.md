# Samhwa DB 구조 설계 및 데이터 모델링

> 국가지원사업 참여 기업 및 수행기관의 과제코드 기준 연차별 수수료, 세금계산서, 미청구액, 미수금, 기관 정산 내역 통합 관리 ERP

---

## 전체 테이블 목록 (35개)

| 그룹 | 테이블명 | 한국어명 |
|------|---------|---------|
| 사용자/권한 | `users` | 사용자 |
| 사용자/권한 | `role_permissions` | 역할별 권한 매핑 |
| 사용자/권한 | `audit_logs` | 감사 로그 |
| 기업 | `companies` | 기업 |
| 기업 | `company_contacts` | 기업 담당자 |
| 기업 | `company_classifications` | 연차별 기업분류 (현재) |
| 기업 | `company_classification_histories` | 기업분류 변경이력 |
| 기관 | `institutions` | 수행기관 |
| 기관 | `institution_contacts` | 기관 담당자 (대학·연구소 등 기업 아닌 기관) |
| 과제 | `projects` | 과제 |
| 과제 | `project_terms` | 연차 |
| 과제 | `project_term_institutions` | 수행기관 (과제-연차-기관 연결, 중심 테이블) |
| 수수료 정책 | `fee_policies` | 수수료 정책 (버전 관리) |
| 수수료 정책 | `fee_policy_budget_rules` | 사업비 구간별 기본 수수료 규칙 |
| 수수료 정책 | `fee_policy_institution_count_rules` | 기관 수 기준 가산 규칙 |
| 수수료 정책 | `fee_policy_project_type_rules` | 과제유형별 계수 |
| 수수료 정책 | `fee_policy_settlement_type_rules` | 정산구분별 계수 |
| 수수료 정책 | `fee_policy_company_class_rules` | 기업분류별 계수 |
| 수수료 정책 | `fee_policy_billing_ratio_rules` | 연차별 청구비율 |
| 수수료 정책 | `fee_policy_exemption_rules` | 정산면제 규칙 |
| 수수료 정책 | `fee_policy_exception_rules` | 예외 규칙 |
| 수수료 정책 | `policy_change_histories` | 정책 변경이력 |
| 수수료 관리 | `term_fees` | 연차별 수수료 |
| 수수료 관리 | `unclaimed_fees` | 연도별 미청구액 |
| 청구/채권 | `claims` | 청구 |
| 청구/채권 | `receivables` | 미수금/채권 |
| 청구/채권 | `payment_histories` | 수금 이력 |
| 세금계산서 | `tax_invoice_templates` | 세금계산서 템플릿 |
| 세금계산서 | `tax_invoices` | 세금계산서 |
| 세금계산서 | `tax_invoice_histories` | 세금계산서 수정/취소 이력 |
| 정산 | `settlements` | 기관 정산 |
| 정산 | `settlement_histories` | 정산 이력 |
| 이메일 | `email_batches` | 이메일 일괄 발송 배치 |
| 이메일 | `email_logs` | 이메일 발송 이력 (건별) |

---

## 전체 관계도 (ERD)

```
[users] ──────────────────────────────────────── (created_by / changed_by 참조)
    │
    ├─ [role_permissions]   (역할별 메뉴/기능 접근 권한)
    └─ [audit_logs]

[companies] 1 ─── N [company_contacts]
[companies] 1 ─── N [company_classifications] 1 ─── N [company_classification_histories]
[companies] 1 ─── N [institutions]  (nullable - 기업 아닌 기관은 company_id null)

[institutions] 1 ─── N [institution_contacts]   ← 신규

[projects] 1 ─── N [project_terms] 1 ─── N [project_term_institutions]
                                                    │
                          [institutions] ───────────┘  (N:M 연결, 중심 테이블)

[project_term_institutions] ─── 1 [term_fees] ─── 1 [fee_policies]
[project_term_institutions] ─── N [unclaimed_fees]
[project_term_institutions] ─── N [claims] ──── 1 [term_fees]  (어떤 수수료에 대한 청구인지)
                                    │
                                    └─── N [receivables] ─── N [payment_histories]
[project_term_institutions] ─── N [tax_invoices] ─── N [tax_invoice_histories]
[project_term_institutions] ─── N [settlements] ─── N [settlement_histories]

[fee_policies] 1 ─── N [fee_policy_budget_rules]
[fee_policies] 1 ─── N [fee_policy_institution_count_rules]
[fee_policies] 1 ─── N [fee_policy_project_type_rules]
[fee_policies] 1 ─── N [fee_policy_settlement_type_rules]
[fee_policies] 1 ─── N [fee_policy_company_class_rules]
[fee_policies] 1 ─── N [fee_policy_billing_ratio_rules]
[fee_policies] 1 ─── N [fee_policy_exemption_rules]
[fee_policies] 1 ─── N [fee_policy_exception_rules]
[fee_policies] 1 ─── N [policy_change_histories]

[tax_invoice_templates] 1 ─── N [tax_invoices]
[email_batches] 1 ─── N [email_logs]
[email_logs] ─── [institutions], [institution_contacts], [company_contacts], [project_terms]
```

---

## ENUM 타입 정의

```sql
-- 사용자 역할
CREATE TYPE user_role AS ENUM (
  'SYSTEM_ADMIN',   -- 시스템 관리자
  'ACCOUNTING',     -- 회계 담당자
  'SETTLEMENT',     -- 정산 담당자
  'GENERAL'         -- 일반 사용자
);

-- 권한 리소스 유형
CREATE TYPE permission_resource AS ENUM (
  'MENU',           -- 메뉴 접근
  'FEATURE',        -- 기능 실행 (버튼/액션)
  'DATA'            -- 데이터 범위 (전체/담당 과제만 등)
);

-- 권한 액션
CREATE TYPE permission_action AS ENUM (
  'READ', 'WRITE', 'DELETE', 'EXPORT', 'APPROVE'
);

-- 수행기관 역할
CREATE TYPE institution_role AS ENUM (
  'MAIN',           -- 주관기관
  'PARTICIPATING'   -- 참여기관
);

-- 과제 상태
CREATE TYPE project_status AS ENUM (
  'ACTIVE', 'COMPLETED', 'SUSPENDED', 'CANCELLED'
);

-- 정책 상태 (관리자 직접 수정 지원)
CREATE TYPE policy_status AS ENUM (
  'DRAFT',          -- 작성 중 (미적용)
  'ACTIVE',         -- 현재 적용 중
  'ARCHIVED'        -- 보관 (이전 버전)
);

-- 수수료 상태
CREATE TYPE fee_status AS ENUM (
  'DRAFT',          -- 임시
  'CONFIRMED',      -- 확정
  'BILLED'          -- 청구완료
);

-- 청구 상태
CREATE TYPE claim_status AS ENUM (
  'DRAFT', 'SENT', 'PAID', 'PARTIAL', 'OVERDUE'
);

-- 미수금 상태
CREATE TYPE receivable_status AS ENUM (
  'OUTSTANDING',    -- 미수금
  'PARTIAL',        -- 부분 수금
  'SETTLED',        -- 완납
  'WRITTEN_OFF'     -- 대손처리
);

-- 세금계산서 상태
CREATE TYPE tax_invoice_status AS ENUM (
  'DRAFT', 'ISSUED', 'CANCELLED', 'AMENDED'
);

-- 정산 상태
CREATE TYPE settlement_status AS ENUM (
  'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'
);

-- 이메일 상태
CREATE TYPE email_status AS ENUM (
  'PENDING', 'SENT', 'FAILED'
);

-- 미청구액 상태
CREATE TYPE unclaimed_status AS ENUM (
  'UNCLAIMED',      -- 미청구
  'CARRIED_OVER',   -- 이월됨
  'SETTLED'         -- 정리완료
);
```

---

## 테이블 스키마 상세

### 그룹 1. 사용자 및 권한

#### `users` — 사용자

| 컬럼명 | 타입 | 제약 | 설명 |
|--------|------|------|------|
| id | UUID | PK DEFAULT gen_random_uuid() | |
| email | VARCHAR(255) | UNIQUE NOT NULL | |
| password_hash | VARCHAR(255) | NOT NULL | bcrypt 해시 |
| name | VARCHAR(100) | NOT NULL | |
| role | user_role | NOT NULL | 역할 |
| is_active | BOOLEAN | DEFAULT true | |
| last_login_at | TIMESTAMP | | |
| created_at | TIMESTAMP | DEFAULT NOW() | |
| updated_at | TIMESTAMP | DEFAULT NOW() | |

#### `role_permissions` — 역할별 권한 매핑

> 메뉴/기능/데이터 접근 권한을 DB로 관리하여 코드 수정 없이 권한 조정 가능.

| 컬럼명 | 타입 | 제약 | 설명 |
|--------|------|------|------|
| id | UUID | PK | |
| role | user_role | NOT NULL | 대상 역할 |
| resource_type | permission_resource | NOT NULL | MENU / FEATURE / DATA |
| resource_key | VARCHAR(200) | NOT NULL | 리소스 식별자 (ex: menu.fee-policy, feature.invoice.issue) |
| action | permission_action | NOT NULL | READ / WRITE / DELETE / EXPORT / APPROVE |
| is_allowed | BOOLEAN | NOT NULL DEFAULT true | |
| created_at | TIMESTAMP | DEFAULT NOW() | |
| — | UNIQUE | (role, resource_type, resource_key, action) | |

#### `audit_logs` — 감사 로그

| 컬럼명 | 타입 | 제약 | 설명 |
|--------|------|------|------|
| id | UUID | PK | |
| user_id | UUID | FK users | 행위자 |
| action | VARCHAR(50) | NOT NULL | CREATE / UPDATE / DELETE / LOGIN 등 |
| resource_type | VARCHAR(100) | NOT NULL | 대상 테이블명 |
| resource_id | UUID | | 대상 레코드 ID |
| old_values | JSONB | | 변경 전 값 |
| new_values | JSONB | | 변경 후 값 |
| ip_address | VARCHAR(45) | | |
| user_agent | TEXT | | |
| created_at | TIMESTAMP | DEFAULT NOW() | |

---

### 그룹 2. 기업

#### `companies` — 기업

| 컬럼명 | 타입 | 제약 | 설명 |
|--------|------|------|------|
| id | UUID | PK | |
| company_name | VARCHAR(200) | NOT NULL | 기업명 |
| business_number | VARCHAR(20) | UNIQUE NOT NULL | 사업자번호 |
| ceo_name | VARCHAR(100) | | 대표자명 |
| address | TEXT | | |
| phone | VARCHAR(30) | | |
| email | VARCHAR(255) | | |
| is_active | BOOLEAN | DEFAULT true | |
| notes | TEXT | | |
| created_at | TIMESTAMP | DEFAULT NOW() | |
| updated_at | TIMESTAMP | DEFAULT NOW() | |

#### `company_contacts` — 기업 담당자

| 컬럼명 | 타입 | 제약 | 설명 |
|--------|------|------|------|
| id | UUID | PK | |
| company_id | UUID | FK companies NOT NULL | |
| name | VARCHAR(100) | NOT NULL | 담당자명 |
| department | VARCHAR(100) | | 부서 |
| position | VARCHAR(100) | | 직위 |
| phone | VARCHAR(30) | | |
| email | VARCHAR(255) | | |
| is_primary | BOOLEAN | DEFAULT false | 주담당자 여부 |
| is_active | BOOLEAN | DEFAULT true | |
| created_at | TIMESTAMP | DEFAULT NOW() | |
| updated_at | TIMESTAMP | DEFAULT NOW() | |

#### `company_classifications` — 연차별 기업분류 (현재값)

| 컬럼명 | 타입 | 제약 | 설명 |
|--------|------|------|------|
| id | UUID | PK | |
| company_id | UUID | FK companies NOT NULL | |
| project_term_id | UUID | FK project_terms NOT NULL | 해당 연차 |
| classification | VARCHAR(100) | NOT NULL | 대기업 / 중견기업 / 중소기업 / 스타트업 등 |
| effective_from | DATE | NOT NULL | 분류 적용일 |
| notes | TEXT | | |
| created_by | UUID | FK users | |
| created_at | TIMESTAMP | DEFAULT NOW() | |
| updated_at | TIMESTAMP | DEFAULT NOW() | |
| — | UNIQUE | (company_id, project_term_id) | 연차별 현재 분류는 1건 |

#### `company_classification_histories` — 기업분류 변경이력

| 컬럼명 | 타입 | 제약 | 설명 |
|--------|------|------|------|
| id | UUID | PK | |
| company_id | UUID | FK companies NOT NULL | |
| project_term_id | UUID | FK project_terms NOT NULL | |
| old_classification | VARCHAR(100) | | 변경 전 분류 |
| new_classification | VARCHAR(100) | NOT NULL | 변경 후 분류 |
| change_reason | TEXT | | 변경 사유 |
| changed_by | UUID | FK users NOT NULL | |
| changed_at | TIMESTAMP | DEFAULT NOW() | |

---

### 그룹 3. 기관

#### `institutions` — 수행기관

> 기업(companies)이 기관으로 참여하는 경우 company_id 연결. 대학·연구소는 company_id = null.

| 컬럼명 | 타입 | 제약 | 설명 |
|--------|------|------|------|
| id | UUID | PK | |
| company_id | UUID | FK companies | 기업인 경우만 연결 (nullable) |
| institution_name | VARCHAR(200) | NOT NULL | 기관명 |
| business_number | VARCHAR(20) | UNIQUE | 사업자/고유번호 |
| institution_type | VARCHAR(50) | | 기업 / 대학 / 연구소 / 정부기관 |
| address | TEXT | | |
| phone | VARCHAR(30) | | |
| email | VARCHAR(255) | | |
| representative_name | VARCHAR(100) | | 대표자명 |
| is_active | BOOLEAN | DEFAULT true | |
| notes | TEXT | | |
| created_at | TIMESTAMP | DEFAULT NOW() | |
| updated_at | TIMESTAMP | DEFAULT NOW() | |

#### `institution_contacts` — 기관 담당자 *(신규)*

> 대학·연구소 등 기업이 아닌 수행기관의 담당자. 이메일 일괄 발송 수신자로 사용.

| 컬럼명 | 타입 | 제약 | 설명 |
|--------|------|------|------|
| id | UUID | PK | |
| institution_id | UUID | FK institutions NOT NULL | |
| name | VARCHAR(100) | NOT NULL | 담당자명 |
| department | VARCHAR(100) | | 부서 |
| position | VARCHAR(100) | | 직위 |
| phone | VARCHAR(30) | | |
| email | VARCHAR(255) | | |
| is_primary | BOOLEAN | DEFAULT false | 주담당자 여부 |
| is_active | BOOLEAN | DEFAULT true | |
| created_at | TIMESTAMP | DEFAULT NOW() | |
| updated_at | TIMESTAMP | DEFAULT NOW() | |

---

### 그룹 4. 과제 및 연차

#### `projects` — 과제

| 컬럼명 | 타입 | 제약 | 설명 |
|--------|------|------|------|
| id | UUID | PK | |
| project_number | VARCHAR(100) | UNIQUE NOT NULL | 과제번호 (과제코드) |
| project_name | VARCHAR(500) | NOT NULL | 과제명 |
| project_type | VARCHAR(100) | NOT NULL | 과제유형 |
| agency | VARCHAR(200) | | 전문기관 |
| settlement_type | VARCHAR(50) | NOT NULL | 정산구분 (확정 / 개산 등) |
| start_year | INTEGER | NOT NULL | 시작 사업연도 |
| end_year | INTEGER | NOT NULL | 종료 사업연도 |
| total_terms | INTEGER | NOT NULL | 총 연차 수 |
| status | project_status | DEFAULT 'ACTIVE' | |
| notes | TEXT | | |
| created_by | UUID | FK users | |
| created_at | TIMESTAMP | DEFAULT NOW() | |
| updated_at | TIMESTAMP | DEFAULT NOW() | |

#### `project_terms` — 연차

| 컬럼명 | 타입 | 제약 | 설명 |
|--------|------|------|------|
| id | UUID | PK | |
| project_id | UUID | FK projects NOT NULL | |
| term_year | INTEGER | NOT NULL | 사업연도 (ex: 2024) |
| term_number | INTEGER | NOT NULL | 연차번호 (ex: 1) |
| total_budget | BIGINT | NOT NULL | 해당 연차 총 사업비 |
| status | VARCHAR(50) | DEFAULT 'ACTIVE' | |
| notes | TEXT | | |
| created_at | TIMESTAMP | DEFAULT NOW() | |
| updated_at | TIMESTAMP | DEFAULT NOW() | |
| — | UNIQUE | (project_id, term_year) | |
| — | UNIQUE | (project_id, term_number) | |

#### `project_term_institutions` — 수행기관 *(중심 테이블)*

> 수수료, 미청구, 채권, 정산, 세금계산서 모두 이 테이블을 기준으로 연결됨.

| 컬럼명 | 타입 | 제약 | 설명 |
|--------|------|------|------|
| id | UUID | PK | |
| project_term_id | UUID | FK project_terms NOT NULL | |
| institution_id | UUID | FK institutions NOT NULL | |
| role | institution_role | NOT NULL | 주관기관 / 참여기관 |
| project_budget | BIGINT | NOT NULL | 기관별 사업비 |
| status | VARCHAR(50) | DEFAULT 'ACTIVE' | |
| notes | TEXT | | |
| created_at | TIMESTAMP | DEFAULT NOW() | |
| updated_at | TIMESTAMP | DEFAULT NOW() | |
| — | UNIQUE | (project_term_id, institution_id) | |

---

### 그룹 5. 수수료 정책 엔진

#### `fee_policies` — 수수료 정책 (버전 관리)

> 관리자가 직접 정책을 작성(DRAFT) → 검토 → 활성화(ACTIVE) 흐름으로 운영.

| 컬럼명 | 타입 | 제약 | 설명 |
|--------|------|------|------|
| id | UUID | PK | |
| policy_name | VARCHAR(200) | NOT NULL | 정책명 |
| policy_version | INTEGER | NOT NULL | 버전 번호 |
| description | TEXT | | 설명 |
| status | policy_status | DEFAULT 'DRAFT' | DRAFT → ACTIVE → ARCHIVED |
| effective_from | DATE | | 적용 시작일 (ACTIVE 시 필수) |
| effective_to | DATE | | 적용 종료일 (null = 현재 유효) |
| created_by | UUID | FK users | |
| approved_by | UUID | FK users | 활성화 승인자 |
| approved_at | TIMESTAMP | | |
| created_at | TIMESTAMP | DEFAULT NOW() | |
| updated_at | TIMESTAMP | DEFAULT NOW() | |

#### `fee_policy_budget_rules` — 사업비 구간별 기본 수수료

| 컬럼명 | 타입 | 제약 | 설명 |
|--------|------|------|------|
| id | UUID | PK | |
| policy_id | UUID | FK fee_policies NOT NULL | |
| budget_min | BIGINT | NOT NULL | 구간 최솟값 (원) |
| budget_max | BIGINT | | 구간 최댓값 (null = 상한 없음) |
| base_rate | NUMERIC(7,5) | | 기본 수수료율 (ex: 0.025 = 2.5%) |
| base_amount | BIGINT | | 기본 고정금액 (비율 대신 사용 시) |
| priority | INTEGER | DEFAULT 0 | 규칙 우선순위 |
| created_at | TIMESTAMP | DEFAULT NOW() | |

#### `fee_policy_institution_count_rules` — 기관 수 기준 가산 규칙

| 컬럼명 | 타입 | 제약 | 설명 |
|--------|------|------|------|
| id | UUID | PK | |
| policy_id | UUID | FK fee_policies NOT NULL | |
| count_min | INTEGER | NOT NULL | 기관 수 최솟값 |
| count_max | INTEGER | | 기관 수 최댓값 (null = 상한 없음) |
| additional_rate | NUMERIC(7,5) | | 가산 비율 |
| additional_amount | BIGINT | | 가산 고정금액 |
| priority | INTEGER | DEFAULT 0 | |
| created_at | TIMESTAMP | DEFAULT NOW() | |

#### `fee_policy_project_type_rules` — 과제유형별 계수

| 컬럼명 | 타입 | 제약 | 설명 |
|--------|------|------|------|
| id | UUID | PK | |
| policy_id | UUID | FK fee_policies NOT NULL | |
| project_type | VARCHAR(100) | NOT NULL | 과제유형 |
| multiplier | NUMERIC(6,4) | NOT NULL DEFAULT 1.0 | 계수 (1.0 = 기본) |
| created_at | TIMESTAMP | DEFAULT NOW() | |
| — | UNIQUE | (policy_id, project_type) | |

#### `fee_policy_settlement_type_rules` — 정산구분별 계수

| 컬럼명 | 타입 | 제약 | 설명 |
|--------|------|------|------|
| id | UUID | PK | |
| policy_id | UUID | FK fee_policies NOT NULL | |
| settlement_type | VARCHAR(50) | NOT NULL | 정산구분 |
| multiplier | NUMERIC(6,4) | NOT NULL DEFAULT 1.0 | |
| created_at | TIMESTAMP | DEFAULT NOW() | |
| — | UNIQUE | (policy_id, settlement_type) | |

#### `fee_policy_company_class_rules` — 기업분류별 계수

| 컬럼명 | 타입 | 제약 | 설명 |
|--------|------|------|------|
| id | UUID | PK | |
| policy_id | UUID | FK fee_policies NOT NULL | |
| company_classification | VARCHAR(100) | NOT NULL | 기업분류 |
| multiplier | NUMERIC(6,4) | NOT NULL DEFAULT 1.0 | |
| created_at | TIMESTAMP | DEFAULT NOW() | |
| — | UNIQUE | (policy_id, company_classification) | |

#### `fee_policy_billing_ratio_rules` — 연차별 청구비율

| 컬럼명 | 타입 | 제약 | 설명 |
|--------|------|------|------|
| id | UUID | PK | |
| policy_id | UUID | FK fee_policies NOT NULL | |
| term_number | INTEGER | NOT NULL | 연차번호 |
| billing_ratio | NUMERIC(6,4) | NOT NULL | 청구비율 (ex: 0.5 = 50%) |
| created_at | TIMESTAMP | DEFAULT NOW() | |
| — | UNIQUE | (policy_id, term_number) | |

#### `fee_policy_exemption_rules` — 정산면제 규칙

| 컬럼명 | 타입 | 제약 | 설명 |
|--------|------|------|------|
| id | UUID | PK | |
| policy_id | UUID | FK fee_policies NOT NULL | |
| rule_name | VARCHAR(200) | NOT NULL | 면제 규칙명 |
| conditions | JSONB | NOT NULL | 면제 조건 (ex: `{"settlement_type":"개산","term_number":1}`) |
| priority | INTEGER | DEFAULT 0 | |
| created_at | TIMESTAMP | DEFAULT NOW() | |

#### `fee_policy_exception_rules` — 예외 규칙

| 컬럼명 | 타입 | 제약 | 설명 |
|--------|------|------|------|
| id | UUID | PK | |
| policy_id | UUID | FK fee_policies NOT NULL | |
| rule_name | VARCHAR(200) | NOT NULL | |
| target_project_id | UUID | FK projects | 특정 과제 (null = 전체 과제) |
| target_institution_id | UUID | FK institutions | 특정 기관 (null = 전체 기관) |
| conditions | JSONB | | 추가 조건 |
| override_rate | NUMERIC(7,5) | | 오버라이드 비율 |
| override_amount | BIGINT | | 오버라이드 고정금액 |
| priority | INTEGER | DEFAULT 0 | |
| created_at | TIMESTAMP | DEFAULT NOW() | |

#### `policy_change_histories` — 정책 변경이력

| 컬럼명 | 타입 | 제약 | 설명 |
|--------|------|------|------|
| id | UUID | PK | |
| fee_policy_id | UUID | FK fee_policies NOT NULL | |
| change_type | VARCHAR(50) | NOT NULL | CREATE / UPDATE / ACTIVATE / ARCHIVE |
| change_description | TEXT | | 변경 설명 |
| old_policy_snapshot | JSONB | | 변경 전 정책 전체 스냅샷 (규칙 포함) |
| new_policy_snapshot | JSONB | | 변경 후 정책 전체 스냅샷 |
| changed_by | UUID | FK users NOT NULL | |
| changed_at | TIMESTAMP | DEFAULT NOW() | |

---

### 그룹 6. 수수료 관리

#### `term_fees` — 연차별 수수료

> 수수료 계산의 최종 결과 테이블.

| 컬럼명 | 타입 | 제약 | 설명 |
|--------|------|------|------|
| id | UUID | PK | |
| project_term_institution_id | UUID | FK project_term_institutions UNIQUE NOT NULL | |
| fee_policy_id | UUID | FK fee_policies NOT NULL | 계산 당시 적용 정책 버전 (이후 정책 변경에 영향 없음) |
| project_budget | BIGINT | NOT NULL | 사업비 |
| standard_fee | BIGINT | NOT NULL | 표준수수료 (정책 엔진 자동 계산) |
| applied_fee | BIGINT | | 신청수수료 (기관 실제 신청값, null = 미신청) |
| billed_fee | BIGINT | | 청구수수료 (확정값) |
| cumulative_fee | BIGINT | | 누적수수료 (전 연차 청구수수료 합계) |
| is_fee_exempt | BOOLEAN | DEFAULT false | 정산면제 여부 |
| exemption_reason | TEXT | | 면제 사유 |
| status | fee_status | DEFAULT 'DRAFT' | |
| confirmed_by | UUID | FK users | |
| confirmed_at | TIMESTAMP | | |
| notes | TEXT | | |
| created_at | TIMESTAMP | DEFAULT NOW() | |
| updated_at | TIMESTAMP | DEFAULT NOW() | |

#### `unclaimed_fees` — 연도별 미청구액

> 연도 간 이월 로직의 핵심 테이블. carried_over_from_id 자기참조로 이월 체인 구성.

| 컬럼명 | 타입 | 제약 | 설명 |
|--------|------|------|------|
| id | UUID | PK | |
| project_term_institution_id | UUID | FK project_term_institutions NOT NULL | |
| fiscal_year | INTEGER | NOT NULL | 회계연도 |
| billed_fee | BIGINT | NOT NULL | 해당 연도 청구수수료 |
| actually_billed | BIGINT | DEFAULT 0 | 실제 청구된 금액 |
| unclaimed_amount | BIGINT | NOT NULL | 연도별 미청구액 (= billed_fee − actually_billed) |
| carried_over_from_id | UUID | FK unclaimed_fees | 이전 연도 미청구액 참조 (이월 추적) |
| carried_over_amount | BIGINT | DEFAULT 0 | 이월된 과거 누적 미청구액 |
| cumulative_unclaimed | BIGINT | NOT NULL | 누적 미청구액 (= unclaimed_amount + carried_over_amount) |
| final_claim_amount | BIGINT | | 당해 최종청구액 (자동 계산) |
| status | unclaimed_status | DEFAULT 'UNCLAIMED' | |
| created_at | TIMESTAMP | DEFAULT NOW() | |
| updated_at | TIMESTAMP | DEFAULT NOW() | |
| — | UNIQUE | (project_term_institution_id, fiscal_year) | |

---

### 그룹 7. 청구 및 채권

#### `claims` — 청구

| 컬럼명 | 타입 | 제약 | 설명 |
|--------|------|------|------|
| id | UUID | PK | |
| project_term_institution_id | UUID | FK project_term_institutions NOT NULL | |
| term_fee_id | UUID | FK term_fees | 어떤 수수료 레코드에 대한 청구인지 명시 |
| claim_date | DATE | NOT NULL | 청구일 |
| claim_amount | BIGINT | NOT NULL | 청구금액 |
| claim_type | VARCHAR(50) | | 일반청구 / 미청구액청구 |
| status | claim_status | DEFAULT 'DRAFT' | |
| notes | TEXT | | |
| created_by | UUID | FK users | |
| created_at | TIMESTAMP | DEFAULT NOW() | |
| updated_at | TIMESTAMP | DEFAULT NOW() | |

#### `receivables` — 미수금/채권

| 컬럼명 | 타입 | 제약 | 설명 |
|--------|------|------|------|
| id | UUID | PK | |
| claim_id | UUID | FK claims NOT NULL | |
| project_term_institution_id | UUID | FK project_term_institutions NOT NULL | |
| billed_amount | BIGINT | NOT NULL | 청구액 |
| collected_amount | BIGINT | DEFAULT 0 | 수금액 |
| outstanding_amount | BIGINT | NOT NULL | 채권 잔액 (= billed − collected) |
| due_date | DATE | | 납기일 |
| is_long_overdue | BOOLEAN | DEFAULT false | 장기 미수금 (납기 초과 기준일 설정 필요) |
| overdue_days | INTEGER | DEFAULT 0 | 연체 일수 |
| status | receivable_status | DEFAULT 'OUTSTANDING' | |
| notes | TEXT | | |
| created_at | TIMESTAMP | DEFAULT NOW() | |
| updated_at | TIMESTAMP | DEFAULT NOW() | |

#### `payment_histories` — 수금 이력

| 컬럼명 | 타입 | 제약 | 설명 |
|--------|------|------|------|
| id | UUID | PK | |
| receivable_id | UUID | FK receivables NOT NULL | |
| payment_date | DATE | NOT NULL | 입금일 |
| payment_amount | BIGINT | NOT NULL | 입금액 |
| payment_method | VARCHAR(50) | | 계좌이체 / 수표 등 |
| reference_number | VARCHAR(100) | | 참조번호 |
| memo | TEXT | | |
| created_by | UUID | FK users | |
| created_at | TIMESTAMP | DEFAULT NOW() | |

---

### 그룹 8. 세금계산서

#### `tax_invoice_templates` — 세금계산서 템플릿

| 컬럼명 | 타입 | 제약 | 설명 |
|--------|------|------|------|
| id | UUID | PK | |
| template_name | VARCHAR(200) | NOT NULL | |
| template_content | JSONB | NOT NULL | 템플릿 구조 및 필드 매핑 |
| is_default | BOOLEAN | DEFAULT false | |
| created_by | UUID | FK users | |
| created_at | TIMESTAMP | DEFAULT NOW() | |
| updated_at | TIMESTAMP | DEFAULT NOW() | |

#### `tax_invoices` — 세금계산서

> 발행 당시 공급받는자(기관) 정보를 스냅샷으로 저장. 추후 기관 정보 변경에도 원본 보존.

| 컬럼명 | 타입 | 제약 | 설명 |
|--------|------|------|------|
| id | UUID | PK | |
| project_term_institution_id | UUID | FK project_term_institutions NOT NULL | |
| claim_id | UUID | FK claims | |
| template_id | UUID | FK tax_invoice_templates | |
| invoice_number | VARCHAR(100) | UNIQUE NOT NULL | 세금계산서 번호 |
| issue_date | DATE | NOT NULL | 발행일 |
| supply_amount | BIGINT | NOT NULL | 공급가액 |
| tax_amount | BIGINT | NOT NULL | 세액 |
| total_amount | BIGINT | NOT NULL | 합계금액 |
| buyer_name | VARCHAR(200) | NOT NULL | 공급받는자 기관명 (발행 당시 스냅샷) |
| buyer_business_number | VARCHAR(20) | NOT NULL | 공급받는자 사업자번호 (스냅샷) |
| buyer_address | TEXT | | 공급받는자 주소 (스냅샷) |
| status | tax_invoice_status | DEFAULT 'DRAFT' | |
| pdf_path | TEXT | | 저장된 PDF 경로 |
| issued_by | UUID | FK users | |
| cancelled_at | TIMESTAMP | | |
| cancel_reason | TEXT | | |
| original_invoice_id | UUID | FK tax_invoices | 수정발행 시 원본 참조 |
| notes | TEXT | | |
| created_at | TIMESTAMP | DEFAULT NOW() | |
| updated_at | TIMESTAMP | DEFAULT NOW() | |

#### `tax_invoice_histories` — 세금계산서 수정/취소 이력 *(신규)*

| 컬럼명 | 타입 | 제약 | 설명 |
|--------|------|------|------|
| id | UUID | PK | |
| tax_invoice_id | UUID | FK tax_invoices NOT NULL | |
| action | VARCHAR(50) | NOT NULL | ISSUE / CANCEL / AMEND / PDF_GENERATE |
| old_status | tax_invoice_status | | 변경 전 상태 |
| new_status | tax_invoice_status | | 변경 후 상태 |
| old_values | JSONB | | 변경 전 값 스냅샷 |
| reason | TEXT | | 처리 사유 |
| changed_by | UUID | FK users NOT NULL | |
| changed_at | TIMESTAMP | DEFAULT NOW() | |

---

### 그룹 9. 기관 정산

#### `settlements` — 기관 정산

| 컬럼명 | 타입 | 제약 | 설명 |
|--------|------|------|------|
| id | UUID | PK | |
| project_term_institution_id | UUID | FK project_term_institutions NOT NULL | |
| settlement_amount | BIGINT | NOT NULL | 정산금 |
| additional_amount | BIGINT | DEFAULT 0 | 기관별 추가금 |
| fee_amount | BIGINT | NOT NULL | 수수료 |
| scheduled_amount | BIGINT | | 정산 예정금 |
| paid_amount | BIGINT | DEFAULT 0 | 지급 완료 금액 |
| outstanding_amount | BIGINT | NOT NULL | 미지급금 (= scheduled − paid) |
| settlement_date | DATE | | 정산 확정일 |
| payment_due_date | DATE | | 지급 예정일 |
| status | settlement_status | DEFAULT 'SCHEDULED' | |
| notes | TEXT | | |
| created_by | UUID | FK users | |
| created_at | TIMESTAMP | DEFAULT NOW() | |
| updated_at | TIMESTAMP | DEFAULT NOW() | |

#### `settlement_histories` — 정산 이력

| 컬럼명 | 타입 | 제약 | 설명 |
|--------|------|------|------|
| id | UUID | PK | |
| settlement_id | UUID | FK settlements NOT NULL | |
| action | VARCHAR(100) | NOT NULL | 변경 유형 |
| old_values | JSONB | | |
| new_values | JSONB | | |
| changed_by | UUID | FK users NOT NULL | |
| changed_at | TIMESTAMP | DEFAULT NOW() | |
| notes | TEXT | | |

---

### 그룹 10. 이메일

#### `email_batches` — 이메일 일괄 발송 배치 *(신규)*

> 기관별/담당자별 일괄 발송 시 배치 단위로 묶어 관리. 발송 현황 및 성공/실패 집계 가능.

| 컬럼명 | 타입 | 제약 | 설명 |
|--------|------|------|------|
| id | UUID | PK | |
| batch_name | VARCHAR(200) | NOT NULL | 배치명 (ex: 2024년 2연차 수수료 안내) |
| email_type | VARCHAR(100) | NOT NULL | FEE_SUMMARY / SETTLEMENT_NOTICE 등 |
| project_term_id | UUID | FK project_terms | 대상 연차 |
| total_count | INTEGER | DEFAULT 0 | 총 발송 대상 수 |
| sent_count | INTEGER | DEFAULT 0 | 발송 성공 수 |
| failed_count | INTEGER | DEFAULT 0 | 발송 실패 수 |
| status | email_status | DEFAULT 'PENDING' | |
| started_at | TIMESTAMP | | |
| completed_at | TIMESTAMP | | |
| created_by | UUID | FK users | |
| created_at | TIMESTAMP | DEFAULT NOW() | |

#### `email_logs` — 이메일 발송 이력 (건별)

| 컬럼명 | 타입 | 제약 | 설명 |
|--------|------|------|------|
| id | UUID | PK | |
| batch_id | UUID | FK email_batches | 일괄 발송 배치 (단건 발송 시 null) |
| email_type | VARCHAR(100) | NOT NULL | FEE_SUMMARY / SETTLEMENT_NOTICE 등 |
| project_term_id | UUID | FK project_terms | |
| institution_id | UUID | FK institutions | |
| company_contact_id | UUID | FK company_contacts | 기업 담당자 (둘 중 하나만 사용) |
| institution_contact_id | UUID | FK institution_contacts | 기관 담당자 (둘 중 하나만 사용) |
| to_email | VARCHAR(255) | NOT NULL | 수신 이메일 |
| subject | VARCHAR(500) | NOT NULL | |
| body | TEXT | NOT NULL | |
| status | email_status | DEFAULT 'PENDING' | |
| sent_at | TIMESTAMP | | |
| error_message | TEXT | | 발송 실패 사유 |
| sent_by | UUID | FK users | |
| created_at | TIMESTAMP | DEFAULT NOW() | |

---

## 수수료 계산 로직 흐름

```
1. 적용 정책 결정
   fee_policies WHERE status = 'ACTIVE'
     AND effective_from <= 오늘
     AND (effective_to IS NULL OR effective_to >= 오늘)

2. 표준수수료 계산
   a. 사업비 구간 규칙 → 기본 수수료
      base_fee = project_budget × base_rate  (또는 base_amount)

   b. 기관 수 가산 수수료
      institution_count = COUNT(*) FROM project_term_institutions WHERE project_term_id = ?
      additional_fee = base_fee × additional_rate  (또는 additional_amount)

   c. 계수 곱연산 (순서 고정)
      × 과제유형 계수 (fee_policy_project_type_rules.multiplier)
      × 정산구분 계수 (fee_policy_settlement_type_rules.multiplier)
      × 기업분류 계수 (fee_policy_company_class_rules.multiplier)
        ※ 기업분류는 company_classifications에서 해당 project_term 기준 조회

   d. 청구비율 적용
      fee = (base_fee + additional_fee) × 계수들 × billing_ratio

3. 면제 규칙 확인 (priority 순)
   fee_policy_exemption_rules.conditions 매칭 → is_fee_exempt = true → fee = 0

4. 예외 규칙 확인 (최고 우선순위, priority 순)
   fee_policy_exception_rules 매칭 → override_rate/amount 적용

5. 결과 저장
   term_fees.standard_fee = 계산된 fee
   term_fees.fee_policy_id = 적용된 정책 ID (이후 정책 변경과 무관하게 보존)
```

---

## 미청구액 이월 로직

```
[2022년 미청구액 레코드]
  fiscal_year = 2022
  billed_fee = 1,000,000
  actually_billed = 500,000
  unclaimed_amount = 500,000      ← 당해 미청구
  carried_over_from_id = null
  carried_over_amount = 0
  cumulative_unclaimed = 500,000
  status = CARRIED_OVER
       │
       │ carried_over_from_id
       ▼
[2023년 미청구액 레코드]
  fiscal_year = 2023
  billed_fee = 800,000
  actually_billed = 500,000
  unclaimed_amount = 300,000      ← 당해 미청구
  carried_over_from_id = 2022년 레코드 ID
  carried_over_amount = 500,000   ← 2022 이월
  cumulative_unclaimed = 800,000
  final_claim_amount = 800,000    ← 당해 최종청구 가능액
```

---

## 인덱스 전략

```sql
-- 과제 계층 탐색
CREATE INDEX idx_project_terms_project_id ON project_terms(project_id);
CREATE INDEX idx_pti_project_term_id ON project_term_institutions(project_term_id);
CREATE INDEX idx_pti_institution_id ON project_term_institutions(institution_id);

-- 수수료 관련
CREATE INDEX idx_term_fees_pti_id ON term_fees(project_term_institution_id);
CREATE INDEX idx_term_fees_policy_id ON term_fees(fee_policy_id);
CREATE INDEX idx_unclaimed_fees_pti_id ON unclaimed_fees(project_term_institution_id);
CREATE INDEX idx_unclaimed_fees_fiscal_year ON unclaimed_fees(fiscal_year);

-- 청구/채권
CREATE INDEX idx_claims_pti_id ON claims(project_term_institution_id);
CREATE INDEX idx_claims_term_fee_id ON claims(term_fee_id);
CREATE INDEX idx_receivables_claim_id ON receivables(claim_id);
CREATE INDEX idx_receivables_status ON receivables(status);
CREATE INDEX idx_payment_histories_receivable_id ON payment_histories(receivable_id);

-- 세금계산서
CREATE INDEX idx_tax_invoices_pti_id ON tax_invoices(project_term_institution_id);
CREATE INDEX idx_tax_invoices_status ON tax_invoices(status);
CREATE INDEX idx_tax_invoice_histories_invoice_id ON tax_invoice_histories(tax_invoice_id);

-- 정산
CREATE INDEX idx_settlements_pti_id ON settlements(project_term_institution_id);
CREATE INDEX idx_settlements_status ON settlements(status);

-- 정책 조회
CREATE INDEX idx_fee_policies_status ON fee_policies(status, effective_from, effective_to);

-- 이메일
CREATE INDEX idx_email_logs_batch_id ON email_logs(batch_id);
CREATE INDEX idx_email_logs_institution_id ON email_logs(institution_id);
CREATE INDEX idx_email_logs_status ON email_logs(status);

-- 권한
CREATE INDEX idx_role_permissions_role ON role_permissions(role, resource_type);

-- 감사 로그
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- 대시보드 집계용 (복합 인덱스)
CREATE INDEX idx_pti_term_institution ON project_term_institutions(project_term_id, institution_id, role);
CREATE INDEX idx_project_terms_year ON project_terms(term_year, project_id);
```

---

## 핵심 설계 결정 사항

| 항목 | 결정 | 이유 |
|------|------|------|
| 금액 타입 | BIGINT (원 단위) | NUMERIC보다 빠름, 소수점 불필요 |
| PK 타입 | UUID | 분산환경 확장성, 예측 불가능 ID |
| 비율 타입 | NUMERIC(7,5) | 소수점 5자리 정밀도 (ex: 0.02500) |
| 정책 상태 | DRAFT→ACTIVE→ARCHIVED | 관리자 직접 편집 흐름 지원 |
| 수수료 정책 버전 보존 | term_fees.fee_policy_id | 계산 당시 정책 참조, 이후 변경에 영향 없음 |
| 기업/기관 분리 | 별도 테이블, company_id FK (nullable) | 대학·연구소는 기업 아님 |
| 기관 담당자 분리 | institution_contacts 별도 | company_contacts는 기업 담당자 전용 |
| 이메일 일괄 발송 | email_batches + email_logs | 배치 단위 집계 및 건별 이력 동시 관리 |
| 세금계산서 수신자 스냅샷 | buyer_name 등 직접 저장 | 기관 정보 변경 후에도 발행 당시 정보 보존 |
| 미청구액 이월 | carried_over_from_id 자기참조 | 연도 간 이월 체인 추적 가능 |
| 정책 규칙 | 규칙 유형별 별도 테이블 | 타입 안전성, JSONB 의존 최소화 |
| 변경 이력 | JSONB 스냅샷 방식 | 과거 상태 완전 복원 가능 |
