# Delivery Phase 5 — Owner admin shell remount fork

> **`DELIVERY RUNTIME PARTIAL`** maintained. No push / Production / APK.

## Cause (1)

`StoresOwnerLayoutClient` forked hub vs stack into **different trees**:

- Hub: `OwnerHubRuntimeProvider` + `BusinessAdminShell(initialStores)`
- Stack: `StoreBusinessGuard` + `BusinessAdminShell` (**no seed**)

Tab hops remounted Guard/Shell/Runtime → Guard `animate-pulse` on peek miss, `/api/me/stores` remount pressure, Runtime tear-down.

## Fix (1)

One persistent tree for non-apply owner routes: Runtime + Guard(`enforce={!isHub}`) + Shell(`initialStores` always). Hub still ungated; stack reuses peek/phase without remounting the shell.

## Verify

- `npm run verify:owner-admin-scroll-shell-contract`
- `vitest run lib/business/__tests__/owner-admin-scroll-shell-contract.test.ts`

## Deferred → closed when products follow-up lands

- ~~Products `MainFeedRouteLoading` Suspense pulse~~ → see commit after Phase 5 shell

## Deferred

- Residual P0 (detail first-menu, resume, keyboard)
- Deploy / APK / device QA
