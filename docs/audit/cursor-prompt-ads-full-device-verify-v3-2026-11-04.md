# Cursor 실기 프롬프트 v3 — 광고 전체 · 시나리오별 샘플 광고 · Android 실기기(USB) · iOS 시뮬레이터 · 어드민 웹 (2026-11-04)

> 아래 전체를 Cursor 에 붙여 넣는다.
> 이 프롬프트가 v2(`cursor-prompt-ads-full-device-verify-v2-2026-11-03.md`)와 옛 `cursor-prompt-ads-final-device-verify-2026-11-03.md` 를 **대신한다**.
> 기준 코드: main **`8671c2f75`** (재감사 P0·P1 + Owner 결정 1~4 반영). 그 전 배포에서 한 결과는 섞지 않는다.
> 이 작업은 **확인만** 한다. 코드는 고치지 않는다. 결함은 FAIL 로 기록만 하고 §7 보고서로 넘긴다.
> **Owner 승인 완료**: §3 샘플 광고 계획은 Owner 가 **2026-11-04 04:36 PHT** 에 승인했다(「샘플 광고 계획(프롬프트 §3) 승인한다」). 다시 묻지 않고 §2 사전 확인부터 시작한다. §3 표에 없는 샘플·비용이 필요하면 그때만 멈추고 묻는다.
> **결과 보고**: 끝나면 §7 형식으로 `docs/audit/cursor-report-ads-device-verify-2026-11-04.md` 에 저장한다. 결함(FAIL·N-x)과 기기 한계(§7-7)는 각각 별도 표로 둔다. 이 파일을 Claude 가 받아 결함을 판정하고 수정 계획을 Owner 에게 올린다.

---

## Owner 결정 (2026-11-04 · 시험용 · 아래는 모두 허용)

| 항목 | 결정 |
|---|---|
| 거래 상위노출 `63ba8c2b-…` | 11-03 22:14:41 PHT 에 이미 종료됨(환급 0 · 다른 세션의 「상위노출 ↔ 글 상태 연동」 마이그레이션 적용 시각과 같음). 시험 대상 아님 |
| 커뮤니티 상위노출 샘플 | 4건 모두 결제해도 된다(10,000P × 4) |
| 인트로 시험 게시 | 시간대 제한 없이 Live 로 올려도 된다. 끝나면 원래 상태(unpublished)로 되돌린다 |
| 사장님 팝업 판매 `POPUP_7D` | Owner 는 시험을 허용했다. **그러나 판매는 DB 값만으로 켜지지 않는다.** 코드 상수 `OWNER_PLATFORM_POPUP_NEW_SALES_ENABLED = false`(`lib/platform-popup/owner-popup-new-sales-gate.ts:16`)가 사장님 신청 화면·서버 저장을 막는다. 켜는 어드민 화면도 없다. 그래서 **Cursor 는 DB 를 바꾸지 않는다.** §4-F11 은 코드 변경·배포가 따로 승인되기 전까지 NOT_PROVEN 이다 |

위 4건은 §1 규칙 8·9 와 §4-F11 보다 우선한다. 그 밖의 규칙(먼저 알리기·409 즉시 중단·정리·백업 대조)은 그대로 지킨다.

---

## 0. 역할·범위

너는 SAMarket(DIBAY) 광고 기능 전체를 검증한다. 확인 수단은 다섯 가지다.
- **Android 실기기 1대**: Mac 에 **USB 로 연결된 기기**에 설치된 APK 로 시험한다. 새로 빌드·설치하지 않는다(이번 변경은 웹만이라 앱 재시작으로 반영된다).
- **iOS 시뮬레이터**: Xcode iOS Simulator 에서 시험한다. 실제 iPhone 은 쓰지 않는다.
- **어드민 웹**: PC 브라우저.
- **운영 DB**: SELECT 만 한다.
- **기기 로그**: Android `adb logcat`, iOS 시뮬레이터 Safari 웹 인스펙터.

**기기 한계는 결과와 따로 보고한다(§7-7).** 시뮬레이터·기기 특성 때문에 확인할 수 없는 항목은 FAIL 이 아니다. 「기기 한계」 표에 적고, 그 항목의 판정은 NOT_PROVEN(기기 한계)으로 둔다.

광고 종류마다 **샘플 광고를 실제로 올리고**, 다음 흐름이 설계대로 동작하는지 끝까지 확인한다.

> 어드민 등록·승인 → 앱 노출(iOS·Android) → 고객 행동(보기·누르기·닫기·결제) → 어드민 숫자·상태·이력 → 종료·환급 → 정리

### 기준 문서 (저장소 `docs/audit/`, 결함 ID 는 이 문서들을 따른다)

| 문서 | 내용 |
|---|---|
| `ads-full-audit-2026-11-03.md` | 첫 감사와 1~4단계 결과 (P-·A-·R-·I-·G-·B-) |
| `ads-reaudit-final-2026-11-03.md` | 재감사와 R1~R4·D-1~D-5 결과 (E-) |
| `ads-final-double-check-2026-11-03.md` | 더블 점검과 S-0·S-1·S-2 결과 (X-·H-·F-·C-·P-a/b·I-a) |
| `ads-owner-decisions-2026-11-03.md` | Owner 결정 O-1~O-10, DB 3건, S-3 결과, QA 배너 종료 |
| `trade-boost-new-rules-mockup-2026-11-03.html` | 상위노출 판매자 창 승인 시안 |

### 계약 문서 (`docs/`)

- `dibay-promotion-advertisement-product-contract.md`
- `dibay-feed-banner-product-hard-lock.md`
- `dibay-global-popup-ad-product-contract-lock.md`
- `dibay-delivery-advertising-ssot.md`
- `dibay-intro-13th-final-correction-ssot.md`
- `dibay-pull-to-refresh-audit-and-design.md`

---

## 1. 절대 규칙 (AGENTS.md · 예외 없음)

1. **테스트 DB `dibay-test`·`dibay-reset-qa` 는 조회도 변경도 하지 않는다.** 운영 프로젝트 `ckdosyydvgzqwpbwuhon` 만 쓴다. 새 Supabase 프로젝트를 만들지 않는다.
2. **CI·배포 결과를 기다리며 반복 확인하지 않는다.** Production SHA 는 **시나리오 묶음마다 한 번** 확인한다.
3. **코드 수정·배포·DB 구조 변경은 하지 않는다.**
   - DB 에 직접 INSERT·UPDATE·DELETE 하지 않는다.
   - 샘플 광고는 **어드민 웹·앱 화면으로만** 만든다. 정리도 화면으로 한다.
   - 화면으로 정리할 수 없는 것만 Owner 에게 보고한다.
4. **증거 없는 판정 금지**
   - PASS 는 **직접 본 것**만 쓴다.
   - 항목마다 아래를 함께 적는다.
     - Production SHA
     - 기기와 OS 버전
     - 앱 버전(`user_devices.app_version`)
     - 로그인 계정
     - 저장 주소
     - PHT 시각
     - 증거: 캡처 파일 · API 응답 · DB SELECT 결과
   - 못 본 것은 **NOT_PROVEN** 이다. 「~로 보임」「~일 것」은 판정 칸에 쓰지 않는다.
5. **Owner 화면 기준**
   - 「앱에 나온다」는 Owner 계정, Owner 저장 주소, Owner 휴대폰으로 본 것만 판정한다.
   - 다른 계정·주소로 본 결과는 그 조건을 적고 「Owner 화면 판정 아님」으로 표시한다.
6. **결함 이름 바꾸기 금지**
   - 어드민에 등록한 것이 앱에 그대로 안 나오면 원인과 상관없이 **먼저 FAIL** 로 적는다.
   - 「데이터가 없어서」「샘플이라」「계약대로」로 넘기지 않는다.
7. **화면 의미까지 확인**: 값이 같은지만 보지 않는다. 고객이 보는 제목·문구·「광고」 표기·버튼이 실제 내용과 맞는지, 어드민 등록과 1:1 로 맞는지 본다.
8. **운영 시험 저장 규칙**
   - ① §3 샘플 계획은 Owner 승인 완료(맨 위 표기). 만든 샘플마다 무엇을·언제(PHT)·어떤 계정으로·포인트 얼마인지 적는다. §3 밖의 샘플·비용은 만들기 전에 멈추고 묻는다.
   - ② 기존 설정을 고칠 때는 처음 읽은 revision 으로만 저장한다. **409(다른 사람이 저장함)가 나면 즉시 멈춘다.** 새 revision 으로 다시 덮어쓰지 않는다.
   - ③ 끝나면 만든 것을 모두 종료하거나 끈다. 바뀐 설정은 백업과 열 단위로 대조해 보고한다.
9. **기존 운영 데이터는 건드리지 않는다.** 샘플(`QA-ADS-1103-`)이 아닌 광고·주문은 바꾸지 않는다. 시작할 때 0-6 쿼리로 광고 중인 것을 다시 확인한다.
10. **계정**
    - 계정 만들기·비밀번호 입력은 하지 않는다. 필요한 계정은 Owner 에게 요청한다.
    - 필요한 계정: 테스트 회원 4개(포인트 보유), 매장 사장님 계정 1개(샘플 매장), 관리자 3종(전체 권한 · `ads` 만 · `business` 만).
11. **통화 기능은 건드리지 않는다.**
12. 시간은 **PHT(Asia/Manila)** 로 적는다. DB 값은 UTC 이므로 변환해서 적는다.

---

## 2. 사전 확인 (세션 시작 · 묶음마다)

| # | 확인 | 방법 | 기록 |
|---|---|---|---|
| 0-1 | Production SHA | Vercel Production 배포를 1회 확인한다. **`8671c2f75` 이상**이어야 한다. 그보다 이전이면 시작하지 않는다 | SHA |
| 0-2a | Android (USB) | `adb devices` 로 기기 1대가 보이는지 · `adb shell getprop ro.build.version.release` · `chrome://inspect` 로 앱 WebView 연결 | 기기 모델·Android 버전 |
| 0-2b | iOS 시뮬레이터 | ① `xcrun simctl list devices booted` 로 켜진 시뮬레이터 확인(없으면 iPhone 1대를 켠다) ② 앱이 설치돼 있지 않으면 **`npm run native:prepare` 를 먼저 실행**한다 — 실패(빌드 번호 증가 요구 등)하면 **멈추고 보고**한다(버전을 올리거나 빌드 설정을 바꾸지 않는다) ③ 통과하면 Xcode 로 시뮬레이터 대상 Debug 빌드를 실행한다 ④ Safari › 개발 › Simulator › 앱 WebView 연결 | 시뮬레이터 기종·iOS 버전·빌드 명령 결과 |
| 0-3 | 앱 버전 | `select platform, app_version, updated_at at time zone 'Asia/Manila' from public.user_devices where user_id = '<로그인 계정 id>' order by updated_at desc limit 5;` · 참고 운영값: Android `1.2.5 (32)` · iOS `1.2 (21)` · 시뮬레이터는 기기 등록(푸시 토큰)이 안 될 수 있다 → 그때는 Xcode 빌드 번호를 적고 「기기 한계」에 기록 | 버전(빌드) |
| 0-4 | 웹 반영 | 이번 변경은 모두 웹이다. 앱을 **완전히 끈 뒤 다시 켠다**(Android: 최근 앱에서 밀기 · 시뮬레이터: `xcrun simctl terminate booted <bundle id>` 후 다시 실행). 재설치는 필요 없다 | — |
| 0-5 | 로그 | Android `adb logcat \| grep -iE "chromium\|Capacitor\|DIBAY\|dibay-launch-intro"` · iOS 시뮬레이터 Safari 인스펙터 콘솔·네트워크 · 실패 요청은 응답 본문까지 저장 | 파일 |
| 0-6 | 운영 기준값 | 아래 쿼리를 실행해 보고서 첫 표에 붙인다 | 결과 |

```sql
-- 0-6 운영 기준값 (SELECT 만)
select 'promo_orders' k, (select json_agg(x) from (select domain, order_status, count(*) n from point_promotion_orders group by 1,2) x) v
union all select 'promo_products', (select json_agg(x) from (select id, duration_days, point_cost, is_active from member_promotion_products) x)
union all select 'feed_occupying', (select json_agg(x) from (select upper(placement) p, coalesce(target_category_id, target_topic_slug, '') t, count(*) n from feed_ad_campaigns where lower(coalesce(status,'')) not in ('','ended','rejected','draft') and (end_at is null or end_at > now()) group by 1,2) x)
union all select 'feed_products', (select json_agg(x) from (select id, point_cost, duration_days, is_active from feed_ad_products) x)
union all select 'popups', (select json_agg(x) from (select status, count(*) n from platform_popup_campaigns group by 1) x)
union all select 'intro_live', (select json_agg(x) from (select state, publication_id, revision from launch_intro_live) x)
union all select 'popup_pkg', (select json_agg(x) from (select code, is_active from platform_popup_ad_packages) x)
union all select 'trigger', (select json_agg(x) from (select tgname, tgenabled from pg_trigger where tgname = 'feed_ad_campaigns_pool_capacity_guard') x);
```

11-03 22:10 PHT 운영 기준값(작업자 조회)은 다음과 같다. 시작할 때 다시 조회해 비교한다.

| 항목 | 값 |
|---|---|
| 상위노출 주문 | 광고 중 0 (11-04 재조회 · `63ba8c2b` 는 11-03 22:14 PHT 종료) |
| 상위노출 가격 | 거래 7일 500P · 14일 900P / 커뮤니티 3일 10,000P · 7일 20,000P |
| 피드 배너 상품 | 거래 3일 8,000P · 7일 15,000P / 커뮤니티 3일 10,000P · 7일 20,000P |
| 피드 배너 자리 사용 | 모든 풀 0 (QA 이벤트 배너 15개 종료 후) |
| 피드 배너 자리 잠금 트리거 | 켜짐 |
| 팝업 | draft 19 · pending_review 1 · paused 6 · ended 25 · 노출 중 0 |
| 인트로 | unpublished (rev 34) |
| 사장님 팝업 상품 `POPUP_7D` | **꺼짐** — §4-F7 참고 |

---

## 3. 샘플 광고 계획 (Owner 승인 완료 · 2026-11-04 04:36 PHT)

- 모든 샘플은 이름·제목 앞에 **`QA-ADS-1103-`** 을 붙인다. 만든 직후 id 를 표에 적는다.
- 기간은 짧게 둔다. 상위노출은 7일 상품이 가장 짧으므로 확인이 끝나면 어드민에서 종료한다.
- 이미지는 저장소의 샘플 이미지나 Owner 가 준 이미지를 쓴다. 다른 회사 로고·실존 상표는 쓰지 않는다.

| 샘플 | 만드는 곳 | 계정 | 비용 | 용도 |
|---|---|---|---|---|
| S1 거래 상위노출 4건 | 앱 › 내 거래 글 › 광고(판매자 광고 창) 7일 | 테스트 회원 A~D (글마다 결제 간격 1분 이상) | 500P × 4 (+ 연장 500P 1회) | §4-A |
| S2 커뮤니티 상위노출 4건 | 앱 › 커뮤니티 내 글 › 더보기 › 「내 글 상위노출」 3일 | 테스트 회원 A~D | 10,000P × 4 — **많으면 Owner 가 건수를 정한다** | §4-B |
| S3 피드 배너 어드민 직접 4건 | 어드민 `/admin/advertising/direct` › 피드 배너 (거래 홈 3 + 거래 업종 1) | 관리자(전체) | 없음 | §4-C |
| S4 피드 배너 회원 신청 2건 | 앱 `/mypage/ads/feed-request` (거래 3일 1 · 커뮤니티 3일 1) | 테스트 회원 A·B | 8,000P + 10,000P(보류 후 승인 때 차감) | §4-C |
| S5 배달 배너 어드민 직접 3건 | 어드민 `/admin/delivery-ads` › 직접 만들기 (홈 상단 1 · 홈 중간 2 · 업종 상단 1) | 관리자(전체) | 없음 | §4-D |
| S6 마이 페이지 배너 2건 | 어드민 `/admin/my/banners/create` (모바일 이미지 포함) | 관리자(전체) | 없음 | §4-E |
| S7 전역 팝업 3건 | 어드민 `/admin/platform-popup` (거래 영역 2 · 전체 1, 우선순위 다르게) | 관리자(전체) | 없음 | §4-F |
| S8 PTR 띠 2건 | 어드민 `/admin/ptr-reveal-ads` (같은 영역, 순위 다르게) | 관리자(전체) | 없음 | §4-G |
| S9 인트로 시험 게시 1건 | 어드민 `/admin/platform-promotion/intro` (5초 이내) | 관리자(전체) | 없음 · **Live 로 올리므로 모든 사용자에게 보인다 → Owner 가 시간대를 정한다** | §4-H |
| S10 이벤트 1건 + 배너 배포 | 어드민 `/admin/platform-events` | 관리자(전체) | 없음 | §4-I |

포인트는 테스트 회원만 쓴다. 시작할 때와 끝날 때 각 회원의 잔액을 `select … from point_ledger` 로 적는다.

---

## 4. 시나리오

각 표의 **증거** 칸에는 캡처 파일 이름이나 쿼리 결과를 붙인다. iOS 와 Android 결과가 다르면 둘 다 적는다.

### 4-A. 거래 상위노출 (S1) — 결제·노출·연장·정지·종료·환급

**순서**: A~D 4명이 1분 간격으로 결제한다. 결제한 순서를 그대로 적는다.

| # | 단계 | 기대 결과 | 증거 |
|---|---|---|---|
| A-1 | 판매자 광고 창 (결제 전) | 위치 「거래 목록 첫 페이지 위쪽」, 7일 500P · 14일 900P, 시안과 같은 문구 | 캡처 + 시안 대조 |
| A-2 | 결제 4건 직후 원장 | 회원마다 `point_ledger` 차감 1행 500P · `point_promotion_orders` active 4 | SQL |
| A-3 | 거래 홈 1페이지 (Owner 휴대폰, iOS·Android) | 첫 칸은 일반 글, 2~4번째 칸 = **최근 결제 순 3개**(D, C, B), 모두 「광고」 칩 | 캡처 + `select target_id, start_at from point_promotion_orders where order_status='active' and domain='trade' order by start_at desc` |
| A-4 | 4번째(A 글) | 위쪽에 끼우지 않는다. 일반 자리에 나오면 「광고」 칩이 붙는다. 목록에서 사라지지 않는다(P-2) | 캡처 |
| A-5 | 2페이지 스크롤 | 1페이지의 광고 글이 다시 나오지 않는다 | 캡처 |
| A-6 | 판매완료 탭 · 가격 범위 밖 필터 | 광고 글을 끼우지 않는다(P-3) | 캡처 |
| A-7 | 광고 글을 예약중으로 바꿈 | 「광고」 칩 유지, NEW 칩 없음(D-3) | 캡처 |
| A-8 | 광고 글 상세 | 제목 위에 「광고」 칩(O-3) | 캡처 |
| A-9 | 판매자 광고 창 (광고 중) | 「광고 중 · {날짜}까지」 + 「7일 연장 · 끝나는 날 → 날짜」 + 「연장해도 목록 자리는 그대로예요」 | 캡처 |
| A-10 | 7일 연장 1회 (B 글) | 「광고 기간을 늘렸어요」, 새 종료일. 목록 자리는 그대로(D-1) · 원장 `promotion_extend` 1행 · 차감 500P 1회 | 캡처 + `select entry_type, amount, idempotency_key, created_at from point_ledger where related_id='<order>' order by created_at` |
| A-11 | (Android 실기기) 14일 줄을 고르고 연장 버튼을 누르자마자 비행기 모드 → 실패 안내 → 네트워크 복구 → **선택이 14일 그대로인지 확인** → 같은 버튼 다시 누름 (C 글) | 안내 「결제 결과를 확인하지 못했어요 … 두 번 결제되지 않아요」 → 다시 불러온 뒤에도 **14일 선택 유지**(R-02) → 다시 누르면 「이미 처리된 결제예요」 또는 연장 1회. **차감 1회** · 두 요청의 `Idempotency-Key` 같음(네트워크 기록) | 캡처 + 네트워크 기록 + SQL |
| A-11b | A-11 의 실패 안내 상태에서 **일부러 7일로 바꿔** 다시 누름 | 그래도 **추가 차감 없음** — 같은 키로 처음 결과가 돌아온다(R-01·R-02) | 네트워크 기록 + `select entry_type, amount, idempotency_key from point_ledger where related_id='<order>'` |
| A-12 | 포인트 내역 | 「광고 연장」 등 사람 말로 표시, 영어·코드 없음 | 캡처 |
| A-13 | 어드민 `/admin/trade/promotions` 에서 B 주문 「일시 중지」 | 앱 위쪽에서 빠진다. 판매자 창: 「운영자가 광고를 잠시 멈췄습니다 · 남은 기간 N일」, 연장 줄 없음, 주 버튼 「재개되면 연장할 수 있어요」(눌리지 않음) | 캡처 |
| A-14 | 일시정지 글에 다시 결제 (화면에서 막히면 API 응답으로) | 409 `already_active_promotion`, 차감 없음(P-4) | 응답 + 원장 |
| A-15 | 재개 | 종료일이 멈춘 시간만큼 뒤로 간다 · 위쪽에 다시 들어간다 | `end_at` 전후 |
| A-15b | **공통 화면**(`/admin/advertising` 전체 광고와 `/admin/advertising/boosts` 상위노출 관리) 양쪽에서 거래 주문 「일시 중지」 → 「재개」 | 둘 다 **사유 입력 칸이 나오고**, 사유를 넣으면 성공한다(N-02·N-03 · 예전에는 항상 실패) · 감사 기록 | 캡처 + `select order_status, paused_at from point_promotion_orders where id='<order>'` + `audit_logs` |
| A-16 | 어드민 **전체 광고**(`/admin/advertising`)에서 C 주문 「종료」 (운영 귀책) | 귀책 선택과 환급 미리보기가 나오고, 종료가 성공한다(H-1). 환급 = (첫 결제 + 연장) × 남은 비율 | 캡처 + `select order_status, refund_points from point_promotion_orders where id='<C>'` |
| A-17 | 도메인 메뉴 거래 › 상위노출에서 D 주문 종료 (회원 귀책) | 환급 규칙 문서대로 · 고객 알림 문구에 「홍보」가 없다 | 캡처 + SQL |
| A-18 | 상위노출 관리(`/admin/advertising/boosts`) 「상세」 | 그 주문이 선택된 화면이 열린다(H-5) | 캡처 |

**정리**: 남은 S1 주문을 어드민에서 종료한다. 회원별 포인트 변화량을 적는다.

### 4-B. 커뮤니티 상위노출 (S2)

| # | 단계 | 기대 결과 | 증거 |
|---|---|---|---|
| B-1 | 결제 창 | 문구에 「홍보」·「Community」가 없다 · 「상단 고정과는 다른 기능」 같은 모순 문구가 없다(O-1) | 캡처 |
| B-2 | 커뮤니티 홈 | 위쪽 **3개만**(최근 결제 순), 4번째는 일반 자리에 「광고」(O-2) · 카드 표기 「광고」 | 캡처 |
| B-3 | 주제 탭 (글의 주제) | 그 주제 광고 글이 보인다(C-1) | 캡처 |
| B-4 | 글 상세 | 말머리 줄에 「광고」(O-3) | 캡처 |
| B-5 | 글쓴이 더보기 메뉴 이름 | 「내 글 상위노출」 | 캡처 |
| B-6 | (Android 실기기) 7일을 고르고 결제 → 응답 끊김 → 다시 누르기 | 다시 불러온 뒤에도 **7일 선택 유지**(예전에는 3일로 돌아갔다 · R-01) · 두 번째 응답 「이미 처리된 결제예요」(R-03) · **차감 1회** | 캡처 + 네트워크 기록 + SQL |
| B-7 | 어드민 전체 광고에서 「재개」 | **사유 입력이 필수**(H-3) · 감사 기록에 변경 전·후 값 | 캡처 + `select action, before_json, after_json from audit_logs where target_id='<order>' order by created_at desc limit 3` |
| B-8 | 어드민 운영 사유 종료 | 고객 포인트 내역 부제목 「커뮤니티 상위노출 종료 환급 (운영 사유)」(O-10) | 캡처 + `select description from point_ledger where related_id='<order>'` |
| B-9 | 일시정지 글에 다시 결제 | 409, 차감 없음(E-10) | 응답 |

### 4-C. 피드 배너 (S3·S4) — 자리 3개·업종별·회원 신청·노출·클릭

| # | 단계 | 기대 결과 | 증거 |
|---|---|---|---|
| C-1 | S3 거래 홈 3건을 「진행 중」으로 등록 | 3건 모두 성공 · 등록 화면 자리 표시 3/3 | 캡처 |
| C-2 | 거래 홈 4번째 등록 | **「이 광고 위치가 가득 찼습니다(최대 3개)」로 막힌다** · DB 행 없음 | 캡처 + SQL |
| C-3 | 거래 **업종** 1건 등록 | 홈이 가득 차도 성공한다(풀 = 위치 + 업종) · 다른 업종 자리 표시는 0/3 | 캡처 |
| C-4 | 앱 거래 홈 (iOS·Android) | 4~6개 글마다 배너 · 「광고」 표기 · 광고주 이름(내부 코드 아님, F-1) · 점을 하나씩 누르면 그 점이 선택된다(E-2) · 3:1 비율 | 캡처 |
| C-5 | 앱 거래 업종 목록 | 그 업종에만 업종 배너가 나온다 | 캡처 |
| C-6 | 배너를 화면 절반 이상 1초 본다 | 어드민 **공통 광고 화면**(`/admin/advertising/operations`) 그 배너 행 「노출 N · 클릭 M」에서 노출이 1 늘어난다(O-4) | 캡처 + `select event_type, count(*) from feed_ad_events where campaign_id='<id>' group by 1` |
| C-7 | 같은 자리를 다시 스크롤 · 다른 목록 화면(업종 등)에서 같은 소재를 봄 · 앱 재시작 후 다시 봄 | **같은 사람·같은 소재는 1시간에 1번만** 센다(F-01 · 화면·자리·세션이 달라도) | SQL |
| C-8 | 배너를 누른다 | 목적지로 이동하고 클릭이 1 늘어난다 · 노출이 없던 상태(0.5초 만에 누름)여도 **노출 1 + 클릭 1** 로 기록(클릭 ≤ 노출) | SQL |
| C-9 | 0.5초만 보고 지나간다 | 노출이 늘지 않는다 | SQL |
| C-9b | Android(계정 A)와 iOS 시뮬레이터(계정 B)에서 같은 배너를 본다 | 서로 다른 사람이라 노출 2 · 같은 계정으로 두 기기에서 보면 1(회원 id 기준) | SQL |
| C-10 | S4 회원 신청 2건 (앱) | 포인트 보류 · 신청 상태 표시 | 캡처 + `select status, amount from feed_ad_point_holds where request_id='<id>'` |
| C-11 | 어드민 거래 메뉴 「회원 배너 신청」 | 주소 `…&domain=trade` · 「거래만 보는 중 · 전체 보기」 · 커뮤니티 신청이 없다(O-6②) · 「전체 보기」를 누르면 전체 건수로 돌아온다 | 캡처 |
| C-12 | 거래 신청 **승인** — 거래 홈이 3/3 인 상태 | 「자리 없음」으로 막히고 포인트는 그대로 보류된다 | 캡처 + SQL |
| C-13 | S3 1건을 종료한 뒤 다시 승인 | 승인 성공 · 보류 → 차감 · 앱에 신청 회원 닉네임으로 노출 | 캡처 + SQL |
| C-14 | 커뮤니티 신청 **반려** (공통 광고 화면에서) | 보류 포인트 환급 · 감사 기록 `feed_ad_request.reject`(H-2 단일 경로) | SQL `audit_logs` |
| C-15 | 회원 연장 (마이 › 광고 › 연장하기) — 자리가 찬 상태로 끝난 광고 연장 | 「지금 이 자리의 광고가 모두 찼습니다. 연장되지 않았고 포인트는 그대로입니다.」 · 원장 변화 없음 | 캡처 + SQL |
| C-16 | 이미지가 깨진 소재 (S3 1건 이미지 주소만 바꿔 저장) | 일반 대체 이미지가 「광고」와 함께 나오는지 기록한다 — **알려진 미수정 결함**(§5) | 캡처 |
| C-17 | (Owner 결정 1) 어드민이 C-13 회원 광고를 **일시정지** → 회원 마이 › 광고 | 「연장하기」 버튼이 없다 · API 로 연장 요청 시 409 `admin_paused`, **차감 없음** · 어드민 정지 사유·감사 기록 그대로 | 캡처 + 응답 + 원장 + `audit_logs` |
| C-18 | (Owner 결정 1) 어드민이 같은 광고를 **종료** → 회원 연장 | 버튼 없음 · 409 `admin_ended` · 차감 없음 | 캡처 + 응답 + 원장 |
| C-19 | 기간이 끝나 저절로 끝난 회원 광고(어드민 조치 없음)가 있으면 | 연장 가능(관리자 조치와 구분) · 없으면 NOT_PROVEN | 캡처 |
| C-20 | 공통 화면에서 피드 배너 일시정지·재개·종료 | 각각 `audit_logs` 에 `feed_ad_request.pause/resume/end` 1행(N-04) | `select action, after_json, created_at from audit_logs where target_id='<id>' order by created_at` |

### 4-D. 배달 배너 (S5)

| # | 단계 | 기대 결과 | 증거 |
|---|---|---|---|
| D-1 | 홈 상단: 앱을 완전히 끄고 다시 켠 뒤 첫 방문 | 140px 빈 상자가 깜빡이지 않는다(B-4) · 5초 자동 회전 | 화면 녹화 |
| D-2 | 홈 상단 점을 손가락으로 누른다 · 점이 없는 배너 맨 아래 띠(점 옆)를 누른다 | 점: 누른 점으로 넘어간다(누르는 영역 24px) · 점 옆 띠: **배너 링크가 열린다**(D-01 회귀 수정) | 녹화 |
| D-3 | 홈 중간 배너 2건 중 1위 이미지를 깨뜨림 | **다음 배너가 그 자리에 나온다**(예비) · 빈칸 없음 | 캡처 |
| D-4 | 업종 상단 | 업종마다 1개 · 어드민 등록과 1:1 대조 | 캡처 + 어드민 목록 |
| D-5 | 어드민 배달 화면 탭 「한 번에 보이는 배너 1 · 예비 포함 최대 등록 3」 칩 | 홈 탭·둘러보기 탭 둘 다 같은 칩 | 캡처 |
| D-6 | 배달 메뉴 「매장 홍보 신청」 | `domain=delivery`, 배달 신청만(O-6②) | 캡처 |
| D-7 | 이력 › 배달 광고 「상세」 | 404 없이 상세가 열린다(H-5) | 캡처 |
| D-8 | 노출·클릭 | `delivery_ad_impression_events`·`delivery_ad_click_events` 에 1건씩 | SQL |

### 4-E. 마이 페이지 배너 (S6)

| # | 단계 | 기대 결과 | 증거 |
|---|---|---|---|
| E-1 | 휴대폰(폭 768 미만) | **모바일 이미지**가 나온다 | 캡처 |
| E-2 | 1번 배너 × | **2번 배너가 같은 자리에** 나온다 | 녹화 |
| E-3 | 어드민 목록 · 기간 지난 배너 | 「만료」로 표시(B-7) · 상태 필터도 같은 값으로 거른다 | 캡처 |
| E-4 | 게시했던 배너를 초안으로 되돌린 뒤 삭제 | 완전 삭제가 아니라 **숨김 보관** · 삭제 안내 「게시한 적 없는 초안만…」 | 캡처 + `select id, status from my_page_banners` |
| E-5 | 한 번도 게시하지 않은 초안 삭제 | 완전 삭제 | SQL |
| E-6 | 빈 목록 | 「등록」 버튼 · 권한 없는 관리자는 비활성 + 사유 | 캡처 |

### 4-F. 전역 팝업 (S7)

| # | 단계 | 기대 결과 | 증거 |
|---|---|---|---|
| F-1 | 거래 진입 | 순위 1위(영역 지정 > 전체 > 우선순위, G-4) 1개만 · 화면에 「광고」 표기(G-12) · CTA 로 이동 | 캡처 |
| F-2 | × 로 닫고 다른 화면에 갔다가 돌아온다 | 같은 실행 동안 그 팝업이 다시 뜨지 않는다 · 같은 영역의 **2위 팝업이 대신 나온다**(E-7) | 녹화 |
| F-3 | × 로 닫은 뒤 **새로고침**(WebView 재로드 / 로그인 상태 유지) | 다시 뜨지 않는다(S-3) | 녹화 |
| F-4 | 앱을 완전히 껐다가 다시 켠다 | `close_only` 팝업은 다시 나온다 | 캡처 |
| F-5 | (Owner 결정 2) 「다시 보지 않기」(CAMPAIGN) → 어드민에서 ① **제목·본문·CTA 문구만** 수정 ② **소재 이미지 교체 → 검토 → 승인** | ① 다시 나오지 않는다 ② 승인 뒤 그 사람에게 다시 나온다 | 캡처 + `select mode, campaign_revision from platform_popup_user_suppressions where campaign_id='<id>' order by created_at desc limit 3` |
| F-6 | 1위 소재 이미지 주소를 깨뜨림 | 2위가 나온다(S-3 fall-through) · resolve 요청이 반복되지 않는다(P-a) | 네트워크 기록 |
| F-7 | 거래 홈 버튼 메뉴·커뮤니티 더보기·확인창을 연 채로 팝업 조건 | 창 위에 팝업이 겹치지 않는다(G-8) | 캡처 |
| F-8 | CTA 를 빠르게 두 번 누른다 | 한 번만 이동 · 기록 1회 | SQL `platform_popup_campaign_events` |
| F-9 | 가로 화면 · 메신저 · 결제 화면 | 뜨지 않는다 | 캡처 |
| F-10 | Android 뒤로가기 | 팝업만 닫힌다(화면 이동 없음) | 녹화 |
| F-11 | 사장님 팝업 신청 | 판매가 코드 상수로 꺼져 있다(Owner 결정 표). 사장님 앱 `/stores/owner/ads` 에서 「신규 판매 중지」 안내가 보이는지, 기존 신청 보기가 되는지만 확인한다. 신청·승인·반려는 **NOT_PROVEN** | 캡처 |
| F-12 | 어드민 배달 메뉴 「사장님 팝업 신청」 | 「전체 광고」 팝업 종류(`/admin/advertising?family=popup&domain=delivery`)가 열리고 **기존 사장님 신청 4건이 보인다**(R-08 · 예전에는 항상 0건) · 광고 승인 화면에 빈 「팝업」 탭이 없다 | 캡처 + `select count(*) from platform_popup_owner_requests` |

### 4-G. 당겨서 새로고침(PTR) 띠 (S8)

| # | 단계 | 기대 결과 | 증거 |
|---|---|---|---|
| G-1 | 당겨서 새로고침 | 띠 표시 · 새로고침을 막지 않는다 · 끝까지 당기지 않고 취소하면 노출로 세지 않는다 | 녹화 + SQL |
| G-2 | 1위 띠 「닫기」(보류) → 다시 당긴다 | **2위 띠**가 나온다(S-3) | 녹화 |
| G-3 | CTA 연타 | click 1건(R-1) · 외부 주소는 인앱 브라우저(R-2) | SQL |
| G-4 | 태블릿·회전(가능하면) | 깨진 이미지가 보이지 않는다(R-6) | 캡처 |
| G-5 | 어드민 시작·종료 시각 | 입력한 PHT 그대로 저장(E-8) | SQL |
| G-6 | 띠의 CTA 가 아닌 부분을 누른다 | 이동하지 않는다(O-8 결정: 버튼만) | 녹화 |
| G-7 | (Owner 결정 2) PTR 띠 「다시 보지 않기」(once_campaign) → 어드민에서 **태블릿 띠 또는 로고만 교체 → 승인** | 다시 나온다(소재 버전 = 휴대폰·태블릿·로고 3종) · 제목만 바꾸면 다시 나오지 않는다 | 캡처 + 숨김 행 `campaign_revision` |

### 4-H. 인트로 (S9 · Owner 가 정한 시간대에만)

| # | 단계 | 기대 결과 | 증거 |
|---|---|---|---|
| H-1 | 5초를 넘는 게시본을 재게시·재개 | 버튼 비활성 + 이유 문구(I-3) | 캡처 |
| H-2 | 시험 게시본 Live → 앱을 완전히 끄고 켬(콜드 스타트 2회) | 새 게시본은 **다음** 콜드 스타트부터 · 5초 이내 · 끝나면 첫 화면 | 녹화 |
| H-3 | 인트로 중 백그라운드 전환 · 복귀 | 시작 화면에 갇히지 않는다(I-4) | 녹화 + 로그 |
| H-4 | (Owner 결정 3·4 측정) 콜드 스타트 5회씩(Android 실기기 · iOS 시뮬레이터 · 비행기 모드 1회 포함) | **시작 화면 강제 해제용 타이머는 없다**(S-3 의 5초 제한은 Owner 결정 4로 제거됨). 로그 `[dibay-launch-intro] phase=preparing` → `phase=showing`(또는 `exit`) 사이 시간을 회마다 ms 로 적는다 — 이 값이 준비 단계 적정값 결정의 측정 근거다. 시작 화면이 10초 넘게 남으면 FAIL 로 적고 그때 마지막 로그 줄을 붙인다 | 녹화 + 로그 시각 표 |
| H-5 | 편집 탭 수정(저장 안 함) → 상태 탭 「더 보기」 | 수정 내용이 남아 있다(I-a) | 캡처 |
| H-6 | 오류 문구 | 빈 장면 게시·업로드 실패 등이 한국어로 나온다(I-5) | 캡처 |
| H-7 | 정리 | 시험 게시를 내리고 원래 상태(unpublished)로 되돌린다 · `launch_intro_live` 확인 | SQL |

### 4-I. 이벤트 배포 (S10)

| # | 단계 | 기대 결과 | 증거 |
|---|---|---|---|
| I-1 | 이벤트 배너 배포 — 거래 홈 피드 자리가 3/3 인 상태 | 배너 채널 결과가 「이 광고 위치가 가득 찼습니다…」로 나온다(코드값 아님) | 캡처 |
| I-2 | 자리가 빈 상태에서 배포 | 앱 피드에 이벤트 배너 · 이름 앞 「Event banner ·」 접두어가 고객에게 보이지 않는다(F-1) | 캡처 |
| I-3 | 이벤트 배너 채널을 **끄고 저장** | 피드 캠페인 상태 `ended` · 그 자리 점유가 풀린다(F-05 · 예전에는 `paused` 로 자리를 계속 차지) · 다시 켜면 같은 캠페인이 `active` | `select id, status from feed_ad_campaigns where id='<ref>'` + 0-6 `feed_occupying` |

### 4-J. 어드민 메뉴·공통 광고 화면·권한 (PC)

| # | 단계 | 기대 결과 | 증거 |
|---|---|---|---|
| J-1 | 사이드바 광고·배너 › 광고 운영 7개, 플랫폼 운영, 거래·커뮤니티·배달 도메인 메뉴 | 메뉴 이름 = 화면 제목 · 막힌 링크 없음 · 도메인 바로가기 5개(O-6①) | 캡처 |
| J-2 | 「전체 광고」 위 카드 4개(인트로·PTR·마이 배너·이벤트) | 지금 노출 중인 수와 「관리」 링크(O-5) · 수가 각 화면과 같다 | 캡처 대조 |
| J-3 | 광고 종류 × 위치 × CTA 표(`ads-final-double-check` §3-2) | 도메인 메뉴와 공통 화면 양쪽에서 만들기·수정·정지·재개·종료·승인·순서·환불을 눌러 O/X 로 다시 채운다 | 표 |
| J-4 | 빈 목록 6곳(공통 화면·마이 배너·PTR·팝업·이벤트 배너·배달 광고) | 「등록」 버튼 · 권한 없으면 비활성 + 사유 | 캡처 |
| J-5 | `ads` 만 있는 계정 | 광고 위치 순서 저장 비활성 + 사유 · 사장님 이벤트 승인 비활성 · 피드 배너 승인 가능 | 캡처 |
| J-6 | `business` 만 있는 계정 | 직접 팝업 등록·피드 배너 승인 비활성 + 사유 · 사유를 쓴 **뒤에** 403 이 나면 FAIL(H-4) | 캡처 |
| J-7 | 한국어 화면에 영어·코드(Popup·Boost·Hero·writer·surface·상태 코드) | 없음(H-7) · 있으면 위치 목록 | 캡처 |
| J-8 | 광고 이력 상태 표시·필터 | 사람 말로 표시되고, 필터가 맞게 거른다 | 캡처 |
| J-9 | 광고 상품/가격 화면 | 상위노출 가격 = DB 값 · 수정 링크 `/admin/trade-ad-policies` · 커뮤니티 가격 행 | 캡처 |
| J-10 | 내부 메모 저장 → 다시 열기 | 메모 목록에 보인다(A-9) | 캡처 |

---

## 5. 알려진 미수정 결함 — 확인만 하고 FAIL 로 적는다 (고치지 않는다)

> 재감사 P2 전체 목록과 ID 는 `ads-full-reaudit-2026-11-04.md` §1-3 ~ 1-7 을 따른다. 아래는 실기에서 눈으로 볼 수 있는 것만 뽑았다.

| ID | 내용 | 확인 방법 |
|---|---|---|
| K-1 | 피드 배너 이미지가 깨지면 일반 대체 이미지가 「광고」와 함께 나온다 | C-16 |
| K-2 | 팝업 숨김 기록이 매번 새 행으로 저장되고 요청 제한이 없다 | × 를 여러 번 → `platform_popup_user_suppressions` 행 수 |
| K-3 | 팝업 resolve 의 DB 조회가 차례로 실행된다(느림) | 네트워크 응답 시간 기록 |
| K-4 | 첫 화면(서버 시드)과 목록 API 의 상위노출 끼우기 조건이 다르다(시드에 지역 조건 없음) | 다른 지역 저장 주소로 거래 홈 첫 화면 vs 새로고침 비교 |
| K-5 | 승인형 상위노출 주문은 운영 종료 환급이 0 이다(승인형 상품 0개라 지금은 재현 불가) | NOT_PROVEN |
| K-6 | Live 인트로 게시본이 손상되면 기기용 조회가 500 이다(기기는 이전 화면을 씀) | 재현하지 않는다 · NOT_PROVEN |
| K-7 | 허브의 피드 승인 감사 이름이 도메인 화면과 다르고 변경 전 값이 없다 | C-13 뒤 `audit_logs` 비교 |
| K-8 | 「다시 보지 않기」 기록 35건은 소재 정보 없이 저장돼 소재를 바꿔도 계속 숨겨진다 | `select count(*) from platform_popup_user_suppressions where mode='CAMPAIGN' and campaign_revision is null` |

새로 찾은 결함은 **N-1, N-2 …** 로 번호를 붙이고 재현 단계를 적는다.

---

## 6. 정리 (끝날 때 반드시)

1. 만든 샘플을 모두 종료하거나 끈다. 정리도 화면으로 한다.
   - S1·S2 상위노출: 어드민에서 종료
   - S3·S4 피드 배너: 종료
   - S5 배달 배너: 종료
   - S6 마이 배너: 숨김 또는 삭제
   - S7 팝업·S8 PTR: 종료
   - S9 인트로: 게시 중단
   - S10 이벤트: 비공개
2. 정리 뒤 §2 0-6 쿼리를 다시 실행해 시작 값과 대조한다. 시작할 때부터 있던 행만 남아야 한다.
3. 회원별 포인트 변화량, 결제·연장·환급을 원장 행으로 맞춘다.
4. 화면으로 정리하지 못한 것은 남은 id 와 상태를 그대로 보고한다. DB 를 직접 고치지 않는다.

---

## 7. 보고 형식 (끝날 때 1회)

1. **첫 줄**: Production SHA · Android 기기 모델·앱 버전(빌드) · iOS 시뮬레이터 기종·iOS 버전·빌드 · 시험 시간대(PHT)
2. **작업자가 만든 문제를 맨 앞에**: 운영값 덮어쓰기, 정리 못 한 샘플, 잘못 쓴 포인트, 409 무시 등
3. **결과 표**: `# | 항목 | 조건(계정·주소) | Android 실기기 | iOS 시뮬레이터 | 판정 PASS/FAIL/NOT_PROVEN | 증거 | PHT` — Owner 화면(Owner 계정·주소·휴대폰) 판정은 Android 실기기 결과로만 한다. 시뮬레이터 결과는 「Owner 화면 판정 아님」
4. **FAIL 목록**: 결함 ID(기존 문서 기준 · 새 결함 N-x), 재현 단계, 어드민 설정값과 앱 화면의 차이
5. **샘플 정리 결과**: 만든 것 / 끈 것 / 남은 것 · 포인트 변화량 · 시작·끝 기준값 대조표
6. **확인하지 못한 항목**: 모두 NOT_PROVEN 으로 표에 남긴다. 「일부만 확인」이면 그렇게 쓴다
7. **기기 한계 (결과 표와 따로)**: `# | 항목 | 기기(Android 실기기 / iOS 시뮬레이터) | 한계 내용 | 대신 확인한 것 | 남는 확인 필요` — 아래는 미리 알려진 한계다. 시험 중 새로 만난 한계도 여기에 더한다
   - iOS 시뮬레이터: 원격 푸시(APNs) 수신·푸시로 앱 열기(인트로 「launch intent」 경로) · 실제 셀룰러 끊김(비행기 모드는 Mac 네트워크를 끄는 것으로 대신) · 카메라·사진첩 실제 사진 · Face ID · 실기기 성능·발열(시작 시간 측정값은 실기기와 다를 수 있음) · `user_devices` 기기 등록
   - Android 실기기: 다른 Android 버전·제조사 · 태블릿 화면(PTR 태블릿 띠 G-4·G-7 은 휴대폰에서 숨김 기록 버전만 확인) 
   - 공통: 사장님 팝업 신규 판매(코드 상수로 꺼짐 · F-11) · 승인형 상위노출 상품 0개(K-5)
8. **보고서 파일**: 결과를 `docs/audit/cursor-report-ads-device-verify-2026-11-04.md` 에 저장하고, 결함(FAIL·N-x)은 맨 위 표로 따로 모은다. 이 파일을 Claude 에게 넘겨 결함 판정·수정 계획을 받는다
