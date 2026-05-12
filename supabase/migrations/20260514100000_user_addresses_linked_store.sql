-- 매장형 배달 주소: 소유 매장(stores)과 연결. 스냅샷은 서버·클라에서 stores 기준으로 채운다.

ALTER TABLE public.user_addresses
  ADD COLUMN IF NOT EXISTS linked_store_id uuid REFERENCES public.stores(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS user_addresses_linked_store_id_idx
  ON public.user_addresses (linked_store_id)
  WHERE linked_store_id IS NOT NULL AND is_active;

-- 동일 사용자·동일 매장에 활성 매장 주소 1건만
CREATE UNIQUE INDEX IF NOT EXISTS user_addresses_user_active_linked_store_unique
  ON public.user_addresses (user_id, linked_store_id)
  WHERE is_active AND linked_store_id IS NOT NULL;

COMMENT ON COLUMN public.user_addresses.linked_store_id IS
  'label_type=shop 일 때 연결된 stores.id. 대표 주소와 좌표가 같아도 매장별로 별도 행 허용.';
