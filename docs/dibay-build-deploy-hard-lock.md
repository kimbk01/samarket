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
