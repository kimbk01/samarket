# 발신자 안내(무응답) 구현 보고 — 2026-10-23

- **[배포 구분] 웹만** — 앱 재시작만 (재빌드 불필요)
- **main / push:** `8f01621dc`
- 설계: `messenger-2026-10-23-stage-e-caller-notice-design.md` · Owner 승인 후 구현
- **범위:** notice event `no_answer` · i18n · V4 finalize 매핑 주석 · **SIDE-08/E-C3/네이티브 미포함**

## 변경

| 파일 | 내용 |
|---|---|
| `call-in-app-notice-contract.ts` | event/class `no_answer`/`NO_ANSWER` · BANNER spec |
| `call-in-app-notice-store.ts` | fallback 카피 |
| `community-messenger-ui.ts` | `cm_ui_call_no_answer` ko/en |
| `call-v4-actions.ts` | CALL-04 주석만 (이미 `finalize(..., "no_answer")`) |
| 계약 테스트 | silent → `no_answer` event · callee `missed` 분리 유지 |

## 불변

수신 missed · busy(E-C1) · 거절 · 발신 취소 무안내 · 스키마·VoIP/FCM/CallKit

## 검증 (add pre-gate)

| 게이트 | 결과 |
|---|---|
| eslint (변경 파일) | PASS |
| `typecheck:build` | PASS |
| vitest `call-in-app-notice-contract` | PASS (8) |
| `verify:i18n-key-exposure` | PASS |
| `npm run build` | SKIPPED (Vercel) |

## 실기기

| 시도 | tip | 결과 |
|---|---|---|
| 1 | `8f01621dc` Ready | session `f92e0c11`/`121add7e` **missed** PASS · 안내 배너 **FAIL** (Cap Android native-owned → web notice skip · sync finalize=`missed`) |
| 2 | (후속 fix tip) | native 해제 대기 + outgoing missed→`no_answer` 후 재검증 |

## 복구 수정 (실기기 FAIL 후)

- `mapCallV4RemoteTerminalReason`: outgoing + server `missed` → **`no_answer`**
- `finalizeCallV4Terminal`: `no_answer` 이고 nativeOwned면 셸 해제까지 대기 후 배너
