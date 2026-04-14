/** Next가 항상 web 폴더를 기준으로 모듈을 찾도록 함 */
const path = require("path");
const withBundleAnalyzer = require("@next/bundle-analyzer")({
  enabled: process.env.ANALYZE === "true",
});

const webDir = __dirname;

/**
 * Next 16 + Windows: `distDir` 에 절대 경로를 넣으면 내부에서 프로젝트 루트와 잘못 합쳐질 수 있음.
 * 같은 드라이브면 프로젝트 기준 상대 경로로 바꾼다.
 *
 * 주의: `distDir` 을 프로젝트 루트 밖(예: %LOCALAPPDATA%)에 두면 dev 서버 번들이
 * `react/jsx-runtime` 등을 찾지 못하는 경우가 있어 자동 기본값으로 쓰지 않는다.
 * -4094 완화는 `scripts/next-dev.cjs` 의 Webpack 폴링·직렬 모드 + 저장소를 OneDrive 밖에 두기 등으로 처리.
 */
function distDirRelativeToProject(absoluteDir) {
  const rel = path.relative(webDir, absoluteDir);
  return path.isAbsolute(rel) ? absoluteDir : rel;
}

function resolveDistDirForNextConfig() {
  const raw = process.env.NEXT_DIST_DIR?.trim();
  if (!raw) return undefined;
  const resolvedAbs = path.isAbsolute(raw) ? raw : path.join(webDir, raw);
  if (process.platform === "win32") {
    const rel = distDirRelativeToProject(resolvedAbs);
    process.env.NEXT_DIST_DIR = rel;
    return rel;
  }
  return path.isAbsolute(raw) ? raw : path.join(webDir, raw);
}

const resolvedDistDir = resolveDistDirForNextConfig();

/** @type {import('next').NextConfig} */
const nextConfig = {
  ...(resolvedDistDir ? { distDir: resolvedDistDir } : {}),
  experimental: {
    /** named export 트리가 커질 때 클라이언트 청크 슬림 */
    optimizePackageImports: [
      "@tanstack/react-virtual",
      "zustand",
      "@supabase/supabase-js",
    ],
  },
  /** Vercel 빌드 시 클라이언트에서도 Preview/Production 구분 (deploy-surface.ts) */
  env: {
    NEXT_PUBLIC_VERCEL_ENV: process.env.VERCEL_ENV ?? "",
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/public/**" },
      // 로컬 Supabase Storage (`supabase start`) 에서 public URL 이 http 인 경우
      { protocol: "http", hostname: "127.0.0.1", pathname: "/storage/v1/object/public/**" },
      { protocol: "http", hostname: "localhost", pathname: "/storage/v1/object/public/**" },
    ],
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "no-store, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        // 보안 헤더 — 모든 경로
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // mic/camera: 빈 allowlist `()` 는 1인칭 페이지에서도 getUserMedia 가 막혀 통화가 불가능함.
          // geolocation: 주소 선택(/address/select)·매장 등 동일 출처에서만 사용 (끄면 기기 GPS를 켜도 API가 막힘).
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(self), geolocation=(self)",
          },
          // 클릭재킹 이중 방어
          { key: "X-XSS-Protection", value: "1; mode=block" },
          // HTTPS 배포 환경에서만 (로컬 http 개발은 제외)
          ...(process.env.NODE_ENV === "production" || process.env.VERCEL === "1"
            ? [
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=31536000; includeSubDomains",
                },
              ]
            : []),
        ],
      },
      {
        // API Route — 브라우저가 API 응답을 스니핑하지 않도록 캐시 금지
        source: "/api/:path*",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate" },
          // 동일 출처에서만 API 직접 호출 허용 (CSRF 완화)
          // 외부 서비스(Supabase webhook 등)는 별도 검증 로직 사용
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
  // 개발 모드 시 좌하단 'N' 아이콘 숨김 (에러 발생 시 오버레이만 표시)
  devIndicators: false,
  /**
   * 폰·태블릿에서 `http://<LAN-IP>:3000` 으로 접속 시 `/_next/*` 가 cross-origin 으로 잡혀
   * 경고가 나거나(향후) 차단될 수 있음 — 허용 호스트네임 나열.
   * 추가: `.env.local` 에 `NEXT_DEV_ALLOWED_ORIGINS=192.168.1.5,10.0.0.12` 처럼 쉼표 구분.
   */
  allowedDevOrigins: [
    ...(typeof process.env.NEXT_DEV_ALLOWED_ORIGINS === "string"
      ? process.env.NEXT_DEV_ALLOWED_ORIGINS.split(/[\s,]+/).filter(Boolean)
      : []),
    "192.168.100.7",
  ],
  turbopack: {
    root: webDir,
    resolveAlias: {
      tailwindcss: path.join(webDir, "node_modules", "tailwindcss"),
      "@tailwindcss/postcss": path.join(webDir, "node_modules", "@tailwindcss/postcss"),
    },
  },
  webpack: (config, { dev }) => {
    // Windows UNKNOWN(-4094) open '.next/dev/.../layout.js' =
    // Webpack HMR 이 같은 파일을 읽는 타이밍에 다른 작업이 쓰기/삭제 중(백신·동시 컴파일).
    // 완화: watch 묶기 + `npm run dev` 기본 안정 모드(next-dev.cjs 가 WIN_SERIAL·MEMORY_CACHE 설정).
    if (dev && process.platform === "win32") {
      /**
       * UNKNOWN(-4094) on `open('.next/dev/...')`:
       * 컴파일 출력과 HMR/읽기가 같은 파일에서 겹치거나, Defender 등이 짧게 잠글 때 발생.
       * - aggregateTimeout: 연속 저장을 한 번에 묶어 쓰기·읽기 경합 감소
       * - poll: 네이티브 파일 이벤트 대신 주기 스캔 → 백신·잠금에 덜 민감 (CPU 소폭 증가)
       * 끄기: NEXT_WEBPACK_NO_POLL=1 또는 NEXT_WEBPACK_POLL_MS=0 (기본 폴링 2.5s)
       */
      const noPoll = process.env.NEXT_WEBPACK_NO_POLL === "1";
      const pollRaw = process.env.NEXT_WEBPACK_POLL_MS;
      const pollMs =
        noPoll || pollRaw === "0" || pollRaw === ""
          ? undefined
          : Math.max(200, Number(pollRaw || 2500));
      config.watchOptions = {
        ...(config.watchOptions || {}),
        aggregateTimeout: Math.max(
          800,
          Number(process.env.NEXT_WEBPACK_AGGREGATE_MS || 2000)
        ),
        followSymlinks: false,
        ...(pollMs ? { poll: pollMs } : {}),
      };
      if (process.env.NEXT_WEBPACK_WIN_SERIAL === "1") {
        config.parallelism = 1;
      }
      if (process.env.NEXT_WEBPACK_MEMORY_CACHE === "1") {
        config.cache = { type: "memory" };
      }
    }
    // Webpack 5 resolve에는 `context`가 없음(Next 검증 오류). 모듈 기준은 modules·alias로 유지.
    config.resolve.modules = [path.join(webDir, "node_modules"), "node_modules"];
    config.resolve.alias = {
      ...config.resolve.alias,
      tailwindcss: path.join(webDir, "node_modules", "tailwindcss"),
      "@tailwindcss/postcss": path.join(webDir, "node_modules", "@tailwindcss/postcss"),
    };
    return config;
  },
};

module.exports = withBundleAnalyzer(nextConfig);
