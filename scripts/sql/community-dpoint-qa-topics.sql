SELECT slug, id::text AS id, coalesce(name,'') AS name
  FROM public.community_topics
 ORDER BY slug
 LIMIT 40;
