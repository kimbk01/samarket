-- Optional, Owner-approved only — NOT a migration. Apply manually after
-- 20270516120000_admin_notification_campaign_cms.sql if the Owner decides to.
-- Effect: legacy immediate campaigns still `draft` after their last real occurrence finished
-- (13 rows in production on 2026-10-19) are set to that outcome so they show under 완료.
-- Without it they keep showing under 작성 중 (existing behaviour, nothing breaks).
BEGIN;
-- 5) Legacy backfill: draft campaign whose latest real occurrence is terminal
UPDATE public.admin_notification_campaigns AS c
SET
  status = o.status,
  sent_at = COALESCE(c.sent_at, o.completed_at),
  updated_at = now()
FROM (
  SELECT DISTINCT ON (campaign_id) campaign_id, status, completed_at
  FROM public.admin_notification_campaign_occurrences
  WHERE trigger_type <> 'test'
  ORDER BY campaign_id, sequence_number DESC
) AS o
WHERE o.campaign_id = c.id
  AND c.status = 'draft'
  AND c.send_mode = 'immediate'
  AND o.status IN ('sent', 'partially_failed', 'failed');

COMMIT;
