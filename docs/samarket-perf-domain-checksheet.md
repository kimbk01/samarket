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
| 거래 + 커뮤니티 | 당근마켓급 | 5 | 5 | **100%** |
| 메신저 | 카카오톡급 | 5 | 5 | **100%** |
| 배달·서비스형 | 배달의민족급 | 0 | 5 | **0%** |

---

## 1) 거래 + 커뮤니티 (당근마켓 수준)

> **완료 승인 (2026-06-10, 제품 합의):** TRADE-AUDIT-0~4 — 핫패스 lock(`verify:trade-hot-path-contract`·`verify:trade-primary-tab-transition`·`verify:trade-perf-checksheet-contract`)·P1 related `Suspense`·BN7 pending enter panel·`openCreateTradeChat` 비대기. 통합 3회 감사(`measure:trade-checksheet-audit`) warm: 서버 RSC p95 **679ms**·재진입 wall p95 **84ms**·탭 전환 p95 **221ms**·목록 스크롤 p95 **762ms**. tap→상세 wall p95 **1560ms**·채팅 textarea p95 **3305ms** 는 **App Router RSC flight·페인트 ceiling**(TRADE-AUDIT-2·M11 동형) — 구조 라운드 **ROI 종료**, shell/overlay 는 별도 제품 합의. (연동: [samarket-performance-track-state.md](./samarket-performance-track-state.md) 「체크시트 연동 — 거래+커뮤니티」·TRADE-AUDIT-4.)

| # | 기준 (체감 성능) | 완료 |
|---|------------------|------|
| 1 | 대표 경로: 목록(또는 피드) → 상세 전환이 체감상 즉시에 가깝다 (측정 또는 합의된 기준 충족) | [x] |
| 2 | 상세 → **거래/커뮤니티** 채팅 진입이 빠르고, 진입 직후 입력·스크롤이 막히지 않는다 | [x] |
| 3 | 이미지·카드가 있는 목록에서도 스크롤·탭이 버벅이지 않는다 | [x] |
| 4 | 뒤로가기·재진입·같은 상세 반복 진입이 빠르다 | [x] |
| 5 | 탭·필터·리스트 항목 **선택 시 즉시** 반응(로딩·전환이 체감상 끊기지 않음)한다 | [x] |

**§1 합의 기준 (2026-06-10):** `trade_detail_total_ms`(서버 RSC) **단독** 판정 금지. 체감 wall 과 서버를 **분리 보고** — warm 서버 p95 **679ms**(핫패스 lock) + wall p95 **1560ms**(framework ceiling 문서화). **TRADE-AUDIT-4** 3회 감사·제품 승인으로 `[x]`.

**최근 증거:** **TRADE-AUDIT-4**(2026-06-10) — `docs/perf/trade-checksheet-audit-latest.json` · `npm run measure:trade-checksheet-audit`. **TRADE-AUDIT-3** — baseline 9380→warm textarea **1137ms**. **TRADE-AUDIT-2** — navigation overhead **~700ms+**. **TRADE-AUDIT-0** — 구조 lock PASS.

---

## 2) 메신저 (카카오톡 수준)

> **완료 승인 (2026-06-10, 제품 합의):** MP-AUDIT-6~10 — 핫패스 lock·홈 bootstrap `failed_count=0`·`home_bootstrap_client_fetch_total≤2`·ACK dev warm avg≈240ms·merge→display **0–1ms**(room_entry E2E 3/3)·`verify:messenger-hot-path-contract` PASS. 라운드 M CTV→input 0ms·구조 PASS0/1/2·zero-fetch reentry lock 유지. (연동: [samarket-performance-track-state.md](./samarket-performance-track-state.md) 「체크시트 연동 — 메신저」·MP-AUDIT-6~10.)

| # | 기준 (체감 성능) | 완료 |
|---|------------------|------|
| 1 | 채팅방 탭 후 **즉시 입력** 가능에 가깝다 (`composer_wall_ms` 등 프로젝트 측정과 정합) | [x] |
| 2 | 메시지 목록·말풍선이 늦게 뜨지 않는다 (부트스트랩·렌더 지연 기준 충족) | [x] |
| 3 | 스크롤·재진입·뒤로가기에서 멈춤이 적다 | [x] |
| 4 | 배지·읽음·목록 상태가 대표 경로에서 즉시 맞는다 | [x] |
| 5 | 탭·채팅 선택 시 **즉시** 반응한다 | [x] |

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
- 라운드 **BN7** — `/stores` 하단 탭 pending enter panel 을 목적지 `StoresHub` 로 즉시 마운트하고, `(stores)/stores/loading`·`StoresHomeHub` 첫 loading 을 카드 스켈레톤 대신 빈 안정면으로 교체. 배달 탭 전환 완료 후 첨부/스켈레톤처럼 보이는 구간 차단. 브라우저 3회 체감 측정 전까지 체크시트 `[x]` 는 유지하지 않음.
- 라운드 **SB2/SB2b** — `/stores` 홈·`/stores/browse/[primary]` 헤더의 1차/2차 업종 선택을 pointerdown prewarm + optimistic active/title + scale 눌림 + 단일 `router.push` 계약으로 정리. `/api/stores/browse?primary=restaurant&sub=chinese` 3회 스모크 warm 평균 `starttransfer` **0.011096s**. 보완 계측에서 browse 2차 `pointerdown→pressed` **89.5/35.4/71.2ms → 1.7/1.3/1.5ms**, 1차 `click→active` **41.0/56.1/45.4ms → 6.2/3.3/2.5ms**, 1차 `click→title` **361.1/81.4/388.0ms → 29.5/15.9/15.3ms**. `/stores` 홈 2차 pressed 도 1회 **1.9ms**. `verify:parity-gates` 통과. 전체 배민급 체크는 목록→상세/뒤로가기 등 남은 항목 합의 전까지 `[ ]`.
- 라운드 **DS1** — `/stores/[slug]` 상세에서 메뉴 apply 가 summary/decorations await 뒤에 묶이던 구조를 분리. 최신 기준 `menu_fetch_ms=871` 에서 수정 후 3회 **278/10/25ms** 로 감소했고 `normalize_ms=0~1`, `apply_ms=0`, `stale_session=false` 유지. `tap_to_menu_first_visible_ms` 전체값·실기기 합의 전까지 체크시트 `[x]` 는 유지하지 않음.
- 라운드 **DS2** — 옵션 시트 open/select/price/validation/add submit breakdown trace 추가. 옵션 있는 상품 3회 측정 전까지 UX 완료 체크는 유지하지 않음.
- 라운드 **DS4** — 카트 옵션 변경 경로의 menus row seed·cart line fallback seed·수량 변경 시 menus 재호출 금지 계약을 `verify:store-cart-sheet-contract` 로 고정하고 `check`·`verify:parity-gates` 에 연결. 추가 더블체크에서 checkout identity fetch 를 idle 뒤로 지연해 첫 진입·옵션 시트와의 네트워크 경합을 줄임. 관련 vitest 통과. 브라우저 체감 3회 측정 전까지 체크시트 `[x]` 는 유지하지 않음.
(상세: `docs/samarket-performance-track-state.md` 참고)

---

## 관련 문서

- [samarket-native-feel-charter.md](./samarket-native-feel-charter.md)
- [samarket-performance-track-state.md](./samarket-performance-track-state.md)
- [samarket-parity-execution-order.md](./samarket-parity-execution-order.md)
