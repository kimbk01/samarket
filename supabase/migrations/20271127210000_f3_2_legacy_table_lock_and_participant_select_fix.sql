-- F3-2 남은 직접 쓰기 표 10개 잠금 + chat_room_participants_select 무한 재귀 수정 (Owner 2026-11-27 「승인, 적용 진행」)
-- 설계: docs/audit/f3-2-legacy-table-lock-design-2026-11-27.md
-- 근거(운영 롤백 시험 2026-11-27 13:35~13:51 PHT):
--   * 회원 토큰으로 ads·dibay_items·dibay_item_images·dibay_item_tags·dibay_favorites·post_likes·chat_requests·open_chat_rooms 직접 INSERT 성공.
--     앱 코드 사용 0곳. 사진 정리 판정 함수(community_post_image_unreferenced_excluding_posts)가 ads·dibay_items·dibay_item_images·
--     open_chat_rooms 의 사진 주소를 「사용 중」으로 읽어, 회원이 넣은 행이 삭제글 사진 정리를 막을 수 있음.
--   * open_chat_members·open_chat_join_requests 는 함수 실행 권한 누락으로 우연히 실패 중 → 함께 잠금.
--   * chat_room_participants_select 가 자기 표를 다시 조회해 회원 조회가 42P17 로 실패(운영 직접 생성 정책, 저장소에 없음).
-- 유지: 각 표의 SELECT 정책(ALL 정책 3개는 같은 대상·조건의 SELECT 정책으로 교체). DEFINER 함수는 트리거 통과. 데이터 변경 없음.
-- 함수·DO 본문에는 비 ASCII 주석을 넣지 않는다 (운영 적용 도구가 멈춤).
-- 롤백 (적용 직전 13:58 PHT 운영 원문 백업):
--   DO: 10개 표 trg_<표>_block_client_role_writes 삭제
--   GRANT INSERT, UPDATE, DELETE, TRUNCATE ON public.ads, public.chat_requests, public.dibay_items, public.dibay_item_images,
--     public.dibay_item_tags, public.dibay_favorites, public.post_likes, public.open_chat_rooms, public.open_chat_members,
--     public.open_chat_join_requests TO anon, authenticated;
--   DROP POLICY ads_owner_select ON public.ads;
--   CREATE POLICY ads_owner_read_write ON public.ads FOR ALL TO authenticated USING (owner_id = auth.uid()) WITH CHECK (owner_id = auth.uid());
--   CREATE POLICY chat_requests_insert ON public.chat_requests FOR INSERT WITH CHECK (auth.uid() = requester_id);
--   CREATE POLICY chat_requests_update ON public.chat_requests FOR UPDATE USING ((receiver_id = auth.uid()) OR (requester_id = auth.uid()));
--   DROP POLICY dibay_items_owner_select ON public.dibay_items;
--   CREATE POLICY dibay_items_owner_all ON public.dibay_items FOR ALL USING (auth.uid() = seller_id) WITH CHECK (auth.uid() = seller_id);
--   CREATE POLICY dibay_item_images_owner ON public.dibay_item_images FOR ALL
--     USING (EXISTS (SELECT 1 FROM dibay_items i WHERE i.id = dibay_item_images.item_id AND i.seller_id = auth.uid()))
--     WITH CHECK (EXISTS (SELECT 1 FROM dibay_items i WHERE i.id = dibay_item_images.item_id AND i.seller_id = auth.uid()));
--   CREATE POLICY dibay_item_tags_owner ON public.dibay_item_tags FOR ALL
--     USING (EXISTS (SELECT 1 FROM dibay_items i WHERE i.id = dibay_item_tags.item_id AND i.seller_id = auth.uid()))
--     WITH CHECK (EXISTS (SELECT 1 FROM dibay_items i WHERE i.id = dibay_item_tags.item_id AND i.seller_id = auth.uid()));
--   DROP POLICY dibay_favorites_own_select ON public.dibay_favorites;
--   CREATE POLICY dibay_favorites_own ON public.dibay_favorites FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
--   CREATE POLICY post_likes_insert ON public.post_likes FOR INSERT WITH CHECK (auth.uid() = user_id);
--   CREATE POLICY post_likes_delete ON public.post_likes FOR DELETE USING (auth.uid() = user_id);
--   CREATE POLICY open_chat_rooms_insert_owner_v1 ON public.open_chat_rooms FOR INSERT TO authenticated
--     WITH CHECK ((created_by = auth.uid()) AND (owner_user_id = auth.uid()));
--   CREATE POLICY open_chat_rooms_update_manage_v1 ON public.open_chat_rooms FOR UPDATE TO authenticated
--     USING (internal.is_platform_admin(auth.uid()) OR can_manage_open_chat_room(id, auth.uid()))
--     WITH CHECK (internal.is_platform_admin(auth.uid()) OR can_manage_open_chat_room(id, auth.uid()));
--   CREATE POLICY open_chat_members_insert_manage_v1 ON public.open_chat_members FOR INSERT TO authenticated
--     WITH CHECK (internal.is_platform_admin(auth.uid()) OR can_manage_open_chat_room(room_id, auth.uid()));
--   CREATE POLICY open_chat_members_insert_self_v1 ON public.open_chat_members FOR INSERT TO authenticated
--     WITH CHECK ((user_id = auth.uid()) AND (role = 'member'::text));
--   CREATE POLICY open_chat_members_update_self_or_manage_v1 ON public.open_chat_members FOR UPDATE TO authenticated
--     USING ((user_id = auth.uid()) OR internal.is_platform_admin(auth.uid()) OR can_manage_open_chat_room(room_id, auth.uid()))
--     WITH CHECK ((user_id = auth.uid()) OR internal.is_platform_admin(auth.uid()) OR can_manage_open_chat_room(room_id, auth.uid()));
--   CREATE POLICY open_chat_join_requests_insert_self_v1 ON public.open_chat_join_requests FOR INSERT TO authenticated
--     WITH CHECK (user_id = auth.uid());
--   CREATE POLICY open_chat_join_requests_update_self_or_manage_v1 ON public.open_chat_join_requests FOR UPDATE TO authenticated
--     USING ((user_id = auth.uid()) OR internal.is_platform_admin(auth.uid()) OR can_manage_open_chat_room(room_id, auth.uid()))
--     WITH CHECK ((user_id = auth.uid()) OR internal.is_platform_admin(auth.uid()) OR can_manage_open_chat_room(room_id, auth.uid()));
--   DROP POLICY chat_room_participants_select ON public.chat_room_participants;
--   CREATE POLICY chat_room_participants_select ON public.chat_room_participants FOR SELECT
--     USING ((user_id = auth.uid()) OR (EXISTS (SELECT 1 FROM chat_room_participants p2 WHERE p2.room_id = chat_room_participants.room_id
--       AND p2.user_id = auth.uid())) OR (EXISTS (SELECT 1 FROM profiles pr WHERE pr.id = auth.uid() AND pr.role = ANY (ARRAY['admin'::text,'master'::text]))));

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON
  public.ads, public.chat_requests, public.dibay_items, public.dibay_item_images, public.dibay_item_tags,
  public.dibay_favorites, public.post_likes, public.open_chat_rooms, public.open_chat_members, public.open_chat_join_requests
FROM anon, authenticated;

DROP POLICY IF EXISTS ads_owner_read_write ON public.ads;
DROP POLICY IF EXISTS ads_owner_select ON public.ads;
CREATE POLICY ads_owner_select ON public.ads FOR SELECT TO authenticated USING (owner_id = auth.uid());
DROP POLICY IF EXISTS chat_requests_insert ON public.chat_requests;
DROP POLICY IF EXISTS chat_requests_update ON public.chat_requests;
DROP POLICY IF EXISTS dibay_items_owner_all ON public.dibay_items;
DROP POLICY IF EXISTS dibay_items_owner_select ON public.dibay_items;
CREATE POLICY dibay_items_owner_select ON public.dibay_items FOR SELECT USING (auth.uid() = seller_id);
DROP POLICY IF EXISTS dibay_item_images_owner ON public.dibay_item_images;
DROP POLICY IF EXISTS dibay_item_tags_owner ON public.dibay_item_tags;
DROP POLICY IF EXISTS dibay_favorites_own ON public.dibay_favorites;
DROP POLICY IF EXISTS dibay_favorites_own_select ON public.dibay_favorites;
CREATE POLICY dibay_favorites_own_select ON public.dibay_favorites FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS post_likes_insert ON public.post_likes;
DROP POLICY IF EXISTS post_likes_delete ON public.post_likes;
DROP POLICY IF EXISTS open_chat_rooms_insert_owner_v1 ON public.open_chat_rooms;
DROP POLICY IF EXISTS open_chat_rooms_update_manage_v1 ON public.open_chat_rooms;
DROP POLICY IF EXISTS open_chat_members_insert_manage_v1 ON public.open_chat_members;
DROP POLICY IF EXISTS open_chat_members_insert_self_v1 ON public.open_chat_members;
DROP POLICY IF EXISTS open_chat_members_update_self_or_manage_v1 ON public.open_chat_members;
DROP POLICY IF EXISTS open_chat_join_requests_insert_self_v1 ON public.open_chat_join_requests;
DROP POLICY IF EXISTS open_chat_join_requests_update_self_or_manage_v1 ON public.open_chat_join_requests;

DROP POLICY IF EXISTS chat_room_participants_select ON public.chat_room_participants;
CREATE POLICY chat_room_participants_select ON public.chat_room_participants FOR SELECT
  USING ((user_id = auth.uid())
    OR (EXISTS (SELECT 1 FROM profiles pr WHERE pr.id = auth.uid() AND pr.role = ANY (ARRAY['admin'::text, 'master'::text]))));

DO $do$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ads','chat_requests','dibay_items','dibay_item_images','dibay_item_tags','dibay_favorites',
                           'post_likes','open_chat_rooms','open_chat_members','open_chat_join_requests']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'trg_' || t || '_block_client_role_writes', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.block_client_role_direct_writes()',
                   'trg_' || t || '_block_client_role_writes', t);
  END LOOP;
END
$do$;
