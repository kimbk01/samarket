-- D-13 (ads-reaudit3-defect-design-2026-11-07) — 팝업·PTR 이벤트 「노출 1회 · 종류 1행」 DB 고유 인덱스.
--
-- 운영 확인(2026-11-07 SELECT · platform_popup_campaign_events 2,231행 · 전부 exposureId 있음):
--   · (campaign_id, meta->>'exposureId', event_type) 중복 묶음 107개 · 남는 중복 행 1,967개 · 마지막 중복 2026-11-04 15:19 UTC.
--   · 원인 1(새 결함 · 보고): 전역 팝업(GlobalPopupHost)의 exposureId 가 `<campaign>:<creative>:<세대 번호>` 라서
--     사용자·기기·세션이 달라도 같은 값(:1, :2 …)이 나온다 → 2,147행/183키. 이 형식에 고유 인덱스를 걸면
--     **다른 사람의 정상 노출·클릭이 거절**된다.
--   · PTR(DibayPtrRevealAdLayer)은 crypto.randomUUID() — 84행/81키(같은 노출 재전송 3행).
-- 처리(중복 행은 지우지 않는다 · 통계 원본 보존):
--   ① 인덱스는 이 마이그레이션 **적용 시각 이후** 행만 덮는다 (created_at > 적용 시각 — 적용 때 now() 를 상수로 박는다).
--   ② 옛 세대 번호 형식(`uuid:uuid:숫자`)은 인덱스에서 뺀다 — 사람마다 같은 값이라 고유 판정을 할 수 없다.
--      웹(W2)이 GlobalPopupHost exposureId 를 노출 1회마다 새 uuid 로 바꾸면 그 뒤 행은 자동으로 인덱스 대상이 된다.
--      (바꾸기 전 · 배포 직후 열려 있던 옛 화면의 행은 지금처럼 기록되고 중복은 웹 rate-limit 만 거른다.)
-- 웹은 insert 오류 23505 를 「deduped」로 처리한다 (약속 파일).
--
-- 롤백 SQL:
--   drop index if exists public.platform_popup_campaign_events_exposure_event_uidx;

do $mig$
begin
  execute format(
    'create unique index if not exists platform_popup_campaign_events_exposure_event_uidx
       on public.platform_popup_campaign_events (campaign_id, (meta ->> %L), event_type)
     where (meta ->> %L) is not null
       and created_at > %L::timestamptz
       and not ((meta ->> %L) ~ %L)',
    'exposureId', 'exposureId', now(), 'exposureId',
    '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}:[0-9]+$'
  );
end
$mig$;

comment on index public.platform_popup_campaign_events_exposure_event_uidx is
  'D-13: 노출 1회(exposureId) · 종류 1행. 적용 시각 이후 행만 · 옛 세대 번호 형식(uuid:uuid:n) 제외.';
