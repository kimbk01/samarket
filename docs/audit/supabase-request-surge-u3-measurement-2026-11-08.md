# U3 — 조회 축소(S4) 판단 기준 · 측정 계획 (Owner 승인 2026-11-08 21:40 PHT)

- 승인 원문: 「U3 승인」 (설계 보완서 `supabase-request-surge-design-supplement-2026-11-08.md` §5-5·§8 U3)
- 상태: **측정만. 코드·DB 변경 0건.**
- 이 기준을 모두 만족해야 S4(V4 웹 수신 2초 조회 축소안)를 **별도 설계서로** 제시한다. 만족해도 축소는 자동으로 진행하지 않고, S4 설계 승인을 따로 받는다.

## 1. 승인된 기준

| # | 기준 | 판정 방법 |
|---|---|---|
| K1 | **보임** 탭: 7일간 실시간 미수신 0% | 운영 집계(§3 쿼리) |
| K2 | **숨김** 탭: 7일간 실시간 미수신 0% | 운영 집계(§3 쿼리) |
| K3 | 재연결 후 놓친 울림 복구 100% | **자동 측정값 없음**(§2 G1) → 실기로만 판정 |

- 측정 기간: **2026-11-08 21:40 PHT ~ 2026-11-15 21:40 PHT**
- Production 기준: U2 `ed1441dae` 이후 배포. 측정 기간 중 수신 탐색 코드가 바뀌면 그 시점부터 다시 센다(다른 버전 결과를 섞지 않음).

## 2. 측정의 공백 (먼저 보고)

| # | 공백 | 이유 | 판정에 주는 영향 |
|---|---|---|---|
| G1 | **K3(재연결 후 복구)는 자동으로 재는 값이 없다** | U2 측정은 「먼저 발견한 경로·신호 지연·10초 내 미수신·구독 상태」만 센다. 「끊겼다 다시 붙은 뒤 놓친 울림을 찾았는가」는 세지 않는다 — U2 설계 때 빠뜨림(작업자 잘못) | K3 는 실기(W4·W11: 네트워크 끊김 중 발신 → 재연결 후 수신 확인)로만 판정한다. 실기 전까지 K3 = NOT_PROVEN |
| G2 | 숨김 탭 표본이 자연적으로 거의 생기지 않는다 | 현재 운영 표본: 보임 6건, **숨김 0건**(21:40 PHT 기준). 사용자 수가 적고, 숨김 상태에서 전화를 받는 경우가 드물다 | 표본이 0이면 K2 는 「0% 만족」이 아니라 **판정 불가(NOT_PROVEN)** 다. 숨김 탭 실기(W3: 데스크톱 Chrome 메신저 탭을 숨긴 채 휴대폰에서 발신)를 7일 안에 따로 진행해야 한다 |
| G3 | 숨김 탭에서 구독이 끊긴 기록이 이미 2건 있다(`incoming_feed_closed_hidden`) | 어느 브라우저인지 NOT_PROVEN | 숨김 탭에서 실시간이 유지되지 않을 수 있다는 신호다. K2 판정 때 함께 본다 |
| G4 | 표본 최소 개수는 정하지 않았다 | 계약·지시 없음 | 기간 끝에 실제 표본 수를 그대로 보고하고, 판정에 충분한지는 Owner 가 정한다 |

## 3. 판정 쿼리 (운영 DB 읽기 전용, 기간 끝에 1회)

```sql
with m as (
  select metric, sum(event_count) n
  from public.cm_monitoring_rollup_hourly
  where category = 'call.incoming_discovery'
    and bucket_hour >= '2026-11-08 13:00+00'   -- 21:40 PHT 가 속한 시간
    and bucket_hour <  '2026-11-15 14:00+00'
  group by metric
)
select
  coalesce(sum(n) filter (where metric like 'incoming_found_%_visible'), 0)            as found_visible,
  coalesce(sum(n) filter (where metric = 'incoming_realtime_never_visible'), 0)       as never_visible,   -- K1: 0 이어야 함
  coalesce(sum(n) filter (where metric like 'incoming_found_%_hidden'), 0)             as found_hidden,    -- K2: 0 이면 판정 불가
  coalesce(sum(n) filter (where metric = 'incoming_realtime_never_hidden'), 0)        as never_hidden,    -- K2: 0 이어야 함
  coalesce(sum(n) filter (where metric like 'incoming_feed_%_hidden'
                             and metric <> 'incoming_feed_subscribed_hidden'), 0)     as feed_drop_hidden,
  coalesce(sum(n) filter (where metric like 'incoming_feed_%_visible'
                             and metric <> 'incoming_feed_subscribed_visible'), 0)    as feed_drop_visible
from m;
```

참고: 집계는 14일 보존이라 기간 끝(11-15)에도 데이터가 남아 있다.

## 4. 시작 시점 값 (2026-11-08 21:40 PHT, PROD)

| 값 | 수 |
|---|---|
| 보임 발견 | 6 (모두 실시간이 먼저) |
| 보임 실시간 미수신 | 0 |
| 숨김 발견 | 0 |
| 숨김 실시간 미수신 | 0 |
| 숨김 구독 끊김 | 2 |
| 보임 구독 끊김 | 0 |

## 5. 기간 중 할 일
- 확인을 위해 집계를 반복 조회하지 않는다(절대 금지 2번 취지). 기간 끝에 §3 쿼리를 1회 실행한다.
- 실기 2건을 기간 안에 진행해야 판정할 수 있다:
  - **W3(숨김 탭):** 데스크톱 Chrome 에서 메신저 탭을 숨긴 채 휴대폰으로 발신 → K2 표본 + 수신 확인.
  - **W4·W11(재연결):** 네트워크를 끊은 채 발신 → 다시 연결한 뒤 수신 확인 → K3 판정.
  - 앱 내장 브라우저는 뒤쪽 탭도 「보임」으로 처리해서 W3 를 재현할 수 없다. Owner 의 데스크톱 Chrome 이 필요하다.
