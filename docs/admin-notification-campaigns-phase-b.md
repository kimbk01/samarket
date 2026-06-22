# Admin Notification Campaigns — Phase B 계획

Phase A에서 **예약(`scheduled`) 상태 저장·UI 표시**만 구현했습니다.  
자동 발송 cron/worker는 **연결되어 있지 않습니다.**

## Phase B 범위

1. **예약 발송 worker**
   - `status = scheduled AND scheduled_at <= now()` 캠페인을 주기적으로 조회
   - `runNotificationCampaignSendBatch`를 `done`까지 호출 (Phase A 배치 SSOT 재사용)
   - 시작 시 `sending`, 완료 시 `sent` / `partially_failed` / `failed`

2. **Cron 트리거**
   - Vercel Cron 또는 Supabase pg_cron + Edge Function
   - 권장: `POST /api/admin/notification-campaigns/cron/dispatch-scheduled` (service secret)

3. **Admin UX**
   - 예약 캠페인 상세에 “다음 실행 예정” + cron heartbeat 표시
   - `scheduled` 상태에서 수동 “지금 발송”은 Phase A와 동일 유지

4. **안전장치**
   - 동일 캠페인 중복 cron 실행 방지 (advisory lock 또는 `sending` 가드)
   - Phase A `assertCampaignSendAllowed` 재사용

## Phase C (후속)

- iOS NSE + APNs rich push 이미지
- Android BigPictureStyle 네이티브 소비 (`bigPictureUrl` data 필드는 Phase A FCM payload에 포함)
- Realtime 기반 인앱 배너 (poll 15s 대체)
- 세그먼트 쿼리 실구현

## Phase A 완료 후 확인

- [ ] `scheduled` 캠페인이 **시간이 지나도 자동 발송되지 않음** (의도된 동작)
- [ ] Admin UI에 “예약 (자동 발송 미연결)” 문구 표시
- [ ] Phase B worker 배포 전까지 운영은 **즉시 발송** 또는 **상세 화면 수동 배치**만 사용
