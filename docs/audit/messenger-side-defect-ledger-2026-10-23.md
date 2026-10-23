# DIBAY 메신저·통화 — 별도 결함 대장 (2026-10-23)

- 기준 계획: `docs/audit/messenger-2026-10-22-reaudit-plan.md` (A~F)
- 진행 방침: `docs/audit/DIBAY_메신저_통화_기존계획_계속진행_및_별도결함관리_20261023.md`
- 규칙: 기존 §1·§2 ID와 중복이면 기존 ID에 증거만 추가. **신규만** 본 대장. 기존 A~F 완료 후 별도 처리 계획. **BLOCKING만** 현 단계에서 독립 처리.

상태: `NEW` / `EVIDENCE_NEEDED` / `CONFIRMED` / `DEFERRED` / `BLOCKING` / `APPROVED` / `FIXED` / `DEVICE_PASS` / `CLOSED`

---

## SIDE-01 — Android 음성 음소거 실기기 FAIL

| 필드 | 내용 |
|---|---|
| 발견일 | 2026-10-23 |
| 기기·빌드 | Samsung APK (보고). Android `1.2.4 (11)` 기준선 |
| 재현 증상 | 음성통화 중 음소거가 실제 작동하지 않음 (Owner) |
| 증거 | Owner 실기기 FAIL 보고. 코드상 `setMicMuted`→`muteLocalAudioStream` 존재 (WP-3 NEW-28) |
| 기존 계획 중복 | CALL-6은 **iOS chrome-only**. Android와 **별개**. 중복 아님 |
| 원인 | **미확정** (가설 A not_occupant / B Agora result≠0 / C API 0인데 상대 청각 유지). `updateChannelMediaOptions` **가설만으로 적용 금지** |
| 위험도 | 중 (통화 UX). 수신 불가급 아님 |
| 현 단계(A6 iOS) 차단 | **아니오** — A6 iOS와 커밋·빌드 분리. A6 필수 PASS를 가로막지 않음 |
| 보류 이유 | 로그·상대 청각으로 A/B/C 미확정. 기존 계획 완료 후 또는 Owner가 BLOCKING으로 승격 시 독립 핫픽스 |
| 처리 예정 | 기존 A~F 완료 후 별도 계획. 예외 시 독립 Android 단독 커밋 |
| 상태 | `EVIDENCE_NEEDED` |

다음 증거(수정 전 필수): logcat `native_voice_mic_mute_rejected` / `native_voice_mic_mute_applied` · callId vs occupant · 버튼 chrome · iPhone 상대 청각.

---

## SIDE-02 — 음성→영상 전환 버튼 없음

| 필드 | 내용 |
|---|---|
| 발견일 | 2026-10-23 |
| 기기·빌드 | Android / iOS 음성 UI |
| 재현 증상 | 통화 중 영상 전환 없음 |
| 증거 | Android `NativeVoiceCallActivity` NEW-27: video **GONE** until WP-10. iOS voice video button **disabled** |
| 기존 계획 중복 | 단계 E / WP-10 정책과 연결 가능. 즉시 구현 대상 아님 |
| 원인 | **의도적 미배선** (제품 보류) |
| 위험도 | 낮 (기능 미제공) |
| 현 단계 차단 | 아니오 |
| 보류 이유 | Owner WP-10/E 승인 전 구현 금지 |
| 처리 예정 | 단계 E 또는 별도 승인 후 |
| 상태 | `DEFERRED` |

---

## SIDE-03 — (예약) 진행 중 신규 UI·채팅·통화 결함

발생 시 본 표에 행 추가. 기존 계획 ID 대조 후 등록.
