# 관심이웃 전 과정 감사 (2026-11-28, 재감사)

- 코드 기준: origin/main `a69668328` (2026-11-28 07:34 PHT)
- 운영 DB: `ckdosyydvgzqwpbwuhon` 읽기 전용(`begin read only … rollback`) 조회 6회
- 레거시: 당근 공식 고객센터 FAQ 원문을 브라우저로 직접 열어 확인 — 102 「모아보기」, 510 「특정 사용자 글 안 보기·차단」, 3109 「동네생활 관심목록」
- 화면 판정: 운영 앱을 열지 않았음(실행 상한 규정). 화면 동작은 코드로 판정했고, 운영 화면 PASS 는 이 보고서에 없음
- 시안: `docs/audit/interest-neighbor-mypage-mockup-2026-11-28.html`

## 1. 레거시 기준 (당근 FAQ 102 원문 요약)
| 항목 | 당근 |
|---|---|
| 추가 | 사용자 프로필의 [모아보기] |
| 목록 | [나의 당근 › 모아보기]에서 모아보는 사용자의 **게시글**을 확인 |
| 해제 | [나의 당근 › 모아보기 › 오른쪽 위 '관리'] → 사용자의 [모아보는중] 누르면 해제 (확인 없음) |
| 상대 공개 | 상대는 내가 모아보기 했는지 알 수 없음 |
| 알림 | 새 글마다 알림을 보내지 않음 |
| 상한 | 최대 100명 |
| 목록에서 빠짐 | 상대가 탈퇴하거나, 그 사용자의 요청으로 노출 삭제를 요청하면 제외 |
| 차단(FAQ 510) | 프로필·채팅방 ⋯ › 차단하기. 차단하면 서로 댓글이 보이지 않음 |

## 2. DIBAY 계약 (원문 위치)
| 계약 | 내용 |
|---|---|
| `docs/community-dangnae.md:7` | 라운지는 친구 없이 `neighbor_follow`(관심이웃)·`blocked` 만 |
| `docs/i18n-ssot.md:75` | 관심이웃 = Following |
| `docs/mypage-v2/dibay-mypage-v2-integrated-design.md:133,204,262` | 「관심 사용자」 = **D-4 나의 커뮤니티 · 커뮤니티 관계** |
| 같은 문서 `:334` S22 | 관심 사용자 화면 API = `/api/me/relations/favorite` |
| `dibay-mypage-v3-final-integrated-spec.md:416` | 홈 서비스 그룹 「모아보는 사용자 · 차단한 사용자 · 숨긴 사용자」 |
| 같은 문서 S14 `:810-824` | 관심·차단·숨김 목록, 이웃(`neighbor`) 문구·즉시 해제 유지, 관심 추가 POST 존재 「확인 필요」 |
| `docs/audit/registration-action-cta-ssot-design-2026-11-21.md:130` | `POST /api/community/neighbor-relations` 추가 = 가입 필요, 해제 = 가입 불필요 |

**계약 충돌 (임의 선택 안 함)**: v2 는 「관심 사용자」를 커뮤니티 관계(= 관심이웃)로 정의했는데, S22·S14 와 코드는 별도 표 `user_favorites` 로 연결했다. 운영 DB 에는 이 표가 없다. 상한(100)·목록 안 글 모아보기·어드민 노출 삭제는 어떤 계약에도 없다 → Owner 결정 필요.

## 3. 운영 DB 사실
| 항목 | 값 |
|---|---|
| `user_favorites` 표 | 없음 (`to_regclass` null) |
| 관심이웃 행 / 맺은 회원 / 1인 최대 | 14 / 9 / 4 |
| 마지막 추가 | 2026-11-08 21:11 PHT (그 뒤 추가 0) |
| 맺은 쪽 상태 | verified_user 11 · sns_pending 3 (3건 모두 가입 확인 도입 11-21 이전 06-15·08-24·10-22) |
| 대상 상태 | verified_user 14 · 탈퇴/삭제 0 · 프로필 없음 0 |
| 중복 · 차단 관계인데 남은 행 | 0 · 0 |
| 제약 | UNIQUE(user_id,target_user_id,type) · type/relation_type CHECK · **외래키 없음** |
| DB 함수 중 이 표를 지우는 것 | 없음 (읽기 2개: `get_cm_bootstrap_full_snapshot`, `community_post_viewer_states`) |
| 피드 필터 설정 | `show_neighbor_only_filter = false` |

## 4. 프로세스별 판정
| # | 과정 | 레거시 | DIBAY 현재 (근거) | 판정 |
|---|---|---|---|---|
| P1 | 추가 진입점 | 프로필 [모아보기] | 라운지 상세 본문 아래 안내(`CommunityDetail.tsx:546-548`) + ⋯ 메뉴(`CommunityMoreMenu.tsx:205-214`). 공개 프로필 없음(`PublicProfileSafetyActions` = 신고만) | **FAIL (E6)** |
| P2 | 비회원 | — | 안내는 숨김, 메뉴는 로그인 요청(`requireAction("friend_add")`) | PASS |
| P3 | 본인 글·가져온 글 | — | 둘 다 버튼 숨김(`CommunityMoreMenu.tsx:177,205` · `memberPeerUserId` null) | PASS |
| P4 | 가입 미완료 | — | 추가만 가입 확인(`neighbor-relations/route.ts:120-121`), 안내 창은 전역 fetch 게이트(`registration-guidance-fetch-gate.client.ts`) | PASS |
| P5 | 추가·해제 서버 | 상태 지정 | **토글**(있으면 지움, 없으면 넣음 `:104-126`) | FAIL 원인 (E1) |
| P6 | 한 화면 두 버튼 | 버튼 1개 | 안내·메뉴가 각자 `following` 상태, 메뉴는 처음 한 번만 읽음 → 한쪽 추가 후 다른 쪽 「관심이웃 추가」 그대로 → 누르면 해제 | **FAIL (E1)** |
| P7 | 결과 표시 | 「모아보는중」 | 안내는 문구 바뀜. 메뉴는 닫히기만 하고 알림 없음. 실패(400 blocked_target·500·JSON 오류)는 둘 다 무반응 | **FAIL (E2)** |
| P8 | 상한 | 100명 | 없음 | **FAIL (E9)** · 값은 Owner 결정 |
| P9 | 알림·상대 공개 | 없음·모름 | 알림 코드 없음, 상대에게 보이는 곳 없음 | PASS |
| P10 | 내정보 목록 위치 | 나의 당근 › 모아보기 1곳 | 라운지 › 모아 보기 › 관심이웃(`mypage-ia.ts:138`) + 계정 › 보안·사용자 › 모아보는 사용자(`:217`, 다른 표) 2곳 | **FAIL (E3)** |
| P11 | 계정 › 모아보는 사용자 | — | 없는 표 → API 가 `missing_table` 로 빈 목록(`relations/[type]/route.ts:193-203`), 추가 경로 없음, 요약 숫자 항상 0(`MyPageItemRouteClient.tsx:74`), 옛 `messenger:friends` 도 여기로(`mypage-section-legacy-redirect.ts:39`) | **FAIL (E3)** |
| P12 | 이름 | 모아보기 1개 | 모아보는 사용자 · 친구 / 관심 사용자 · 관심 사용자 · 관심 해제 · 관심 목록에서 삭제 · 관심이웃 (설명 「거래·커뮤니티·메신저 공통」·「마켓·라운지·레터링 공통 참조」는 사실 아님) | **FAIL (E3)** |
| P13 | 목록 내용 | 사람 + 그 사람들 글 | 사람만(사진·닉네임·@ID·지역·추가일). 글 없음 | **FAIL (E5)** |
| P14 | 목록 해제 | [관리] 즉시 | 행 버튼 「관심이웃 해제」 즉시 + 「해제했어요」 토스트, 되돌리기 없음. 즉시 해제는 S14 계약과 같음 | PASS(계약) · 되돌리기 없음은 E8 |
| P15 | 목록 화면 틀 | — | 테두리 상자 안 목록 테두리(이중) `CommunityTab.tsx:99-101` (관심·차단·숨김은 상자 없음 `AccountTab.tsx:205-210`) | **FAIL (E7)** |
| P16 | 목록 → 프로필 | 프로필에서 다시 모아보기 | `/u/{dibay_id}` 로 이동, 프로필에 버튼 없음 → 되돌릴 곳 없음 | FAIL (E6) |
| P17 | 탈퇴한 상대 | 목록에서 제외 | 탈퇴는 profiles 만 바꾸고 관계 행 남음, 목록 API 상태 확인 없음(`relations/[type]/route.ts:53-71`) → 남아 보이고 프로필은 404. 영구 삭제는 외래키·정리 함수 없음 → 닉네임 대신 **회원 UUID 가 이름 자리에** 보임(`UserListContent.tsx:176`, `profiles_id_fkey` ON DELETE CASCADE 로 프로필만 사라짐). 빈 계정 스스로 지우기만 관계 행 삭제(`discard-empty-account.server.ts:51-52`). 운영 현재 해당 0건 | **FAIL (E4)** |
| P18 | 차단 | 차단 시 서로 안 보임 | 라운지 ⋯ 차단만 내 관심이웃 삭제(`block-relations/route.ts:115-124`). 메신저·거래 채팅 차단(`blockUserSocial` `social-relations.ts:758-790`)은 안 지움, 상대가 나를 차단해도 안 지움, 목록 API 도 차단 미제외. 운영 현재 0건 | **FAIL (E4)** |
| P19 | 숨김(이 사용자 글 보지 않기) | 별개 기능 | 관심이웃과 무관하게 유지 | 계약 없음 · 결함 아님 |
| P20 | 관계 사용처(글 모아보기) | 모아보기 목록 | 피드 「관심이웃 글만 보기」만 있음 → 운영 설정 false 로 숨김. 켜도 DB 에서 안 거르고 가져온 21건(추천순 200건) 안에서만 걸러 빈 페이지·누락(`queries.ts:304-307,553-557,586-597`) | **FAIL (E5)** |
| P21 | 라운지 내 활동 `/philife/my` | — | 「피드 상단에서 관심이웃 필터를 켜면…」 안내(`CommunityMyHubClient.tsx:48-55`) — 운영에서 필터 없음 → 없는 기능 안내. 이 화면은 앱 안 진입 링크 없음(직접 주소만) | **FAIL (E10)** |
| P22 | 서버 비용 | — | 상세 서버 상태 조회가 `following_author` 계산 후 화면 미사용(`viewer-state.ts:107-113,176`), 화면은 GET 2회 따로(`user-relation-client.ts:35-41`) | 효율 (E11) |
| P23 | 어드민 | 사용자 요청 시 노출 삭제(운영 처리) | 필터 띠 켜기/끄기만(`/admin/community/sections`). 회원별 관심이웃 조회·삭제 없음 | **FAIL (E12)** |
| P24 | 데이터 무결성 | — | 중복 0, 유일 제약 있음, 본인 행만 DELETE(`relations/[type]/route.ts:262-284`) | PASS |
| P25 | 문구 i18n | — | ko·en 키 모두 있음, 영어 Following 일치. 이웃 해제 확인 문구 2키는 사용처 없음(`UserListContent.tsx:57-61`) | PASS · 정리 E8 |

## 5. 결함 목록과 수정안
| # | 결함 | 수정안 | 바뀌는 파일 | 같은 단계에서 함께 처리 |
|---|---|---|---|---|
| E1 | 상세 두 버튼 상태 분리 + 토글 API → 반대 동작 | `POST {targetUserId, following:true/false}` 상태 지정(같은 값이면 그대로 200). 관계 상태 저장소 1개(`user-relation-client` 구독)로 안내·메뉴·프로필이 같은 값 | `neighbor-relations/route.ts`, `user-relation-client.ts`, `CommunityNeighborPrompt.tsx`, `CommunityMoreMenu.tsx` | `member-action-registry.ts:113` 분류 유지(추가만 가입 필요) |
| E2 | 성공(메뉴)·실패 무반응 | 성공 토스트 「관심이웃을 추가했어요/해제했어요」, 실패 토스트(상대 차단·상한·서버) | 위 2개 + i18n | — |
| E3 | 내정보 관계 2곳·빈 목록·이름 6종 | 관심이웃 하나로: 계정 › 모아보는 사용자 행 처리(Owner 결정 1), `favorite` 경로·`user_favorites` 읽기 제거, 요약 숫자 제거 또는 관심이웃 수, 레거시 `messenger:friends` → 관심이웃, 문구 키 정리 | `mypage-ia.ts`, `mypage-mobile-nav-registry.ts`, `mypage-nav.ts`, `AccountTab.tsx`, `MyPageItemScreen.tsx`, `relations/[type]/route.ts`, `user-relation-release.ts`, `mypage-section-legacy-redirect.ts`, i18n | v3 S14 문서 갱신 |
| E4 | 탈퇴·삭제·차단 상대가 목록에 남음 | 목록 API: 대상 profiles `status`·`deleted_at` 확인, 프로필 없음·차단(양방향) 제외. `blockUserSocial` 에서 양방향 neighbor_follow 삭제. 회원 탈퇴·영구 삭제 시 양쪽 관계 행 삭제 | `relations/[type]/route.ts`, `social-relations.ts`, 탈퇴·`admin-user-deletion.ts` 경로 | 기존 행 정리는 운영 DB 적용 승인 필요(현재 대상 0건) |
| E5 | 관계를 맺어도 쓰이는 곳 없음 | 관심이웃 화면 = 사람 줄 + 그 사람들 라운지 글(최신순, `listCommunityPostsForUser` 계열 재사용, DB 에서 `user_id in` 으로 거름). 피드 필터는 DB 거름으로 고치고 켤지는 Owner 결정 2 | 신규 `/api/me/relations/neighbor/posts`, `CommunityTab.tsx`, `queries.ts` | 요청 예산(`lib/perf/request-budget.ts`) 확인 |
| E6 | 공개 프로필 버튼 없음 | 프로필에 E1 공용 버튼 | `app/(main)/u/[username]/page.tsx`, 공용 버튼 | — |
| E7 | 목록 이중 테두리 | `AccountUserListSection` 과 같은 셸 | `CommunityTab.tsx` | — |
| E8 | 되돌리기 없음·죽은 키 | 해제 토스트 [되돌리기] = E1 POST following:true. 안 쓰는 키 삭제 | `UserListContent.tsx`, i18n | — |
| E9 | 상한 없음 | 서버 상한(레거시 100) + 안내 토스트 | `neighbor-relations/route.ts` | Owner 결정 3(값) |
| E10 | `/philife/my` 없는 필터 안내 | 안내 카드를 관심이웃 화면 링크로 바꾸거나 제거 | `CommunityMyHubClient.tsx` | — |
| E11 | 서버 계산 미사용·GET 2회 | 상세 첫 데이터의 `following_author` 로 초기 상태, 별도 GET 제거 | `viewer-state.ts` 소비처, `user-relation-client.ts` | — |
| E12 | 어드민 관리 없음 | 아래 6절 | — | — |

## 6. 어드민 관리 필요성
| 필요 | 근거 | 현재 | 제안 |
|---|---|---|---|
| 회원 요청 시 노출 삭제 | 당근 FAQ 102 「사용자의 요청에 따라 모아보기 노출 삭제」 | 없음 — 운영자가 DB 로만 가능 | 회원 상세 › 관계 탭: 「이 회원을 관심이웃한 회원 n명」·「이 회원의 관심이웃 n명」 목록 + 행 삭제(감사 로그) |
| 남용 대응(특정인 대량 추가) | 상한 100 과 함께 | 없음 | 위 목록 수로 확인. 별도 신고 기능은 불필요(차단·신고 기존 경로) |
| 피드 필터 켜기/끄기 | 운영 설정 | 있음(`/admin/community/sections`) | 유지 |
| 상한 값 | — | — | 코드 상수(어드민 설정 불필요) |
운영 규모: 전체 14행·9명(2026-11-28). 어드민 화면 추가 여부는 Owner 결정 4.

## 7. Owner 결정 필요 (4건)
1. 계정 › 「모아보는 사용자」 행: (가) 삭제하고 라운지 › 관심이웃 하나만 / (나) 행을 남기고 같은 화면으로 연결
2. 피드 「관심이웃 글만 보기」를 운영에서 켤지 (E5 수정 후)
3. 상한 값 (레거시 100)
4. 어드민 회원 상세 관계 탭(조회·노출 삭제)을 지금 만들지

## 8. 결함 없음
P2 비회원 · P3 본인/가져온 글 · P4 가입 확인 · P9 알림·상대 공개 · P14 즉시 해제(계약 일치) · P19 숨김과 분리 · P24 무결성·권한 · P25 ko/en 문구.
