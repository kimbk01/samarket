# iOS Native Call — Known Issues (record-only)

Append-only tracker for issues **outside** active wiring commits. Do not fix here without explicit approval.

---

## 2026-07-10 — Web handoff (pre-existing, not B5)

**Context:** B5 flag-OFF QA (`7367c681` et al.). `ios_native_video_*` = 0 (Native path not entered). Legacy Web handoff used.

### ISSUE-1 — Video in-call UI not shown (`nativeAccept` / `mode=active` missing)

| Field | Detail |
|-------|--------|
| **Symptom** | After CallKit accept on incoming **video**, Web in-call screen does not appear on iPhone. |
| **Observed** | DB: `ringing` → `accepted` → `ended` with no `connected` audit event. Samsung caller may reach `state_connected` while callee has no video UI. |
| **Likely cause** | `DibayPushTokenBridge.openCallDeepLink` navigates to `/community-messenger/calls/{id}?action=accept` only. Standard accept href includes `nativeAccept=1&mode=active` (`incoming-call-accept-gateway.ts`, `call-engine-controller.ts`). |
| **Track** | iOS Web video handoff / Voice Native UI (separate from B5 Native wiring). |
| **B5 relation** | **Unrelated** — same URL as pre-B5; flag OFF uses unchanged `deliverExistingAnswerHandoff`. |

### ISSUE-2 — Stuck on connecting/ending after remote hangup

| Field | Detail |
|-------|--------|
| **Symptom** | Caller (Samsung) ends call; callee iPhone remains on connecting/ending screen and does not exit. |
| **Observed** | Server `ended`; Samsung `call_end_signal_sent` + FCM `call_ended`. Callee UI cleanup incomplete. |
| **Likely cause** | `CallKitProvider.reportCallEnded` / VoIP terminal vs Web `postCallAction` / CallV4 terminal finalize **not synchronized** when callee never reached connected UI. |
| **Track** | iOS Web video terminal + CallKit lifecycle (separate from B5). |
| **B5 relation** | **Unrelated** — legacy `deliverLegacyVideoEnd` path unchanged when flag OFF. |

### Related (Voice, same family)

- Accept 후 in-call UI가 앱 뒤로 가려짐 — Voice Native UI track; recorded during G1 voice QA; not fixed in B5.
