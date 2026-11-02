# DIBAY 전체 스크롤 위치·탭 전환·뒤로가기 SSOT 감사 및 설계 (승인 요청)

2026-11-03 PHT · 감사·설계만 · 코드·DB·네이티브·배포 변경 없음 · 실기 조작 없음(Owner 「실기는 승인 대기」)
기준 코드: `origin/main` (내정보 스크롤 규칙 `694c27cb4` 포함). 증거 표기: **[측정]** Production 웹 실측 · **[실기]** 2026-11-03 00:29~00:47 PHT 실기 결과(이번 단계 이전, Owner 지시로 수행) · **[코드]** 파일:줄 · **NOT_PROVEN** 확인 못 함.

## 0. 질문에 대한 답 — 내정보에서 다른 화면 갔다 오면 위치가 남는 이유
- **의도된 동작이다(우연 아님).** `lib/mypage/mypage-scroll-memory.ts:52-72` 의 방문 순서 규칙이 「다른 도메인에 갔다가 같은 내정보 화면으로 돌아옴 = 복원」으로 판정한다(주석 :56-57). 2026-11-02 S4 에서 제가 넣은 규칙이다.
- 그러나 **다른 4개 탭은 같은 상황에서 맨 위로 간다** [측정 아래 §2.1] — 탭마다 다르게 동작하는 것이 결함이다. 권장 정책(§3)으로는 내정보 쪽이 맞고 나머지가 고쳐져야 한다.
- 내정보 규칙 자체의 허점 2개도 확인했다(§4 M-2, M-3).

## 1. 레거시·공식 기준
### 1.1 레거시 앱 (카카오톡·당근·배민)
- 8개 동작 전부 **NOT_PROVEN** — 이번 단계 실기 조작 금지. 공개 자료 조사 결과:
  - 당근: 웹뷰 프레임워크 Stackflow 가 "Stack screens and keep scrolling state" 기능을 가짐(https://github.com/daangn/stackflow) — **프레임워크 기능일 뿐 당근 앱 실제 동작은 NOT_PROVEN**.
  - 카카오톡·배민: 해당 동작을 설명한 공개 자료 없음.
- 실기 비교가 필요하면 Owner 승인 후 8개 동작 × 3앱 표로 별도 보고.

### 1.1-b 레거시 실기 (Owner 승인 2026-11-03 「아이폰은 미러링」, iPhone 미러링, 01:04~01:10 PHT)
| # | 동작 | 카카오톡 | 당근 | 배민 |
|---|---|---|---|---|
| 1 | 하단 탭 A→B→A (친구 스크롤 → 채팅 → 친구) | **위치 유지** (같은 항목, 접힌 헤더만 다시 펼쳐짐) | NOT_PROVEN | NOT_PROVEN (홈에서 할인 화면으로 들어가 미러링 뒤로가 안 됨) |
| 2 | 현재 탭 다시 누르기 | **맨 위** | NOT_PROVEN | NOT_PROVEN |
| 3 | 목록 → 상세 → 뒤로 (친구 목록 → 프로필 → 닫기) | **위치 유지** | NOT_PROVEN | NOT_PROVEN |
| 4 | 더보기 → 하위 화면(캘린더) → 닫기 | **위치 유지** | NOT_PROVEN | NOT_PROVEN |
| 5 | 내정보 → 다른 탭 → 내정보 | 1번과 같음(유지) | NOT_PROVEN | NOT_PROVEN |
| 6 | 검색 → 상세 → 뒤로 | NOT_PROVEN | NOT_PROVEN | NOT_PROVEN |
| 7 | 백그라운드 → 복귀 | **같은 탭·같은 위치** | NOT_PROVEN | NOT_PROVEN |
| 8 | 완전 종료 → 재실행 | **마지막 탭(더보기)으로 열림, 스크롤은 맨 위** | NOT_PROVEN | NOT_PROVEN |

- Owner 결정(2026-11-03): **레거시 기준 = 카카오톡 결과로 충분**. 당근·배민은 NOT_PROVEN 으로 두고 추가 측정하지 않음.
- 카카오톡과 권장 정책 대조: P1·P2·P3·P6 일치. P7 은 카카오톡이 「마지막 탭으로 열림(스크롤 맨 위)」, DIBAY 권장은 Owner 지시대로 「기본 초기 상태(시작 탭)」 — 현재 DIBAY 동작도 시작 탭이라 변경 없음.

### 1.1-c DIBAY iPhone 실기 (같은 조건, 앱 1.2(21), Production 671f1f4 이후)
| # | 동작 | 결과 |
|---|---|---|
| 1 | 커뮤니티 스크롤 → 거래 → 커뮤니티 | **맨 위** (카카오톡과 다름) |
| 1 | 내정보 스크롤 → 커뮤니티 → 내정보 | **위치 복원** (Owner 관찰과 같음) |
| 2 | 커뮤니티 다시 누르기 / 내정보 다시 누르기 | 맨 위 / 맨 위 |
| 3 | 커뮤니티 목록 → 글 → ‹ (2회) | 목록 복원 — 누른 글이 화면 가운데로 오는 방식이라 떠날 때 위치와 1~2카드 차이 |
| 7 | 백그라운드 → 복귀 | 같은 화면(계정·보안) |
| 8 | 완전 종료 → 재실행 | 시작 탭(커뮤니티) 맨 위 |
| — | 계정·보안 화면 스크롤 | 미러링 휠로 움직이지 않음 — Owner 손 조작 확인 대기 |
- 측정 중 하단 탭이 스크롤로 숨겨진 순간 탭을 눌러 **커뮤니티 글 2개가 열림(조회수 +1 씩, 작업자 실수)**.

### 1.2 공식 플랫폼 기준
| # | 동작 | 공식 기준 | 출처 |
|---|---|---|---|
| 1 | 하단 탭 A→B→A | 각 탭의 화면 스택·스크롤 유지 | Apple HIG Tab bars https://developer.apple.com/design/human-interface-guidelines/tab-bars · Android multi back stacks https://developer.android.com/guide/navigation/backstack/multi-back-stacks |
| 2 | 현재 탭 다시 누르기 | 맨 위로 (Material) / 탭 루트 표시 (UIKit 문서 "always display the root view") | https://www.mdui.org/en/design/1/components/bottom-navigation.html (M1 미러) · M3 원문 NOT_PROVEN · https://developer.apple.com/documentation/uikit/uitabbarcontroller |
| 3 | 목록→상세→뒤로 | 바로 전 화면, 스크롤 유지 | https://developer.android.com/guide/navigation/principles · https://developer.android.com/topic/libraries/architecture/saving-states |
| 4 | 내정보→설정→뒤로 | 스택 한 단계 pop, 상태 유지 | 위 principles |
| 5 | 내정보→다른 탭→내정보 | 1번과 같음(탭 스택 복원) | multi back stacks |
| 6 | 검색→상세→뒤로 | 검색어·결과·스크롤 유지 | saving-states (검색 화면 예시) |
| 7 | 백그라운드→복귀 | 보던 화면·스크롤 그대로 | saving-states |
| 8 | 완전 종료→재실행 | 시작 화면, 깨끗한 상태 | saving-states · principles |
| 웹 | Next.js App Router | 새 경로는 맨 위, 뒤로/앞으로는 위치 유지 | https://nextjs.org/docs/app/api-reference/components/link (현행 버전 동작 확인 필요) |

## 2. DIBAY 현재 동작 (전수)
### 2.1 하단 탭 A→B→A · 현재 탭 다시 누르기 [측정: Production, 476px, @aaaa, 2026-11-03 00:5x PHT]
| 탭 | A→B→A (떠날 때 → 돌아옴) | 다시 누르기 | 비고 |
|---|---|---|---|
| 커뮤니티 `/philife` | 600 → **0** | 600 → 0 | 주제·정렬은 유지(`lib/community/community-hub-state.ts:102-126`) |
| 거래 `/market` | 600 → **0** | 600 → 0 | 마지막 지역 URL 유지(`samarket:trade-list-return:v1`). 캐시 유무로 결과가 갈릴 수 있음 [코드] |
| 배달 `/stores` | 454 → **0** | 454 → 0 | |
| 채팅 | NOT_PROVEN (측정 스크립트가 목록 상자가 아닌 바깥을 잼) | NOT_PROVEN | 목록 상자 `[data-messenger-hub-list-scroll]` 은 셸 맨 위 이동 대상이 아님 → 다시 눌러도 목록이 맨 위로 안 감 [코드 `lib/ui/store-detail-scroll-root.ts:60-72`, `app/app-shell.css` lock] |
| 내정보 `/mypage` | NOT_PROVEN (측정 순간 화면 갱신 프레임 정지) · 코드상 **복원** | 400 → 0 | Owner 관찰(복원됨)과 코드 일치 |
- 원인 [코드]: 도메인이 바뀌면 셸이 무조건 맨 위로 보냄 `components/layout/ConditionalAppShell.tsx:189-201`(pathname 기준 — 뒤로가기로 도메인이 바뀔 때도 맨 위). 하단 탭 이동은 replace `lib/main-menu/main-bottom-nav-route-commit.ts:38-46`. 다시 누르기 `components/layout/BottomNav.tsx:817`.

### 2.2 화면별 저장·복원 구조 [코드]
| 도메인/화면 | 스크롤 소유 | 저장 | 뒤로/새 진입 구분 | 데이터 대기 |
|---|---|---|---|---|
| 커뮤니티 피드→글→뒤로 | 셸 본문 | 카드 누를 때 sessionStorage 60초 + 글 앵커(`lib/community/community-post-entry-nav.ts:22-25,138-173`) | **구분 없음**(href 같으면 복원) | 글 있을 때 최대 40회 |
| 커뮤니티 글 상세 | 셸 본문 | 없음 | — | 맨 위 시작 여부 NOT_PROVEN (`router.push(scroll:false)` `components/community/feed-list-layouts.tsx:309`) |
| 거래 목록·검색 결과 `/market?q=` | 셸 본문 | 카드 누를 때 120초(`lib/trade/location/trade-market-list-scroll-restore.ts:157-177`) | **구분 없음**(저장값 있으면 새 진입도 복원) | 즉시 1회+1프레임 — 높이 늦으면 잘림 |
| 거래 상세 | 셸 본문 | 없음 | — | 맨 위 시작 NOT_PROVEN |
| 배달 홈·browse·검색 | 셸 본문 (+browse 셸 메모리) | 45초(`lib/dibay/delivery-list-scroll-restore.ts:21-23`) + browse 셸 메모리(`components/delivery/presentation/DeliveryPresentationShell.tsx:258-263`) **이중** | popstate/pending 구분 | 홈은 데이터 안 기다림(`StoresHub.tsx:75`), 24프레임 |
| 채팅 목록→방→뒤로 | 목록 상자 | **없음** — 목록 다시 그려져 맨 위(모바일) | — | — |
| 채팅방 | 타임라인 | 방별 메모리 60초 | 계약 문서 따름 | — |
| 내정보 전체 `/mypage/**` | 셸 본문 | 30분 + 방문 순서(`lib/mypage/mypage-scroll-memory.ts`) | 방문 순서 | 높이 생길 때까지 최대 3초 |
| 내정보 `/my/**` 별칭 | 셸 본문 | **규칙 없음**(`app/(main)/my/layout.tsx` 에 미장착) | — | — |
| 알림함 | 셸 본문 | 별도 키(`lib/notifications/notification-center-scroll-restore.ts`) | 별도 | NOT_PROVEN |
- `history.scrollRestoration="manual"` 설정 4곳(거래·배달·내정보 2) — 실제 스크롤은 내부 본문이라 브라우저 기본 복원과는 겹치지 않음. 대신 **셸 맨 위 이동 ↔ 도메인별 복원이 같은 프레임에서 경쟁**.

### 2.3 실기 결과(내정보만) [실기]
- Android Xiaomi·Samsung, iPhone: 주문내역 내림→상세→뒤로 = 같은 위치 PASS, 새 진입 = 맨 위 PASS, 홈→분류→뒤로 = 홈 위치 PASS. 그 외 도메인 실기 NOT_PROVEN.

## 3. DIBAY 권장 정책 (Owner 지시 + 공식 기준)
| # | 상황 | 권장 동작 |
|---|---|---|
| P1 | 상세에서 뒤로 | 이전 위치 복원 |
| P2 | 하단 탭 전환 후 복귀 | 그 탭의 마지막 화면·조건·위치 복원 |
| P3 | 현재 탭 다시 누르기 | 그 탭 최상위 화면 + 맨 위 |
| P4 | 새 화면 진입(링크·카드) | 맨 위에서 시작 |
| P5 | 검색 결과에서 뒤로 | 검색 조건 + 위치 복원 |
| P6 | 백그라운드 → 복귀 | 그대로(웹뷰 유지) |
| P7 | 앱 완전 종료 → 재실행 | 기본 초기 상태 |
| P8 | 목록이 바뀐 경우 | 기억한 **항목(앵커)** 기준 복원, 항목이 없으면 가까운 위치, 그것도 불가하면 맨 위 — 좌표만 저장 금지 |

## 4. 화면별 차이·수정 필요
| ID | 화면 | 현재 | 권장 | 차이 | 수정 | 영향 범위 | 웹만 |
|---|---|---|---|---|---|---|---|
| T-1 | 커뮤니티·거래·배달 탭 복귀 | 맨 위 [측정] | P2 복원 | 다름 | 필요 | 셸 도메인 전환 맨 위(`ConditionalAppShell.tsx:189-201`) · 탭 이동 커밋 | 예 |
| T-2 | 채팅 탭 다시 누르기 | 목록 상자 맨 위 안 감 [코드] | P3 | 다름 | 필요 | 맨 위 이동 대상에 목록 상자 포함 | 예 |
| T-3 | 내정보 하위에서 탭 다시 누르기 | 홈 옛 위치 복원 [코드 §방문 순서] | P3 맨 위 | 다름 | 필요 | 다시 누르기 신호를 규칙에 전달 | 예 |
| L-1 | 채팅 목록→방→뒤로(모바일) | 맨 위 [코드] | P1 | 다름 | 필요 | 메신저 목록 상자 저장·복원 (방 화면·Realtime 계약 무관) | 예 |
| L-2 | 거래·커뮤니티 새 진입 | TTL 안이면 새 진입도 복원 [코드] | P4 | 다름 | 필요 | 뒤로/새 진입 판정 공용화 | 예 |
| L-3 | 거래 목록 복원 재시도 2회 | 늦은 높이에서 잘림 가능 [코드] | P1 | 위험 | 필요 | 공용 복원 루프(높이 대기) 사용 | 예 |
| L-4 | 커뮤니티·거래 상세 시작 위치 | NOT_PROVEN | P4 | 확인 필요 | 측정 후 | — | 예 |
| L-5 | 배달 browse 복원 이중 | 셸 메모리 + 저장소 [코드] | 1개 | 중복 | 필요 | `DeliveryPresentationShell`·`StoresBrowsePrimaryView` | 예 |
| M-1 | 내정보 탭 복귀 | 복원 | P2 | 같음 | 불필요 | — | — |
| M-2 | 내정보 B에서 링크로 A 새 진입 | 「돌아옴」 오판 [코드 `mypage-scroll-memory.ts:64-67`] | P4 | 다름 | 필요 | 판정 보완(아래 §5) | 예 |
| M-3 | `/my/**` | 규칙 없음 | P1/P4 | 다름 | 필요 | `app/(main)/my/layout.tsx` 장착 또는 리다이렉트 확인 | 예 |
| S-1 | 검색→상세→뒤로 (거래 `?q=`, 배달·통합검색) | 조건은 URL, 위치는 도메인별 | P5 | 일부 | 공용화로 해결 | 검색 화면 3곳 | 예 |
| A-1 | 백그라운드 복귀 | NOT_PROVEN | P6 | — | 실기 확인 후 | — | — |
| A-2 | 완전 종료→재실행 | NOT_PROVEN (sessionStorage 유지 여부) | P7 | — | 실기 확인 후 | — | — |
| D-1 | 죽은 코드 | `mypage-hub-scroll-restore.ts` 함수 3개 호출 0 · 거래 presentation session `scrollY` 쓰기만 [코드] | 정리 | — | 필요 | 해당 파일 | 예 |

## 5. 최종 통일안 (기존 구조 활용, 신규 시스템 없음)
1. **공용 규칙 1개로 승격**: 내정보에서 실기 PASS 한 `mypage-scroll-memory`(방문 순서 + 경로별 저장 + 높이 대기 복원 루프)를 `lib/navigation/` 공용 모듈로 옮겨 셸에 1번만 장착. 키 = 경로 + 정렬된 검색 조건(검색·필터 포함, P5).
2. **판정 3종을 명시 신호로**: ① 뒤로(브라우저·기기·헤더 ‹) ② 새 진입(링크 push — 방문 순서에 기록 길이(`history.length`)를 함께 저장해 M-2 오판 제거) ③ 하단 탭 이동/다시 누르기(BottomNav 가 이미 아는 사실을 규칙에 전달 — 다시 누르기 = 맨 위, 탭 복귀 = 그 탭 마지막 화면·위치).
3. **셸 「도메인 바뀌면 맨 위」 제거 → 위 규칙이 결정**: 경쟁(§2.2) 해소. 새 진입이면 규칙이 맨 위로 보냄.
4. **앵커 복원(P8)**: 목록 카드에 이미 있는 항목 id 를 `data-scroll-anchor` 로 표시하고, 저장 = {앵커 id, 앵커 상단 오프셋, 좌표(예비)}. 복원 = 앵커 우선, 없으면 좌표, 높이 부족이면 데이터/페이지 캐시 대기. 커뮤니티의 기존 앵커 방식을 공용으로.
5. **도메인별 4개 방식 제거**: 커뮤니티 pending·거래 120초·배달 45초·내정보 옛 함수 → 공용 규칙으로 교체. 채팅 목록 상자는 스크롤 소유자만 등록(L-1, T-2). 채팅방 타임라인은 기존 계약 유지(범위 밖).
6. **유지 시간 1종**: 세션 동안(앱 종료 시 초기화, P7 — 재실행 시 sessionStorage 초기화 여부 실기 확인 필요).

### 단계 (각 단계 끝에 화면 깨짐 없음)
| 단계 | 내용 | 완료 확인 |
|---|---|---|
| R1 | 공용 규칙 승격 + 내정보·`/my/**` 이전(M-2, M-3) | 내정보 실기 행렬 재확인 |
| R2 | 셸 맨 위 제거 + 하단 탭 신호(T-1, T-3, T-2) | 5개 탭 A→B→A·다시 누르기 |
| R3 | 거래·커뮤니티·배달·검색 이전 + 앵커(L-2, L-3, L-5, S-1, P8) | 도메인별 목록→상세→뒤로·새 진입 |
| R4 | 채팅 목록(L-1) · 죽은 코드(D-1) | 채팅 목록→방→뒤로 |
- 거래 목록은 `docs/trade-lightweight-design.md` §9 불변조건(단일 비행·prewarm 키·캐시 peek)을 건드리지 않음 — 스크롤만 교체.
- 채팅은 메신저 hard-lock 문서 범위 확인 후 목록 상자만.
- 전부 웹 수정(네이티브·DB 무관). 앱 재시작으로 반영.

## 6. 검증 계획 (승인 후)
- 코드: typecheck(build·test) · 관련 vitest · eslint · 도메인 `verify:*`.
- Production 웹: 5개 탭 × (A→B→A, 다시 누르기, 목록→상세→뒤로, 새 진입, 검색→상세→뒤로) — 측정 시 화면 갱신 프레임 동작 여부를 매번 기록(정지 시 NOT_PROVEN).
- 실기: Owner 승인 후 Android 2대 · iPhone 같은 행렬 + 백그라운드 복귀·완전 종료 재실행.

## 7. 이번 감사에서 확인 못 한 것
- 레거시 3앱 실제 동작 전부 · 채팅 탭 측정 · 내정보 탭 복귀 웹 측정(프레임 정지) · 커뮤니티/거래 상세 시작 위치 · 백그라운드/재실행 · M3 공식 원문.
