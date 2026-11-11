# D1 남은 항목 설계안 (2026-11-12 · Owner 「남은 항목 설계안 보고」 · 설계만, 구현 없음)

근거: `docs/audit/d1-remaining-root-cause-design-2026-11-11.md` §8·§9(재감사 #3~#8). 측정 조건: Production `0ac10c09`(#156 포함, READY 05:21 PHT) · 샤오미 태블릿(디버깅 가능 운영 앱) · 로그인 회원 · 05:25~06:10 PHT. 원인은 모두 운영 앱의 React 트리·프로파일·성능 기록으로 확인했다(추측 없음).

## 1. 결함 — 원인 확정

### R1. 매장 관리 화면 다녀오면 보관 화면 전부 사라짐 (재감사 #8)
- **증거**: 보관대(`HubRetentionStack`) 내부 상태를 운영 앱에서 읽음 — 계정 키·계정 세대는 그대로(`member:…`, 0)인데 **보관대 인스턴스 번호가 14→15→16(진입)→17→18(복귀)**. 즉 보관대 자체가 새로 만들어진다(비우기가 아님).
- **원인 (React 트리 비교로 확정)**: `components/layout/providers/StoreCommerceCartRuntimeBoundary.tsx` 가 `/stores/owner` 에서 `<>{children}</>`, 그 밖에서 `<StoreCommerceCartProvider>{children}</…>` 를 돌려준다. 감싸는 요소 종류가 바뀌어 **그 아래 앱 셸 전체(머리글·하단 탭·보관대)가 다시 만들어진다.** 같은 파일 주석 「Fragment 로 바꿔 셸을 remount 하지 말 것」 계약을 매장 관리 경로에서 어기고 있다(D1 이전부터 있던 코드, D1 보관 화면을 지움).
- 연쇄: 그 아래 `DeferredTradePresenceActivityProvider` 도 새로 만들어져 아래 R2 가 한 번 더 일어난다(진입 657ms 뒤 인스턴스 16).

### R2. 앱 시작 1.2~1.7초 뒤 화면 전체가 한 번 다시 만들어짐 (재감사 중 새로 발견)
- **증거**: 새로고침부터 보관대 인스턴스 추적 — 956ms 인스턴스 1(홈) → **1,178ms 인스턴스 2**. 트리 비교: `DeferredTradePresenceActivityProvider`(부모) 아래 자식이 `s$`(앱 셸 뿌리 `main-shell-viewport-root`) → `v`(`TradePresenceActivityProvider`)로 바뀜.
- **원인**: `components/layout/DeferredTradePresenceActivityProvider.tsx` 가 유휴 시간 전 `<>{children}</>`, 뒤 `<TradePresenceActivityProvider>{children}</…>` — R1 과 같은 「감싸는 요소 종류 교체」. 시작 직후 첫 화면을 그린 뒤 **앱 셸 전체를 버리고 다시 그린다**(첫 1.5초 안에 연 탭 보관 화면도 사라짐). D1 이전부터 있던 코드.
- 「앱 시작 뒤 첫 진입 깜빡임」(범위 밖 목록)과의 관계는 측정하지 않았다 — 이 수정 뒤 따로 잰다.

### R3. 배달 「내 매장」 요청 60초 규칙 미적용 (재감사 #7)
- 호출: `components/delivery/launch/DeliveryRecruitingSurface.tsx` → `useDeliveryStoreOwnerEntry`(`lib/delivery/launch/use-delivery-store-owner-entry.ts`) → `fetchMeStoresListDeduped`(자체 22초 캐시). 배달 탭 재진입 때 22초 지나면 다시 요청(운영 측정 1회 확인).
- 설계 D1 §4 목록(「내 매장」)에 있었으나 적용도, 제외 사유 기록도 없었다.

### R4. 셸 속성 판정이 첫 번째 하단 탭만 봄 (재감사 #3)
- `lib/layout/html-shell-flags.ts` `navHas()` 가 `querySelector`(첫 요소)만 본다. 예전 `html:has(.app-bottom-nav-shell--delivery)` 는 아무 하단 탭이나 맞으면 참. 하단 탭 2개가 동시에 있는 순간(매장 관리 ↔ 일반 하단 탭 교대 시점)이 있으면 다르게 판정. 화면 영향은 측정 못 함(코드 차이만 확정).

### R5. 관리자 콘솔 규칙 우선순위 (재감사 #6)
- `app/globals.css` `html[data-shell-admin-console-v2] body`(0,1,2) — 예전 `body:has([data-admin-console="v2"])`(0,1,1)보다 한 단계 높다. 충돌 규칙은 없지만 「예전과 같게」 계약과 다르다.

## 2. 결함 수정 설계

| # | 바꾸는 파일 | 바꾸는 내용 | 영향받는 화면·호출처 | 깨질 수 있는 것과 같은 단계 처리 |
|---|---|---|---|---|
| R1 | `StoreCommerceCartRuntimeBoundary.tsx`, `contexts/StoreCommerceCartContext.tsx` | 경로와 관계없이 **항상 같은 요소**(`StoreCommerceCartProvider`)로 감싼다. 매장 관리 경로에서는 `inert` 로 — 컨텍스트 값 `null`(지금 Fragment 일 때와 같음), 장바구니 읽기·저장·동기화 효과 4개(`useEffect` 158·188·198·203행)는 시작하지 않음 | 장바구니 쓰는 화면 전부(배달·주문·내정보 주문), 매장 관리 전 화면 | 「매장 관리에 고객 장바구니 누수 금지」 계약 → `inert` 에서 값 `null`·네트워크/저장소 0 을 계약 테스트로 고정. 매장 관리 ↔ 배달 이동 시 장바구니 다시 읽기 1회 |
| R2 | `DeferredTradePresenceActivityProvider.tsx`, `components/chats/TradePresenceActivityContext.tsx` | 처음부터 `TradePresenceActivityProvider` 로 감싸고 `armed` 를 넘긴다. 심장박동(`/api/me/trade-presence/heartbeat`, 75행 효과)만 `armed` 뒤 시작 — 지금과 같은 시점 | 거래 상태 표시(채팅 목록·거래 화면) | 첫 1.5초 동안 컨텍스트 값이 지금은 `null`, 바뀐 뒤엔 「미시작」 값 → 소비처가 `null` 만 검사하는지 전수 확인 후 같은 의미의 값으로 맞춤 |
| R1·R2 공통 | 계약 테스트 새로 | **앱 셸 위 Provider 들은 조건에 따라 감싸는 요소 종류를 바꾸지 않는다** — `MainAppProviderTree` 에서 셸까지 경로의 컴포넌트 전수 정적 검사(`return <>{children}</>` 와 `return <X>{children}</X>` 를 함께 가진 컴포넌트 금지) | — | 같은 패턴이 더 있으면 이 단계에서 목록화·보고(고치지 않음, 승인 범위 고정) |
| R3 | `use-delivery-store-owner-entry.ts` | `useHubDataRevisitGate` 적용(키 = `enabled`, 성공 시에만 기록) | 배달 모집 배너 주 버튼·고객센터 FAB | 매장 승인 상태가 바뀐 뒤 최대 60초 늦게 반영(다른 허브 데이터와 같은 규칙). 앱 복귀·계정 전환 시 다시 받음(기존 세대 규칙) |
| R4 | `html-shell-flags.ts` | `navHas` = 모든 `.app-bottom-nav-shell` 중 하나라도 해당 클래스 | 하단 탭 속성 전부 | 단위 테스트에 하단 탭 2개 경우 추가. 인라인 스크립트도 같은 함수라 함께 바뀜 |
| R5 | `app/globals.css` | `[data-shell-admin-console-v2] body`(0,1,1) | 관리자 콘솔 | 기존 계약 테스트의 셀렉터 문자열 갱신 |

**고치지 않음(기록만)**
- 재감사 #4(개발 서버에서 숨긴 허브 주소 고정 안 됨): 운영 영향 없음. 규칙으로 「D1 보관 동작 측정은 운영 빌드에서만」을 문서에 적는다.
- 재감사 #5(미리 받기 건너뛰기 기준 시각): 데이터 정확성 문제 아님(놓치는 것은 미리 받기 1회), 실측 근거 없음 → 고치지 않음.

## 3. 재진입 50ms 기준 — 남은 비용의 원인 (측정)
샤오미, 커뮤니티 재진입, CPU 프로파일 2회 + 성능 기록 2회:
| 구성 | 시간 | 근거 |
|---|---|---|
| React 내부 작업(숨김↔보임 전환: 두 허브 하위 효과 끊기·다시 연결, 비교·반영) | 약 57ms | 프로파일 중 React 외 코드가 없는 표본 합 |
| 스크롤 기억 복원(`AppScrollMemory` — `getComputedStyle`·`clientHeight` 로 스크롤 칸 찾기) 중 **강제 스타일 계산** | 26~27ms(158개 요소) + JS 14ms | 성능 기록 스택 `t@…:13404`(`getComputedStyle(e).overflowY`), 프로파일 `k/t/r/u/b` 함수 |
| 그다음 프레임 스타일 계산 | 15~17ms(313개) | 성능 기록 |
| 커뮤니티 인접 주제 미리 받기 — 캐시 확인 전 영구 캐시 `JSON.parse` | 약 7ms | 프로파일 `readPhilifeFeedCache` 경로(`CommunityFeed.tsx` 1717행 효과) |
| 하단 탭 누름 처리 · 피드 다시 그리기 · 기타 | 각 4~5ms | 프로파일 |
- 홈·배달·내정보 재진입도 같은 구조(가장 긴 작업 = React 작업 1덩어리 111~156ms, 그 안 강제 스타일 계산 39~59ms·요소 291~551개).
- **결론**: React 의 숨김↔보임 전환 비용(약 57ms)만으로 이 기기에서 50ms 를 넘는다. 아래 줄일 수 있는 항목을 모두 해도 Activity 구조로는 50ms 달성 불가(측정 기준).

### 3-1. 줄일 수 있는 비용 (Activity 유지)
| # | 바꾸는 곳 | 내용 | 예상(구현 후 측정으로 확정) |
|---|---|---|---|
| P1 | 스크롤 기억 복원 | 스크롤 칸 판정을 스타일 읽기(`getComputedStyle`) 대신 셸 표식(`data-main-hub-scroll-body`·`APP_SCROLL_OWNER_ATTR`)으로만 — 반영 도중 강제 계산 제거 | 강제 계산 1회(158개) 제거 |
| P2 | 커뮤니티 인접 주제 미리 받기 | 10초 제한·60초 규칙 검사를 영구 캐시 읽기 **앞**으로 | JSON.parse 약 7ms 제거 |
| P3 | 홈·배달 목록 칸 | 화면 밖 칸 계산 건너뛰기(커뮤니티 F2 와 같은 방식 — 그림자 여백 포함). 칸 높이 실측 후 추정값 결정 | 홈 551·배달 529개 재계산 감소 |
- 영향: 스크롤 복원(탭 왕복·글 뒤로·당겨서 새로고침), 커뮤니티 주제 전환, 홈·배달 스크롤. 검증: 커뮤니티에서 한 것과 같은 오차 0 측정 + 그림자 픽셀 비교.

### 3-2. 50ms 기준 자체 — **Owner 결정 필요**
- 설계 D1 §9 「재진입 멈춤 50ms」는 Activity(숨김 시 효과 정리) 구조로는 측정상 달성 불가. 승인된 설계(§3: 숨긴 허브는 효과 정리 — 실시간·리스너가 숨김 중 돌지 않게)와 50ms 기준이 서로 맞지 않는다(규정 7 「설계와 지시 충돌 보고」).
- 작업자가 임의로 고르지 않는다. 결정할 것: ① 기준을 「3-1 적용 후 측정값」으로 바꾼다 ② 숨김 중에도 효과를 유지하는 다른 구조를 새로 설계한다(숨긴 탭의 실시간·타이머·스크롤 리스너가 계속 돎 — 채팅·배지·메모리 계약 재검토 필요, 별도 설계·승인).

## 4. 아직 측정 안 한 완료 기준 (NOT_PROVEN) — 검증 방법
| 항목 | 방법 | 필요한 것 |
|---|---|---|
| iPhone 앱 D1 전체(보관·재진입·스크롤·연출) | iPhone 앱 웹 검사 또는 시뮬레이터 앱 | 앱 로그인 — Owner (작업자 비밀번호 입력 금지) |
| 계정 A→B 전환 | 로그아웃 → 다른 계정 로그인 후 이전 계정 화면 0 확인 | 두 번째 계정 로그인 — Owner |
| 이동 연출 11종·메모리(#150·#153·#156 뒤) | 삼성·샤오미 녹화·`dumpsys meminfo` — D1 §7·§9 같은 방법 | 작업자 가능 |

## 5. 진행 순서 (승인 시)
1. R1·R2(+공통 계약) → R3·R4·R5 → 로컬 검사 → PR 1개(같은 작업) → Owner 병합 → 운영 확인(보관대 인스턴스 유지·시작 1.5초 재생성 0·매장 관리 왕복 보관 유지).
2. 3-1(P1~P3) — 별도 PR(성능 작업), 구현 전후 같은 방법으로 측정.
3. 3-2 는 Owner 결정 후.
4. §4 작업자 가능 항목은 1 이후 측정, Owner 필요 항목은 Owner 요청.

## 6. 남은 위험
- R1 `inert` 에서 장바구니 효과를 막지 못하면 매장 관리에 고객 장바구니가 섞인다 → 계약 테스트로 「네트워크·저장소 0」 고정 + 운영에서 매장 관리 진입 시 장바구니 요청 0 확인.
- R2 수정 뒤 첫 1.5초 컨텍스트 값 의미가 바뀐다 → 소비처 전수 확인이 같은 단계 조건.
- 같은 「감싸는 요소 교체」 패턴이 다른 Provider 에도 있으면 그 경로에서 보관 화면이 계속 사라진다 → 공통 계약 검사로 목록화(이번 승인 범위에서 고치지 않고 보고).
- 50ms 는 3-2 결정 전까지 FAIL 그대로.

## 7. 구현 기록 (2026-11-12 · Owner 「R1~R5 승인」)
- R1: `StoreCommerceCartProvider` 에 `inert` — 매장 관리 경로에서 값 `null`, 저장소 읽기/쓰기·다른 탭 동기화·스냅샷 발행 0, 상태 비움(다시 켜지면 저장소에서 새로 읽음 = 예전 새 마운트와 같음). 경계는 항상 Provider 로 감싼다.
- R2: `TradePresenceActivityProvider` 가 처음부터 감싸고, 실제 동작은 `armed` 뒤 children 의 **형제**로 붙는 엔진에서만. 값은 엔진이 알려 줄 때까지 `null`. 소비처 전수 = `ChatDetailView` 1곳(`?.` 로 null 처리 — 의미 동일).
- 셸 위 감싸기 전수 점검(`MainAppProviderTree` → `ConditionalAppShell` 사이 18개 컴포넌트): 실행 중 감싸기 교체는 R1·R2 두 곳뿐. `storesHubLite` 분기는 레이아웃 속성(첫 로드 고정)이라 이동 중 교체 아님. `AuthSessionBoundary` 는 셸 아래(보관대 안).
- 동작 테스트 `lib/layout/__tests__/shell-ancestor-wrapper-stable.test.tsx`: 경로 바꿈·유휴 켜짐에도 아래 화면 마운트 1회 — **수정 전 코드로 돌리면 실패, 수정 뒤 통과** 확인.
- R3: 「내 매장」 60초 규칙. R4: 하단 탭 여러 개 판정. R5: 특이도 (0,1,1).
