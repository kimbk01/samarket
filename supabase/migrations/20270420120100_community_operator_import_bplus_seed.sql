-- Community operator-import B+ seeds: code registry → DB SSOT (ids unchanged) + expansion candidates.
-- Additive inserts only (on conflict do nothing); one existing duplicate source disabled, not deleted.

-- 8. seeds ---------------------------------------------------------------------------------------
-- Seed: code registry sources (ids unchanged so existing inbox/draft keys stay valid)
insert into public.community_operator_import_sources (id, display_name, base_url, engine, verification, enabled, priority, origin, reason, content_policy)
select v.id, v.display_name, v.base_url, v.engine, v.verification, v.enabled, v.priority, 'seed', v.reason, 'summary_link'
from (values
  ('philsamo', '필사모', 'https://philsamo.com', 'gnuboard', 'NOT_PROVEN', true, 'P0', 'B+ 이전 코드 레지스트리에서 이관 — 서버 재검증 대기'),
  ('hellocebuph', 'Hello Cebu', 'https://hellocebuph.com', 'wordpress_rest', 'NOT_PROVEN', true, 'P0', 'B+ 이전 코드 레지스트리에서 이관 — 서버 재검증 대기'),
  ('immigration', 'Bureau of Immigration', 'https://immigration.gov.ph', 'wordpress_rest', 'BLOCKED', false, 'P0', 'robots.txt Disallow: /wp-json/ (2026-10-05 audit)'),
  ('officialgazette', 'Official Gazette', 'https://www.officialgazette.gov.ph', 'rss_atom', 'NOT_PROVEN', true, 'P0', 'B+ 이전 코드 레지스트리에서 이관 — 서버 재검증 대기'),
  ('philstar', 'Philstar', 'https://www.philstar.com', 'rss_atom', 'NOT_PROVEN', true, 'P0', 'B+ 이전 코드 레지스트리에서 이관 — 서버 재검증 대기'),
  ('aswangproject', 'Aswang Project', 'https://www.aswangproject.com', 'wordpress_rest', 'NOT_PROVEN', true, 'P1', 'B+ 이전 코드 레지스트리에서 이관 — 서버 재검증 대기'),
  ('golfph', 'GolfPH', 'https://golfph.com', 'wordpress_rest', 'NOT_PROVEN', true, 'P1', 'B+ 이전 코드 레지스트리에서 이관 — 서버 재검증 대기'),
  ('primer', 'Philippine Primer', 'https://primer.com.ph', 'wordpress_rest', 'FAILED', false, 'P1', '최신 글 2019년 — 사실상 운영 중단 (2026-10-05 audit)'),
  ('rappler', 'Rappler', 'https://www.rappler.com', 'rss_atom', 'NOT_PROVEN', true, 'P0', 'B+ 이전 코드 레지스트리에서 이관 — 서버 재검증 대기'),
  ('inquirer', 'INQUIRER.net', 'https://www.inquirer.net', 'rss_atom', 'NOT_PROVEN', true, 'P0', 'B+ 이전 코드 레지스트리에서 이관 — 서버 재검증 대기'),
  ('dof', 'Department of Finance', 'https://www.dof.gov.ph', 'rss_atom', 'NOT_PROVEN', true, 'P2', 'B+ 이전 코드 레지스트리에서 이관 — 서버 재검증 대기'),
  ('cesimo', '세시모', 'https://cesimo.tistory.com', 'rss_atom', 'NOT_PROVEN', true, 'P0', 'B+ 이전 코드 레지스트리에서 이관 — 서버 재검증 대기'),
  ('danielinclarkphp', '다니엘가이드의 필리핀생활', 'https://danielinclarkphp.tistory.com', 'rss_atom', 'NOT_PROVEN', true, 'P0', 'B+ 이전 코드 레지스트리에서 이관 — 서버 재검증 대기'),
  ('cebulife', '세부사는 동생', 'https://cebulife.tistory.com', 'rss_atom', 'NOT_PROVEN', true, 'P0', 'B+ 이전 코드 레지스트리에서 이관 — 서버 재검증 대기'),
  ('cebuevan', '어메이징 에반', 'https://cebuevan.tistory.com', 'rss_atom', 'NOT_PROVEN', true, 'P0', 'B+ 이전 코드 레지스트리에서 이관 — 서버 재검증 대기')
) as v(id, display_name, base_url, engine, verification, enabled, priority, reason)
on conflict (id) do nothing;

-- Seed: code registry boards (philsamo bo_table=food is the real "업체" directory, not restaurant reviews)
insert into public.community_operator_import_source_boards (source_id, board_id, display_name, short_label, category, engine_key, enabled, board_kind, default_topic_id)
select v.source_id, v.board_id, v.display_name, v.short_label, v.category, v.engine_key, true, v.board_kind,
  (select t.id from public.community_topics t join public.community_sections s on s.id = t.section_id
   where s.slug = 'dongnae' and t.slug = v.topic_slug limit 1)
from (values
  ('philsamo', 'travel', '필리핀 여행', '여행', 'travel', 'travel', 'editorial', 'travel'),
  ('philsamo', 'food', '업체 (업소 목록)', '업체', 'food', 'food', 'directory', null),
  ('philsamo', 'news', '필리핀 뉴스', '뉴스', 'news', 'news', 'editorial', 'news'),
  ('philsamo', 'free', '자유게시판', '자유', 'living', 'free', 'community', 'phlifee'),
  ('hellocebuph', 'destinations', 'DESTINATIONS', '여행지', 'travel', '18', 'editorial', 'travel'),
  ('hellocebuph', 'guides', 'GUIDES', '가이드', 'travel', '30', 'editorial', 'travel'),
  ('hellocebuph', 'beaches', 'Beaches', '해변', 'travel', '7', 'editorial', 'travel'),
  ('hellocebuph', 'cebu-eats', 'CEBU EATS', '음식', 'food', '19', 'editorial', 'food'),
  ('hellocebuph', 'culture', 'Culture', '문화', 'culture', '78', 'editorial', 'phlifee'),
  ('hellocebuph', 'news-and-events', 'NEWS & EVENTS', '뉴스', 'news', '36', 'editorial', 'news'),
  ('immigration', 'advisory', 'Advisory', '공지', 'immigration', '9', 'editorial', 'news'),
  ('immigration', 'press-release', 'Press Release', '보도', 'immigration', '3', 'editorial', 'news'),
  ('immigration', 'news-and-updates', 'News and Updates', '뉴스', 'news', '15', 'editorial', 'news'),
  ('officialgazette', 'feed', 'Official Gazette Feed', '공보', 'government', '/feed/', 'editorial', 'news'),
  ('philstar', 'headlines', 'Headlines', '헤드라인', 'news', '/rss/headlines', 'editorial', 'news'),
  ('aswangproject', 'philippine-mythology', 'Philippine Mythology', '신화', 'culture', '21', 'editorial', 'phlifee'),
  ('aswangproject', 'precolonial', 'Precolonial Society', '역사', 'history', '708', 'editorial', 'phlifee'),
  ('aswangproject', 'tagalog-mythology', 'Tagalog Mythology', '타갈로그', 'culture', '181', 'editorial', 'phlifee'),
  ('golfph', 'blog', 'Golf Blog', '블로그', 'golf', '5', 'editorial', 'golf'),
  ('golfph', 'golf-courses', 'Golf Courses', '코스', 'golf', '3', 'editorial', 'golf'),
  ('golfph', 'travel-lifestyle', 'Travel & Lifestyle', '여행', 'travel', '255', 'editorial', 'travel'),
  ('primer', 'latest', 'Latest', '최신', 'living', 'all', 'editorial', 'phlifee'),
  ('primer', 'uncategorized', 'Articles', '기사', 'travel', '1', 'editorial', 'travel'),
  ('rappler', 'feed', 'Rappler Feed', '피드', 'news', '/feed/', 'editorial', 'news'),
  ('inquirer', 'feed', 'Inquirer Feed', '피드', 'news', '/feed', 'editorial', 'news'),
  ('dof', 'feed', 'DOF Feed', '피드', 'finance', '/feed/', 'editorial', 'news'),
  ('cesimo', 'feed', '세시모 최신', '여행맛집', 'travel', '/rss', 'editorial', 'travel'),
  ('danielinclarkphp', 'feed', '다니엘 필리핀생활', '생활', 'living', '/rss', 'editorial', 'phlifee'),
  ('cebulife', 'feed', '세부 생활·주거', '주거', 'living', '/rss', 'editorial', 'phlifee'),
  ('cebuevan', 'feed', '에반 밤문화·클락여행', '밤문화', 'nightlife', '/rss', 'unknown', null)
) as v(source_id, board_id, display_name, short_label, category, engine_key, board_kind, topic_slug)
on conflict (source_id, board_id) do nothing;

-- Seed: new candidate sources from the 2026-10-05 expansion audit (REPORT I/J).
-- All start NOT_PROVEN + collect_enabled=false; server-side verification decides.
insert into public.community_operator_import_sources (id, display_name, base_url, engine, verification, enabled, priority, origin, reason, content_policy, adapter_config)
values
  ('alabangzapote', '알이즈웰', 'https://alabang-zapote.com/madang/', 'gnuboard', 'NOT_PROVEN', true, 'P1', 'seed', '확장 감사 후보 — 브라우저 실증 FULL, 서버 재검증 대기', 'summary_link', '{}'::jsonb),
  ('gmanetwork', 'GMA News', 'https://www.gmanetwork.com/news/', 'rss_atom', 'NOT_PROVEN', true, 'P1', 'seed', '확장 감사 후보 — 섹션 피드, 요약+링크', 'summary_link', '{}'::jsonb),
  ('awesomeblog', 'Our Awesome Planet', 'https://awesome.blog/', 'wordpress_rest', 'NOT_PROVEN', true, 'P1', 'seed', '확장 감사 후보 — 마닐라 맛집', 'summary_link', '{}'::jsonb),
  ('wheninmanila', 'When In Manila', 'https://www.wheninmanila.com/', 'wordpress_rest', 'NOT_PROVEN', true, 'P2', 'seed', '확장 감사 후보 — Crawl-delay 10', 'summary_link', '{}'::jsonb),
  ('expatden', 'ExpatDen Philippines', 'https://www.expatden.com/', 'wordpress_rest', 'NOT_PROVEN', true, 'P2', 'seed', '확장 감사 후보 — 외국인 생활 가이드', 'summary_link', '{}'::jsonb),
  ('aseanexpress', '아세안익스프레스', 'https://www.aseanexpress.co.kr/', 'html', 'NOT_PROVEN', true, 'P2', 'seed', '확장 감사 후보 — RSS 없음, 설정형 HTML', 'summary_link',
     '{"itemUrlTemplate": "/news/article.html?no", "bodySelectors": ["#news_body_area"]}'::jsonb),
  ('pia', 'Philippine Information Agency', 'https://pia.gov.ph/', 'wordpress_rest', 'NOT_PROVEN', true, 'P2', 'seed', '확장 감사 후보 — 브라우저에서는 Cloudflare 확인 화면, 서버 재검증 필요', 'summary_link', '{}'::jsonb),
  ('tribune', 'Daily Tribune', 'https://tribune.net.ph/', 'rss_atom', 'NOT_PROVEN', true, 'P2', 'seed', '확장 감사 후보 — 요약 피드', 'summary_link', '{}'::jsonb),
  ('mofa_ph', '주필리핀 대한민국 대사관', 'https://overseas.mofa.go.kr/ph-ko/', 'html', 'NOT_PROVEN', true, 'P1', 'seed', '확장 감사 후보 — 공지 게시판, 서버 재검증 필요', 'summary_link', '{}'::jsonb)
on conflict (id) do nothing;

insert into public.community_operator_import_source_boards (source_id, board_id, display_name, short_label, category, engine_key, enabled, board_kind, default_topic_id)
select v.source_id, v.board_id, v.display_name, v.short_label, v.category, v.engine_key, true, v.board_kind,
  (select t.id from public.community_topics t join public.community_sections s on s.id = t.section_id
   where s.slug = 'dongnae' and t.slug = v.topic_slug limit 1)
from (values
  ('alabangzapote', 'news', '모아모아 뉴스', '뉴스', 'news', 'news', 'editorial', 'news'),
  ('alabangzapote', 'info', '정보통', '정보', 'living', 'info', 'editorial', 'phlifee'),
  ('alabangzapote', 'column', '컬럼', '컬럼', 'living', 'column', 'editorial', 'phlifee'),
  ('alabangzapote', 'cartoon', '타골 카툰', '카툰', 'culture', 'cartoon', 'editorial', 'humor'),
  ('gmanetwork', 'topstories', 'Top Stories', '헤드라인', 'news', 'https://data.gmanetwork.com/gno/rss/news/feed.xml', 'editorial', 'news'),
  ('gmanetwork', 'metro', 'Metro', '메트로', 'news', 'https://data.gmanetwork.com/gno/rss/news/metro/feed.xml', 'editorial', 'news'),
  ('gmanetwork', 'nation', 'Nation', '전국', 'news', 'https://data.gmanetwork.com/gno/rss/news/nation/feed.xml', 'editorial', 'news'),
  ('gmanetwork', 'transportation', 'Transportation', '교통', 'news', 'https://data.gmanetwork.com/gno/rss/serbisyopubliko/transportation/feed.xml', 'editorial', 'news'),
  ('gmanetwork', 'walangpasok', 'Walang Pasok', '휴교', 'news', 'https://data.gmanetwork.com/gno/rss/serbisyopubliko/walangpasok/feed.xml', 'editorial', 'news'),
  ('awesomeblog', 'food', 'Food', '맛집', 'food', '29', 'editorial', 'food'),
  ('awesomeblog', 'restaurants', '#Restaurants', '레스토랑', 'food', '4', 'editorial', 'food'),
  ('awesomeblog', 'latest', '최신 전체', '최신', 'living', 'all', 'editorial', null),
  ('wheninmanila', 'eat-drink', 'Eat & Drink', '맛집', 'food', '8', 'editorial', 'food'),
  ('wheninmanila', 'events-nightlife', 'Events & Nightlife', '행사', 'culture', '13', 'editorial', null),
  ('expatden', 'philippines', 'Philippines', '생활', 'living', '769', 'editorial', 'phlifee'),
  ('aseanexpress', 'philippines', '필리핀', '필리핀', 'news', 'https://www.aseanexpress.co.kr/news/section.html?sec_no=77', 'editorial', 'news'),
  ('pia', 'region7', 'Central Visayas (Region 7)', '세부', 'news', '41', 'editorial', 'news'),
  ('pia', 'region3', 'Central Luzon (Region 3)', '클락', 'news', '36', 'editorial', 'news'),
  ('tribune', 'feed', 'Daily Tribune', '피드', 'news', '/rss.xml', 'editorial', 'news'),
  ('mofa_ph', 'notice', '공지사항', '공지', 'news', 'https://overseas.mofa.go.kr/ph-ko/brd/m_3640/list.do', 'editorial', 'news')
) as v(source_id, board_id, display_name, short_label, category, engine_key, board_kind, topic_slug)
on conflict (source_id, board_id) do nothing;

-- Duplicate registration of the seeded Aswang Project under another id: keep rows, stop runtime use.
update public.community_operator_import_sources
set enabled = false,
    reason = '코드 출처 aswangproject와 같은 사이트 중복 등록 (2026-10-05 audit)',
    updated_at = now()
where id = 'aswangproject_managed' and enabled = true;

