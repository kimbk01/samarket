-- Slice 8 Phase 1 — Legal CMS SSOT (terms + privacy). Separate from app_notices.
BEGIN;

CREATE TABLE IF NOT EXISTS public.app_legal_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('terms', 'privacy')),
  locale text NOT NULL CHECK (locale IN ('ko', 'en')),
  title text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  version text NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  effective_at timestamptz NULL,
  published_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT app_legal_documents_kind_locale_version_uidx UNIQUE (kind, locale, version)
);

CREATE INDEX IF NOT EXISTS idx_app_legal_documents_public_read
  ON public.app_legal_documents (kind, locale, status, effective_at DESC NULLS LAST);

COMMENT ON TABLE public.app_legal_documents IS
  'DIBAY Policy CMS Legal SSOT (Slice 8 Phase 1). Writer=Admin CMS; Reader=Member/Guest /terms|/privacy. Notices stay on app_notices.';

-- Seed published docs from prior i18n static copy (version aligned with consent constants).
INSERT INTO public.app_legal_documents (kind, locale, title, body, version, status, effective_at, published_at)
VALUES
(
  'terms', 'ko', '이용약관',
  E'dibaY는 커뮤니티, 거래, 주문, 채팅 기능을 제공하며 서비스 내 불법 행위, 사기, 혐오 표현, 성적 착취, 개인정보 유출을 금지합니다.\n\n회원은 본인 계정으로만 서비스를 이용해야 하며, 허위 정보 등록이나 타인 명의 도용은 금지됩니다.\n\n필리핀 전화번호 인증이 필요한 기능은 정회원 인증 후에만 사용할 수 있습니다.\n\n신고 및 차단 기능을 통해 부적절한 사용자나 콘텐츠를 제재할 수 있으며, 운영자는 심사와 안전을 위해 필요한 기록을 보관할 수 있습니다.',
  '2026-04-store-review', 'published', '2026-04-01T00:00:00Z', now()
),
(
  'terms', 'en', 'Terms of service',
  E'dibaY provides community, trade, order, and chat features. Illegal activity, fraud, hate speech, sexual exploitation, and leaking personal information are prohibited.\n\nMembers must use the service only with their own account. False registration or impersonation is prohibited.\n\nFeatures that require Philippine phone verification are available only after full membership verification.\n\nYou can report and block inappropriate users or content. Operators may retain records needed for review and safety.',
  '2026-04-store-review', 'published', '2026-04-01T00:00:00Z', now()
),
(
  'privacy', 'ko', '개인정보처리방침',
  E'dibaY는 계정 식별, 거래 안전, 고객지원, 신고 처리, 법적 의무 이행을 위해 필요한 최소한의 개인정보를 처리합니다.\n\n전화번호, 로그인 공급자 정보, 거래 및 신고 관련 기록은 서비스 안전과 분쟁 대응 목적상 일정 기간 보관될 수 있습니다.\n\n회원은 앱 내 계정 관리 메뉴와 웹 계정 삭제 요청 페이지를 통해 삭제 요청을 시작할 수 있습니다.\n\n운영상 또는 법적 의무로 보관해야 하는 기록을 제외한 개인정보는 탈퇴 처리 시 비식별화 또는 삭제 정책에 따라 관리됩니다.',
  '2026-04-store-review', 'published', '2026-04-01T00:00:00Z', now()
),
(
  'privacy', 'en', 'Privacy policy',
  E'dibaY processes only the minimum personal information needed for account identification, trade safety, customer support, reports, and legal compliance.\n\nPhone numbers, sign-in provider information, and trade and report records may be retained for a period for safety and dispute resolution.\n\nMembers can start a deletion request from in-app account settings and the web account deletion page.\n\nExcept for records that must be kept for operations or legal reasons, personal information is managed through de-identification or deletion according to our withdrawal policy.',
  '2026-04-store-review', 'published', '2026-04-01T00:00:00Z', now()
)
ON CONFLICT (kind, locale, version) DO NOTHING;

COMMIT;
