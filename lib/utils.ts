export function fmtWon(n: number): string {
  return `${n.toLocaleString("ko-KR")}원`;
}

export function fmtWonFull(n: number): string {
  return `${n.toLocaleString("ko-KR")}원`;
}

export function fmtWonShort(n: number): string {
  if (n === 0) return "0";
  if (n >= 100_000_000) return `${parseFloat((n / 100_000_000).toFixed(1))}억`;
  if (n >= 10_000_000) return `${parseFloat((n / 10_000_000).toFixed(1))}천만`;
  return `${Math.round(n / 10_000)}만`;
}

export function fmtDate(s: string | null | undefined): string {
  if (!s) return "-";
  return s.slice(0, 10).replace(/-/g, ".");
}

export function fmtDatetime(s: string | null | undefined): string {
  if (!s) return "-";
  return s.slice(0, 16).replace("T", " ");
}

// new Date().toISOString()은 실행 환경(브라우저/서버)의 시간대와 무관하게 항상 UTC 문자열을
// 돌려주는데, 코드 곳곳에서 이걸 그대로 "지금" 시각으로 기록해와서 화면에는 실제 한국 시각보다
// 9시간 느린 시각이 찍히는 문제가 있었다(전체 변경이력의 "일시" 등). 시스템 시간대에 상관없이
// 항상 한국 표준시(KST, UTC+9) 기준 "YYYY-MM-DD HH:mm[:ss]" 문자열을 돌려주는 대체 함수.
function kstParts(d: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return { y: get("year"), mo: get("month"), da: get("day"), h: get("hour"), mi: get("minute"), s: get("second") };
}

export function nowKST(withSeconds = false): string {
  return formatKST(new Date(), withSeconds);
}

/** 서버에서 받아온 임의의 Date(예: DB의 createdAt)를 nowKST와 동일한 형식의 KST 문자열로 바꾼다. */
export function formatKST(d: Date, withSeconds = false): string {
  const { y, mo, da, h, mi, s } = kstParts(d);
  return `${y}-${mo}-${da} ${h}:${mi}${withSeconds ? `:${s}` : ""}`;
}

// 날짜만 필요한 자리(등록일·발행일·오늘 날짜 비교 등)도 같은 이유로 자정~오전 9시 사이엔
// 하루 전 날짜로 밀리는 문제가 있었다 — 위 nowKST()와 같은 기준으로 "YYYY-MM-DD"만 반환.
export function todayKST(): string {
  return toKSTDateStr(new Date());
}

/** 서버에서 받아온 임의의 Date(예: DB의 createdAt)를 "YYYY-MM-DD"(KST 기준)로 바꾼다.
 *  toISOString().slice(0,10)은 UTC 날짜라 자정~오전 9시 사이엔 하루 전 날짜로 잘못 나온다. */
export function toKSTDateStr(d: Date): string {
  const { y, mo, da } = kstParts(d);
  return `${y}-${mo}-${da}`;
}

export function fmtRate(r: number): string {
  return `${r}%`;
}

// "YYYY-MM-DD" 형식이 맞는지 확인 — 엑셀 셀에 날짜가 아닌 값(오타, 다른 형식, 텍스트)이 들어있어도
// toDateStr(ExcelUploadModal.tsx)이 그 값을 그대로 통과시키는 경우가 있어, 그런 값을 실제 날짜
// 계산(연도 추출, 오늘과 비교)에 쓰기 전에 걸러내는 데 쓴다. 걸러내지 않으면 Number(...)가 NaN을
// 반환하거나 문자열 비교가 엉뚱한 결과를 내는데, 둘 다 예외를 던지지 않아 조용히 잘못된 값(예:
// TermFee.termYear = NaN)이 저장되어 이후 서버 동기화가 실패하는 원인이 될 수 있다.
export function isValidDateStr(s: string | undefined | null): s is string {
  return !!s && /^\d{4}-\d{2}-\d{2}$/.test(s);
}

// 과제 시작일(1연차 기준일) + 연차번호로부터 그 연차의 당해시작일/당해종료일을 계산.
// 수수료 청구 관리 목록·과제 상세 등 여러 화면에서 동일하게 적용하기 위한 공통 함수 —
// 각자 따로 계산하면 화면마다 당해시작일/종료일 산정 기준이 어긋난다.
export function termDateRange(projectStartDate: string, termNumber: number): { start: string; end: string } {
  const start = new Date(projectStartDate);
  start.setFullYear(start.getFullYear() + termNumber - 1);
  const end = new Date(start);
  end.setFullYear(end.getFullYear() + 1);
  end.setDate(end.getDate() - 1);
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

// 단계들(stages)의 실제 날짜 중 최소 시작일/최대 종료일 — 과제 전체 기간(firstStartDate/finalEndDate)의
// 진짜 경계. 단계가 추가/수정될 때마다 이 값으로 과제 전체 기간을 자동 갱신하는 데 쓴다(엑셀 업로드·
// 다운로드와 화면 수동입력 양쪽에서 공유). 단계에 날짜가 하나도 없으면(또는 단계 자체가 없으면) 빈 값.
export function computeOverallDatesFromStages(
  stages: { stageStartDate?: string; stageEndDate?: string }[] | undefined
): { start?: string; end?: string } {
  if (!stages || stages.length === 0) return {};
  let start: string | undefined;
  let end: string | undefined;
  for (const s of stages) {
    if (s.stageStartDate && (!start || s.stageStartDate < start)) start = s.stageStartDate;
    if (s.stageEndDate && (!end || s.stageEndDate > end)) end = s.stageEndDate;
  }
  return { start, end };
}

// termDateRange와 같지만, 그 연차가 속한 단계에 실제 단계시작일(stageStartDate)이 있으면 과제 전체
// 시작일이 아니라 그 단계 시작일을 기준으로 계산한다 — 계약변경 등으로 단계 시작이 늦춰지면, 그 단계
// 안 연차들의 당해시작일/종료일도 같이 밀려야 실제 진행 일정과 맞기 때문이다. 단계 정보가 없거나(일괄협약)
// 그 단계에 날짜가 없으면 기존처럼 과제 전체 시작일 기준으로 계산한다.
// stageStartDate는 부가 정보라 형식이 깨져 있으면(isValidDateStr) 조용히 무시하고 과제 전체 시작일로
// 넘어간다 — 반면 project.startDate는 필수값이라 여기서 걸러내지 않는다: 그게 깨졌다면 이 연차의
// 날짜를 계산할 근거가 아예 없다는 뜻이라, 잘못된 값(예: 오늘 날짜)으로 조용히 넘어가지 않고
// termDateRange가 예외를 던지게 둬서 그 프로젝트만 실패로 표시되고(다른 프로젝트 배치에는 영향 없음)
// 문제가 있는 채로 계산이 진행되지 않게 한다.
type ProjectDateLike = {
  startDate: string;
  stages?: { stageNumber: number; startTermNumber: number; endTermNumber: number; stageStartDate?: string; stageEndDate?: string }[];
};

export function resolveTermDateRange(project: ProjectDateLike, termNumber: number): { start: string; end: string } {
  const stage = project.stages?.find((s) => termNumber >= s.startTermNumber && termNumber <= s.endTermNumber);
  if (isValidDateStr(stage?.stageStartDate)) {
    return termDateRange(stage.stageStartDate, termNumber - stage.startTermNumber + 1);
  }
  return termDateRange(project.startDate, termNumber);
}

// autoGenerateTermFees(lib/store.ts)와 동일한 규칙으로 "현재 몇 연차인지" 추정 — resolveTermDateRange를
// 그대로 재사용해서(재구현하지 않음) 두 곳의 계산이 어긋날 여지를 없앤다. project.startDate 자체가
// 형식이 깨져 있으면(빈 값 등) 계산을 포기하고 1연차로 본다 — 이 함수는 참고용 경고(calendarMismatch)
// 에만 쓰이므로, 값을 모를 땐 경고를 못 띄우는 쪽(1 반환)이 엉뚱한 경고를 띄우는 쪽보다 안전하다.
// (단계 시작일만 깨진 경우는 resolveTermDateRange가 그 단계만 조용히 건너뛰므로 안전하다.)
export function computeCurrentTerm(project: ProjectDateLike, totalTerms: number, today: string): number {
  if (Number.isNaN(new Date(project.startDate).getTime())) return 1;
  let current = 1;
  for (let term = 1; term <= totalTerms; term++) {
    const termStart = resolveTermDateRange(project, term).start;
    if (termStart <= today) current = term;
  }
  return current;
}

// 그 연차의 실제 시작일 — 참여기관들이 엑셀로 올린 실제 날짜(ProjectMember.annualBudgets[].
// termStartDate, "연차별기관별" 시트의 "이 연차의 실제 시작일") 중 유효한 값들을 모아, 전부 같은
// 값이면(distinct 1개) 그 값을 신뢰해서 반환한다. 이 값은 특정 기관 고유의 값이 아니라 그 연차
// 전체에 공통으로 적용돼야 하는 값이라 주관/참여기관을 구분하지 않고 동등하게 취급한다. 값이
// 하나도 없거나(0개, 정상적인 경우 — 아직 그 연차 데이터가 없거나 일괄협약처럼 이 컬럼을 안 쓰는
// 경우) 서로 달라(2개 이상, 데이터 오류) 하나로 특정할 수 없으면 undefined를 반환해 호출부가 공식
// (resolveTermDateRange)으로 폴백하게 한다. 값이 갈리는 경우에만 console.warn으로 남겨 나중에
// 추적할 수 있게 한다 — 0개인 흔한 정상 케이스까지 경고하면 로그가 무의미해진다.
export function findRepresentativeTermStartDate(
  members: { annualBudgets?: { termNumber: number; termStartDate?: string }[] }[],
  termNumber: number,
  projectNumber?: string
): string | undefined {
  const distinct = new Set<string>();
  for (const m of members) {
    const d = m.annualBudgets?.find((b) => b.termNumber === termNumber)?.termStartDate;
    if (isValidDateStr(d)) distinct.add(d);
  }
  if (distinct.size === 1) return [...distinct][0];
  if (distinct.size > 1) {
    console.warn(
      `[findRepresentativeTermStartDate] ${projectNumber ?? "(unknown project)"} ${termNumber}연차 실제 시작일이 기관마다 달라(${[...distinct].join(", ")}) 공식으로 폴백합니다.`
    );
  }
  return undefined;
}

// 기준일로부터 n개월 뒤 날짜(yyyy-mm-dd). 잘못된 날짜면 빈 문자열.
// 채권(미수금) 만기일 = 청구일 + 3개월 규칙을 여러 화면(수수료 청구 관리·과제 상세·미수금 관리)에서
// 동일하게 적용하기 위한 공통 함수 — 각자 따로 계산하면 화면마다 만기일 산정 기준이 어긋난다.
export function addMonths(dateStr: string, months: number): string {
  if (!dateStr) return "";
  const d = new Date(`${dateStr}T00:00:00`);
  if (isNaN(d.getTime())) return "";
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

// 사업자등록번호 입력값을 000-00-00000 형태로 자동 포맷 (숫자만 추출 후 하이픈 삽입)
export function formatBizNumber(input: string): string {
  const digits = input.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

// 사업자등록번호 체크섬 검증 (국세청 공개 산출식) — 자릿수 부족/형식 오류 및 조작된 번호를 걸러낸다.
export function isValidBizNumber(input: string): boolean {
  const digits = input.replace(/\D/g, "");
  if (digits.length !== 10) return false;
  const weights = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(digits[i]) * weights[i];
  sum += Math.floor((Number(digits[8]) * 5) / 10);
  const checkDigit = (10 - (sum % 10)) % 10;
  return checkDigit === Number(digits[9]);
}

// 부가세 포함 금액(산정된 수수료)을 공급가액/부가세로 분리.
// 공급가액 = 산정된 수수료 ÷ 1.1 (반올림 없이 절사), 부가세 = 산정된 수수료 - 공급가액
// (절사로 인한 1원 오차가 부가세 쪽에 흡수되어 둘의 합이 항상 원금과 일치)
export function splitVatInclusive(total: number): { supplyAmount: number; taxAmount: number } {
  if (total <= 0) return { supplyAmount: 0, taxAmount: 0 };
  const supplyAmount = Number((BigInt(Math.round(total)) * BigInt(10)) / BigInt(11));
  return { supplyAmount, taxAmount: total - supplyAmount };
}
