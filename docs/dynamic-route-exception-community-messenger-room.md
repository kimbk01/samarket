# Dynamic Route Exception: `community-messenger/rooms/[roomId]`

## Status (2026-05-17, R2-M10B)

`app/(main)/community-messenger/rooms/[roomId]/page.tsx` **no longer** exports `force-dynamic`.

Room shell mounts via **`CommunityMessengerRoomPageClientEntry`** (client-first):

- `roomId` / query: `useParams` · `useSearchParams`
- `viewerUserId`: `peekMessengerRoomViewerUserIdClient()` (pub/dev cookie) → bootstrap 확정
- E2E diag (non-prod): `isMessengerRoomE2eDiagEnabledClient()` + `MessengerRoomE2eSnapshotDiagTradeOverlay` → `GET .../e2e-room-snapshot-diag`

Per-request server `cookies()` / `headers()` / `getOptionalAuthenticatedUserId()` were removed from this segment to cut **push → route_change** RSC/flight wait.

## E2E room diagnostics

Production: unchanged (diag off).

Non-production: set cookie `samarket_e2e_room_diag=1` (Playwright 기존과 동일). Trade/load merge는 클라 overlay + API.

## Before reintroducing server dynamic on this page

1. Measured regression on `push_to_route_change_ms` / `route_mount_gap_ms` (R2-M10).
2. E2E `messenger-room-snapshot-diag*` · composer snapshot specs pass.
3. No composer / Phase2 / reducer contract change.
