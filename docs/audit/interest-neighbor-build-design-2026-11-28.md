# 관심이웃 구현 설계안 (2026-11-28)

근거: 감사 `docs/audit/interest-neighbor-audit-2026-11-28.md` · 시안 `docs/audit/interest-neighbor-mypage-mockup-2026-11-28.html` · Owner 「시안대로 결정」(2026-11-28).
코드 기준: origin/main `a69668328`. [배포 구분] = **웹만**(네이티브·DB 마이그레이션 없음). PR 1개·병합 1회.

## 0. 결정 (시안 기준 확정)
| # | 결정 | 시안 근거 |
|---|---|---|
| 1 | 계정 › 「모아보는 사용자」 행 **삭제**, 관심이웃은 라운지 › 모아 보기 › 관심이웃 하나 | 시안 ① 취소선 행 |
| 2 | 피드 「관심이웃 글만 보기」 **꺼진 채 유지** (운영 설정 변경 없음). 거름은 DB 단계로 고침(관심이웃 화면이 같은 경로를 씀) | 시안에 피드 필터 없음 · 시안 ② 글 목록 |
| 3 | 상한 **100명** | 시안 ②③④ 「n / 100명」 |
| 4 | 어드민 **노출 삭제** 만듦 | 시안 대조표 「목록에서 제외 + 어드민에서 노출 삭제」 |

## 1. 바뀌는 것 (결함 → 변경 → 파일)
### A. 관계 상태 하나로 (E1·E2·E6·E8·E9·E11)
- 서버 `POST /api/community/neighbor-relations`: 본문 `{targetUserId, following:boolean}` = **상태 지정**. 같은 상태면 그대로 200. `following` 없으면 400(토글 제거). 추가일 때만 가입 확인(현행 유지)·상대 차단 확인(양방향)·**100명 상한 → 409 `neighbor_follow_limit`**. 응답 `{ok, following, count}`.
  - 파일: `app/api/community/neighbor-relations/route.ts`. 개발용 샘플 분기는 같은 규칙으로 맞춤.
- 화면 상태 저장소 1개: `lib/community/user-relation-client.ts` 에 대상별 관심이웃 상태 구독(`useNeighborFollowState(targetUserId, initial)`)·`setNeighborFollow(target, following)` (낙관 반영 → 실패 시 원복 + 토스트).
  - 첫 값 = 글 상세 응답 `post.viewer.following_author`·`blocked_author` (`lib/neighborhood/queries.ts:996` 이미 계산) → 상세의 별도 GET 2회 제거. 상세 밖(프로필·내정보)은 GET 1회.
- 공용 버튼 `components/community/ui/NeighborFollowButton.tsx`(신규): [관심이웃 추가](주 버튼) ↔ [관심이웃 ✓](테두리 초록). 상세 안내·프로필·내정보 관리가 같이 씀.
- 상세: `CommunityNeighborPrompt.tsx` 는 공용 버튼 사용. `CommunityMoreMenu.tsx` 메뉴 항목은 같은 구독 값으로 「관심이웃 추가/해제」 표시.
- 토스트(i18n ko·en): 추가 「{name}님을 관심이웃으로 추가했어요」 · 해제 「{name}님 관심이웃을 해제했어요」+[되돌리기] · 상한 「관심이웃은 최대 100명까지 추가할 수 있어요」 · 상대 차단 「이 이웃은 관심이웃으로 추가할 수 없어요」 · 실패 「잠시 후 다시 시도해 주세요」(기존 키 있으면 재사용).
- 공개 프로필 `/u/[username]`: 프로필 머리 아래 전체 폭 공용 버튼(시안 ⑥). 본인·비회원·탈퇴 프로필은 숨김. 파일: `app/(main)/u/[username]/page.tsx`, `components/users/PublicUserProfileView.tsx`.

### B. 내정보 관심이웃 화면 (E3·E5·E7·E8·시안 ①~④)
- 경로 그대로 `/mypage/section/community/community-friends`. 본문 신규 `components/mypage/community/NeighborFollowScreen.tsx`:
  - 보기 모드(시안 ②): 사진 줄 [전체]+관심이웃(추가 최신순) → 아래 글 목록 최신순 · 「관심이웃 n / 100명」 · 사진 누르면 그 사람 글만.
  - 글 목록 = 기존 피드 API 재사용 `GET /api/community/neighborhood-feed?globalFeed=1&neighborOnly=1&sort=latest(&authorId=)` + 기존 피드 카드 → 공개 여부·숨김·차단 제외 규칙이 피드와 같음(SSOT). 무한 스크롤.
  - 관리 모드(시안 ③): 머리줄 오른쪽 [관리]↔[완료](`MyScreen rightSlot`). 행 = 사진·닉네임·@ID·지역·추가일 + 공용 버튼. 해제 즉시 → 버튼 [관심이웃 추가] + 토스트 [되돌리기]. 화면을 나가면 목록에서 빠짐.
  - 빈 화면(시안 ④): 제목·설명 + [라운지 둘러보기] → `/philife`.
  - 파일: `components/mypage/tabs/CommunityTab.tsx`(users 분기 교체 → 이중 테두리 제거), `components/mypage/MyPageItemRouteClient.tsx`(이 항목만 rightSlot), i18n.
- 라운지 › 모아 보기 › 관심이웃 행 「n명」(시안 ①): 요약 필드 `neighborFollowCount` 추가(목록과 같은 함수로 셈). 파일: `lib/mypage/mypage-summary.server.ts`·`mypage-summary-types.ts`·`mypage-ia.ts:138`·`MyInfoHomeCategoryHub.tsx`.
- 계정 › 「모아보는 사용자」 삭제(결정 1):
  - 메뉴: `mypage-ia.ts:217`, `mypage-mobile-nav-registry.ts:81`, `mypage-nav.ts:29`, `mypage-item-hub-wait.ts:25` 에서 제거.
  - 옛 주소 → 관심이웃: `/mypage/section/account/favorite-users`, `/my/settings/favorite-users`(`app/(main)/my/settings/favorite-users/page.tsx`), `mypage/settings/[section]` 의 `following`, `messenger:friends`(`mypage-section-legacy-redirect.ts:39`) → 모두 `/mypage/section/community/community-friends`.
  - 화면·API: `AccountTab.tsx` favorite 분기·요약 칸 「관심 사용자」 제거, `MyPageItemScreen.tsx:34` 제거, `relations/[type]` 의 `favorite`(user_favorites) 분기 제거 → 400, `UserListContent`·`user-relation-release` 의 favorite·neighbor 타입 제거(차단·숨김만 남음).
  - i18n: 안 쓰게 되는 키 삭제(`settings_following_users`, `mypage_comp_nav_sec_account_favorite_users_*`, `mypage_mnav_account_favorite_users*`, `mypage_comp_settings_users_empty_favorite`, `mypage_comp_account_favorite_users`, `mypage_s14_release_favorite`, `popup_q_unfavorite_named`·`popup_btn_unfavorite`(다른 사용처 없을 때만), `mypage_s14_confirm_neighbor_*`, `mypage_comp_friends_empty`(사용처 확인 후)).
- `/philife/my` 의 없는 필터 안내 카드 제거(E10, 시안에 없는 새 요소는 넣지 않음). 파일 `CommunityMyHubClient.tsx`, 스켈레톤 `PhilifeRouteSkeletons.tsx:72`.

### C. 목록에서 빠지는 경우 (E4 · 레거시 「탈퇴 시 제외」)
- 목록·개수·글 목록 공통 함수 `lib/community/neighbor-follow-list.server.ts`(신규): 대상 profiles 가 없음·`status='deleted'`·`deleted_at` 있음 → 제외, 양방향 차단 → 제외.
- 차단 공통 `blockUserSocial`(`social-relations.ts:758`) 안에서 **양방향** neighbor_follow 삭제 → 메신저·거래 채팅·라운지·내정보 차단 경로가 모두 같음. 라운지 라우트의 따로 지우던 코드(`block-relations/route.ts:115-124`)는 공통으로 대체.
- 회원 탈퇴(`lib/admin/admin-user-deletion.ts` withdraw)·영구 삭제(purge, `auth.admin.deleteUser` 전) 때 양쪽 관계 행 삭제. 빈 계정 지우기는 이미 함(`discard-empty-account.server.ts:51-52`).
- 기존 데이터: 운영 해당 0건(2026-11-28 조회) → DB 적용 없음.

### D. 피드 필터 거름을 DB 단계로 (E5, 결정 2: 설정은 꺼진 채)
- `lib/neighborhood/queries.ts`: `neighborOnly` 이고 로그인이면 관심이웃 id 를 **먼저** 읽어(1회) 본 조회에 `.in("user_id", ids)` → 21건 안 거르기·빈 페이지 제거. 관심이웃 0명이면 DB 조회 없이 빈 결과. `neighborOnly` 아닐 때 경로·요청 수 변화 0.
- 성능 민감 경로라 `verify:parity-gates` 중 피드 관련 검사 1회.

### E. 어드민 노출 삭제 (결정 4)
- 회원 상세 › 커뮤니티 패널 섹션 추가 「관심이웃」(`AdminMemberCommunityPanel.tsx` SECTIONS 에 `neighbors`): 두 목록 「이 회원이 추가한 n」·「이 회원을 추가한 n」(닉네임·@ID·추가일, PHT). 행 [노출 삭제] → 확인 창 → 삭제 + 관리자 감사 기록(기존 `lib/audit` 경로).
- API: `GET /api/admin/users/[id]/community?section=neighbors`(기존 라우트 섹션 추가), `DELETE /api/admin/users/[id]/neighbor-relations?id=`(신규, 관리자 권한 확인·행 소속 확인).
- 파일: `lib/admin-users/member-community-tab.ts`, `app/api/admin/users/[id]/community/route.ts`, 신규 DELETE 라우트, i18n(관리자).

## 2. 영향받는 화면·호출처 (같은 PR 에서 정리)
| 바뀌는 것 | 영향 | 처리 |
|---|---|---|
| POST 토글 → 상태 지정 | 호출처 2곳(안내·메뉴) | 둘 다 같은 PR 에서 새 본문으로. 구 앱 바이너리는 웹 코드라 재시작으로 함께 바뀜 |
| `favorite` 경로 삭제 | 계정 메뉴·옛 주소 4개·AccountTab·MyPageItemScreen·테스트 | 모두 관심이웃으로 연결, 관련 테스트 갱신 |
| `UserListContent` neighbor 타입 제거 | CommunityTab 만 썼음 | 새 화면으로 교체 |
| `blockUserSocial` 에 관심이웃 삭제 | 메신저·거래 채팅·라운지·내정보 차단 | 차단 결과 동작은 그대로, 관심이웃 삭제만 더함 |
| 요약 필드 추가 | `/api/me` 요약 1회 조회에 count 1개 | 요청 예산 `lib/perf/request-budget.ts` 확인·필요 시 값 조정 |
| 피드 `neighborOnly` | 피드·관심이웃 화면 | 꺼진 경로는 변화 없음 |
| 상세 GET 2회 제거 | 상세 진입 요청 −2 | 예산 값 낮춤(같은 PR) |

## 3. 검증 (병합 전)
- 코드: `typecheck:build` · 변경 파일 eslint · 관련 vitest · `check:i18n-quality` · `verify:routes`.
- 시험(실패 재현): ① 안내에서 추가 → 메뉴 표시 「관심이웃 해제」·메뉴 「추가」 재요청이 해제로 바뀌지 않음(상태 지정) ② 100명째 이후 409 ③ 상대 차단·내가 차단 시 추가 거절·목록 제외 ④ 메신저 차단 후 양쪽 관심이웃 삭제 ⑤ 탈퇴·프로필 없는 대상 목록 제외 ⑥ `neighborOnly` 1페이지에 관심이웃 글이 22번째 이후에 있어도 나옴 ⑦ 옛 주소 4개 → 관심이웃 ⑧ 어드민 삭제 권한·감사 기록.
- 화면: 시안 6화면과 요소별 대조표, 휴대폰 320·375·390, 태블릿 600·768·1024, Chrome + iOS 시뮬레이터 Safari 캡처(로컬 개발 서버·운영 DB 미사용).
- 독립 재감사(결론 미제공 에이전트) 통과 후 배포 전 보고 → Owner 「병합」 뒤 병합 → 운영 SHA 1회 확인 → 실기(Android·iPhone 각 1회, 실행 상한 안).

## 4. 하지 않는 것
- 피드 필터 운영 설정 변경 · 새 글 알림 · 상대에게 알림 · 거래 판매자 「모아보기」(라운지 관심이웃 범위 밖) · DB 마이그레이션.

## 5. 구현 메모 (2026-11-28 구현 중 확정)
- `blockUserSocial`(`lib/community-messenger/social-relations.ts`)은 기존 import 사슬로 통화 수신 화면 묶음(`CallIncomingChromeRoot` → … → `direct-call-permission`)에도 들어간다. 서버 전용 모듈을 import 하면 클라이언트 빌드가 깨져(개발 서버에서 재현), 같은 삭제 조건을 그 함수 안에 직접 썼다. 통화 함수·통화 경로 동작 변경 없음(`blockUserSocial` 호출처 = 차단 라우트 4개뿐).
- 내정보 관심이웃 머리줄 [관리]는 관심이웃이 1명 이상일 때만 보인다(시안 ④ 빈 화면에 없음).
- 빈 화면 문구·CTA 의 서비스 이름은 브랜드 SSOT(`BK.FEED` = 「정보 공유」, 목적지 `/philife`)를 쓴다 — 시안의 「라운지 둘러보기」와 글자가 다르다(목적지 같음).
- 글 목록은 피드 카드(`CommunityCard`)를 그대로 쓴다(글 표시 SSOT) — 시안 ②의 단순 행 대신 피드와 같은 카드. 카드 색 범위 `[data-community-ui]` 를 목록에 붙였다.
- 어드민 노출 삭제 확인 = `confirmAdminAction({ action: "delete" })`(사유 필수·재입력 없음), 사유는 감사 기록 `neighbor_follow_admin_remove.after_json.reason`.

### 5-1. 전체 수정 설계 v2 반영 (2026-11-28 · `interest-neighbor-full-fix-design-2026-11-28.md`)
- 위 첫 메모(`blockUserSocial` 안 삭제 사본)는 **폐기** — 차단·탈퇴·삭제 때 관심이웃 정리는 DB 트리거 하나(`supabase/migrations/20271128250000_neighbor_follow_invariants.sql`). 추가·해제는 DB 함수 `neighbor_follow_set_for` 1회(상한·차단·탈퇴를 한 트랜잭션).
- §1-A 응답: POST 응답에 `count` 를 이번에 채운다(`{ok, following, count}`). 관계 조회는 새 `GET /api/community/user-relation`(관심이웃·차단 한 요청) — 옛 `neighbor-relations` GET·`block-relations` GET 삭제. 차단 POST 는 상태 지정 `{targetUserId, blocked}`.
- §1-E 어드민: 기존 `community?section=neighbors` 대신 별도 `GET/DELETE /api/admin/users/[id]/neighbor-relations` 로 구현됨(첫 구현 그대로). 사유는 관리자 공용 `parseAdminReason`(최소 2자) 서버 검사.
- 운영 사실: `user_relationships` RLS 정책 0개(회원 직접 쓰기 불가), 저장소의 옛 정책·type 동기화 트리거는 운영에 없음 — 대신 CHECK `type = relation_type`.
