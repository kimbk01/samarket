# 광고 팝업·인트로·상위노출 결함 감사 및 설계안 (2026-11-05 PHT)

> **읽는 순서**: §0 감사 기준 → §1 Owner 지시와의 충돌 → §2~§5 영역별 결함 → §6 설계안(승인 요청) → §7 하지 않는 것  
> **판정**: 코드 PASS = origin/main 코드·단위시험으로 확인 · 실기 = v5 보고서 · 운영 = 인수인계 DB 대조 · 없으면 **NOT_PROVEN**  
> **이 문서는 보고만 한다. 구현·커밋·배포는 Owner 승인 전 금지.**

---

## 0. 감사 기준 (증거)

| 항목 | 값 |
|---|---|
| 코드 기준 | `origin/main` **`c168655fd`** (광고 마지막 구현 `c8e0aba3c` 포함 · `5b832c7d4` 조상) |
| Production 실기 | v5 · SHA **`4c6161b44`** · 보고서 `docs/audit/cursor-report-ads-device-verify-v5-2026-11-04.md` |
| 인수인계 | `docs/audit/ads-handoff-2026-11-05.md` |
| 로컬 worktree HEAD | `7acd866c2` (2026-11-02 chrome) — **광고 커밋 미포함**. 본 감사는 로컬 트리가 아니라 **origin/main** 을 읽었다 |

추측으로 「코드가 이렇게 동작할 것」이라고 쓰지 않았다. 파일·시험을 직접 연 것만 PASS/FAIL로 적는다.

---

## 1. Owner 지시와 현행 계약 충돌 (먼저 확정 필요)

### 1-1. 이번 지시 (원문 요지)

- 게시판·거래의 **상위 올리기(상위노출)는 1건만** 나와야 한다.
- 같은 매물/글은 **일반이거나 광고(상위노출) 둘 중 하나**이지, 두 번 나오면 안 된다.
- 중복되는 부분도 같이 확인해 보고하라.

### 1-2. 현행 Owner/계약 (이미 확정·코드 반영)

| 출처 | 내용 | 증거 |
|---|---|---|
| O-2 (2026-11-03) | 커뮤니티도 거래와 같게 **위쪽 3개**(최근 결제 순) + 4번째부터 일반 자리 표시 | `ads-owner-decisions-2026-11-03.md` · `PROMOTED_TOP_PINS_MAX = 3` |
| CUT F HARD LOCK | LIST pin **≤3** (page=1) | `docs/dibay-marketplace-cut-f-hard-lock.md` |
| 공용 상수 | `lib/promotion/promoted-top-pins.ts` → **`PROMOTED_TOP_PINS_MAX = 3`** | origin/main |
| 단위시험 | `owner-decisions-2026-11-03.test.ts` 가 `PROMOTED_TOP_PINS_MAX === 3` 강제 | origin/main |

### 1-3. 판정

| # | 내용 | 판정 |
|---|---|---|
| C-1 | 「위쪽 고정 **1건**」 vs 현행 **3건** | **충돌**. 구현 전에 Owner 가 O-2·CUT F 를 **1건으로 재확정**할지 결정해야 한다 |
| C-2 | 「같은 글이 일반+광고로 두 번」 | 아래 §2 — **1페이지에서는 코드로 중복 제거됨**(거래·커뮤니티). 뒤 페이지 재노출은 일부 **NOT_PROVEN** |

**설계 원칙**: C-1 미확정인 채 `PROMOTED_TOP_PINS_MAX` 를 바꾸지 않는다. 아래 설계안 §6-A 는 **1건 확정 시** 적용할 변경안이다.

---

## 2. 상위노출 (거래 · 커뮤니티) — 결함·중복 감사

### 2-1. 완료(현행 계약 기준 · 코드 증거)

| # | 동작 | 증거 | 판정 |
|---|---|---|---|
| B-OK-1 | 거래·커뮤니티 위쪽 핀 상한 **같은 상수 3** | `promoted-top-pins.ts` · `MAX_PAGE0_PROMOTED_PINS = PROMOTED_TOP_PINS_MAX` · 커뮤니티 `planCommunityFeedAdPlacement` | 코드 PASS |
| B-OK-2 | 거래: 최근 `start_at` 순으로 앞에서 N개만 핀 · 1번째 칸은 일반 유지 · 핀은 2번째부터 | `selectPromotedListingIds` · `interleavePromotedIntoOrganic` | 코드 PASS |
| B-OK-3 | 거래 1페이지: **핀에 뽑힌 id 만** 일반 목록에서 제거 → 같은 매물이 위+일반에 **동시 출현하지 않음**. 뽑히지 않은 홍보 글은 일반 자리에 「광고」 | `projectTradeFeedWithPromotions` 주석 P-2 · `rest = normalPosts.filter(!selectedSet)` | 코드 PASS |
| B-OK-4 | 커뮤니티: 위쪽 ≤3(카드 값 있는 글)만 고정 구역 · **그 id 는 일반 목록에서 제거** · 나머지 광고 중 글은 일반 자리 + 「포인트 노출」 | `community-feed-ad-placement.ts` · 시험 `ads-impl-1104-community-card-feed.test.tsx` (21개 중 위 3 · p21은 일반+배지) | 코드 PASS |
| B-OK-5 | 커뮤니티 API는 광고 중 **전체 id**를 주고, 위쪽 3개만 `feedPost` 채움 | `app/api/ads/active/route.ts` PB-21 주석 · `feedPostById.size >= PROMOTED_TOP_PINS_MAX` 에서 카드 값만 중단 | 코드 PASS |
| B-OK-6 | 커뮤니티 표시 = 일반 카드 + 배경 + 「포인트 노출」(AdPostCard 경로 아님) | `CommunityFeed` → `CommunityCard … isAd` · `5b832c7d4` | 코드 PASS (origin/main) |
| B-OK-7 | 검색어 있으면 커뮤니티 **피드 배너** 비활성 (상위노출과 별개) | `communityFeedBannerAllowedForSearch` D-29 | 코드 PASS |

### 2-2. 결함 · 위험 · NOT_PROVEN (상위노출)

| ID | 심각도 | 내용 | 증거 | 비고 |
|---|---|---|---|---|
| **B-D1** | P0(정책) | Owner 「**1건**」 vs 코드·계약 **3건** | §1 | Owner 재확정 전 구현 금지 |
| **B-D2** | P1 | 거래: `promotedIdsOnPage` 를 서버가 돌려주지만, **클라이언트에서 이 필드를 읽어 뒤 페이지를 거르는 코드가 grep 0건** | `home-posts-route-core` 반환 · `components/**` 소비처 없음 | 주석은 HomeProductList·PostListByCategory 가 id로 거른다고 함. **같은 스크롤 세션의 일반 seen 중복제거**만으로 막히는지는 실기 **NOT_PROVEN**. 단독 page≥2 요청에 1페이지 핀 글이 일반으로 재등장 가능 여부 = **NOT_PROVEN** |
| **B-D3** | P2 | 피드 배너(유료 배너)와 상위노출(글 핀)은 **별 API·별 자리**. 같은 화면에 배너+상위노출이 동시에 나오는 규칙은 Owner **OV-1 대기** | `dibay-ads-surface-master-ssot.md` §8 OV-1 | 「중복」이 배너+핀을 뜻하면 Owner 결정 필요. 코드는 각자 자리 유지 |
| **B-D4** | 보고 | CUT F HARD LOCK 문서와 O-2는 **≤3** 잠금. 1건으로 바꾸면 CUT F·단위시험·어드민 안내·판매자 카피까지 한 묶음으로 열어야 함 | cut-f hard lock | 단독 상수 수정 금지 |
| **B-D5** | 실기 | v5: 커뮤니티 상위노출 표시 **V-3 PASS**. 거래 상위노출 목록 핀 개수·중복은 **별도 실기 항목 없음** → 화면 1건/3건·중복 **실기 NOT_PROVEN** | v5 보고서 | |

### 2-3. 「일반 vs 광고」 한 매물 — 요약

```
거래(현행):
  active 홍보 N건
  → 최근 결제 순 최대 3건 = 1페이지 위쪽(2칸부터) 「광고」
  → 나머지 active = 일반 목록 제자리 + 「광고」 배지
  → 핀에 뽑힌 id 는 같은 페이지 일반 칸에서 제거 (중복 없음)

커뮤니티(현행):
  active 홍보 N건
  → 최근 결제 순 최대 3건 = 위쪽 고정 + 「포인트 노출」
  → 나머지 = 일반 목록 제자리 + 「포인트 노출」
  → 위쪽 id 는 일반 목록에서 제거 (중복 없음)
```

Owner 「1건만」이면 위 표의 **3 → 1** 만 바뀌고, 「일반이거나 광고」 중복 제거 구조는 유지하는 것이 맞다(이미 그 구조).

---

## 3. 전역 팝업 — 결함 감사

### 3-1. 완료 (코드 + v5 실기)

| # | 항목 | 증거 | 판정 |
|---|---|---|---|
| P-OK-1 | F-1 CTA 뒤 빈도 숨김 저장 · 분석은 click→landing 만(suppress 분석 생략) | `GlobalPopupHost` F-1 주석 · `persist:true, recordAnalytics:false` | 코드 PASS |
| P-OK-2 | F-1 실기 | V-10 PASS (iOS) | 실기 PASS |
| P-OK-3 | F-2 숨김은 **지금 빈도** 기준 | `suppressionModesHonoredByFrequency` · V-12 PASS | 코드+실기 PASS |
| P-OK-4 | × 하루 1회 · 「오늘 하루 보지 않기」 줄 없음 | V-9 PASS · Owner FINAL | 실기 PASS |
| P-OK-5 | 외부 https CTA | V-11 PASS | 실기 PASS |
| P-OK-6 | CLOSE(×·close_only) DB 행 없음 | D-21 · `mode === "CLOSE" return` | 코드 PASS |
| P-OK-7 | 인트로 끝나기 전 팝업 보류 | `popup-launch-intro-gate.ts` CX-01 | 코드 PASS |
| P-OK-8 | 기간만 변경 시 재검토 제외(E-2) | `admin-campaign-writer` `material.delete("schedule")` (operator) | 코드 PASS |

### 3-2. 결함 · 미해소 (팝업)

| ID | 심각도 | 내용 | 증거 | 설계 |
|---|---|---|---|---|
| **P-D1** | P1 | **V-18** 어드민 「이름만 저장 / 소재·CTA→재승인」(P-1) 실기 **NOT_PROVEN** (샘플 조기 종료) | v5 | v6에서 S-P 유지 후 재실시 |
| **P-D2** | P2 | 일괄 삭제 **비원자**(검사 후 1건씩 · 일부 성공 가능) | `adminBulkDeletePlatformPopupDraftCampaigns` AL-20 주석 | Owner 가 원자 DB 함수를 원할 때만 설계 재개 |
| **P-D3** | 정책 | AL-13 사장님 유료 팝업 운영 종료 환불 | 판매 꺼짐 · SSOT §8 | 판매 ON 시 |
| **P-D4** | 정책 | CX-04 이벤트 직접 진입 팝업 조정 | SSOT §8 · 지금은 안 넣음 | Owner |
| **P-D5** | 정책 | F-3 close_only↔once_per_session 합침 | SSOT §8 · 문구만 통일 | Owner |
| **P-D6** | 데이터 | 검토 대기 동명 QA 팝업 2건 미정리 | 인수인계 §6 | 별도 승인 후 ended/삭제 |
| **P-D7** | 대조 | V-9~12 Claude 운영 DB 전수 대조는 안 함(인수인계) | 인수인계 §7 | 필요 시 숨김·이벤트 SELECT 재대조 |

**팝업 실기 FAIL: 없음.**

---

## 4. 인트로 — 결함 감사

### 4-1. 완료 (코드 · 실기 제외 정책)

| # | 항목 | 증거 | 판정 |
|---|---|---|---|
| I-OK-1 | 준비 중 background/error → 커뮤니티 넘김 · OS 해제 | `LaunchIntroRoot` `abortLaunchIntroToCommunity` · `627fe3022` | 코드 PASS |
| I-OK-2 | CTA 금지 경로 · DS-8 닫힘(이동 시작+다음 화면) | `parseDestinationHref` · exit CTA 분기 | 코드 PASS |
| I-OK-3 | 터치 44×44 (IN-N1) | `LAUNCH_INTRO_MIN_TOUCH_PX` · `LaunchIntroHitArea` | 코드 PASS |
| I-OK-4 | CTA 이벤트 방문 출처 INTRO (IN-N3) | LaunchIntroRoot 주석 · DB CHECK PTR·INTRO | 코드 PASS |
| I-OK-5 | 운영 intro unpublished · V-23·24 Owner 제외 | v5 · 인수인계 | 정책 PASS(제외) |

### 4-2. 결함 · 미해소 (인트로)

| ID | 심각도 | 내용 | 증거 | 설계 |
|---|---|---|---|---|
| **I-D1** | P1 | 게시 상태 실기 **전체 NOT_PROVEN** (V-23·24 제외). 코드만 PASS | Owner 「인트로 제외」 | 게시 실기는 Owner 가 「시험 게시 허용」할 때만 |
| **I-D2** | P2 | V-22 콜드 스타트(인트로 없음) — SM 부분 · **iOS 미완** | v5 | v6 iOS 3회 |
| **I-D3** | 위험 | 기간·하루 1회 = **기기 시계** | 인수인계 §8-4 · 어드민 안내 | Owner 가 서버 시각으로 바꿀지 |
| **I-D4** | 정책 | CX-10 인트로를 광고로 쓸지 · IN-N4 성과 기록 | SSOT §8 · Owner 결정 ⑤ 없음 유지 | 구현 금지 |
| **I-D5** | 범위 밖 | 인트로·이벤트 히어로 성과 없음 | Owner ⑤ | 고치지 않음 |

**인트로 실기 FAIL: 없음** (시험 제외).

---

## 5. PTR (팝업과 인접 · 실기 FAIL)

| ID | 심각도 | 내용 | 증거 | 비고 |
|---|---|---|---|---|
| **R-D1** | P1 | **V-13 ② CTA 칩 탭 → 이동 없음 · click 0** | v5 · 운영 DB impression 3 · dismiss 2 · **click 0** | 「방문 0」은 `/market` 목적지라 판정 근거로 쓰지 않음 |
| **R-D2** | 원인 | 코드상 CTA 칩만 `button` + `onCta` → `record…click` + `openDestination` | `DibayPtrRevealBand.tsx` D-1 · `DibayPtrRevealAdLayer.onCta` | **원인 미확정** — 접힘 타이밍·pointer-events·좌표 탭·기기 한계 가능. 추측 수정 금지 |

---

## 6. 설계안 (승인 요청)

구현은 **승인된 묶음만** · main 반영 1회 · 실기는 Cursor 1회(v6).

### 6-A. 상위노출 핀 개수 (Owner 결정 필수)

**전제**: Owner 가 「위쪽 **1건**」으로 O-2·CUT F 를 재확정한다.

| 단계 | 내용 |
|---|---|
| A1 | `PROMOTED_TOP_PINS_MAX` **3 → 1** (`lib/promotion/promoted-top-pins.ts`) — 거래·커뮤니티 동시 |
| A2 | 단위시험·계약 문서·CUT F 문서·판매자 안내·어드민 안내를 **1건**으로 정정 |
| A3 | 중복 규칙 유지: 핀에 뽑힌 1건만 일반 목록에서 제거 · 나머지 active 는 일반+배지 |
| A4 | **B-D2** 동시 처리: 1페이지 `promotedIdsOnPage` 를 클라이언트가 보관하고, 이후 페이지 append 시 **반드시 제외**. 서버 page≥2 응답에서도 같은 세션 핀 id 제외할지 한 경로로 통일 |
| A5 | 실기: 거래·커뮤니티 각각 active ≥2 인 상태에서 **위쪽 1건만** · 같은 id 일반 칸 0 · 2번째 홍보는 일반+배지 |

**Owner 가 3건 유지를 선택하면**: A1~A3·A5 는 하지 않고 **A4(뒤 페이지 중복 방지)만** 진행.

### 6-B. PTR CTA (R-D1) — 원인 확정 후 수정

| 단계 | 내용 |
|---|---|
| B1 | 실기기에서 CTA 칩 bounds·`pointer-events`·접힘(dismiss) 시각·`onCta` 호출 여부 로그(기존 이벤트/디버그)로 **원인 1개** 확정 |
| B2 | 확정 원인만 최소 수정(칩 hit 영역·접힘 전 클릭 소비·레이어 순서 등). D-1(칩만 버튼) 정책은 유지 |
| B3 | 재실기: 목적지를 **이벤트**로 둔 샘플(방문 기록 PTR 확인) + `/market` 샘플(이동만) · click≥1 |

### 6-C. 팝업 잔여

| 단계 | 내용 |
|---|---|
| C1 | v6: V-18(P-1) — 노출 중 캠페인에서 이름만 저장 / 소재·CTA 변경 재승인 |
| C2 | (선택) QA 검토 대기 팝업 2건 종료 — **데이터 승인 별도** |
| C3 | P-D2·P-D3·P-D4·P-D5 — Owner 고르면 그때 설계 확장. 이번 묶음 기본 제외 |

### 6-D. 인트로 잔여

| 단계 | 내용 |
|---|---|
| D1 | v6: V-22 iOS 콜드 3회 (게시 없음) |
| D2 | V-23·24 — Owner 「시험 게시」 승인 전 금지 |
| D3 | I-D3 기기 시계 — Owner 요청 시에만 서버 시각 설계 |

### 6-E. 문구(범위 밖 발견 · 보고)

| 단계 | 내용 |
|---|---|
| E1 | 피드 일괄 삭제 안내 「홍보」→「상위노출」(v5 발견 · 인수인계). Owner 승인 시 같은 웹 묶음에 포함 가능 |

### 6-F. 권장 구현 묶음 (한 번에)

Owner 가 아래를 승인하면 **한 브랜치 · main 1회**:

1. (선택) **6-A** 핀 1건 + **B-D2** 뒤 페이지 중복 방지  
2. **6-B** PTR CTA (원인 확정 후)  
3. **6-E** 문구  
4. Cursor **v6** 프롬프트: V-13 재확인 · V-18 · V-22 iOS · (A 승인 시) 핀 1건·중복 · 잔여 NOT_PROVEN 중 샘플 가능한 것  

팝업 F-1~F-3·인트로 코드 PASS 항목은 **재구현하지 않음**.

---

## 7. 하지 않는 것

- 추측으로 PTR CTA 를 바로 패치하는 것  
- Owner 재확정 없이 핀 3→1  
- 인트로 운영 게시·성과 수집 추가(결정 ⑤·CX-10)  
- 「오늘 하루 보지 않기」 줄 추가(Owner FINAL)  
- 테스트 DB 사용 · Production CLI 배포  
- 로컬 stale HEAD(`7acd866c2`) 기준으로 수정하는 것 — **반드시 origin/main 에서 새 브랜치**

---

## 8. Owner 에게 묻는 결정 (구현 전 · 최대 4개)

1. **상위노출 위쪽 고정: 1건으로 바꾸는가, 3건 유지인가?** (O-2·CUT F 재개방 여부)  
2. **B-D2**(거래 뒤 페이지 핀 글 재등장 방지)를 이번 묶음에 넣는가?  
3. **PTR CTA(R-D1)** 원인 조사→설계→수정→v6 를 이번 묶음 최우선으로 하는가?  
4. **인트로 V-23·24** 는 계속 제외인가, 시험 게시 허용인가?

---

## 9. 요약 표

| 영역 | 실기 FAIL | 코드상 확정 결함 | Owner 결정 대기 | 완료로 유지 |
|---|---|---|---|---|
| 거래·커뮤니티 상위노출 | 핀 개수·중복 실기 NOT_PROVEN | **B-D1 정책 충돌(1 vs 3)** · **B-D2 뒤페이지 소비처 없음** | 1건 여부 · OV-1 | 1페이지 동시 중복 제거 · 표시(포인트 노출) |
| 팝업 | 없음 | 일괄삭제 비원자(의도적 AL-20) | AL-13·CX-04·F-3합침 | F-1·F-2·V-9~12 |
| 인트로 | 없음(제외) | 게시 실기 NOT_PROVEN | CX-10·시계·게시시험 | 시작경로·44px·INTRO 방문 |
| PTR | **V-13 CTA** | 원인 미확정 | — | D-1 칩만 버튼(코드) |

**다음 행동**: §8 결정 → 승인된 §6 묶음만 구현. 이 보고 단계에서 코드 수정 없음.
