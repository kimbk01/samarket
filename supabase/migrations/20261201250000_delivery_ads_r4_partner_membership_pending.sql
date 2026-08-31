-- R4 — Partner membership PENDING_REVIEW (Owner apply → Admin approve).
-- Required durable authority for 가입 대기; prior CHECK lacked pending application status.

BEGIN;

ALTER TABLE public.delivery_ad_partner_memberships
  DROP CONSTRAINT IF EXISTS delivery_ad_partner_memberships_status_check;

ALTER TABLE public.delivery_ad_partner_memberships
  ADD CONSTRAINT delivery_ad_partner_memberships_status_check
  CHECK (
    status IN (
      'NONE',
      'PENDING_REVIEW',
      'ACTIVE',
      'PAST_DUE',
      'CANCEL_PENDING',
      'ENDED'
    )
  );

COMMENT ON CONSTRAINT delivery_ad_partner_memberships_status_check
  ON public.delivery_ad_partner_memberships IS
  'R4: PENDING_REVIEW = Owner apply awaiting Admin approve. ACTIVE/CANCEL_PENDING get ad discount while in period. Partner monthly fee payment = NOT_IMPLEMENTED.';

COMMIT;
