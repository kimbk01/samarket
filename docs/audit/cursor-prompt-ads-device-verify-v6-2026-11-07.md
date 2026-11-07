# Cursor 실기 프롬프트 v6 — 광고 3차 결함 수정 + 어드민 광고 원장·삭제·권한 SSOT (2026-11-07 PHT · 인트로 제외)

> 이 파일 전체를 Cursor 에 붙여 넣는다. **보고는 전부 한국어로 쓴다.**
> - 고친 결함 하나에 항목 하나다. 각 항목은 「고치기 전 결함 → PASS 면 보여야 할 것」만 본다. 이미 PASS 한 v5 항목은 다시 하지 않는다.
> - 기기: Android = USB 연결 기기(`adb`) · iOS = iOS 시뮬레이터 · 어드민 = 연결된 브라우저.
> - **Cursor 가 할 수 있는 일은 Owner 에게 미루지 않는다.** 샘플 만들기·포인트/캐시 넣고 회수·어드민 조작·캡처·SELECT 는 Cursor 가 한다. 막힌 것만 「기기 한계」에 적고, 시도한 명령과 결과를 같이 적는다.
> - 설계: `docs/audit/ads-reaudit3-defect-design-2026-11-07.md`(D-01~D-23) · `docs/audit/ads-admin-ssot-design-2026-11-07.md`(원장·삭제·권한) · 구현 결과 `docs/audit/ads-reaudit3-impl-result-2026-11-07.md`

---

## 0. 확인 대상

- **Production SHA `d64439375` 이상**, 상태 Ready. 아니면 시작하지 않는다.
- 운영 DB 마이그레이션 12개는 2026-11-07 19:36 PHT 에 적용됐다. QA 데이터 정리(팝업 반려 5·종료 6·피드 종료 15·QA push 끄기·D-04 4건 보관·운영자 2명 권한)도 같은 날 끝났다.
- 웹 변경만 있다. 앱 재설치·네이티브 빌드는 하지 않는다. 앱을 **완전히 끄고 다시 켜면** 반영된다.

## 1. 절대 규칙 (AGENTS.md · 예외 없음)

1. 운영 `ckdosyydvgzqwpbwuhon` 만 쓴다. DB 는 **SELECT 만**. `dibay-test`·`dibay-reset-qa` 금지.
2. 코드 수정·커밋·배포·네이티브 빌드 금지. Production SHA 는 **시작할 때 1번**만 확인한다.
3. 샘플은 **앱·어드민 화면으로만** 만들고 정리도 화면으로만 한다. API 직접 호출·DB 수정 금지.
4. 샘플 이름·제목은 `QA-ADS-1107V6-` 로 시작한다. 이 접두가 없는 광고·주문·글·배너는 건드리지 않는다(삭제·종료·승인 모두).
5. 판정: PASS 는 직접 본 것만. 항목마다 Production SHA · 기기·OS · 앱 버전(`user_devices.app_version`) · 로그인 계정 · 저장 주소 · PHT 시각 · 증거(캡처 파일명/SELECT 결과)를 적는다. 못 본 것은 **NOT_PROVEN**. 어드민 설정과 화면이 다르면 원인과 상관없이 **먼저 FAIL**.
6. FAIL 이 나와도 고치지 않는다. 증거를 남기고 다음 항목으로 간다.
7. 저장 중 **409(다른 사람이 저장함)가 나면 즉시 멈추고** 보고한다.
8. 계정 만들기·비밀번호 입력 금지. 회원: q테스트1·w테스트1·zxzx11 · 관리자: 메인관리자(@aaaa). 로그인이 안 돼 있을 때만 Owner 에게 1줄로 요청.
9. 통화 기능은 건드리지 않는다. 시간은 PHT. 회원 화면 날짜는 `formatMypageDate` 표기, 관리자·사장님 화면은 `YYYY-MM-DD HH:mm`.
10. **대상 제한 없는 팝업은 모든 회원에게 보인다.** 팝업 샘플은 기간 최대 1시간, 끝나면 바로 종료. 켠·끈 시각을 적는다. PTR 은 대상 「허용 목록」에 테스트 계정만.
11. 인트로는 하지 않는다(Owner 결정 「인트로 제외」 · 게시하면 모든 회원에게 나옴).

## 2. 사전 확인 (시작할 때 1번)

| # | 확인 | 방법 |
|---|---|---|
| 0-1 | Production SHA | Vercel Production 1회 — Ready · `d64439375` 이상 |
| 0-2 | 기기 | `adb devices`·모델·Android 버전·`chrome://inspect` / `xcrun simctl list devices booted`·Safari 인스펙터 |
| 0-3 | 앱 버전 | `select platform, app_version, updated_at at time zone 'Asia/Manila' from public.user_devices where user_id = '<계정 id>' order by updated_at desc limit 5;` |
| 0-4 | 웹 반영 | 두 기기 앱 완전 종료 → 다시 켬 |
| 0-5 | 시작 기준값 | 아래 SELECT 결과를 보고서 첫 표에 붙인다 |

```sql
-- 0-5 시작 기준값 (SELECT 만 · 실기 직전에 돌린다 — 고정값을 쓰지 않는다)
select 'ledger_kind' k, json_object_agg(kind, n)::text v from (select kind, count(*) n from public.admin_ads_ledger_rows(null,null,now(),false) group by 1) x
union all select 'ledger_dup', count(*)::text from (select source_id from public.admin_ads_ledger_rows(null,null,now(),false) group by source_id, kind having count(*) > 1) d
union all select 'ledger_deleted', count(*)::text from public.admin_ads_ledger_rows(null,null,now(),true) where deleted
union all select 'popup_live', count(*)::text from platform_popup_campaigns where status in ('active','scheduled') and deleted_at is null
union all select 'feed_live', count(*)::text from feed_ad_campaigns where status in ('active','scheduled') and (end_at is null or end_at > now()) and deleted_at is null
union all select 'promo_live', count(*)::text from point_promotion_orders where order_status in ('active','paused','pending_review') and deleted_at is null
union all select 'qa_points', (select json_agg(json_build_object('nick', nickname, 'points', points))::text from profiles where nickname in ('q테스트1','w테스트1','zxzx11'));
```

## 3. 샘플 (모두 화면으로 · 끝나면 §5 로 정리)

| 샘플 | 만드는 곳 · 계정 | 쓰는 항목 |
|---|---|---|
| S-F 회원 피드 배너 | 마이 › 광고 › 피드 배너 신청(거래 홈) · q테스트1 → 어드민 승인 | V6-01 |
| S-C 커뮤니티 글 + 상위노출 | 앱 커뮤니티 글쓰기 + 「내 글 상위노출」 · q테스트1 | V6-03 · V6-12 |
| S-R PTR 띠 | 어드민 PTR · 허용 목록 = q테스트1 만 · CTA = S-C 글 | V6-04 |
| S-P 운영자 팝업 | 어드민 팝업 · 빈도 「앱 실행당 1회」 · 기간 1시간 | V6-05 · V6-07 |
| S-E 이벤트(팝업 채널) | 어드민 이벤트 · 배포 › 팝업 채널 켬 · 기간 1시간 | V6-06 · V6-10 |
| S-M 마이 배너(외부 링크) | 어드민 마이 배너 · 목적지 `https://www.google.com` | V6-09 |
| S-D 배달 배너 2개 | 사장님 샘플 매장 · 비즈니스 캐시(어드민 충전) → 신청 → 승인. ① **시작이 내일**(예약) ② 오늘 시작(노출 중) | V6-11 · V6-13 · V6-14 |
| S-X 삭제용 | 어드민 운영자 팝업 2개: ① 초안 그대로 ② 검토 요청까지 | V6-21 · V6-22 |

이미지 넣기: 어드민은 Playwright `page.setInputFiles` 후 저장 버튼 · Android `adb push qa.png /sdcard/Pictures/` + 미디어 스캔 · iOS `xcrun simctl addmedia booted qa.png`.

## 4. 실기 항목

### A. 돈·문구

| # | 결함(고치기 전) | 할 일 | PASS 면 보여야 할 것 | 증거 |
|---|---|---|---|---|
| V6-01 | **D-01** 연장 응답이 끊겨 같은 요청을 다시 보내면 기간이 공짜로 한 번 더 늘어남 | Android · q테스트1 · S-F 진행 중 ① 마이 › 광고 › 연장 창에서 상품 선택 ② **비행기 모드 켜고** 「연장」 → 오류 ③ 비행기 모드 끄고 같은 창에서 다시 「연장」 ④ 한 번 더 「연장」을 누르지 않고 화면을 새로고침 | 포인트 차감 **1행** · `end_at` 은 상품 기간만큼 **1번만** 늘어남 · 화면 종료일 = DB `end_at` | 캡처 3장 + `select entry_type, amount, related_id, created_at at time zone 'Asia/Manila' from point_ledger where related_id like 'renew:<S-F 캠페인 id>:%' order by created_at;` + 연장 전·후 `select end_at at time zone 'Asia/Manila' from feed_ad_campaigns where id='<S-F 캠페인 id>';` |
| V6-02 | **D-08** 커뮤니티 상위노출 결제 창이 「상단에 우선 노출」이라고 함(실제는 위쪽 1자리) | Android · S-C 글 「내 글 상위노출」 결제 창을 연다(결제는 하지 않아도 됨) | 「피드 위쪽 자리는 1개(가장 최근 결제)」 문구 · 「상단에 우선 노출」 없음 | 캡처 |

### B. PTR·팝업·이벤트·신고

| # | 결함 | 할 일 | PASS | 증거 |
|---|---|---|---|---|
| V6-04 | **D-05** 광고 띠가 1.2~1.4초 만에 접혀 CTA 를 누를 시간이 없음 | Android · q테스트1 · 커뮤니티 홈에서 당겨서 새로고침 ① 손을 떼고 그대로 둔다 ② 다시 당긴 뒤 띠가 보이는 동안 본문을 한 번 터치 ③ 다시 당긴 뒤 띠 CTA 를 누른다 ④ w테스트1(허용 목록 밖)으로 당겨서 새로고침 | ① 띠가 **약 3초** 보인 뒤 접힘 ② 터치 즉시 접힘 ③ S-C 글로 이동 + click·landing 기록 ④ 띠 없음 · 결과 표시는 예전처럼 짧게 | 화면 녹화(시간 표시) + `select event_type, meta->>'exposureId' x, created_at at time zone 'Asia/Manila' from platform_popup_campaign_events where campaign_id='<S-R id>' order by created_at;` |
| V6-05 | **D-12·D-13** 끝난 캠페인에도 기록이 쌓이고, 노출 id 가 사람·실행마다 겹쳐 중복을 못 거름 | Android · S-P 가 뜨면 CTA 를 누른다 → iOS · w테스트1 로도 한 번 본다 | 노출 1회마다 `exposureId` 가 서로 다른 uuid · 같은 노출의 impression·click 은 **같은 uuid** · 같은 (uuid, 종류) 2행 없음 | 위 SQL 을 `<S-P id>` 로 + `select meta->>'exposureId', event_type, count(*) from platform_popup_campaign_events where campaign_id='<S-P id>' group by 1,2 having count(*)>1;` (0행이어야 PASS) |
| V6-06 | **D-06** 이벤트 저장 때마다 팝업이 검토 대기로 내려감(이름만 바꿔도) | 어드민 › 이벤트 › S-E 배포 패널 ① 이벤트 **이름만** 바꿔 저장 ② 팝업 이미지를 바꿔 저장 | ① 팝업 상태 그대로 ② 패널에 「팝업 그림·내용이 바뀌어 다시 승인이 필요합니다.」 + 검토 대기 | 캡처 2장 + 저장마다 `select status, approval_status, updated_at at time zone 'Asia/Manila' from platform_popup_campaigns where id='<S-E 팝업 id>';` |
| V6-07 | **AD2-02** 팝업·PTR 「정지」가 사유 없이 됨 | 어드민 › S-P 상세 「정지」 → 사유 비우고 확인 → 사유 넣고 확인 | 사유 없으면 진행 안 됨 · 사유 넣으면 정지 · 확인창에 대상 이름 재입력 칸 **없음** | 캡처 2장 |
| V6-08 | **D-17** 피드 광고 신고 버튼이 작고(44px 미만) 신고 큐에서 광고인지 모름 | Android · w테스트1 · 거래 홈 피드 배너(노출 중인 것 · 없으면 S-F) 신고 버튼 누름 → 신고 → 같은 배너를 한 번 더 신고 → 어드민 신고 큐 | 버튼 터치 영역 44px 이상(인스펙터로 크기) · 두 번째 신고는 「이미 접수」 · 큐에 「광고 · <캠페인 이름>」 + 누르면 `/admin/feed-ads/<id>` | 캡처 3장 + 크기 값 + `select count(*) from reports where target_type='feed_ad' and target_id='<id>' and reporter_id='<w테스트1 id>';`(1이어야 PASS) |
| V6-09 | **D-16** 마이 배너 외부 링크가 고객 응답에 섞임 | 어드민 마이 배너 S-M 활성 → Android q테스트1 마이 화면 + 마이 배너 API 응답 | S-M 이 화면에도 응답에도 **없음** | 캡처 + 네트워크 응답 |
| V6-10 | **D-19** 이벤트 히어로 여러 개일 때 순서 기준을 알 수 없음 | 어드민 › 이벤트 › S-E 배포 패널 › 히어로 채널 선택 | 「최근 수정한 이벤트가 먼저」 뜻의 안내 1줄 | 캡처 |

### C. 배달·도메인 어드민

| # | 결함 | 할 일 | PASS | 증거 |
|---|---|---|---|---|
| V6-11 | **D-02** 예약(SCHEDULED) 배달 광고를 종료하면 귀책·환급 없이 끝남 | 어드민 › 배달 광고 상세 · S-D① 「종료」 | 귀책 선택 + 환급 미리보기 표시 · 귀책 **운영** 으로 종료 → 미리보기 = 실제 환급 · 사장님 캐시 잔액 증가 | 캡처 + `select entry_kind, amount_minor, idempotency_key from business_cash_ledger where idempotency_key like '%<S-D① id>%';` |
| V6-12 | **D-11** 상위노출 중인 커뮤니티 글을 숨기면 글만 숨고 주문이 남음 | 어드민 › 커뮤니티 글 상세 · S-C 「숨김」 | 「상위노출 중 · 귀책 선택」 → 운영 귀책 → 주문 종료 · 환급 · 글 숨김이 **한 번에** · q테스트1 에게 종료 알림 | 캡처 + `select order_status, fault, refund_points, end_at at time zone 'Asia/Manila' from point_promotion_orders where target_id='<S-C 글 id>';` |
| V6-13 | **D-03** 진행 중 배달 광고에 「강제 종료」(환급 없이 끝내기)가 보임 | S-D② 를 배달 상세·공통 광고 화면 상세에서 연다 | 「강제 종료」 버튼 없음 · 「종료」만 있고 귀책·미리보기를 거침 | 캡처 2장 |
| V6-14 | **D-10** 배달 정지 사유가 사장님에게 내부 메모까지 보임 | S-D② 배달 상세 「정지」 — 공개 사유 `QA-ADS-1107V6 점검`, 내부 메모 `QA-ADS-1107V6 내부` → 사장님 앱 광고 화면 | 확인창이 공개·내부 두 칸 · 사장님 화면·응답에 「점검」만 · 「내부」 **없음** | 캡처 2장 + 사장님 화면 네트워크 응답 |
| V6-15 | **D-15** 어드민·알림에 「홍보」(상위노출을 뜻함)가 남음 | 어드민 메뉴(광고·커뮤니티) · 커뮤니티 상위노출 화면 · 광고 신청 화면 · 커뮤니티 글 상세 · 마이 › 알림 설정(거래·커뮤니티 알림 이름) | 「상위노출」로 보임 · 배달 상품명 「매장 홍보」·동네 「홍보」 카테고리·쿠폰 「신메뉴 홍보」는 그대로(정상 용어) | 캡처(화면마다 1장) |

### D. 어드민 광고 원장 SSOT

| # | 결함 | 할 일 | PASS | 증거 |
|---|---|---|---|---|
| V6-16 | 공통 광고 화면에 PTR·마이 배너·인트로·이벤트 히어로가 없고, 피드 신청·캠페인이 2행으로 중복 | 어드민 › 광고 › 광고 작업 공간(`/admin/advertising`) 「전체」 | 종류 칩 수 = 0-5 `ledger_kind`(시험 중 만든 샘플 반영) · 피드 회원 신청 1건 = 1행 · 0-5 `ledger_dup` = 0 | 캡처(칩·쪽 표시 보이게) — 「전체 N건 중 a–b」는 쪽 표시이고 기간은 칩 선택 상태로 판정 |
| V6-17 | 행에 위치·광고주·결제가 없음(uuid 만) | 같은 화면에서 S-D②·S-F·S-P 행을 찾는다 | 위치 문구(예: 배달 홈 상단 · 거래 홈 피드 · 앱 실행 팝업) · 광고주 이름(매장 이름·닉네임·운영자) · 결제 금액·통화·상태 · 기간 지난 정지는 「종료(기간 만료)」 | 캡처 3장 + 각 행 `select kind, location_key, advertiser_name, pay_currency, pay_amount, pay_status from admin_ads_ledger_rows(null,null,now(),false) where source_id='<id>';` |
| V6-18 | 도메인 메뉴마다 다른 화면(항목 누락) | 어드민 › 배달·거래·커뮤니티 메뉴의 「광고」 항목 | 같은 원장 화면 + 주소 `?domain=<도메인>` · 그 도메인 행만 | 캡처 3장(주소 보이게) |
| V6-19 | 광고 행에서 광고주 문의·충전으로 바로 못 감 | S-D② 행의 바로 가기 「광고주 문의」「충전·잔액」「광고주 상세」 · 메뉴 「충전·문의」 | 문의 = 고객센터 그 광고주 검색 · 충전·잔액 = 매장 비즈니스 캐시(회원 광고는 포인트) · 반대로 캐시 충전 대기열·포인트 충전 상세·문의 상세에 「이 광고주의 광고」 링크 | 캡처(이동한 화면마다) |
| V6-20 | 위치 지도에서 지면별 광고를 못 봄 | 어드민 › 광고 › 위치 화면 · 「배달 홈 상단」 칸 누름 | 원장이 그 위치로 걸러짐(주소 `?location=`) · 수 = 지도 칸 숫자 | 캡처 2장 |
| V6-21 | **삭제에 대상 이름 재입력**이 필요하고, 초안만 지워짐 | ① S-X① 상세 「삭제」 ② S-D② 공통 화면 드로어 「삭제」 ③ 이력 › 「삭제됨」 탭에서 S-X① 아닌 S-D② 「삭제 취소」 | ① 사유만 입력 → 바로 삭제(재입력 칸 없음 · 원장에서 사라짐) ② 사유 → 귀책 선택 + 환급 미리보기 → 삭제 = 종료 + 삭제 표시 · 미리보기 = 실제 환급 ③ 삭제 취소(사유 필요) → 원장에 다시 보이되 **종료 상태 그대로**(환급 되돌림 없음) | 캡처 단계마다 + `select action, created_at at time zone 'Asia/Manila', after_json->>'mode' from audit_logs where target_id in ('<S-X① id>','<S-D② id>') and action in ('ad.delete','ad.undelete') order by created_at;` |
| V6-22 | 삭제한 검토 대기 광고를 도메인 화면에서 승인할 수 있음 | S-X②(검토 대기)를 공통 화면에서 삭제 → 팝업 관리 화면에서 S-X② 「승인」 시도 | 승인 안 됨(오류 안내 · 코드값·영어 원문 노출 없음) · 상태 그대로 | 캡처 + `select status, approval_status, deleted_at is not null del from platform_popup_campaigns where id='<S-X② id>';` |

### 이번에 하지 않는 것 (NOT_PROVEN 으로 적는다)

- V6-03 **D-07** iOS 구 빌드(StoreKit 없음) 충전 안내 — 지금 설치 빌드에 StoreKit 이 있으면 조건이 안 된다. 0-3 앱 버전을 적고 「조건 불일치 — NOT_PROVEN」. 구 빌드가 설치된 기기가 있을 때만 포인트 충전 화면에서 「앱을 최신 버전으로 업데이트하면 충전할 수 있어요」를 확인한다.
- 권한 없는 운영자로 바로 가기·삭제 버튼 꺼짐 확인 — 운영자 계정 로그인이 없으면 NOT_PROVEN(비밀번호 입력 금지).
- 인트로 삭제·인트로 노출 — Owner 결정 「인트로 제외」.

## 5. 정리 (화면으로 · 끝까지)

1. 남은 샘플을 어드민 「종료」 또는 「삭제」(사유 `QA-ADS-1107V6 정리`)로 끝낸다. S-F·S-C 는 귀책 회원.
2. S-M 마이 배너는 숨김. S-E 이벤트는 배포 채널 끄기 + 비공개.
3. 넣은 포인트·비즈니스 캐시는 어드민 화면으로 회수. 계정별 「시작 → 넣음 → 사용 → 환급 → 회수 → 끝」 표.
4. 앱 글(`QA-ADS-1107V6-`)은 작성자 계정으로 삭제.
5. 0-5 를 다시 돌린다. `popup_live`·`feed_live`·`promo_live` 가 시작 값과 같아야 한다.

## 6. 보고 (`docs/audit/cursor-report-ads-device-verify-v6-2026-11-07.md` 하나)

1. 첫 줄: Production SHA·Ready · Android 모델·앱 버전 · iOS 시뮬레이터 기종·빌드 · 시험 시간대(PHT)
2. 0-5 시작·끝 기준값 표
3. 샘플 표(무엇을·언제·계정·포인트/캐시·팝업 켠·끈 시각)
4. **V6-01 ~ V6-22 표**: `# | 판정(PASS/FAIL/NOT_PROVEN/기기 한계) | 확인 조건 | 증거 | 메모`
5. FAIL 목록(본 그대로 · 원인 추측 금지)
6. 기기 한계(시도한 명령과 결과)
7. 정리 결과 표
