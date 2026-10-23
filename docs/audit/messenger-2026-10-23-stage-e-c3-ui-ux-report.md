# E-C3 UI·UX·CTA 보완 보고 (웹 · 2026-10-23 ~23:05 PHT)

- 범위: 중앙 안내 디자인·사용성만 · main/Prod **보류** · 네이티브 미변경
- 코드 테스트 PASS ≠ UI 완성/기기 동일성 PASS

## 1. DIBAY 디자인 SSOT · 적용 값

| 항목 | SSOT | 적용 |
|---|---|---|
| 로고 | `DIBAY_LOGO_MARK_PATH` (`public/images/brand/dibay-logo-mark.png`) | 팝업 상단 mark 44px |
| 브랜드 그린(앱) | `--dibay-green` / `--sam-primary` `#0B421A` | 제품 토큰 유지 |
| Overlay primary(CTA) | `--overlay-primary` `#085C3F` · active `#084732` | 「확인」 버튼 |
| 표면·본문 | `#FFFFFF` / `#111111` / `#666666` · border `#E5E7E8` | light lock CSS |
| 타이포 | Overlay title1 20/700/1.4 · body 16/400/1.6 | DibayDialog |
| 버튼 | h 48 · press scale 0.98 · primary white on green | OverlayUi.btn.primary |
| 다크모드 | 제품 없음 | `color-scheme: light` + overlay 변수 강제 (E-C3 패널만) |
| 공통 InfoDialog | 기존 유지 | **시각/API 변경 없음** · E-C3는 `DibayDialog`+동일 Overlay SSOT |

## 2. 결함 → 수정

| 결함 | 수정 |
|---|---|
| 제목=본문 한 줄만 (구분 없음) | title/body 분리 · 5 title i18n 키 |
| 로고·아이콘 없음 | logo mark + tone 아이콘 |
| OS 다크에 반전 위험 | E-C3 scoped light lock |
| 공통 다이얼로그 전역 변경 위험 | DibayInfoDialog 미수정 |

## 3. 5이벤트 UI·문구 (코드 계약)

| 이벤트 | 제목(ko) | 본문 키 | tone |
|---|---|---|---|
| no_answer | 응답하지 않음 | cm_ui_call_no_answer | info |
| peer_busy | 상대방 통화 중 | cm_ui_call_peer_busy | attention |
| caller_busy | 발신자 통화 중 | cm_ui_call_caller_busy | attention |
| call_failed | 통화 연결 실패 | cm_ui_call_start_failed | failure |
| peer_declined | 상대방이 통화를 거절함 | cm_ui_peer_declined_call | attention |

CTA: 「확인」 only. 실기기 렌더·ko/en 줄바꿈 = **NOT_PROVEN**.

## 4. 기기별

| 기기 | 결과 |
|---|---|
| 삼성 APK/WebView | **NOT_PROVEN** |
| Xiaomi 태블릿/WebView | **NOT_PROVEN** |
| iPhone WebView | **NOT_PROVEN** |

로컬: eslint PASS · vitest 11 PASS · typecheck PASS. 실기기 미실시.

## 5. 웹 동일성 vs 네이티브 잔여

- **웹/WebView:** 동일 이벤트 → 동일 로고·색·문구·확인 CTA·동작(코드 경로 단일).
- **네이티브 Activity/VC 상단 overlay:** **미변경** · 웹과 동일하다고 보고하지 않음. 패리티 필요 시 별도 승인(B).

## 6. 배포

**main·Production 승인 아직 불필요 요청 안 함** — UI 실기기 검증 전 보류.
