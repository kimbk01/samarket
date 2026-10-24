# E-C2-B Phase A — 정리 보고 (코드 반영 · 실기기 미완료 보존)

- 확정: 2026-10-23 ~22:40 PHT
- 커밋: `bcad9b4b7` → **main 반영**
- **Owner 종료 (2026-10-23 ~23:42 PHT):** Phase A **코드 작업 종료 승인** · e2e **NOT_PROVEN** · 릴리스 **NOT APPROVED** · 강제 네트워크/실패 유발 **금지** · `stage-e-c2-b-next-judgment.md`
- **본 종료 ≠** 실제 실패 경로 PASS · **≠** 일반 사용자 앱 반영

## 판정 (Owner 최종)

| 계층 | 판정 |
|---|---|
| CODE | **PASS** |
| Negative device test (`force_join` ≠ Phase A) | **PASS** |
| `token_fetch_failed` end-to-end | **NOT_PROVEN** (유지 · 추가 테스트 중단) |
| 정상 통화 회귀 | **NOT_PROVEN** |
| Native release (릴리스 빌드·테스터 배포) | **NOT APPROVED** (보류) |
| Phase A 코드 트랙 | **종료 · Owner 승인** |

## main

- SHA: `bcad9b4b7aba8f368edfe6bb446c2573a59cea93`
- 포함: 승인된 Android Voice 7파일만
- 웹 Production 별도 배포: 불필요 (네이티브 전용 변경)
- 릴리스 AAB/APK · version bump · Play: **미실행**
- Native release: **NOT APPROVED** · CLOSED/실기기 PASS 선언 없음

## 단위 테스트

`NativeVoiceCallFailPhaseATest` (7) · `NativeVoiceOutgoingFailClientEndedReasonTest` (2) · `NativeVoiceCallTerminalCleanupTest` (10) · `NativeVoiceCallMissedProposerTest` (1) → failures=0

## 실기기 요약

- Negative: session `8c3d63ab-…` · reason `agora forced_test_join_failure` · `clientEndedReason` 빈 값 · DB `cancelled`/`canceled` · end_patch 1회
- 잔류 `fd4be967-…`: 이미 `ended`/`ended_by_callee` (읽기 확인 · 조작 없음)
- token_fetch / 회귀: 기존 실기기 훅 없음 · 확대 금지 → **NOT_PROVEN** 유지

## 삼성 S 정상본 복구

| 사실 | |
|---|---|
| 현재 S | debug APK · `DEBUGGABLE` · 1.2.4 (11) · 서명 `b8584fc4` |
| X 정상본 | `DEBUGGABLE` 없음 · 1.2.4 (11) · **서명 다름** (`f1cdfabf`) → S에 `-r` 불가 |
| 워크스페이스 | 동일 서명·비디버그·1.2.4(11) 복구 APK **없음** |
| 데이터 보존 | 서명 불일치 시 uninstall 필요 → **로그인/앱 데이터 삭제 위험** |
| 조치 | **임의 복구·uninstall 하지 않음** · Owner가 복구 APK 제공 또는 데이터 삭제 승인 후 Play/아티팩트 재설치 |

Xiaomi X: **미변경**.
