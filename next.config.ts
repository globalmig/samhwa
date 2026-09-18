import type { NextConfig } from "next";

// 이 앱이 외부에서 불러오는 리소스는 Cloudflare Turnstile(스크립트/iframe)과
// 그 검증용 Worker(fetch)뿐이다 — lib/turnstile.ts, app/login, app/signup 참고.
const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";

// 도메인이 Cloudflare 프록시를 거치면서 Cloudflare Web Analytics(Browser Insights) 비콘
// 스크립트(static.cloudflareinsights.com/beacon.min.js)가 응답 HTML에 자동 삽입된다 — 이
// 앱 코드가 직접 불러오는 게 아니라 Cloudflare 쪽에서 넣는 것이라 script-src/connect-src
// 양쪽에 허용해야 CSP에 막히지 않는다(스크립트 로드 자체는 script-src, 비콘이 보내는
// fetch/XHR는 connect-src).
const CF_INSIGHTS_ORIGIN = "https://static.cloudflareinsights.com";

function turnstileWorkerOrigin(): string | null {
  const url = process.env.NEXT_PUBLIC_TURNSTILE_WORKER_URL;
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

// Turnstile 위젯 스크립트 자체가 challenges.cloudflare.com으로 내부 요청(fetch/XHR)을 보낸다 —
// script-src/frame-src에만 이 출처를 허용하고 connect-src에서 빠뜨리면, 그 요청이 CSP에 막혀
// 위젯(체크박스)이 아예 렌더링되지 않는다(Cloudflare Turnstile 공식 CSP 가이드가 요구하는 세 곳
// 중 하나였는데 여기만 빠져 있었음).
const connectSrc = ["'self'", TURNSTILE_ORIGIN, CF_INSIGHTS_ORIGIN, turnstileWorkerOrigin()].filter(Boolean).join(" ");

// App Router가 하이드레이션/스트리밍에 쓰는 인라인 <script>(self.__next_f.push(...))는
// 정적으로 미리 렌더링되는 페이지(예: /login)에도 들어가는데, 이런 페이지는 요청마다
// 다시 렌더링되지 않아 미들웨어에서 만든 요청별 nonce를 심을 수 없다(실제로 nonce 기반
// CSP를 테스트해보니 정적 페이지에서 nonce가 전혀 붙지 않아 스크립트가 전부 막히는
// 것을 확인함). 그래서 script-src는 nonce 대신 unsafe-inline으로 완화하되, 외부
// 스크립트 출처는 Turnstile 도메인 하나로만 제한한다.
// 개발 모드에서 React가 서버 에러 스택을 브라우저에서 재구성하는 데 eval()을 쓴다
// (프로덕션에서는 쓰지 않음) — Next.js 공식 CSP 가이드 권장대로 dev에서만 완화한다.
const isDev = process.env.NODE_ENV === "development";

const csp = [
  `default-src 'self'`,
  `script-src 'self' 'unsafe-inline' ${TURNSTILE_ORIGIN} ${CF_INSIGHTS_ORIGIN}${isDev ? " 'unsafe-eval'" : ""}`,
  `style-src 'self' 'unsafe-inline'`,
  `img-src 'self' blob: data:`,
  `font-src 'self'`,
  `connect-src ${connectSrc}`,
  `frame-src ${TURNSTILE_ORIGIN}`,
  `object-src 'none'`,
  `base-uri 'self'`,
  `form-action 'self'`,
  `frame-ancestors 'none'`,
  `upgrade-insecure-requests`,
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  // Next.js/버전 정보가 담긴 X-Powered-By 응답 헤더를 제거한다.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default nextConfig;
