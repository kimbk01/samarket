# DIBAY Build / Deploy HARD LOCK

**HARD LOCK (2026-08-12).**  
**Companion rule:** `.cursor/rules/dibay-production-deploy-authority-hard-lock.mdc`

Cutover SHA (Git Integration Production): recorded at lock time on `origin/main`.

## Root cause (PROVEN)

Vercel **Standard 4c/8GB** CPU bottleneck on Turbopack compile + Running TypeScript.

Same SHA `5ba07ee` Preview A/B:

| | TOTAL | COMPILE | TYPECHECK | CORE |
|---|---|---|---|---|
| Standard 4c/8GB median | 288s | 110s | 113s | 223s |
| Enhanced 8c/16GB median | 147s | 37.6s | 63.9s | 102s |
| Saving | **49%** | **66%** | **44%** | **55%** |

TS graph split: KEEP (type safety + ~12% typecheck). Not the total-time fix.

Turbo: **NOT REQUIRED**. Do not enable.

## Authority

```
origin/main
  → Vercel Git Integration
  → ONE Production deployment
```

Build machine: **Enhanced 8c / 16GB** (`resourceConfig.buildMachineType=enhanced`, `buildMachineSelection=fixed`).

Next production build: **Vercel ONLY**.

## Regular deploy path (Owner 2026-10-15)

**정규 웹 배포:** 수정 → 로컬/CI 검증 → 기존 승인 절차 → `main` 반영 → Vercel Production 자동 배포 → 운영 확인.

- **TEST / Preview는 정규 배포의 필수 단계가 아니다.** Owner가 필요할 때만 사용한다.
- Vercel 기본 Preview(PR 브랜치)는 플랫폼 기본 기능이며, 정규 경로에 승인 게이트로 끼워 넣지 않는다.
- Custom Environment `test` · `dibay-test` 브랜치 · TEST Supabase/Firebase/Android flavor는 **보존**한다 (삭제·리버트 금지).
- Admin `/admin/system/deploy`의 TEST 검증·Promote UI는 **선택/보조**이며, Promote 실행은 별도 unlock 전까지 BLOCKED.
- Android/iOS 스토어 제출은 웹 Production과 **별도** 절차다.

GitHub CI: `npm run ci` = source typecheck + test typecheck + lint + vitest + contracts + i18n. **No `next build`.**

TypeScript:

- Production / Next: `tsconfig.build.json` (`next.config.js` `typescript.tsconfigPath`)
- Test / scripts: `tsconfig.test.json`
- `ignoreBuildErrors` = **0**

## DO NOT

- `vercel --prod` / `npx vercel deploy --prod` / Cursor CLI Production
- dirty-tree Production / Git FAIL 후 CLI override
- same-SHA unnecessary Production redeploy
- Dashboard Production Redeploy as the cutover path
- GitHub Actions `next build`
- `ignoreBuildErrors: true`
- Turbo build machine
- NODE_OPTIONS / heap change as a substitute for Enhanced
- Revert `tsconfig.build.json` / `tsconfig.test.json` split without reopen

## After Git FAIL

FAILED 유지 → 새 commit → `git push origin main` 1회 → Git Integration 1회.
