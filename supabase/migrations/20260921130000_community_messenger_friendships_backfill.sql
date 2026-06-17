-- Backfill community_messenger_friendships from legacy sources.
-- Mutual friend: both user_social_relations friend rows OR accepted community_friend_requests.

-- Accepted mutual friends from user_social_relations (both directions)
INSERT INTO public.community_messenger_friendships (
  requester_user_id,
  addressee_user_id,
  status,
  created_at,
  accepted_at,
  updated_at
)
SELECT
  a.owner_user_id,
  a.target_user_id,
  'accepted',
  LEAST(a.created_at, b.created_at),
  GREATEST(a.created_at, b.created_at),
  GREATEST(a.updated_at, b.updated_at)
FROM public.user_social_relations a
JOIN public.user_social_relations b
  ON b.owner_user_id = a.target_user_id
 AND b.target_user_id = a.owner_user_id
 AND b.relation_type = 'friend'
WHERE a.relation_type = 'friend'
  AND a.owner_user_id < a.target_user_id
  AND NOT EXISTS (
    SELECT 1
    FROM public.community_messenger_friendships f
    WHERE LEAST(f.requester_user_id, f.addressee_user_id) = LEAST(a.owner_user_id, a.target_user_id)
      AND GREATEST(f.requester_user_id, f.addressee_user_id) = GREATEST(a.owner_user_id, a.target_user_id)
  );

-- Accepted from legacy community_friend_requests (pair not yet in friendships)
INSERT INTO public.community_messenger_friendships (
  requester_user_id,
  addressee_user_id,
  status,
  created_at,
  accepted_at,
  updated_at
)
SELECT
  fr.requester_id,
  fr.addressee_id,
  'accepted',
  fr.created_at,
  COALESCE(fr.responded_at, fr.created_at),
  COALESCE(fr.responded_at, fr.created_at)
FROM public.community_friend_requests fr
WHERE fr.status = 'accepted'
  AND NOT EXISTS (
    SELECT 1
    FROM public.community_messenger_friendships f
    WHERE LEAST(f.requester_user_id, f.addressee_user_id) = LEAST(fr.requester_id, fr.addressee_id)
      AND GREATEST(f.requester_user_id, f.addressee_user_id) = GREATEST(fr.requester_id, fr.addressee_id)
  );

-- Pending friend requests
INSERT INTO public.community_messenger_friendships (
  requester_user_id,
  addressee_user_id,
  status,
  created_at,
  updated_at
)
SELECT
  fr.requester_id,
  fr.addressee_id,
  'pending',
  fr.created_at,
  fr.created_at
FROM public.community_friend_requests fr
WHERE fr.status = 'pending'
  AND NOT EXISTS (
    SELECT 1
    FROM public.community_messenger_friendships f
    WHERE LEAST(f.requester_user_id, f.addressee_user_id) = LEAST(fr.requester_id, fr.addressee_id)
      AND GREATEST(f.requester_user_id, f.addressee_user_id) = GREATEST(fr.requester_id, fr.addressee_id)
  );

-- Blocked pairs from user_social_relations (viewer blocked target)
INSERT INTO public.community_messenger_friendships (
  requester_user_id,
  addressee_user_id,
  status,
  blocked_by_user_id,
  blocked_at,
  created_at,
  updated_at
)
SELECT
  sr.owner_user_id,
  sr.target_user_id,
  'blocked',
  sr.owner_user_id,
  sr.created_at,
  sr.created_at,
  sr.updated_at
FROM public.user_social_relations sr
WHERE sr.relation_type = 'blocked'
  AND NOT EXISTS (
    SELECT 1
    FROM public.community_messenger_friendships f
    WHERE LEAST(f.requester_user_id, f.addressee_user_id) = LEAST(sr.owner_user_id, sr.target_user_id)
      AND GREATEST(f.requester_user_id, f.addressee_user_id) = GREATEST(sr.owner_user_id, sr.target_user_id)
  );
