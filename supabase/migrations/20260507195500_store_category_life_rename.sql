-- Rename primary store category label: 생활서비스 -> 서비스
-- Keep slug as-is (life) to preserve URLs and references.

update public.store_categories
set name = '서비스'
where slug = 'life' and name = '생활서비스';

