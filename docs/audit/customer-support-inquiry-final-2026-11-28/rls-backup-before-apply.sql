-- 운영(ckdosyydvgzqwpbwuhon) 적용 전 정의 — 2026-11-28 PHT 조회 (pg_policies). 되돌리기는 이 정의로 DROP 후 CREATE.
-- internal.support_admin_has_support_permission: 적용 전 없음 · 인덱스 2개: 적용 전 없음
CREATE POLICY support_cases_admin_select ON public.support_cases FOR SELECT TO authenticated USING (internal.is_platform_admin(auth.uid()));
CREATE POLICY support_cases_requester_select ON public.support_cases FOR SELECT TO authenticated USING (((requester_user_id = auth.uid()) AND ((audience = 'MEMBER'::text) OR ((audience = 'OWNER'::text) AND (owner_store_id IS NOT NULL) AND (EXISTS ( SELECT 1 FROM stores s WHERE ((s.id = support_cases.owner_store_id) AND (s.owner_user_id = auth.uid()))))))));
CREATE POLICY support_messages_admin_select ON public.support_messages FOR SELECT TO authenticated USING (internal.is_platform_admin(auth.uid()));
CREATE POLICY support_messages_requester_select ON public.support_messages FOR SELECT TO authenticated USING (((message_type = 'PUBLIC'::text) AND (EXISTS ( SELECT 1 FROM support_cases c WHERE ((c.id = support_messages.case_id) AND (c.requester_user_id = auth.uid()) AND ((c.audience = 'MEMBER'::text) OR ((c.audience = 'OWNER'::text) AND (c.owner_store_id IS NOT NULL) AND (EXISTS ( SELECT 1 FROM stores s WHERE ((s.id = c.owner_store_id) AND (s.owner_user_id = auth.uid())))))))))));
CREATE POLICY support_sessions_admin_select ON public.support_sessions FOR SELECT TO authenticated USING (internal.is_platform_admin(auth.uid()));
CREATE POLICY support_sessions_requester_select ON public.support_sessions FOR SELECT TO authenticated USING ((requester_user_id = auth.uid()));
CREATE POLICY support_case_events_admin_select ON public.support_case_events FOR SELECT TO authenticated USING (internal.is_platform_admin(auth.uid()));
