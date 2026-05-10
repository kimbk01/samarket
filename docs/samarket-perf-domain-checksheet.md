# 체감 성능 — 도메인별 체크시트 · 완료율

> **범위**: 탭·전환·부트스트랩·리스트·입력 가능 시점 등 **체감 속도**만.  
> **제외(별도 관리)**: UI 토큰·시맨틱 클래스·카피·비주얼 규격 → `AGENTS.md`, `app/design-tokens.css`, `app/samarket-components.css` 등.

**작업 시작 즉시**: 아래 체크를 도메인별로 검토하고, 해당 라운드에서 다룬 항목만 `[x]`로 바꾼 뒤 **요약 표의 %**를 다시 계산한다.

---

## 완료율 산식 (도메인 간 동일)

각 도메인마다 **항목 수가 동일(각 5개)**이므로, 비교 가능한 %는 다음 한 가지로만 맞춘다.

\[
\text{도메인 완료율(\%)} = \frac{\text{해당 도메인에서 체크된 항목 수}}{5} \times 100
\]

---

## 체크시트 ↔ 최적화 (완료 / 미완료)

| 구분 | 의미 | 적는 곳 |
|------|------|---------|
| **완료** | 해당 `#` 행 기준을 **측정 또는 합의된 기준**으로 충족했다고 판단 → `[x]` | **본 파일만** `[x]` + 위 요약 표 `%` 재계산. |
| **미완료** | 아직 `[ ]` | 라운드 수치·판정·가설은 **[samarket-performance-track-state.md](./samarket-performance-track-state.md)**에만 쌓고, **증거 없이 `[x]`를 켜지 않는다.** |

**참조 수준 (본 체크시트 기준):** 메신저 **카카오톡** · 거래+커뮤니티 **당근마켓** · 배달·서비스형 **배달의민족**. 메신저 구간 ms·경고선은 [messenger-performance-targets.md](./messenger-performance-targets.md)(카톡·라인 참조)와 맞춘다.  
> [samarket-native-feel-charter.md](./samarket-native-feel-charter.md) 본문의 메신저 표현은 **텔레그램·바이버**로 남아 있다. **제품 운영에서의 체크시트 참조 앱**은 본 문서 표기(카카오톡 등)를 따른다.

**세 축 동시에 맞추는 권장 순서·게이트:** [samarket-parity-execution-order.md](./samarket-parity-execution-order.md) — **마스터 순서 0→5**(셸→당근→배민→카톡→횡단)·속도 구조 표(A~H)·라운드마다 `npm run verify:parity-gates` 최소 통과.

---

## 요약 (매 작업/라운드 끝에 갱신)

| 도메인 | 참조 수준 | 완료 항목 | 전체 | 완료율 |
|--------|-----------|-----------|------|--------|
| 거래 + 커뮤니티 | 당근마켓급 | 0 | 5 | **0%** |
| 메신저 | 카카오톡급 | 0 | 5 | **0%** |
| 배달·서비스형 | 배달의민족급 | 0 | 5 | **0%** |

---

## 1) 거래 + 커뮤니티 (당근마켓 수준)

| # | 기준 (체감 성능) | 완료 |
|---|------------------|------|
| 1 | 대표 경로: 목록(또는 피드) → 상세 전환이 체감상 즉시에 가깝다 (측정 또는 합의된 기준 충족) | [ ] |
| 2 | 상세 → **거래/커뮤니티** 채팅 진입이 빠르고, 진입 직후 입력·스크롤이 막히지 않는다 | [ ] |
| 3 | 이미지·카드가 있는 목록에서도 스크롤·탭이 버벅이지 않는다 | [ ] |
| 4 | 뒤로가기·재진입·같은 상세 반복 진입이 빠르다 | [ ] |
| 5 | 탭·필터·리스트 항목 **선택 시 즉시** 반응(로딩·전환이 체감상 끊기지 않음)한다 | [ ] |

**최근 증거(완료 체크 아님):** 라운드 **P1**(2026-05-10) — `/post/[id]` 에서 `getItemDetailPageData` 첫 블록이 **`getTradeDetailRelatedData` 를 await 하지 않음**. related 는 **`Suspense` + `PostDetailRelatedDeferredLoader`** 로 동일 `getTradeDetailRelatedData`·`preloadedItem` 스트림. `verify:trade-hot-path-contract` 통과. **2026-05-10 핫패스 마감 점검** — `openCreateTradeChat` 비대기·번들 직접 호출 없음 재확인(구조 변경 없음). **라운드 S1**(마스터 순서 1·셸) — `BottomNav` idle·부트웜 `/stores` prewarm 이 BN3 와 **동일 region home-feed suffix**. `verify:parity-gates` 통과. 체크시트 §1 `[x]` 는 **동일 조건 3회 측정·합의 전** 유지.

---

## 2) 메신저 (카카오톡 수준)

> **최근 증거 (기준선만, 항목 완료 아님):** 2026-04-21 로컬 dev, `messenger-composer-snapshot-three-stable.spec.ts` 3회 — `composer_wall_ms` 런1 **5094** ms, 런2 **1596** ms, 런3 **1696** ms. [messenger-performance-targets.md](./messenger-performance-targets.md) 방 입장 행 경고 **1000ms** 대비 warm도 미달 → 아래 `[ ]` 유지. **추가(2026-04-23):** 라운드 M — `messenger-room-entry-perf-breakdown` 3회 **CTV→input 0ms**, FMR−CTV **~18ms**대(H 대비 개선). 라운드 R — `home-sync`(2.0~2.1s 반복)·`store-owner-hub-badge`(~974ms) 서버 병목 구조 수정 반영. 라운드 S — 전역 unread 브리지의 `list_prefetch(force)` 남발 제거(메신저 허브 전용 + TTL 재사용 + 방별 20s 쿨다운)로 탭 전환 경합 완화(실측 3회 전/후 대기). 라운드 U — 커뮤니티 `/philife`의 **주제/정렬 쿼리 진입도 RSC 시드**하도록 확장하고 `CommunityFeed`를 시드 상태로 직접 부팅해 스켈레톤 빈화면 구간 축소(실측 3회 전/후 대기). 전체 **즉시 입력**·`composer_wall` SLO 합의 전까지 `[ ]` 유지. (연동표: [samarket-performance-track-state.md](./samarket-performance-track-state.md) 「체크시트 연동 — 메신저」.)

| # | 기준 (체감 성능) | 완료 |
|---|------------------|------|
| 1 | 채팅방 탭 후 **즉시 입력** 가능에 가깝다 (`composer_wall_ms` 등 프로젝트 측정과 정합) | [ ] |
| 2 | 메시지 목록·말풍선이 늦게 뜨지 않는다 (부트스트랩·렌더 지연 기준 충족) | [ ] |
| 3 | 스크롤·재진입·뒤로가기에서 멈춤이 적다 | [ ] |
| 4 | 배지·읽음·목록 상태가 대표 경로에서 즉시 맞는다 | [ ] |
| 5 | 탭·채팅 선택 시 **즉시** 반응한다 | [ ] |

---

## 3) 배달·서비스형 (배달의민족 수준)

| # | 기준 (체감 성능) | 완료 |
|---|------------------|------|
| 1 | 스토어/주문 관련 **목록 → 상세** 전환이 빠르다 | [ ] |
| 2 | 주문·서비스형 상세 화면이 즉시 반응한다 | [ ] |
| 3 | 카테고리·상단 탭·세그먼트 이동이 빠르다 | [ ] |
| 4 | 뒤로가기·반복 진입이 빠르다 | [ ] |
| 5 | 리스트 항목·CTA **선택 즉시** 반응한다 | [ ] |

**최근 증거(완료 체크 아님):**
- 라운드 **BZ1** — `/mypage/business?storeId=...` 진입에서 RSC가 상품 목록 쿼리를 선로딩하며 cold `time_starttransfer`가 **4.881s**까지 상승하던 병목을 제거. 수정 후 cold **0.286s**, warm 평균(런2–3) **0.117s**.
- 라운드 **BZ2** — 내 매장 로드에서 “닉네임 보강용 2번째 stores 조회”를 제거해 warm 평균 `time_starttransfer` **0.1167s → 0.0590s**로 감소.
- 라운드 **BN1** — 하단 탭 직후 비목적지 Philife feed warm 경합 제거. `/stores → /mypage` 3회에서 클릭 후 1.5s 창의 slowest API가 `/api/philife/neighborhood-feed` **1235/1157/704ms → me/stores·notification 116/18/90ms**로 변경. 전체 하단 탭 SLO는 Run3 dev 튐으로 아직 `[ ]`.
- 라운드 **BN2** — `/market → /stores` 3회에서 목적지 `/api/stores/home-feed?region=Quezon+City` 동일 URL 중복 요청이 **1/2/2회 → 1/1/1회**로 정리되고, `routeSettledMs` 는 **760/197/133ms → 492/185/93ms**. taxonomy/feed 자체 지연은 남아 있어 전체 배민급 완료 체크는 아직 `[ ]`.
- 라운드 **BN3** — Stores 탭 pointerdown prewarm 키를 실제 지역 피드 키와 정렬. 실제 포인터 측정 3회에서 마운트 후 `/api/stores/home-feed?region=Quezon+City` 는 **8/8/8ms**로 합류, `routeSettledMs` **140/87/79ms**, `firstShellVisibleMs` **161/104/98ms**. taxonomy 축은 **BN4·BN5** 참고.
- 라운드 **BN4** — `GET /api/stores/taxonomy` 에서 `store_categories`·`store_topics` 조회를 **Promise.all 병렬화**. 수정 전 taxonomy slowest **375/477/316ms**; 수정 후 **319/219/250ms**(배치 A)·**330/245/460ms**(배치 B, Run3 dev 경합 가능). 배치 B 동시 기록: `firstShellVisibleMs` **115/111/99ms**, `routeSettledMs` **97/93/80ms**.
- 라운드 **BN5** — `fetchStoresTaxonomyDeduped` 에 **120s TTL** + 탭 prewarm 시 taxonomy 선요청(`isStoresTaxonomyClientCacheFresh` 로 중복 억제). 어드민 taxonomy 재로드 시 `clearStoresTaxonomyClientCache`. **prod-like nav-perf·체크시트 `[x]`** 는 별도. 전체 배민급 완료 체크는 아직 `[ ]`.
- 라운드 **S1**(마스터 **순서 1**·셸·탭) — idle·부트웜 `prewarmBottomNavTapTargetClientCache("/stores")` 에 **BN3 과 동일** `storeHomeFeedSuffixFromPrimaryRegion` 를 넘겨, pointerdown 없이 진입해도 지역 `home-feed` 캐시 키가 맞게 정렬. `verify:parity-gates` 통과.
(상세: `docs/samarket-performance-track-state.md` 참고)

---

## 관련 문서

- [samarket-native-feel-charter.md](./samarket-native-feel-charter.md)
- [samarket-performance-track-state.md](./samarket-performance-track-state.md)
- [samarket-parity-execution-order.md](./samarket-parity-execution-order.md)
