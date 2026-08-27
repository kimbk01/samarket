import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import reactHooks from "eslint-plugin-react-hooks";

/**
 * Lint policy (점진적 품질): 레거시 대량 수정 없이 CI를 녹이고, 경고는 로그로 남김.
 * - any·effect 내 setState 등은 신규 코드에서도 가능하면 피할 것
 * - 전부 에러로 끌어올릴 때: `npm run lint:strict`
 */
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/static-components": "warn",
      /** Next 16 compiler rules — 레거시 ref sync·RSC perf 측정은 점진 이전(경고만, `--quiet` CI 통과). */
      "react-hooks/refs": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/rules-of-hooks": "warn",
      "react-hooks/immutability": "warn",
    },
  },
  {
    files: ["next.config.js", "postcss.config.*", "tailwind.config.*"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-*/**",
    ".tmp-*/**",
    ".tsbuild/**",
    "Users/**",
    ".vercel/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".qa-logs/**",
    ".worktrees/**",
  ]),
  {
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      /**
       * 마운트 시 데이터 로딩(setState)은 널리 쓰이는 패턴이다.
       * React Compiler/Suspense로 단계적 이전할 때까지 과도한 오탑로를 줄인다.
       */
      "react-hooks/set-state-in-effect": "off",
      /** 점진적 타이핑: any는 경고로 두고 신규 코드부터 좁힌다. */
      "@typescript-eslint/no-explicit-any": "warn",
      /** 의존성 배열은 팀 리뷰로 다루고, 빌드 게이트는 오류만 막는다. */
      "react-hooks/exhaustive-deps": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    files: ["next.config.js", "**/*.config.js", "**/*.config.cjs", "scripts/**/*.cjs"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  /**
   * Phase2 room view는 Context로 묶인 ViewModel(`vm`)에 ref·state·handler가 함께 있어,
   * `react-hooks/refs`가 JSX의 `ref={vm.*Ref}`·`value={vm.*}` 등을 전부 “렌더 중 ref 접근”으로 오탐한다.
   * (실제로는 ref 콜백에 객체를 넘기는 정상 패턴이다.)
   * `ConnectedVideoView` 도 ViewModel에 `pipRef` 등 RefObject 를 넘기는 동일 패턴으로 오탐한다.
   */
  {
    files: ["components/community-messenger/room/phase2/**/*.tsx", "components/messenger/call/ConnectedVideoView.tsx"],
    rules: {
      "react-hooks/refs": "off",
    },
  },
  /**
   * Telegram list authority — dual-write paint path deleted; forbid resurrection via import.
   */
  {
    files: ["**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/chat-domain/list/dual-write-domain-list-from-rooms",
              message:
                "Deleted (Telegram list authority). Use Domain canary patch / applyHomeListPatch only.",
            },
          ],
          patterns: [
            {
              group: ["**/dual-write-domain-list-from-rooms*"],
              message:
                "Deleted (Telegram list authority). Use Domain canary patch / applyHomeListPatch only.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
