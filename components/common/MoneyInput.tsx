"use client";

import { useEffect, useState } from "react";

interface Props {
  value: number;
  onChange: (value: number) => void;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  onFocus?: (e: React.FocusEvent<HTMLInputElement>) => void;
  onBlur?: (e: React.FocusEvent<HTMLInputElement>) => void;
  title?: string;
}

// 금액 입력 전용 — 네이티브 <input type="number">는 천 단위 구분기호(,)를 표시할 수 없어서
// 텍스트 입력으로 받되 숫자만 남기고 입력 중에도 자동으로 콤마를 붙여 표시한다.
export default function MoneyInput({ value, onChange, className, placeholder, disabled, autoFocus, onFocus, onBlur, title }: Props) {
  const [text, setText] = useState(() => (value ? value.toLocaleString("ko-KR") : ""));

  // 부모에서 값이 바뀐 경우(다른 필드 변경으로 재계산되는 등)에만 표시를 동기화한다 —
  // 매 입력마다 되돌리면 콤마 삽입 중 커서 위치가 튀므로, 현재 표시값의 숫자와 다를 때만 갱신.
  useEffect(() => {
    setText((prev) => {
      const prevNum = prev === "" ? 0 : Number(prev.replace(/,/g, ""));
      return prevNum === value ? prev : value ? value.toLocaleString("ko-KR") : "";
    });
  }, [value]);

  function handleChange(raw: string) {
    const digits = raw.replace(/[^\d]/g, "");
    const num = digits === "" ? 0 : Number(digits);
    setText(digits === "" ? "" : num.toLocaleString("ko-KR"));
    onChange(num);
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      value={text}
      onChange={(e) => handleChange(e.target.value)}
      onFocus={onFocus}
      onBlur={onBlur}
      title={title}
      placeholder={placeholder}
      disabled={disabled}
      autoFocus={autoFocus}
      className={className}
    />
  );
}
