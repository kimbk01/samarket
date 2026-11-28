# 관심이웃 최종 감사 결함 전체 수정 설계 v2 (2026-11-28 16:20 PHT)

Owner 지시: 「전체 설계해서 결함을 한번에 … 추측이나 땜방이 아닌 설계안 … 정확히 전체 설계안」.
입력: 최종 감사 `docs/audit/interest-neighbor-final-audit-2026-11-28.md` (D1~D9 · R1~R9 · L1~L2 · B1~B2 · X1). 기준 운영 `f7d54c1`.
v1(15:40) → 독립 검토(높음 4·중간 7·낮음 6) → 작업자가 코드·운영 DB 로 직접 확인 → v2.
**설계만 — 승인 전 구현·DB 적용 없음.**

## 0. 작업자 실수 (먼저 보고)
| # | 실수 | 결과 | v2 처리 |
|---|---|---|---|
| W1 | #696 에서 「지금 보는 회원」을 읽는 **새 훅 `useClientProfile` 을 만들었다.** 이미 같은 일을 하는 SSOT `useClientMembershipState`(확인 중·비회원·회원 3상태, 회복 재시도, 25곳 사용 — `hooks/use-client-membership-state.ts`)가 있는데 확인하지 않았다 | 회원 출처가 둘이 됨(SSOT 위반). 운영 화면 동작은 정상(실기 PASS)이나 구조 결함 | §3-1: 회원 출처를 `useClientMembershipState` 하나로 합치고 `useClientProfile` 삭제 |
| W2 | v1 설계에 `lib/auth/discard-empty-account.server.ts:51` 을 「관심이웃 삭제 호출」로 적었다. 실제는 **빈 계정 판정용 활동 개수 확인 항목**(삭제 아님). 감사 보고를 직접 확인하지 않고 옮김 | 그대로 구현했으면 차단·숨김·관심이웃이 있는 계정도 「빈 계정」으로 버려짐 | v2 에서 제외(그 줄은 그대로 둠) |
| W3 | v1 이 차단 조회 GET 호출처를 1곳으로 적음 — `lib/reports/request-user-block.ts:53-59` 누락 | 그대로 지웠으면 신고·채팅방 차단 전부 실패 | §3-2 에 포함 |

## 1. 운영 사실 (설계 전제 — 16:05~16:15 PHT 운영 DB 읽기 전용)
- `user_relationships`: RLS 켜짐, **정책 0개** → 로그인 회원(anon/authenticated)은 직접 읽기·쓰기 불가, 서버(service_role)만 씀. (저장소 마이그레이션 `20260327100000…:548` 의 `user_relationships_own` 정책·`trg_user_relationships_sync_type` 트리거는 **운영에 없음** — 저장소와 운영이 다름)
- `user_social_relations`: RLS 켜짐, 정책 `owner_user_id = auth.uid()`, authenticated INSERT 권한 없음 → 서버만 씀. 기존 트리거 `trg_user_social_relations_blocked_clears_friend`(BEFORE INSERT/UPDATE OF relation_type), `trg_usr_friend_delete_contact_suppress`(AFTER DELETE).
- `profiles`: AFTER UPDATE 트리거 `trg_profiles_contacts_list_bump`(status·deleted_at 포함) 외 BEFORE 감시 트리거들.
- neighbor_follow 14행: 자기 자신·탈퇴·프로필 없음·차단 쌍 모두 0, `type ≠ relation_type` 0(전체 20행).
- 마이그레이션 최신 번호 `20271128240000_…` (2027 번호 체계).

## 2. 근본 원인 3개 → 결함 묶음
| 근본 원인 | 무엇이 틀렸나 | 결함 |
|---|---|---|
| **C1 회원 정보 한 번 읽기** | 화면이 그릴 때 `getCurrentUser()`·`getHydrationSafeCurrentUser()` 를 한 번 읽고 캐시가 늦게 차도 다시 그리지 않음. SSOT `useClientMembershipState` 를 안 씀 | D1(차단 무한 반복) · D2 · D7 · X1 · W1 |
| **C2 관심이웃 불변식을 앱이 흩어져 지킴** | 「관심이웃 행은 탈퇴한 사람·차단 관계를 가리키지 않는다」를 DB 가 보장하지 않음. 상한을 「세고 → 넣기」로 나눠 함 | D4 · D9 · R1 · R2 · R3 |
| **C3 관계 API 계약 불완전** | 조회 오류를 성공으로 바꿈, uuid 미검사, 차단 API 가 **토글**, 저장소가 계정 바뀐 뒤 낡은 응답을 못 막음 | D3 · D5 · D6 · 차단 토글 |
| 단독 | 표시·정리·문서·요청 | D8 · L1 · L2 · B1 · B3 · R4~R9 |

## 3. 반영 단위 (규칙: 도메인 혼합 금지 · 운영 DB 적용 별도 승인 · 통화 코드 무변경)
| 단위 | 내용 | 승인 |
|---|---|---|
| **DB-1** | 관심이웃 불변식·상한 DB 화 (§4) | Owner 「DB 적용 승인」 — PR-A 병합 **전** 적용 |
| **PR-A** | 라운지(커뮤니티)·공개 프로필·내정보 관심이웃·어드민 회원 관심이웃: C1(해당 화면)·C2 앱 정리·C3·D8·L·B·R | 「구현」→ 배포 전 보고 →「병합」 |
| **PR-B** | C1 거래·찜·설정·최근 본·제안·글쓰기·고객센터·내정보 화면 | PR-A 뒤 같은 절차 |
| **PR-C** | C1 모임 화면 3곳(마운트 때 한 번 읽기) | PR-B 뒤 같은 절차 |
순서: DB-1 적용 → PR-A → PR-B → PR-C. 각 단위 운영 반영 확인·실기 뒤 다음 단위.

## 4. DB-1 — `supabase/migrations/20271128250000_neighbor_follow_invariants.sql`
모든 함수: `SECURITY DEFINER` · `SET search_path = public, pg_temp` · `REVOKE ALL … FROM PUBLIC, anon, authenticated` (검토 H3).
1. **RPC `public.neighbor_follow_set_for(p_user uuid, p_target uuid, p_follow boolean, p_limit int) returns jsonb`** — `GRANT EXECUTE … TO service_role` 만(검토 L2: 판 하나, 서버 전용 — 가입 확인을 건너뛰는 회원 직접 호출 없음).
   - 잠금: **두 회원 쌍 잠금** `pg_advisory_xact_lock(hashtextextended('nf_pair:'||least(p_user,p_target)||':'||greatest(p_user,p_target), 0))` + 추가일 때 **회원 잠금** `pg_advisory_xact_lock(hashtextextended('nf_user:'||p_user, 0))` (검토 M1: 차단·탈퇴 트리거도 같은 쌍 잠금을 잡아 「차단 확인 → 추가」 사이 경합 제거).
   - 해제: 삭제 → `{ok:true, following:false, count}`.
   - 추가: 이미 있으면 `{ok:true, following:true, count}` → 대상 `profiles` 없음·`status='deleted'`·`deleted_at` 있음 → `{ok:false, error:'target_unavailable'}` → 양방향 활성 차단(`user_social_relations` blocked, `is_active is distinct from false` — 앱 `SOCIAL_BLOCK_ACTIVE_OR_LEGACY` 와 같은 조건) → `blocked_target` → `count(*) >= p_limit` → `neighbor_follow_limit` → insert(`type`·`relation_type` 둘 다 `neighbor_follow`).
   - `count` = 처리 뒤 저장 수(설계 §1-A `count` 를 채움).
2. **트리거 `trg_usr_blocked_clears_neighbor_follow`** — `AFTER INSERT OR UPDATE OF relation_type, is_active ON user_social_relations FOR EACH ROW WHEN (NEW.relation_type='blocked' AND NEW.is_active IS DISTINCT FROM false)` (검토 L3: 다시 차단하는 UPDATE 포함, updated_at 만 바뀐 것은 제외) → 쌍 잠금 후 두 방향 neighbor_follow 삭제.
3. **트리거 `trg_profiles_withdraw_clears_neighbor_follow`** — `AFTER UPDATE OF status, deleted_at ON profiles FOR EACH ROW WHEN ((NEW.status='deleted' AND OLD.status IS DISTINCT FROM 'deleted') OR (NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL))` + `AFTER DELETE ON profiles` → 그 회원이 맺은·받은 neighbor_follow 삭제. (탈퇴 표현은 `status='deleted'`·`deleted_at` 두 가지뿐 — `profiles_status_check`·`buildWithdrawProfilePatch` 확인. 영구 삭제는 auth→profiles CASCADE 로 DELETE 트리거에 걸림.)
4. **CHECK `user_relationships_type_matches_relation_type CHECK (type = relation_type)`** — 운영 불일치 0건이라 바로 검증. 저장소에만 있고 운영에 없는 동기화 트리거 대신 규칙을 DB 에 고정(R3).
5. 직접 쓰기 경로(검토 H4): 운영은 RLS 정책 0개로 회원 직접 쓰기가 이미 막혀 있음 → **정책을 추가하지 않는다**는 것을 마이그레이션 주석에 명시(저장소 옛 정책 파일과 운영 차이 기록).
6. 데이터: 적용 직전 잔존 0건 재확인 → 적용 → 0건·함수·트리거·CHECK 존재·관계 수 그대로 확인(읽기 전용) → 보고.
7. **롤백 순서(검토 M2)**: ① PR-A 되돌리기(앱 정리 코드 복귀 — Vercel Instant Rollback 또는 되돌림 PR) ② 그 뒤 `drop trigger …; drop function …; alter table … drop constraint …`. 트리거만 먼저 지우면 차단·탈퇴 정리 경로가 0개가 되므로 금지 — 롤백 SQL 은 파일 주석에 순서와 함께.

결과: 저장 행 = 보이는 행(DB 보장) → D4·D9·R1·R2·R3 해소. 메신저 following 읽기·SQL `community_post_viewer_states` 는 바꾸지 않아도 같은 결과.

## 5. PR-A 파일별 설계
### 5-1. C1 — 회원 출처를 SSOT 하나로 (W1 포함)
규칙: 화면이 **그릴 때** 쓰는 회원 정보 = `useClientMembershipState(source)` 하나(`checking`=모름, `guest`, `member`). 누른 순간만 쓰는 곳은 그 순간 `getCurrentUser()`. effect 의존값은 `profile.id` 문자열만(검토 M7: 프로필 고칠 때마다 새 객체가 생김).
| 파일 | 바꿈 |
|---|---|
| `hooks/use-client-membership-state.ts` | 프로필 캐시가 바뀌면 회원 상태를 다시 맞춤: `subscribeSupabaseProfileCache` 구독 → 캐시에 회원이 생기면 `member` 발행, null 이 되면 기존 회복 절차(`resetMembershipStoreForAuthChange`) — 캐시를 채우고 신호를 안 보내는 3곳(`resolve-client-profile-session.ts:37`·`sync-member-account-client.ts:35`·`client-access-flow.ts:179`)도 덮음 |
| `lib/auth/use-client-profile.ts` | **삭제**(W1) · 시험 `client-profile-refresh.test.tsx` 는 회원 상태 시험으로 옮김 |
| `lib/auth/supabase-profile-cache.ts` | #696 구독 기능 유지(위 훅이 씀) |
| `components/community/CommunityDetail.tsx` · `components/community/ui/CommunityMoreMenu.tsx` · `components/community/ui/NeighborFollowButton.tsx` | `useClientProfile()` → `useClientMembershipState("…")` 의 member 프로필. `isPeer = status==='member' && profile.id !== target` (D7) · `isSignedIn = status==='member'` |
| `components/community/UserBlockButton.tsx` | 회원 상태 사용 · `checking` 이면 버튼 비활성 · 누름 = `requireAction("community_report", () => runBlock())`, `runBlock` 은 **그 순간** `getCurrentUser()?.id` 를 읽고 없으면 끝(재귀 제거 — D1) · POST 상태 지정 `{targetUserId, blocked: !current}`, `blocked===null` 이면 비활성 |
| `components/reports/PublicProfileSafetyActions.tsx` | 회원 상태 사용 — `checking` 동안 숨김, 본인이면 숨김(D2) |
| `components/users/PublicProfileNeighborFollow.tsx` | `member` 이고 본인 아니고 차단 아님일 때만 — 설계 §1 「본인·비회원·탈퇴 프로필은 숨김」 그대로. 글 상세 ⋯ 메뉴의 비회원 「로그인 요청」(감사 P2)은 유지 |
| `components/community/post-detail/CommunityRelatedAlertTags.tsx:13` | 렌더 판단에 쓰지 않음 → 누른 순간 `getCurrentUser()` 로(검토 M7) |
| `components/reports/ReportActionSheet.tsx:39` | 회원 상태 사용 |

### 5-2. C3 — 관계 API 계약
| 파일 | 바꿈 |
|---|---|
| `app/api/community/neighbor-relations/route.ts` | ① `isUuidString`(`lib/shared/uuid-string`) 아니면 400 `bad_target`(D5) ② POST: 추가일 때 가입 확인 `requireRegistrationForAction` → RPC `neighbor_follow_set_for` 1회. **거절 코드·상태값 그대로 유지**: `target_unavailable` 404 · `blocked_target` 400 · `neighbor_follow_limit` 409(검토 L4). 거절 순서 변화: 지금은 탈퇴·차단 거절이 가입 확인보다 먼저 → v2 는 가입 확인이 먼저(가입 미완료 회원은 「가입 필요」를 먼저 봄 — 화면 안내 동일 경로) ③ RPC 오류 → 503 `save_failed`(D3) ④ 응답 `{ok, following, count}` ⑤ GET 삭제(호출처 `lib/community/user-relation-client.ts:41` 하나 — 아래 새 GET 으로 이동) |
| **새** `app/api/community/user-relation/route.ts` GET | `{ok, following, blocked}` 한 요청(B3: 지금 2요청). 인증·세션 검사는 차단 GET 과 같은 경로(`validateActiveSession`). 오류 → 503, uuid 검사 |
| `app/api/community/block-relations/route.ts` | POST **상태 지정** `{targetUserId, blocked: boolean}` — 같은 상태면 그대로 200, uuid 검사. **차단 때 통화 종료·방 숨김 호출(`terminateDirectCallsOnBlockBestEffort`·`hideDirectRoomsOnBlockForViewer`, `route.ts:116-140`)과 해제 때 방 복구의 조건·순서는 바꾸지 않는다**(검토 M6 — 통화 규정; 시험 `block-entrypoints-call-termination-parity.test.ts` 유지). 옛 요청(`blocked` 없음) 호환: **이번 배포 동안** `blocked` 가 없으면 지금의 토글 동작으로 처리하고 로그만 남김(열린 탭·재시작 안 한 앱 — 검토 M6) → 다음 배포에서 400 으로 닫음(§9). GET 은 새 GET 으로 옮긴 뒤 삭제 |
| `lib/reports/request-user-block.ts:53-59` | 차단 전 GET 확인 **삭제** — 상태 지정 POST(`blocked:true`)가 같은 상태면 200 이므로 불필요(W3). 영향 화면: 글 상세 신고(`CommunityDetail.tsx:434`)·거래 채팅방 차단(`BlockActionSheet.tsx:46`, roomId 404 대체 경로)·`user-blocks-client.ts:78` |
| `components/community/ui/CommunityMoreMenu.tsx:97-99` | 상태 지정 POST · `blocked===null`(모름)이면 차단 메뉴 비활성(검토 M6) |
| `lib/community/user-relation-client.ts` | 새 GET 1회 · 캐시 키와 세대(`relationGeneration`) 키 모두 `${viewerId}:${target}`(D6·검토 L1) · `relationGeneration` 도 캐시와 같은 200개 정리 |
| `lib/community/neighbor-follow-store.ts` | ① `storeEpoch`(계정 바뀔 때만 +1) — `loadFromServer`·`setNeighborFollow` 가 시작 epoch 를 잡고 끝났을 때 다르면 버림 ② `useNeighborRelation` effect 의존값에 epoch → 비운 뒤 다시 읽음(D6) ③ 구독 해제 시 빈 Set 삭제, 구독자 없고 busy 아닌 states/versions 가 500개 넘으면 오래된 순 삭제(L1) |

### 5-3. C2 앱 정리 (DB-1 적용 뒤에만 병합)
| 파일 | 바꿈 |
|---|---|
| `lib/community-messenger/social-relations.ts:835-853` | 관심이웃 삭제 사본 삭제(트리거가 유일) |
| `app/api/admin/users/[id]/delete/route.ts:237` | `deleteAllNeighborFollowsForUser` 호출 삭제(트리거가 유일) |
| `lib/auth/discard-empty-account.server.ts:51` | **변경 없음**(W2 — 활동 개수 확인 항목) |
| `lib/community/neighbor-follow-list.server.ts` | 삭제 함수 2개 삭제 · `listVisibleNeighborFollowRows` → `listNeighborFollowRows`: 탈퇴·차단 필터 제거(DB 불변식), 프로필 **신원 필드까지 1회**로(B1) · 개수 `countNeighborFollows`(head count) 하나를 상한(RPC 안)·화면·요약이 같은 기준으로 · 필터 열 `type` 하나(R3, CHECK 로 보장) |
| `app/api/me/relations/[type]/route.ts:60` | 두 번째 profiles 조회 삭제 — 위 결과 사용 |
| `lib/neighborhood/social-filter.ts` `fetchNeighborFollowTargetIds` · `lib/mypage/mypage-summary.server.ts` | `type` 하나 · 요약 개수 head count 1회(지금 최대 3조회) |
| 메신저 `service.ts:2817,6323,6644` · `messenger-friend-model.ts:36` | 변경 없음(메신저 도메인 — 불변식으로 같은 결과) |

### 5-4. 단독 항목
| # | 파일 | 바꿈 |
|---|---|---|
| D8 | `app/dibay-overlay.css` · `components/community/post-detail/CommunityCommentComposerForm.tsx:227` | 화면 고정 하단 바 공용 계약: 바가 있는 동안 자기 높이(이미 재는 `barHeight`)를 `<html>` 의 `--dibay-fixed-bottom-bar` 에 적고, 언마운트 때 **자기가 쓴 값일 때만** 지움(검토 L6). `.dibay-toast-stack` bottom 에 `+ var(--dibay-fixed-bottom-bar, 0px)`. 인라인 bottom 을 주는 화면(매장 담기 바·내정보)은 그대로 |
| L2 | `components/community/ui/CommunityMoreMenu.tsx:57-64` | 토스트 타이머를 effect 로 — 이전 타이머 정리 |
| B1-b | `components/mypage/community/NeighborFollowScreen.tsx:69-70` | 화면 들어올 때마다 `fetch("/api/me/relations/neighbor")` 로 다시 읽기(`:49`) → 내정보 목록 공용 캐시 `readMypageListCache`·`writeMypageListCache`(`lib/mypage/use-mypage-cursor-list.ts:38-55`, 기존 만료·개수 정리 그대로)에 담아 보기↔관리 왕복 재사용, 추가·해제·차단 시 `forgetMypageListCache` 로 무효화(검토 L1) |
| B1-c | 같은 파일 사진 줄 | 사람 바꿀 때 이전 피드 요청 `AbortController` 로 취소(검토 L1) |
| R4 | `lib/mypage/mypage-ia.ts:139` · `app/(main)/mypage/settings/[section]/page.tsx:8` · `app/(main)/my/settings/favorite-users/page.tsx:5` | `NEIGHBOR_FOLLOW_MYPAGE_HREF` |
| R8 | `app/api/admin/users/[id]/neighbor-relations/route.ts:118` | 사유 최소 길이 상수를 화면·서버 공용으로, 서버 400 · 감사 기록 방식은 저장소 공통 유지 |
| R9 | `neighbor-follow-contract.ts:29` · `NeighborFollowButton.tsx:140` | 쓰이지 않는 export·반환값 삭제 |
| R7 | 설계 `interest-neighbor-build-design-2026-11-28.md` §5 · `lib/my/schema.md:5` | 구현 차이 기록(어드민 별도 GET·`count` 채움·운영 RLS 사실) · 없는 표 줄 삭제 |
| R6 | `lib/perf/request-budget.ts` · `docs/request-budget-ssot.md` | 새·변경 라우트 6개(`/api/community/user-relation`·`neighbor-relations@post`·`block-relations@post`·`/api/me/relations/[type]`·`/api/me/mypage-summary`·어드민 GET)를 예산 표에 등록. **값 = 저장소 호출 계수기(`lib/perf/supabase-call-counter.ts` — 서버 fetch 를 감싸 라우트별 Supabase 호출을 셈, `docs/request-budget-ssot.md` §2)로 PR 로컬에서 각 라우트 실제 요청 1회 측정한 값의 올림**, 인증·세션 호출 포함(검토 M5). 7일 뒤 Vercel 값으로 내림. 측정값을 PR 본문에 표로 |
| R5 | 시험 | §8 V-R5 |

## 6. PR-B — C1 거래·찜·설정 등 (검토 M4 분류 반영)
| 파일 | 지금 | 바꿈 |
|---|---|---|
| 설정 5곳 `components/my/settings/{Personalization,VideoAutoplay,NotificationsSettings,ChatSettings,CountrySettings}Content.tsx` | 주소로 바로 열면 `userId="me"` 로 설정 읽기·**저장·동기화** | 회원 상태 `member` 일 때만 설정 줄(그 전 뼈대) · `"me"` 대체값 삭제 · `checking` 이 끝나면 회원 상태의 profile.id 사용(검토 M7) |
| `components/recent-viewed/RecentViewedList.tsx:83` · `components/offers/MyOffersView.tsx:77` · `components/favorites/FavoriteProductsView.tsx:90` | `?? "session"` 키 | `member` 일 때만 키 생성 |
| `components/favorites/PostFavoriteButton.tsx:65` · `components/post/PostCard.tsx:197` · `components/product/ProductCard.tsx:47` · `components/chats/ChatProductSummary.tsx:85` · `components/favorites/FavoritePostCard.tsx:24` · `FavoritePostTradeActions.tsx:46` | 내 글 판정이 늦게 맞음 · `PostCard` 는 렌더 읽기로 하이드레이션 불일치 | 회원 상태 사용(구독은 모듈 저장소 1개, 마운트마다 `ensureMembershipResolved` 는 이미 확정이면 즉시 반환 — 구현 때 카드 100장 목록에서 추가 요청 0 시험) |
| `components/philife/PhilifeNeighborhoodWriteForm.tsx:240` · `components/support/SupportModalHost.tsx:376` | 렌더 읽기 | 회원 상태(이벤트 안 읽기 906·1004·135 그대로) |
| 내정보 `app/(main)/my/MyContent.tsx:81` · `MypageGuestGate.tsx:20` · `MyInfoIaCategoryScreen.tsx:190` · `MyPageItemRouteClient.tsx:49` · `components/trade/MarketplaceSellHubPage.tsx:69` | 회원 상태를 쓰면서 `getCurrentUser()` 로도 보충 | 회원 상태 하나로(보충 읽기 삭제) |
| 제외(근거) | `components/community-messenger/GlobalCommunityMessengerIncomingCall.tsx:256` — **통화 코드, 통화 규정상 이 설계에서 변경 금지** · `components/i18n/AppLanguageProvider.tsx:67` — 세션 단계 구독으로 다시 계산(한 번 읽기 아님) · `MoimCreateWizard.tsx:76`·`MoimJoinSheet.tsx:48` — 열 때 읽기 · 어드민 `AdminSupportPage.tsx:330` | 변경 없음, 검사 허용 목록에 근거와 함께 |

## 7. PR-C — 모임 (마운트 때 한 번 읽기)
`components/moim/MoimMemberView.tsx:410` · `MoimScheduleDetailScreen.tsx:187` · `manage/MoimManageMembers.tsx:133` — `useEffect(() => setMyId(getHydrationSafeCurrentUser()?.id), [])` → 회원 상태의 profile.id. (검사 V-C1 이 잡지 못하던 형태 — 검사에 `useEffect(…getCurrentUser…, [])` 형태 추가)

## 8. 검증 (실패 재현 먼저 — 고치기 전 코드에서 FAIL 확인)
| ID | 시험 | 대상 |
|---|---|---|
| V-C1 | 저장소 검사: 사용자 화면에서 그릴 때 회원 읽기(`getCurrentUser()`·`getHydrationSafeCurrentUser()` 렌더 읽기, `mounted ? getCurrentUser()`, `useEffect(… [])` 한 번 읽기) 0 — §6 제외 목록만 근거와 함께 허용. PR-A=커뮤니티 범위 → PR-B=전체 → PR-C=모임 | C1 |
| V-MS | 회원 상태: 캐시가 신호 없이 늦게 차도 `member` 로 바뀜(지금: `checking` 유지 재현) · 프로필 수정(patch)에 id 의존 effect 재실행 없음 | C1·W1 |
| V-D1 | UserBlockButton: 회원 상태 `checking` 에서 그린 뒤 캐시 채우고 누름 → `requireAction` 1회·차단 요청 1회(지금: 반복 재현) · 본문 `blocked` | D1 |
| V-D7 | 공개 프로필: 비회원·본인·확인 중 → 버튼 없음 | D7·D2 |
| V-C3 | neighbor-relations: RPC 오류 → 503(지금: 200 재현) · uuid 아님 400 · 거절 코드·상태값 그대로 · block-relations: 같은 `blocked:true` 두 번 → 해제 안 됨(지금: 토글 재현) · `blocked` 없는 옛 요청 → 이번 배포 동안 토글+로그 · 통화 종료 호출 시험 유지 · request-user-block GET 호출 0 | D3·D5·차단 |
| V-D6 | 저장소: A 로 읽기 시작 → B 로 전환 → A 응답 버림 · 비운 뒤 다시 읽음 · 캐시·세대 키 회원별 | D6 |
| V-DB | 로컬 Postgres 17 파서 통과 + 함수 본문 검토(조건·잠금 순서·권한) · `begin; … rollback;` 은 **로컬 시험 DB 없이 운영에서 하지 않음**. 동시성(상한·차단 경합)은 세션 2개가 필요해 **실측 NOT_PROVEN 으로 미리 표기**(검토 L5) — 대신 잠금 설계 근거를 문서에 | DB-1 |
| V-D8 | 토스트 bottom 에 바 높이 반영·언마운트 시 자기 값만 지움 | D8 |
| V-R5 | 탈퇴·영구 삭제 route 시험(앱 삭제 호출 없음 = 트리거 유일) · 옛 주소 4개 모두 | R5 |
| 로컬 | `typecheck:build`·`typecheck:test`·관련 vitest·변경 파일 eslint·`check:i18n-quality`·`verify:call-surface-cta-ssot`(통화 화면 무변경 확인)·`test:ci` 1회 | 전체 |
| 독립 재감사 | 단위마다 보완 → 재감사 통과 뒤 배포 전 보고 | 전체 |
| 실기(운영 반영 뒤) | iPhone 시뮬레이터 + Xiaomi: 공개 프로필 주소 직접 열기(타인·본인·비로그인)·차단/해제(통화 중 차단은 하지 않음)·관심이웃 추가/해제·상세 토스트가 입력줄 위·내정보 n명=목록 수·보기↔관리 왕복 · PR-B: 설정 주소 직접 열기 → 저장 값이 내 계정(운영 `user_settings` 확인)·찜/내 글 카드 · PR-C: 모임 멤버·일정·관리 화면 내 표시 | 전체 |
| 운영 DB | DB-1 전·후 잔존 0·객체 존재·관계 수 그대로 | DB-1 |

## 9. 전후 영향
- 차단 계약: 호출처 3곳(UserBlockButton·CommunityMoreMenu·request-user-block) 같은 PR, 옛 요청은 한 배포 동안 토글로 받아 줌 → 다음 단위(PR-B) 배포에서 400 으로 닫음(그 사이 앱 재시작으로 새 웹 적용). GET 은 새 GET 으로 옮겨 호출처 0 을 grep 시험으로 고정.
- 트리거: 차단·탈퇴 트랜잭션 안에서 삭제 — 앱 사본과 같은 결과. 메신저·거래 채팅 차단 화면은 관심이웃 버튼이 없어 화면 변화 없음.
- 요청 수: 관계 조회 2요청→1, 관심이웃 추가 조회 4→RPC 1(+가입 확인), 요약 최대 3→1, 목록 profiles 2→1, 보기↔관리 왕복 3→1 — **늘어나는 곳 없음**.
- 통화 화면·통화 API 코드 무변경(차단 라우트의 통화 종료 호출은 조건·순서 그대로). 네이티브 무변경 → `[배포 구분] 웹만` + DB.

## 10. Owner 결정이 필요한 것 (계약에 없어 비워 둠)
1. **차단 목록 조회 오류 시 정책(B2)** — 앱 전체(라운지 피드·댓글·매장 후기·홈 글·선물 친구)가 오류면 「차단 없음」으로 보여 줌(fail-open). 「오류·다시 시도」로 바꿀지.
2. **정지(어드민 「차단」) 회원의 관심이웃 노출** — 레거시 기준 없음.
3. **관리 화면 직접 진입 [완료] 화면 전환 방향** — 내정보 전체 공용 「경로 기준 뒤로」 규칙.

## 11. 구현 기록 — 설계와 다른 점 (PR-A, 2026-11-28 16:10 PHT)
| 항목 | 설계 | 구현 | 근거 |
|---|---|---|---|
| 차단 조회 GET | 새 GET 으로 옮긴 뒤 삭제 | **이번 배포 동안 남김**, 다음 배포에서 옛 토글과 함께 닫음 | 재감사 M1: 열린 옛 탭의 `request-user-block` 이 GET 확인 → 토글 POST 순서라 GET 을 먼저 지우면 이미 차단한 상대가 해제됨 |
| D8 토스트 위치 | 댓글 입력 고정 바 높이를 토스트에 더함 | **하지 않음** | 라운지 댓글 입력칸이 다른 작업(eef4568b2, Owner 지적)으로 화면 고정이 없어져 결함 자체가 사라짐. 공용 하단 줄(`MoimStickyFooter`)에 넣으면 모임 도메인 혼합(재감사 M6) |
| R6 요청 예산 | 6개 라우트, 로컬 계수기 실측 | **2개**(`/api/community/user-relation` 6.0 · `/api/community/neighbor-relations` 4.0) 「실측 전 코드 계산 최대값」 | 로컬 실측은 운영 Supabase 에 로그인 요청을 보내야 해 운영 데이터를 건드림 → 저장소 관례(`/api/home/my-activity`) 따름. 나머지 4개는 7일 Vercel 값으로 등록 남음 |
| D5 uuid 검사 | `isUuidString` | `isUuidLikeString`(8-4-4-4-12) | 목록 모듈과 같은 기준. 글자 주입은 같이 막힘 |
| UserBlockButton 확인 중 | 비활성 | 숨김 | 같은 줄의 신고 버튼(`PublicProfileSafetyActions`)이 확인 중 숨김이라 줄 전체를 같게 |
| ReportActionSheet | 회원 상태 사용 | 제출 순간 `getCurrentUser()` | 그리는 데 쓰지 않음 — §5-1 규칙 「누른 순간만 쓰는 곳은 그 순간 읽기」 |
| DB-1 RPC | 대상 확인 | 대상 프로필 `for share` 잠금 · `on conflict do nothing` | 재감사 M3(탈퇴와 추가 경합) · M2(대상 인덱스 이름 의존 제거) |
| 회원 상태 구독 | 캐시 비워짐도 처리 | 회원 생김만 처리 | 재감사 M7: 비우는 곳이 모두 로그인 변경 신호를 보내 두 번 확인되던 것 |
| 관심이웃 목록 캐시 | 추가·해제·차단 시 무효화 | + 신고·채팅방 차단(`requestUserBlock`) 무효화 · 재사용 30초 | 재감사 M5: 메신저 화면 차단 경로는 이 PR 범위 밖이라 30초로 낡음 범위 제한 |
| 함수 본문 검사 | 로컬 파서 | SQL 문 21개 파서 통과 · **PL/pgSQL 본문 5개는 실행 검사 못 함(직접 검토만)** | 파서 도구에 본문 검사 기능 없음, 로컬 시험 DB 생성은 절대 금지 1번. 마이그레이션은 begin/commit 이라 본문 오류 시 전체 되돌림 |

## 12. DB-1 운영 적용 기록 (Owner 「DB 적용 승인」 · 2026-11-28 16:22 PHT)
- 적용 전(16:22:07): 관계 20행·관심이웃 14행·type≠relation_type 0·대상/주인 탈퇴·없음 0·차단 쌍 잔존 0·같은 이름 객체 0.
- 적용: `apply_migration neighbor_follow_invariants` 성공(파일 본문에서 `begin;`·`commit;` 만 뺀 같은 SQL).
- 적용 후(16:22:51): 함수 5개 모두 security definer·search_path 고정 · 트리거 3개 켜짐 · CHECK valid · 실행 권한 anon·authenticated 없음 / service_role 있음 · 관계 20·관심이웃 14 그대로 · user_relationships 정책 0개 그대로.
- 함수 본문 문법은 운영 생성 때 검사 통과(check_function_bodies). 실행 확인은 PR #700 병합 뒤 실기에서.
- 운영 중인 옛 앱과 호환: 옛 앱은 두 열에 같은 값을 쓰고 직접 삭제도 하므로 CHECK·트리거와 충돌 없음.

## 13. 구현 기록 — PR-B (Owner 「PR-B 구현」 · 2026-11-28 PHT)
설계 §6·§9 대로 하되, 구현·독립 재감사에서 드러난 것을 아래처럼 정했다.

| 항목 | 설계 | 구현 | 이유 |
|---|---|---|---|
| 목록 3곳 키 | `member` 일 때만 키 | 회원 id · 비회원 확정 `"guest"` · 확인 중 키 없음(기다림) · 확인 재시도 소진 `"unresolved"` (`useClientViewerCacheKey`) | 글자 그대로 하면 비회원·확인 실패가 영영 로딩(재감사 B4) — 찜 로그인 이동·최근 본 로그인 안내가 서버 응답으로만 정해짐. 확인 중엔 부르지 않아 「session 키로 부른 뒤 회원 키로 또 부르기」 2회 요청 없음 |
| 설정 5곳 | 회원일 때만, 그 전 뼈대 | 공통 문 `SettingsMemberGate`(뼈대 · 확인 실패면 오류 + 다시 시도) 뒤에서 회원 id 를 받아 그림 | 첫 구현의 빈 id(`""`)가 채팅·알림에서 `GET /api/me/settings` 를 한 번 더 보냈다(재감사 B2) |
| 내정보 5곳 보충 읽기 | 삭제 | 삭제 + 회원 상태 저장소가 「확인 중인데 캐시가 이미 회원」이면 첫 화면부터 회원으로 반환 | 보충 읽기를 지우면 구독 전에 캐시가 찬 경우 첫 화면이 「확인 중」으로 깜빡였다 — 저장소에서 한 번에 해결(재감사 B1) |
| 카드 100장 추가 확인 0 | 이미 확정이면 즉시 반환 | 회원·비회원 확정 모두 마운트로는 다시 확인 안 함 · 로그인 변경·재시도·온라인 복귀만 다시 확인 · 비회원 확정 30초 뒤 붙는 화면은 다시 확인(2차 재감사: 프로필 읽기 일시 실패가 비회원으로 굳던 경로) | 예전엔 비회원 확정 뒤 카드가 붙을 때마다 확인 중→비회원 두 번 다시 그림 + 세션 확인 연쇄(재감사 B5) — 시험으로 재현 |
| 검사 V-C1 | 「그릴 때 한 번 읽기」 0 | 삼항·`Boolean(…)`·여러 줄 `useState` 형태까지 잡음 · 허용 2곳(회원 상태 자체·언어) + 통화 1곳(통화 규정 제외) | 재감사: 첫 정규식이 내정보 2곳을 놓침 |

설계 표 밖의 같은 종류(고치지 않음 · 보고만, 검사에 목록으로 고정해 늘면 실패):
`hooks/useRegionViewerUserId.ts`(지역 「guest」 대체 키) · `hooks/use-mypage-home-summary.ts`(삼항 보충 읽기) · `components/mypage/trust/MypageTrustContent.tsx`(로그인 신호 + 그 순간 읽기) · `hooks/use-representative-address-line.ts`(주소) · `components/group-chat/GroupChatRoomClient.tsx`(마운트 때 한 번 읽기, 채팅 도메인) · `components/mypage/SalesHistoryView.tsx`(불러올 때 읽기).

목록 훅: 보는 사람 키가 바뀌면 앞 키의 401 로그인 안내를 지운다(2차 재감사 2번).

남은 위험: 「unresolved」 키 목록 메모리 캐시는 같은 앱 실행 안 계정끼리 공유될 수 있다(예전 「session」 키와 같은 위험 · 확인 재시도 소진 때만). 하이드레이션 — 서버 스냅샷이 클라이언트와 같은 함수라 늦게 그려지는 경계 안 카드가 서버 HTML(확인 중)과 다를 수 있음. 프로필 캐시가 메모리 전용이라 첫 로드에선 생기지 않고 예전 렌더 중 읽기보다 나빠지지 않음(재감사 B6).

## 14. 구현 기록 — PR-C 모임 (2026-11-28 PHT)
- 설계 §7 세 곳(`MoimMemberView`·`MoimScheduleDetailScreen`·`manage/MoimManageMembers`) 내 id = `useClientMemberId`.
- 같은 모임 폴더의 `MoimReportSheet` 도 마운트 때 회원 여부를 한 번 판정해 늦게 찬 회원이면 신고 사유를 영영 안 읽었다 → 회원 id 를 의존값으로(설계 표 밖이지만 §7 과 같은 결함·같은 폴더). 실패 재현 시험 `components/moim/__tests__/moim-viewer-ssot-pr-c.test.tsx`.
- `MoimCreateWizard`·`MoimJoinSheet` 은 설계 §6 제외(열 때 읽기) 그대로, 검사 허용 목록에 근거와 함께.
- 독립 재감사: 막을 결함 없음 · 시험 빈틈 = 세 화면 「나」 판정은 구조 확인만(실행 시험 없음).
