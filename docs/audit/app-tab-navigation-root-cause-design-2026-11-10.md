# 페이지 이동 느림·깜빡임 — 원인 확정·원인별 설계안 (2026-11-10 · 조사만 · 코드 변경 없음)

- 지시: Owner 「근본 대책이 아니다 … 정확한 원인을 다시 확인 … 끝까지 분석해서 설계안 보고」 (2026-11-10)
- 기준: origin/main `3bbcb5f79` · 운영 Production `a85e22a` · Next 16.1.7 · React 19.2.3
- 실기 조건: Xiaomi 24076RP19G(**태블릿**, 화면 1006×601 CSS px) · 스테이징 앱 `com.dibay.app.dev` 1.2.6(39) · 로그인 · 19:00~19:40 PHT · 기기 화면은 하단 탭 이동만(데이터 변경 없음). 계측 = 화면 녹화(adb screenrecord) + WebView DevTools(CPU 프로파일·트레이스·프레임별 DOM 확인).
- **Owner 휴대폰·운영 앱 기준 실기는 NOT_PROVEN.** 휴대폰 화면 폭(Samsung M15 등)에서는 별도 측정 안 함.

## 0. 이전 수정이 반복 실패한 이유 (작업자 잘못)
| 커밋 | 한 일 | 실제 원인과의 관계 |
|---|---|---|
| `aaa18c541` | 서버 HTML 첫 그림을 로딩 화면으로 | 셸 전체가 서버에서 안 그려지는 원인(§1-C)은 그대로 — 빈 화면을 회색 화면으로 바꿨을 뿐 |
| `041a5ff13` D-1 | 탭 순간 이전 화면 유지, 경로 확정 때 슬라이드 | 이전 화면이 경로 확정 순간 **사라지고** 새 화면이 흰 바탕 위로 밀려 들어오는 구조(§1-A)는 그대로 |
| `c399c7b23` | 탭 선택 표시 유지·진행 막대 | 표시만 바꿈 |
| 11-08 다국어 이관 3건 | 어드민 문구를 회원 공용 문구 파일에 추가 | 모든 화면 JS +1.4MB(§1-D) — **작업자가 만든 악화** |
모두 「보이는 증상」만 다뤘고 아래 A~G 원인은 손대지 않았다.

## 1. 확정 원인 (각 항목 FAIL)

### A. 탭 이동 = 이전 화면 즉시 삭제 + 새 화면이 흰 바탕 위로 0.44초 슬라이드 → 깜빡임
- 증거(프레임별 DOM 확인, 커뮤니티→홈): 누름 61ms → 192ms 까지 프레임 없음(메인 스레드 막힘) → **192~297ms 새 화면 전체가 화면 밖(translateX 1006px) = 하단 탭만 있는 흰 화면** → 297~648ms 오른쪽에서 밀려 들어옴 → 756ms 헤더 주소 표시.
- 녹화: 내정보·배달·채팅 이동 모두 흰 프레임 1~3장 후 표시. 배달 재방문도 헤더까지 없는 흰 프레임 1장.
- 코드: `components/route-transition/AppRouteTransition.tsx` `applyMainHubEnter`(from-rtl→enter-rtl) · `app/globals.css:821-830`(100% → 0, 440ms). 이전 화면은 Next 가 경로 확정 때 즉시 언마운트하므로 함께 밀려 나갈 화면이 없다.
- 「keep-alive」 이름(`resolveMainTabKeepAliveHub`)만 있고 **실제 유지는 없음** — 이동 후 DOM 의 허브 `<main>` 1개뿐(채팅→배달 후 확인).
- 당근·배민·카톡 하단 탭은 슬라이드 없이 즉시 전환(이전 탭 화면 유지).

### B. 허브 화면을 매번 새로 만들고 데이터를 처음부터 다시 받음 → 3~4단계로 채워지며 깜빡임
- 채팅 탭(재방문 포함): 누름 후 ~320ms 에 API 5~9건 동시 시작 — home-sync(450ms) · friends · friend-requests **2번** · trade-chat-list-meta(880ms) · presence · privacy-lists · hub-badge · ice-servers(통화용) · 알림음 설정. 목록 0.8~1.0초, 사진·배지는 그 뒤.
- 배달 탭 첫 방문: API 9건 — home-hero-banners 740ms · home-feed 900ms · store-orders 900ms · address-defaults 600ms · launch-state 480ms … 녹화: 「주소 확인 중」 빈 본문 → 녹색 띠 → 배너 사진 → 업종 아이콘 (2.2초에 안정). 재방문도 home-feed 750ms 재요청.
- `app/(main)/stores/page.tsx` 계약 「DO NOT: legacy SSR initial shell / category seed」 — 서버가 첫 데이터를 주지 않도록 정해져 있다.

### C. 앱 셸 전체(헤더·본문·하단 메뉴)가 서버에서 그려지지 않음 → 문서 시작 때 메뉴가 늦게 뜸
- 운영 `/market`·`/mypage`·`/community-messenger` HTML: 보이는 글자 30자, `<nav>` 0, `BAILOUT_TO_CLIENT_SIDE_RENDERING`.
- 원인 코드: `components/layout/MainAppHeaderStackWrap.tsx` — 헤더 메신저·거래내역 **패널** 래퍼 2개가 `next/dynamic({ssr:false})` 로 **셸 전체를 감쌈**(2026-05-27 도입). 두 청크를 차례로 받은 뒤에야 셸·메뉴가 그려진다.

### D. 모든 화면 첫 로딩 JS 약 7MB(전송 1.9MB) — 그중 3.6MB 가 ko·en 문구 전체
- 운영 `/market` 청크 58개 7,001KB · `/community-messenger` 66개 7,387KB. 문구 파일 키 62,714개 중 36,482개(58%) 어드민.
- 이 파일 하나 해석·실행: Xiaomi 501ms · Samsung M15 272ms (기기 측정).
- 문구 원본 2,950KB(11-08) → 4,372KB(현재). 문구가 바뀌면 파일 이름이 바뀌어 다시 받는다 — 오늘 main 커밋 77건 중 33건이 문구 변경.
- CSS 1개 685KB.

### E. 새 배포가 반영되면 켜 둔 앱은 다음 탭 누름에서 문서 전체를 다시 시작
- Next: RSC 응답 빌드 ID ≠ 현재 빌드 → 문서 이동 (`fetch-server-response.js:142`). Skew Protection 꺼짐(11-09)이라 반영 때마다 발생.
- 오늘 Xiaomi 에서 **2번 재현**: ① 5.3시간 켜 둔 문서 → 커뮤니티 탭 1회 → 이전 화면 1.4초 → 하단 메뉴 없는 흰 화면 3초+ → 표시(새 문서 HTML 1.37초·load 2.73초) ② 측정 중 다른 세션의 main 반영 → 탭 이동에서 문서 재시작.
- 운영 SHA 는 오늘 02:56~06:34 UTC 사이 6번 바뀜(스테이징 분리 전). 분리 후에는 Promote 때만 발생.
- C·D 때문에 재시작 1회 비용이 크다.

### F. 스크롤 구독이 화면 전체 DOM 변경마다 강제 스타일·레이아웃 계산 → 이동당 0.2~0.3초 멈춤
- CPU 프로파일 최상위 JS: `lib/ui/store-detail-scroll-root.ts` `overflowYAllowsScroll`(getComputedStyle) — 배달 이동 263·226ms, 채팅 이동 ~150ms.
- 호출 경로: `lib/layout/subscribe-app-shell-scroll.ts` — **`document.body` 전체 하위 MutationObserver** + ResizeObserver + 타이머 0·50·150·450ms → DOM 이 바뀔 때마다 `bindTargets(true)` → 캐시 무효화 → `getComputedStyle`·`scrollHeight`.
- 동시 구독처 8곳: rubber-band · 당김 새로고침 · 하단 탭 숨김 · FAB 부채꼴 · 배달 browse 크롬 2 · 배달 헤더 접힘 · (owner 변형). 같은 방식의 body 전체 관찰자 추가 4곳: `use-fixed-bottom-bar-occupied-px` · `AndroidPlayInAppUpdateHost` · `popup-launch-intro-gate` · `subscribe-owner-compact-shell-scroll`.
- 계측(채팅 이동 3초): getComputedStyle 390회 · getBoundingClientRect 361회.

### G. API 1건마다 기반 왕복 0.15~0.2초 — 화면당 호출 수가 많아 누적
- DB·인증 없는 `/api/app/web-version`: TLS 후 응답 150~230ms (Mac·필리핀 망) vs 정적 파일 45ms. 경로 = 필리핀 → Vercel 싱가포르(sin1, proxy) → 함수 뭄바이(bom1, `vercel.json regions`) ← Supabase ap-south-1(뭄바이).
- 서버 처리 자체는 짧음(운영 기록 25분: home-sync p50 140ms · hub-badge 45ms · profile 112ms). 예외: trade-chat-list-meta p50 417ms · p90 1,066ms.

### 작은 항목 (원인 순위 낮음)
- 하단 탭 이동 `router.push(href)` 에 `{scroll:false}` 없음(`components/layout/BottomNav.tsx:172-173`) → Next 가 형제 요소 355개 검사 후 맨 위 스크롤. 비용 약 10ms.
- 배달 이동 1회에 favicon 10번·앱 아이콘 3번 재요청(1회 관찰, 원인 NOT_PROVEN).

## 2. 원인별 설계안 (승인 전 구현 안 함)

| 순서 | 원인 | 설계 | 바뀌는 곳 | 영향·위험 | 같은 단계 처리 |
|---|---|---|---|---|---|
| 1 | A·B | **하단 탭 5개 허브를 실제로 유지**: `(main)` 레이아웃에 허브 5개 자리를 두고 React 19.2 `<Activity mode="visible/hidden">` 으로 보이기·숨기기. 허브 `page.tsx` 는 빈 자리. 탭 이동 = 즉시 전환(**슬라이드 없음**), 다시 오면 화면·스크롤·데이터 그대로 + 뒤에서 조용히 갱신. 한 번도 안 연 탭만 첫 로딩. | `app/(main)/layout` · 허브 5개 page · `AppRouteTransition` 허브 분기 삭제 · 하단 탭 이동 | 숨긴 탭의 실시간 구독·타이머는 Activity 가 효과를 정리(재방문 때 재구독) — 채팅 unread·통화 수신은 셸 쪽 구독이라 영향 없음 확인 필요. 메모리 증가(탭 5개 DOM). 스크롤 복원·뒤로가기·딥링크 계약 재확인. 통화 화면 경로 무변경. | 「허브→상세」 슬라이드는 유지(상세 화면은 대상 아님). keep-alive 이름만 있던 코드 정리. |
| 2 | C | 셸 서버 렌더: 패널 스택 2개를 **셸을 감싸지 않는 형제 오버레이**로 옮기고 헤더·하단 메뉴를 서버 HTML 에 그림. `MainShellDocumentLoading` 제거. | `MainAppHeaderStackWrap` · `(main)` 셸 트리 | 패널 열림 경로(헤더 메신저·거래내역) 동작 동일 확인. hydration 불일치 위험(로그인·언어별) → 서버가 아는 값만 그리기. | 첫 문서·배포 후 재시작(E) 모두 메뉴가 즉시 보임 |
| 3 | D | 문구 파일 분리: 어드민 문구는 `/admin` 에서만, 회원 문구는 도메인별 묶음(채팅·배달·거래·내정보…)으로 나눠 필요할 때 받음. | `lib/i18n/messages.ts` · `t()` 조회 | 아직 안 받은 문구 키 표시 공백 방지(받기 전 대기 계약). `check:i18n-quality` 유지. | 문구 바뀐 도메인 파일만 다시 받음 |
| 4 | F | 스크롤 구독 단일화: 문서당 관찰자 1개, body 전체 MutationObserver 제거, 스크롤 대상은 경로 확정 때 1회 결정·캐시. 다른 body 관찰자 4곳도 범위를 해당 요소로 좁힘. | `subscribe-app-shell-scroll.ts` · `store-detail-scroll-root.ts` · 위 4곳 | 늦게 붙는 스크롤 영역(배달 상세) 누락 위험 → 경로 확정·허브 표시 시점 1회 재결정으로 대체 | — |
| 5 | B·G | 허브당 첫 데이터 1회: 채팅·배달 허브의 동시 5~9건을 허브 묶음 1건(또는 서버가 첫 데이터 동봉)으로. 목록에서 통화용 ice-servers·중복 friend-requests 제거. trade-chat-list-meta 느린 쿼리 원인 조사. | 채팅·배달 허브 데이터 계층·API | 거래 목록 불변조건(`docs/trade-lightweight-design.md` §9)·메신저 실시간 계약 준수 | — |
| 6 | E | **결정: Skew Protection 꺼진 상태 유지.** 켜면 새 배포 후 탭 누름 재시작은 없어지지만, Vercel 이 모든 JS·CSS 주소에 배포 번호(`?dpl`)를 붙여 배포마다 1.9MB 를 전부 다시 받게 함(11-09 실측 Android 시작 8.1초 vs 2.1초). 대신 Promote 를 정해진 시간에 묶어 반영(재시작이 그 직후 1회로 한정) + 2·3번으로 재시작 1회 비용 자체를 줄임. | 운영 절차 | — | — |
| 7 | G | **결정: DB·서버 지역 현행 유지(뭄바이).** 실측 왕복(필리핀 망 TCP 연결): 뭄바이 약 90ms · 싱가포르 약 40ms → 이전해도 API 1건당 약 0.05초. 1번(재방문 요청 0건)·5번(탭당 첫 요청 1건) 후에는 탭 첫 방문 1회당 약 0.05초 차이뿐인데, 이전은 새 프로젝트로 DB·로그인 계정·저장 파일·실시간·예약 작업 전부를 옮기고 중단 시간이 생김. 함께 할 것: proxy(싱가포르)가 회원 화면 요청마다 뭄바이 DB 를 1번 읽는 가입 확인(`lib/auth/proxy-signup-gate.ts`)을 5번에서 캐시로 줄임. | proxy 가입 확인 | 가입 미완료 판정 지연 → 캐시는 사용자 단위·짧은 시간, 가입 완료 시 즉시 무효화 | — |

### 판정 방법 (승인 시, 같은 기기·계정·SHA 고정)
- 하단 탭 이동: 누름→새 화면 완성 시간, 흰 프레임 0장(녹화 30fps), 이동당 메인 스레드 막힘(longtask 합).
- 재방문: API 요청 0건으로 즉시 표시.
- 문서 시작: 서버 HTML 에 하단 메뉴 존재, 첫 그림·메뉴 표시 시각(진입 기록 `[dibay-entry]`).
- 휴대폰(Samsung M15)·iPhone·Owner 기기 각각 측정. 측정 안 한 항목은 NOT_PROVEN.

## 3. 확인 못 한 것 (NOT_PROVEN)
- 휴대폰 폭 화면·iPhone·Owner 기기 측정.
- 로그인 상태 운영 서버 RSC 응답 시간.
- favicon 반복 요청 원인, 메신저 방 bootstrap 이 25분에 방별 12~22회 호출된 출처(여러 기기 합산일 수 있음).
- trade-chat-list-meta 느린 원인(쿼리 단위).
