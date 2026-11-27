# 홈 1단 머리줄 고정 — 감사·설계안 (2026-11-27 PHT · 개정 2: iOS WebKit 측정 추가)

Owner 지시 원문: 「/home 부분의 1단 헤더 부분이 고정 되어야 하는 부분인데.. 헤더가 같이 스크롤 되는 부분이다, 감사 해서 결함과 설계안을 보고 해라 … 다음 당김 기능이나 기타의 동작, 기능에 영향을 주지 말고, 헤더 고정만 원하는 부분이다, 홈과 내정보 부분의 헤더 고정 부분, 당김 새로 고침 부분을 정확히 확인해서 보고해라」

범위: 감사·설계 → Owner 「구현 진행」(2026-11-27) → PR `fix/home-header-sticky` (main `2203d008d` 기준). 줄 번호는 main 기준.

## 1. 판정

| 항목 | 판정 | 확인 조건 · 증거 |
|---|---|---|
| 홈 1단 머리줄 고정 | **FAIL** | 운영 `samarket.vercel.app/home` · 비로그인 · 390×844 (Claude 브라우저, 09:3x PHT, origin/main `2203d008d`) · 본문 스크롤 600px → 머리줄 위치 0 → **−600px** (화면 밖으로 사라짐). `position: static`, 머리줄이 스크롤 본문 안에 있음, 셸 헤더 자리 자식 0개·높이 0 |
| 내정보 1단 머리줄 고정 | PASS (비로그인 화면만) | 같은 조건, 하단 탭으로 `/mypage` 이동 · 스크롤 305px(끝까지) → 머리줄 위치 0 → **0** 유지. 머리줄은 셸 헤더 자리 안, 스크롤 본문 밖 |
| 홈 당겨서 새로고침 | 연결됨 (운영 DOM) · 이번 설계로 코드 변경 없음 | 스크롤 본문에 `data-home-ptr-root="1"` 붙음. 시작 조건 = 스크롤 본문 scrollTop 0 (`use-dibay-ptr-gesture.ts:60`) — sticky 는 scrollTop 을 바꾸지 않음(위 시험: 스크롤 길이 2089 = 2089) |
| 내정보 당겨서 새로고침 | **기능 없음 — 확정** (코드·DOM) | `resolveMainHubPtrDomain` 에 `/mypage` 없음 → 제스처 리스너 없음, 스크롤 본문 표식도 `mainHubScrollBody` 하나뿐. `components/mypage`·`components/my`·`app/(main)/my*` 에 당김 코드 0개 |
| iOS WebKit 에서 같은 FAIL | **FAIL 재현** | iPhone 17 Pro 시뮬레이터 Safari(iOS WebKit), 운영 `/home` 의 머리줄 위 부모 14단 구조(스크롤·overflow·transform·container)를 그대로 옮긴 시험 페이지 `webkit-repro.html` · 스크롤 600 → 머리줄 −600 · [ios-webkit-current-fail.png](ios-webkit-current-fail.png) |
| 로그인 여부 | 영향 없음(코드) | 머리줄 위치는 `HomeScreen.tsx` 한 곳에서 정해지고 로그인 분기는 머리줄 안쪽(주소·종·로그인 버튼)만 바꿈 |

브라우저 열기 1회(운영 `/home`), 그 뒤 앱 안 이동 1회 · 예상 운영 Supabase 요청 ≈ 195건.

## 2. 원인 (코드 확인)

앱 셸은 메인 탭 화면을 **「헤더 자리(스크롤 밖) + 본문(유일한 스크롤)」** 으로 나눈다 — `lib/layout/main-hub-scroll-column.ts`, `components/layout/ConditionalAppShell.tsx:400-408` (`hubChromeHeader` → `.main-hub-scroll-header`, `flex-shrink:0`), 본문 `.main-hub-scroll-body` (`overflow-y:auto`, `app/app-shell.css:178`).

| | 내정보 `/mypage` | 홈 `/home` |
|---|---|---|
| 1단을 그리는 곳 | `MyPageHeader` → `MySubpageHeader` 가 제목을 셸에 등록 → 셸 `AppStickyHeader` → `RegionBar` 가 **헤더 자리**에 그림 | `lib/layout/mobile-top-tier1-rules.ts:143-144` 가 홈은 셸 1단을 끔(`suppressMainTier1`) → `AppStickyHeader.tsx:85` `return null` → 헤더 자리 **빈 채** |
| 머리줄 위치 | 스크롤 **밖** → 구조상 고정 | `HomeScreen.tsx:204` `<header className="home-r3-hdr">` 가 **본문 안** 첫 줄 → 본문과 같이 스크롤 |
| 고정 장치 | 필요 없음(스크롤 밖) | 없음 — `app/home-hub.css:378` `.home-r3-hdr` 는 배경색만 |

**결함 = 시안과 다른 구현.** 승인 시안 R2·R3·R4 머리줄은 모두 `position:sticky; top:0` 이다 (`docs/audit/home-responsive-redesign-2026-11-18/r4/home.html:42` · R2 README 「머리줄 … (흐림 유리 배경, 고정)」). 2026-11-18 R4 구현(`d2a5a1e9e`)은 머리줄 안쪽만 바꾸고 고정은 넣지 않았다. 그 전 구현(v22, `SectorHeaderBar`)도 본문 안이라 처음부터 고정이 없었다.

## 3. 설계안 — 홈 머리줄 `position: sticky` (홈 파일 1곳)

### 3-1. 바꾸는 것

`app/home-hub.css` `.home-r3-hdr` 에 3줄 추가 — 그 밖의 파일은 안 바꾼다.

```css
.home-r3-hdr {
  position: sticky;   /* 본문 스크롤(.main-hub-scroll-body) 맨 위에 붙는다 — 승인 시안 R4 .hdr 와 같음 */
  top: 0;
  z-index: 10;        /* 홈 본문 안 가장 높은 값 2(배너) 위 · 셸 시트·팝업(문서 바깥 층)보다 아래 */
  background: #f6f6f6;   /* 기존 그대로(≥600 은 #fff) — 불투명이라 아래 글이 비치지 않음 */
}
```

+ 계약 주석 1줄: `lib/layout/main-hub-scroll-column.ts` 의 「`position: sticky` 금지」 옆에 「예외: 홈 머리줄 — 셸 1단을 끄고 본문 안에 직접 그리는 화면(`/home`)」 명시, 소스 검사 테스트 1개(홈 머리줄 sticky·top 0 유지).

### 3-2. 셸 헤더 자리로 옮기는 안(내정보와 같은 구조)을 고르지 않는 이유

| 영향 | 셸 헤더 자리로 이동 | sticky (권장) |
|---|---|---|
| 첫 화면(OS 화면 걷힘) | 머리줄이 셸 쪽으로 가면 홈 서버 첫 그림에서 빠지거나, 어드민 「주소 보이기」 값을 셸이 서버에서 따로 읽어야 함 → 앱 진입 SSOT(PR-1 #610) 첫 프레임 계약을 다시 건드림 | 첫 그림·서버 HTML 그대로 |
| 당겨서 새로고침 | 당김 슬롯(`DibayPtrSlot`)도 셸로 옮기고, 머리줄 위 당김을 받으려면 `bindStickyHeader` 를 켜야 함 | 그대로 — 머리줄·슬롯이 여전히 스크롤 본문 안이라 리스너·최상단 판정 변화 없음 |
| 홈 보관대(`HubRetentionStack`) | 다른 탭 갔다 오면 머리줄만 새로 그려져 주소·종 회색 칸 깜빡임(F3-a 로 막은 것) 재발 위험 | 그대로 (머리줄이 홈과 함께 보관) |
| 폭·여백 | 머리줄 여백이 홈 칸 폭 기준(`container homer3`)이라 셸 쪽에 다시 정의 필요 | 그대로 |
| 바뀌는 파일 | 셸·규칙·홈·당김 4~6개 | CSS 1곳 + 주석·테스트 |

같은 스크롤 본문 안 `sticky top-0` 은 이미 운영에서 쓰고 있다 — 마켓 목록 「새 글」 알림 `components/home/HomeProductList.tsx:1235`.

### 3-3. 영향 확인 (바뀌는 것 / 안 바뀌는 것)

| 기능 | 결과 | 근거 |
|---|---|---|
| 스크롤 길이 | 안 바뀜 | 운영에서 sticky 를 잠시 넣어 잰 값: 2089px = 2089px |
| 고정 동작 — Chromium(Android 와 같은 엔진) | **PASS** | 운영 `/home` 에 sticky 를 잠시 넣어 잼: 스크롤 0·600 모두 머리줄 위치 0, 화면 맨 위 점 = 머리줄 |
| 고정 동작 — iOS WebKit | **PASS** | 위 시험 페이지에 sticky 3줄만 넣음: 스크롤 600 → 머리줄 0 · 맨 위 점 = 머리줄 ([ios-webkit-sticky-600.png](ios-webkit-sticky-600.png)) · 실제 손가락 밀기(관성 스크롤) 1546px → 머리줄 0 ([ios-webkit-sticky-swipe.png](ios-webkit-sticky-swipe.png)) |
| 당김 시작 조건(스크롤 0) | 안 바뀜 | `isDibayPtrScrollAtTop` 은 스크롤 본문 scrollTop 만 봄 (`use-dibay-ptr-gesture.ts:60`) |
| 당기는 중 · 놓은 뒤 슬롯 | 안 바뀜 | 스크롤 0 에서는 sticky 가 아무 일도 안 함 — 지금처럼 슬롯이 머리줄 아래로 늘어나 본문을 민다 |
| 새로고침 중 스크롤하면 | **보이는 곳만 바뀜** — 스피너 줄이 화면 위에 머리줄과 함께 남는다(지금은 같이 올라가 안 보임). 거래·라운지(머리글이 셸에 고정)와 같은 모습 | 슬롯이 머리줄 안(`HomeScreen.tsx:278`) |
| 결과 광고 띠(D-05, 3초) | 안 바뀜 — 스크롤하면 지금처럼 즉시 접힘 | `subscribeAppShellScroll` → `resetPull` |
| 팝업 말풍선(주소·종 자리) | 좋아짐 — 자리가 화면에 남아 말풍선이 따라붙음 | `EntryPresentations.tsx:278` 은 스크롤마다 자리 위치를 다시 읽음 |
| 배너 「전체보기」 시트 · 하단 탭 | 안 바뀜 | 시트는 `DibayBottomSheet`(문서 바깥 층), 하단 탭은 셸 |
| 탭 전환 움직임 | 안 바뀜 | 머리줄은 지금처럼 홈 본문과 함께 움직임 |
| 내정보 | 안 바뀜 | 홈 CSS 만 바꿈 |

### 3-4. 시안과 다른 점 (이번에 안 바꿈)

R4 시안 머리줄 바탕은 반투명 흐림 유리(`rgba(243,245,243,.92)` + blur 14px)다. 구현은 홈 바탕색(휴대폰 #f6f6f6 · 600 이상 #fff, 불투명). Owner 지시가 「헤더 고정만」이라 바탕은 그대로 둔다 — 기록만.

## 4. 구현 뒤 확인 (완료 판정 기준)

설계 단계 확인은 위 표로 끝났다(Chromium·iOS WebKit 모두 sticky 고정 PASS, 당김 코드 경로 변화 없음). 구현 뒤에는 운영 반영본을 Owner 화면 조건(로그인 계정·저장 주소·휴대폰)으로 Android·iPhone 각 1회 본다:
- 스크롤 중간·끝에서 머리줄 그대로
- 맨 위에서 당김 → 스피너 → 결과 → 접힘 (지금과 같음) · 스크롤 중간에서 아래로 끌면 당김 안 시작
- 새로고침 중 스크롤 → 스피너 줄이 위에 남았다가 끝나면 접힘
- 주소 알약·종·로그인 버튼 눌림 · 배너 전체보기 시트가 머리줄 위로 덮임
- 다른 탭 갔다 홈 복귀 → 스크롤 위치·머리줄 그대로 · 내정보 화면 변화 없음

## 5. 지시 범위 확인 결과 (내정보)

내정보 머리줄은 이미 고정(PASS)이고, 내정보에는 당겨서 새로고침 기능이 없다(코드·DOM 확정). 이번 설계는 홈 머리줄만 바꾸므로 내정보는 바뀌지 않는다.

시험 횟수: 운영 사이트 Claude 브라우저 열기 2회(앱 안 이동 1회 별도) · 예상 운영 Supabase 요청 ≈ 390건. iOS 시험은 로컬 시험 페이지라 운영 요청 0.
