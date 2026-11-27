# F3 회원 토큰 DB 직접 쓰기 잠금 — 설계 (2026-11-27 PHT)

상태: **설계안 — Owner 승인 전. 코드·DB 변경 없음.** 운영 DB 적용은 Owner 별도 승인 대상(개발 프로세스 2번).
근거 감사: `docs/audit/registration-process-contract-audit-2026-11-27.md` §1 F3.
지시 (Owner 2026-11-27): 「F3 설계 작성」.

확인 조건:
- 코드: 운영 배포 `9c5dcd6be`(Vercel Production READY)를 별도 폴더로 꺼내 읽음.
- 운영 DB `ckdosyydvgzqwpbwuhon`: 읽기 전용 조회만 함 (13:40~14:30 PHT).
- 쓰기 시험: 하지 않음.

## 1. 결함 (운영 조회 증거)

### 1-1. 무엇이 열려 있나
- 대상 8개 표 모두 `anon`·`authenticated` 에 `INSERT·UPDATE·DELETE·TRUNCATE` 권한이 있다(`information_schema.role_table_grants`).
- 정책은 「본인 행」만 본다.
- 그래서 회원 토큰(브라우저에 있는 키 + 로그인 토큰)으로 **API 를 거치지 않고** DB(PostgREST)에 바로 쓸 수 있다.
- 그 결과 API 의 동의·가입·차단·잠금·횟수 제한 검사를 모두 건너뛴다.

| # | 표 | 지금 열린 쓰기 정책 (운영 원문 요약) | 회원이 직접 할 수 있는 것 |
|---|---|---|---|
| T1 | `chat_room_participants` | INSERT `user_id = auth.uid()` · UPDATE using `user_id = auth.uid()` (with check 없음) | **아무 거래 채팅방에 자기 자신을 참여자로 추가**. 자기 참여 행의 `room_id` 를 다른 방으로 바꾸기 |
| T2 | `chat_messages` | INSERT 보낸 사람 = 본인 + 그 방 참여자 · UPDATE using 그 방 참여자 (with check 없음) | T1 과 합치면 남의 거래 채팅을 **읽고 보내기**. 같은 방 **상대 메시지의 내용·보낸 사람 고치기** |
| T3 | `trade_appointments` | INSERT 제안자 = 본인 · UPDATE using 그 방 참여자 | 약속 만들기, 상대 약속 고치기 |
| T4 | `community_post_saves` | INSERT·DELETE 본인 | 가입 없이 글 저장 |
| T5 | `job_applications` | INSERT 지원자 = 본인 (INSERT 트리거가 글 지원 수 +1) | 가입·중복 검사 없이 지원, 지원 수 부풀리기 |
| T6 | `store_favorites` | INSERT·DELETE 본인 | 가입 없이 매장 찜 |
| T7 | `ad_payment_requests` | INSERT 본인 | 광고 결제 요청 행 만들기 |
| T8 | `community_friend_favorites` | ALL 본인 | 친구 즐겨찾기 행 만들기 |

보충:
- T1·T2 의 UPDATE 구멍(with check 없음 → 방 옮기기·남의 메시지 고치기)은 감사 보고 뒤 설계 단계에서 새로 찾았다.
- T2 의 대상 데이터는 `chat_messages` 1,907행이다(마지막 2026-11-19).
- 방 id 는 UUID 라서, 공격하려면 방 id 를 알아야 한다.
- 악용 흔적: 방 당사자(구매자·판매자·시작자·상대)가 아닌 참여자 행은 2건(2026-03-31, community 방)뿐이다. T4~T8 의 마지막 행은 모두 11-19 이전이다. 최근 악용은 없다.

### 1-2. 계약
- C2 `registration-action-cta-ssot-design-2026-11-21.md` §4 A: 거래 채팅 전송·약속·저장·지원·찜·광고 신청 = 가입 필요.
- 이 검사는 서버 API(중앙 쓰기 관문)에만 있다. DB 직접 쓰기는 그 관문을 통과하지 않는다.
- 같은 종류의 앞선 결정이 있다:
  - `20270602100000_delivery_owner_p0_store_write_lock.sql`
  - `20270602140000_delivery_owner_1d_client_write_lock.sql` (Owner D-0, 2026-10-20)
  - 원칙: 「앱 쓰기는 전부 service_role 서버 API → 회원·비회원 직접 쓰기 권한과 정책을 회수」. 현재 20개 표가 이 방식으로 잠겨 있다(§3-3).

## 2. 앱 쓰기 경로 전수 (잠가도 깨지지 않는지)

**결론: 대상 8개 표에 쓰는 앱 코드는 모두 서버의 service_role 클라이언트를 쓴다. 회원 토큰으로 쓰는 곳은 0곳이다.**

| 방법 | 결과 |
|---|---|
| `.from("<표>").insert/update/upsert/delete` 전수 스크립트(`app`·`lib`·`components`) | 쓰기 위치 47곳 (chat_rooms 포함), 모두 서버 파일 |
| 각 쓰기 파일·호출처의 클라이언트 | `getSupabaseServer`(`lib/chat/supabase-server.ts:9-16`, service key) · `tryCreateSupabaseServiceClient`(`lib/supabase/try-supabase-server.ts:6-11`) · `resolveServiceSupabaseForApi`(위 둘만 사용) · `tryGetSupabaseForStores`(= `getSupabaseServer`) |
| 회원 토큰 클라이언트(`createSupabaseRouteHandlerClient`·`getSupabaseClient`·`createSupabaseFromRequestForRead`)를 쓰는 116개 파일 중 대상 표를 쓰는 곳 | 0곳 (이름이 나오는 5곳은 모두 다른 표 조회 또는 Realtime 구독) |
| 브라우저 Realtime 구독 (`use-chat-room-realtime.ts`, `use-integrated-chat-room-list-realtime.ts`) | **SELECT 만 쓴다** → 이번 변경에서 SELECT 권한·정책은 그대로 |
| DB 함수 중 대상 표에 쓰는 것 | `sync_open_chat_chat_participant` 1개 — SECURITY DEFINER · 소유자 postgres · 회원 실행 권한 없음 → 영향 없음 |
| 대상 표를 읽는 DB 함수 10개 | 읽기만 함 → 영향 없음 |
| 설치된 앱(구 바이너리) | Capacitor `server.url` 로 운영 웹을 불러옴(`capacitor.config.ts:46-53`). `android`·`ios`·`capacitor-www` 에서 이 표들을 직접 부르는 코드 0건 → 앱 재설치 불필요 |

표별 쓰기 위치 (모두 service_role):
- T1 `chat_room_participants`: `item-trade-chat-start-core.ts:115,396` · `price-offers.server.ts:340,396` · `chat/rooms/[roomId]/{read,hide,leave,reopen}` · `chat/room/[roomId]/read` · `me/chats/mark-all-read` · `chat-room-unread.ts:37` · `mark-trade-chats-read-for-user.ts:65` · `leave-chat-room-orchestration.server.ts:134` · `sync-item-trade-read-with-messenger-room.ts:671`
- T2 `chat_messages`: `chat/rooms/[roomId]/messages/route.ts:330` · `price-offers.server.ts:449` · `insert-seller-listing-change-system-messages.ts:120` · `mirror-community-messenger-text-to-item-trade-ledger.ts:46` · 읽음·숨김 update 7곳(관리자 포함)
- T3 `trade_appointments`: `chat/rooms/[roomId]/appointments/route.ts:65`
- T4 `community_post_saves`: `community/posts/[postId]/save/route.ts:62,93`
- T5 `job_applications`: `posts/[postId]/job-apply/route.ts:87`
- T6 `store_favorites`: `stores/[slug]/favorite/route.ts:48,91`
- T7 `ad_payment_requests`: `lib/ads/post-ads-supabase.ts:374` ← `app/api/ads/apply/route.ts:43,101`
- T8 `community_friend_favorites`: `community-messenger/service.ts:10663,10666,10785,10846` · `social-relations.ts:802`
- 빈 계정 정리(`discard-empty-account.server.ts`)의 삭제 ← `discard-empty-account/route.ts`(service client)

## 3. 변경 — DB 마이그레이션 1개 (웹 코드 변경 없음)

### 3-1. 내용 (앞선 결정과 같은 3단 방식)
1. `REVOKE INSERT, UPDATE, DELETE, TRUNCATE ... FROM anon, authenticated` — 8개 표.
2. 회원 쓰기 정책 삭제(`DROP POLICY`) — 아래 11개. SELECT 정책은 그대로 둔다.
3. 기존 거부 트리거 함수 `public.block_client_role_direct_writes()`(운영에 있음, 20개 표가 사용 중)를 8개 표에 `BEFORE INSERT OR UPDATE OR DELETE` 로 붙인다.
   - 나중에 누가 권한을 다시 줘도 막히게 하는 이중 방어다.
   - service_role 과 SECURITY DEFINER 함수(current_user = postgres)는 통과한다.

### 3-2. 마이그레이션 초안 (`supabase/migrations/20271127200000_f3_client_direct_write_lock.sql`)
```sql
-- F3 client direct write lock (audit 2026-11-27 registration-process-contract-audit F3, design f3-client-direct-write-lock-design-2026-11-27)
-- App writes to these 8 tables are service_role only (design section 2). SELECT grants/policies unchanged (Realtime).
-- Reuses public.block_client_role_direct_writes() (20270602100000). No data change.

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON
  public.chat_room_participants, public.chat_messages, public.trade_appointments,
  public.community_post_saves, public.job_applications, public.store_favorites,
  public.ad_payment_requests, public.community_friend_favorites
FROM anon, authenticated;

DROP POLICY IF EXISTS chat_room_participants_insert ON public.chat_room_participants;
DROP POLICY IF EXISTS chat_room_participants_update ON public.chat_room_participants;
DROP POLICY IF EXISTS chat_messages_insert ON public.chat_messages;
DROP POLICY IF EXISTS chat_messages_update ON public.chat_messages;
DROP POLICY IF EXISTS trade_appointments_insert ON public.trade_appointments;
DROP POLICY IF EXISTS trade_appointments_update ON public.trade_appointments;
DROP POLICY IF EXISTS community_post_saves_insert_own ON public.community_post_saves;
DROP POLICY IF EXISTS community_post_saves_delete_own ON public.community_post_saves;
DROP POLICY IF EXISTS job_applications_insert_own ON public.job_applications;
DROP POLICY IF EXISTS store_favorites_insert_own ON public.store_favorites;
DROP POLICY IF EXISTS store_favorites_delete_own ON public.store_favorites;
DROP POLICY IF EXISTS ad_payment_requests_insert_owner ON public.ad_payment_requests;
-- community_friend_favorites: ALL policy -> replace with SELECT-only (same predicate)
DROP POLICY IF EXISTS community_friend_favorites_own_policy ON public.community_friend_favorites;
CREATE POLICY community_friend_favorites_select_own ON public.community_friend_favorites
  FOR SELECT USING (auth.uid() = user_id);

DO $do$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['chat_room_participants','chat_messages','trade_appointments','community_post_saves',
                           'job_applications','store_favorites','ad_payment_requests','community_friend_favorites']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'trg_' || t || '_block_client_role_writes', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.block_client_role_direct_writes()',
                   'trg_' || t || '_block_client_role_writes', t);
  END LOOP;
END
$do$;
```
- `community_friend_favorites` 의 ALL 정책은 SELECT 까지 함께 허용하고 있다.
  - 지우기만 하면 회원 SELECT 가 막힌다. 이 표는 `supabase_realtime` 발행 대상이라 Realtime 구독에 영향을 줄 수 있다.
  - 그래서 같은 조건의 SELECT 정책으로 바꿔 넣는다(SELECT 범위는 지금과 같음).
- `chat_messages` 도 `supabase_realtime` 발행 대상이다. SELECT 정책 `chat_messages_select` 는 그대로 둔다.
- 함수 본문에 한국어를 넣지 않는다(운영 적용 도구 제약, 앞선 마이그레이션 주석과 같음).

### 3-3. 선례와 같은 점
- 거부 트리거 함수: 운영 소유자 postgres, SECURITY INVOKER, 본문 `current_user IN ('anon','authenticated') → 42501`.
- 지금 사용 중인 20개 표: stores, store_products, user_addresses, store_inquiries, store_settlements, apple_iap_* 등.
- 새 함수는 만들지 않는다.

## 4. 바뀌는 것 / 안 바뀌는 것

| 구분 | 내용 |
|---|---|
| 바뀜 | 회원·비회원 토큰의 이 8개 표 직접 INSERT·UPDATE·DELETE → `42501` 거부 |
| 안 바뀜 | 모든 화면·API 동작(service_role) · 조회·Realtime(SELECT) · DB 함수 · 통화·메신저(`community_messenger_*` 는 대상 아님) · 운영 데이터(삭제·수정 0행) · 앱 바이너리 |
| 운영 요청 수 | 변화 없음 (`docs/request-budget-ssot.md` 예산 무관) |
| 통화 규정 | 통화 코드·통화 API·푸시 미변경. 대상 표 중 통화 표 없음 → 통화 규정 적용 대상 아님 |
| `[배포 구분]` | DB (운영 DB 적용 = Owner 승인). 웹 재시작·앱 재빌드 불필요 |

## 5. 깨질 수 있는 것과 대비
| 위험 | 확인 결과 | 대비 |
|---|---|---|
| 회원 토큰으로 쓰는 숨은 코드 | §2 전수 0곳 | 적용 뒤 §6 실기에서 대표 행동 확인. 실패하면 즉시 롤백 SQL(§7) |
| Realtime 구독 끊김 | 대상 표 SELECT 정책·권한 불변. `community_friend_favorites` 는 회원 화면이 `postgres_changes`(`user_id=eq.<본인>`)로 구독 중(`community-messenger-home-realtime-channels.ts:262-265`) → SELECT 정책을 같은 조건으로 새로 둬 구독 범위 동일 | 적용 직후 친구 목록 즐겨찾기 표시·거래 채팅 실시간 수신 확인 |
| DB 함수 쓰기 실패 | 쓰는 함수 1개 = DEFINER(postgres) → 트리거 통과(현행 20개 표와 같은 원리) | — |
| 이상한 참여자 행 2건(2026-03) | 데이터 변경 범위 밖 | 보고만. 정리는 별도 승인 |

## 6. 검증 (승인 뒤 · 순서 고정)
1. **적용 전 백업(읽기)**: 8개 표의 현재 GRANT·정책 원문을 조회해 PR 에 기록한다(롤백 근거).
2. **운영 적용**: Owner 승인 후 MCP `apply_migration` 1회. 같은 파일을 저장소 `supabase/migrations/` 에 커밋한다.
3. **적용 확인(읽기)**:
   - `has_table_privilege('authenticated'/'anon', …, 'INSERT'/'UPDATE'/'DELETE')` = 모두 false.
   - 남은 정책 = SELECT 만.
   - 트리거 8개 존재.
4. **거부 시험** (Owner 확인 창, `begin; set local role authenticated; set local request.jwt.claims …; insert …; rollback;`):
   - T1 아무 방에 참여자 넣기 → `permission denied` 확인.
   - 롤백이라 남는 행은 0이다.
5. **실기 (Android 1대, 앱 실행 10회 이내, 운영)** — 모두 service_role 경로라 그대로 되는지 확인:
   - 거래 채팅 시작 → 전송 → 약속 → 읽음 → 나가기
   - 가격 제안 수락(방·참여자·시스템 메시지 생성)
   - 필라이프 저장·해제
   - 매장 찜·해제
   - 일자리 지원
   - 친구 즐겨찾기 켜기·끄기(목록 표시)
   - 광고 신청
   - 각 항목마다 운영 DB 에 행이 생겼는지 조회로 대조한다.
6. **보고**: 적용 시각(PHT) · 확인 쿼리 결과 · 실기 PASS/FAIL · 앱 실행 횟수와 예상 요청 수(실행 × 195).

## 7. 롤백 (운영 원문 그대로 복원 · 데이터 변경 없음)
```sql
DO $do$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['chat_room_participants','chat_messages','trade_appointments','community_post_saves',
                           'job_applications','store_favorites','ad_payment_requests','community_friend_favorites']
  LOOP EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'trg_' || t || '_block_client_role_writes', t); END LOOP;
END $do$;
GRANT INSERT, UPDATE, DELETE, TRUNCATE ON public.chat_room_participants, public.chat_messages, public.trade_appointments,
  public.community_post_saves, public.job_applications, public.store_favorites, public.ad_payment_requests,
  public.community_friend_favorites TO anon, authenticated;
DROP POLICY IF EXISTS community_friend_favorites_select_own ON public.community_friend_favorites;
CREATE POLICY community_friend_favorites_own_policy ON public.community_friend_favorites FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY chat_room_participants_insert ON public.chat_room_participants FOR INSERT
  WITH CHECK ((user_id = auth.uid()) OR (EXISTS (SELECT 1 FROM profiles pr WHERE pr.id = auth.uid() AND pr.role = ANY (ARRAY['admin'::text,'master'::text]))));
CREATE POLICY chat_room_participants_update ON public.chat_room_participants FOR UPDATE
  USING ((user_id = auth.uid()) OR (EXISTS (SELECT 1 FROM profiles pr WHERE pr.id = auth.uid() AND pr.role = ANY (ARRAY['admin'::text,'master'::text]))));
CREATE POLICY chat_messages_insert ON public.chat_messages FOR INSERT
  WITH CHECK ((sender_id = auth.uid()) AND (EXISTS (SELECT 1 FROM chat_room_participants p WHERE p.room_id = chat_messages.room_id AND p.user_id = auth.uid())));
CREATE POLICY chat_messages_update ON public.chat_messages FOR UPDATE
  USING ((EXISTS (SELECT 1 FROM chat_room_participants p WHERE p.room_id = chat_messages.room_id AND p.user_id = auth.uid()))
      OR (EXISTS (SELECT 1 FROM profiles pr WHERE pr.id = auth.uid() AND pr.role = ANY (ARRAY['admin'::text,'master'::text]))));
CREATE POLICY trade_appointments_insert ON public.trade_appointments FOR INSERT WITH CHECK (auth.uid() = proposer_id);
CREATE POLICY trade_appointments_update ON public.trade_appointments FOR UPDATE
  USING ((EXISTS (SELECT 1 FROM chat_room_participants p WHERE p.room_id = trade_appointments.room_id AND p.user_id = auth.uid()))
      OR (EXISTS (SELECT 1 FROM profiles pr WHERE pr.id = auth.uid() AND pr.role = ANY (ARRAY['admin'::text,'master'::text]))));
CREATE POLICY community_post_saves_insert_own ON public.community_post_saves FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY community_post_saves_delete_own ON public.community_post_saves FOR DELETE TO authenticated USING (user_id = auth.uid());
CREATE POLICY job_applications_insert_own ON public.job_applications FOR INSERT TO authenticated WITH CHECK (applicant_id = auth.uid());
CREATE POLICY store_favorites_insert_own ON public.store_favorites FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY store_favorites_delete_own ON public.store_favorites FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY ad_payment_requests_insert_owner ON public.ad_payment_requests FOR INSERT WITH CHECK (user_id = auth.uid());
```
- 롤백은 결함을 다시 여는 것이다. 실기 FAIL 로 서비스가 멈췄을 때만 쓰고, 원인을 고친 뒤 다시 적용한다.

## 8. 범위 밖 (보고만)
- 앱이 쓰지 않는 표 10개(`ads`·`chat_requests`·`dibay_items`·`dibay_item_images`·`dibay_item_tags`·`dibay_favorites`·`open_chat_rooms`·`open_chat_members`·`open_chat_join_requests`·`post_likes`)도 같은 형태로 열려 있다.
  - 코드 참조는 0건이다.
  - 그러나 DB 함수 참조가 있다(`ads` 14 · `open_chat_*` 1~5 등). 함수별 확인이 필요해 이번 설계에 넣지 않았다.
- 대상 표들의 `anon` SELECT 권한: SELECT 정책이 `auth.uid()` 를 보므로 지금은 비로그인 조회 0행. 이번 범위 아님.
- 감사 F1·F2·F4·F5 는 별도다.

## 9. PR·반영 순서
1. Owner 「승인」
2. 적용 전 백업 조회(읽기)
3. 운영 DB 적용(Owner 승인 범위)
4. 적용 확인·거부 시험
5. 마이그레이션 파일 + 이 설계 + 감사 문서를 한 PR 로 올린다.
   - `fix/f3-client-direct-write-lock`, 자동 병합 등록.
   - DB 만 바뀌므로 Vercel 빌드에 영향이 없다.
   - 개발 프로세스 1·2번의 「DB 적용이 먼저 필요한 변경」에 해당한다.
6. 실기 확인
7. 보고

## 10. 실행 기록 (Owner 2026-11-27 「승인, 적용 진행」)

| 단계 | 시각 (PHT) | 결과 |
|---|---|---|
| 적용 전 백업(읽기) | 13:17 | 8개 표 GRANT·정책·트리거 원문 = §1·§7 과 일치 (anon·authenticated 모두 INSERT·UPDATE·DELETE·TRUNCATE, 쓰기 정책 13개, 기존 트리거 4개) |
| 운영 적용 | 13:19 | MCP `apply_migration` `f3_client_direct_write_lock` success |
| 적용 확인(읽기) | 13:19:35 | 8개 표 모두 anon·authenticated 쓰기 권한 false · 남은 정책 = SELECT 만(8개) · `trg_<표>_block_client_role_writes` 8개 활성 · service_role INSERT 권한 유지 · authenticated SELECT 유지 |
| 거부 시험 ① | 13:20 | 회원 토큰(`authenticated`, 실제 회원 id)으로 다른 거래 채팅방에 참여자 INSERT → `42501 permission denied for table chat_room_participants` (롤백, 남은 행 0) |
| 거부 시험 ② | 13:21 | 회원 토큰으로 `community_post_saves` DELETE → `42501 permission denied` |
| 서버 경로 시험 | 13:20 | `service_role` 로 같은 참여자 INSERT → 성공(거래 안 행 1), 롤백 → 트리거가 서버 쓰기를 막지 않음 확인 |

작업자 실수: 시험 SQL 첫 2회에 컬럼을 확인하지 않고 써서 `42703`(content 없음)·`23502`(role_in_room 필수) 오류를 냈다. 운영 데이터 변경 없음(둘 다 실패·롤백). 이후 `information_schema.columns` 확인 뒤 재시험.

### 10-1. 시험 중 확인한 사실 (감사 정정 · 범위 밖 결함)
- **감사 F3 문장 정정**: 「회원이 DB 에서 남의 거래 채팅을 직접 읽는다」는 틀렸다.
  - 회원 토큰의 `chat_room_participants`·`chat_messages`·`trade_appointments` SELECT 는 이번 변경 전부터 `42P17 infinite recursion detected in policy for relation "chat_room_participants"` 로 실패한다.
  - 원인: `chat_room_participants_select` 정책이 자기 표를 다시 조회함. 이번 변경에서 손대지 않은 정책이다.
  - 실제 구멍은 이 경로였다: ① DB 에 자기 자신을 참여자로 넣기(INSERT 정책은 자기 표를 조회하지 않아 성공) → ② 앱 API `GET` 거래 채팅 메시지가 참여자 행만 보고 service_role 로 메시지를 돌려줌(`lib/chats/server/load-chat-room-messages.ts:203-232`).
  - 이번 잠금으로 ① 이 막혀 이 경로도 닫혔다.
- **범위 밖 결함 (보고만)**: 위 SELECT 정책 무한 재귀 때문에 회원 토큰으로 거래 채팅 표를 조회하는 기능은 모두 실패한다. 브라우저 Realtime 구독(`use-chat-room-realtime.ts`·`use-integrated-chat-room-list-realtime.ts` 의 `chat_messages`·`chat_room_participants`)이 실제로 이벤트를 받는지는 확인하지 않았다(NOT_PROVEN).
