"use client";

import { useEffect, useRef } from "react";
import Script from "next/script";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

// next/script는 같은 src의 스크립트를 한 번만 로드한다. Turnstile은 스크립트가 로드되는
// 시점에 DOM을 훑어 .cf-turnstile 요소를 자동으로 찾아 렌더링하는데, 로그인↔회원가입처럼
// <Link>로 페이지를 오가면(풀 리로드 없음) 두 번째로 마운트되는 페이지에서는 스크립트가
// 다시 실행되지 않아 그 자동 스캔이 일어나지 않는다 — 새로 마운트된 위젯 컨테이너가 빈 채로
// 남아 체크박스가 "있다가 없다가" 하는 원인이었다. class="cf-turnstile"을 쓰지 않고(자동
// 스캔 대상에서 제외) 마운트될 때마다 turnstile.render()를 직접 호출해 항상 렌더링되게 한다.
export default function TurnstileWidget() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let widgetId: string | undefined;
    let pollId: ReturnType<typeof setInterval> | undefined;
    let cancelled = false;

    function tryRender(): boolean {
      if (!window.turnstile || !containerRef.current) return false;
      widgetId = window.turnstile.render(containerRef.current, {
        sitekey: TURNSTILE_SITE_KEY,
        action: "turnstile-spin-v1",
      });
      return true;
    }

    if (!tryRender()) {
      // 이 페이지의 첫 방문(풀 리로드)이라 스크립트가 아직 다운로드 중인 경우 — 로드가
      // 끝나 window.turnstile이 생기는 대로 렌더링한다.
      pollId = setInterval(() => {
        if (cancelled) return;
        if (tryRender() && pollId) clearInterval(pollId);
      }, 100);
    }

    return () => {
      cancelled = true;
      if (pollId) clearInterval(pollId);
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, []);

  return (
    <>
      <div ref={containerRef} />
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" async defer strategy="afterInteractive" />
    </>
  );
}
