# 글 상세 — 주소로 바로 열면 로그인 정보가 비어 관심이웃 안내가 사라지는 결함 · 수정 설계 (2026-11-28 14:40 PHT)

Owner 지시: 「원인 감사 진행」 → 「수정 설계 진행」. **설계만 — 승인 전 구현 안 함.** 기준 운영 `e11baaa`.

## 0. 작업자 실수 (먼저 보고)
- 14:16 PHT 실기 보고의 「상세 토스트 iPhone 미표시」는 **오판**. 누른 뒤 0.6초(서버 응답 전) 캡처만 보고 판정. 재확인 14:25·14:28 PHT — ⋯ 메뉴·안내 상자 모두 토스트 1.4초 안에 표시 → **PASS 로 정정**.

## 1. 결함 (FAIL) — 증거
조건: iPhone 18 Pro 시뮬레이터 Safari, 운영, 계정 zxzx11, 글 `15e8522c…`(GOLF), 14:24~14:28 PHT.

| 진입 | 관심이웃 안내 상자 | 댓글 입력줄 아바타 | ⋯ 메뉴 관심이웃 |
|---|---|---|---|
| 주소로 바로 열기(공유 링크·새로고침·새 탭과 같음) | **없음** | **「?」** | 있음 |
| 라운지 피드에서 눌러 이동 | 있음 | 내 사진 | 있음 |

Android 앱 알림·공유 링크 진입, Android 브라우저 직접 열기 = NOT_PROVEN.

## 2. 근본 원인 (코드 확인)
1. `components/community/CommunityDetail.tsx:85-86` — `me = mounted ? getCurrentUser() : getHydrationSafeCurrentUser()`. 로그인 정보를 **그리는 순간 한 번 읽을 뿐 바뀌어도 다시 그리지 않는다**.
2. `lib/auth/supabase-profile-cache.ts` — 프로필 캐시는 모듈 변수 하나. **바뀌어도 아무에게도 알리지 않는다.**
3. 캐시를 채우는 곳 7곳 중 3곳(`resolve-client-profile-session.ts:37`·`sync-member-account-client.ts:35`·`client-access-flow.ts:179`)은 알림 신호(`TEST_AUTH_CHANGED_EVENT`)도 보내지 않는다. 신호를 받는 화면 21곳도 각자 따로 연결(공용 부품 없음).
4. 주소로 바로 열면 상세가 캐시보다 먼저 그려진다 → `me = null` 고정 → `CommunityDetail.tsx:587` 조건(`me?.id && …`)에서 안내 상자 제외, 입력줄 아바타 「?」. ⋯ 메뉴는 관심이웃 저장소가 바뀔 때 다시 그려져서 나온다(우연히 정상).
5. 같은 「한 번 읽기」 코드: `NeighborFollowButton.tsx:36-37`(안내 상자·프로필·관리 공용 훅 — `isSignedIn` 이 늦게 맞음), `CommunityMoreMenu.tsx:44-45`(본인 글 판정 `me?.id === peerId` 가 늦게 맞음).

이 코드는 이번 관심이웃 PR 이 만든 것이 아니다(읽기 03-30, 안내 조건 11-12). 관심이웃 안내 상자가 영향을 받는다.

## 3. 수정안 (근본 — 캐시를 「바뀌면 알리는 값」으로)
| # | 파일 | 바꾸는 것 |
|---|---|---|
| 1 | `lib/auth/supabase-profile-cache.ts` | 구독 목록 추가. `setSupabaseProfileCache`·`patchSupabaseProfileCache` 가 값이 **실제로 바뀐 때만** 구독자에게 알림. `subscribeSupabaseProfileCache(fn)` 내보냄. 서버(window 없음)는 지금처럼 아무것도 안 함. |
| 2 | 새 `lib/auth/use-client-profile.ts` | `useClientProfile()` = `useSyncExternalStore(subscribe, getSupabaseProfileCache, () => null)`. 서버·하이드레이션 첫 그림 = null(서버 HTML 과 같음), 캐시가 차면 그 순간 다시 그림. |
| 3 | `components/community/CommunityDetail.tsx` | 85-86 의 한 번 읽기를 `useClientProfile()` 로. `mounted` 는 알림 정리 요청(172-179)에만 남김. |
| 4 | `components/community/ui/NeighborFollowButton.tsx` | 36-37 을 `useClientProfile()` 로. `ensureNeighborStoreViewer` 는 계정 값 기준 그대로. |
| 5 | `components/community/ui/CommunityMoreMenu.tsx` | 44-45 를 `useClientProfile()` 로. |

캐시를 채우는 7곳은 **고치지 않는다** — 캐시 자체가 알리므로 신호를 안 보내는 3곳도 자동으로 덮인다. 기존 `TEST_AUTH_CHANGED_EVENT` 와 그것을 받는 21곳은 그대로.

## 4. 전후 영향
- **다시 그리기**: 캐시가 바뀔 때 위 3개 화면만 다시 그린다(로그인 직후 1~2번). 다른 화면 영향 없음.
- **요청 수**: 새 요청 없음. 상세 첫 데이터(`post.viewer`)가 관심이웃 시작 값을 주므로 관심이웃 조회도 늘지 않는다. 운영 Supabase 예산 변화 없음.
- **`me` 를 쓰는 효과**: `CommunityDetail` 의 `me` 의존은 콜백(댓글 공감·수정·삭제·신고)·메모(입력줄 아바타)뿐 — 값이 맞춰질 뿐 요청을 다시 보내지 않는다.
- **로그아웃·계정 전환**: 캐시가 null·다른 계정으로 바뀌면 즉시 반영(지금보다 정확). 탭 계정 전환은 기존대로 전체 새로고침.
- **하이드레이션**: 서버 그림 = null, 첫 클라이언트 그림 = null 로 같아 불일치 경고 없음(지금 코드는 첫 그림에서 캐시를 읽어 불일치 가능).
- 통화·메신저·네이티브 코드 변경 없음. 웹만.

## 5. 시험 (실패 재현 먼저)
- 단위: 캐시 구독 — 값 바뀔 때 1회 알림, 같은 값이면 알림 없음, 구독 해제 뒤 알림 없음, 서버 환경에서 아무것도 안 함.
- 재현: 캐시가 빈 상태로 `useClientProfile()` 을 쓰는 부품을 그린 뒤 캐시를 채우면 다시 그려져 사용자 값이 나온다(지금 방식은 null 그대로 → 실패 재현).
- 검사: `typecheck:build` · 관련 vitest · 변경 파일 eslint · `check:i18n-quality`(문구 변경 없음).
- 실기(운영 반영 뒤): iPhone 시뮬레이터 — 같은 글을 **주소로 바로 열기**에서 안내 상자·입력줄 내 사진, 피드 이동 진입 회귀 없음, 본인 글 ⋯ 메뉴에 관심이웃 없음. Android 1대 — 앱에서 같은 글(피드 진입) 회귀 없음. 시험 행은 끝에 해제·DB 0건 확인.

## 6. 범위 밖 (보고만)
- 같은 「한 번 읽기」 코드: `components/community/UserBlockButton.tsx`, `components/reports/PublicProfileSafetyActions.tsx` — 같은 위험 가능, 실기 확인 안 함(NOT_PROVEN). 이번 수정 뒤 같은 공용 훅으로 바꿀 수 있음(별도 지시 필요).
- 상세 화면 토스트가 3~5초 동안 댓글 입력줄을 덮음(토스트 위치 = 하단 탭 위 규칙과 입력줄 자리가 겹침) — 결함 판정 안 함, Owner 판단 필요.

## 7. 반영
작업 브랜치 → PR 1개 → 로컬 검증 PASS → 독립 재감사 → 자동 병합 등록(= 운영 배포). 롤백 = Vercel Instant Rollback(재빌드 없음).
