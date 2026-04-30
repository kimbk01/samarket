# 사마켓 체감 성능 — 트랙 상태 · 미완 체크

> **갱신 규칙**: 라운드마다 이 파일을 업데이트한다. 새 채팅·새 창에서는 이 파일(+ [samarket-native-feel-charter.md](./samarket-native-feel-charter.md))이 연속성의 기준이다.  
> **정책 전문**: [samarket-native-feel-charter.md](./samarket-native-feel-charter.md) — **`[5-보조]`** composer_wall·warm 추가 판정(1100ms/200ms 편차·역행 무효·체감 1초) 포함.  
> **도메인별 완료율(동일 % 산식)**: [samarket-perf-domain-checksheet.md](./samarket-perf-domain-checksheet.md) — 성능 작업 **시작 시·종료 시** 갱신하고, 보고 시 **도메인별 %**를 함께 적는다. **UI 규격은 본 파일 범위 밖.**

| 필드 | 값 |
|------|-----|
| Last updated | 2026-04-30 |
| Owner | (선택) |

---

## 현재 최종 목표 (한 줄)

거래+커뮤니티 **당근마켓급** · 메신저 **카카오톡급** · 배달·서비스형 **배달의민족급**; 탭·리스트·전환 **선택 즉시 반응**. (UI 토큰·컴포넌트 시각 규격은 별도 관리.)  
**체크시트·완료율 %:** [samarket-perf-domain-checksheet.md](./samarket-perf-domain-checksheet.md) — 항목 `[x]` = 완료, 라운드 수치만 바뀐 경우는 **트랙 상태(본 파일)**에만 기록.

---

## 체크시트 연동 — 메신저 ([samarket-perf-domain-checksheet.md](./samarket-perf-domain-checksheet.md) §2)

| # | 기준(요약) | 체크시트 | 최근 증거·메모 |
|---|------------|----------|----------------|
| 1 | 방 탭 후 즉시 입력 | **미완료** `[ ]` | `composer_wall` 축은 **종료**. **라운드 M**(2026-04-23): `input_ready` 기록을 `useEffect`→`useLayoutEffect` — breakdown **CTV→input 3회 모두 0ms**, **FMR−CTV ~16–21ms**(H 78.7 대비 ↓). 전체 `composer_wall`/SLO는 별도 합의 전까지 `[ ]` 유지. |
| 2 | 목록·말풍선 지연 | **미완료** `[ ]` | breakdown·부트스트랩 라운드는 진행·종료 기록 있으나 **본 항목 합의 완료 아님**. |
| 3 | 스크롤·재진입·뒤로가기 | **미완료** `[ ]` | 별도 E2E·합의 없음. |
| 4 | 배지·읽음·목록 정합 | **미완료** `[ ]` | 별도 E2E·합의 없음. |
| 5 | 탭·채팅 선택 즉시 반응 | **미완료** `[ ]` | 별도 E2E·합의 없음. |

**도메인 완료율(메신저):** **0 / 5 → 0%** (위 항목이 모두 `[x]`일 때만 100%).

---

## 메신저 실시간 근본조치 (2026-04-22)

| 항목 | 내용 |
|------|------|
| 트랙 이름 | 메신저 실시간 근본조치 — silent subscription / 거래 상태 단일 전파 / 읽음 배지 계약 통일 |
| 현재 상태 | **구현 완료 · 검증 대기** |
| 이번 원인 1개 | `rooms.summary` 거래 메타 파싱에서 **`postId` 누락** + 채널별 각자 다른 `SUBSCRIBED` 해석 때문에, 거래 상태·presence·통화·배지가 같은 날 다시 흔들릴 수 있는 구조였다. |
| 이번 조치 | 1) 공통 `realtime health` 도입과 silent channel 계측 추가 2) 통화·presence·거래 상태 Realtime을 같은 재시도 축으로 정렬 3) 판매 상태 변경 시 **Community Messenger room summary**를 서버에서 직접 동기화 4) 메신저 방 읽음을 **즉시 mark_read**로 통일하고 거래 배지 해제를 같이 전파 |
| 관측 포인트 | `realtime.subscription:silent_channel`, `realtime.subscription:presence_snapshot_fallback`, `db.community_messenger:trade_state_summary_sync`, 기존 `chat.unread_sync:badge_list_align` |

---

## 진행 중 트랙

| 항목 | 내용 |
|------|------|
| 트랙 이름 | 하단 탭 즉시 리스트 — **RSC await 와 클라 데이터 캐시 분리 미스 근본 정리** (라운드 W) |
| **트랙 상태** | **진행 중 (라운드 W→W7 반영)** — `/stores` + `/philife` 글로벌/토픽 prewarm, 키보드 탭 진입 prewarm, **latest menu navigation intent guard** 까지 반영된 상태에서, 2026-04-30 후속 라운드로 거래 체감 병목을 다시 좁혔다. 이번에는 `/market` 기본 진입이 **RSC 시드 없이 클라 hydration+fetch 완료까지 기다리던 구조**, `/post/[id]` 상세가 **비핵심 거래방/제안 시드까지 첫 응답에서 함께 기다리던 구조**를 최신 원인으로 잡아 수정했다. |
| 이번 원인 1개 | 거래 대표 경로에서 **첫 화면에 꼭 필요하지 않은 데이터까지 첫 응답을 막고 있었다.** `/market` 기본 진입은 서버 시드가 비어 있어 캐시 미스 시 클라 `getPostsForHome` 완료 전까지 즉시 리스트가 뜨지 않았고, `/post/[id]` 상세는 클라 fallback 이 이미 있는 `room-id`·판매자 제안 시드까지 RSC `Promise.all` 에 묶여 첫 본문 응답이 늦어질 수 있었다. |
| 이번 조치 | 1) `app/(main)/market/page.tsx` 에 `Suspense` + `MarketContentWithSeed` 를 넣어 `/market` 기본 진입(`tradeState=latest`)일 때는 셸을 즉시 보내면서도 `initialHomeTradeFeed` 를 RSC 스트리밍으로 주입하게 했다. 2) `lib/posts/home-posts-route-core.ts` 에 `resolveDefaultTradeHomePostsSeedForServerComponent()` 를 추가해 `/api/philife/posts` 와 같은 서버 캐시·favorites 정책으로 기본 거래 홈 목록 시드를 생성하게 했다. 3) `services/trade/trade-detail.service.ts` 에서 상세 첫 화면에 비핵심인 `resolveViewerItemTradeRoom`·판매자 제안 선로드를 RSC 크리티컬 경로에서 제거하고, 판매자 프로필도 주소 기본값 추가 조회 없이 최소 프로필만 먼저 반환하게 줄였다. |
| 관측 포인트 | `/market` 은 기본 latest 진입에서 **클라 단독 fetch 전에 RSC 시드가 도착하는지**, `/post/[id]` 는 본문·판매자 블록보다 늦게 필요한 room-id / offer seed 가 첫 응답을 막지 않는지 확인. 로컬 `curl -L` 3회 스모크에서는 `/market` warm `time_starttransfer` 가 **55.7 / 65.9 / 77.3ms**, 샘플 `/post/<id>` 는 **cold 1616.9ms / warm 65.1ms / 53.3ms** 로 200 응답을 유지했다. |
| 후속(트랙 X 후보) | `/post/[id]` 의 가장 큰 잔여 병목인 `loadTradeDetailRelatedBundle`(판매자 다른 글·유사 글·광고)을 본문 이후로 분리할지 검토한다. 이때는 기존 기능 회귀 없이 `related` 섹션만 지연/스트리밍하는 구조로 한 단계 더 쪼갠다. |

**보조(도메인 순환·`performance-state.json`):** 2026-04-26 — `myinfo`로 남아 있던 **`PurchaseDetailView` 구매 상세 GET**을 비행 패턴(`fetch`만 합류·`clone` 파싱·`credentials`)으로 정리해 한 사이클을 코드까지 마감했다. `currentTarget`은 다음 순환 진입점으로 **`login`**을 유지한다.

---

## 이번 라운드 (최신: 라운드 W8 — detail related 번들 후속 로드 분리)

| 항목 | 내용 |
|------|------|
| 원인 1개 | `/post/[id]` 첫 응답에서 `loadTradeDetailRelatedBundle`(판매자 다른 글·유사 글·광고)까지 함께 await 하면서, 본문 진입 체감이 related 쿼리 비용에 끌려갔다. |
| 측정 명령 | PowerShell `curl.exe -L -o NUL -s -w` 1회(`http://localhost:3000/post/<sampleId>`) + 후속 API 1회(`http://localhost:3000/api/posts/<sampleId>/related`) |
| 완료 기준 | 상세 본문 응답 경로에서 related 번들을 제거하고, related는 별도 후속 API로 정상 200 로드되어 UI 회귀 없이 채워져야 함 |
| 수정 파일 (1~3) | `services/trade/trade-detail.service.ts`, `app/(main)/post/[id]/PostDetailPageClient.tsx`, `app/api/posts/[postId]/related/route.ts` |

### 라운드 W8 — 스모크 (s)

| 구분 | starttransfer | total | 비고 |
|------|---------------|-------|------|
| `/post/<sampleId>` | 1.1314 | 1.1367 | 200, 본문 응답 |
| `/api/posts/<sampleId>/related` | 3.1589 | 3.1591 | 200, related 후속 로드 |

**비교:** 이전에는 상세 본문이 related 번들과 같은 응답 경로였고, 지금은 본문과 related가 분리되어 첫 화면 진입 경로에서 related 대기가 제거됐다.  
**판정:** **보류** — 구조 분리는 완료했지만, 사용자 체감(브라우저 상호작용 기준) 3회 반복 전/후 비교는 추가 필요.

---

## 이번 라운드 (최신: 라운드 W4 — Philife 댓글 API 선행 상세조회 제거)

| 항목 | 내용 |
|------|------|
| 원인 1개 | `/api/philife/posts/[postId]/comments` 가 댓글 조회 전에 `getNeighborhoodPostDetail`(작성자 닉/토픽/모임 링크까지 포함한 무거운 상세 경로)를 먼저 수행해, 댓글 응답에서 **불필요한 선행 DB/가공 비용**이 발생했다. |
| 측정 명령 | PowerShell `Invoke-WebRequest` 3회(동일 `postId`) — `http://localhost:3000/api/philife/posts/<postId>/comments` |
| 완료 기준 | warm 3회에서 댓글 API wall time이 기존 관측(약 1.4~1.8s) 대비 안정적으로 감소하고, 404/권한 동작 회귀가 없어야 함 |
| 수정 파일 (1~3) | `app/api/philife/posts/[postId]/comments/route.ts` |

### 라운드 W4 — 3회 (ms)

| 구분 | Run1 | Run2 | Run3 | 평균 |
|------|------|------|------|------|
| 수정 전 | 1735 | 1796 | 1416 | **1649** |
| 수정 후 | 831 | 681 | 698 | **737** |

**비교:** 평균 **1649ms → 737ms (약 55.3% 감소, -912ms)**  
**판정:** **성공** — 동일 endpoint 3회에서 일관된 하락 확인.

---

## 이번 라운드 (최신: 라운드 W7 — market 기본 시드 복원 + detail 비핵심 await 제거)

| 항목 | 내용 |
|------|------|
| 원인 1개 | `/market` 기본 진입은 **RSC 시드 부재**로 캐시 미스 시 클라 `getPostsForHome` 완료까지 기다렸고, `/post/[id]` 는 클라 fallback 이 이미 있는 `room-id`·판매자 제안 시드를 RSC 본문 응답과 함께 기다렸다. |
| 측정 명령 | PowerShell `curl.exe -L -o NUL -s -w` 3회 — `http://localhost:3000/market`, `http://localhost:3000/post/<sampleId>` (`sampleId`: 홈 API 첫 글) |
| 완료 기준 | `/market` 기본 latest 진입은 셸 즉시 + 리스트 seed 주입 경로를 회복하고, `/post/[id]` 는 본문에 비핵심 시드가 first response 를 막지 않게 줄여 warm 3회 응답이 안정적으로 유지되어야 함 |
| 수정 파일 (1~3) | `app/(main)/market/page.tsx`, `lib/posts/home-posts-route-core.ts`, `services/trade/trade-detail.service.ts` |

### 라운드 W7 — 3회 스모크 (s)

| 구분 | Run1 | Run2 | Run3 | 비고 |
|------|------|------|------|------|
| `/market` `time_starttransfer` | 0.0557 | 0.0659 | 0.0773 | 200 유지 |
| `/post/<sampleId>` `time_starttransfer` | 1.6169 | 0.0651 | 0.0533 | 200 유지, Run1 cold |

**비교:** 구조상 `/market` 은 **클라 단독 fetch 대기 → 스트리밍 seed 병행** 으로 바뀌었고, `/post/[id]` 는 **room-id / seller-offers 선로드 제거**로 본문 크리티컬 경로가 짧아졌다. 이번 수치는 **수정 후 스모크**만 확보했으므로, 사용자 체감 기준의 전/후 판정은 추가 수동 검증이 필요하다.  
**판정:** **보류** — 근본 원인 제거 방향의 코드 수정과 smoke 3회는 확인했지만, 같은 sample 기준 수정 전/후 비교와 실제 브라우저 체감 반복 확인은 아직 부족하다.

---

## 이번 라운드 (최신: 라운드 W5 — 상세 토픽 로드 제거 실험, 원복)

| 항목 | 내용 |
|------|------|
| 원인 1개 | `/philife/[postId]` 상세 서버 경로에서 `getNeighborhoodPostDetail` 의 `loadPhilifeDefaultSectionTopics()` 호출이 첫 렌더 지연에 기여할 수 있다는 가설 |
| 측정 명령 | PowerShell `Invoke-WebRequest` 3회(동일 `postId`) — `http://localhost:3000/philife/<postId>` |
| 완료 기준 | warm(런2·런3) 평균이 직전 기준선 대비 역행 없이 감소 |
| 수정 파일 (1~3) | `lib/neighborhood/queries.ts` (실험 후 원복) |

### 라운드 W5 — 3회 (ms)

| 구분 | Run1 | Run2 | Run3 | 평균 |
|------|------|------|------|------|
| 수정 전 | 220 | 66 | 56 | **114** |
| 실험 적용 | 266 | 79 | 60 | **135** |

**비교:** warm 평균 **61ms → 69.5ms** (역행)  
**판정:** **무효** — 변경 즉시 원복 완료.

---

## 이번 라운드 (최신: 라운드 W6 — 댓글 API 중복 flat 페이로드 제거)

| 항목 | 내용 |
|------|------|
| 원인 1개 | `/api/philife/posts/[postId]/comments` 응답에서 `tree` 외에 `comments(flat)`를 추가로 생성/직렬화해 CPU·payload가 중복됨 |
| 측정 명령 | PowerShell `Invoke-WebRequest` 3회(동일 `postId`) — `http://localhost:3000/api/philife/posts/<postId>/comments` |
| 완료 기준 | warm(런2·런3) 평균이 직전 W4 검증값 대비 역행 없이 감소 |
| 수정 파일 (1~3) | `app/api/philife/posts/[postId]/comments/route.ts` |

### 라운드 W6 — 3회 (ms)

| 구분 | Run1 | Run2 | Run3 | 평균 |
|------|------|------|------|------|
| 직전 기준(W4 재검증) | 812 | 740 | 685 | **746** |
| 수정 후 | 2170 | 726 | 689 | **1195** |

**비교(헌장 warm 기준):** **712.5ms → 707.5ms** (소폭 개선, -5ms)  
**판정:** **성공** — warm 2회 모두 1100ms 미만, 편차 37ms(<200ms), warm 평균 역행 없음.

---

## 이번 라운드 (최신: 라운드 W7 — 댓글 liked 조회 조건 게이팅)

| 항목 | 내용 |
|------|------|
| 원인 1개 | `listNeighborhoodComments`가 댓글 `like_count`가 모두 0인 케이스에서도 viewer liked set 조회를 수행해 불필요한 DB 조회가 발생 |
| 측정 명령 | PowerShell `Invoke-WebRequest` 3회(동일 `postId`) — `http://localhost:3000/api/philife/posts/<postId>/comments` |
| 완료 기준 | warm(런2·런3) 평균이 직전 W6 대비 역행 없이 감소 |
| 수정 파일 (1~3) | `lib/neighborhood/queries.ts` |

### 라운드 W7 — 3회 (ms)

| 구분 | Run1 | Run2 | Run3 | 평균 |
|------|------|------|------|------|
| 직전 기준(W6) | 2170 | 726 | 689 | **1195** |
| 수정 후(W7) | 736 | 680 | 681 | **699** |

**비교(헌장 warm 기준):** **707.5ms → 680.5ms** (개선, -27ms)  
**판정:** **성공** — warm 2회 모두 1100ms 미만, 편차 1ms(<200ms), warm 평균 역행 없음.

---

## 이번 라운드 (최신: 라운드 W8 — 닉네임 캐시 실험, 원복)

| 항목 | 내용 |
|------|------|
| 원인 1개 | `fetchNicknamesForUserIds`가 동일 사용자 집합 반복 조회에서도 매번 DB를 호출 |
| 측정 명령 | PowerShell `Invoke-WebRequest` 3회(동일 `postId`) — `http://localhost:3000/api/philife/posts/<postId>/comments` |
| 완료 기준 | warm(런2·런3) 평균이 직전 W7 대비 역행 없이 감소 |
| 수정 파일 (1~3) | `lib/chats/resolve-author-nickname.ts` (실험 후 원복) |

### 라운드 W8 — 실험 적용 3회 (ms)

| Run1 | Run2 | Run3 | 평균 |
|------|------|------|------|
| 1166 | 2774 | 467 | **1469** |

**비교(헌장 warm 기준):** 런2·런3 편차 **2307ms(>=200)** 로 불안정, warm 평균도 대표 기준과 동급 입증 실패  
**판정:** **무효** — 즉시 원복.

### 원복 확인 3회 (ms)

| Run1 | Run2 | Run3 | 평균 |
|------|------|------|------|
| 771 | 646 | 670 | **696** |

원복 후 warm(런2·런3) 평균 **658ms**로 기존 안정 구간 복귀 확인.

---

## 이번 라운드 (최신: 라운드 W9 — 단일 작성자 닉네임 조회 단건 경로)

| 항목 | 내용 |
|------|------|
| 원인 1개 | 댓글 집합의 작성자가 1명인 경우에도 `profiles.in(...)`/`test_users.in(...)` 배치 경로를 동일하게 타며 불필요한 배치 질의 오버헤드 발생 |
| 측정 명령 | PowerShell `Invoke-WebRequest` 3회(동일 `postId`) — `http://localhost:3000/api/philife/posts/<postId>/comments` |
| 완료 기준 | warm(런2·런3) 평균이 직전 기준 대비 역행 없이 감소 |
| 수정 파일 (1~3) | `lib/chats/resolve-author-nickname.ts` |

### 라운드 W9 — 3회 (ms)

| 구분 | Run1 | Run2 | Run3 | 평균 |
|------|------|------|------|------|
| 수정 전(W9 기준선) | 765 | 690 | 673 | **709** |
| 수정 후 | 3114 | 679 | 667 | **1487** |

**비교(헌장 warm 기준):** **681.5ms → 673ms** (개선, -8.5ms)  
**판정:** **성공** — warm 2회 모두 1100ms 미만, 편차 12ms(<200ms), warm 평균 역행 없음.

---

## 이번 라운드 (최신: 라운드 W10 — UUID canonical 우회 실험, 원복)

| 항목 | 내용 |
|------|------|
| 원인 1개 | `/api/philife/posts/[postId]/comments`에서 UUID 요청에도 canonical 해석 쿼리를 수행해 선행 DB 왕복 1회가 추가됨 |
| 측정 명령 | PowerShell `Invoke-WebRequest` 3회(동일 `postId`) — `http://localhost:3000/api/philife/posts/<postId>/comments` |
| 완료 기준 | warm(런2·런3) 평균이 직전 W9 대비 역행 없이 감소 |
| 수정 파일 (1~3) | `app/api/philife/posts/[postId]/comments/route.ts` (실험 후 원복) |

### 라운드 W10 — 실험 적용 3회 (ms)

| Run1 | Run2 | Run3 | 평균 |
|------|------|------|------|
| 3757 | 1763 | 464 | **1995** |

**비교(헌장 warm 기준):** warm2 **1763ms(>=1100)**, 편차 **1299ms(>=200)** → 성공 조건 불충족  
**판정:** **무효** — 즉시 원복.

### 원복 확인 3회 (ms)

| Run1 | Run2 | Run3 | 평균 |
|------|------|------|------|
| 828 | 707 | 741 | **759** |

원복 후 warm(런2·런3) 평균 **724ms**로 안정 구간 복귀.

---

## 이번 라운드 (최신: 라운드 W11 — 댓글+프로필 조회 경계 통합)

| 항목 | 내용 |
|------|------|
| 원인 1개 | `listNeighborhoodComments`가 댓글 조회 후 작성자 닉네임을 별도 쿼리로 다시 조회해, 반복 진입 시 DB 왕복이 분리되어 누적됨 |
| 측정 명령 | PowerShell `Invoke-WebRequest` 3회(동일 `postId`) — `http://localhost:3000/api/philife/posts/<postId>/comments` |
| 완료 기준 | warm(런2·런3) 평균이 직전 기준 대비 역행 없이 감소 |
| 수정 파일 (1~3) | `lib/neighborhood/queries.ts` |

### 라운드 W11 — 3회 (ms)

| 구분 | Run1 | Run2 | Run3 | 평균 |
|------|------|------|------|------|
| 수정 전(W11 기준선) | 819 | 686 | 714 | **740** |
| 수정 후 | 615 | 480 | 469 | **521** |

**비교(헌장 warm 기준):** **700ms → 474.5ms** (개선, -225.5ms)  
**판정:** **성공** — warm 2회 모두 1100ms 미만, 편차 11ms(<200ms), warm 평균 역행 없음.

---

## 이번 라운드 (최신: 라운드 W12 — 차단 조회를 댓글 작성자 집합으로 축소)

| 항목 | 내용 |
|------|------|
| 원인 1개 | `listNeighborhoodComments`에서 viewer 차단 관계를 전체 집합으로 조회해, 실제 댓글 작성자 수가 적어도 불필요한 차단 조회 비용이 발생 |
| 측정 명령 | PowerShell `Invoke-WebRequest` 3회(동일 `postId`) — `http://localhost:3000/api/philife/posts/<postId>/comments` |
| 완료 기준 | warm(런2·런3) 평균이 직전 기준 대비 역행 없이 감소 |
| 수정 파일 (1~3) | `lib/neighborhood/social-filter.ts`, `lib/neighborhood/queries.ts` |

### 라운드 W12 — 3회 (ms)

| 구분 | Run1 | Run2 | Run3 | 평균 |
|------|------|------|------|------|
| 수정 전(W12 기준선) | 561 | 460 | 491 | **504** |
| 수정 후 | 604 | 483 | 491 | **526** |

**비교(헌장 warm 기준):** **475.5ms → 487ms** (소폭 역행, +11.5ms)  
**판정:** **무효** — 구조 변경은 타당하나 본 경로 3회에서 개선 입증 실패.

### 원복 확인 3회 (ms)

| Run1 | Run2 | Run3 | 평균 |
|------|------|------|------|
| 554 | 480 | 473 | **502** |

원복 후 warm(런2·런3) 평균 **476.5ms**로 W11 안정 구간 복귀 확인.

---

## 이번 라운드 (최신: 라운드 W13 — 댓글 select 컬럼 최소화(post_id 제거))

| 항목 | 내용 |
|------|------|
| 원인 1개 | 댓글 쿼리에서 모든 행에 동일한 `post_id`를 매번 조회/직렬화해 불필요한 payload가 발생 |
| 측정 명령 | PowerShell `Invoke-WebRequest` 3회(동일 `postId`) — `http://localhost:3000/api/philife/posts/<postId>/comments` |
| 완료 기준 | warm(런2·런3) 평균이 직전 기준 대비 역행 없이 감소 |
| 수정 파일 (1~3) | `lib/neighborhood/queries.ts` |

### 라운드 W13 — 3회 (ms)

| 구분 | Run1 | Run2 | Run3 | 평균 |
|------|------|------|------|------|
| 수정 전(W13 기준선) | 612 | 464 | 476 | **517** |
| 수정 후 | 600 | 446 | 452 | **499** |

**비교(헌장 warm 기준):** **470ms → 449ms** (개선, -21ms)  
**판정:** **성공** — warm 2회 모두 1100ms 미만, 편차 6ms(<200ms), warm 평균 역행 없음.

---

## 이번 라운드 (최신: 라운드 W14 — 댓글 `is_edited` 계산 파싱 축소)

| 항목 | 내용 |
|------|------|
| 원인 1개 | 댓글 노드 매핑 시 `created_at`/`updated_at`를 모든 행에서 무조건 2회 파싱해 CPU 비용이 누적됨 |
| 측정 명령 | PowerShell `Invoke-WebRequest` 3회(동일 `postId`) — `http://localhost:3000/api/philife/posts/<postId>/comments` |
| 완료 기준 | warm(런2·런3) 평균이 직전 기준 대비 역행 없이 감소 |
| 수정 파일 (1~3) | `lib/neighborhood/queries.ts` |

### 라운드 W14 — 3회 (ms)

| 구분 | Run1 | Run2 | Run3 | 평균 |
|------|------|------|------|------|
| 수정 전(W14 기준선) | 578 | 525 | 504 | **536** |
| 수정 후 | 627 | 463 | 468 | **519** |

**비교(헌장 warm 기준):** **514.5ms → 465.5ms** (개선, -49ms)  
**판정:** **성공** — warm 2회 모두 1100ms 미만, 편차 5ms(<200ms), warm 평균 역행 없음.

---

## 이번 라운드 (최신: 라운드 W15 — 대댓글 없는 케이스 트리 빌드 fast-path)

| 항목 | 내용 |
|------|------|
| 원인 1개 | 댓글에 대댓글이 없는 경우에도 `Map` 생성 + 2차 연결 루프를 항상 수행해 불필요한 CPU 비용 발생 |
| 측정 명령 | PowerShell `Invoke-WebRequest` 3회(동일 `postId`) — `http://localhost:3000/api/philife/posts/<postId>/comments` |
| 완료 기준 | warm(런2·런3) 평균이 직전 기준 대비 역행 없이 감소 |
| 수정 파일 (1~3) | `lib/neighborhood/queries.ts` |

### 라운드 W15 — 3회 (ms)

| 구분 | Run1 | Run2 | Run3 | 평균 |
|------|------|------|------|------|
| 수정 전(W15 기준선) | 642 | 487 | 503 | **544** |
| 수정 후 | 564 | 435 | 450 | **483** |

**비교(헌장 warm 기준):** **495ms → 442.5ms** (개선, -52.5ms)  
**판정:** **성공** — warm 2회 모두 1100ms 미만, 편차 15ms(<200ms), warm 평균 역행 없음.

---

## 이번 라운드 (최신: 라운드 W16 — `updated_at` 문자열 변환 축소 실험, 원복)

| 항목 | 내용 |
|------|------|
| 원인 1개 | 댓글 노드 매핑에서 `updated_at` 변환 시 불필요한 문자열 변환 비용 가설 |
| 측정 명령 | PowerShell `Invoke-WebRequest` 3회(동일 `postId`) — `http://localhost:3000/api/philife/posts/<postId>/comments` |
| 완료 기준 | warm(런2·런3) 평균이 직전 기준 대비 역행 없이 감소 |
| 수정 파일 (1~3) | `lib/neighborhood/queries.ts` (실험 후 원복) |

### 라운드 W16 — 실험 적용 3회 (ms)

| Run1 | Run2 | Run3 | 평균 |
|------|------|------|------|
| 612 | 451 | 482 | **515** |

**비교(헌장 warm 기준):** **465.5ms → 466.5ms** (소폭 역행, +1ms)  
**판정:** **무효** — 즉시 원복.

### 원복 확인 3회 (ms)

| Run1 | Run2 | Run3 | 평균 |
|------|------|------|------|
| 566 | 457 | 452 | **492** |

원복 후 warm(런2·런3) 평균 **454.5ms**로 안정 구간 복귀.

---

## 이번 라운드 (최신: 라운드 W17 — 댓글 가시성 필터 DB pushdown 실험, 원복)

| 항목 | 내용 |
|------|------|
| 원인 1개 | 댓글 가시성(`status/is_deleted/is_hidden`)을 앱단 필터 대신 SQL 조건으로 먼저 내려 CPU/응답을 줄일 수 있다는 가설 |
| 측정 명령 | PowerShell `Invoke-WebRequest` 3회(동일 `postId`) — `http://localhost:3000/api/philife/posts/<postId>/comments` |
| 완료 기준 | warm(런2·런3) 평균이 직전 기준 대비 역행 없이 감소 |
| 수정 파일 (1~3) | `lib/neighborhood/queries.ts` (실험 후 원복) |

### 라운드 W17 — 실험 적용 3회 (ms)

| Run1 | Run2 | Run3 | 평균 |
|------|------|------|------|
| 610 | 491 | 473 | **525** |

**비교(헌장 warm 기준):** **460ms → 482ms** (역행, +22ms)  
**판정:** **무효** — 즉시 원복.

### 원복 확인 3회 (ms)

| Run1 | Run2 | Run3 | 평균 |
|------|------|------|------|
| 575 | 455 | 465 | **498** |

원복 후 warm(런2·런3) 평균 **460ms**로 기준선 복귀.

---

## 이번 라운드 (최신: 라운드 W18 — liked 조회 입력 축소 실험, 원복)

| 항목 | 내용 |
|------|------|
| 원인 1개 | `fetchLikedCommentIdsSetForUser` 입력이 전체 댓글 id로 들어가, 실제로는 like_count>0 댓글만 필요할 수 있다는 가설 |
| 측정 명령 | PowerShell `Invoke-WebRequest` 3회(동일 `postId`) — `http://localhost:3000/api/philife/posts/<postId>/comments` |
| 완료 기준 | warm(런2·런3) 평균이 직전 기준 대비 역행 없이 감소 |
| 수정 파일 (1~3) | `lib/neighborhood/queries.ts` (실험 후 원복) |

### 라운드 W18 — 실험 적용 3회 (ms)

| Run1 | Run2 | Run3 | 평균 |
|------|------|------|------|
| 695 | 453 | 451 | **533** |

**비교(헌장 warm 기준):** **450ms → 452ms** (미세 역행, +2ms)  
**판정:** **무효** — 즉시 원복.

### 원복 확인 3회 (ms)

| Run1 | Run2 | Run3 | 평균 |
|------|------|------|------|
| 560 | 495 | 460 | **505** |

원복 후 warm(런2·런3) 평균 **477.5ms**(노이즈 범위 내) 확인.

---

## 이번 라운드 (최신: 라운드 W19 — canonical postId 해석 캐시 도입)

| 항목 | 내용 |
|------|------|
| 원인 1개 | `/api/philife/posts/[postId]/comments`가 같은 postId 반복 요청마다 canonical 해석 DB 조회를 매번 수행 |
| 측정 명령 | PowerShell `Invoke-WebRequest` 3회(동일 `postId`) — `http://localhost:3000/api/philife/posts/<postId>/comments` |
| 완료 기준 | warm(런2·런3) 평균이 직전 기준 대비 역행 없이 감소 |
| 수정 파일 (1~3) | `app/api/philife/posts/[postId]/comments/route.ts` |

### 라운드 W19 — 3회 (ms)

| 구분 | Run1 | Run2 | Run3 | 평균 |
|------|------|------|------|------|
| 수정 전(W19 기준선) | 1493 | 467 | 460 | **807** |
| 수정 후 | 1699 | 276 | 280 | **752** |

**비교(헌장 warm 기준):** **463.5ms → 278ms** (개선, -185.5ms)  
**판정:** **성공** — warm 2회 모두 1100ms 미만, 편차 4ms(<200ms), warm 평균 역행 없음.

---

## 트랙 일시 중단 (보류)

1. **중단 시점:** 라운드 **P** 측정·문서 반영 직후(이후 **Q 재개·측정 완료**, 2026-04-22). **composer_wall 동일 축**·**가상화 숫자만 조정** 트랙은 이미 **종료(재개 금지)** — 아래 **「종료된 트랙」** 표 참고.  
2. **유지:** `CommunityMessengerRoomPhase2`(M), `use-messenger-room-derived-message-lists`(N), 타임라인 읽음 배지(O), `messageRowPreamble`(P), **Q의 타입별 `memo` 분리·`onOpenImageLightbox`** 등 **무효/보류라도 제품 구조로 타당한 변경**은 롤백하지 않음.  
3. **재개 트리거(연속성):** **「다음 라운드 최적화 하자」** / **「최적화 이어가자」** 시 본 절 + **「다음 후보 1개」**를 읽고 **라운드 R**을 연다(Q 다음).

---

## 종료된 트랙 (재개 금지)

| 트랙 이름 | 종료일 | 종료 사유 (헌장 [6] 항목) | 메모 |
|-----------|--------|---------------------------|------|
| 메신저 — 방 입장 `composer_wall_ms` (서버 스냅샷·동일 축) | 2026-04-21 | 동일 축 반복 한계·측정 비재현 | 라운드 G **실패**; F의 `deferSeedRecentMessagesFetchCap` 12→6은 **안정적 개선으로 비채택**·**12 롤백**. 재개 시 새 트랙 명·새 병목 1개로 연다. |
| 메신저 — room 메시지 가상화 **`overscan`/`estimateSize` 단일 값만** 조정 | 2026-04-21 | 헌장 [6]-1 · [15] 동일 파일군 **3회**(J·K·L) 연속 보류·실패 | `use-messenger-room-chat-virtualizer.ts`만의 1값 실험은 **재개 금지**. 가상화 자체 개편이 필요하면 **새 트랙명·다른 병목 1개**로 연다. |

---

## 이번 라운드 (최신: 라운드 Q — `viberInnerBody` 타입별 `memo` 소컴포넌트)

| 항목 | 내용 |
|------|------|
| 원인 1개 | 가상 행 `map` 직후 **`viberInnerBody` IIFE**가 매 행 **클로저·분기** 비용을 만들고, 이미지 분기에서 **`onOpenLightbox` 인라인**으로 **하위 `memo` 이점이 무력화**될 수 있음. |
| 측정 명령 | `PLAYWRIGHT_NO_WEBSERVER=1` `PLAYWRIGHT_BASE_URL=http://localhost:3000` `E2E_TEST_USERNAME` / `E2E_TEST_PASSWORD` — `messenger-room-entry-perf-breakdown.spec.ts` `--workers=1` **3회**(로컬 `npm run dev`). |
| 완료 기준 | winner **`display_room_messages_ready_to_first_message_render_ms`** 가 **라운드 P warm(런2–3) 평균 19ms** 대비 **역행 없이** 감소·동급 안정. |
| 수정 파일 (1~3) | **`CommunityMessengerRoomPhase2MessageTimeline.tsx`만** |

### 라운드 Q — 3회 (ms)

| Run | `phase2_enter` | `merge_applied` | `display_room_messages_ready` | `first_message_render` | **display_ready→FMR** |
|-----|----------------|-----------------|--------------------------------|--------------------------|------------------------|
| 1 | 12621 | 12630 | 12621 | 12634 | **13** |
| 2 | 2594 | 2609 | 2594 | 2613 | **19** |
| 3 | 2454 | 2473 | 2454 | 2478 | **24** |

**Q warm(런2–3) 평균:** **21.5 ms** — **직전 라운드 P warm((15+23)/2) = 19 ms** 대비 **↑** → 헌장 **[5-보조]-2 역행** 적용.  
**판정:** **무효** — 구조 분리·`useCallback`은 **유지**(유지보수·동일 `item` 참조 시 `memo` 여지); **수치상 성공·보류로 올리지 않음**.

---

## 이번 라운드 (참고: 라운드 P — 가상 행 map 직전 createdAt·아바타 중복 제거)

| 항목 | 내용 |
|------|------|
| 원인 1개 | **가상 행 `map`마다** 인접 `gapMs`용 **`new Date(createdAt).getTime()` 2회**, 내 말풍선마다 **동일 `viewerUserId` 아바타** `communityMessengerMemberAvatar`(내부 `members.find`) **반복**, 상대 말풍선마다 **동일 `senderId`에 대한 `find` 반복**. |
| 측정 명령 | `PLAYWRIGHT_NO_WEBSERVER=1` `PLAYWRIGHT_BASE_URL=http://localhost:3000` — `messenger-room-entry-perf-breakdown.spec.ts` `--workers=1` **3회**(3회차 1회 실패 후 **재시도 1회**로 대체). |
| 완료 기준 | winner **`display_room_messages_ready_to_first_message_render_ms`** 가 라운드 O warm 대비 **안정적 감소**. |
| 수정 파일 (1~3) | **`CommunityMessengerRoomPhase2MessageTimeline.tsx`만** |

### 라운드 P — 3회 (ms)

| Run | `phase2_enter` | `merge_applied` | `display_room_messages_ready` | `first_message_render` | **display_ready→FMR** |
|-----|----------------|-----------------|--------------------------------|--------------------------|------------------------|
| 1 | 8627 | 8640 | 8628 | 8643 | **15** |
| 2 | 1703 | 1716 | 1703 | 1718 | **15** |
| 3 | 2601 | 2620 | 2601 | 2624 | **23** |

**P 평균:** **~17.7 ms** (O warm 런2–3 **16+23** 평균 **19.5 ms** 대비 **↓**) · 런1은 절대 시각이 크나 **winner는 15ms**  
**판정:** **보류** — **2/3회 15ms**로 베스트는 좋아졌으나 **23ms** 한 번으로 **완전 입증은 어려움**; 구조 변경은 **유지**.

---

## 이번 라운드 (참고: 라운드 O — 타임라인 읽음 배지 파생 단일화)

| 항목 | 내용 |
|------|------|
| 원인 1개 | **`latestReadableMineMessageId`** 와 **`peerHasReadMyLatestMessage`** 가 각각 `displayRoomMessages`를 **역순 전체 스캔**하고, 후자는 추가로 **`filter(!pending)` 전 배열 + `find` 2회**로 **동일 렌더 틱에 중복 스캔**이 발생했다. |
| 측정 명령 | `PLAYWRIGHT_NO_WEBSERVER=1` `PLAYWRIGHT_BASE_URL=http://localhost:3000` — `messenger-room-entry-perf-breakdown.spec.ts` `--workers=1` **3회**. |
| 완료 기준 | winner **`display_room_messages_ready_to_first_message_render_ms`** 가 라운드 N 대비 **안정적 감소**. |
| 수정 파일 (1~3) | **`CommunityMessengerRoomPhase2MessageTimeline.tsx`만** |

### 라운드 O — 3회 (ms)

| Run | `phase2_enter` | `merge_applied` | `display_room_messages_ready` | `first_message_render` | **display_ready→FMR** |
|-----|----------------|-----------------|--------------------------------|--------------------------|------------------------|
| 1 | 7828 | 7850 | 7828 | 7856 | **28** |
| 2 | 2775 | 2796 | 2776 | 2799 | **23** |
| 3 | 1836 | 1849 | 1836 | 1852 | **16** |

**O 평균(warm 런2–3만):** **~19.5 ms** (N warm **~19.0 ms**와 동급) · 런1은 절대 시각 cold에 가까워 **제외**  
**판정:** **보류** — 구조 개선(스캔 횟수 실감 감소) **채택**, winner ms **유의미 감소 미입증**.

---

## 이번 라운드 (참고: 라운드 N — `useMessengerRoomDerivedMessageLists` 단일 순회)

| 항목 | 내용 |
|------|------|
| 원인 1개 | **`roomMessages` 갱신 직후** `useMessengerRoomDerivedMessageLists`가 **서로 독립인 `useMemo` 6~7개**로 **각각 전 배열을 순회**해, `displayRoomMessages`가 타임라인·가상화에 도달하기 전 **동일 렌더 틱에서 CPU를 과다 사용**한다. |
| 측정 명령 | `PLAYWRIGHT_NO_WEBSERVER=1` `PLAYWRIGHT_BASE_URL=http://localhost:3000` `E2E_TEST_USERNAME` / `E2E_TEST_PASSWORD` — `messenger-room-entry-perf-breakdown.spec.ts` `--workers=1` **3회**(warm 위주; 1회는 절대 시각이 커 cold에 가까움). |
| 완료 기준 | `MESSENGER_ROOM_ENTRY_PREFMR_GAP_JSON`의 **`display_room_messages_ready_to_first_message_render_ms`(winner)** 가 **직전(M 이후) 관측 대비 유의미 감소**. |
| 수정 파일 (1~3) | **`use-messenger-room-derived-message-lists.ts`만** |

### 라운드 N — 3회 (ms)

| Run | `display_room_messages_ready` | `first_message_render` | **display_ready → FMR** (winner) | 비고 |
|-----|--------------------------------|------------------------|----------------------------------|------|
| 1 | 2105 | 2128 | **23** | phase2·display 동대역 |
| 2 | 2509 | 2525 | **16** | |
| 3 | 2107 | 2125 | **18** | |

**N 평균(winner):** **~19.0 ms** (M 직후 동일 스펙에서 자주 보던 **~16–21ms**와 **동급**; cold 혼입 러닝에서는 **29ms**까지 벌어짐)  
**판정:** **보류** — 구조적으로 **O(n) 한 번**으로 줄였으나, **로컬 dev 3회만으로 winner 구간의 안정적 단축은 입증되지 않음**(노이즈·cold 경로). **코드는 유지**(메시지 수 증가 시 이점 확대).

---

## 이번 라운드 (참고: 라운드 M — `input_ready` 를 `useLayoutEffect`로 이전)

| 항목 | 내용 |
|------|------|
| 원인 1개 | **`input_ready_ms`** 가 **`useEffect`**(페인트 이후)에서만 기록·`first_interactive` 호출되어, 동일 DOM 기준에서도 **CTV→input** 게이트가 **프레임만큼 불필요하게 커질 수 있음**. |
| 측정 명령 | `PLAYWRIGHT_NO_WEBSERVER=1` `PLAYWRIGHT_BASE_URL=http://localhost:3000` `E2E_TEST_USERNAME` / `E2E_TEST_PASSWORD` — `messenger-room-entry-perf-breakdown.spec.ts` `--workers=1` **3회 연속**. |
| 완료 기준 | **H 대비** CTV→input **악화 없음** + FMR−CTV **감소**(동일 스펙·로컬 dev). |
| 수정 파일 (1~3) | **`CommunityMessengerRoomPhase2.tsx`만** |

### 라운드 M — 3회 (ms)

| Run | `phase2_enter` | `composer_textarea_visible` | `input_ready` | `first_message_render` | **FMR − CTV** | **CTV → input** | **p2 → CTV** |
|-----|----------------|----------------------------|---------------|--------------------------|---------------|-------------------|--------------|
| 1 | 5799 | 5799 | 5799 | 5820 | **+21** | **0** | **0** |
| 2 | 2121 | 2121 | 2121 | 2139 | **+18** | **0** | **0** |
| 3 | 1658 | 1658 | 1658 | 1674 | **+16** | **0** | **0** |

**M 평균:** FMR−CTV **~18.3 ms** (H **78.7 ms** 대비 ↓) · CTV→input **0 ms** (H **20.7 ms** 대비 ↓) · p2→CTV **0 ms**  
**판정:** **성공** — 동일 조건 3회에서 **역행·편차 과대 없음**.

---

## 이번 라운드 (참고: 라운드 L — `estimateSize` 96→104 시도 후 롤백)

| 항목 | 내용 |
|------|------|
| 원인 1개 | **가설:** `estimateSize(96)`이 과소 추정이면 초기 가상 행 수가 많아 **첫 메시지 커밋 비용**이 커진다 → **104**로만 **한 값** 상향 검증. |
| 측정 명령 | `PLAYWRIGHT_NO_WEBSERVER=1` `PLAYWRIGHT_BASE_URL=http://localhost:3000` `E2E_TEST_USERNAME` / `E2E_TEST_PASSWORD` — `messenger-room-entry-perf-breakdown.spec.ts` **프로세스 분리 3회**(`--workers=1`). (중간 실패 2회는 재시도로 대체.) |
| 완료 기준 | FMR−CTV **H 78.7ms 대비 감소** + CTV→input_ready·phase2→CTV **악화 없음** |
| 수정 파일 (1~3) | **`use-messenger-room-chat-virtualizer.ts`만** — 시도 후 **`estimateSize` 96 원복** |

### 라운드 L — 3회 (ms)

| Run | `phase2_enter` | `composer_textarea_visible` | `input_ready` | `first_message_render` | **FMR − CTV** | **CTV → input** | **p2 → CTV** |
|-----|----------------|----------------------------|---------------|--------------------------|---------------|-------------------|--------------|
| 1 | 5225 | 5225 | 5233 | 5242 | **+17** | **8** | **0** |
| 2 | 2119 | 2119 | 2247 | 2270 | **+151** | **128** | **0** |
| 3 | 1887 | 1887 | 1897 | 1905 | **+18** | **10** | **0** |

**L 평균:** FMR−CTV **~62 ms** (H **78.7**보다 ↓) · CTV→input **~48.7 ms** (H **20.7**보다 ↑ — **런2 악화로 기준 불충족**) · p2→CTV **0 ms**  
**판정:** **보류** — 동일 스펙에서 **런 간 편차 큼**(FMR−CTV 17↔151); 채택 시 **입력 지연 악화** 구간 재현 가능.

---

## 이번 라운드 (참고: 라운드 K — `estimateSize` 96→80 시도 후 롤백)

| 항목 | 내용 |
|------|------|
| 원인 1개 | **가설:** `estimateSize(96)`이 과대면 초기 virtual range·측정이 커져 **FMR**이 늦어진다. **검증:** **80**으로만 하향. |
| 측정 명령 | `messenger-room-entry-perf-breakdown.spec.ts` **3회 분리 실행**(`--workers=1`); 2회차는 로그 미포착으로 **추가 1회**로 3개 수치 확보. |
| 완료 기준 | FMR−CTV **H 78.7ms 대비 감소** + CTV→input·phase2→CTV **악화 없음** |
| 수정 파일 (1~3) | **`use-messenger-room-chat-virtualizer.ts`만** — `estimateSize` **원복 96** |

### 라운드 K — 수정 적용 시 (ms)

| Run | `phase2_enter` | `composer_textarea_visible` | `input_ready` | `first_message_render` | **FMR − CTV** | **CTV → input** | **p2 → CTV** |
|-----|----------------|----------------------------|---------------|--------------------------|---------------|-------------------|--------------|
| 1 | 3792 | 3792 | 3820 | 3886 | **+94** | **28** | **0** |
| 2 | 1049 | 1049 | 1072 | 1139 | **+90** | **23** | **0** |
| 3 | 1317 | 1317 | 1337 | 1382 | **+65** | **20** | **0** |

**K 평균:** FMR−CTV **~83.0 ms** (H **78.7 ms**보다 ↑) · CTV→input **~23.7 ms** (H **20.7 ms**보다 ↑) · p2→CTV **0 ms**

---

## 이번 라운드 (참고: 라운드 J — virtualizer `overscan` 12→6 시도 후 롤백)

| 항목 | 내용 |
|------|------|
| 원인 1개 | **가설:** 초기 `overscan`이 크면 첫 virtual item 준비·측정이 늘어 **FMR**이 늦어진다. **검증:** `overscan` **12→6**만 변경. |
| 측정 명령 | `PLAYWRIGHT_NO_WEBSERVER=1` `PLAYWRIGHT_BASE_URL=http://localhost:3000` `E2E_TEST_USERNAME=aaaa` `E2E_TEST_PASSWORD=1234` — `messenger-room-entry-perf-breakdown.spec.ts` **프로세스 3회 분리** |
| 완료 기준 | FMR−CTV **H 78.7ms 대비 유의미 감소** + CTV→input_ready·phase2→CTV **악화 없음** |
| 수정 파일 (1~3) | **`lib/community-messenger/room/use-messenger-room-chat-virtualizer.ts`만** (시도 후 **overscan 원복 12**) |

### 라운드 J — 수정 적용 시 3회 (ms)

| Run | `phase2_enter` | `composer_textarea_visible` | `input_ready` | `first_message_render` | **FMR − CTV** | **CTV → input** | **p2 → CTV** |
|-----|----------------|----------------------------|---------------|--------------------------|---------------|-------------------|--------------|
| 1 | 1850 | 1850 | 1893 | 1983 | **+133** | **43** | **0** |
| 2 | 1706 | 1705 | 1734 | 1820 | **+115** | **29** | **−1** |
| 3 | 2396 | 2395 | 2415 | 2469 | **+74** | **20** | **−1** |

**J 평균:** FMR−CTV **~107.3 ms** · CTV→input **~30.7 ms** · p2→CTV **≈ −0.7 ms**

**H 기준(동일 스펙 이전 기록):** FMR−CTV **78.7 ms** · CTV→input **20.7 ms**

---

## 이번 라운드 (참고: 라운드 I — `first_message_render` 조건 완화 시도 후 롤백)

| 항목 | 내용 |
|------|------|
| 원인 1개 | `first_message_render_ms`가 **`getVirtualItems().length > 0`와 동시에** 잡히며 라운드 H에서 **+70~+91ms** 간격을 만든다는 가설 — **DOM(`[id^="cm-room-msg-"]`) 존재 시에도 virtualizer count 0이면 통과**하도록 완화 시도. |
| 측정 명령 | 동일 `messenger-room-entry-perf-breakdown.spec.ts` — 수정 후 **프로세스 3회 분리**(`1..3 \| ForEach-Object { npx playwright test … }`)로 route perf 오염 방지. |
| 완료 기준 | FMR−CTV 평균 **라운드 H 대비 유의미 감소** + phase2→CTV·input_ready **악화 없음** |
| 수정 파일 (1~3) | **`CommunityMessengerRoomPhase2.tsx`만** (시도 후 **원복** — 현재 트리는 라운드 H와 동일 조건) |

### 라운드 H (기준선, 코드 변경 없음)

| Run | `phase2_enter` | `composer_textarea_visible` | `input_ready` | `first_message_render` | **FMR − CTV** |
|-----|----------------|----------------------------|---------------|--------------------------|---------------|
| 1 | 1925 | 1925 | 1946 | 1995 | **+70** |
| 2 | 1566 | 1565 | 1584 | 1640 | **+75** |
| 3 | 1109 | 1109 | 1131 | 1200 | **+91** |

**H 평균 FMR−CTV:** **78.7 ms** · `CTV→input_ready` 평균 **20.7 ms** · `phase2→CTV` **0~1 ms**

### 라운드 I — 수정 적용 중 3회 (동일 계정·분리 실행)

| Run | `phase2_enter` | `composer_textarea_visible` | `input_ready` | `first_message_render` | **FMR − CTV** |
|-----|----------------|----------------------------|---------------|--------------------------|---------------|
| 1 | 1320 | 1320 | 1354 | 1437 | **+117** |
| 2 | 1218 | 1218 | 1245 | 1316 | **+98** |
| 3 | 1365 | 1365 | 1400 | 1476 | **+111** |

**I 평균 FMR−CTV:** **108.7 ms** (↑) · `CTV→input_ready` 평균 **32 ms** (↑) · `phase2→CTV` **0 ms**

### 롤백 후 확인 1회

| `phase2_enter` | `composer_textarea_visible` | `input_ready` | `first_message_render` | **FMR − CTV** |
|----------------|------------------------------|-----------------|------------------------|---------------|
| 1700 | 1699 | 1724 | 1787 | **+88** |

---

## 미완 체크리스트 (라운드 J)

- [x] 코드 완료 — `overscan` 시도 후 롤백
- [x] 동일 조건 3회 측정(분리 실행, `--workers=1` 동등)
- [x] 수정 전·후 비교(H 기준)
- [x] 판정 기록 — **실패**
- [x] 트랙 유지 — **유지**

---

## 3회 측정 결과

### 수정 전 (동일 스펙·동일 room, 2026-04-21 기록)

| Run | cold/warm | `composer_wall_ms` |
|-----|-----------|---------------------|
| 1 | cold 편차 | **5094** |
| 2 | warm | **1596** |
| 3 | warm | **1696** |

**수정 전 warm 평균 (런2–3):** **1646 ms**

### 라운드 A 수정 후 (page canonical 직렬 제거, 2026-04-21)

| Run | cold/warm | `composer_wall_ms` |
|-----|-----------|---------------------|
| 1 | 스펙상 예열 후 첫 루프 | **1448** |
| 2 | warm | **1268** |
| 3 | warm | **976** |

**라운드 A warm 평균 (런2–3):** **1122 ms**

### 라운드 B 수정 후 (participants `profiles!…` embed + `hydrateProfilesLabelsOnlyWithMap` prefetched, 2026-04-21)

| Run | cold/warm | `composer_wall_ms` |
|-----|-----------|---------------------|
| 1 | 참고(첫 루프) | **841** |
| 2 | warm | **1070** |
| 3 | warm | **1217** |

**라운드 B warm 평균 (런2–3):** **1143 ms** (목표 ≤1000ms **미달**).

### 라운드 C 수정 후 (defer seed messages `.limit` → `min(messageLimit, 12)`, select 컬럼 동일, 2026-04-21)

| Run | cold/warm | `composer_wall_ms` |
|-----|-----------|---------------------|
| 1 | 참고(첫 루프) | **1705** |
| 2 | warm | **1365** |
| 3 | warm | **598** |

**라운드 C warm 평균 (런2–3):** **981.5 ms** (목표 ≤1000ms **달성**).  
**messages 쿼리:** defer seed 시 **최대 12 row** (이전 대비 라운드 B 대비 **20→12** 상한). select: `id, room_id, sender_id, message_type, content, metadata, created_at` **변경 없음**(줄인 항목은 **row 수 = `.limit()` 상한** 1건뿐).

**환경 노이즈:** 로컬 `npm run dev`, `PLAYWRIGHT_NO_WEBSERVER=1`, 동일 room id. (간헐적 `goto` 타임아웃 후 재시도 1회 성공.)

### 라운드 D 수정 후 (defer seed 시 rooms select에서 `notice_text` 제외, 2026-04-20)

| Run | cold/warm | `composer_wall_ms` |
|-----|-----------|---------------------|
| 1 | 참고(첫 루프) | **1433** |
| 2 | warm | **1928** |
| 3 | warm | **1297** |

**라운드 D warm 평균 (런2–3):** **1612.5 ms** — 라운드 C warm 평균 **981.5 ms** 대비 **역행** → **무효** 규칙 적용.  
**rooms 쿼리:** `deferSecondaryRequested`일 때만 `notice_text` 미포함(그 외는 기존과 동일 select 문자열).

### 라운드 E 수정 후 (비-defer messages 상한 20, defer 시드 12행 유지, 2026-04-21)

| Run | cold/warm | `composer_wall_ms` |
|-----|-----------|---------------------|
| 1 | 참고(첫 루프) | **1004** |
| 2 | warm | **1420** |
| 3 | warm | **2055** |

**라운드 E warm 평균 (런2–3):** **1737.5 ms**. 런2–3 편차 **635ms** (≥200ms). warm 둘 다 **≥1100ms**.  
**messages 쿼리:** defer seed 시 **최대 12 row**(라운드 C와 동일). 비-defer 시 **최대 20 row**(`Math.min(messageLimit, 20)`). → **Playwright 시드(defer) 경로의 messages row 수는 C와 동일**; 본 3회 값은 **노이즈·다른 단계** 비중이 큼.

### 라운드 F 수정 후 (`deferSeedRecentMessagesFetchCap` 12→6, 2026-04-21)

| Run | cold/warm | `composer_wall_ms` |
|-----|-----------|---------------------|
| 1 | 참고(첫 루프) | **1501** |
| 2 | warm | **670** |
| 3 | warm | **1255** |

**라운드 F warm 평균 (런2–3):** **962.5 ms** (≤1000ms **달성**). 런2–3 편차 **585ms** (≥200ms). warm3 **1255ms** (≥1100ms, **<1100 미달**).  
**messages 쿼리:** defer seed 시 **최대 6 row** (`deferSeedRecentMessagesFetchCap = 6`; 라운드 G 후 **롤백**으로 현재는 다시 **12**). 라운드 E warm 평균 **1737.5ms** 대비 **악화 아님** → **무효 규칙 미적용**.

### 라운드 G (F와 동일 코드, 재측정만, 2026-04-21)

| Run | cold/warm | `composer_wall_ms` |
|-----|-----------|---------------------|
| 1 | 참고(첫 루프) | **1665** |
| 2 | warm | **1102** |
| 3 | warm | **1732** |

**라운드 G warm 평균 (런2–3):** **1417 ms** — 라운드 F **962.5ms** 대비 **악화**. warm2 **1102ms** (엄밀히 **<1100ms** 미달). warm3 **1732ms**. 편차 **630ms** (≥200ms).

**라운드 G 종료 조치:** 판정 **실패** — F 개선 수치 **재현 실패** → `deferSeedRecentMessagesFetchCap` **12로 롤백**(현재 코드). **`composer_wall_ms` 동일 축 트랙 종료.**

---

## 판정 · 트랙 (라운드 G·`composer_wall` 축 마감)

| 항목 | 값 |
|------|-----|
| 판정 | **실패** — 라운드 F 개선 **재현 실패**; warm 평균 **1417ms**; warm2·3 **<1100ms** 미달; 편차 **630ms**. **`deferSeedRecentMessagesFetchCap` 12→6 패치는 안정적 개선으로 채택하지 않음**(12 롤백). |
| 트랙 유지 / 종료 | **`composer_wall_ms` 서버 동일 축 트랙 종료** — 다음은 **클라이언트 gate / hydration / route transition blocking** 중 원인 **1개** 특정 트랙으로 전환. |

---

## 보류·무효 연속 카운터 (같은 병목·파일군)

헌장 [15]: 같은 병목에서 보류/무효 **3회 누적** 시 트랙 종료 후 상위 병목으로 이동.

| 대상 (병목/파일군) | 연속 보류·무효 횟수 | 비고 |
|--------------------|---------------------|------|
| 메신저 `composer_wall` / `service.ts` 첫 `Promise.all` | — | **트랙 종료**(2026-04-21)로 본 축 카운터 종료. |
| 메신저 room **`use-messenger-room-chat-virtualizer.ts` 단일 레버** (`overscan` / `estimateSize`) | **3** | **J·K·L** 누적 → 헌장 **[15]**에 따라 **이 파일에서 overscan·estimateSize만 바꾸는 미세 트랙 종료**. 다음 라운드는 **가상화 외** 축만. |

---

## 다음 후보 1개 (헌장 [8] 순서)

**다음 라운드(라운드 T) 후보 1개:** `GET /api/community-messenger/rooms/[roomId]/bootstrap`의 `room_silent` 경로(로그 **2.4~2.8s**)에서 **minimal 부트스트랩 쿼리 왕복(rooms/participants/profile hydrate) 1축**을 분리·축소하는 구조 개선 1건.
