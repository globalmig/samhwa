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

export function fmtRate(r: number): string {
  return `${r}%`;
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
