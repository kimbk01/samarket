# F3-2 남은 직접 쓰기 표 10개 잠금 + 채팅 참여자 조회 정책 재귀 수정 — 설계 (2026-11-27 PHT)

상태: **설계안 — 운영 DB 적용은 Owner 승인 대상.** F3(PR #654, 운영 적용 13:19 PHT, 병합 완료)에서 범위 밖으로 남긴 항목을 증거로 확인한 결과.
지시 (Owner 2026-11-27): 「남은 위험, 확인 안됨 … 정확한 원인과 결함을 증거로 확인」.
확인 조건:
- 코드: 운영 main `7c5b6e33f` (#654 병합 후).
- 운영 DB `ckdosyydvgzqwpbwuhon`: 조회와 **롤백 거래 시험**만 함 (13:35~13:51 PHT). 운영 데이터 변경 0행(시험 뒤 조회로 확인).

## 1. F3 대상 8개 표 — 서버 쓰기 전부 시험 (F3 실기 NOT_PROVEN 해소)

`set local role service_role`(앱 서버 키와 같은 역할)로, 실제 앱이 쓰는 형태 그대로 한 거래 안에서 실행한 뒤 롤백했다.

| 앱 기능 | 쓰기 | 결과 |
|---|---|---|
| 거래 채팅 전송 | `chat_messages` INSERT | 통과 (1행) |
| 거래 약속 | `trade_appointments` INSERT | 통과 |
| 일자리 지원 | `job_applications` INSERT (+ 지원 수 트리거) | 통과 |
| 광고 신청 | `post_ads` → `ad_payment_requests` INSERT | 통과 |
| 친구 즐겨찾기 켜기·끄기 | `community_friend_favorites` INSERT·DELETE | 통과 (끝 0행) |
| 읽음·나가기 등 | `chat_room_participants` UPDATE | 통과 |
| 가격 제안 수락의 참여자 생성 | `chat_room_participants` INSERT (13:20 시험) | 통과 |
| 매장 찜·글 저장 켜기·끄기 | 실기 앱 API (13:24, F3 §10-2) | 200 · 운영 DB 행 생성·삭제 확인 |

- 롤백 뒤 운영 조회(13:51): 시험 계정의 메시지·약속·지원·광고·참여자·즐겨찾기 모두 0행, `post_ads`·`ad_payment_requests` 전체 0행.
- 결론: F3 잠금은 앱 서버 쓰기를 막지 않는다(거부 트리거는 `current_user` 가 anon·authenticated 일 때만 거부).

## 2. 결함 A — 앱이 쓰지 않는 표 8개는 지금도 회원 토큰으로 직접 쓸 수 있다

회원 토큰(`set local role authenticated` + 실제 회원 id)으로 롤백 시험한 결과:

| 표 | 회원 직접 쓰기 | 근거 |
|---|---|---|
| `ads` | **됨** (1행) | 정책 `ads_owner_read_write` ALL `owner_id = auth.uid()` |
| `dibay_items` | **됨** | `dibay_items_owner_all` |
| `dibay_item_images` | **됨** | `dibay_item_images_owner` (내 dibay_items 이면) |
| `dibay_item_tags` | **됨** | `dibay_item_tags_owner` |
| `dibay_favorites` | **됨** | `dibay_favorites_own` |
| `post_likes` | **됨** | `post_likes_insert` |
| `chat_requests` | **됨** (상대 지정 요청 행) | `chat_requests_insert` |
| `open_chat_rooms` | **됨** (아무 거래 채팅방을 `linked_chat_room_id` 로 지정 가능) | `open_chat_rooms_insert_owner_v1` |
| `open_chat_members` | 실패 `42501 permission denied for function can_manage_open_chat_room` | 정책 함수 실행 권한 없음 |
| `open_chat_join_requests` | 실패 `42501 permission denied for function refresh_open_chat_room_stats` | 트리거 함수 실행 권한 없음 |

- 실제 영향(증거):
  - 앱 코드는 이 10개 표를 읽지도 쓰지도 않는다. 표 이름 문자열 전수 검색에서 권한 이름·문구만 나왔다. 그래서 화면에는 나오지 않는다.
  - 다만 사진 정리 판정 함수 `community_post_image_unreferenced_excluding_posts`(DEFINER)가 `ads.image_url`·`ads.mobile_image_url`·`dibay_item_images.image_url`·`dibay_items.thumbnail_url`·`open_chat_rooms` 를 「사진 사용 중」 근거로 읽는다.
  - 따라서 회원이 이 표에 사진 주소를 넣으면 **삭제된 글 사진의 30일 정리가 그 사진을 지우지 않는다.**
  - 그 밖에는 운영 DB 에 쓸모없는 행을 쌓을 수 있다.
- `open_chat_members` 로 F3 를 우회하는 경로(가입 → DEFINER `sync_open_chat_chat_participant` 가 `chat_room_participants` 추가)는 위 함수 권한 때문에 **지금은 막혀 있다**(시험으로 확인). 그러나 막힌 이유가 우연(권한 누락)이라 함께 잠근다.
- 운영 행 수: ads 0 · dibay_* 0 · post_likes 0 · chat_requests 0 · open_chat_rooms 6 · open_chat_members 6 · join_requests 0. 악용 흔적은 없다.

## 3. 결함 B — `chat_room_participants_select` 정책 무한 재귀 (운영 직접 생성, 저장소에 없음)

- 원문(운영): `USING ((user_id = auth.uid()) OR EXISTS (SELECT 1 FROM chat_room_participants p2 WHERE p2.room_id = chat_room_participants.room_id AND p2.user_id = auth.uid()) OR <관리자>)`
  - 자기 표를 다시 조회해서 회원 토큰 조회가 모두 `42P17 infinite recursion` 으로 실패한다(13:21 시험).
- 저장소 `supabase/migrations` 전체에 이 정책 이름이 없다 → 운영에서 직접 만든 정책이다.
- 같은 표를 조회하는 `chat_messages_select`·`chat_rooms_select_participant`·`trade_appointments_select` 도 함께 실패한다(13:20 `chat_messages` UPDATE 시험이 이 오류로 실패).
- 영향 범위(증거):
  - 회원 토큰으로 이 표들을 읽는 코드는 2곳이다.
    - `use-chat-room-realtime.ts` integrated 모드(`chat_messages` 실시간 구독, `ChatDetailView.tsx:711`)
    - `use-integrated-chat-room-list-realtime.ts`(테스트 외 사용처 0곳 = 미사용)
  - `ChatDetailView` integrated 모드에 닿는 방은 거래 방이 아닌 예전 방뿐이다. 거래 방은 서버에서 메신저로 보낸다(`app/(main)/chats/[roomId]/page.tsx:67-78`).
  - 운영의 그런 방: `community` 6 · `general_chat` 6 · `store_order` 5. 마지막 메시지는 2026-04-01 이고 최근 14일 메시지는 0건이다.
  - → 예전 방 17개의 실시간 수신이 동작하지 않는다. 지금 쓰는 사람은 없다.
- 수정: 다른 참여자를 보는 절(재귀 원인)을 뺀다.
  - 회원 토큰으로 다른 참여자 행을 읽는 코드는 0곳이다. 구독 필터도 `user_id=eq.<본인>` 이다.
  - 자기 행 조회만 남기면 `chat_messages_select` 등의 `EXISTS(본인 참여 행)` 판정이 정상 동작한다.

## 4. 변경 — DB 마이그레이션 1개 (웹 코드 변경 없음)

`supabase/migrations/20271127210000_f3_2_legacy_table_lock_and_participant_select_fix.sql`:
```sql
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON
  public.ads, public.chat_requests, public.dibay_items, public.dibay_item_images, public.dibay_item_tags,
  public.dibay_favorites, public.post_likes, public.open_chat_rooms, public.open_chat_members, public.open_chat_join_requests
FROM anon, authenticated;

DROP POLICY IF EXISTS ads_owner_read_write ON public.ads;
CREATE POLICY ads_owner_select ON public.ads FOR SELECT TO authenticated USING (owner_id = auth.uid());
DROP POLICY IF EXISTS chat_requests_insert ON public.chat_requests;
DROP POLICY IF EXISTS chat_requests_update ON public.chat_requests;
DROP POLICY IF EXISTS dibay_items_owner_all ON public.dibay_items;
CREATE POLICY dibay_items_owner_select ON public.dibay_items FOR SELECT USING (auth.uid() = seller_id);
DROP POLICY IF EXISTS dibay_item_images_owner ON public.dibay_item_images;
DROP POLICY IF EXISTS dibay_item_tags_owner ON public.dibay_item_tags;
DROP POLICY IF EXISTS dibay_favorites_own ON public.dibay_favorites;
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
  USING ((user_id = auth.uid()) OR (EXISTS (SELECT 1 FROM profiles pr WHERE pr.id = auth.uid() AND pr.role = ANY (ARRAY['admin'::text,'master'::text]))));

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
```
- ALL 정책 3개(`ads` authenticated · `dibay_items` · `dibay_favorites`)는 SELECT 를 함께 허용하고 있었다. 그래서 같은 대상·조건의 SELECT 정책으로 바꿔 조회 범위를 그대로 둔다.
- `dibay_item_images`·`dibay_item_tags`·`dibay_items` 는 따로 있는 SELECT 정책(`*_select`·`dibay_items_public_select`)이 남는다(운영 조회 13:55).
- 나머지 표의 SELECT 정책은 손대지 않는다.
- DEFINER 함수 `refresh_open_chat_room_stats`·`sync_open_chat_chat_participant`(소유자 postgres)는 트리거를 통과한다. 회원에게 실행 권한이 없는 것도 지금과 같다.

## 5. 검증 (적용 뒤)
1. 적용 전 백업: 10개 표 GRANT·정책 원문 + `chat_room_participants_select` 원문(§3).
2. 적용 확인: 쓰기 권한 false · 남은 정책 SELECT 만 · 트리거 10개.
3. 롤백 시험 — 회원 토큰:
   - `ads`·`dibay_items`·`post_likes`·`open_chat_rooms` INSERT → 42501
   - `chat_room_participants` 조회 → **재귀 오류 없이 본인 행만**
   - `chat_messages` 조회 → 본인 참여 방만
4. 롤백 시험 — service_role: 같은 INSERT → 통과.
5. 운영 Postgres 오류 기록: 적용 뒤 시험 외 오류가 0건인지 확인.

## 6. 롤백
- 적용 전 백업한 원문으로 정책·GRANT 를 복원하고 트리거 10개를 삭제한다. 복원 SQL 은 적용 직전 백업 결과로 PR 에 기록한다.

## 7. 실행 기록 (Owner 2026-11-27 「승인, 적용 진행」)

| 단계 | 시각 (PHT) | 결과 |
|---|---|---|
| 적용 전 백업 | 13:53 | 10개 표 GRANT(anon·authenticated 쓰기 전부) · 쓰기 정책 16개 · `chat_room_participants_select` 원문 → 마이그레이션 파일 롤백 주석에 그대로 기록 |
| 운영 적용 | 13:54 | `apply_migration f3_2_legacy_table_lock_and_participant_select_fix` success |
| 적용 확인 | 13:54:32 | 11개 표 모두 anon·authenticated 쓰기 false · 남은 정책은 SELECT 만 · 트리거 10개 활성(+ F3 의 participants 트리거) · service_role INSERT 유지 |
| 회원 거부 시험 | 13:54:43~57 | `ads`·`open_chat_rooms`(남의 거래 채팅방 연결)·`post_likes`·`dibay_items` INSERT → 모두 `42501 permission denied` |
| 재귀 해소 시험 | 13:55 | 거래 채팅 참여자 회원(`78d2a8bc`) 토큰 조회: 참여 행 9 · 메시지 2 · 방 9 = service_role 로 센 기대값 9·2·9 와 같음, 오류 없음 (이전 42P17) |
| 남의 방 차단 시험 | 13:55 | 비참여 회원(`edc8c2f0`) 토큰으로 방 `b25a108b` 참여자·메시지·방 조회 → 0·0·0 |
| 서버 통과 시험 | 13:55 | service_role 로 `ads`·`post_likes`·`chat_requests` INSERT → 성공, 롤백 |
| 운영 오류 기록 | 13:53~13:56 | 거부 오류 4건 = 모두 작업자 거부 시험 시각. 그 밖 오류 0건 |
