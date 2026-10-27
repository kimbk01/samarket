# Cursor 실기 재검증 프롬프트 — 알림 A·B·C (2026-10-28)

> 이 문서를 Cursor 에 그대로 붙여 넣는다. 결과 보고는 Claude 가 운영 DB 로 한 줄씩 대조한다.
> 증거 없는 PASS, 측정 안 한 PASS, 다른 배포 결과를 섞은 PASS 는 모두 **허위 보고**로 처리한다.
> 기준 설계: `docs/audit/notification-f2-android-tap-read-fix-design-2026-10-28.md` A-6 · B-2 · C-2

| 항목 | 커밋 | 확인할 것 |
|---|---|---|
| A. 안드로이드 푸시 탭 읽음 | `570312026` | 상태 알림 푸시 탭 → 그 알림 읽음 · 채팅·오너 알림은 탭으로 바뀌지 않음 |
| B. 가격 제안 수락 링크 | `76739dc38` | 수락 푸시 탭 → 거래 채팅방 열림 (404 아님) |
| C. 오너 새 주문 품목 수 | `e4cb4543f` | 오너 새 주문 알림 본문 「n개 품목」 = 실제 품목 행 수 |

---

## 0. 절대 규칙
1. **코드·DB 변경 금지.**
   - 파일 수정·커밋·푸시·마이그레이션을 하지 않는다.
   - 운영 DB `ckdosyydvgzqwpbwuhon` 은 **SELECT 만** 한다.
   - `dibay-test`·`dibay-reset-qa` 는 조회도 금지.
2. **결함을 발견해도 고치지 않는다.** FAIL 로 기록하고 다음 시나리오로 간다. 원인은 추측하지 말고 관찰한 사실만 적는다.
3. **모든 PASS 에는 증거 3종을 붙인다.** 하나라도 없으면 NOT_PROVEN 이다.
   - ① 화면 캡처 파일 경로
   - ② 운영 DB 조회 결과 원문(행 id·시각 포함)
   - ③ 시각(PHT, 초 단위)
4. **시나리오 시작마다 Production SHA 를 기록한다.**
   - Vercel Production 배포 커밋이 `e4cb4543f` 이거나 그 이후여야 한다.
   - 이전이면 시작하지 말고 그 사실만 보고한다.
   - 도중에 SHA 가 바뀌면 그 시나리오를 처음부터 다시 한다.
5. **가격 제안 금액, 테스트 주문의 매장·메뉴·총액은 실행 직전 보고서에 한 줄로 적고 진행한다.** 금액은 최소로 한다.
6. **시간은 PHT(UTC+8) 로 쓴다.** DB 의 UTC 값은 원문 그대로 붙이고 옆에 PHT 를 적는다.
7. **API 를 직접 호출해서 시험하지 않는다.** 제안·수락·주문·메시지는 **앱 화면에서** 한다. 지난 실기에서 API 직접 호출은 401 이 났고, 우회 경로로 주문을 넣어 정상 발송 경로를 타지 않았다.
8. **범위 밖 관찰은 맨 끝 「범위 밖 관찰」에만 적는다.** 판정에 섞지 않는다.
9. **회원 알림은 `notification_events` 에서 본다.** `notifications` 테이블에는 이 기기들의 새 행이 생기지 않는다(2026-10-28 확인). 지난 프롬프트의 `notifications` 안내는 무시한다.

## 1. 기기·계정
| 약칭 | 기기 | 계정 | 앱 버전 | 오너 매장 |
|---|---|---|---|---|
| S | Samsung SM-M156S (adb `RFCY40PY2CA`) | q테스트1 `9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8` | 1.2.4 (13) | 맛업는식당 |
| X | Xiaomi 24076RP19G (adb `8b37179f7d94`) | zxzx11 `0c4b0a80-9755-4ebe-9a10-f8e1ced4c0cc` | 1.2.4 (13) | MAN-CHOO FOOD HUB |
| W | Mac 브라우저 `https://samarket.vercel.app` | S 와 같은 계정 | — | — |

- 이번 변경은 **웹만**이다. 시작 전 S·X 앱을 **완전 종료 후 재시작**한다. 재설치·재빌드는 하지 않는다.
- iPhone 은 이번 범위가 아니다. 보고서에 「iOS NOT_PROVEN (범위 밖)」 한 줄만 적는다.
- 설치 버전 확인 쿼리 (결과 원문을 붙인다):
  ```sql
  select p.nickname, d.platform, d.app_version, d.is_active, d.last_seen_at
  from user_devices d join profiles p on p.id = d.user_id
  where d.user_id in ('9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8','0c4b0a80-9755-4ebe-9a10-f8e1ced4c0cc')
  order by d.last_seen_at desc;
  ```

## 2. 측정 도구 (모든 시나리오 공통)
- **알림 행** — 읽음 판정의 핵심은 `read_at` 과 `opened_at` 이다.
  - `opened_at` 은 **푸시 탭 읽음 요청이 서버에서 받아들여졌을 때만** 채워진다.
  - 방에 들어가서 읽힌 것은 `read_at` 만 채워지고 `opened_at` 은 비어 있다.
  ```sql
  select id, user_id, type, category, room_id, title, body, unread, read_at, opened_at,
         display_payload->>'routeUrl' as route_url,
         display_payload->'legacyMeta'->>'line_count' as line_count,
         created_at
  from notification_events
  where user_id in ('9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8','0c4b0a80-9755-4ebe-9a10-f8e1ced4c0cc')
    and created_at > '<시나리오 시작 UTC>'
  order by created_at;
  ```
- **푸시 발송**
  ```sql
  select user_id, event_type, status, provider_response->>'priority' as priority,
         notification_event_id, created_at
  from notification_deliveries
  where created_at > '<시나리오 시작 UTC>' order by created_at;
  ```
- **푸시 탭 기록** (Android). 탭 직전에 로그를 비우고(`adb -s <기기> logcat -c`), 탭 후 아래 두 태그의 원문을 붙인다.
  - `adb -s <기기> logcat -d -s DIBAY_PUSH_ROUTE DIBAY_NOTIFY`
  - `notification_tap_received notificationId=<값>` 의 값이 위 알림 행 `id` 와 같은지 적는다.
- **기기 표시** (Android)
  - `adb -s <기기> shell dumpsys notification --noredact`
  - `pkg=com.dibay.app` 블록에서 `android.title` · `android.text` 원문을 붙인다.
- **종·오너 FAB 서버 값** — W 브라우저 개발자 도구 콘솔(S 계정):
  ```js
  await (await fetch("/api/me/notifications?unread_count_only=1")).json()
  await (await fetch("/api/me/store-owner-hub-badge")).json()
  ```
  - X 의 종 숫자는 X 앱 헤더 종 화면 캡처로 기록한다.

## 3. 시나리오

### R0. 시작 조건
| 칸 | 기대 |
|---|---|
| Production SHA | `e4cb4543f` 이상 (확인 방법·원문을 붙인다) |
| 앱 버전 | S·X 모두 `1.2.4 (13)` · `is_active = true` |
| 재시작 | S·X 완전 종료 → 재시작 시각 |

### R1. 가격 제안 수락 → X 푸시 탭 (A-6 ① + B-2) — X 앱 **백그라운드**(홈 화면)
**준비:** X 가 아직 가격 제안을 보낸 적 없는 S 의 판매중 상품을 고른다.
```sql
select p.id, p.title, p.price, p.status from posts p
where p.user_id = '9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8' and p.status in ('active','on_sale','selling')
  and not exists (select 1 from price_offers o where o.product_id = p.id and o.buyer_id = '0c4b0a80-9755-4ebe-9a10-f8e1ced4c0cc')
order by p.created_at desc limit 5;
```
- 위 쿼리가 오류이거나 결과가 없으면, 시험을 멈추고 **오류 원문**을 보고한다. 다른 방법으로 우회하지 않는다.

**순서:**
1. X 앱에서 그 상품에 최소 금액으로 가격 제안
2. X 를 홈 화면으로 보냄
3. S 앱에서 그 제안 수락
4. X 에 수락 푸시가 뜨면 X 종 숫자 캡처(탭 전)
5. `logcat -c` 후 푸시 탭

| 칸 | 기대 |
|---|---|
| 발송 | X 의 `trade_status` 1행 · sent · priority high |
| 링크 (B) | 해당 알림 행 `route_url` = `/community-messenger/rooms/<메신저 방 id>…` 이고 그 id 가 `community_messenger_rooms` 에 있다 (아래 쿼리 결과 1) |
| 이동 (B) | X 가 **거래 채팅방**을 연다. 404·빈 화면·「찾을 수 없음」이면 FAIL. 화면 캡처 |
| 탭 기록 | logcat `notification_tap_received notificationId=` 값 = 그 알림 행 `id` |
| 읽음 (A) | 탭 후 10초 안에 그 행 `unread = false` · `read_at` 채워짐 · **`opened_at` 채워짐** |
| 종 (A) | X 종 숫자 탭 전 대비 −1 (캡처 2장) |

```sql
select count(*) from community_messenger_rooms
where id::text = split_part(split_part('<route_url>', '/community-messenger/rooms/', 2), '?', 1);
```

### R2. 콜드 스타트 — 같은 확인을 X 앱 **완전 종료** 상태에서 (A-6 ④ + B-2)
**순서:**
1. R1 과 다른 S 상품으로 X 가 제안
2. `adb -s 8b37179f7d94 shell am force-stop com.dibay.app` 으로 X 앱 종료
3. S 가 수락
4. X 에 푸시가 뜨면 `logcat -c` 후 탭

| 칸 | 기대 |
|---|---|
| 이동 (B) | 앱이 켜지며 거래 채팅방이 열림 (404 아님) |
| 탭 기록 | logcat 에 탭·경로 재생(`pending_route_replayed` 또는 `pending_route_consumed`) 원문 |
| 읽음 (A) | 앱이 켜진 뒤 30초 안에 그 행 `read_at` · **`opened_at`** 채워짐 |

### R3. 채팅 회귀 — 1:1 메시지 푸시 탭은 탭만으로 읽음 처리되지 않음 (A-6 ②) — S 앱 **백그라운드**
**순서:**
1. W 콘솔에서 S 종 숫자 기록(탭 전)
2. X 앱에서 S 에게 1:1 메시지 1개 (영문 가능)
3. S 에 푸시가 뜨면 S 하단 「채팅」 숫자를 캡처(탭 전)
4. `logcat -c` 후 탭 → 방이 열리면 메시지가 보이는지 캡처

| 칸 | 기대 |
|---|---|
| 발송 | S 의 `chat_message` 1행 · sent · high |
| 이동 | S 가 그 1:1 방을 연다 |
| 탭 처리 | 그 `chat_message` 행 **`opened_at` 은 비어 있다** (탭 요청이 거절되어야 함). `read_at` 은 방 진입 읽음으로 채워져도 된다 |
| 종 | S 종 숫자 변화 없음 (채팅은 종에 들어가지 않음) — W 콘솔 탭 전·후 값 |
| 채팅 숫자 | 방에 들어가 메시지를 본 뒤 하단 「채팅」 숫자가 줄어든다 (방 진입 읽음 경로 · 탭 전·후 캡처) |

- (선택) S WebView 를 Chrome `chrome://inspect` 로 열 수 있으면 `/api/me/notifications/read` 응답 원문 `{"ok":false,"skipped":"not_member_a"}` 를 붙인다. 열 수 없으면 「NOT_PROVEN (도구)」로 적는다.

### R4. 오너 회귀 + 품목 수 — X 가 S 매장(맛업는식당)에 앱으로 주문 (A-6 ③ + C-2) — S 앱 **백그라운드**
**순서:**
1. W 콘솔에서 `store-owner-hub-badge` 값 기록(주문 전)
2. 실행 직전 보고서에 매장·메뉴·수량·총액 한 줄
3. X 앱 화면에서 **메뉴 2종 이상**을 담아 주문 (품목 수 1 과 구분되게)
4. S 에 오너 새 주문 푸시가 뜨면 본문 캡처
5. W 콘솔 `store-owner-hub-badge` 값 기록(탭 전)
6. `logcat -c` 후 탭 → 오너 주문 화면 캡처
7. 탭 후 즉시 W 콘솔 값 기록(탭 후)
8. 끝나면 **X 앱에서 주문 취소**(접수 전 취소). 취소 결과 화면 캡처

| 칸 | 기대 |
|---|---|
| 발송 | S 의 `order_status` 1행 · sent · high |
| 품목 수 (C) | 본문 「… · {금액} · n개 품목」 의 n = 아래 쿼리의 품목 행 수 = 알림 행 `line_count` |
| 경로 기록 (C) | 주문 `created_at` 과 알림 행 `created_at` 차이(초)를 적는다. 차이가 10초 이상이면 「복구 경로 가능성」으로 표시만 한다 |
| 탭 처리 (A 회귀) | 그 `order_status` 행 **`opened_at` 은 비어 있다** |
| FAB (A 회귀) | 탭 전·후 `orderAttention` 변화 없음 (탭만으로 줄지 않음) |
| 정리 | 주문 상태 cancelled (쿼리 원문) |

```sql
select o.id, o.order_no, o.order_status, o.created_at,
       (select count(*) from store_order_items i where i.order_id = o.id) as item_rows
from store_orders o
where o.buyer_user_id = '0c4b0a80-9755-4ebe-9a10-f8e1ced4c0cc'
  and o.created_at > '<시나리오 시작 UTC>'
order by o.created_at desc limit 1;
```
- 누락 복구 경로(크론)는 실기로 일부러 만들 수 없다. 그 경로의 품목 수는 코드 테스트로만 판정하므로, 보고서에 「C 복구 경로 실기 NOT_PROVEN」 한 줄을 적는다.

## 4. 보고 형식 (`docs/audit/evidence/notif-abc-reverify-2026-10-28-cursor/REPORT.md` · **커밋 금지**)
- 첫 줄: 측정 시작·끝 시각(PHT) · Production SHA · S/X 앱 버전
- 시나리오마다 표 `| 칸 | 판정 | 기대 | 실제 | 증거 |`
  - 판정은 PASS / FAIL / NOT_PROVEN 만 쓴다.
  - 「PASS(부분)」은 쓰지 않는다. 칸을 나눠서 각각 판정한다.
- 「실제」에는 DB 행 `id` 앞 8자리와 시각(PHT)을 반드시 넣는다.
- 끝에 FAIL 목록 · NOT_PROVEN 목록 · 범위 밖 관찰을 둔다.
- 증거 파일은 같은 폴더에 둔다: `R<번호>-<기기>-<내용>.png` · `R<번호>-db.json` · `R<번호>-logcat.txt` · `R<번호>-dumpsys.txt`
