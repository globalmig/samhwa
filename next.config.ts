import type { NextConfig } from "next";

// 이 앱이 외부에서 불러오는 리소스는 Cloudflare Turnstile(스크립트/iframe)과
// 그 검증용 Worker(fetch)뿐이다 — lib/turnstile.ts, app/login, app/signup 참고.
const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";

function turnstileWorkerOrigin(): string | null {
  const url = process.env.NEXT_PUBLIC_TURNSTILE_WORKER_URL;
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

const connectSrc = ["'self'", turnstileWorkerOrigin()].filter(Boolean).join(" ");

// App Router가 하이드레이션/스트리밍에 쓰는 인라인 <script>(self.__next_f.push(...))는
// 정적으로 미리 렌더링되는 페이지(예: /login)에도 들어가는데, 이런 페이지는 요청마다
// 다시 렌더링되지 않아 미들웨어에서 만든 요청별 nonce를 심을 수 없다(실제로 nonce 기반
// CSP를 테스트해보니 정적 페이지에서 nonce가 전혀 붙지 않아 스크립트가 전부 막히는
// 것을 확인함). 그래서 script-src는 nonce 대신 unsafe-inline으로 완화하되, 외부
// 스크립트 출처는 Turnstile 도메인 하나로만 제한한다.
const csp = [
  `default-src 'self'`,
  `script-src 'self' 'unsafe-inline' ${TURNSTILE_ORIGIN}`,
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
