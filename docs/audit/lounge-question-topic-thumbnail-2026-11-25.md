# 라운지 「질문있어요」 글 목록 썸네일 안 나옴 — 원인·조치 (2026-11-23 감사 · 11-25 마무리)

## 1. 결함: **FAIL** (11-23 20:34 PHT · 운영 `/philife` · 비로그인 · 데스크톱)
- 글 `4296fdf9…`(11-23 20:11 PHT, 「필리핀 쇼피·라자다 70% 할인…」)만 목록 썸네일 없음. 다른 주제 글은 있음.
- 글 데이터는 정상: `community_posts.images` 1장 · `community_post_images` 1줄 · 본문 사진 1장 같은 주소 · `.thumb.webp` HTTP 200. 붙여넣기로 빠진 것 없음.

## 2. 원인 (두 개 — 둘 다 고쳐야 화면이 바뀜)
1. **주제 설정**: 「질문있어요」(`community_topics.slug=question`)의 `feed_list_skin = text_primary`(「텍스트 중심 · 썸네일 숨김」, 2026-03-21 첫 설정 그대로). 카드가 사진이 있어도 숨김(`components/community/CommunityCard.tsx`).
2. **목록 저장본이 서버 값을 버림** (11-25 설정 변경 뒤 실측으로 발견): 목록을 새로 받을 때 `isSameNeighborhoodFeedRow`(`lib/community/neighborhood-feed-row-merge.ts`)가 좋아요·댓글·조회·작성자·본문만 비교했다. 주제 목록 모양·사진·제목·주제 이름이 바뀌어도 「같은 글」로 보고 브라우저 저장본(`philife_neighborhood_feed_v4_persistent`, 최대 7일)을 그대로 그리고, 저장 시각만 새로 써 오래된 값이 계속 이어졌다.
   - 실측(11-25 15:32~15:34 PHT): 서버 응답 `feed_list_skin=compact_media`, 화면 카드 사진 0개, 저장본 `text_primary`.

## 3. 조치
- **운영 설정 (Owner 「섹션을 마무리 해라」 11-25)**: 15:26:26 PHT `community_topics` 「질문있어요」 `feed_list_skin` `text_primary` → `compact_media`.
  - 시작 시 읽은 revision(`updated_at 2026-11-08 08:03:56.559266+00`) 조건으로 저장 → 1행. `audit_logs` 1행(`community_topic.update`, actor_type `system`, 사유 기록).
  - 백업(변경 전 행): slug question · name 질문있어요 · name_en Questions · feed_list_skin text_primary · is_active/is_visible/allow_question true · is_feed_sort false · feed_sort_mode null · sort_order 6 · color/icon null · section_id 33b8c2f7….
  - 열 대조: 바뀐 칸 = `feed_list_skin`, `updated_at`(트리거)만.
  - 어드민 화면 저장과 달리 서버 주제 캐시를 즉시 비우지 않아 최대 5분 45초 뒤 반영(실측 15:32:47 PHT 서버 응답 반영).
- **코드 (이 PR)**: 행 비교를 「서버가 준 칸 전부」로 바꿈(칸 목록을 두지 않음 — 새 칸이 생겨도 같은 결함이 다시 안 생김). 카드 다시 그리기 조건도 사진 장수 → 사진 주소로.

## 4. 범위 밖 (보고만)
- 글쓰기 화면에서 썸네일이 숨겨지는 주제를 고를 때 쓰려던 안내 문구(`community_write_skin_text_primary`)가 화면 어디에서도 쓰이지 않는다.
- 카카오톡·Viber 링크 미리보기 og 태그 결함 수정은 `fix/share-preview-head-meta` 브랜치에 보관(미반영).
