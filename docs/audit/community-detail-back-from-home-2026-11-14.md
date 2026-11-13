# HOME 「교민 이야기」 글 → 상세 「‹」 → LOUNGE 로 가는 문제 — 원인·설계안

- 작성: 2026-11-14 PHT · 지시: Owner 「HOME 에서 뒤로 가면 LOUNGE 로 가는 것도 원인 확인해라」
- 상태: 분석·설계 → Owner 「설계안대로 수정」(2026-11-14) → §3 구현 (PR `fix/community-detail-back-home`)
- 판정: **FAIL** — 같은 상세에서 뒤로 버튼 2개가 서로 다른 곳으로 간다 (‹ = LOUNGE, Android 뒤로 키 = HOME)

## 0. 측정
| 진입 | 저장된 출처(origin) | ‹ 목적지 | ‹ 누른 뒤 | 증거 |
|---|---|---|---|---|
| HOME 교민 이야기 | `/home` | **`/philife`** | `/philife` (기록: `…/home, /philife` — 상세 칸이 `/philife` 로 **교체**) | 운영 DOM·Navigation API, 05:5x PHT, main `83a69022c` 이후 운영(수정 #297 포함) |
| LOUNGE 주제(필리핀생활) | `/philife?category=phlifee` | 같음 | 같은 주제 목록 | 운영 DOM |
| 통합 검색 | `/search?q=…&location=all` | 같음 | 같은 검색 결과 | 운영 DOM |
| HOME 글 → Android 뒤로 키 | — | — | HOME | Samsung 실기 05:35:55 |
| HOME 글 → ‹ | — | — | LOUNGE FEED | iPhone 시뮬 앱 05:40:03 |

## 1. 원인 (확인됨)
1. 글 카드를 누르면 「들어온 화면」을 출처로 저장한다 (`writeCommunityPostEntryOrigin`). HOME 에서 누르면 `/home` 이 정확히 저장된다 (측정).
2. 상세의 ‹ 목적지는 `resolveCommunityDetailBackHref` 가 정하는데, 저장된 출처를 **허용 목록**(`isSafeCommunityReturnHref`: 커뮤니티 허브 `/philife`·`/community` · `/mypage/community-posts` · `/search`)에 있을 때만 쓰고, 아니면 `/philife` 로 바꾼다. **`/home`·`/` 는 목록에 없다** → `/philife`.
3. ‹ 는 `runFixedDestinationBack`(고정 목적지 뒤로): 직전 기록(`/home`)이 목적지(`/philife`)와 같은 화면인지 `COMMUNITY_FIXED_BACK_OPTIONS.isSameDestination` 으로 보는데, 이것도 커뮤니티 허브 경로끼리만 같다고 본다 → 다르다 → 상세 칸을 `/philife` 로 **교체** → LOUNGE 로 간다.
4. 이력: 2026-11-09 이전에는 `/`·`/home` 이 **커뮤니티 피드 화면의 별칭**이었다 (`COMMUNITY_HOME_SURFACE_PATHS = ["/", "/philife", "/community", "/home"]`). 그래서 `/home` 출처는 허용·같은 화면으로 판정돼 HOME(=당시 피드)으로 돌아갔다.
   2026-11-09 `68e4d0547` 「앱 홈 신설」이 `/`·`/home` 을 독립 HOME 으로 분리하면서 커뮤니티 경로 목록에서 뺐고, 같은 날 `c6347e66c` 가 HOME 에 「교민 이야기」(같은 글 카드 → 같은 출처 저장)를 넣었다. **뒤로 목적지 허용 목록·같은 화면 판정은 HOME 을 새 출처로 추가하지 않았다.**
   흔적: `CommunityPostDetailHeader.tsx` 주석 「커뮤니티 허브 별칭(`/`·`/philife`·`/home`·`/community`)은 같은 목록 화면」 — 분리 전 설명이 그대로 남음.

## 2. 같은 원인으로 영향받는 곳 (전수)
`resolveCommunityDetailBackHref` 사용처 전부:
| 위치 | HOME 에서 들어온 글일 때 | 증거 |
|---|---|---|
| 상세 머리글 ‹ (`CommunityDetail` → `CommunityPostDetailHeader`) | LOUNGE 로 감 | 측정 |
| 내 글 「더 보기」 메뉴 삭제 후 이동 (`CommunityMoreMenu.tsx:165`) | LOUNGE 로 감 | **코드 근거** (삭제가 필요해 측정 안 함) |
| 출처 `/` (HOME 별칭) | 같음 | 코드 근거 |

출처를 저장하는 곳은 글 카드(`CardShell`) 1곳뿐 → 출처가 저장되는 화면은 LOUNGE·HOME·통합 검색 3곳. 이 중 HOME 만 실패.
알림·채팅 공유 링크·외부 링크로 바로 연 글은 출처가 없어 `/philife` 로 간다 — 계약 CASE D(의도된 동작), 이번 결함 아님.

## 3. 설계안
원칙: 상세 ‹ 는 「들어온 화면」으로 돌아간다 (계약 CASE A–C, `fixed-destination-back.ts` 「이전 화면이 목적지면 뒤로」). HOME 도 들어온 화면의 하나로 넣는다. Android 뒤로 키와 ‹ 가 같은 곳으로 간다.

| 파일 | 변경 |
|---|---|
| `lib/community/community-post-entry-nav.ts` `isSafeCommunityReturnHref` | 허용 목록에 HOME(`isHomeSurfacePath` — `/`·`/home`, 단일 정의 `HOME_SURFACE_PATHS`) 추가 |
| `components/community/post-detail/CommunityPostDetailHeader.tsx` `COMMUNITY_FIXED_BACK_OPTIONS.isSameDestination` | HOME 별칭끼리(`/` ↔ `/home`)도 같은 화면으로 판정 · 낡은 주석 정정 |
| ‹ 버튼 읽기 이름 | 지금 「피드로」(`community_feed_back_aria`) — HOME 으로 갈 때 뜻이 틀림. 목적지가 HOME 이면 기존 키 `nav_back`(「뒤로가기」·「Go back」) 사용 (새 문구 없음) |
| 시험 | `community-post-entry-nav-contracts.test.ts`: 출처 `/home` → 목적지 `/home`; `/` → `/`; 직접 진입 → `/philife` 유지. 고정 뒤로: 직전 기록 `/home` + 목적지 `/home` → `back`(교체 아님) |

결과 동작:
- HOME 글 → ‹ = 직전 기록이 HOME 이므로 **뒤로(pop)** → HOME, 기록 중복 없음, 스크롤 위치 유지(보관 허브).
- HOME 글 → 삭제 = HOME 으로.
- LOUNGE·검색·직접 진입은 지금과 같음.

영향 화면: 커뮤니티 글 상세(모든 진입) · 내 글 삭제 후 이동. 다른 도메인 상세(거래 `/post/…`)는 이 함수를 쓰지 않음.

## 4. 확인 못 한 것
- 삭제 후 이동 실측 (운영 글 삭제 필요) — NOT_PROVEN
- Owner 실제 iPhone — NOT_PROVEN
