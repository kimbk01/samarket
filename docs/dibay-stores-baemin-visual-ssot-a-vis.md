# DIBAY STORES — BAEMIN VISUAL SSOT

**Status:** `A-VIS = CLOSED` · `PHASE 2 CATEGORY LIST / CUT B = CLOSED` · `PHASE 3 HOME / CUT C = CLOSED` · `PHASE 4 FULL PARITY RUNTIME = CLOSED WITH EVIDENCE-LIMITED DELTAS` (Owner 2026-08-24)

**Non-blocker NOT_PROVEN (preserved):** font family · exact hex · category 3rd row (`SAMPLE_LIMITATION_2_ROWS`) · home food image ratio · timesale row height · high-rating runtime fixture

**PHASE 4 evidence-limited (non-blocking, no fix without new Baemin evidence):** category row height +5.4px · category tile width asymmetry (~93.6 vs ~97.1 equal grid)

**PHASE 4 proven parity (@390 runtime):** category band 390×90.7 · tile height 79.5 · gap 0.5 · HOME timesale thumb 75.1×71.2 · CATEGORY/HOME separation preserved

**Claim rule:** `BAEMIN MEASURED PARITY CLOSED WITH EVIDENCE-LIMITED DELTAS` — **not** `BAEMIN 100% IDENTICAL`

**HEAD reference (DIBAY GAP only):** `141456514`

**Device authority (all @390px values):**

| Field | Value | Grade |
|---|---|---|
| Serial | `8b37179f7d94` | MEASURED (`owner-capture-latest.json`, `baemin-device-parity-latest.json`) |
| Package | `com.sampleapp` (Baemin 16.19.0) | MEASURED |
| Logical viewport | 800×1340 device px (= PNG 1:1) | MEASURED |
| Reference scale → 390px | `0.4875` (= 390/800) | MEASURED |

**Missing Evidence Close (2026-08-24):** CATEGORY·HOME **PNG + XML** 결합 보충. 집계 메트릭: `docs/perf/stores-baemin-device-parity-audit/missing-evidence-close/category-visual-metrics.json`

**Design authority correction:** 이전 CUT B 추정(왼쪽 **56px** 매장 썸네일 + **40px** menu peek)은 배민 실측과 **불일치 → DISPROVEN**. CATEGORY SSOT 우선순위 = **상단 ~90.7px menu band → promo bar → identity → meta → badges**.

---

## 1. Authority / Evidence

### 1.1 Evidence inventory

| Evidence | Surface | State | Usable for |
|---|---|---|---|
| `owner-capture-latest.json` | HOME · CATEGORY · (detail meta only) | Owner-navigated · `com.sampleapp` | Aggregate bounds · shelf titles · browse row samples |
| `baemin-device-parity-latest.json` | HOME | Auto scroll · `com.sampleapp` | Timesale vertical row typography/bounds · shelf titles |
| `ui-dumps/owner-step1-browse-list.xml` | **BAEMIN CATEGORY LIST** | Owner · category `족발·보쌈` · store rows visible | **Primary CATEGORY LIST authority** |
| `screenshots/owner-step1-browse-list.png` | **BAEMIN CATEGORY LIST** | Owner · `족발·보쌈` · 800×1340 · 2 store rows | **Primary CATEGORY visual authority** |
| `ui-dumps/owner-stepA-home-scroll-00` … `15.xml` | **BAEMIN HOME** | Owner scroll 16 frames | Shelf titles · horizontal card counts · partial geometry |
| `screenshots/owner-stepA-home-scroll-*.png` | **BAEMIN HOME** | Owner scroll 16 frames | Visual hierarchy · pattern cross-check |
| `ui-dumps/home-scroll-00` … `13.xml` | **BAEMIN HOME** | Auto scroll | Timesale list · vertical store thumb bounds |
| `screenshots/home-scroll-*.png` | **BAEMIN HOME** | Auto scroll | Timesale pattern visual |
| `missing-evidence-close/category-visual-metrics.json` | CATEGORY | PNG pixel analysis | Menu tile count/gap/radius · color samples |
| `ui-dumps/01-home-entry.xml` | HOME | Entry frame | Partial HOME (not fully parsed in this draft) |
| `docs/perf/stores-cut-c-baemin-device-observe/02-baemin-ui.xml` | **BAEMIN HOME** | `com.sampleapp` | Corroborates timesale section titles/bounds |
| `docs/perf/stores-cut-c-baemin-device-observe/50-scroll-0.xml` | **BAEMIN HOME** | `com.sampleapp` | Corroborates brand-discount shelf title |
| `ui-dumps/owner-step2-store-detail*.xml` | OTHER | Store detail + menu | **Out of A-VIS scope** (reference only) |
| `ui-dumps/browse-category-attempt.xml` | OTHER | StoryAd (`일시정지` · `광고` · `BBQ`) | **NOT RELEVANT** — not category list |
| `baemin-device-parity-avis2-latest.json` + `ui-dumps/avis-*.xml` | OTHER | Auto nav failed | **NOT RELEVANT** — `categoryBrowseList: NOT_PROVEN` |
| `baemin-device-parity-avis3-latest.json` + `ui-dumps/avis3-*.xml` | OTHER | Auto nav failed · misclassified screens | **NOT RELEVANT** |
| `docs/perf/stores-cut-c-baemin-device-observe/21-baemin-ui.xml` | OTHER | `com.google.android.googlequicksearchbox` content | **NOT RELEVANT** |
| `docs/perf/stores-cut-c-baemin-device-observe/70-category-ui.xml` | OTHER | Empty `WebView` | **NOT RELEVANT** |
| `docs/perf/stores-cut-c-baemin-device-observe/3*-deliveryk-*` | OTHER | DeliveryK captures | **NOT RELEVANT** (non-Baemin store UI) |
| Remaining `stores-cut-c-baemin-device-observe/*` PNG/XML | Mixed | Not fully classified | Use only where `com.sampleapp` + HOME signals confirmed; otherwise discard |

### 1.2 Authority rules (this document)

1. 수치 authority = XML `bounds` / JSON bounds / **PNG pixel analysis**(등급 별도 표기).
2. 과거 대화·임시 설계·DIBAY CSS 값은 Baemin SSOT authority가 **아님**.
3. DIBAY 코드는 **§11 DIBAY CURRENT GAP** 에만 사용.
4. **이전 56px left-thumb + 40px menu peek 설계는 authority 아님 (DISPROVEN).**

---

## 2. Evidence Grade Rules

| Grade | Definition |
|---|---|
| **MEASURED** | Screenshot pixel / XML bounds / UIAutomator bounds로 수치 또는 구조가 확정됨 |
| **OBSERVED** | 화면 구조·텍스트·배치는 XML/메타에서 확인되나 px·font·radius 확정 불가 |
| **NOT_PROVEN** | 현재 증거로 확인 불가 |

**금지:** OBSERVED → 임의 px · NOT_PROVEN → “대략” · 육안 screenshot 추정 · font family/hex 확정 · 이전 임시 문서 값 재사용

---

## 3. BAEMIN HOME

Baemin HOME은 **단일 store card 타입이 아님**. 증거상 **선반(section)마다 card representation이 다름**.

### 3.1 Section — Timesale vertical store list

**Authority:** `home-scroll-00.xml`, `baemin-device-parity-latest.json` (`home-scroll-00`), `02-baemin-ui.xml`, **`screenshots/home-scroll-00.png`**

#### Identity

| Field | Value | Grade |
|---|---|---|
| Section title | `딱! 지금만 타임세일 중인 가게 6개` | MEASURED |
| Subtitle (timer) | `15분 타임세일이 끝나면` | MEASURED |
| Promo line | `배달팁 0원 혜택 받고 주문하세요` | MEASURED |
| Structure | **Vertical list** — stacked store rows | OBSERVED |
| Card type | Left thumbnail + right text column (store name in `content-desc`) | OBSERVED |

#### Geometry (@390px)

| Field | Value | Grade | Source |
|---|---|---|---|
| Section title bounds | 158.9×16.6 · y 222.3–238.9 | MEASURED | `home-scroll-00` |
| Store thumb (sample rows) | **75.1×71.2** · x 9.8–84.8 | MEASURED | `home-scroll-00` (조조왕족·싸다김밥·레코드피자·153구포국수) |
| Vertical gap between thumbs (sample) | **~19.9px** between adjacent row thumb tops (339.8→430.9 minus h 71.2) | MEASURED | `home-scroll-00` |
| Card/list width | Full viewport **390** | MEASURED | row containers full width |
| Image radius (thumb) | Rounded corners on left thumb | OBSERVED | `home-scroll-00.png` — exact px NOT_PROVEN |
| Section top/bottom spacing | — | NOT_PROVEN | Partial frames only |

#### Typography (bounds height only — **not** font size/weight family)

| Role | Sample bounds h @390 | Grade |
|---|---|---|
| Section title | 16.6 | MEASURED |
| Rating value (`4.7`, `5.0`, …) | 12.7×12.7 | MEASURED |
| Delivery fee / min order lines | 12.7 | MEASURED |
| Discount line (`5,000원~12,000원 할인`) | 9.3 | MEASURED |
| Sticky promo (`5,000원 할인! 15분 뒤 사라져요`) | 13.7 | MEASURED |

#### Metadata exposed (timesale row)

| Field | Exposed | Grade |
|---|---|---|
| Store name | Yes (`content-desc` with store name) | OBSERVED |
| Rating | Yes (numeric + `별점` desc) | MEASURED |
| Review count | — | NOT_PROVEN in timesale sample |
| Delivery fee | Yes (`배달팁 0원`, amounts) | MEASURED |
| ETA | — | NOT_PROVEN in parsed timesale rows |
| Distance | — | NOT_PROVEN |
| Min order | Yes (`최소 5,000원`, `최소 13,000원`, …) | MEASURED |
| Discount | Yes (`5,000원~12,000원 할인`) | MEASURED |
| Badge | — | NOT_PROVEN |

---

### 3.2 Section — Primary category entry (top grid / rail)

**Authority:** `home-scroll-00.xml` (category labels in scroll region)

#### Identity

| Field | Value | Grade |
|---|---|---|
| Labels observed | `족발·보쌈`, `돈까스·회`, `피자`, `찜·탕`, … | OBSERVED |
| Structure | Horizontal cells with icon + label | OBSERVED |
| Card type | Category chip / icon cell (not store card) | OBSERVED |

#### Geometry (@390px)

| Field | Value | Grade |
|---|---|---|
| Category cell (sample) | **61.4×75.6** | MEASURED |
| Icon radius (circular) | — | NOT_PROVEN |

---

### 3.3 Section — Benefit / promo banners

**Authority:** `owner-stepA-home-scroll-*.xml`, `owner-capture-latest.json` `shelfTitlesUnique`

| Section title (observed) | Title bounds h @390 | Grade |
|---|---|---|
| `시크릿 혜택 확인하기!` | 14.6 | MEASURED |
| `혜택 확인하기` | 11.7 | MEASURED |
| `받을 수 있는 혜택 모아보기` | 13.7 | MEASURED |
| `배달팁 포함 2천원 또는 10% 이상` | 13.7 | MEASURED |
| `선물배달` | 11.7 | MEASURED |
| `배민상품권` | 11.7 | MEASURED |

Structure: **horizontal** promo / link rows — not store comparison cards. Card-level geometry beyond title bounds: **NOT_PROVEN**.

---

### 3.4 Section — Brand discount horizontal rail

**Authority:** `owner-stepA-home-scroll-03.xml`, `owner-stepA-home-scroll-04.xml`, `50-scroll-0.xml`, **`screenshots/owner-stepA-home-scroll-03.png`**

#### Identity

| Field | Value | Grade |
|---|---|---|
| Section title (XML) | `알짜 할인 가득한 인기 브랜드 추천` | MEASURED |
| Section title (PNG visible) | `지금 할인하는 브랜드` | OBSERVED | `owner-stepA-home-scroll-03.png` |
| Structure | **Horizontal scroll** | OBSERVED |
| Card type | Circular brand logo + discount subtitle (`3,000원 할인`, …) | OBSERVED |

#### Geometry (@390px)

| Field | Value | Grade |
|---|---|---|
| Section title bounds | 126.3×13.7 | MEASURED |
| Discount subtitle bounds (per tile) | **48.8×13.7** (also 43.9×13.7) | MEASURED |
| Brand circular logo | Present on white card | OBSERVED | PNG |
| Tile gap | — | NOT_PROVEN |

---

### 3.5 Section — Horizontal store teaser / high-rating rail

**Authority:** `owner-stepA-home-scroll-02.xml` (teaser cards), **`owner-stepA-home-scroll-03.png`** (high-rating shelf)

#### Identity — teaser rail (`owner-stepA-home-scroll-02`)

| Field | Value | Grade |
|---|---|---|
| Structure | **Horizontal** store cards | OBSERVED |
| Card type | Wide teaser card (`총 30개 가게 중 N번째` content-desc) | OBSERVED |
| Subtitle in desc | Instant discount / delivery tip promo text | OBSERVED |

#### Identity — high-rating shelf (`owner-stepA-home-scroll-03.png`)

| Field | Value | Grade |
|---|---|---|
| Section title | `평점 4.9점 이상인 가게` | OBSERVED | PNG |
| Card type | Large landscape food image + purple discount overlay + store meta below | OBSERVED | PNG |
| Structure | **Horizontal scroll** | OBSERVED |

#### Geometry (@390px)

| Field | Value | Grade |
|---|---|---|
| Teaser card (XML samples) | **126.8×86.8** · **126.8×84.3** · **113.6×86.8** | MEASURED |
| High-rating card image | Large rectangular, rounded corners | OBSERVED | PNG — exact px NOT_PROVEN |
| Card gap | — | NOT_PROVEN |

Metadata in desc: discount/delivery promo — **OBSERVED**. Rating/ETA in this rail: **NOT_PROVEN** in parsed frame.

---

### 3.6 Section — Product / food horizontal cards

**Authority:** `owner-stepA-home-scroll-02.xml`, **`screenshots/owner-stepA-home-scroll-02.png`**

#### Identity

| Field | Value | Grade |
|---|---|---|
| Examples | `득템)찐만두청양6입`, `(P) 포테이토베이컨피자`, … | OBSERVED |
| Structure | **Horizontal** product cards | OBSERVED |
| Card type | Food/product card with name + store name line | OBSERVED |

#### Geometry (@390px)

| Field | Value | Grade |
|---|---|---|
| Product name line height | 12.7–13.7 | MEASURED |
| Image size / ratio | — | NOT_PROVEN |

#### Metadata

Food name, store name, price in frame: **OBSERVED** (text present). Full field matrix per card: **NOT_PROVEN**.

---

### 3.7 Section — Editorial / discovery shelf

**Authority:** `owner-stepA-home-scroll-06.xml`, `owner-stepA-home-scroll-07.xml`

| Section title | Bounds h @390 | Grade |
|---|---|---|
| `화제성 높은 가게를 집에서 즐겨보세요` | 13.7 | MEASURED |

Card geometry below title: **NOT_PROVEN** in parsed dumps.

---

### 3.8 HOME representative screenshot index (Missing Evidence Close)

| Pattern | Screenshot | XML | Locked presentation |
|---|---|---|---|
| **Timesale** vertical list | `screenshots/home-scroll-00.png` | `ui-dumps/home-scroll-00.xml` | Left **75×71** thumb + right meta stack |
| **Brand** discount rail | `screenshots/owner-stepA-home-scroll-03.png` | `ui-dumps/owner-stepA-home-scroll-03.xml` | Circular brand logo + `N,000원 할인` |
| **Food / discount** horizontal | `screenshots/owner-stepA-home-scroll-02.png` | `ui-dumps/owner-stepA-home-scroll-02.xml` | Product image + price + discount % + store line |
| **Store teaser / high-rating** | `screenshots/owner-stepA-home-scroll-03.png` | `ui-dumps/owner-stepA-home-scroll-03.xml` | Large image card + `평점 4.9점 이상` shelf |

**HOME presentation pattern count:** **4** (minimum observed) — not a single universal card.

### 3.9 HOME summary

| Dimension | Verdict |
|---|---|
| Single universal HOME store card | **DISPROVEN** — 4+ patterns with PNG+XML |
| Section inventory completeness | **PARTIAL** — representative patterns covered; not every shelf measured |
| Screenshot visual cross-check | **MEASURED** for 4 representative patterns |

---

## 4. BAEMIN CATEGORY LIST

### 4.1 Category list evidence verdict

**`BAEMIN CATEGORY LIST = MEASURED`**

**Primary authority:** `ui-dumps/owner-step1-browse-list.xml` + **`screenshots/owner-step1-browse-list.png`** + `owner-capture-latest.json` step1.

**Screenshot verification (PNG):**

| Check | Result | Grade |
|---|---|---|
| Not StoryAd / not HOME / not search / not detail | Yes — category tabs `족발·보쌈`, sub-filters, `기본순`, store rows | MEASURED |
| Real category store list | Yes | MEASURED |
| Store rows in frame | **2** full/partial rows + coupon insert between | MEASURED |
| Left 56px store profile thumb | **Absent** — menu band is top visual | **DISPROVEN** |

**Limitation:** **3rd store row = SAMPLE_LIMITATION_2_ROWS** — row A + row B show **same anatomy** (4-up menu band per row). Not a CLOSE blocker.

**Not category list:** `browse-category-attempt.xml` (StoryAd), `avis3-browse-list.xml` (failed auto nav).

---

### 4.2 Screen chrome (context only)

| Element | Grade | Notes |
|---|---|---|
| Horizontal 1차 category tabs | OBSERVED | `족발·보쌈` selected |
| Sub-filter radio row | OBSERVED | 족발 · 보쌈 · 불족발 |
| Sort label `기본순` | OBSERVED | |
| Sort row bounds h @390 | ~21.4 (text 24px device → 11.7–24 range) | PARTIAL |

---

### 4.3 Store row comparison (≥2 rows)

#### Row A — `호랑이족발 성신여대점`

| Measurement | @390px | Grade | Device bounds |
|---|---|---|---|
| **Card total height** | **175.0** | MEASURED | `[0,459][800,818]` |
| **Card width** | **390.0** (full bleed) | MEASURED | |
| Menu preview band | **390.0 × 90.7** | MEASURED | `[0,480][800,666]` |
| **Promo bar** (below menu band) | **~31.2** h @390 (full width purple) | MEASURED | PNG `[0,651][800,715]` approx · OBSERVED text `배달팁 0원 + 2,500원 즉시할인` |
| Menu tile count (visible) | **4** | MEASURED | PNG gap scan `owner-step1-browse-list.png` |
| Menu tile width @390 | **93.6, 91.2, 91.2, 91.2** | MEASURED | PNG |
| Menu tile height @390 | **~79.5** | MEASURED | PNG |
| Menu tile gap @390 | **~0.5** (1 device px est.) | MEASURED | PNG |
| Menu outer pad left @390 | **~7.3** | MEASURED | PNG |
| Menu tile corner radius @390 | **~2.9** (6 device px est.) | MEASURED | PNG pixel estimate |
| Store name line | **95.1 × 14.6** · y 344.2–358.8 | MEASURED | XML desc bounds |
| Rating | `5.0` · **12.7×12.7** | MEASURED | |
| Review count | `(246)` · h 12.7 | MEASURED | |
| ETA | `약 65분` · h 12.7 | MEASURED | |
| Delivery fee | `배달팁 0원` · h 12.7 | MEASURED | |
| Distance | `3.8km` · h 13.2 | MEASURED | |
| Min order | `최소주문 10,000원` · h 12.7 | MEASURED | |
| Badge row | `배민클럽…` h 9.3 · `신규` h 9.3 · `픽업가능` h 9.3 | MEASURED | |
| Ad marker | `추천 광고 영역` | OBSERVED | content-desc |
| Left profile thumbnail | **DISPROVEN** — not in evidence | DISPROVEN | Main visual = top menu band only |
| Divider below card | **15.6px** h (device 32px) | MEASURED | `[0,936][800,968]` |
| Card-to-card gap (clean) | **NOT_PROVEN** | Coupon insert `[20,838][780,947]` between rows |

#### Row B — `장충가마솥한방족발` (partial / lower in viewport)

| Measurement | @390px | Grade | Device bounds |
|---|---|---|---|
| **Card total height** | **136.5** | MEASURED | `[0,968][800,1248]` |
| Menu preview band | h **90.7** @390 | MEASURED | `[0,989][800,1175]` |
| Menu tile count | **4** (same as row A) | MEASURED | PNG |
| Same anatomy as row A | Yes — menu band → promo → identity cluster | OBSERVED | PNG + XML |
| Rating | Not visible in frame | NOT_PROVEN | clipped |
| ETA / fee / distance / min order | Text nodes present at bottom clip | OBSERVED | `약 29분`, `3,400원`, `2.0km`, `최소주문 20,000원` |

#### Row C — third store

| Measurement | Verdict |
|---|---|
| 3rd distinct store row | **SAMPLE_LIMITATION_2_ROWS** — not required for anatomy lock |

---

### 4.4 CATEGORY LIST anatomy (confirmed)

```
┌────────────────────────────────────── 390 ─────────────────────────────────────┐
│  MENU PREVIEW BAND — 4-up horizontal tiles, full width            ~90.7px h    │
│  (NOT left 56px store thumb — DISPROVEN)                                       │
├──────────────────────────────────────────────────────────────────────────────┤
│  PROMO PURPLE BAR — full width (배달팁/즉시할인)                  ~31.2px h    │
├──────────────────────────────────────────────────────────────────────────────┤
│  Store name + ★ rating + (reviews) + 광고 marker                ~14.6px      │
│  알뜰배달 · ETA · 할인icon · 배달팁 · distance · 최소주문        ~12.7px row   │
│  badges: 배민클럽 / 신규 / 픽업가능                             ~9.3px row   │
│  horizontal menu name peek (scroll)                              OBSERVED      │
└──────────────────────────────────────────────────────────────────────────────┘
     [optional coupon/ad insert between rows — not part of store card]
     [divider ~15.6px @390 between card groups]
```

| Field | Grade |
|---|---|
| Left 56px store thumb | **DISPROVEN** |
| Menu tile image radius @390 | **~2.9** | MEASURED (pixel est.) |
| Text column x offset | ~9.8–10.2 left inset | MEASURED |
| Metadata row order | 알뜰배달 → ETA → 할인 → 배달팁 → distance → min_order | OBSERVED | PNG+XML |
| Badge placement | Below metadata, horizontal | OBSERVED |
| CTA/icon | `추천 광고 영역` right of rating row | OBSERVED |
| Inter-row coupon | `곧 사라져요! 이번 주 한정 쿠폰` h **53.1** @390 | MEASURED | XML — not store card |

---

## 5. STORE CARD ANATOMY

| Attribute | HOME (timesale vertical) | HOME (horizontal teaser) | HOME (food/product) | CATEGORY LIST |
|---|---|---|---|---|
| Main visual | Left square thumb | Wide teaser (image in desc area) | Product image top | **Top full-width menu preview band** |
| Orientation | Vertical list | Horizontal rail | Horizontal rail | Vertical list |
| Thumbnail | **75.1×71.2** @390 | **~127×87** teaser | NOT_PROVEN | **390×90.7** menu band (not profile thumb) |
| Store identity | Beside thumb | In card desc | Below product image | Below **promo bar** (below menu band) |
| Rating/review | Rating MEASURED | NOT_PROVEN | NOT_PROVEN | Rating+review MEASURED (row A) |
| ETA | NOT_PROVEN | NOT_PROVEN | Optional OBSERVED | MEASURED |
| Distance | NOT_PROVEN | NOT_PROVEN | NOT_PROVEN | MEASURED |
| Delivery fee | MEASURED | OBSERVED in desc | OBSERVED | MEASURED |
| Min order | MEASURED | NOT_PROVEN | NOT_PROVEN | MEASURED |
| Menu preview | NOT_PROVEN | NOT_PROVEN | N/A (is product) | **Primary visual — MEASURED band** |
| Badge | NOT_PROVEN | OBSERVED promo | NOT_PROVEN | 신규·픽업·배민클럽 MEASURED |
| Card height | NOT_PROVEN (full row) | **84–87** @390 | NOT_PROVEN | **175.0** / **136.5** @390 |

**`HOME vs CATEGORY = DIFFERENT`**

Evidence: HOME timesale uses **left 75×71 thumb**; CATEGORY uses **top full-width menu band** without left profile thumb. Horizontal HOME rails are a third pattern.

---

## 6. THUMBNAIL / IMAGE

### 6.1 HOME — timesale store thumb

| Field | Value | Grade |
|---|---|---|
| Size | **75.1×71.2** @390 | MEASURED |
| Ratio | ~1.05:1 (near square) | MEASURED |
| Radius | NOT_PROVEN | |
| Content role | Store representation in vertical list | OBSERVED |

### 6.2 HOME — brand rail

| Field | Value | Grade |
|---|---|---|
| Size | NOT_PROVEN | |
| Ratio | NOT_PROVEN | |
| Radius | Circular suspected | OBSERVED only |
| Content role | Brand logo | OBSERVED |

### 6.3 HOME — food/product card

| Field | Value | Grade |
|---|---|---|
| Size | NOT_PROVEN | |
| Ratio | NOT_PROVEN | |
| Radius | NOT_PROVEN | |
| Content role | Menu item / product | OBSERVED |

### 6.4 HOME — horizontal store teaser

| Field | Value | Grade |
|---|---|---|
| Size | Card **~127×87** @390 | MEASURED |
| Image sub-region | NOT_PROVEN | |

### 6.5 CATEGORY — store list

| Field | Value | Grade | Evidence |
|---|---|---|---|
| Menu preview band | **390.0×90.7** @390 | MEASURED | XML |
| Menu tiles visible | **4** per row | MEASURED | PNG |
| Menu tile size @390 | **~93.6×79.5** (first tile wider) | MEASURED | PNG |
| Menu tile gap @390 | **~0.5** | MEASURED | PNG |
| Menu tile corner radius @390 | **~2.9** | MEASURED | PNG pixel est. |
| Left profile thumb | **DISPROVEN** | DISPROVEN | PNG+XML |
| Content role | Popular menu item images in horizontal strip | OBSERVED | PNG |

**Rule:** Do not merge HOME timesale thumb token with CATEGORY menu band token unless future evidence shows equality. Current evidence: **different**.

---

## 7. TYPOGRAPHY

**FONT FAMILY = NOT_PROVEN**

**FONT WEIGHT (exact) = NOT_PROVEN** — PNG shows hierarchy only.

### 7.1 MEASURED — TextView bounds height @390px (XML proxy)

| Context | Heights observed (px @390) | Grade |
|---|---|---|
| HOME section titles | 14.6, 16.6, 13.7, 11.7 | MEASURED |
| HOME timesale rating | 12.7 | MEASURED |
| HOME timesale discount micro | 9.3 | MEASURED |
| HOME sticky promo | 13.7 | MEASURED |
| CATEGORY store name | 14.6 | MEASURED |
| CATEGORY metadata row | 12.7–13.2 | MEASURED |
| CATEGORY badges | 9.3 | MEASURED |
| Brand discount subtitle | 13.7 | MEASURED |

### 7.2 OBSERVED — Visual hierarchy from PNG

| Role | HOME timesale | HOME brand | HOME food | CATEGORY list | Grade |
|---|---|---|---|---|---|
| Section title | Large bold black | Medium bold | Medium bold | N/A (chrome) | OBSERVED |
| Store / product title | Bold black | Brand name gray + **bold discount** | Product name regular + **bold price** | **Bold black** store name | OBSERVED |
| Primary price | Discount badge text | `N,000원 할인` bold | Bold current + strikethrough original | On menu tile overlay (white on gradient) | OBSERVED |
| Secondary metadata | Gray rating/min/ETA | Gray brand subtitle | Gray store·distance·reviews | Gray ETA·distance·min order | OBSERVED |
| Accent metadata | Purple delivery fee | — | Red discount % | **Purple** 배달팁 text | OBSERVED |
| Badge text | Pink discount pill | — | — | Pink `신규`, gray `픽업가능`, teal 배민클럽 | OBSERVED |

---

## 7A. COLOR

**EXACT HEX (brand-locked) = NOT_PROVEN** — 아래는 PNG pixel sample (OBSERVED)만.

| Role | Sample hex | Grade | Evidence |
|---|---|---|---|
| CATEGORY store name text | `#181a1c` | OBSERVED | PNG darkest-in-region |
| CATEGORY 배달팁 accent | `#4d1aff` | OBSERVED | PNG |
| CATEGORY promo bar fill | `#3605c6` | OBSERVED | PNG |
| CATEGORY badge `신규` fill | `#f468b6` | OBSERVED | PNG |
| Rating star area | `#fff9e2` | OBSERVED | PNG |

색상은 구현 토큰 **참고용** — 단독 CLOSE blocker 아님.

---

## 8. BADGES

Only badges/text observed in **trusted** evidence:

| Visible text | Surface | Placement | Height @390 | Grade |
|---|---|---|---|---|
| `신규` | CATEGORY | Below metadata row | 9.3 | MEASURED |
| `픽업가능` | CATEGORY | Badge row, right of 신규 | 9.3 | MEASURED |
| `배민클럽 가입 시 배달팁 0원` | CATEGORY | Badge row left | 9.3 | MEASURED |
| `할인` (icon/desc) | CATEGORY | Metadata row before 배달팁 | OBSERVED | OBSERVED |
| `추천 광고 영역` | CATEGORY | Right of rating row | OBSERVED | OBSERVED |
| `알뜰배달` | CATEGORY | Before ETA | OBSERVED | OBSERVED |
| `5,000원~12,000원 할인` | HOME timesale | On/near thumb column | 9.3 | MEASURED |
| `3,000원 할인` / `2,000원 할인` / `7,000원 할인` | HOME brand rail | Under brand tile | 13.7 | MEASURED |
| `광고` | OTHER (StoryAd) | — | — | NOT RELEVANT |

Padding, radius, icon geometry per badge: **OBSERVED partial** from PNG — `신규` pink fill, `픽업가능` gray outline, 배민클럽 teal outline. Exact padding/radius px: **NOT_PROVEN**.

---

## 9. SPACING / RADIUS / DENSITY

| Token | HOME timesale | CATEGORY list | Grade |
|---|---|---|---|
| Full-bleed card width | 390 | 390 | MEASURED |
| Left content inset | ~9.8 | ~9.8–10.2 | MEASURED |
| Vertical row gap (timesale thumbs) | ~19.9 | — | MEASURED |
| Card height | NOT_PROVEN | 175.0 / 136.5 | MEASURED / PARTIAL |
| Menu band height | — | 90.7 | MEASURED |
| Menu tile w×h @390 | — | ~93.6×79.5 | MEASURED |
| Promo bar height @390 | — | ~31.2 | MEASURED |
| Inter-card divider | — | 15.6 | MEASURED |
| Inter-row coupon (non-card) | — | 53.1 | MEASURED |
| Menu tile corner radius @390 | — | ~2.9 | MEASURED |
| HOME thumb radius | OBSERVED rounded | — | OBSERVED |
| Section gap | NOT_PROVEN | NOT_PROVEN | |

---

## 10. HOME vs CATEGORY

| Question | Verdict | Evidence |
|---|---|---|
| Same store card component? | **DIFFERENT** | §5 table |
| Shared thumbnail token? | **NO** | 75×71 left thumb vs 390×91 top band |
| Shared metadata density? | **DIFFERENT** | CATEGORY exposes more fields in one row cluster |
| Shared badge semantics? | **NOT_PROVEN** | Overlap partial (delivery/pickup) |

---

## 11. DIBAY CURRENT GAP

**HEAD:** `141456514` · Code read for gap only — **no code modified**.

### 11.1 HOME

| DIBAY (HEAD) | Baemin evidence | GAP |
|---|---|---|
| `StoresHomeFoodCard` — `w-[7.5rem]` horizontal food card, aspect-square image, price + store name stack | Multiple HOME patterns: timesale vertical (**75×71**), brand rail, horizontal teaser (**~127×87**), product cards | DIBAY uses **one food-card pattern**; Baemin uses **≥4 distinct** shelf card types — **DIFFERENT** |
| `StoreDeliveryRowCard` / `StoreVerticalDiscoveryCard` on some shelves | Timesale vertical list is a different anatomy (left thumb, not 116px top menu strip) | **Shared row card does not match** primary Baemin timesale pattern |
| `StoresHomeFoodCard` discount badge via `store_badge_instant_discount` when `discountEvidence` | Baemin timesale shows amount strings (`5,000원~12,000원 할인`) not the same badge copy | Semantics/copy **DIFFERENT** — OBSERVED |
| Composer-driven shelves (`stores-home-composer.ts`) | Section titles differ (timesale, brand, editorial, …) | Shelf **purpose mix** not aligned — OBSERVED from titles |

### 11.2 CATEGORY (Browse)

| DIBAY (HEAD) | Baemin evidence | GAP |
|---|---|---|
| `StoresBrowsePrimaryView` → `StoreDeliveryRowCard` | Category: menu band **90.7** + promo bar **31.2** + identity/meta/badges | DIBAY **116px** 3-up strip, **no** promo purple bar, payment row | **MEASURED gap** |
| Prior CUT B design (56px left thumb + 40px peek) | **DISPROVEN** by PNG+XML | Was never in Baemin evidence | **Rollback validated** |
| Menu strip: `h-[116px]` · 3-column tiles `w-[calc((100%-8px)/3)]` | Full-width horizontal menu preview band | Layout model **DIFFERENT** |
| `paymentMethodsUi` row rendered (`store_label_payment`) | No payment line in CATEGORY row A/B XML | **DIBAY extra row** — OBSERVED gap |
| `isFeatured` → `store_badge_instant_discount` badge | CATEGORY badges: `신규`, `픽업가능`, 배민클럽 promo | **Badge semantics mismatch** — OBSERVED |
| Store identity below menu strip | Store identity below menu band — order **similar** | Order similar; density and fields **DIFFERENT** |
| Left profile thumbnail | Baemin: no separate profile thumb in evidence | DIBAY: profile not primary in row card; uses menu tiles — partial similarity |

### 11.3 STORE CARD (shared component)

| Dimension | GAP |
|---|---|
| Visual hierarchy | DIBAY: 116px menu → title → fee → meta → badges → **payment** · Baemin: ~91px 4-up band → **promo bar** → title/rating → meta → badges |
| Main thumbnail | DIBAY 116px 3-up tiles · Baemin ~91px full-bleed band |
| Metadata density | Baemin fits ETA·fee·distance·min-order in one cluster; DIBAY spreads + payment |
| Badge semantics | See `isFeatured` mismatch |
| Typography | DIBAY uses CSS tokens (`13px`, `14px`, …) — **not** Baemin-measured mapping · NOT_PROVEN parity |
| Spacing | DIBAY `px-4 py-[14px]` list item — Baemin full-bleed width · inset ~10px — **DIFFERENT** |

---

## 12. NOT_PROVEN

| Item | Reason |
|---|---|
| FONT FAMILY | Not exposed in XML; not provable from PNG |
| FONT WEIGHT (exact) | Visual hierarchy only |
| EXACT HEX (brand-locked) | Pixel samples OBSERVED; not locked as implementation tokens |
| 3rd CATEGORY store row | **SAMPLE_LIMITATION_2_ROWS** — anatomy proven on 2 rows |
| Clean card-to-card spacing (excluding coupon) | Coupon insert between rows |
| Baemin HOME complete shelf inventory | Representative 4 patterns only |
| DIBAY runtime pixel parity | No DIBAY device capture |
| Store detail presentation | Out of scope |
| **Left 56px CATEGORY store thumb** | **DISPROVEN** — do not implement |

---

## 13. IMPLEMENTATION CONSTRAINTS

1. **Discovery ranking/order 변경 금지**
2. **CATEGORY implementation** — A-VIS Owner 승인 후에만
3. **HOME implementation** — CATEGORY presentation 다음
4. **실측되지 않은 px 사용 금지** — OBSERVED/NOT_PROVEN 필드는 구현 SSOT로 승격 금지
5. **실측되지 않은 font family / hex 주장 금지**
6. Baemin HOME과 CATEGORY anatomy가 다르면 **shared card 하나로 강제하지 않음**
7. **DIBAY composer ordering 변경 금지** (presentation cut only)
8. Badge 의미는 실제 데이터 semantics와 일치해야 함 (`isFeatured` ≠ instant discount)

---

## 14. OWNER REVIEW GATE

| Gate | Status |
|---|---|
| `A-VIS DOCUMENT` | **CLOSED** — Owner approved 2026-08-24 |
| `A-VIS EVIDENCE` | **SUFFICIENT** — CATEGORY PNG+XML · HOME 4-pattern PNG · SAMPLE_LIMITATION_2_ROWS |
| `A-VIS CLOSE` | **CLOSED** — Owner decision |
| `OWNER REVIEW` | **CLOSED** |

**A-VIS close candidate:** **CLOSED** (Owner). PHASE 2 CUT B presentation may proceed; do not infer NOT_PROVEN fields as Baemin-exact.

### Owner review checklist

- [x] CATEGORY anatomy (no 56px left thumb) accepted
- [x] Menu band 4-up + promo bar accepted as CUT B target
- [x] 2-row sample accepted (`SAMPLE_LIMITATION_2_ROWS` non-blocker)
- [x] HOME 4-pattern screenshot index accepted for PHASE 3
- [x] GAP table accepted

---

*Document updated: A-VIS Missing Evidence Close · PNG+XML · no code changes.*
