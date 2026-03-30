# 필라이프 — 구조 및 테스트

## 이번 구조 목표 매핑

- 거래 기능/기존 채팅 스키마를 바꾸지 않고 필라이프만 동네 기반으로 분리
- 게시판형 경로 대신 `/philife` 중심 피드/상세/모임 구조 사용
- 친구 기능 없이 `neighbor_follow`(관심이웃), `blocked`(차단)만 사용
- meetup 글은 `meetings` + `group_meeting` 채팅방으로 연결
- 샘플 데이터는 `is_sample_data` 플래그로 추후 일괄 삭제 가능

## 라우트

| 경로 | 설명 |
|------|------|
| `/philife` | 필라이프 피드 (지역·카테고리 필터) |
| `/philife/write` | 글쓰기 |
| `/philife/[postId]` | 글 상세 (UUID) |
| `/philife/post/[postId]` | 레거시 — `/philife/[postId]` 로 리다이렉트 |
| `/philife/meetings/[meetingId]` | 모임 상세 |
| `/philife/my` | 내 글·모임 |

### 관리자 라우트

| 경로 | 설명 |
|------|------|
| `/admin/philife` | 글 관리 (상태/신고 플래그) |
| `/admin/philife/reports` | 신고 처리 |
| `/admin/philife/meetings` | 모임 상태·정원·채팅 연동 점검 |

## DB

0. **`meetings` 없음 오류:** 먼저 `supabase/scripts/SQL-적용순서.txt` 대로 마이그레이션 적용. 샘플만 단독 실행하면 안 됩니다.
1. Supabase에 `supabase/migrations` 전체 적용 (기존 커뮤니티 v2 이후).
2. 당근형 모임방 운영 구조까지 올리려면 `20260329143000_philife_meeting_room_upgrade.sql` 추가 적용.
   - 비밀번호/승인제/초대제
   - 공지/가입요청/모임단위 차단/운영로그
   - 멤버 상태와 모임 채팅 participant 최소 동기화
3. **붙여넣기 한 번에:** `supabase/scripts/paste-dangnae-community-sample.sql` (선행 테이블 검사 후 플래그 + 샘플 시드).
4. 또는 마이그레이션 파일 분리 적용:  
   - `20260328100000_dangnae_community_sample_flags.sql`  
   - `20260328110000_dangnae_karrot_sample_seed.sql`  
   - 전제: `profiles` 최소 1명, `community_sections(dongnae)`, 해당 `community_topics` 슬러그.
   - 지역 4곳 + 글 10개 + 모임 2개(삼겹살·농구) + `room_type = group_meeting` 채팅 및 `chat_room_participants` 동기화.

**샘플 제거(예시 SQL)**

```sql
BEGIN;
DELETE FROM public.community_posts WHERE is_sample_data = true;
DELETE FROM public.meetings WHERE is_sample_data = true;
DELETE FROM public.locations WHERE is_sample_data = true;
COMMIT;
```

(외래키·CASCADE에 따라 실행 순서·정책은 운영 DB에 맞게 조정.)

## 컴포넌트 별칭

`components/community/` 아래 `Feed.tsx`, `Card.tsx`, `WriteForm.tsx`, `Detail.tsx`, `LikeButton.tsx`, `CategoryBadge.tsx`, `LocationBadge.tsx` 및 `meeting/*` 는 기존 구현에 대한 얇은 export 레이어입니다.

## 모임 종료와 채팅

`/api/community/meetings/[id]/close` 호출 시 모임 `status = ended` 와 함께 연결된 `chat_rooms.is_readonly = true` 로 설정되어, 메시지 API에서 읽기 전용 동작을 따릅니다.

## 채팅 멤버 테이블명

스펙 문서의 `chat_room_members` 는 이 프로젝트에서 **`chat_room_participants`** 로 구현되어 있습니다. 거래·매장 채팅 등 기존 스키마를 바꾸지 않습니다.

## 수동 테스트 체크리스트

1. 지역 설정 후 `/philife` 에서 피드 로드 (해당 `location_id` 글만).
2. 글쓰기 → 저장 후 `/philife/{uuid}` 로 이동하는지.
3. meetup 글 → `meetings` 행·`group_meeting` 채팅 생성 여부(개발자 도구·DB).
4. 모임 참여 → `chat_room_participants` 에 행 추가, 채팅 입장.
5. 모임 나가기·강퇴 API 동작.
6. 관리자 `/admin/philife`, `/admin/philife/reports`, `/admin/philife/meetings`.
7. `/api/community/meetings/[meetingId]/members` 는 로그인 + (호스트 또는 참여자)일 때만 조회되는지.
