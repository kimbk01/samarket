# Call V4 Phase 6 — 3-Platform QA

Connected 이후 media/presentation 레이어만 검증합니다. 수신·5C·G1~G5는 기존 게이트를 그대로 사용합니다.

## 공통 전제

```bash
NEXT_PUBLIC_DIBAY_CALL_V4_TELEGRAM_LANE=1
NEXT_PUBLIC_DIBAY_CALL_V4_VIDEO=1
NEXT_PUBLIC_DIBAY_CALL_V4_PIP=1
NEXT_PUBLIC_DIBAY_CALL_V4_DOCK=1
```

구조 검증:

```bash
npm run verify:call-v4-structure-lock
npm run verify:call-v4-incoming-fsi-fallback-boundary
npm run qa:call-v4-5gate
node .qa-logs/v4-phase6-video-pip-dock-qa.mjs
```

## Presentation capability (SSOT)

| Platform | PiP | Dock fallback |
|----------|-----|---------------|
| Android | `android_os_pip` (MainActivity) | `web_floating_dock` (GlobalCallDockHost) |
| iOS | `ios_native_pip` (plugin probe) or none | `ios_dock_fallback` (mini dock) |
| Web / Windows | none | `web_floating_dock` |

공통 SSOT: `call-v4-media-state`, `call-v4-connected-media-policy`, `call-v4-video-upgrade`, `call-v4-runtime-surface`, `useCallV4PresentationPlatform`, `CallV4ActiveCallHost`.

---

## Android QA

| # | 시나리오 | 판정 |
|---|----------|------|
| A1 | `callKind=video` 발신 connected — local/remote video | UI + logcat `local_video_publish` |
| A2 | `callKind=video` 수신 connected attach | UI |
| A3 | 음성 connected → 영상 업그레이드 | `video_upgrade_applied` |
| A4 | camera off → voice UI | VM `mode=voice` |
| A5 | connecting 중 video slot 없음 | VM assert |
| B1 | connected → 홈 → OS PiP (video) | OS PiP + compact chrome |
| B2 | 음성 connected → 홈 → OS PiP call card | 16:9 PiP |
| B3 | PiP restore / end | bridge action |
| C1 | route leave → floating dock | `presentation_dock_minimize` |
| C2 | dock expand / end | `dock_expand` |
| R1 | G1~G5 회귀 | `npm run qa:call-v4-5gate` PASS |
| R2 | 10분 Agora reconnect 없음 | logcat |

---

## iOS QA

| # | 시나리오 | 판정 |
|---|----------|------|
| I1 | `callKind=video` 발신/수신 connected | UI (Android와 동일 UX 언어) |
| I2 | 음성 → 영상 업그레이드 | broadcast + PATCH |
| I3 | route leave → mini dock | `ios_route_leave_floating_dock` 또는 `presentation_dock_minimize` |
| I4 | background (home) → dock fallback | `ios_background_dock_fallback` |
| I5 | dock restore → calls-v4 | navigation |
| I6 | camera/mic permission 거부/허용 | snack + no key leak |
| I7 | 종료 후 cleanup | `cleanup_done`, dock hidden |
| I8 | iOS native PiP unavailable → dock only | `ios_presentation_capability` log |

---

## Windows / Web QA

| # | 시나리오 | 판정 |
|---|----------|------|
| W1 | `callKind=video` 발신/수신 connected | UI |
| W2 | 음성 → 영상 업그레이드 | UI + PATCH |
| W3 | route leave (채팅/커뮤니티) → floating dock | dock visible |
| W4 | tab hidden → dock, Agora 유지 | `web_tab_hidden_preserve_agora`, **no** `agora_join_start` |
| W5 | dock restore / end | expand + end patch |
| W6 | camera/mic permission | browser prompt + fallback |
| W7 | 10분 stability — no rejoin loop | logcat / console |

---

## 완료 판정

Phase 6 완료 = **Android + iOS + Web/Windows** 모두에서 동일 UX 언어로 video / dock / restore / end가 동작하고, G1~G5 회귀 PASS.
