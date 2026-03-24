/** Next가 항상 web 폴더를 기준으로 모듈을 찾도록 함 */
const path = require("path");

const webDir = __dirname;

/** @type {import('next').NextConfig} */
const nextConfig = {
  /** Vercel 빌드 시 클라이언트에서도 Preview/Production 구분 (deploy-surface.ts) */
  env: {
    NEXT_PUBLIC_VERCEL_ENV: process.env.VERCEL_ENV ?? "",
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
  // 개발 모드 시 좌하단 'N' 아이콘 숨김 (에러 발생 시 오버레이만 표시)
  devIndicators: false,
  turbopack: {
    root: webDir,
    resolveAlias: {
      tailwindcss: path.join(webDir, "node_modules", "tailwindcss"),
      "@tailwindcss/postcss": path.join(webDir, "node_modules", "@tailwindcss/postcss"),
    },
  },
  webpack: (config, { dev }) => {
    // Windows + webpack dev: 병렬 컴파일이 .next 아래 manifest 동시 open 시 UNKNOWN(-4094)로 터지는 경우가 있음
    if (dev && process.platform === "win32") {
      config.parallelism = 1;
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

module.exports = nextConfig;
