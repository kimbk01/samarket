# 커뮤니티·게시판 표면 계약

## `/philife` 동네 피드

- **데이터 테이블**: `community_posts` (+ 동네 `location_id`). 레거시 **`posts.board_id` 게시판 글**은 이 피드에 합쳐지지 않음 — 동네생활 글은 `community_posts` 로만 노출.
- **주제 정합**: `listNeighborhoodFeed` 는 `community_topics`(동네 피드 섹션) 로드 후, 「전체」에서는 **어드민에 등록된 주제 slug**(및 모임) 또는 **레거시 `category` enum** 글만 남긴다. `topic_slug` 만 있고 `category` 가 비어 있던 행은 예전에 전부 탈락하던 버그를 제거했다.
- **데이터 경로**: 브라우저 → `GET /api/philife/neighborhood-feed` → `app/api/community/neighborhood-feed/route.ts` (재export 동일 핸들러).
- **서버 DB**: `getSupabaseServer()` — **Vercel/프로덕션에 `SUPABASE_SERVICE_ROLE_KEY` 필수**. 없으면 `error: server_config`(500) → 클라이언트에 “서버 설정”류 메시지.
- **지역**: `RegionContext`의 `currentRegion`으로 `locationKey` 생성. 미설정 시 클라이언트가 안내하고, API는 `locationKey` 없으면 400.
- **무한 골격**: `fetch` 미완료·세션 경합 시 `loading` 이 남을 수 있어, 클라이언트는 **요청 타임아웃** + **로딩 토큰**으로 마지막 요청만 `loading` 해제.

레거시 `/community` 피드와 혼동하지 말 것 — 필라이프 홈은 **`/philife`** 한 경로.

## `/admin/boards` 게시판 목록

- **근본 원인(빈 목록)**: 예전 구현은 **브라우저 Supabase(anon + RLS)** 로 `boards` 를 직접 `select` 했다. RLS 가 관리자에게도 읽기를 막거나, 세션이 anon 클라이언트에 제대로 안 실리면 **행 0건**으로 보인다.
- **정의**: 관리자 목록은 **`GET /api/admin/boards`** 만 사용 — `isRouteAdmin()` + **서비스 롤**(`tryGetSupabaseForStores`)로 조회. 생성(`POST`)과 동일한 DB 권한 계층.
- **DB가 비어 있음**: 마이그레이션만 있고 seed 가 없으면 목록은 당연히 비어 있다. 이 경우 UI 문구대로 **게시판 추가** 또는 `services`·`boards` seed 가 필요하다.

## 동네생활 `posts` + `boards` 최소 시드 (운영)

- **앱 계약**: `lib/community-board/api.ts` — 글 목록·카운트는 `type = 'community'` 이고 **`meta->>board_id`** 로 게시판을 가른다. 신규 글은 `createPost` 가 `meta.board_id` 에 `boards.id` 를 넣는다.
- **최소 조건**: `services.slug = 'community'` 활성 행 1개 이상, 해당 `service_id` 에 연결된 **`boards` 행 1개 이상**. `category_mode = board_category` 인 게시판은 **`board_categories`** 도 필요.
- **SQL 템플릿**: `supabase/scripts/seed-community-operational-min.sql` (실행 전 해당 프로젝트 `services` / `boards` 컬럼과 맞는지 확인).
- **PostgREST 자동 반영(로컬·스테이징)**: `node scripts/apply-community-seed-and-trade-room.mjs` — `.env.local` 서비스 롤로 `services`·`boards` 삽입 후, E2E용 거래 `summary`가 있는 CM 방 1개를 묶어 `E2E_SNAPSHOT_DIAG_ROOM_ID` 를 stdout JSON 으로 낸다(`service_type` 등 NOT NULL 컬럼 보강 포함).
