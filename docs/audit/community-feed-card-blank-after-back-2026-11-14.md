# FEED 글 카드 빈칸 (글 열고 돌아오면 그 카드가 사라짐) — 원인·발생 경우 전수·설계안

- 작성: 2026-11-14 PHT · 지시: Owner 「정보 공유 게시판 빈공간 원인 확인 · 여러 발생 경우 정확히 리스트 · 땜빵 금지 정확한 설계안」
- 상태: 분석·설계 → Owner 「설계안대로 수정」(2026-11-14) → §4 구현 (PR `fix/community-card-fade-release`)
- 판정: **FAIL (재현됨)**

## 0. 측정 조건

| 항목 | 값 |
|---|---|
| 주소 | 운영 `https://samarket.vercel.app` |
| Production SHA | **확인 못 함** (NOT_PROVEN). 다만 측정 시각 전후 main 후보 `ed7f067ac`·`a87e709d5` 사이에 결함 관련 4파일(`feed-list-layouts.tsx`·`community-post-entry-nav.ts`·`community-design-tokens.css`·`HubRetentionStack.tsx`) 변경 0줄 → 결과는 두 SHA 모두 같음 |
| 화면 확인 | iPhone 17e 시뮬레이터 Safari(390pt, iOS 26.5, 로그인) 05:00~05:02 PHT · 캡처 판정 |
| DOM 측정 | 앱 내 브라우저(Chromium, 393×852, 로그인) 05:10~05:25 PHT · 카드 클래스·`pointer-events`·`opacity`·애니메이션 이름 직접 조회 |
| 실제 iPhone 앱·Android 실기 | **NOT_PROVEN** (안 함) |

## 1. 원인 (확인됨)

1. 글 카드를 누르면 `beginCommunityPostEntryFromCard` (`lib/community/community-post-entry-nav.ts:243~250`) 가 그 카드 `<article>` 에 **DOM 으로 직접** `community-post-source-fade-out` 클래스를 붙이고 140ms 뒤 상세로 이동한다.
2. 이 클래스 (`lib/community/community-design-tokens.css:102`) = 140ms 동안 투명해지고 **끝난 상태 유지**(`animation … both` → opacity 0) + **터치 막음**(`pointer-events: none`).
3. **이 클래스를 떼는 코드가 저장소 어디에도 없다** (전체 검색 0건). 2026-09-15 `2845d6431` 부터 그랬다.
4. 2026-11-11 D1 「허브 화면 보관대」(PR #146, `3b41bb05b` 21:59 PHT 병합, `components/layout/HubRetentionStack.tsx`) 이전에는 상세로 가면 피드 화면이 통째로 버려져 클래스도 함께 없어졌다.
   D1 부터 HOME·LOUNGE·MARKET·DIPICK·MY 허브는 React `Activity hidden`(display:none)으로 **DOM 째 보관**된다 → 돌아오면 그 카드가 다시 보이면서 애니메이션이 처음부터 다시 돌고 투명(0)으로 끝난다.
5. 즉 **React 가 모르는 DOM 직접 변경(클래스)** 은 React 상태처럼 정리되지 않는데, D1 설계서(`docs/audit/d1-hub-screen-retention-design-2026-11-11.md` 위험 표)에 이 종류가 빠져 있었다.
6. D1 이전에는 결함이 없었다는 판단은 **코드 근거만**이다 (D1 이전 버전 실기 비교 안 함 — NOT_PROVEN).

증거 (DOM, 운영): 첫 카드 열기 → 뒤로 후 그 카드만 `fade-out 클래스 = true`, `pointer-events = none`, `animationName = community-post-source-fade-out`, `opacity = 0`. 다른 카드는 `false / auto / 1`.
증거 (화면, iPhone Safari): 글 → 공유 → 공유창 닫기 → 뒤로 = 그 자리 카드 1칸 빈칸. 이어서 다른 글 → 뒤로 = 두 칸 빈칸.

## 2. 발생 경우 전수표

### 2-1. 어디서 누른 카드인가 (이 카드를 그리는 화면 = `CardShell` 사용처 전부)

| # | 화면 | 사용 경로 | 보관 허브? | 결과 | 증거 |
|---|---|---|---|---|---|
| A1 | LOUNGE FEED 최신순·인기순 일반 목록 | `CommunityFeed` → `CommunityCard` → `CardShell` | 예 (community) | **FAIL** 빈칸·안 눌림 | iPhone 화면 + DOM |
| A2 | LOUNGE 주제(필리핀생활 등)·동네 목록 | 같은 목록 | 예 | **FAIL** (같은 코드·같은 목록, 주제 탭에서 연 뒤 돌아오는 경우는 측정 안 함 → 코드 근거) | 코드 |
| A3 | LOUNGE 위 고정(운영 고정 글)·상위노출 글 | 같은 `CommunityCard` | 예 | **FAIL** (코드 근거, 측정 안 함 — 현재 운영에 해당 글 없음 확인 안 함) | 코드 |
| A4 | `/community` (같은 화면 별칭) | `CommunityHomeSurface` | 예 | **FAIL** (코드 근거) | 코드 |
| B1 | HOME 「교민 이야기」 | `HomePostsSection` → `CommunityCard` | 예 (home) | **FAIL** | DOM (3번째 글 → 뒤로 → 그 카드만 클래스·눌림 막힘) |
| C1 | 통합 검색 결과 글 | `GlobalSearchView` → `CommunityPostCard` → `CardShell` | 아니오 | 정상 — 검색은 보관되지 않아 돌아오면 새로 그림. 또 `[data-community-ui]` 밖이라 효과 CSS 자체가 안 걸림 | DOM |

### 2-2. 어떻게 돌아왔나 (상세에서 나가는 경로)

| # | 돌아오는 경로 | 결과 | 증거 |
|---|---|---|---|
| R1 | 상세 머리글 「‹ 피드로」 | **FAIL** | DOM |
| R2 | 브라우저 뒤로 / iPhone 밀어서 뒤로 / Android 뒤로 (history back) | **FAIL** | DOM (history.back) · iPhone 화면(Safari 뒤로 버튼). 기기 제스처 실기는 NOT_PROVEN |
| R3 | 하단 탭 LOUNGE / HOME 누르기 | **FAIL** | DOM (LOUNGE 탭 실제 클릭) |
| R4 | 공유 → 공유창 닫기 → 뒤로 (Owner 경로) | **FAIL** — 공유와 무관, 공유 없이도 같음 | iPhone 화면 |
| R5 | 상세에서 다른 곳(채팅 등)으로 간 뒤 나중에 LOUNGE 로 | **FAIL** (보관 DOM 이 그대로라 코드상 같음, 측정 안 함) | 코드 |

### 2-3. 돌아온 뒤 계속 남는가 / 언제 풀리나

| # | 그 뒤 동작 | 결과 | 증거 |
|---|---|---|---|
| S1 | 몇 초 기다림 | 남음 | iPhone 화면 (5초 뒤 재캡처) |
| S2 | FEED → MARKET → FEED | 남음 | DOM |
| S3 | 하단 HOME → LOUNGE | 남음 | DOM |
| S4 | 다른 글을 또 열고 돌아옴 | 빈칸이 하나씩 **늘어남** | iPhone 화면 (2칸) |
| S5 | 빈칸 자리를 누름 | **반응 없음** (`pointer-events: none`) — 그 글을 다시 열 수 없음 | DOM |
| X1 | 최신순 ↔ 인기순 바꾸기 | 풀림 (목록을 새로 그림) | DOM |
| X2 | 주제 탭 바꾸기 | 풀림 (주제 패널 새로 마운트) | DOM |
| X3 | 새로고침·앱 재시작 | 풀림 | DOM (새로고침) |
| X4 | 계정 바뀜 (로그아웃·다른 계정) | 풀림 (보관대 비움, `accountGeneration`) | 코드 |
| X5 | 기기 「동작 줄이기」 켬 | **처음부터 안 생김** (클래스를 붙이지 않음, `prefersCommunityReducedMotion`) | 코드 |

## 3. 같은 구조 전수 확인 (보관 허브 안 DOM 직접 변경)

저장소 전체에서 `classList.add/toggle`·`style.opacity/visibility/display/transform/pointerEvents/animation =`·`setAttribute("data-…")` 를 검색(관리자 화면 제외)해 보관 허브 목록 안 요소에 남는 것을 골랐다.

| 위치 | 하는 일 | 떼는 코드 | 판정 |
|---|---|---|---|
| `lib/community/community-post-entry-nav.ts:249` 글 카드 사라짐 | 클래스 추가 | **없음** | **이 결함** |
| `components/stores/home/hub/StoresHomeSubCategoryPanel.tsx:75` 업종 칩 눌림 | 클래스 추가 | 손 뗌·취소·벗어남·클릭 때 제거 | 남지 않음 (코드) |
| `components/stores/browse/StoresBrowseHeaderSubTopicChips.tsx:109·130` | 클래스 추가 | 일부 없음 | **어디서도 쓰지 않는 파일** (사용처 0) → 영향 없음 |
| `lib/navigation/main-shell-push-session.ts:125·156` 화면 이동 연출 | 클래스 추가 | 연출 끝·시간 초과 때 제거 | 남지 않음 (코드) |
| `components/trade/TradeMarketProductCompositionHost.tsx` 거래 상세 연출 | 상세 화면 요소 속성 | 목록 카드는 건드리지 않음 | 해당 없음 (코드) |
| `components/route-transition/AppRouteTransition.tsx` | 연출 틀 속성·클래스 | 연출마다 다시 씀 | 목록 카드 아님 |
| 그 밖 (통화·메신저·바텀시트·스와이프 패널) | 보관 허브 목록 카드 아님 | — | 해당 없음 |

화면 측정 (운영, 앱 내 브라우저, 「열기 → 뒤로」 뒤 화면 안의 투명·숨김·눌림 막힌 큰 요소 자동 검사 — LOUNGE 결함을 잡는 것으로 검사기 자체 확인):

| 허브 | 결과 |
|---|---|
| LOUNGE 글 | **잡힘** (`ARTICLE`, opacity 0, pointer-events none) |
| HOME 교민 이야기 글 | **잡힘** (클래스·눌림 막힘) |
| MARKET 상품 → 상세 → 뒤로 | 0건 |
| MY 메뉴(고객센터) → 뒤로 | 0건 |
| DIPICK 매장 | **NOT_PROVEN** — 측정 계정에 배달 주소가 없어 매장 카드가 안 나옴. 코드 검색상 매장 카드에 직접 숨김 없음 |

## 4. 설계안

### 4-1. 원칙
카드에 직접 붙인 「사라짐」 효과의 수명 = **그 카드가 화면에 보이는 동안**. 붙인 쪽(카드 틀 `CardShell`)이 떼는 것까지 책임진다.
허브가 숨겨질 때(Activity hidden)·카드가 없어질 때 React 가 정리 단계를 반드시 실행하므로, 그 단계에서 뗀다.

근거 (React 19.2.3, Next 동봉 `react-dom-client.production.js` `recursivelyTraverseDisappearLayoutEffects`): Activity 가 숨겨질 때 그 안의 **레이아웃 효과 정리(`useLayoutEffect` cleanup)를 실행하고 ref 를 떼어 낸다**(`safelyDetachRef`). 따라서
- 숨겨지는 순간(화면은 이미 display:none) 클래스가 떨어진다 → 돌아올 때 깨끗한 카드, 깜빡임 없음.
- 숨김 중 ref 가 null 이 되므로, 떼는 대상은 정리 시점에 ref 를 읽지 말고 **효과 시작 때 잡아 둔 요소**로 한다.

### 4-2. 바꾸는 파일

| 파일 | 변경 |
|---|---|
| `lib/community/community-post-entry-nav.ts` | `releaseCommunityPostSourceFade(el)` 추가 — 클래스 제거 한 곳 정의. 클래스 이름·붙이기·떼기를 이 파일 하나가 가진다 |
| `components/community/feed-list-layouts.tsx` `CardShell` | `useLayoutEffect(() => { const el = articleRef.current; return () => { if (el) releaseCommunityPostSourceFade(el); }; }, [])` |
| `lib/community/__tests__/…` (새 시험) | jsdom 에서 `<Activity>` 안 `CardShell` 렌더 → 클릭으로 클래스 붙음 → `hidden` 전환 시 클래스 없음 → `visible` 복귀 시 클래스 없음·`pointer-events` 정상. 기존 계약 시험(140ms·동작 줄이기) 유지 |

바뀌지 않는 것: 누를 때 140ms 사라짐 연출, 상세 이동 시점, 중복 탭 막기, 뒤로 목적지(origin) 저장, D1 보관대 동작.

### 4-3. 영향받는 화면·호출처 (전부)
- `CardShell` 을 쓰는 4개 배치(`FeedListLayoutThumbRight/ThumbLeft/Place/Tags/TextOnly`) → A1~A4 (LOUNGE 전 목록), B1 (HOME 교민 이야기), C1 (통합 검색: 원래 정상, 언마운트 때 정리만 추가 — 동작 변화 없음).
- `beginCommunityPostEntryFromCard` 호출처 = `CardShell` 1곳뿐 (전체 검색).

### 4-4. 바꾼 뒤 깨질 수 있는 것과 처리
| 위험 | 처리 |
|---|---|
| 140ms 연출 도중 허브가 숨겨지면 연출이 끊김 | 이동(push)은 140ms 연출이 끝난 뒤에 시작 → 숨김은 연출 뒤. 영향 없음 |
| 상세로 가는 동안 「나가는 화면 사본」 연출에 카드가 다시 보임 | 사본은 새로 마운트되는 요소라 지금도 클래스가 없음 → 지금과 같음 (변화 없음) |
| 같은 카드 연속 탭 | `navigatingHref` 가드 그대로 |

### 4-5. 검증 계획 (배포 뒤, Production SHA 매번 기록)
iPhone 앱·Android 앱(Samsung) 녹화 판정 — 2-1 A1·B1 × 2-2 R1·R2·R3·R4 × 2-3 S2·S4·S5. 기대: 돌아온 뒤 카드가 보이고 다시 눌린다. 운영 DOM 에서 `.community-post-source-fade-out` 0개.

## 5. 범위 밖 (보고만)
- `components/stores/browse/StoresBrowseHeaderSubTopicChips.tsx` 는 사용처 0 (죽은 파일).
- D1 설계서 위험 표에 「React 밖 DOM 직접 변경은 보관 중 남는다」 항목이 없음 — 다른 화면에 같은 방식이 새로 들어올 때 막을 규칙이 없다.
