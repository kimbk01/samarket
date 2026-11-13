# 필라이프 — 구조 및 테스트

## 이번 구조 목표 매핑

- 거래 기능/기존 채팅 스키마를 바꾸지 않고 필라이프만 동네 기반으로 분리
- 게시판형 경로 대신 `/philife` 중심 피드/상세 구조 사용
- 친구 기능 없이 `neighbor_follow`(관심이웃), `blocked`(차단)만 사용
- 옛 모임(meetup 글·`meetings`·`group_meeting` 채팅)은 2026-11-12 Owner 지시로 삭제됨. 신규 모임은 `docs/design/moim/moim-design-v1-2026-11-12.md`
- 샘플 데이터는 `is_sample_data` 플래그로 추후 일괄 삭제 가능

## 라우트

| 경로 | 설명 |
|------|------|
| `/philife` | 필라이프 피드 (지역·카테고리 필터) |
| `/philife/write` | 글쓰기 |
| `/philife/[postId]` | 글 상세 (UUID) |
| `/philife/post/[postId]` | 레거시 — `/philife/[postId]` 로 리다이렉트 |
| `/philife/my` | 내 글 |

### 관리자 라우트

| 경로 | 설명 |
|------|------|
| `/admin/philife` | 글 관리 (상태/신고 플래그) |
| `/admin/philife/reports` | 신고 처리 |

## DB

1. Supabase에 `supabase/migrations` 전체 적용 (기존 커뮤니티 v2 이후).
2. **붙여넣기 한 번에:** `supabase/scripts/paste-community-sample.sql` (선행 테이블 검사 후 플래그 + 샘플 시드).
3. 또는 마이그레이션 파일 분리 적용:  
   - `20260328100000_dangnae_community_sample_flags.sql`  
   - `20260328110000_dangnae_karrot_sample_seed.sql`  
   - 전제: `profiles` 최소 1명, `community_sections(dongnae)`, 해당 `community_topics` 슬러그.
   - 지역 4곳 + 글 10개 (옛 샘플의 모임·`group_meeting` 채팅 부분은 폐지)

**샘플 제거(예시 SQL)**

```sql
BEGIN;
DELETE FROM public.community_posts WHERE is_sample_data = true;
DELETE FROM public.locations WHERE is_sample_data = true;
COMMIT;
```

(외래키·CASCADE에 따라 실행 순서·정책은 운영 DB에 맞게 조정.)

## 컴포넌트 별칭

`components/community/` 아래 `Feed.tsx`, `Card.tsx`, `WriteForm.tsx`, `Detail.tsx`, `LikeButton.tsx`, `CategoryBadge.tsx`, `LocationBadge.tsx` 는 기존 구현에 대한 얇은 export 레이어입니다.

## 채팅 멤버 테이블명

스펙 문서의 `chat_room_members` 는 이 프로젝트에서 **`chat_room_participants`** 로 구현되어 있습니다. 거래·매장 채팅 등 기존 스키마를 바꾸지 않습니다.

## 수동 테스트 체크리스트

1. 지역 설정 후 `/philife` 에서 피드 로드 (해당 `location_id` 글만).
2. 글쓰기 → 저장 후 `/philife/{uuid}` 로 이동하는지.
3. 관리자 `/admin/philife`, `/admin/philife/reports`.
