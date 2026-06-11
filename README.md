# 국가 지원사업 수수료 관리 시스템

국가 R&D 지원사업의 수수료 산정·청구·정산 업무를 관리하는 내부 관리 시스템입니다.

## 비즈니스 도메인

### 핵심 구조

```
과제(Project)
  ├─ 주관기관 (leadInstitution)  ← 세금계산서 수신, 미수금·미청구 관리 대상
  └─ 참여기관 목록 (ProjectMember[])  ← 수수료 산정 정보 (청구 대상 아님)
```

### 수수료 흐름

1. **과제 등록** → 주관기관 1개 지정
2. **참여기관 등록** → 각 기관의 유형(대기업/중소기업/대학 등)과 배정 예산 입력
3. **수수료 산정** → 기관유형별 요율 × 배정예산 → 기관별 TermFee 생성
4. **세금계산서 발행** → 참여기관 수수료 합산액을 **주관기관 앞으로** 1건 발행
5. **미수금 추적** → 주관기관의 납부 여부 관리
6. **정산** → 연구비 정산은 기관별로 별도 진행 (주관·참여기관 모두)

### 핵심 규칙

- **참여기관은 청구 대상이 아님** — 수수료 산정의 기초 데이터로만 사용
- **세금계산서는 과제·연차 단위로 1건** — 항상 주관기관 앞으로 발행
- **미청구액·미수금은 주관기관 기준** — `leadInstitutionName` 필드 사용

## 기술 스택

- **Next.js 16.2.9** (App Router, `params`는 `Promise<{id:string}>`, `use(params)` 사용)
- **React 19** — `useSyncExternalStore` 기반 모듈 레벨 전역 스토어
- **TypeScript ^5** — path alias `@/*` → `./`
- **Tailwind CSS v4** — CSS-first 설정

## 주요 타입 구조

| 타입 | 설명 |
|------|------|
| `Institution` | 통합 기관 (기업/대학/연구소 구분 없음) |
| `Project` | 과제 — `leadInstitutionId/Name` 포함 |
| `ProjectMember` | 과제-기관 연결 — 수수료 산정용 |
| `TermFee` | 연차별 기관 수수료 산정 내역 |
| `TaxInvoice` | 세금계산서 — 주관기관 앞 발행 |
| `Receivable` | 미수금 — 주관기관 기준 |
| `UnclaimedFee` | 미청구액 — 주관기관 기준 |
| `Settlement` | 정산 — 기관별 연구비 정산 (isLead 구분) |

## 실행

```bash
npm run dev
```

[http://localhost:3000](http://localhost:3000)에서 확인
