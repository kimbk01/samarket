-- v4 W5 · DB-07 (2026-10-29 PHT) — 정확한 중복 인덱스 정리 (제약과 연결되지 않은 비고유 인덱스만 삭제).
--
-- 선정 기준 (운영 pg_index READ ONLY 조회, 2026-10-29):
--   같은 테이블 · 같은 컬럼/식(indkey·indexprs) · 같은 opclass·정렬옵션(indoption)·collation · 같은 부분조건(indpred)
--   · 같은 접근법(btree) 인 인덱스 쌍. 그중 삭제 대상은
--     (1) pg_constraint 에 연결되지 않고 (PK/UNIQUE/EXCLUDE 제약 인덱스 아님)
--     (2) UNIQUE 가 아닌 인덱스 뿐이다.
--   남기는 쪽: 제약(PK/UNIQUE) 인덱스 또는 UNIQUE 인덱스가 있으면 그것, 둘 다 일반 인덱스면 idx_scan 이 많은 쪽
--   (둘 다 0 이면 이름이 테이블·컬럼 규칙을 따르는 쪽).
--   제외: 고유 인덱스끼리의 중복 2쌍(store_categories slug 2개, community_messenger_friendships pair 2개) —
--   UNIQUE 의미를 가진 인덱스는 이번 정리 대상이 아님.
--
-- 안전장치: 쌍마다 남길 인덱스가 존재하고 두 정의(이름·UNIQUE 표기 제외)가 지금도 같을 때만 DROP.
--   한 쌍이라도 조건이 다르면 그 쌍은 건너뛰고 NOTICE. 앱·스크립트 코드에서 삭제 대상 인덱스 이름 참조 0건(grep).
--   테이블이 작아(최대 수만 행) 일반 DROP INDEX 의 잠금 시간은 짧다 (CONCURRENTLY 는 트랜잭션 밖이라 미사용).
--
-- 표 (삭제 | 남김 | 남김 근거):
--   admin_staff_permissions_user_idx                      | admin_staff_permissions_pkey                          | PK (user_id)
--   business_cash_ledger_store_idx                        | business_cash_ledger_store_created_idx                | 일반 · 사용 29 vs 0
--   idx_category_settings_category_id                     | category_settings_category_id_key                     | UNIQUE 제약
--   chat_rooms_meeting_id_idx                             | chat_rooms_meeting_id_unique                          | UNIQUE (부분, 동일 조건)
--   idx_chat_rooms_related_community_post                 | chat_rooms_related_community_post_id_idx              | 일반 · 둘 다 0 · 이름 규칙
--   community_messenger_messages_room_sender_client_msg_id_idx | uq_cm_messages_room_sender_client_message_id     | UNIQUE (부분, 동일 식·조건)
--   community_messenger_room_profiles_room_idx            | community_messenger_room_profiles_room_id_user_id_key | UNIQUE 제약
--   idx_community_sections_active_order                   | idx_community_sections_active_sort                    | 일반 · 둘 다 0
--   delivery_ad_ops_threads_case_idx                      | delivery_ad_operations_threads_case_id_key            | UNIQUE 제약 (사용 1034 → 제약 인덱스로 이동)
--   delivery_riders_user_id_idx                           | delivery_riders_user_id_key                           | UNIQUE 제약
--   idx_feed_ad_creatives_campaign                        | feed_ad_creatives_campaign_id_sort_order_key          | UNIQUE 제약
--   gift_certificate_ownership_events_instance_idx        | gift_certificate_ownership_events_instance_seq_uq     | UNIQUE 제약
--   meeting_chat_participants_user_idx                    | meeting_chat_participants_user_id_idx                 | 일반 · 둘 다 0 · 이름 규칙
--   meeting_chat_participants_room_idx                    | meeting_chat_participants_room_id_idx                 | 일반 · 둘 다 0 · 이름 규칙
--   idx_point_promotion_orders_domain_created             | point_promotion_orders_domain_created_idx             | 일반 · 둘 다 0
--   idx_product_chat_messages_created                     | idx_product_chat_messages_room_created                | 일반 · 둘 다 0 · 이름이 컬럼과 일치
--   idx_product_chats_post_seller_buyer                   | product_chats_post_id_seller_id_buyer_id_key          | UNIQUE 제약
--   profiles_provider_user_id_idx                         | profiles_provider_user_id_unique_idx                  | UNIQUE (부분, 동일 조건)
--   idx_sanctions_active                                  | idx_sanctions_user_end                                | 일반 · 둘 다 0 · 이름이 컬럼과 일치
--   idx_services_slug                                     | services_slug_key                                     | UNIQUE 제약
--   idx_store_inquiries_store                             | idx_store_inquiries_store_created_desc                | 일반 · 둘 다 0 · 이름이 컬럼과 일치
--   idx_store_order_items_order                           | idx_store_order_items_order_id                        | 일반 · 사용 17465 vs 0
--   idx_store_orders_store                                | idx_store_orders_store_created_desc                   | 일반 · 사용 15275 vs 0
--   idx_store_orders_buyer                                | idx_store_orders_buyer_created                        | 일반 · 사용 8771 vs 0
--   idx_store_settlements_store                           | idx_store_settlements_store_created_at                | 일반 · 사용 37 vs 0
--   idx_stores_category_topic                             | stores_browse_main_idx                                | 일반 · 사용 1615 vs 0
--   idx_trade_categories_slug                             | trade_categories_slug_key                             | UNIQUE 제약
--   users_provider_provider_id_idx                        | users_provider_provider_id_unique                     | UNIQUE 제약
--
-- 롤백: 삭제 인덱스 재생성 (운영 정의 그대로)
--   CREATE INDEX IF NOT EXISTS admin_staff_permissions_user_idx ON public.admin_staff_permissions USING btree (user_id);
--   CREATE INDEX IF NOT EXISTS business_cash_ledger_store_idx ON public.business_cash_ledger USING btree (store_id, created_at DESC);
--   CREATE INDEX IF NOT EXISTS idx_category_settings_category_id ON public.category_settings USING btree (category_id);
--   CREATE INDEX IF NOT EXISTS chat_rooms_meeting_id_idx ON public.chat_rooms USING btree (meeting_id) WHERE (meeting_id IS NOT NULL);
--   CREATE INDEX IF NOT EXISTS idx_chat_rooms_related_community_post ON public.chat_rooms USING btree (related_community_post_id) WHERE (related_community_post_id IS NOT NULL);
--   CREATE INDEX IF NOT EXISTS community_messenger_messages_room_sender_client_msg_id_idx ON public.community_messenger_messages USING btree (room_id, sender_id, ((metadata ->> 'client_message_id'::text))) WHERE (((metadata ->> 'client_message_id'::text) IS NOT NULL) AND (btrim((metadata ->> 'client_message_id'::text)) <> ''::text));
--   CREATE INDEX IF NOT EXISTS community_messenger_room_profiles_room_idx ON public.community_messenger_room_profiles USING btree (room_id, user_id);
--   CREATE INDEX IF NOT EXISTS idx_community_sections_active_order ON public.community_sections USING btree (is_active, sort_order);
--   CREATE INDEX IF NOT EXISTS delivery_ad_ops_threads_case_idx ON public.delivery_ad_operations_threads USING btree (case_id);
--   CREATE INDEX IF NOT EXISTS delivery_riders_user_id_idx ON public.delivery_riders USING btree (user_id);
--   CREATE INDEX IF NOT EXISTS idx_feed_ad_creatives_campaign ON public.feed_ad_creatives USING btree (campaign_id, sort_order);
--   CREATE INDEX IF NOT EXISTS gift_certificate_ownership_events_instance_idx ON public.gift_certificate_ownership_events USING btree (instance_id, seq);
--   CREATE INDEX IF NOT EXISTS meeting_chat_participants_user_idx ON public.meeting_chat_participants USING btree (user_id);
--   CREATE INDEX IF NOT EXISTS meeting_chat_participants_room_idx ON public.meeting_chat_participants USING btree (room_id);
--   CREATE INDEX IF NOT EXISTS idx_point_promotion_orders_domain_created ON public.point_promotion_orders USING btree (domain, created_at DESC);
--   CREATE INDEX IF NOT EXISTS idx_product_chat_messages_created ON public.product_chat_messages USING btree (product_chat_id, created_at);
--   CREATE INDEX IF NOT EXISTS idx_product_chats_post_seller_buyer ON public.product_chats USING btree (post_id, seller_id, buyer_id);
--   CREATE INDEX IF NOT EXISTS profiles_provider_user_id_idx ON public.profiles USING btree (provider, provider_user_id) WHERE (provider_user_id IS NOT NULL);
--   CREATE INDEX IF NOT EXISTS idx_sanctions_active ON public.sanctions USING btree (user_id, end_at);
--   CREATE INDEX IF NOT EXISTS idx_services_slug ON public.services USING btree (slug);
--   CREATE INDEX IF NOT EXISTS idx_store_inquiries_store ON public.store_inquiries USING btree (store_id, created_at DESC);
--   CREATE INDEX IF NOT EXISTS idx_store_order_items_order ON public.store_order_items USING btree (order_id);
--   CREATE INDEX IF NOT EXISTS idx_store_orders_store ON public.store_orders USING btree (store_id, created_at DESC);
--   CREATE INDEX IF NOT EXISTS idx_store_orders_buyer ON public.store_orders USING btree (buyer_user_id, created_at DESC);
--   CREATE INDEX IF NOT EXISTS idx_store_settlements_store ON public.store_settlements USING btree (store_id, created_at DESC);
--   CREATE INDEX IF NOT EXISTS idx_stores_category_topic ON public.stores USING btree (store_category_id, store_topic_id) WHERE ((approval_status = 'approved'::text) AND (is_visible = true));
--   CREATE INDEX IF NOT EXISTS idx_trade_categories_slug ON public.trade_categories USING btree (slug);
--   CREATE INDEX IF NOT EXISTS users_provider_provider_id_idx ON public.users USING btree (provider, provider_id);

-- 2026-10-29 Claude 검토: 도메인 혼합 금지(AGENTS.md)에 따라 매장·배달 테이블 인덱스만 남김. 제외: admin_staff_permissions_user_idx, idx_category_settings_category_id, chat_rooms_meeting_id_idx, idx_chat_rooms_related_community_post, community_messenger_messages_room_sender_client_msg_id_idx, community_messenger_room_profiles_room_idx, idx_community_sections_active_order, idx_feed_ad_creatives_campaign, gift_certificate_ownership_events_instance_idx, meeting_chat_participants_user_idx, meeting_chat_participants_room_idx, idx_point_promotion_orders_domain_created, idx_product_chat_messages_created, idx_product_chats_post_seller_buyer, profiles_provider_user_id_idx, idx_sanctions_active, idx_services_slug, idx_trade_categories_slug, users_provider_provider_id_idx
DO $db07$
DECLARE
  v_pair text[];
  v_drop_oid oid;
  v_keep_oid oid;
  v_drop_def text;
  v_keep_def text;
  v_dropped int := 0;
  v_skipped int := 0;
  v_pairs text[][] := ARRAY[
    ARRAY['business_cash_ledger_store_idx', 'business_cash_ledger_store_created_idx'],
    ARRAY['delivery_ad_ops_threads_case_idx', 'delivery_ad_operations_threads_case_id_key'],
    ARRAY['delivery_riders_user_id_idx', 'delivery_riders_user_id_key'],
    ARRAY['idx_store_inquiries_store', 'idx_store_inquiries_store_created_desc'],
    ARRAY['idx_store_order_items_order', 'idx_store_order_items_order_id'],
    ARRAY['idx_store_orders_store', 'idx_store_orders_store_created_desc'],
    ARRAY['idx_store_orders_buyer', 'idx_store_orders_buyer_created'],
    ARRAY['idx_store_settlements_store', 'idx_store_settlements_store_created_at'],
    ARRAY['idx_stores_category_topic', 'stores_browse_main_idx']
  ];
BEGIN
  FOREACH v_pair SLICE 1 IN ARRAY v_pairs
  LOOP
    v_drop_oid := to_regclass('public.' || quote_ident(v_pair[1]));
    v_keep_oid := to_regclass('public.' || quote_ident(v_pair[2]));
    IF v_drop_oid IS NULL THEN
      CONTINUE; -- 이미 없음 (멱등)
    END IF;
    IF v_keep_oid IS NULL THEN
      RAISE NOTICE 'DB-07 skip %: keep index % missing', v_pair[1], v_pair[2];
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;
    -- 삭제 대상은 제약 비연결 · 비고유여야 한다.
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conindid = v_drop_oid)
       OR EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = v_drop_oid AND (indisunique OR indisprimary)) THEN
      RAISE NOTICE 'DB-07 skip %: constraint-backed or unique', v_pair[1];
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;
    v_drop_def := regexp_replace(pg_get_indexdef(v_drop_oid), '^CREATE (UNIQUE )?INDEX \S+ ON ', 'CREATE INDEX _ ON ');
    v_keep_def := regexp_replace(pg_get_indexdef(v_keep_oid), '^CREATE (UNIQUE )?INDEX \S+ ON ', 'CREATE INDEX _ ON ');
    IF v_drop_def IS DISTINCT FROM v_keep_def THEN
      RAISE NOTICE 'DB-07 skip %: definition differs from %', v_pair[1], v_pair[2];
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;
    EXECUTE format('DROP INDEX IF EXISTS public.%I', v_pair[1]);
    v_dropped := v_dropped + 1;
  END LOOP;
  RAISE NOTICE 'DB-07 duplicate indexes dropped=% skipped=%', v_dropped, v_skipped;
END;
$db07$;
