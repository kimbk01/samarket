# DIBAY 팝업 원장 (Overlay Inventory Ledger)

**기준 문서:** `docs/audit/dibay-popup-unification-audit-design-2026-11-02.md` (전수 감사 2차 · 최종 설계 · §3 통일 기준)
**갱신:** 2026-11-02 (팝업 SSOT T1~T4 · B · C 반영 후 다시 작성)

> 예전 원장(「110개 DONE · TODO 0」)은 공통 컴포넌트로 감쌌는지만 셌고, 안쪽의 크기·글자·버튼·색이 제각각인 것을 잡지 못했다.
> 이 원장은 **화면 규격(크기·글자·버튼·눌림·색·쌓임 순서)** 기준이다. 판정은 **코드 기준**이며, 실기(Android·iPhone·태블릿·다크모드) 판정은 각 단계 실기 확인 기록으로만 쓴다.

## 1. 단일 기준 (요약 — 상세는 기준 문서 §3)

| 항목 | 기준 | 정의 위치 |
|---|---|---|
| 종류 | 확인창 · 안내창 · 입력창 · 선택 시트 · 입력 시트 · 팝오버 메뉴 · 토스트/상단 배너 (7종) | `components/ui/dibay-overlay/*` |
| 크기 | 다이얼로그 320 · 시트 전폭(태블릿 가운데 512) · 팝오버 ≤280 · 토스트 ≤384 · 배너 ≤512 | `app/dibay-overlay.css` |
| 글자 | 20 · 18 · 16 · 14 · 12 (+ 버튼 15/600) · 제목·본문 keep-all + anywhere + pre-line | 〃 |
| 버튼 | 48 · 반경 12 · 주/보조/위험/글자 · 2개 가로(취소 왼쪽) · 3개+ 세로(주 버튼 위·취소 맨 아래) | `OverlayUi.btn.*`, `DibayOverlayButton` |
| 눌림 | 버튼형 = 진해짐 + 0.98 · 목록 행형 = 배경만 | `app/dibay-overlay.css` |
| 비활성 | 회색 바탕·회색 글자 (opacity 금지) | 〃 |
| 색 | `--overlay-*` (브랜드 #0B421A · 위험 #d45252 · 경고 `--overlay-warning`) — 다크모드에도 고정 | 〃 · `lib/ui/dibay-overlay-contract.ts` |
| 부품 | chip · selectCard · popover/popoverItem · banner · toast · captionDanger/captionWarning · icon-btn(44) | `OverlayUi` |
| 쌓임 순서 | 탭 1200 · FAB 1255 · 상단 배너 1270 · 통화 화면 1280 · 사장님 서랍 1290/1291 · 시트·다이얼로그 1300 · 중첩 1305 · Auth 1310 · 토스트 1320 | `lib/main-menu/bottom-nav-config.ts`, `lib/business/owner-overlay-layers.ts` |
| 토스트 | `DibayToast` 1종 · 3초 / 행동 버튼 5초 (`DIBAY_TOAST_MS`, `DIBAY_TOAST_ACTION_MS`) | `components/ui/dibay-overlay/DibayToast.tsx` |
| 문구 | 위험 행동 = 동사(「확인」 금지) · 질문 「~할까요?」 · 제목 1문장 · 서버 오류 = 「처리하지 못했어요」 + 원문 | `lib/i18n/catalog/popup-ssot-wording.ts` |

## 2. 반영 이력 (main · 웹만)

| 단계 | SHA | 내용 |
|---|---|---|
| T1 기준 | `91349921d` | 줄바꿈 · 눌림 2종 · 회색 비활성 · 버튼 15 · TS 색 = CSS 토큰 · 공용 부품 클래스 |
| T2 다이얼로그 | `081b85f3f` | `DibayDialog footer` · 직접 버튼 제거 · 로그인/온보딩 · 문구·CTA 표준 (신규 키 `popup_*`) |
| T3 시트 | `be5d808aa` | 시트 내용 통일 (사장님·거래·커뮤니티·내정보·상품권·매장·고객센터·메신저) · 페이지 공용 부품은 `surface="overlay"` 분기 |
| T4 자체 팝업 | `5491d1b10` | 자체 루트 팝업·드롭다운·배너 겉모양 · X 44 · T2 사장님 색 검사 결함 정정 |
| B | `ffc1e1094` | 쌓임 순서 · 사장님 팝업광고 뒤로가기 · `window.confirm` 0 · 토스트 1종 |
| C | (이 커밋) | 미사용 팝업 14개 삭제 · 옛 팝업 CSS/토큰 정리 · 이 원장 |

## 3. 분류별 현황 (코드 기준)

| 분류 | 대상 | 상태 |
|---|---|---|
| 중앙 다이얼로그 (컴포넌트) | 65 (미사용 4 삭제 후) | 기준 적용 |
| 사장님 확인창 `OwnerStoreAdminConfirmModal` 호출 | 33 | 기준 적용 |
| 명령형 `dibayConfirm/Alert/Prompt` | 74 호출 | 문구·tone 표준 적용 |
| 바텀시트·액션시트 (공통 직접) | 59 (미사용 5 삭제 후) | 기준 적용 |
| 래퍼 경유 시트 | 31 | 기준 적용 (루트 유지 · 클래스만) |
| 자체 루트 팝업 | 20 (통화 2 제외) | 겉모양 적용 (루트·위치 유지, z 는 B 에서 정리) |
| 드롭다운·팝오버 | 16 | 팝오버 모양 적용 |
| 상단 배너 | 수신 · 고객센터 답변 · 오프라인 | `OverlayUi.banner` / 경고색 |
| 토스트 | 13곳 | `DibayToast` 1종 |
| 브라우저 확인창 | 0 (공급자 미연결 대비 대체 경로만 `DibayAppDialogProvider`) | 완료 |

## 4. 예외 · 남은 것 (의도적으로 기준 밖 · 또는 Owner 결정)

| 항목 | 이유 |
|---|---|
| 통화 화면 (키패드 · HTTPS 안내 · 수신 배너 · 통화 안내 · 통화 기록 팝오버 `CallStubActionPopover` · 채팅방 ⋮ 통화 행 · 발신 확인창 · `MessengerCallLogDeleteConfirmDialog`(미사용) · `.incoming-call-popup*` CSS(미사용) · 네이티브 통화 안내) | 통화 변경 규정 — 별도 통화 작업에서만 |
| 광고 팝업 (`components/platform-popup/*`) | 범위 밖 |
| 메신저 「친구 추가」 가운데 팝업 폭 420 | 320 이면 받은 요청 행(수락·거절) 이름 칸 부족 |
| 채팅방 시트 하단 safe 문자열 | 채팅방 키보드 계약 K-01 우선 |
| 그룹 초대 카드 배경 없음 | 쌓이는 비차단 안내 카드 (배경 = 앱 전체 차단) |
| 알림함 딤 색 (`--delivery-backdrop`, 흐림 없음) | 기존 「흐림 금지」 규칙 |
| Cash 잔액 부족 팝업 두 버튼 같은 주소 | 분리할 주소 없음 — **Owner 결정 필요** (버튼 1개로 합칠지) |
| 고객센터 시트 폭 560 | 기준 512 와 다름 — 내용(대화) 폭 판단 필요 |
| 시트 손잡이(핸들) 없는 시트 (사진 저장 · 채팅방 · 매장 필터 · 메뉴 전체보기) | 구조 변경이라 미적용 |
| 유지한 미사용 후보 | `DibayBottomNotificationBanner`(정책 테스트·붙일 기능 가능) · `StoresHomeSearchModal`(테스트 3) · `StoresBrowseHeaderPrimaryTabs`(다른 세션 S3 테스트) · `CommunityShareTargetPicker`(타입 사용) |
| OS 소유 | 날짜·시간·`<select>` 목록, 권한창, CallKit, Android 시스템 Toast |

## 5. 새 팝업을 만들 때 (필수)

1. `components/ui/dibay-overlay/*` 컴포넌트를 쓴다. 자체 `fixed inset-0` 루트를 새로 만들지 않는다.
2. 버튼 = `DibayOverlayButton` / `actions` / `footer`. 팝업 안 `Sam.btn`·직접 bg 버튼 금지.
3. 글자·색·반경·비활성·눌림은 §1 표만. 오류 글자 = `OverlayUi.captionDanger`, 경고 = `captionWarning` (색 유틸리티는 overlay 텍스트 클래스에 진다).
4. 토스트는 `DibayToast` + `DIBAY_TOAST_MS`.
5. 문구는 §1 문구 표준. 새 문구는 새 키로 (기존 키 값 변경 금지).
6. 실기 확인 = Production SHA + 기기·화면 크기·다크모드 기록.
