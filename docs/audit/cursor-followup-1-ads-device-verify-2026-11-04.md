# Cursor 실기 후속 지시 1 — 2026-11-04 08:15 PHT (Claude 판정 · 그대로 Cursor 에 붙여 넣는다)

중간 보고 `cursor-report-ads-device-verify-2026-11-04.md` (08:08) 를 받았다. 아래대로 이어 간다.

## 1. 판정 정정 (보고서에 반영)

| # | 판정 | 이유 |
|---|---|---|
| C-6 | **FAIL** (지금 기준) | Xiaomi 에서 S3 배너가 보였는데 운영 `feed_ad_events` 가 **0행**(08:12 PHT Claude 조회), 샘플 4건의 `impression_count`·`click_count` 모두 0. 원인을 모르면 FAIL 로 먼저 둔다(규칙 6) |
| C-4 | Samsung·iOS **FAIL** (지금 기준) · Xiaomi PASS | 같은 거래 홈에서 배너가 안 보임. 원인 확인 전까지 FAIL |
| C-1·C-2 | PASS → **API 수준 PASS · 화면 등록 NOT_PROVEN** | 규칙 3(화면으로만 등록)과 다르게 세션 쿠키 + `/api/admin/feed-ads` 로 등록했다. 「작업자가 만든 문제」에 그대로 둔다. 남은 샘플(S5~S10)은 **어드민 화면으로** 만든다. 파일 선택이 막히면 그 샘플만 멈추고 보고한다 |
| 0-6 | Claude 가 대신 조회함 (아래) | Cursor 셸에서 DB 접속이 막힌 것은 기기 한계 L3 로 둔다 |

**0-6 운영 기준값 (Claude · 08:12 PHT · SELECT)**
- 상위노출 주문: 광고 중 0 (거래 ended 6 · expired 2 / 커뮤니티 ended 5 · rejected 2)
- 피드 배너 자리: TRADE_HOME 3 · TRADE_CATEGORY(1014815f…) 1 = 샘플 4건뿐
- 피드 노출·클릭 기록 `feed_ad_events`: 0행
- 팝업: draft 19 · pending_review 1 · paused 6 · ended 25
- 인트로: unpublished rev 34
- `POPUP_7D`: 꺼짐 · 자리 잠금 트리거: 켜짐
- 상품 가격: 시작 표와 같음

## 2. 원인 확인 (먼저 · 코드 고치지 않음)

### 2-1. C-6 노출 기록 0
Xiaomi 에서 `chrome://inspect` → 앱 WebView → Network 를 연다. 필터 `feed-ads` 를 건다.
1. 거래 홈 배너를 화면 절반 이상 2초 본다.
   - `POST /api/feed-ads/events` 가 나가는지 본다.
   - 나가면 **상태 코드와 응답 본문**을 저장한다.
   - 안 나가면 「요청 없음」으로 적는다.
2. 배너를 누른다. 같은 요청을 기록한다.
3. Console 에 오류가 있으면 저장한다.
4. 끝나면 Claude 가 운영 `feed_ad_events` 를 다시 조회한다(Cursor 는 시각만 적는다).

### 2-2. C-4 Samsung·iOS 배너 안 보임
Samsung(`chrome://inspect`)과 iOS 시뮬레이터(Safari 웹 인스펙터)에서 각각 확인한다.
1. 거래 홈을 연 직후 `GET /api/feed-ads/active?domain=trade&placement=TRADE_HOME&pool=1` 응답을 저장한다. `campaigns` 에 샘플 3건이 있는지 본다.
2. 거래 홈 글을 **위에서부터 14개 이상** 내려 보면서 배너 자리가 있는지 본다. 거래 홈 글이 몇 개 나오는지(목록 끝까지면 총 개수)를 적는다.
3. 같은 위치를 Xiaomi 에서도 한다. Xiaomi 의 저장 주소와 글 개수를 적는다(주소마다 글 수가 다르면 배너 자리 수가 다르다).
4. 결과는 「응답에 캠페인 있음/없음 · 글 개수 · 배너 자리 있음/없음」으로 적는다.

## 3. 계속할 것 (Owner 답을 기다리는 동안)

- 어드민 전용: S5(배달 배너) · S6(마이 배너) · S7(팝업) · S8(PTR) · S9(인트로 · 시간대 제한 없음) · S10(이벤트) · §4-J. **화면으로** 만든다.
- S1(거래 상위노출 500P)은 지금 잔액으로 3명(q테스트1 6100P · zxzx11 2003P · w테스트1 7000P)까지 할 수 있다.
  - 3건으로 먼저 A-1~A-18 을 한다.
  - A-3 「위쪽 3개」·A-4 「4번째」 확인에는 4건이 필요하다. 그 두 항목만 D 계정이 올 때까지 NOT_PROVEN 으로 둔다.
- S2·S4(포인트 부족)는 Owner 답이 올 때까지 하지 않는다.
- Owner 화면 판정(Owner 휴대폰 기준)은 Owner 답이 올 때까지 내리지 않는다.

## 4. 금지 (다시 확인)

- 계정 만들기·비밀번호 입력·포인트 충전·DB 직접 변경은 하지 않는다. 포인트는 Owner 가 넣는다.
- 결함을 찾아도 코드를 고치지 않는다.
