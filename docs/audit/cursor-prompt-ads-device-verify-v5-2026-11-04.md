# Cursor 실기 프롬프트 v5 — 광고 ② 구현 + 광고 표면 전체 SSOT 확인 (22개 실행 · 인트로 2개 제외 · 2026-11-04 PHT)

> 이 파일 전체를 Cursor 에 붙여 넣는다. **보고는 전부 한국어로 쓴다.**
> - v4 프롬프트(`cursor-prompt-ads-device-verify-v4-2026-11-04.md`)를 대신한다. v4 는 실행하지 않는다.
> - 실기기: Android = USB 로 연결된 기기(`adb`) · Xiaomi 태블릿(연결돼 있으면) · iOS = iOS 시뮬레이터 · 어드민 = 연결된 브라우저.
> - **Cursor 가 할 수 있는 일은 Owner 에게 미루지 않는다.** 샘플 만들기, 포인트·캐시 넣고 회수, 어드민 조작, 캡처, SELECT 는 Cursor 가 한다. 막혔을 때만 「기기 한계」에 적고, 그때는 **시도한 방법과 결과**를 같이 적는다.

---

## 0. 확인 대상

- **Production SHA `c8e0aba3c` 이상.** 이번 실기가 확인하는 커밋:
  - `9af6b28c2`·`7b9912ffd`·`627fe3022`: 광고 ②
  - `818d5e625`·`c8e0aba3c`: 광고 표면 전체 SSOT
- 운영 DB 변경 9건은 2026-11-04 에 모두 적용됐다. 운영 QA 광고 8건도 같은 날 종료됐다. 그래서 지금 운영에 노출 중인 팝업·PTR·QA 배너는 없다.
- 웹 변경만 있다. 앱 재설치·네이티브 빌드·버전 변경은 하지 않는다. 앱을 완전히 끄고 다시 켜면 반영된다.
- 정본 문서(필요할 때만 연다):
  - `docs/dibay-ads-surface-master-ssot.md`: 표시 순서 · 빈도 이름 · 44px · 미리보기 = 고객 화면
  - `docs/audit/ads-fix-design-2026-11-04.md` · `ads-fix-design-supplement-2026-11-04.md`

---

## 1. 절대 규칙 (AGENTS.md · 예외 없음)

1. 운영 `ckdosyydvgzqwpbwuhon` 만 쓴다. DB 는 **SELECT 만** 한다. `dibay-test`·`dibay-reset-qa` 는 쓰지 않는다.
2. 코드 수정·커밋·배포·네이티브 빌드는 하지 않는다. Production SHA 는 **시작할 때 1번만** 확인한다.
3. 샘플은 **앱·어드민 화면으로만** 만들고, 정리도 화면으로만 한다. API 를 직접 부르거나 DB 를 고치지 않는다.
4. 샘플 이름·제목은 `QA-ADS-1104V5-` 로 시작한다. 이 접두가 없는 광고·주문·글은 건드리지 않는다.
5. **판정 규칙**
   - PASS 는 직접 본 것만 쓴다.
   - 항목마다 아래를 함께 적는다:
     - Production SHA
     - 기기·OS
     - 앱 버전(`user_devices.app_version`)
     - 로그인 계정
     - 저장 주소
     - PHT 시각
     - 증거(캡처 파일명 / SELECT 결과)
   - 못 본 것은 **NOT_PROVEN** 이다. 어드민 등록과 앱 화면이 다르면 원인과 상관없이 **먼저 FAIL** 로 적는다.
6. **FAIL 이 나와도 고치지 않는다.** 증거를 남기고 다음 항목으로 간다.
7. 기존 설정을 바꿀 때 **409(다른 사람이 저장함)가 나면 즉시 멈추고** 보고한다.
8. 계정 만들기·비밀번호 입력은 하지 않는다.
   - 회원: q테스트1·w테스트1·zxzx11
   - 관리자: 메인관리자(@aaaa)
   - 필요한 계정이 로그인돼 있지 않을 때만 Owner 에게 1줄로 요청한다.
9. 통화 기능은 건드리지 않는다. 시간은 PHT 로 적는다.
10. **대상 제한이 없는 팝업은 모든 회원에게 보인다.** 팝업 샘플은 기간을 **시험 시간(최대 1시간)** 으로 잡고, 끝나면 바로 종료한다. 켠 시각과 끈 시각을 적는다. PTR 은 대상 「허용 목록」에 테스트 계정만 넣는다.

---

## 2. 사전 확인 (시작할 때 1번)

| # | 확인 | 방법 | 기록 |
|---|---|---|---|
| 0-1 | Production SHA | Vercel Production 배포 1회. 상태가 **Ready** 이고 SHA 가 **`c8e0aba3c` 이상**이 아니면 시작하지 않는다 | SHA · 상태 |
| 0-2a | Android | `adb devices` · 모델 · `getprop ro.build.version.release` · `chrome://inspect` 로 WebView 연결 | 모델·버전 |
| 0-2b | iOS 시뮬레이터 | `xcrun simctl list devices booted`. 앱이 없으면 `npm run native:prepare` 성공 뒤 Xcode 로 시뮬레이터 Debug 빌드. prepare 가 실패하면 멈추고 보고. Safari › 개발 › Simulator 로 연결 | 기종·iOS·빌드 |
| 0-3 | 앱 버전 | `select platform, app_version, updated_at at time zone 'Asia/Manila' from public.user_devices where user_id = '<계정 id>' order by updated_at desc limit 5;` | 버전(빌드) |
| 0-4 | 웹 반영 | 두 기기 모두 앱을 **완전히 끄고 다시 켠다** | — |
| 0-5 | 시작 기준값 | 아래 SELECT 결과를 보고서 첫 표에 붙인다 | 결과 |

```sql
-- 0-5 시작 기준값 (SELECT 만)
select 'popup_live' k, count(*)::text v from platform_popup_campaigns where status in ('active','scheduled')
union all select 'feed_live', count(*)::text from feed_ad_campaigns where status in ('active','scheduled') and (end_at is null or end_at > now())
union all select 'promo_live', count(*)::text from point_promotion_orders where order_status in ('active','paused','pending_review')
union all select 'delivery_banner_live', count(*)::text from store_banner_ad_campaigns where lifecycle_status='ACTIVE' and end_at > now()
union all select 'intro_live', coalesce((select state from launch_intro_live limit 1)::text, 'none')
union all select 'qa_points', (select json_agg(json_build_object('nick', nickname, 'points', points))::text from profiles where nickname in ('q테스트1','w테스트1','zxzx11'))
union all select 'visit_sources', (select json_object_agg(source_channel, n)::text from (select source_channel, count(*) n from platform_promotion_content_visits group by 1) x);
```

---

## 3. 샘플 (모두 화면으로 · 끝나면 §5 로 정리)

포인트·비즈니스 캐시는 어드민 화면으로 필요한 만큼만 넣고, 끝나면 같은 화면으로 회수한다. 넣은 양·회수한 양을 표로 적는다.

| 샘플 | 만드는 곳 · 계정 | 쓰는 항목 |
|---|---|---|
| S-T 거래 글 + 거래 상위노출 | 앱 글쓰기 + 「광고」 시트 · q테스트1 · 판매중 글 | V-2 |
| S-C 커뮤니티 글 + 상위노출 | 앱 커뮤니티 글쓰기(동네 탭에 나오는 지역) + 「내 글 상위노출」 · q테스트1 | V-3 · V-4 · V-20 |
| S-F 회원 피드 배너 신청 | 마이 › 광고 › 피드 배너 신청(거래 홈) · q테스트1 → 어드민 승인 | V-1 · V-8 · V-19 |
| S-A 관리자 피드 배너 2개 | 어드민 피드 배너 만들기: 거래 홈 1개 · 거래 카테고리 1개. 목적지는 S-T 글. **이미지 2장 이상**(손으로 넘기기 확인용). 3:1·1200×400 이상 | V-6 · V-7 · V-14 · V-17 |
| S-P1 팝업 「하루 1회」 | 어드민 팝업 · 빈도 **하루 1회** · CTA = S-T 글 · 기간 1시간 | V-9 · V-10 |
| S-P2 팝업 「캠페인 1회」 | 빈도 **캠페인 1회** · CTA = `https://www.google.com` · 기간 1시간 | V-11 · V-12 |
| S-R PTR 띠 | 어드민 PTR · 대상 = 허용 목록(q테스트1 만) | V-13 · V-16 |
| S-D 배달 홈 상단 배너 | 사장님 샘플 매장 · 비즈니스 캐시(어드민으로 충전) → 사장님 화면에서 신청 → 어드민 승인 | V-15 · V-21 |

**이미지 넣기**
- 어드민 파일 입력: Playwright `page.setInputFiles` 로 넣고 화면의 저장 버튼을 누른다.
- 앱 사진 선택
  - Android: `adb push qa.png /sdcard/Pictures/` → `adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///sdcard/Pictures/qa.png`
  - iOS: `xcrun simctl addmedia booted qa.png`
- 버튼 위치를 못 찾으면 Android `adb shell uiautomator dump`, iOS 는 Safari 인스펙터로 찾는다.

---

## 4. 실기 24개

SQL 은 Cursor 가 SELECT 로 직접 돌린다. MCP 가 없으면 쿼리를 보고서에 적고 「Claude 조회 요청」으로 둔다.

### A. 돈·상위노출 (V-1 ~ V-5)

| # | 항목 | 기기 | 할 일 | PASS 조건 | 증거 |
|---|---|---|---|---|---|
| V-1 | **피드 배너 연장 끊김 재시도 (P0)** | Android | ① S-F 진행 중에 마이 › 광고 › 연장 창에서 상품을 고른다 ② **비행기 모드를 켜고** 「연장」 → 오류 안내 ③ 비행기 모드를 끄고 연장 창을 다시 연다 → 같은 상품이 골라져 있는지 본다 ④ 다시 「연장」 | 포인트 차감 **1번** · `end_at` 1번만 늘어남 | 캡처 3장 + `select entry_type, amount, related_id, created_at at time zone 'Asia/Manila' from point_ledger where related_id like 'renew:<campaignId>:%' order by created_at;` |
| V-2 | 거래 상위노출 표시 | Android · iOS | w테스트1 로 거래 홈·카테고리를 본다 | 「광고」 표시 · 목록 위쪽 · 남은 기간·종료일 안 보임 | 캡처 |
| V-3 | 커뮤니티 상위노출 표시 | Android · iOS | w테스트1 로 커뮤니티 홈을 본다 | 일반 글과 같은 카드 + 배경 + 「포인트 노출」 · 남은 기간 없음 · 누르면 **그 글 상세** | 캡처 2장 |
| V-4 | 동네 탭 상위노출 | Android | 같은 동네 계정과 다른 동네 계정으로 동네 탭을 본다 | 그 동네 계정에만 위쪽에 보임 | 캡처 2장 + 두 계정의 저장 주소 |
| V-5 | 결제 창 시각 PHT | Android | 기기 시간대를 서울로 바꾼다(설정 › 날짜·시간, adb 탭) → 거래 광고 창·커뮤니티 상위노출 창의 끝나는 시각을 본다 → **시간대를 원래대로 되돌린다** | 「11월 ○일 HH:mm」이 PHT 값 그대로(서울 +1시간 아님) | 캡처 + 바꾸기 전·후 시간대 |

### B. 피드·배달 배너 (V-6 ~ V-8, V-14, V-15, V-17)

| # | 항목 | 기기 | 할 일 | PASS 조건 | 증거 |
|---|---|---|---|---|---|
| V-6 | 피드 배너 노출·클릭 | Android | S-A 거래 홈 배너를 1초 이상 보이게 둔 뒤 누른다 | 노출 1 · 클릭 1 · S-T 글로 이동 | `select event_type, placement, created_at at time zone 'Asia/Manila' from feed_ad_events where campaign_id='<S-A id>' order by created_at;` + 캡처 |
| V-7 | 거래 격자 배너 자리 | Android · Xiaomi 태블릿 | 거래 홈·카테고리를 스크롤한다 | 2칸 한 줄 전체 · 줄 첫 자리 · 배너 사이 글 4개 이상 | 캡처 2장 |
| V-8 | 운영자 정지 안내 | iOS | 어드민에서 S-F 를 정지한다(공개 사유 「QA 점검」, 내부 메모 「QA 내부」). q테스트1 로 마이 › 광고를 본다 | 「운영자가 멈췄습니다」 + 「QA 점검」 · 「QA 내부」는 화면에도, 마이 광고 API 응답에도 없음 | 캡처 + 네트워크 응답 |
| V-14 | **피드 배너 손으로 넘기기** | Android · iOS | S-A(이미지 2장 이상)를 손가락으로 왼쪽·오른쪽으로 민다 | 다음·이전 장으로 넘어감 · 점 표시가 따라감 · 세로 스크롤은 막히지 않음 | 화면 녹화 |
| V-15 | **배달 히어로 멈춤 + 스와이프** | Android | ① 배달 홈 상단 배너를 스와이프하고 점을 누른다 ② 배너가 화면 밖으로 가게 스크롤한 채 10초 둔다 ③ 앱을 백그라운드로 10초 보낸 뒤 돌아온다 | ① 동작함 · ②③ 그동안 넘어가지 않음(돌아왔을 때 같은 장) | 녹화 |
| V-17 | **어드민 미리보기 = 고객 화면** | 어드민 웹 + Android | S-A 만들기 화면의 미리보기와 거래 홈 실제 배너를 나란히 캡처 · 피드 업로드에 2:1 이미지를 올려 본다 | 머리줄(광고주 이름 + 「광고」)·모양이 같음 · 2:1 이미지는 「3:1·1200×400」 한국어 안내와 함께 거부 | 캡처 2장 + 거부 캡처 |

### C. 팝업·PTR (V-9 ~ V-13, V-16, V-18)

| # | 항목 | 기기 | 할 일 | PASS 조건 | 증거 |
|---|---|---|---|---|---|
| V-9 | **팝업 × · 하루 1회** | Android | S-P1 이 뜨면 × → 앱을 완전히 껐다 켬 → 다시 뜨는지 본다 | 다시 안 뜸 · 하단에 「오늘 하루 보지 않기」 줄 없음(Owner FINAL) · DB 에 TODAY 숨김 1행 | 캡처 + `select mode, suppress_until at time zone 'Asia/Manila', created_at at time zone 'Asia/Manila' from platform_popup_user_suppressions where campaign_id='<S-P1 id>' order by created_at desc limit 3;` |
| V-10 | **팝업 CTA 뒤 숨김 (F-1)** | iOS | 다른 계정(w테스트1)으로 S-P1 이 뜨면 CTA 를 누른다 → 이동 확인 → 앱을 완전히 껐다 켬 | 목적지로 이동 · **다시 안 뜸** · 숨김 TODAY 1행 · 기록은 click·landing 만(dismiss·suppress 기록 없음) | 위 숨김 SQL(w테스트1) + `select event_type from platform_popup_campaign_events where campaign_id='<S-P1 id>' and user_id='<w테스트1 id>' order by created_at;` |
| V-11 | 외부 주소 CTA | Android · iOS | S-P2 CTA 를 누른다 | 앱 밖 브라우저(인앱 브라우저)로 열림 · 앱 화면은 그대로 | 캡처 |
| V-12 | **빈도를 바꾸면 숨김도 따라감 (F-2)** | Android | ① q테스트1 로 S-P2 를 × 로 닫는다(CAMPAIGN 숨김) ② 앱을 껐다 켜서 안 뜨는지 본다 ③ 어드민에서 S-P2 빈도를 「앱 실행당 1회」로 바꾸고 저장한다(재검토로 가면 다시 승인) ④ 앱을 껐다 켬 | ② 안 뜸 · ④ **다시 뜸**(예전 「캠페인 1회」 숨김은 지금 빈도보다 길어서 무시) | 캡처 2장 + 숨김 SQL |
| V-13 | **PTR 띠 클릭 영역** | Android · iOS | q테스트1 로 당겨서 새로고침해 S-R 띠를 연다 · ① 띠 빈 곳을 누른다 ② CTA 칩을 누른다 ③ 다시 당겨서 새로고침 | ① 이동 없음 ② 이동 + 방문 기록 출처 **PTR** ③ 새로고침 정상 | 녹화 + `select source_channel, created_at at time zone 'Asia/Manila' from platform_promotion_content_visits where user_id='<q테스트1 id>' order by created_at desc limit 3;` |
| V-16 | **계정 바뀌면 PTR 초기화 (CX-06)** | Android | q테스트1 로 S-R 띠를 본 뒤 로그아웃 → w테스트1 로 로그인 → 당겨서 새로고침 | w테스트1 에게 S-R 띠가 안 나옴(허용 목록 밖) | 녹화 |
| V-18 | **어드민 팝업 저장 (P-1)** | 어드민 웹 | 노출 중인 S-P1 에서 ① **이름만** 바꿔 저장 ② 이미지 또는 CTA 를 바꿔 저장 | ① 노출 상태 그대로(검토 대기로 안 바뀜) · ② 저장 전 경고 + 저장 뒤 「다시 승인이 필요합니다」 · 상태 검토 대기 | 캡처 + `select status, approval_status from platform_popup_campaigns where id='<S-P1 id>';` 두 번 |

### D. 관리자 조치·환급 (V-19 ~ V-21)

| # | 항목 | 기기 | 할 일 | PASS 조건 | 증거 |
|---|---|---|---|---|---|
| V-19 | 어드민 피드 정지·재개·종료 | 어드민 웹 | S-F: V-8 정지 상태에서 「재개」(공개 사유 필요) → 「종료」, 귀책 **운영**, 환급 미리보기 금액을 적고 종료 | 사유 없으면 못 누름 · 미리보기 = 실제 환급 · 환급 1행 · 마이 › 포인트 내역에 환급 | `select entry_type, amount, related_id from point_ledger where related_id='feed-ad-end-refund:<S-F id>';` |
| V-20 | 커뮤니티 글 관리자 삭제 | 어드민 웹 | S-C 글을 어드민에서 삭제한다 | 「상위노출 중입니다 · 귀책 선택」이 나옴 · 운영 귀책 → 환급 · 주문 종료 · 글 삭제 | `select order_status, fault, refund_points from point_promotion_orders where target_id='<S-C 글 id>';` + 캡처 |
| V-21 | 배달 운영 귀책 종료 | 어드민 웹 · Android(사장님) | S-D 를 공통 광고 화면에서 종료, 귀책 **운영** | 미리보기 = 실제 환급 · 사장님 화면 비즈니스 캐시 잔액이 그만큼 늘어남 · 원장 1행 | `select entry_kind, amount_minor, idempotency_key from business_cash_ledger where idempotency_key='delivery-ad-end-refund:<S-D id>';` + 캡처 |

### E. 인트로·시작 화면 (V-22 ~ V-24)

| # | 항목 | 기기 | 할 일 | PASS 조건 | 증거 |
|---|---|---|---|---|---|
| V-22 | 콜드 스타트 시작 화면 | Android · iOS | 인트로가 게시되지 않은 상태로 콜드 스타트 3번 | 시작 화면이 1번 닫히고 첫 화면이 나옴 · 멈춤 없음 · 팝업은 첫 화면이 나온 뒤에만 뜸 | 녹화 + `adb logcat` 의 `dibay-launch-intro` 줄 |
| V-23 | 인트로 → 팝업 순서·버튼 크기 | — | **하지 않음 (Owner 결정 「인트로 제외」)** | — | 「Owner 결정으로 제외 — NOT_PROVEN」 |
| V-24 | 인트로 준비 중 홈 버튼 | — | **하지 않음 (Owner 결정 「인트로 제외」)** | — | 「Owner 결정으로 제외 — NOT_PROVEN」 |

**인트로 제외 (Owner 결정 2026-11-04 「인트로 제외」)**
- **V-23·V-24 는 하지 않는다.** 운영 인트로를 게시하지 않는다(게시하면 모든 회원 앱에 나오기 때문).
- 보고서에는 V-23·V-24 를 「Owner 결정으로 제외 — NOT_PROVEN」으로 적는다.
- V-22(인트로 없음 상태 콜드 스타트)는 그대로 한다.

---

## 5. 정리 (화면으로 · 끝까지)

1. V-19·V-20·V-21 이 S-F·S-C·S-D 를 끝낸다. 끝나지 않은 것은 어드민 「종료」로 끝낸다.
2. 나머지 샘플을 종료한다.
   - S-T 거래 상위노출: 어드민 「종료」, 귀책 회원
   - S-A·S-P1·S-P2·S-R: 「종료」
3. 지울 수 있는 초안만 「삭제」한다. 삭제가 막히면 그 안내를 캡처한다. 「삭제할 수 없습니다 — …」와 종료·보관 버튼이 보여야 한다.
4. 넣은 포인트·비즈니스 캐시를 어드민 화면으로 회수한다. 계정별로 「시작 → 넣음 → 사용 → 환급 → 회수 → 끝」 표를 만든다.
5. 앱 글(`QA-ADS-1104V5-`)은 작성자 계정으로 삭제한다.
6. 0-5 쿼리를 다시 돌린다. `popup_live`·`feed_live`·`promo_live`·`delivery_banner_live` 가 시작 값과 같아야 한다.

---

## 6. 보고 형식 (`docs/audit/cursor-report-ads-device-verify-v5-2026-11-04.md` 하나를 갱신)

1. 첫 줄: Production SHA·Ready · Android 모델·앱 버전 · iOS 시뮬레이터 기종·iOS·빌드 · 시험 시간대(PHT)
2. 0-5 시작 기준값 표
3. 샘플 표(무엇을 · 언제 · 계정 · 포인트/캐시 · 팝업 켠·끈 시각)
4. **V-1 ~ V-24 표**: `# | 판정(PASS/FAIL/NOT_PROVEN/기기 한계/Owner 결정으로 제외) | 확인 조건 | 증거 파일·SQL 결과 | 메모`
5. FAIL 목록(본 그대로 · 원인 추측 금지)
6. 기기 한계(시도한 명령과 결과)
7. 정리 결과 표(§5-4 · §5-6)
