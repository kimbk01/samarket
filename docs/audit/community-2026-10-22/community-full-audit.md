# DIBAY 커뮤니티(Philife) 전체 정밀 감사 · 수정 설계 승인안 (2026-10-22)

- 범위: 사용자 커뮤니티(`/philife`·`/community`), 커뮤니티 API(`app/api/community/**`·`app/api/philife/**`), 관리자(`/admin/community/**`·`/admin/philife/**`·`/admin/boards`), 운영 DB `ckdosyydvgzqwpbwuhon`(읽기 전용 SELECT만), Storage `post-images`.
- 기준: HEAD `a0777955e`. 코드 수정·DB 변경·Storage 삭제·커밋·배포 **없음**. 테스트 DB(`dibay-test`·`dibay-reset-qa`) 미사용.
- 판정 원칙: 코드 근거(file:line) 또는 운영 DB 조회 결과가 있는 것만 결함. 실기기·런타임이 필요한 것은 NOT_PROVEN.
- 운영 DB 규모(2026-10-22 조회): `community_posts` 123(active 112·deleted 8·hidden 4·imported 다수), `community_comments` 12, 주제 9, `meetings` 0, `meeting_feed_posts` 0, 커뮤니티 피드 광고 캠페인 39(현재 노출 중 0), `post-images` 버킷 8,979 객체 / 569 MB.

---

## 보고서 A — 커뮤니티 전체 구조

### A-1. 데이터 체계 (운영 중인 것과 레거시 구분)

| 체계 | 테이블 | 사용자 화면 | 관리자 | 판정 |
|---|---|---|---|---|
| **Philife 동네생활 (SSOT)** | `community_sections`(2)·`community_topics`(9)·`community_posts`·`community_comments`·`community_post_images`·`community_post_likes`·`community_comment_likes`·`community_post_views`·`community_post_saves`·`community_post_hides`·`community_reports`·`community_post_revisions` | `/philife/**` | `/admin/community/**` (`/admin/philife/*` 는 re-export 별칭) | 운영 |
| 모임 피드 | `meetings`·`meeting_members`·`meeting_feed_posts`·`meeting_feed_comments`·`meeting_album_items` | 모임 UX는 메신저로 이전 (`philife/write?category=meetup` → 메신저) | 없음 | 데이터 0건 (휴면) |
| 레거시 게시판 | `boards`(1)·`board_categories`(0)·`services`·`posts`(type=community 0건) | 없음 (`lib/community-board/**` 는 e0c038e9f 에서 삭제) | `/admin/boards` (메뉴 미연결 고아 화면) | 미사용 레거시 |

- 모든 사용자·관리자 API는 service role 로 DB 에 접근 → **권한은 RLS 가 아니라 앱 단 검사에 의존**. 운영 DB 확인 결과 `authenticated` 의 `community_posts`·`community_comments`·`community_post_likes` INSERT/UPDATE/DELETE 권한은 회수됨(정상).
- API 별칭: `app/api/philife/*` 는 대부분 `app/api/community/*` 를 re-export. **예외**: `app/api/philife/posts/[postId]/comments/route.ts` 의 GET 은 자체 구현(보고서 B CM-P2-01).

### A-2. 사용자 페이지 (17)

| 라우트 | 동작 | 접근 | 판정 |
|---|---|---|---|
| `/philife` | `CommunityHomeSurface` → `CommunityFeed`, `GET /api/philife/neighborhood-feed` | 게스트 허용 | 정상 (페이징 결함 CM-P2-05·06) |
| `/community` | 같은 Surface 직접 렌더 | 게스트 | 정상 (중복 진입점) |
| `/philife/[postId]` | 서버 `getNeighborhoodPostDetail` → `Detail` | 게스트 | 정상 (OG 메타 없음 P3) |
| `/community/posts/[postId]` | 공유·OG canonical, 사유별 접근 화면 | 게스트 | 정상 |
| `/community/[postId]`, `/community/post/[postId]`, `/philife/post/[postId]` | `/philife/:id` redirect | — | 정상 |
| `/philife/write` | `PhilifeNeighborhoodWriteForm` (textarea + `![](url)` 교차 본문), `?edit=` 서버 소유권 검사 | 로그인 | **결함** (CM-P1-02·03, P2 다수) |
| `/community/write`, `/community/my` | redirect | — | 정상 |
| `/philife/my` | `CommunityMyHubClient` | 로그인 | 정상 (서버 i18n P3) |
| `/philife/meetings/[id]`, `/community/meetings/[id]` | 메신저 방 redirect | — | 결함 P3 (CM-P3-07) |
| `/philife/purchases`, `/philife/purchases/[chatId]` | 거래 채팅 redirect | — | 거래 공유 레거시 (정상) |
| `/philife/sales`, `/philife/reviews` | 거래 판매·후기 화면 | 게스트 경로 열림 | 미사용 레거시 후보 (거래 공유) |

- 로딩: `philife/[postId]/loading.tsx` 스켈레톤, write·my 는 Suspense. 오류: 공용 `app/(main)/error.tsx`·`not-found.tsx`.
- 뒤로가기·스크롤 복원: `lib/community/community-post-entry-nav.ts` (스크롤 TTL 60초 — 의도된 값). 실기기 NOT_PROVEN.
- 헤더·바텀 내비: 공용 `AppTopHeader`·`MySubpageHeader` 사용, 커뮤니티 전용 복제 없음(정상, 수정 대상 아님).

### A-3. 관리자 화면 (32 page) · API (커뮤니티 사용자 71 / 관리자 49 route)

- 메뉴(`components/admin/admin-menu.ts:841-1020`)의 커뮤니티 leaf 는 모두 `/admin/community/*` 실화면으로 연결. 죽은 링크 없음.
- 권한: `requireCommunityAdmin(area)` (`lib/admin/community-admin/community-admin-guards.ts:24`) — content=`boards`, moderation=`reports`, promotion=`ads`, points=`point`. 영구 삭제는 최고 관리자 전용. 예외: `/api/admin/boards` 는 `isRouteAdmin()` 만 확인(CM-P3-10).

### A-4. Storage

- 버킷 `post-images` (public, **크기·MIME 제한 null**) 공용. 커뮤니티 경로 `{uid}/community/{uuid}.webp`(+ `.thumb/.feed/.detail.webp` 파생), 외부 import `{uid}/community/import/…`, 운영자 import `board-import/…`.
- 같은 버킷·같은 `{uid}/community/` 접두사를 메신저(`messenger-image|file|voice`)도 사용 (`lib/media/post-images-storage-ownership.ts:85-128`) → 정리 작업 시 하위 폴더 제외 필수.
- 운영 Storage 정책: `post-images: authenticated upload to own folder` (INSERT 1건). UPDATE/DELETE 정책 없음 → 회원 직접 삭제·덮어쓰기 불가(정상).

---

## 보고서 B — 전체 결함 목록

심각도: P0 권한 우회·정보 노출·데이터 손상 / P1 핵심 흐름 실패 / P2 UI·광고·사용성·보안 강화 / P3 선택 개선·잠재 결함.
「잠재」= 코드 결함은 확정이지만 운영 데이터가 0건이라 현재 사용자 영향 없음.

### P0 — 없음
권한 우회·비인가 노출로 확정된 항목은 없다. (회원 쓰기 API 전부 소유권 검사, XSS 경로 없음 — `dangerouslySetInnerHTML` 0건, iframe 은 youtube-nocookie/vimeo allowlist + sandbox.)

### P1

**CM-P1-01 · 공감 수·댓글 수가 실제의 2~3배 (DB 트리거 중복)** — 데이터 정합성
- 증거(운영 DB): `community_post_likes` 에 동일 기능 트리거 **3개** (`tr_community_post_likes_bump`, `tr_community_post_likes_count`, `trg_community_post_likes_count`), `community_comments` 에 **2개** (`tr_community_comments_bump`, `trg_community_comments_count`). 운영 글 14건에서 `like_count = 실제 × 3`, `comment_count = 실제 × 2` 확인 (예: like_count 9 / 실제 3, comment_count 4 / 실제 2).
- 원인: `20260321120000_community_feed_daangn.sql:170,199` 가 `tr_*` 를 만들고, `20260325150000_community_counters_atomic.sql:59,110`·`20260327100000_community_engine_v2.sql:207` 가 `trg_*` 를 추가하면서 이전 것을 DROP 하지 않음. `tr_community_post_likes_count`(함수 `community_likes_bump_count`)는 **저장소 마이그레이션에 없음**(운영 수동 생성 — 스키마 드리프트). 또 `sync_community_post_comment_count` 는 `is_hidden` 만 보고 `status='deleted'` 를 반영하지 않아 회원 소프트 삭제 댓글이 계속 집계됨 (글 `136edb60…`: comment_count 2 / 활성 0).
- 재현: 아무 글에 공감 1회 → `like_count` +3.
- 영향: 피드·상세의 공감·댓글 수 과장, 인기순 정렬 왜곡.
- 수정 설계 (DB 마이그레이션 1개, Owner 승인 필요): ① `tr_community_post_likes_bump`·`tr_community_post_likes_count`·`tr_community_comments_bump` DROP (sync_* 하나만 유지) ② `sync_community_post_comment_count` 가시성 판정을 `status='active' AND NOT is_hidden AND NOT is_deleted` 로 변경 ③ 1회 재계산 `UPDATE community_posts SET like_count=(count likes), comment_count=(count active comments)`. 앱 코드 변경 없음.
- 회귀 위험: 낮음 (트리거 1개로 단일화). 롤백 = 기존 트리거 재생성 SQL 보관.
- 검증: 적용 전후 drift 쿼리 0건, 공감·취소·댓글 작성·삭제 후 카운트 1:1.

**CM-P1-02 · HTML 붙여넣기 이미지가 있으면 ‘사진 추가’로 고른 사진이 사라짐** — 글쓰기 핵심
- 증거: `components/philife/PhilifeNeighborhoodWriteForm.tsx:872-876` (생성), `:750-757` (수정) — 본문에 `![](…)` 가 있으면 `images = 본문 추출 URL` 만 쓰고 `imageUrls`(파일 선택분) 폐기. 상세 `CommunityPostDetailBody.tsx:28-30` 은 교차 본문이면 갤러리 숨김.
- 재현: 이미지 포함 웹 기사 일부 붙여넣기 → 사진 2장 추가 → 등록 → 2장 어디에도 없음, Storage 고아.
- 수정: 제출 `images` = 본문 URL ∪ (`imageUrls` − 본문 URL), 순서 유지, 10장 상한. 교차 본문이어도 본문에 없는 이미지는 갤러리 렌더.
- 회귀: 피드 대표 썸네일 순서 변화 가능 → vitest 로 payload 고정.

**CM-P1-03 · 사진 업로드 실패가 무음 + 클라이언트 압축 없음**
- 증거: `PhilifeNeighborhoodWriteForm.tsx:433-438` `postMultipartFile` 이 `res.ok` 미확인, `:440-458` `onPickFiles` 는 catch 없음(unhandled rejection) → 같은 배치의 성공 이미지도 반영 안 됨. 서버 한도 5MB (`app/api/community/upload-image/route.ts:12`), 클라이언트 리사이즈 없음.
- 영향: 고화소 폰 사진(5MB+)이 오류 메시지 없이 첨부 실패.
- 수정: try/catch + `res.ok` 확인, 파일별 결과 반영·오류 표시, 업로드 전 리사이즈(긴 변 2048, JPEG q0.85).
- 검증: 6MB·HEIC 사진으로 Android·iPhone 실기기 (NOT_PROVEN 항목: Vercel 4.5MB 본문 한도와의 상호작용).

**CM-P1-04 · 관리자가 직접 등록한 커뮤니티 피드 배너를 중지·종료할 수 없음** (잠재 — 현재 노출 0건)
- 증거: `app/api/admin/advertising-workspace/action/route.ts:377-404` 가 캠페인 행의 `entityId`(캠페인 ID)를 `requestId` 로 전달 → writer 가 `feed_ad_requests.id` 로 조회해 404. `terminate` 는 `unsupported_action`. `/api/admin/feed-ads` 에 PATCH/DELETE 없음.
- 운영 DB: `ADMIN_DIRECT` 캠페인 21건(active 2·paused 10·ended 9), paused 10건 중 7건 `end_at` null. 현재 기간 내 노출 0건. (paused 가 어떤 경로로 기록됐는지는 NOT_PROVEN.)
- 수정: action route 에 `feed_campaign:` 접두사 family 를 추가해 campaignId 로 pause/resume/end writer 호출. 회원 신청(`feed:`) 경로는 불변.

### P2

| ID | 대상 | 현재 동작 · 증거 | 수정 설계 |
|---|---|---|---|
| CM-P2-01 | 댓글 GET (Philife) | `app/api/philife/posts/[postId]/comments/route.ts:24-39` 자체 GET 이 `resolveCanonicalCommunityPostId`(`lib/community-feed/queries.ts:376-389`, `is_hidden=false` 만 확인) 후 바로 목록 반환 → **작성자 삭제 글(status=deleted, 운영 8건 모두 is_hidden=false)·차단 관계 글의 댓글이 노출**. `/api/community/...` GET 에는 가시성·차단 검사가 있음 | Philife GET 을 community GET re-export 로 교체. `resolveCanonicalCommunityPostId` 에 `status='active'` 추가 |
| CM-P2-02 | 관리자 댓글 삭제 (상세 화면) | `hooks/use-philife-post-comments.ts:286-296` body `{status:"deleted"}` 만 전송 → 서버 400 `expected_status_required`/`reason_required`, 실패 메시지 없음 → 항상 무반응 | `expectedStatus:"active"` + 사유 입력 추가, 실패 토스트. 또는 관리자 콘솔 링크로 대체 |
| CM-P2-03 | 답글 실패 시 입력 소실 | `submitReply`(hook L178-191) void 반환, `CommunityCommentItem.tsx:151-156` 무조건 입력창 닫고 비움 | 성공 여부 boolean 반환, 성공일 때만 초기화 |
| CM-P2-04 | 댓글 로딩 영구 고정 | `fetchPhilifePostCommentTree`·hook L87-91 fetch 예외 catch 없음 → 오프라인 진입 시 스켈레톤 무한, 재시도 버튼 없음. `onDeletePost`(`CommunityDetail.tsx:386-395`) 동일 | fetch 를 try/catch 로 감싸 `{ok:false}` 반환 |
| CM-P2-05 | 해시태그·검색 + 최신순 페이징 | 서버는 tag/q 가 있으면 keyset 미사용인데 `nextCursor` 는 반환(`lib/neighborhood/queries.ts` L884-890), 라우트는 cursor 시 offset=0 → 2페이지가 1페이지 반복, IntersectionObserver 재요청 루프 | tag/q 있으면 nextCursor=null + offset 페이징 |
| CM-P2-06 | 인기순 offset 500 상한 | 라우트 L136·queries L197 `min(offset,500)` 인데 `nextOffset` 은 계속 증가 → 같은 페이지 반복 루프 (활성 글 520건 이상일 때, 현재 112건 → 잠재) | 상한 도달 시 hasMore=false |
| CM-P2-07 | 등록 버튼이 업로드 중에도 활성 | `PhilifeNeighborhoodWriteForm.tsx:1100-1101` `submitDisabled` 에 uploading 없음 | `submitDisabled ||= uploading` + onSubmit 가드 |
| CM-P2-08 | 붙여넣기 업로드 중 타이핑 덮어씀 | `:703-706` 붙여넣기 시점 `before/after` 로 `setContent` (함수형 아님, 최대 20초) | 삽입 구간만 함수형 치환 |
| CM-P2-09 | 수정 시 숨김 주제 글이 첫 주제로 바뀜 | `:284-291` 목록에 없는 주제를 `writeTopics[0]` 로 대체 → PATCH 가 topic 변경 | 수정 모드에서 원 주제가 목록에 없으면 category 생략(서버는 기존 유지) |
| CM-P2-10 | 작성 중 하드웨어·브라우저 뒤로가기 | 시트(`PhilifeWriteBottomSheet.tsx`)가 `useOverlayHardwareBack` 미사용, `PhilifeWriteSheetContext.tsx:97-103` 경로 변경 시 확인 없이 close. 임시저장 없음 | 시트에 `useOverlayHardwareBack(open, handleSheetCancel)`, 풀페이지 dirty history guard. 임시저장은 별도 승인 |
| CM-P2-11 | 외부 이미지 핫링크 저장 | 재호스팅 실패·10장 초과·`//` 상대 URL 이 본문/`images` 에 외부 URL 로 남음 (`:629-691`, `interleaved-body-markdown.ts:295-309`), 서버는 http(s) 면 아무 호스트 허용 (`neighborhood-posts/route.ts:114-125`). **운영: 활성 14개 글에 외부 이미지 85장** (hellocebuph·philsamo·`lh7-rt.googleusercontent.com`(만료형 URL)) | 회원 경로(native)에서 `images`·본문 이미지 호스트를 post-images 로 제한, 실패분 본문 제거. imported 글은 제외. 기존 데이터는 별도 승인 후 재호스팅 |
| CM-P2-12 | Storage 고아 (업로드 후 미등록·편집 제거·롤백) | 즉시 업로드 + 커뮤니티 GC 없음 (cron 은 store·messenger staging 만). **운영: 커뮤니티 원본 709개 중 어디에서도 참조 안 되는 것 180개 / 34 MB** (24h 이상, posts·images·content·content_blocks·thumbnail·revisions·meetings.cover 전체 대조) | `store-product-images-orphan-gc` 패턴의 dry-run 리포트 cron → Owner 승인 후 삭제. 참조 집합에 revisions 포함, 메신저 하위 폴더 제외 정규식 |
| CM-P2-13 | 관리자 영구 삭제가 공유 이미지 삭제 | `engine/posts/bulk-delete/route.ts:142-168` 가 다른 글 참조 여부 확인 없이 삭제. 회원 API 는 타인 post-images URL 을 `images` 에 넣을 수 있음. (운영 교차 참조 0건 → 잠재) | 삭제 전 참조 집합 검사(`community-post-image-admin.ts` `remove_unreferenced` 재사용), 회원 `images` 는 본인 폴더 URL 만 허용 |
| CM-P2-14 | 업로드 보안 강화 | GIF 는 매직바이트·sharp 검증 없이 원본 저장(`canonical-image-pipeline.server.ts:91-93`), `limitInputPixels:false`(:29,96) 디코딩 폭탄, 버킷 크기·MIME 제한 null | 매직바이트 필수, `limitInputPixels` 상한, (DB/Storage 설정) 버킷 `file_size_limit`·`allowed_mime_types` 지정 — 메신저 공유 버킷이므로 메신저 MIME 포함 필요 |
| CM-P2-15 | SSRF 방어 공백 | `upload-image-from-url`·`article-og-image` 가 `redirect:"follow"` (중간 홉 미검증), IPv4-mapped IPv6 는 `127.` 만 차단(`remote-image-import-url.ts:59-66`), DNS 재해석, content-length 없으면 전체 버퍼링. og 라우트 레이트리밋 없음 | `redirect:"manual"` 홉별 검사(최대 3), 예약 대역 보강, 스트리밍 상한, og 레이트리밋 |
| CM-P2-16 | 광고 상세 카드 가짜 평점 | `components/community/post-detail/CommunityInlineAdCard.tsx:101` 이 고정 문자열 `"5.0 · 후기 노출"`(`lib/i18n/catalog/community-ui.ts:138,688`) 표시 — 데이터 근거 없음 | 해당 줄 제거 |
| CM-P2-17 | 광고 상세 카드 범위·CLS | 전역 `ads[0]` 사용(현재 글 제외 없음), 96px 스켈레톤 후 광고 없으면 null → 레이아웃 축소 (`CommunityInlineAdCard.tsx:21-31,62-71`) | 스켈레톤 제거(있을 때만 렌더), `currentPostId` 제외 |
| CM-P2-18 | 피드 상단 광고·HERO·배너 지연 삽입 CLS | `CommunityFeed.tsx:1150-1189,1242-1250`, `EventPromotionHeroBanner.tsx:22-45` | 첫 페인트 전 prewarm 또는 높이 예약. CLS 실측 NOT_PROVEN |
| CM-P2-19 | 게스트 피드 GET 이 `locations` upsert | 라우트 L84 `ensureLocationId` → service role upsert, 인증·레이트리밋 없음 (운영 `locations` 18행 → 오염 없음, 잠재) | GET 은 조회 전용, 생성은 지역 설정 경로에서만 |
| CM-P2-20 | 댓글 수정에 커뮤니티 활동 제한 미적용 | `app/api/community/posts/[postId]/comments/[commentId]/route.ts:19-50` PATCH 에 `assertCommunityWriteAllowed` 없음 (글 PATCH 는 있음) | 1줄 추가 |
| CM-P2-21 | 레거시 `/api/posts/create` type=community 분기 | `app/api/posts/create/route.ts:203-215` 가 `posts` insert 후 `mirrorLegacyCommunityPostToSsot` 로 `community_posts` 생성. 커뮤니티 제한·주제·금칙어·`location_id` 검사 없음. UI 호출 0건, 운영 RPC `ensure_community_post_for_post_ads` 존재. 계약 테스트가 보존 강제 | Owner 결정 필요: community 분기 410 처리(계약 테스트 동시 수정) 또는 커뮤니티 가드 적용. 거래 경로는 불변 |

### P3

| ID | 내용 · 증거 |
|---|---|
| CM-P3-01 | `community_post_images` 에 `community_posts` FK 없음 → 삭제된 글의 행 **334개**(글 128개분) 잔존. Storage 객체는 이미 없음(DB 잔재만). 수정: FK `ON DELETE CASCADE` 추가 전 잔재 정리(승인 필요) |
| CM-P3-02 | `images` 와 `community_post_images` 개수 불일치 2건. PATCH 이미지 교체가 비원자적 (`neighborhood-posts/[postId]/route.ts:181-207`) → RPC 1트랜잭션 |
| CM-P3-03 | 댓글 수정·삭제 실패 무음, 삭제 후 새로고침 시 답글이 최상위로 승격 (`comment-tree.ts` roots.push) → tombstone 반환 |
| CM-P3-04 | 댓글 공감·신고 수 read-modify-write (`comment-mutations.server.ts:66-103`) 동시성 유실 |
| CM-P3-05 | 게스트 조회수 부풀리기 (`x-dibay-viewer-key` 헤더 교체, 레이트리밋 없음). 회원은 정상 1회 |
| CM-P3-06 | 서버 i18n 이 쿠키 무시 (`/philife/my`·`sales`·`reviews` `resolveServerInitialLanguage({})`) → 한국어 사용자에게 영어 |
| CM-P3-07 | `/philife/meetings/[id]` `redirect()` 를 try 안에서 호출해 catch 가 삼킴 → 항상 fallback (모임 0건, 잠재) |
| CM-P3-08 | 「비슷한 글」 영구 미표시 (`similarPosts={[]}`, `listNeighborhoodSimilarPosts` 호출처 0) — 미완성 |
| CM-P3-09 | 작성자에게 자기 삭제·숨김 글이 정상 글처럼 보임(상태 배지 없음), 관리자 숨김 글을 작성자가 수정 가능 — 정책 판단 필요 |
| CM-P3-10 | `/admin/boards` 고아 화면이 권한 키 없이 `boards` 생성 허용, 생성물은 어디에도 노출 안 됨 |
| CM-P3-11 | 관리자: 모임 피드·댓글·앨범 조치 경로 없음, 모임 피드·앨범 작성에 커뮤니티 제한 미적용, `meeting_feed_posts` 회원 JWT 직접 INSERT 정책 존재 (모두 데이터 0건 → 잠재) |
| CM-P3-12 | 영구 삭제 시 댓글 신고 미확인·댓글 본문 증거 미보존 (`bulk-delete/route.ts:79-95,135`, 댓글 CASCADE) |
| CM-P3-13 | 일괄 숨김·삭제가 홍보 중 글에서 `promotion_fault_required` 로 개별 실패 (`AdminPostsPageContent.tsx:211-217`) |
| CM-P3-14 | 레거시 `post_ads` 상단고정이 숨김·삭제 글을 거르지 않음(`lib/ads/post-ads-supabase.ts:147-170`), 상단고정 `limit 20` 후 주제 필터(`community-paid-exposure-feed.ts:39,50`) — 운영 `post_ads` plife 0건·활성 홍보 0건 → 잠재 |
| CM-P3-15 | 피드 배너 캐러셀: 스와이프 없음, 점 버튼 6px 터치 영역, 수동 이동 시 타이머 미리셋 (`FeedAdBannerCarousel.tsx:251-329`). 노출·클릭 집계 미구현(계약상 Deferred) |
| CM-P3-16 | 글 등록 서버 분당 레이트리밋·멱등키 없음(일 50건만), 풀페이지 성공 후 이동 전 버튼 재활성 (`:995-1009`) |
| CM-P3-17 | 링크 붙여넣기 시 항상 OG 이미지 자동 첨부(YouTube 는 임베드와 중복), OG 실패 시 빨간 오류 |
| CM-P3-18 | 운영 RLS 정책명이 저장소와 다름 (운영 `community_posts_select_public` vs 저장소 `community_posts_select_v2`) — 스키마 드리프트. 앱은 service role 이라 기능 영향 없음 |
| CM-P3-19 | 문서 4건이 실제와 불일치: `community-surfaces-contract.md:20-27`(삭제된 `lib/community-board`), `community-dangnae.md`, `community-meeting-open-chat.md`(폐기 엔진), PHASE D lock 보고 템플릿 |

### 범위 밖 (보고만)
- 모임 종료(`app/api/community/meetings/[meetingId]/close/route.ts:56-63`)가 메신저 방을 읽기 전용으로 만들지 않음 — **메신저 도메인**, 모임 0건.
- `post-images` public 버킷에 메신저 이미지·파일·음성 저장 — 메신저 도메인, 별도 private 버킷 과제.

---

## 보고서 C — 레거시·기존 계획 대조

| 분류 | 항목 |
|---|---|
| 1. 계획대로 정상 | 동네 피드 SSOT, 단일 Surface(`verify:single-community-*`), FD5 단일 페이지, 글쓰기 Level1+원자 원장(포인트 hard-lock), 관리자 엔진 m1~m10(수정·CAS·리비전·고정·공지·영구삭제·감사), 신고 RPC, 외부 가져오기 B+, 차단·관심이웃 |
| 2. 계획 미구현 | Philife DB rename 2~4단계, 외부 가져오기 PHASE F(Production E2E), 관리자 설계 §H-3 미검증 4항목, 커뮤니티 공지 → `/admin/app/notices` 통합(AR-3), 「비슷한 글」 |
| 3. 구현됐으나 결함 | 보고서 B 전체 |
| 4. 레거시에 있었으나 누락 | 모임 운영 화면(`components/meetings/*` 13개, 진입점 import 0) · 호스트 기능(`MeetingHostControls`) — 메신저 이전은 의도, 메신저 대체 범위 NOT_PROVEN · 주제별 「질문」 체크박스(현재 slug=question 만 is_question) · 글 등록 분당 레이트리밋 |
| 5. 사용 중 정상 레거시 | `/community/**` 별칭(특히 `/community/posts/[id]` 공유 canonical), `/api/philife/*` re-export, `/admin/philife/*` 별칭, `Feed/Detail/WriteForm` 얇은 별칭, `/philife/sales·reviews·purchases`(거래 공유), `lib/community-engine/visibility.ts` |
| 6. 미사용 레거시 후보 (삭제는 별도 승인) | `components/community/{Card,CategoryBadge,LikeButton,LocationBadge,CommunityCommentForm,CommunityCommentList,CommunityFilterBar,CommunityImageGallery,CommunityMetaBar,PhilifeHomeFeedPage,UserBlockButton,MeetingHostControls,CommunityPostDetailBackLink}` · `components/community/meeting/{ChatButton,JoinButton,MeetingChatEntryButton,MeetingDetail,MembersList}` (`MeetingJoinButton` 은 사용 중 — 삭제 금지) · `components/meetings/**` · `lib/neighborhood/{philife-db-expected,philife-meeting-hub-load,philife-post-comments.client}.ts` · `/admin/boards` 일체(`services` 테이블은 거래 공유 — 유지) · `POST /api/community/posts`(계약 테스트가 보존 강제) |
| 7. Owner 신규 요구 | 관리자 전체 글 수정: **이미 충족**(community_posts). 미충족: 댓글 본문 수정, 회원 글 이미지 추가·순서 변경, 주제별 읽기·쓰기 권한 등급, 첨부 한도 설정, 운영자 명의 일반 글, 일괄 이동·복사 |

회귀 위험: 6번 정리는 계약 테스트 2개(`community-dead-cleanup-contract.test.ts`, `community-dead-legacy-cleanup-contracts.test.ts`)와 함께 수정해야 하며 결함 수정과 분리 커밋.

---

## 보고서 D — 이미지·동영상·Storage

### D-1. 입력 경로별 판정

| 경로 | 처리 | 판정 |
|---|---|---|
| 파일 선택·모바일 사진 | multipart → `upload-image` → sharp webp 재인코딩(EXIF/GPS 제거) + 파생 3종 | 정상, 단 실패 무음·압축 없음(CM-P1-03) |
| 클립보드 이미지 파일 | files·items 처리, 동반 HTML 보존 | 정상 |
| 외부 웹페이지 이미지 복사·붙여넣기 | HTML → `DOMParser` → `![](url)` → 서버 `upload-image-from-url` 재호스팅(브라우저 CORS 회피) | 정상 흐름, 실패분 핫링크 잔존(CM-P2-11) |
| 외부 HTML 붙여넣기 | 텍스트 + 이미지 마크다운만 추출, script·iframe·svg 제외, textarea 라 HTML 미삽입 | 정상 (XSS 없음) |
| data URI | 클라이언트 blob → multipart | 정상, 실패 시 본문 잔존 가능 |
| 여러 장 | 최대 10장, 초과는 무음 절단 | P3 |
| 삭제·교체 | 썸네일 × 는 `imageUrls` 만 제거 → 교차 본문 이미지 되살아남 | 결함 P2 (CM-P2-08 계열로 함께 수정) |
| 수정 시 유지 | `initialImages`/`initialContent` 서버 주입 | 정상 (CM-P1-02 조건 제외) |
| Android Gboard 삽입·WebView 클립보드 HTML·HEIC | — | NOT_PROVEN (실기기) |

외부 사이트의 복사 제한(이미지가 클립보드 HTML 에 없는 경우)·핫링크 차단은 브라우저/원 사이트 제약으로 지원 불가 — 이 경우 재호스팅 실패로 처리되어야 하며 현재는 외부 URL 이 남는 것이 결함.

### D-2. 저장·누수 (운영 실측)

| 항목 | 결과 |
|---|---|
| 파일명 충돌 | 없음 (randomUUID + `upsert:false`) |
| 중복 저장 | 해시 dedup 없음 (P3) |
| 미참조 커뮤니티 원본 | **180개 / 34 MB** (전체 원본 709개, 24h 이상) — 저장 누수, 노출 아님 |
| 커뮤니티 경로 전체 | `{uid}/community/**` 3,439 객체 312 MB, `board-import` 2,708 객체 37 MB(참조 36), `community-crawler` 336·`crawl-qa-fixtures` 50·`dibay-travel-source` (폐기된 크롤러 v1 잔재, 참조 0) |
| DB 잔재 | `community_post_images` 고아 행 334 (FK 없음) |
| 소프트 삭제 글 | 이미지 보존(설계 의도) — public 버킷이라 URL 로 계속 접근 가능(신고·블라인드 회수 수단 없음, P2 정책 과제) |
| 접근 권한 | 업로드는 인증 필수·서버 service role. 회원 직접 UPDATE/DELETE 정책 없음 → 타인 객체 훼손 불가 (정상) |

누수 방지 설계 (승인 시): ① 회원 `images`·본문 이미지 = 본인 post-images URL 만 허용 ② 편집 시 즉시 삭제하지 않고 GC 로 일원화(리비전이 옛 URL 참조) ③ GC dry-run 리포트 → Owner 승인 → 삭제, 참조 집합 = `community_posts`(전 status: images·content·content_blocks·thumbnail_url) + `community_post_images` + `community_post_revisions` + `meetings.cover_image_url`, 24h 미만 보존, 메신저 하위 폴더 제외 ④ 크롤러 v1 잔재·`community_post_images` 고아 행 정리는 별도 승인.

### D-3. 목록 썸네일
- 선정: `images[0]` → (본문 추출, 단 피드 API 는 content 대신 summary 를 내려 사실상 미동작) → `meetings.cover_image_url`. 88px 정사각 `object-cover`, 일반 `<img>`.
- 본문엔 있는데 목록엔 없는 경우: 운영 1건(`images='[]'` + 본문 이미지), GIF 0건, data URI 0건. GIF 는 `.feed.webp` 파생이 없어 404 → 대체 이미지(잠재 P3).
- 외부 핫링크 썸네일: 활성 14개 글 — 원 사이트 차단·만료 시 깨짐.
- 수정 후 갱신·삭제 후 정리: 갱신 정상(summary 트리거), 삭제는 status 필터로 즉시 사라짐. CDN 캐시 1h 기본.

### D-4. 뷰어·동영상 — 정상(보존 대상)
- `PostImageViewer.tsx`: 핀치·더블탭 확대, 스와이프, 아래로 닫기, pushState/popstate 뒤로가기 닫힘(129-159), 스크롤 잠금·복원(162-182).
- YouTube(nocookie)·Vimeo 인라인 sandbox iframe, mp4 `<video>`.
- 새 탭 회귀 없음: `target="_blank"` 3곳은 모두 외부 원문·출처 링크(의도), 뷰어에 `window.open` 없음.
- 실기기 확인은 NOT_PROVEN.

---

## 보고서 E — 관리자·게시판 운영

### E-1. Owner 요구 「모든 게시글 수정·관리·삭제」 — **충족** (community_posts 기준)
- 수정: `engine/posts/[postId]` PATCH → `community-post-admin-patch.ts:79-336` (제목·본문·주제 이동·imported 블록, 사유 필수, CAS `updated_at`, `last_edited_*`, 리비전 트리거, 작성자 알림).
- 숨김·삭제·복구: soft (`status`), 트리거가 `is_hidden/is_deleted` 동기화. 영구 삭제는 최고 관리자 + 30일 + 미처리 신고·홍보·모임 없음, 감사 선기록.
- 검증: 운영 DB 에 관리자 수정 0건·리비전 0건·관리자 조치 감사 0건 — **실사용 이력 없음 → 운영 동작 NOT_PROVEN**(코드 PASS).
- 공백: 모임 피드(데이터 0, CM-P3-11), 댓글 본문 수정 없음(상태만).

### E-2. 그누보드 비교

| 기능 | DIBAY | 비고 |
|---|---|---|
| 게시판 생성·설정 | 구현 (`community_topics`: 이름·slug·아이콘·색·정렬·활성·노출·질문/모임 허용·목록 스킨·정렬 모드) | |
| 게시판 그룹 | 구현 (`community_sections`) | |
| 읽기/쓰기/댓글 권한 레벨 | **미구현** | 활성·노출 주제는 누구나 작성 |
| 게시판별 관리자 | 미구현 | 권한 키는 전역(boards/reports/ads/point) |
| 글 관리 | 구현 | |
| 댓글 관리 | 부분 (상태만) | |
| 공지·고정 | 구현 (피드 3·주제 2) | 운영 사용 0건 |
| 비밀글 | 미구현 | 동네 피드 특성상 불필요 판단 |
| 첨부 정책 | 부분 (10장 고정, 5MB) | 게시판별 설정 없음 |
| 신고 처리·제재 | 구현 (RPC, 운영 처리 3건 resolved) | |
| 포인트 | 구현 | |
| 휴지통·복원 | 구현 (soft → 30일 후 영구) | |
| 일괄 처리 | 숨김·공개·삭제·영구삭제 구현, 이동·복사 미구현 | |
| 검색 | 구현 (제목·본문·작성자·주제·기간·출처·신고) | |
| 조치 이력 | 구현 (`audit_logs` + 리비전) | |
| 금칙어 | 구현 (`admin_settings.community_feed_ops`) | |
| 접근 로그(IP) | 미구현 | |

필수 미구현으로 제안(별도 승인): 주제별 「관리자 전용 쓰기」 플래그(공지성 게시판 운영에 필요). 나머지(권한 레벨·게시판별 운영자·일괄 이동)는 현재 규모(글 112건)에서 선택 과제(P3).

### E-3. 권한 검증
- 모든 커뮤니티 관리자 API 는 서버 `requireCommunityAdmin` 확인 (예외 `/api/admin/boards`, CM-P3-10).
- 회원 쓰기 API 전부 `user_id` 소유 확인. 정지·차단·탈퇴는 `proxy.ts` 의 `enforceApiMemberMutationPolicy` 가 모든 `/api/*` 쓰기를 중앙 차단.
- 커뮤니티 활동 제한(sanctions) 누락: 댓글 수정(CM-P2-20), 모임 피드·앨범(잠재).

---

## 보고서 F — 광고·UI/UX

### F-1. 커뮤니티 광고 위치

| 위치 | 컴포넌트 → 데이터 | CMS | 판정 |
|---|---|---|---|
| 피드 상단 고정(유료 홍보) | `AdPostCard` ← `/api/ads/active?boardKey=plife` (`point_promotion_orders` + 레거시 `post_ads`) | `/admin/community/promotions` | 결함 잠재(CM-P3-14), CLS(CM-P2-18). 운영 활성 0건 |
| 이벤트 HERO (홈) | `EventPromotionHeroBanner` ← `platform_promotion_distributions` | `/admin/platform-promotion` | 정상, CLS |
| 피드 중간 배너 (홈·주제) | `FeedAdBannerCarousel` ← `feed_ad_campaigns/creatives` | `/admin/advertising/direct/community`, `/admin/ad-applications` | 노출 정상, 관리자 중지 불가(CM-P1-04) |
| LOCAL 탭 | 배너 없음 | — | 계약대로 정상 |
| 글 상세 인라인 | `CommunityInlineAdCard` ← 상단고정 첫 건 | 같음 | 결함 (CM-P2-16·17) |
| PTR 띠광고 | `DibayPtrRevealAdLayer` ← `platform_popup_*` | `/admin/ptr-reveal-ads` | 정상(노출 중복 집계 클라 전용, P3) |
| 전역 팝업 | `GlobalPopupHost` | `/admin/platform-popup` | NOT_PROVEN |

캐러셀: 4000ms interval, cleanup·화면 밖/백그라운드 일시정지·reduced-motion·세션 슬롯 안정 — 정상. 스와이프·터치 영역·타이머 리셋은 P3(CM-P3-15). 광고 없을 때 피드 배너 높이 0(정상), 상세 카드는 위반. 링크 정책(내부 same-origin, 외부 https 인앱 브라우저) 정상.

### F-2. UI 일관성
- 커뮤니티 상세·댓글은 `CommunityUiScope` 의 `--cm-*` 전용 토큰, `/philife/reviews` 는 `sam-*`·`rounded-ui-rect` — 체계 혼재(P3, 이번 수정 범위 아님 · 임의 디자인 변경 금지 원칙).
- 확인창 `dibayConfirm`(공용), 신고 `DibayDialog`, 터치 영역 `min-h-12`(정상). 게스트 신고 버튼 → 다이얼로그 후 401(P3).
- 헤더·바텀 내비 공용 SSOT 사용 — 준수.
- 태블릿: FD5 단일 페이지 준수, 피드 배너 3:1·768px 상한이 hard-lock 「카드 리듬 72~88」 문서와 불일치(문서 정합 과제).
- 키보드·스크롤·반응형 실기기: NOT_PROVEN.

---

## 보고서 G — 최종 수정 설계 및 승인안

### G-1. 구현 순서 (도메인별 단독 커밋, 한 단계 = main 1회 반영)

| 단계 | 포함 결함 | 변경 파일(예상) | 구분 |
|---|---|---|---|
| **1. 카운트 정합 (DB)** | CM-P1-01 | 마이그레이션 1개 (트리거 3개 DROP, sync 함수 수정, 1회 재계산) | DB — 운영 적용 Owner 승인 |
| **2. 글쓰기·이미지** | CM-P1-02·03, CM-P2-07·08·09·10, D-1 썸네일 × | `components/philife/PhilifeNeighborhoodWriteForm.tsx`, `CommunityPostDetailBody.tsx`, `PhilifeWriteBottomSheet.tsx`, `PhilifeWriteSheetContext.tsx` (+ vitest) | 웹 |
| **3. 댓글·피드 조회** | CM-P2-01·02·03·04·05·06·20, CM-P3-03 | `app/api/philife/posts/[postId]/comments/route.ts`, `lib/community-feed/queries.ts`(resolveCanonical status), `hooks/use-philife-post-comments.ts`, `CommunityCommentItem.tsx`, `lib/neighborhood/queries.ts`, `app/api/community/neighborhood-feed/route.ts`, comments `[commentId]/route.ts` | 웹 |
| **4. 이미지 저장 정책·보안** | CM-P2-11·13·14·15 | `app/api/community/neighborhood-posts/**`, `upload-image`·`upload-image-from-url`·`article-og-image`, `lib/media/canonical-image-pipeline.server.ts`, `remote-image-import-url.ts`, bulk-delete | 웹 (+ 버킷 제한은 Storage 설정 — 승인) |
| **5. 광고** | CM-P1-04, CM-P2-16·17·18 | `advertising-workspace/action/route.ts`, `CommunityInlineAdCard.tsx`, `CommunityFeed.tsx`, `EventPromotionHeroBanner.tsx` | 웹 (광고 도메인) |
| **6. Storage GC (dry-run)** | CM-P2-12 | cron 1개 + lib (store GC 패턴) — **삭제 비활성 상태로 배포**, 리포트 확인 후 삭제 승인 | 웹 |
| 7. (선택) P3 | CM-P3-* | 개별 승인 | — |
| 별도 | 레거시 정리(C-6), CM-P2-21, 고아 행·크롤러 잔재 정리, 문서 정합 | 각 별도 승인 | — |

각 단계 검증: `npm run typecheck:build` + 변경 관련 vitest + 변경 파일 eslint 1회 → 실기기 확인 항목(아래).

### G-2. 정상 기능 보존 방법
- 수정하지 않는 것: 헤더·바텀 내비, FD5 단일 페이지 구조, 뷰어(`PostImageViewer`·`PostVideoEmbed`), 포인트 원장 경로(`evaluateCommunityPostAcceptance`·`applyCommunityPointRewardOnPostWrite`), 관리자 엔진 m1~m10, 외부 import B+, 피드 latest keyset(필터 없을 때), 공지·고정 제외 페이징, 신고 RPC.
- imported 글(`origin_kind='imported'`)은 이미지 호스트 제한 대상에서 제외.
- 통화·메신저·배달·거래 코드 변경 없음 (`/api/posts/create` 는 Owner 결정 전 미변경).

### G-3. 데이터 안전성
- DB 변경은 단계 1(트리거·카운트 재계산)뿐 — 재계산은 집계 컬럼만 갱신, 원본 행 불변. 롤백 SQL 동봉.
- Storage 삭제는 이번 승인안에 포함하지 않음 (GC 는 dry-run 리포트까지).

### G-4. 회귀·실기기 검증 항목
- 공감·취소·댓글 작성·소프트 삭제 후 카운트 1:1 (운영 DB drift 쿼리 0건).
- 글쓰기: 사진 선택 + HTML 붙여넣기 혼합 등록·수정, 6MB/HEIC 사진, 업로드 중 등록 버튼 비활성, Android 하드웨어 뒤로가기 확인창.
- 댓글: 삭제 글 댓글 GET 404, 답글 실패 시 입력 보존, 오프라인 재시도 버튼, 관리자 상세 댓글 삭제.
- 피드: `?tag=` 스크롤 루프 없음.
- 광고: 직접 광고 일시중지·재개·종료, 상세 카드 평점 미표시.

### G-5. 웹·DB·네이티브 영향
- 웹: 단계 2~6 (main 반영 후 앱 재시작만).
- DB: 단계 1 마이그레이션(운영 적용 승인 필요). 버킷 제한 설정(선택).
- 네이티브: **없음** (`android/**`·`ios/**`·Capacitor 무변경, 재빌드 불필요).

---

## 집계

| 항목 | 수 |
|---|---|
| 감사 대상 페이지 | 49 (사용자 17 · 관리자 32) + API 120 (사용자 71 · 관리자 49) |
| 정상 판정 페이지 | 사용자 13 (결함 2·미사용 레거시 2 제외) · 관리자 31 (`/admin/boards` 제외) |
| 정상 확인 기능(주요) | 31 (보고서 B 서두·D-1·D-4·E-1·E-3·F-1 정상 항목) |
| 결함 P0 / P1 / P2 / P3 | **0 / 4 / 21 / 19** (그중 운영 데이터 0건으로 현재 영향 없는 잠재 결함: P1 1·P2 3·P3 5) |
| 계획 미구현 | 5 |
| 추가 검토 필요(Owner 신규 요구·정책 판단) | 8 (댓글 본문 수정, 이미지 추가·순서, 주제별 권한, 첨부 한도, 운영자 명의 글, 일괄 이동·복사, 작성자 숨김 글 수정 정책, `/api/posts/create` community 분기) |
| NOT_PROVEN | 12 (실기기: 뷰어·키보드·Gboard·HEIC·WebView 클립보드·Vercel 4.5MB / 운영: 관리자 수정 실사용, feed 캠페인 paused 경로, 전역 팝업, CLS 실측, 메신저의 모임 기능 대체, 피드 캐시 갱신) |
| 수정 예상 파일 | 약 25개 (웹) + 마이그레이션 1개 |
| 범위 밖 보고 | 2 (모임 종료 메신저 방, 메신저 파일의 public 버킷 저장) |

### Owner 승인 필요 항목
1. 단계 1 DB 마이그레이션 작성 및 **운영 DB 적용** (CM-P1-01).
2. 단계 2~5 구현 및 main 반영 (웹).
3. 단계 6 GC dry-run 도입 여부, 이후 실제 삭제 여부(34 MB).
4. 외부 핫링크 기존 데이터(활성 14개 글·85장) 재호스팅 여부.
5. `post-images` 버킷 크기·MIME 제한 설정 (메신저 공유 버킷).
6. `/api/posts/create` type=community 분기 처리 방침 (계약 테스트 보존 결정 번복 여부).
7. 레거시 정리(C-6)·고아 행 334·크롤러 v1 잔재 정리·문서 4건 정합 — 각각 별도.
8. 신규 기능 검토 8건(위 표) 중 채택 항목.
