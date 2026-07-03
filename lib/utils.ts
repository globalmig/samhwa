export function fmtWon(n: number): string {
  if (n === 0) return "0원";
  if (n >= 100_000_000) {
    const v = n / 100_000_000;
    return `${parseFloat(v.toFixed(1)).toLocaleString("ko-KR")}억원`;
  }
  return `${Math.round(n / 10_000).toLocaleString("ko-KR")}만원`;
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
