# DIBAY Call + Messenger — Production Restore HARD LOCK

**Status:** HARD LOCK ACTIVE (verified contracts only)  
**Declared:** 2026-10-14  
**Production evidence tip:** `5fb6b1e11f2503b7b60ac3d298f7594f570eb4b9`  
**Umbrella:** `docs/dibay-chat-call-current-normal-hard-lock.md` (does not replace A/B/C/D — adds restore projection/UI contracts)

This lock freezes **only** contracts with Current Production device evidence.  
It does **not** claim full Call+Messenger product closed.

## Explicit exclusions (not locked)

| Item | Status | Rule |
|---|---|---|
| iPhone CallKit 방 UI 빈 말풍선 직접 dump | **NOT_PROVEN** | Do not HARD LOCK iPhone room WebKit UI; Runtime/Page/DOM unavailable |
| Samsung system PiP | **DEVICE_ISSUE_DEFERRED** | OEM/device issue — not product PASS lock |
| Full restore matrix beyond rows below | Incomplete | Do not expand lock to unverified cells |

## Locked contracts (Production-proven scope)

### R1 — call_stub viewer direction (initiator)

**Proof:** Samsung DOM `data-cm-call-direction` 10/10 PASS (FAIL2 Production).  
**SSOT:** `lib/community-messenger/call-stub-viewer-direction.ts`  
**Wire:** `components/community-messenger/room/phase2/MessengerTimelineVirtualRow.tsx` must call `withCallStubViewerDirection`.  
**Rule:** call_stub 「발신/수신」 = initiator 기준. `isMine`(stub 작성자) 단독 금지.

### R2 — terminal call_stub bump `messageForBump` + empty text ghost filter

**Proof:** Android verified screens empty peer gone; CallKit-era Samsung `peerOnly=0` after terminal stub.  
**iPhone CallKit room UI:** NOT_PROVEN (exclusion above).  
**SSOT:**
- Terminal stub publish must include `messageForBump` (`appendCommunityMessengerCallStubMessage` → `publishMessengerRoomBumpAfterMutation`)
- Timeline must filter empty text ghosts: `isEmptyTextTimelineGhost` in `use-messenger-room-derived-message-lists.ts`
- RT store must not promote incomplete empty text rows as durable text

### R3 — Android Native mute / camera / HOME resume / AudioFocus

**Proof:** APK↔APK measure PASS (`/tmp/np-call-controls-android.json`).  
**Scope:** Android Native Voice/Video only.  
**Required presence:**
- `native_voice_call_mute` + `muteLocalAudioStream` path
- `native_video_call_camera` + `setCameraEnabled`
- Voice/Video Service `requestAudioFocus`
- Call Activity must remain resumable after HOME (Activity ownership — do not remove dock/resume restore)

**Not locked:** Samsung PiP enter/return product claim.

### R4 — private_group send/recv

**Proof:** Production wwww→aaaa room `3e92fa77-de94-493b-b2e2-eb4813228d39` PASS.  
**Boundary:** stays under `docs/dibay-messenger-domain-group-hard-lock.md` (DIRECT ≠ GROUP).  
**Do not** collapse GROUP into DIRECT peer identity.

### R5 — Messenger background → resume catch-up

**Proof:** Xiaomi HOME → Samsung send → resume bootstrap/UI PASS.  
**SSOT owners (do not delete):**
- `lib/community-messenger/room/use-messenger-room-remote-catchup.ts`
- Room/home visibility catch-up paths that rehydrate after WebView was covered

### R6 — APK WebView account switch session

**Proof:** Xiaomi pre-session → `aaaa` session switch PASS.  
**Rule:** logout + new session must change `viewerUserId` / `/api/me/profile` identity. Do not share authority across accounts on one WebView without logout.

## Change control

Without Owner reopen + Production contradiction:

- Do not remove R1–R6 wires “for cleanup”
- Do not “fix” iPhone CallKit empty UI by claiming PASS without room UI evidence
- Do not promote Samsung PiP to PASS under this lock

## Verify (must PASS)

```bash
npm run verify:call-messenger-restore-hard-lock
```

Wired into **`npm run ci`** → GitHub Actions `.github/workflows/ci.yml` (push/PR).  
Runs structural gates + unit contracts. Rule-file existence alone is **not** HARD LOCK PASS.  
Vercel Production = `git push origin main` build only; contract enforcement for this lock is **GHA `npm run ci`**.
