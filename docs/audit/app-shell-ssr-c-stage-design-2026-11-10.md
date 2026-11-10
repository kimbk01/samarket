# C 단계 — 앱 셸(헤더·하단 메뉴) 서버 렌더링 설계 (2026-11-10 · 승인 전 · 구현 없음)

## 1. 확정 사실
- 원인 코드: `components/layout/MainAppHeaderStackWrap.tsx` — 헤더 메신저·거래내역 **패널** 래퍼 2개를 `next/dynamic({ ssr:false })` 로 불러 **셸 전체(헤더·본문·하단 메뉴)를 감쌈**. 서버 HTML 에는 `MainShellDocumentLoading`(회색 줄)만 있고 메뉴·헤더 0. 도입 커밋 `6c29bdd92`(2026-05-27, 메시지 「수정」, 이유 기록 없음).
- 두 래퍼 자체는 서버에서 그려도 안전(열림 상태 false 시작, 패널 포털은 마운트 후) — 무거운 패널 본문은 안쪽에서 따로 `ssr:false` 로 지연 로드.
- 영향 받는 순간: 앱이 켜진 채 문서가 다시 시작될 때(doc_reset — Promote 직후 첫 탭 이동, iOS 복귀 새로고침 등, 운영 약 21시간 53건)와 웹 브라우저. 운영 기록: HTML 해석 → 셸(메뉴) 표시 **Android p50 1.34초·p90 3.34초, iOS p50 0.56초·p90 0.88초** 동안 메뉴 없는 회색 화면.
- 앱 콜드 시작은 OS 시작 화면이 웹 준비 신호까지 덮으므로(H1) 이번 변경으로 보이는 차이 없음.

## 2. 기존 수정이 실패한 이유
- `aaa18c541` 은 빈 화면을 회색 줄 화면으로 바꿨을 뿐, 셸이 서버에서 안 그려지는 원인(ssr:false 래퍼)은 그대로 두었다.

## 3. 변경 범위 (최소)
| # | 파일 | 변경 |
|---|---|---|
| C1 | `components/layout/MainAppHeaderStackWrap.tsx` | 래퍼 2개 `dynamic(ssr:false)` → 일반 import (트리 구조·패널 지연 로드 그대로) |
| C2 | `components/layout/ConditionalAppShell.tsx` | 페이지 본문(`children`)만 **hydration 이후** 그리는 문(gate): 서버·hydration 첫 렌더는 기존 회색 줄 본문, 직후 본문. 이후 화면 이동에서는 문 열린 상태 유지 → 페이지 298개의 서버 렌더는 이번에 켜지 않음 |
| C3 | `components/layout/BottomNav.tsx` + `lib/main-menu/main-bottom-nav-tab-emphasis.ts` · `main-bottom-nav-split-layout.ts` | 렌더 중 sessionStorage 읽는 탭 주소·활성 판정(커뮤니티 마지막 주제, 채팅 진입 출처, 내정보 출처)을 hydration 뒤로 — 서버·첫 렌더는 기본 주소 (조사: React 19 는 속성 불일치를 고치지 않아 `<a href>` 가 서버 값으로 남음) |
| C4 | `components/app/AppBootProvider.tsx`(서버 스냅샷) · `lib/business/use-owner-admin-url-search-params.ts` | 서버 스냅샷을 「클라이언트 현재값」 대신 초기 상수로 (불일치 방지) |
| C5 | `app/app-bottom-nav.css` + 셸 hydration 표식 | hydration 전에는 하단 메뉴 누름 막음(눌러도 문서 전체 이동이 다시 나가지 않게) — 보이기만 먼저 |
| C6 | `components/layout/__tests__/main-shell-document-first-paint.test.tsx` 등 | 「셸 HTML 에 메뉴·헤더 있음」 계약으로 갱신 + C3·C4 테스트 |

제외: 페이지 본문 서버 렌더, 스플래시(H1) 해제 조건, 번들 크기(D), 데이터·API(B·G), 통화·인증·푸시·네이티브.

## 4. 변경 전후 예상 (구현 후 실측 필요)
- doc_reset·웹: HTML 첫 그림부터 헤더·하단 메뉴 보임(지금은 위 1.34초·0.56초 뒤). 본문은 지금처럼 JS 실행 후.
- **누를 수 있게 되는 시점(상호작용)은 변하지 않음** — JS 7MB 해석이 원인(D 단계).
- 앱 콜드 시작: 변화 없음.

## 5. 남는 문제·위험
- hydration 불일치가 남으면 React 가 셸을 클라이언트에서 다시 그림 → 오히려 한 번 깜빡임. 판정 기준 0건.
- 태블릿·PC 폭 메신저 화면(≥768): hydration 직후 헤더·하단 메뉴가 사라지는 기존 분할 화면 규칙 때문에 한 번 바뀜(기록만, 이번에 고치지 않음). PC 웹은 하단 메뉴 → 왼쪽 레일로 한 번 바뀜.
- `/philife`·`/market`·`/stores` 는 하단 메뉴를 body 로 옮기는 기존 동작 때문에 hydration 직후 메뉴가 한 번 다시 만들어짐(측정 후 기록).
- 서버 HTML 생성 비용·크기 증가(측정해 보고).

## 6. 회귀 검증·판정
- PASS(모두): ① 허브 6개 서버 HTML 에 하단 메뉴 5개·헤더 존재 ② hydration 오류 0 — Samsung·Xiaomi·PC 폭, 한국어·영어, 회원·비회원, 각 5회 새로고침 ③ 문서 다시 시작 10회/기기: 하단 메뉴가 보이는 첫 프레임이 변경 전보다 빠름(수치 기록) ④ 진입 기록 shellReady·release 악화 없음(p50 +50ms 이내) ⑤ hydration 전 메뉴 누름이 문서 이동을 만들지 않음 ⑥ A 단계 탭 이동·뒤로가기, 헤더 메신저·거래내역 패널, 채팅방 진입, 허브 6개 표시 회귀 없음.
- FAIL: 하나라도 어긋나면. 미측정 항목은 NOT_PROVEN(iOS·수신 배너).
