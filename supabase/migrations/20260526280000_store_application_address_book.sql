ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS application_address_book jsonb;

COMMENT ON COLUMN public.stores.application_address_book IS
  '입점 신청 시점 대표 주소록 카드 표시 — { gatePrefix, streetBody } (formatPhAddressCardOneLine)';
