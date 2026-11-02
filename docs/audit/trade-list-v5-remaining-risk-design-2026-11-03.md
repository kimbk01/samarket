# 거래 목록 v5 — 남은 위험 감사·설계안 (2026-11-03)

대상 커밋: `0831cb5d4` (main). 범위: 감사·설계만, 코드 변경 없음.
Owner 지시 원문: 「남은 위함이 없도록 정확히 감사 하거 설계안을 추가로 보고 해라」

## 0. 정정 (작업자 잘못)
1. **「광고 캠페인이 종료일 뒤에도 active로 남는 것은 결함」 → 틀린 판정.** 관리자 광고 목록은 저장된 상태와 별개로 기간을 계산한 실제 상태를 보여 준다(`AdminFeedAdsListPage.tsx:58-75` `projectAdsEffectiveLifecycle`, CUT B 「STORED status ≠ EFFECTIVE」). 고객 노출도 기간으로 거른다(`isFeedAdCampaignEligibleNow`). 설계된 동작이라 결함 목록에서 뺀다.
2. **설계 v6 §5 「ChatProductSummary·TradeAdminKit 은 PostCard 사용」 → 틀림.** 두 파일은 주석에서만 PostCard를 언급한다. 실제 사용처는 홈·카테고리·찜·최근 본·전역 검색·샘플 6곳이다.
3. **「메신저 이미지 자동 저장 테스트 실패」는 제품 결함이 아니다.** 로컬 Node 26의 `window.localStorage` 가 비어 있어 생긴다(`clear` undefined). CI는 Node 22(`.github/workflows/ci.yml`)를 쓴다. 범위 밖이라 보고만 한다.

## 1. 확인 조건·증거
| 항목 | 조건 | 결과 |
|---|---|---|
| 운영 반영 | Vercel production 배포 목록 1회 조회(03:4x PHT) | `0831cb5d4` 배포 = **BUILDING**(실패 아님). 운영은 아직 `edc14befb` → v5 운영 화면 **NOT_PROVEN** |
| 운영 화면 | samarket.vercel.app/market · 앱 내 브라우저 · 375px · 03:39 PHT | 이전 버전(작성일 0 · ⋮ 4개 · 카드 높이 235/236/253) — 배포 전 상태라 판정 불가 |
| 코드 | origin/main `0831cb5d4` | 아래 결함 |
| 운영 DB | `ckdosyydvgzqwpbwuhon` 읽기 전용 | 거래 숨김 저장 테이블 없음 · 커뮤니티 `community_post_hides`(community_posts 전용) 있음 · `reports` target_type = product 5 / user 2 / chat_room 1 |

## 2. 남은 결함
| ID | 판정 | 내용 | 근거 |
|---|---|---|---|
| R1 | FAIL (코드) | **최근 본 글·전역 검색**은 카드에 메뉴 처리 함수를 넘기지 않는다. 길게 눌러 「이 글 숨기기」·「신고하기」를 골라도 아무 일이 없다. 찜 화면도 「삭제」만 처리한다. (⋮ 시절부터 있던 결함이 길게 누름으로 그대로 이어짐) | `RecentViewedList.tsx:298-307` · `GlobalSearchView.tsx:666-671` · `FavoritePostCard.tsx:35-37` |
| R2 | FAIL (코드·DB) | 「이 글 숨기기」를 저장하지 않는다 → 다시 열면 돌아온다. 거래 글 숨김 테이블이 없다 | `HomeProductList.tsx`·`PostListByCategory.tsx` `useState<Set>` · DB 조회 |
| R3 | FAIL (코드) | **광고 줄이 여전히 어긋날 수 있다.** 광고 위치를 「글 번호」로만 정하는데, 그 사이에 ① 2칸 전체 「판매완료」 구분 줄(`TradeListSectionDivider` `col-span-full`) ② 샘플 카드 끼움이 들어가면 줄 시작점이 바뀐다. 예: 구분 줄 앞 글이 17개(홀수) → 구분 줄 뒤 5번째 글 뒤에 광고 → 줄 중간에서 끊겨 빈칸. 태블릿 3·4열은 항상 어긋날 수 있다 | `feed-ad-slot-policy.ts` columnCount 2 고정 · `TradeListSectionDivider.tsx:96` · `trade-showcase-model.ts:102` |
| R4 | 미구현 | 광고 「···」(광고 숨기기·신고) 없음 — 처리 기능이 없어 이번에 넣지 않았다 | v6 D4 구현 메모 |
| R5 | 정리 필요 | 쓰지 않게 된 코드: `components/post/NotInterestedCard.tsx`, 번역 키 `popup_menu_interest`·`popup_menu_not_interest`·`popup_menu_exposure_criteria` | 사용처 0 (git grep) |
| R6 | 용어 불일치 | 목록 배지는 「광고」로 바뀌었지만 판매자 화면은 「홍보」: 구매 시트 「홍보 구매」「홍보 중」, 내 판매물품 필터 「포인트 홍보」「홍보 중인 매물이 없어요」 등. 판매자는 「홍보」로 사고 목록에서는 「광고」로 보인다 | `MemberPostPromoteSheet.tsx`·`MyProductFilter.tsx`·`MyProductsView.tsx` · 번역 카탈로그 「홍보」 30여 곳 |
| R7 | NOT_PROVEN | 길게 누름 실기기: iOS 앱(WKWebView) 링크 미리보기가 막히는지, 안드로이드 기본 메뉴 대신 우리 메뉴가 뜨는지, 스크롤과 충돌하지 않는지, 하트를 길게 눌렀을 때 | 코드만 확인 |

## 3. 설계안

### F1 메뉴를 카드 한 곳에서 처리 (R1)
- 「신고하기」: `PostCard` 가 직접 `ReportReasonModal` 을 열고, 신고하면 기존 `markPostReportedByMe`(신고 목록 저장소, 서버 동기화 있음)를 부른다.
- 「이 글 숨기기」: `PostCard` 가 F2 숨김 저장소에 넣는다.
- 신고·숨김된 카드는 `PostCard` 가 저장소를 구독해 자기 자리에 `ReportedPostCard`·`HiddenPostCard`(되돌리기)를 그린다 → 홈·카테고리·찜·최근 본·전역 검색 **어디서나 같은 동작**.
- 홈·카테고리 목록의 `reportPostId`·`hiddenPostIds` 상태와 처리 코드는 삭제(중복 제거). `onMenuAction` 은 「삭제」 후 목록에서 빼는 용도만 남긴다.
- 바뀌는 파일: `PostCard.tsx`, `HomeProductList.tsx`, `PostListByCategory.tsx`, `FavoritePostCard.tsx` (최근 본·전역 검색은 바꿀 것 없음 — 카드가 처리).

### F2 숨김 저장 (R2) — DB 변경, 운영 적용은 Owner 승인
- 테이블 `trade_post_user_hides`: `id uuid pk`, `post_id uuid → posts(id) on delete cascade`, `user_id uuid → auth.users(id) on delete cascade`, `created_at`, `unique(post_id, user_id)`. RLS: 본인 행만 읽기·쓰기. (커뮤니티 `community_post_hides` 와 같은 모양)
- API: `GET /api/my/hidden-posts`(내 숨김 id), `POST·DELETE /api/posts/[id]/hide`.
- 저장소 `lib/trade/hidden-posts-store.ts`: 신고 저장소(`reported-posts-store`)와 같은 방식 — 기기 저장 캐시 + 처음 구독 때 서버에서 한 번 읽어 합침. 비로그인은 기기 저장만.
- 목록 서버 응답에서 빼지 않는다(행은 그대로, 카드만 가림) → 공용 캐시·prewarm 키 계약(`TRADE_HOME_LIST_INVARIANT_IDS`)을 건드리지 않는다.

### F3 광고 줄 경계 계산을 「화면 칸 위치」 기준으로 (R3)
- 순수 함수 `lib/trade/marketplace/plan-trade-grid-sequence.ts`: 실제로 그릴 순서(글·샘플 카드·구분 줄)를 따라가며 **칸 위치(0…열 수-1)**를 센다. 구분 줄·광고 같은 2칸 전체 항목을 만나면 0으로 되돌린다. 광고는 「칸 위치 = 0」이고 「마지막 줄 바꿈 뒤 글 수 ≥ 간격」일 때만 넣는다.
- 열 수: `useGridColumnCount(ulRef)` — `ResizeObserver` 로 `grid-template-columns` 개수를 읽는다(서버·첫 그림은 2). 태블릿 3열·와이드 4열에서도 맞는다.
- 홈·카테고리 둘 다 이 함수 하나만 쓴다. `planFeedAdSlots` 의 columnCount 인자는 이 함수 안으로 들어간다(커뮤니티 1열은 그대로).
- 테스트: 구분 줄이 홀수 뒤에 올 때 · 샘플 끼움 · 2/3/4열 · 광고 간격 4~6 유지.

### F4 광고 「···」 (R4) — 새 기능, Owner 결정
- 「이 광고 숨기기」: 회원별·캠페인별 숨김(기기 저장 + 서버 `feed_ad_user_hides`), 숨기면 그 자리에서 다음 캠페인으로 바뀌거나 빈 광고 줄이면 줄 자체를 그리지 않는다.
- 「광고 신고」: `reports` 에 `target_type='feed_ad'`, `target_id=캠페인 id` 로 쌓고 관리자 신고 목록에 「광고」 종류로 표시.
- 같은 광고 컴포넌트를 커뮤니티 피드도 쓰므로 함께 적용된다.

### F5 남은 코드 정리 (R5)
`NotInterestedCard.tsx` 삭제, 쓰지 않는 번역 키 3개(ko·en) 삭제. 동작 변화 없음.

### F6 용어 통일 (R6) — Owner 결정
- 안: 고객에게 보이는 표시(목록 배지·내 판매물품 배지)는 「광고」, 판매자가 사는 상품 이름은 「광고」로 통일(「홍보 구매」→「광고 신청」, 「홍보 중」→「광고 중」, 「포인트 홍보」→「포인트 광고」).
- `MemberPostPromoteSheet` 는 커뮤니티 글 홍보에도 쓰이므로, 바꾸면 커뮤니티 문구도 같이 바뀐다 → 범위 결정 필요.

### F7 길게 누름 실기기 확인 (R7)
설치 앱(현재 `user_devices.app_version`) 기준 Android·iPhone 각각: 글 길게 누름 → 메뉴 · 링크 미리보기/복사 메뉴 안 뜸 · 스크롤 시작하면 메뉴 안 뜸 · 짧게 누르면 상세 · 하트 짧게 누르면 찜 · 판매완료 글은 메뉴 없음 · 내 글은 수정/삭제 보임.

## 4. 순서·분류
| 순서 | 항목 | 분류 | 승인 |
|---|---|---|---|
| 1 | F7 실기기 확인 (배포 READY 뒤) | 확인만 | — |
| 2 | F1 + F5 | 웹 | 구현 승인 필요 |
| 3 | F3 | 웹 | 구현 승인 필요 |
| 4 | F2 | DB + 웹 | 구현 승인 + 운영 DB 적용 승인 |
| 5 | F4 · F6 | 새 기능 · 문구 | Owner 결정 |

## 5. NOT_PROVEN
- v5 운영 화면(배포 BUILDING) · Owner 휴대폰·계정 화면 · 길게 누름 실기기 · 판매자 광고 테두리(운영 홍보 글 0건) · 광고 줄(운영 노출 광고 0건)
