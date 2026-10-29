-- 배달 메뉴 아이콘 초기값 — 기존 업종 그림(store_topics/store_categories.image_url) 을 메뉴 아이콘으로 복사.
-- 메뉴 아이콘은 어드민 「메뉴 관리」에서 바꾸거나 지울 수 있다 (업종 그림은 바뀌지 않음).
-- 이미 아이콘이 있는 메뉴는 건드리지 않는다. 선물하기·혜택(화면 연결) 메뉴는 맞는 업종 그림이 없어 비워 둔다.
update public.delivery_menus m
set icon_url = src.image_url
from (
  select v.menu_slug, coalesce(t.image_url, c.image_url) as image_url
  from (values
    ('korean', 'restaurant', 'korean'), ('chinese', 'restaurant', 'chinese'), ('western', 'restaurant', 'western'),
    ('snack', 'restaurant', 'snack'), ('chicken', 'restaurant', 'chicken'), ('pizza', 'restaurant', 'pizza'),
    ('stew', 'restaurant', 'korean'), ('late-night', 'restaurant', 'chicken'), ('cafe-dessert', 'restaurant', 'dessert'),
    ('p-coffee', 'cafe', 'coffee'), ('p-bakery', 'cafe', 'bakery'), ('p-meal', 'restaurant', 'korean'),
    ('p-chicken', 'restaurant', 'chicken'), ('p-snack', 'restaurant', 'snack'), ('p-pizza', 'restaurant', 'pizza'),
    ('k-mart', 'mart', 'korean-mart'), ('local-mart', 'mart', 'local-mart'), ('meat', 'mart', 'meat'),
    ('seafood', 'mart', 'seafood'), ('side-dish', 'mart', 'side-dish'), ('fruit', 'mart', 'fruit'),
    ('tools', 'hardware', null), ('pet', 'pet', null), ('pet-care', 'pet', 'pet-groom'),
    ('beauty', 'beauty', null), ('academy', 'academy', null),
    ('cleaning', 'life', 'cleaning'), ('laundry', 'life', 'laundry'), ('repair', 'life', 'repair')
  ) as v(menu_slug, category_slug, topic_slug)
  join public.store_categories c on c.slug = v.category_slug
  left join public.store_topics t on t.store_category_id = c.id and t.slug = v.topic_slug
) src
where m.slug = src.menu_slug and m.parent_id is not null and m.icon_url is null and src.image_url is not null;
