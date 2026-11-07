# Cursor 실기 프롬프트 v4 — 광고 ② 수정 구현 확인 (20개 · 2026-11-04 PHT)

> 이 파일 전체를 Cursor 에 붙여 넣는다. **한국어로 보고한다.**
> - Owner 승인 범위: 광고 ② 수정 설계안 구현의 실기 확인 1회. 「프롬프트 만들기」 2026-11-04.
> - 실기기: Android = **USB 로 연결된 기기**(`adb`). iOS = **iOS 시뮬레이터**(Xcode). 어드민 = 연결된 브라우저.
> - **Cursor 가 할 수 있는 일은 Owner 에게 미루지 않는다.** 샘플 만들기, 포인트·캐시 넣고 회수, 어드민 조작, 캡처, SELECT 는 모두 Cursor 가 한다. 막히면 **시도한 방법과 결과**를 「기기 한계」에 적는다. 시도 기록 없이 「기기 한계」라고 쓰지 않는다.

---

## 0. 이번에 바뀐 것 (확인 대상)

- **main / Production SHA `627fe3022` 이상** (커밋 `9af6b28c2` DB · `7b9912ffd` 웹 · `627fe3022` 인트로).
- **운영 DB 8건은 2026-11-04 에 이미 적용됐다.** 피드 정지·재개·종료 환급 · 배달 운영 귀책 환급 · 커뮤니티 만료 · 글 상태 연동 · 결제 중복·가격 잠금 · 공개 읽기 차단 · 기록 검사.
- 웹 변경만 있다. **앱 재설치는 하지 않는다.** 앱을 완전히 끄고 다시 켜면 반영된다. 네이티브 빌드·버전 변경도 하지 않는다.
- 근거 문서(저장소 `docs/audit/`, 필요할 때만 연다):
  - `ads-fix-design-2026-11-04.md` (§2 FB-M13 · §4 D-x · §5 시작 경로 · §11 실기 표)
  - `ads-fix-design-supplement-2026-11-04.md` (§2 공개 범위 · §3 목적지 · §4 관리자 · §4-3 삭제 규칙)
  - `ads-screen-behavior-spec-2026-11-04.md` (명세)

---

## 1. 절대 규칙 (AGENTS.md · 예외 없음)

1. 테스트 DB `dibay-test`·`dibay-reset-qa` 는 쓰지 않는다. 운영 `ckdosyydvgzqwpbwuhon` 만 쓴다. DB 는 **SELECT 만** 한다. INSERT·UPDATE·DELETE·DDL 은 하지 않는다.
2. 코드 수정·커밋·배포·네이티브 빌드는 하지 않는다. CI·배포를 기다리며 반복 확인하지 않는다. Production SHA 는 **시작할 때 1번** 확인한다.
3. 샘플은 **앱·어드민 화면으로만** 만들고, 정리도 화면으로만 한다. API 를 직접 부르거나 DB 를 고치지 않는다.
4. 샘플 이름·제목은 모두 `QA-ADS-1104-` 로 시작한다. 이 접두가 없는 광고·주문·글은 **건드리지 않는다**.
5. **판정 규칙**
   - PASS 는 직접 본 것만 쓴다.
   - 항목마다 아래를 적는다:
     - Production SHA
     - 기기·OS
     - 앱 버전(`user_devices.app_version`)
     - 로그인 계정
     - 저장 주소
     - PHT 시각
     - 증거: 캡처 파일명 / SELECT 결과
   - 못 본 것은 **NOT_PROVEN** 이다. 「~로 보임」은 쓰지 않는다.
   - 어드민 등록과 앱 화면이 다르면 원인과 상관없이 **먼저 FAIL** 로 적는다.
6. **FAIL 이 나와도 고치지 않는다.** 그 항목 증거를 남기고 다음 항목으로 간다. 고칠지는 Claude 가 정한다.
7. 기존 설정을 바꿀 때는 처음 읽은 상태로만 저장한다. **409(다른 사람이 저장함)가 나면 즉시 멈추고** 보고한다.
8. 계정 만들기·비밀번호 입력은 하지 않는다. 이미 로그인된 계정을 쓴다.
   - 계정 정보: 지난 실기(`cursor-report-ads-device-verify-2026-11-04.md`)에 적힌 테스트 계정을 그대로 쓴다. 회원은 q테스트1·w테스트1·zxzx11, 관리자는 @aaaa.
   - 필요한 계정이 로그인돼 있지 않으면 그것만 Owner 에게 1줄로 요청한다.
9. 통화 기능은 건드리지 않는다. 시간은 **PHT** 로 적는다(DB UTC 는 바꿔서 적는다).

---

## 2. 사전 확인 (시작할 때 1번)

| # | 확인 | 방법 | 기록 |
|---|---|---|---|
| 0-1 | Production SHA | Vercel Production 배포 1회. **`627fe3022` 이상이 아니면 시작하지 않는다** | SHA |
| 0-2a | Android | `adb devices` · 기기 모델 · `adb shell getprop ro.build.version.release` · `chrome://inspect` 로 WebView 연결 | 모델·버전 |
| 0-2b | iOS 시뮬레이터 | `xcrun simctl list devices booted`. 앱이 없으면 `npm run native:prepare` 성공 뒤 Xcode 로 시뮬레이터 Debug 빌드를 실행한다. prepare 가 실패하면 멈추고 보고한다. Safari › 개발 › Simulator 로 WebView 연결 | 기종·iOS·빌드 |
| 0-3 | 앱 버전 | `select platform, app_version, updated_at at time zone 'Asia/Manila' from public.user_devices where user_id = '<계정 id>' order by updated_at desc limit 5;` | 버전(빌드) |
| 0-4 | 웹 반영 | 두 기기 모두 앱을 **완전히 끄고 다시 켠다** | — |
| 0-5 | 시작 기준값 | 아래 SELECT 결과를 보고서 첫 표에 붙인다 | 결과 |

```sql
-- 0-5 시작 기준값 (SELECT 만)
select 'promo_live' k, count(*)::text v from point_promotion_orders where order_status in ('active','paused','pending_review')
union all select 'feed_live', count(*)::text from feed_ad_campaigns where status in ('active','paused','scheduled') and (end_at is null or end_at > now())
union all select 'popup_live', count(*)::text from platform_popup_campaigns where status in ('active','scheduled')
union all select 'intro_live', coalesce((select state from launch_intro_live limit 1)::text, 'none')
union all select 'qa_points', (select json_agg(json_build_object('nick', nickname, 'points', points))::text from profiles where nickname in ('q테스트1','w테스트1','zxzx11'));
```

---

## 3. 샘플 (모두 화면으로 · 끝나면 §5 로 정리)

포인트·비즈니스 캐시는 **어드민 화면으로 필요한 만큼만 넣고**, 끝나면 같은 화면으로 회수한다. 넣은 양·회수한 양을 표로 적는다.

| 샘플 | 만드는 곳 · 계정 | 쓰는 항목 |
|---|---|---|
| S-T 거래 글 1 + 거래 상위노출 1 | 앱 글쓰기 + 「광고」 시트 · q테스트1 · 판매중 글 | V-2 |
| S-C 커뮤니티 글 1 + 상위노출 1 | 앱 커뮤니티 글쓰기(동네 탭에 나오는 지역) + 「내 글 상위노출」 · q테스트1 | V-3 · V-4 · V-19 |
| S-F 회원 피드 배너 신청 1 | 마이 › 광고 › 피드 배너 신청(거래 홈) · q테스트1 → 어드민 승인 | V-1 · V-8 · V-18 |
| S-A 관리자 직접 피드 배너 2 | 어드민 피드 배너 만들기: 거래 홈 1 · 거래 카테고리 1. 목적지는 S-T 글. 이미지는 아래 「이미지 넣기」 방법으로 | V-6 · V-7 |
| S-P1 운영자 팝업(내부 CTA) | 어드민 팝업 만들기 · CTA = 앱 안 경로(예: `/events/…` 또는 S-T 글) · 대상 = 테스트 계정만(allowlist 가 있으면 쓴다) | V-9 · V-10 · V-12 |
| S-P2 운영자 팝업(외부 CTA) | CTA = `https://www.google.com` (https 공개 도메인) · 대상 = 테스트 계정만 | V-11 |
| S-R PTR 띠 1 | 어드민 PTR · 대상 allowlist = 테스트 계정 | V-13 |
| S-D 배달 홈 상단 배너 1 | 사장님 샘플 매장 · 비즈니스 캐시(어드민으로 충전) → 사장님 화면에서 신청 → 어드민 승인 | V-14 · V-15 · V-20 |

- **이미지 넣기**
  - 어드민 파일 입력: Playwright `page.setInputFiles` 로 넣고, 화면의 저장 버튼을 누른다(화면 입력).
  - 앱 사진 선택:
    - Android: `adb push qa.png /sdcard/Pictures/` → `adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///sdcard/Pictures/qa.png`
    - iOS: `xcrun simctl addmedia booted qa.png`
- 버튼 위치를 못 찾으면 Android `adb shell uiautomator dump`, iOS Safari 인스펙터로 위치를 찾는다.
- 대상 제한(allowlist)이 없는 팝업·PTR 은 **모든 회원에게 보인다.** 그런 경우에만 노출 시간을 시험 시간(1시간 이내)으로 짧게 잡고, 끝나면 바로 종료한다. 무엇을·언제(PHT) 켰는지 적는다.

---

## 4. 실기 20개

증거 칸의 SQL 은 Cursor 가 SELECT 로 직접 돌린다. MCP 가 없으면 쿼리를 보고서에 적고 「Claude 조회 요청」으로 둔다.

| # | 항목 | 기기 | 할 일 | PASS 조건 | 증거 |
|---|---|---|---|---|---|
| V-1 | **피드 배너 연장 끊김 재시도 (P0 · FB-M13)** | Android | ① S-F 가 진행 중일 때 마이 › 광고 › 연장 창에서 상품 선택 ② **비행기 모드를 켜고** 「연장」을 누른다 → 오류 안내 ③ 비행기 모드를 끄고 연장 창을 다시 연다 → **같은 상품이 골라져 있는지** 본다 ④ 다시 「연장」 | 포인트 차감 **1번** · `end_at` **1번만** 늘어남 · 두 번째 응답은 「이미 처리된 연장」 또는 성공(같은 결과). 두 번 차감이면 FAIL | 캡처 3장 + `select entry_type, amount, related_id, created_at at time zone 'Asia/Manila' from point_ledger where related_id like 'renew:<campaignId>:%' order by created_at;` |
| V-2 | 거래 상위노출 표시 | Android · iOS | 다른 계정(w테스트1)으로 거래 홈·카테고리를 본다 | 「광고」 표시 · 목록 위쪽 · **남은 기간·종료일이 보이지 않음** | 캡처 |
| V-3 | 커뮤니티 상위노출 표시 | Android · iOS | w테스트1 로 커뮤니티 홈 | 일반 글과 같은 카드(작성자·지역·조회수) + 배경 + 「포인트 노출」 · 남은 기간 없음 · 누르면 **그 글 상세**로 감(메신저 방·모임이 아님) | 캡처 2장 |
| V-4 | 동네 탭 상위노출 (D-11) | Android | 같은 동네 계정과 다른 동네 계정으로 동네 탭을 본다 | 그 동네 계정에만 위쪽에 보이고, 다른 동네 계정에는 위쪽에 없음 | 캡처 2장 + 두 계정의 저장 주소 |
| V-5 | 결제 창 시각 PHT (D-12) | Android | 기기 시간대를 **서울**로 바꾼다(설정 › 날짜·시간 › 자동 끄기 › 시간대. adb 탭으로 조작) → 거래 광고 창·커뮤니티 상위노출 창의 끝나는 시각을 본다 → **시간대를 원래대로 되돌린다** | 「11월 ○일 HH:mm」(PHT 기준 값) · 서울 시간대(+1시간)가 아님 | 캡처 + 바꾸기 전·후 시간대 |
| V-6 | 피드 배너 노출·클릭 | Android | S-A 거래 홈 배너를 화면에 1초 이상 보이게 둔 뒤 누른다 | 노출 1 · 클릭 1 · S-T 글로 이동 | `select event_type, placement, created_at at time zone 'Asia/Manila' from feed_ad_events where campaign_id='<S-A id>' order by created_at;` + 캡처 |
| V-7 | 거래 격자 배너 자리 (D-23) | Android · iOS 또는 Xiaomi 태블릿 | 거래 홈·카테고리 목록을 스크롤한다 | 배너는 2칸 한 줄 전체 · 줄 첫 자리에만 · 배너 사이 글 4개 이상 · 샘플 카드가 섞여도 줄이 어긋나지 않음 | 캡처 2장 |
| V-8 | 운영자 정지 안내 (D-6) | iOS | 어드민에서 S-F 를 정지한다(공개 사유 「QA 점검」, 내부 메모 「QA 내부」). q테스트1 로 마이 › 광고를 본다 | 「운영자가 멈췄습니다」 + 「QA 점검」 · **「QA 내부」는 보이지 않음** | 캡처 + 마이 광고 API 응답(Safari 인스펙터 네트워크)에 「QA 내부」 없음 |
| V-9 | 팝업 × · 「오늘 하루」 | Android | S-P1 이 뜨면 × → 앱을 내렸다 올림 → 다시 안 뜨는지 본다 · 앱을 완전히 껐다 켜서 다시 뜨면 「오늘 하루 보지 않기」 → 다시 껐다 켬 | × 뒤 같은 실행에서는 안 뜸 · 오늘 하루 뒤에는 오늘 안 뜸 · ×에는 DB 행이 없음 | 캡처 + `select mode, created_at at time zone 'Asia/Manila' from platform_popup_user_suppressions where campaign_id='<S-P1 id>' order by created_at desc limit 5;` (× 행 0, TODAY 1) |
| V-10 | 팝업 CTA 기록 | iOS | S-P1 CTA 를 누른다 | 목적지로 이동 · 기록은 click·landing 만, **dismiss 없음** | `select event_type from platform_popup_campaign_events where campaign_id='<S-P1 id>' order by created_at;` |
| V-11 | 외부 주소 CTA | Android · iOS | S-P2 CTA 를 누른다 | **앱 밖 브라우저(인앱 브라우저)**로 열림 · 앱 화면은 그대로 | 캡처 |
| V-12 | 태블릿 가로 팝업 (D-3) | Xiaomi 태블릿 | 가로로 둔 채 앱을 켠다 → 세로로 돌린다 | 가로에서는 안 뜸 · 세로가 되면 뜸 | 캡처 2장 |
| V-13 | **PTR 띠 클릭 영역 (D-1)** | Android · iOS | 당겨서 새로고침으로 S-R 띠를 연다 · ① 띠의 빈 곳을 누른다 ② CTA 칩을 누른다 ③ 다시 당겨서 새로고침 | ① 이동 없음 ② 이동 ③ 새로고침 정상 | 캡처·화면 녹화 |
| V-14 | 배달 홈 상단 배너 | Android | 배달 홈 상단 배너를 스와이프하고 점을 누른다 | 스와이프·점 모두 동작 · 누르면 그 매장 화면 | 캡처 |
| V-15 | 배달 홈 첫 그림 밀림 측정 (DB-C07) | Android | 앱을 완전히 끄고 배달 홈으로 콜드 스타트 · **화면 녹화** | 빈 상자가 나타났다 사라지며 아래 내용이 밀리는지 **보이는 대로 적는다**(측정 항목 · PASS/FAIL 판정 안 함) | 녹화 파일 + 몇 초에 무엇이 보였는지 |
| V-16 | 인트로 준비 중 홈 버튼 (D-17) | Android · iOS | 아래 「인트로 조건」을 본다. 게시된 인트로가 있을 때 콜드 스타트 직후 1초 안에 홈 버튼 → 5초 뒤 앱 복귀 | 커뮤니티 화면이 나옴 · 인트로가 그 뒤 나오지 않음 · 시작 화면이 남아 있지 않음 | 녹화 + `adb logcat` 의 `dibay-launch-intro` 줄 |
| V-17 | 콜드 스타트 시작 화면 | Android · iOS | 콜드 스타트 3번 | 시작 화면이 1번 닫히고 첫 화면이 나옴 · 멈춤 없음 | 녹화 + 로그 |
| V-18 | 어드민 피드 정지·재개·종료 (D-5) | 어드민 웹 | S-F: V-8 정지 상태에서 「재개」(공개 사유 필요) → 「종료」 · 귀책 **운영** · **환급 미리보기 금액**을 적고 종료 | 재개 때 사유가 없으면 못 누름 · 종료 미리보기 = 실제 환급 · 환급 1행 · 마이 › 포인트 내역에 환급 | `select entry_type, amount, related_id from point_ledger where related_id='feed-ad-end-refund:<S-F id>';` + `select action, after_json->>'refund_amount' from audit_logs where target_id='<S-F id>' order by created_at;` |
| V-19 | 커뮤니티 글 관리자 삭제 (D-10) | 어드민 웹 | S-C 글을 어드민에서 삭제한다 | 「상위노출 중입니다 · 귀책 선택」이 나옴 · 운영 귀책 → 환급 · 주문 종료 · 글 삭제 | `select order_status, fault, refund_points from point_promotion_orders where target_id='<S-C 글 id>';` + 캡처 |
| V-20 | 배달 운영 귀책 종료 (D-13) | 어드민 웹 · Android(사장님) | S-D 를 공통 광고 화면에서 종료 · 귀책 **운영** · 미리보기 금액을 적고 종료 | 미리보기 = 실제 환급 · 사장님 화면 비즈니스 캐시 잔액이 그만큼 늘어남 · 원장 1행 | `select entry_kind, amount_minor, idempotency_key from business_cash_ledger where idempotency_key='delivery-ad-end-refund:<S-D id>';` + 사장님 화면 캡처 |

### 인트로 조건 (V-16)

- 지금 운영 인트로는 **게시 안 됨**이다(0-5 `intro_live`).
- 인트로를 게시하면 **모든 회원 앱**에 나온다. 그래서 어드민 인트로 화면에 「대상 제한(테스트 계정만)」 기능이 있는지 먼저 본다.
  - **있으면**: 테스트 계정 대상으로 게시해서 V-16 을 한다. 끝나면 바로 게시를 내린다. 게시·해제 시각을 적는다.
  - **없으면**: 게시하지 않는다. V-16 은 「운영 전체 노출이 필요해 Owner 결정 필요」로 적는다. **이 경우만** Owner 결정 사항이다.
- V-17 은 인트로가 게시되지 않은 상태로도 할 수 있다(「인트로 없음」 콜드 스타트).

---

## 5. 정리 (화면으로 · 끝까지)

1. V-18·V-19·V-20 이 S-F·S-C·S-D 를 끝낸다. 끝나지 않은 것은 어드민 「종료」로 끝낸다.
2. 종료할 샘플:
   - S-T 거래 상위노출: 어드민 거래 상위노출에서 「종료」, 귀책 회원
   - S-A·S-P1·S-P2·S-R: 「종료」
3. 지울 수 있는 초안만 「삭제」한다. 삭제가 막히면 그 안내 문구를 캡처한다. 「삭제할 수 없습니다 — …」와 종료·보관 버튼이 보여야 한다.
4. 넣은 포인트·비즈니스 캐시를 어드민 화면으로 회수한다. 계정별 「시작 → 넣음 → 사용 → 환급 → 회수 → 끝」 표를 만든다.
5. 앱 글(`QA-ADS-1104-`)은 작성자 계정으로 삭제한다.
6. 0-5 쿼리를 다시 돌려 시작 값과 비교한 표를 붙인다. `promo_live`·`feed_live`·`popup_live` 가 시작 값과 같아야 한다.

---

## 6. 보고 형식 (같은 파일을 갱신 · `docs/audit/cursor-report-ads-device-verify-v4-2026-11-04.md`)

1. 첫 줄:
   - Production SHA
   - Android 모델·앱 버전(빌드)
   - iOS 시뮬레이터 기종·iOS·빌드
   - 시험 시간대(PHT)
2. 0-5 시작 기준값 표
3. 샘플 표: 무엇을 · 언제 · 계정 · 포인트/캐시
4. **V-1 ~ V-20 표**: `# | 판정(PASS/FAIL/NOT_PROVEN/기기 한계) | 확인 조건 | 증거 파일·SQL 결과 | 메모`
5. FAIL 목록: 화면에서 본 것 그대로 적는다. 원인 추측은 쓰지 않는다.
6. 기기 한계: 시도한 명령과 결과
7. 정리 결과 표(§5-4·§5-6)
8. Owner 결정이 필요한 것: V-16 인트로 대상 제한이 없을 때만
