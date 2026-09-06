# Owner FULL ROLLBACK → RECOVERED_GOOD

**Authority:** User Production blank / scroll fail after repeated selective-restore patches.  
**Decision:** Stop patching. Restore Owner Product + shell files to **`ad7942be6`** (last SHA where Product New form height/scroll was Production-proven).

## Restored files (exact `ad7942be6`)

- `components/business/admin/BusinessAdminShell.tsx`
- `components/business/owner/OwnerProductForm.tsx`
- `lib/business/owner-stack-scroll-host-path.ts`
- `lib/business/owner-basic-info-guard.ts`
- `lib/business/owner-compact-shell-layout.ts`
- `app/owner-compact-shell.css`
- `app/(main)/stores/owner/products/new/page.tsx`
- `lib/business/__tests__/owner-admin-scroll-shell-contract.test.ts`

## Not reverted

- Unrelated Admin ARO / domain-control commits after this SHA  
- Business fixes outside these shell/product files  

## Status

**FAIL / NOT CLOSED** until user confirms Product New usable on Production after this deploy.
