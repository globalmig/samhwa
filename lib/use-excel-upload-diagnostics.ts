"use client";

import { useCallback, useEffect, useRef } from "react";

const STORAGE_KEY = "samhwa.excel-upload.diagnostics";
type Details = Record<string, string | number | boolean>;

// 파일 내용은 기록하지 않는다. 마지막 100개 이벤트를 탭 세션에 보관해 새로고침 후에도
// 닫기 요청, 화면 이탈, 런타임 오류 중 어느 경로였는지 확인할 수 있게 한다.
export function useExcelUploadDiagnostics(step: string, busy: boolean) {
  const context = useRef({ step, busy });
  const record = useCallback((event: string, details: Details = {}) => {
    const entry = { at: new Date().toISOString(), event, ...context.current, ...details };
    console.info("[excel-upload]", entry);
    try {
      const stored: unknown = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "[]");
      const previous = Array.isArray(stored) ? stored : [];
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...previous.slice(-99), entry]));
    } catch {
      // 브라우저 저장소가 차단돼도 업로드는 계속한다.
    }
  }, []);

  useEffect(() => {
    context.current = { step, busy };
    record("state");
  }, [step, busy, record]);

  useEffect(() => {
    const onError = (event: ErrorEvent) => record("runtime_error", {
      message: event.message.slice(0, 500), line: event.lineno, column: event.colno,
    });
    const onRejection = (event: PromiseRejectionEvent) => record("unhandled_rejection", {
      message: event.reason instanceof Error ? event.reason.message.slice(0, 500) : "Non-Error rejection",
    });
    const onPageHide = () => record("pagehide");
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") record("escape");
    };
    record("mounted");
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      record("unmounted");
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [record]);

  return record;
}
