-- untouched-data fingerprint (posts, images, drafts, decoy inbox row)
select md5(coalesce((select string_agg(id::text||coalesce(title,'')||status||images::text||updated_at::text, ',' order by id) from public.community_posts),'')) ||
       md5(coalesce((select string_agg(post_id::text||image_url||sort_order, ',' order by id) from public.community_post_images),'')) ||
       md5(coalesce((select string_agg(id::text||status||coalesce(published_post_id::text,'')||updated_at::text, ',' order by id) from public.community_operator_import_drafts),'')) ||
       md5(coalesce((select string_agg(id::text||status||coalesce(published_post_id::text,'')||updated_at::text, ',' order by id) from public.community_operator_import_inbox where id::text like '22222222%'),''));
