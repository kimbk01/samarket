# 관심이웃 전체 최종 감사 — 범위 밖 포함 (2026-11-28 15:15 PHT)

Owner 지시: 「정확히 범위밖을 포함은 전체 최종 감사를 진행 해라, 결함 오류 중복 누락 누수 병목까지 끝까지 확인 해서 보고 해라」. **감사만 — 코드 수정 없음.**
기준: 운영 `f7d54c1` (= origin/main, #689·#693·#696 포함). 방법: 독립 코드 감사 3축(정확성 / 중복·누락 / 누수·병목) + 작업자 교차 확인(코드 직접 읽기) + 운영 DB 읽기 전용 + Vercel·Postgres 오류 기록 + iPhone 시뮬레이터 실측.
증거 등급: **실측**(운영 화면 캡처) · **운영 DB** · **로그** · **코드**(작업자가 해당 줄을 직접 읽어 확인) · **NOT_PROVEN**.

## 1. 결함 (FAIL) — 심각도 순
| # | 분류 | 결함 | 위치 | 재현 조건·영향 | 심각도 | 증거 | 만든 PR |
|---|---|---|---|---|---|---|---|
| D1 | 결함(범위 밖) | 공개 프로필 [차단] 버튼이 로그인 정보를 한 번만 읽음 → 빈 값이면 누를 때 **무한 반복 호출** 가능 | `components/community/UserBlockButton.tsx:24,46-50,92-103` · `lib/auth/require-auth-action.ts:139-142,189,217~` | 공개 프로필을 주소로 바로 열고 화면이 로그인 정보보다 먼저 그려지면 `me=null` 고정 → 비회원용 [차단] 버튼 → 누르면 `requireAuthAction` 이 캐시 프로필로 통과해 같은 낡은 `toggle` 을 다시 부르고 그 `toggle` 이 다시 `requireAuthAction` … 차단은 안 되고 반복만 | 높음 | 코드 (실측: 15:05·15:11 두 번 열었을 때는 로그인 정보가 먼저 차서 재현 안 됨 — 순서 경쟁) | 기존 코드(패턴 03-30) |
| D2 | 결함(범위 밖) | 공개 프로필 신고·차단 줄도 같은 한 번 읽기 → 내 프로필을 바로 열 때 신고·차단이 보일 수 있음 | `components/reports/PublicProfileSafetyActions.tsx:25,37` | D1 과 같은 순서 경쟁. 신고 누름은 새로 읽어 정상 | 낮음~중간 | 코드 (실측 15:11 재현 안 됨) | 기존 코드 |
| D3 | 오류 처리 | 관심이웃 **해제** 때 기존 행 조회 오류를 버림 → 조회 실패 시 아무것도 안 지우고 「해제했어요」 성공 응답 | `app/api/community/neighbor-relations/route.ts:108-121` (GET 41-49 도 오류 시 `following:false`) | DB 일시 오류·시간 초과 때. 화면은 해제, DB 행은 남아 다시 나타남 | 중간 | 코드 | #689 |
| D4 | 동시성 | 100명 상한이 원자적이 아님(셈 → 추가 사이 다른 조회 3개) | `route.ts:144-160` | 99명에서 다른 대상 동시 추가(두 탭·두 기기) → 101명 이상 가능 | 낮음(드묾) | 코드 · 운영 DB 최대 4명 | #689 |
| D5 | 입력 검사 | `targetUserId` uuid 검사 없음 → uuid 아닌 값이면 Postgres 22P02 오류가 운영 오류 로그에 쌓이고 해제는 거짓 성공 | `route.ts:20-21, 68-70` | 정상 화면은 uuid 만 보냄 — 비정상 요청 때만 | 낮음 | 코드 (`neighbor-follow-list.server.ts` 에는 UUID 검사 있음) | #689 |
| D6 | 계정 전환 | 로그아웃(null)을 거치지 않고 A→B 로 바뀌면 저장소를 비운 뒤 다시 읽지 않아 버튼이 「추가」로 남음 · A 때 시작한 응답이 B 저장소에 써질 수 있음 · `user-relation-client.ts` 5초 캐시 키에 계정 없음 | `lib/community/neighbor-follow-store.ts:37-47,96-111,143-150` · `lib/community/user-relation-client.ts:12,33` | 탭 계정 전환은 `SupabaseAuthSync` 가 전체 새로 불러오기로 막음. 같은 탭 로그아웃→다른 계정 로그인 경로는 확인 못 함 | 낮음 | 코드 | #689 |
| D7 | 표시 | 공개 프로필 관심이웃 버튼: 첫 그림에서 `me=null` 이면 「본인 아님」으로 판정 → 내 프로필을 바로 열면 [관심이웃 추가]가 잠깐 보일 수 있음(주석 「비로그인·본인이면 false」와 다름) | `components/community/ui/NeighborFollowButton.tsx:40,133` · `components/users/PublicProfileNeighborFollow.tsx:11` | 15:11 실측 2.1초 이후 캡처에는 없음(그 전 순간은 못 잼) | 낮음 | 코드 · 실측 일부 | #689 + #696(첫 그림 null) |
| D8 | 표시 | 상세 화면 토스트가 3~5초 동안 댓글 입력줄을 덮음 | `app/dibay-overlay.css:1020` 위치 규칙(하단 탭 위) ↔ 상세 고정 입력줄 | 상세에서 관심이웃·신고 등 모든 토스트 | 낮음 | 실측 14:25·14:58 캡처 | 기존 규칙 |
| D9 | 상한 기준 | 상한은 「저장 행」, 화면 「n / 100」은 「보이는 행」 — 탈퇴·차단 잔존 행이 있으면 98/100 인데 409 | `neighbor-follow-list.server.ts:59 vs 63-71` | **운영 잔존 행 0건**(아래 §3) → 지금은 발생 안 함 | 낮음 | 코드 · 운영 DB | #689 |

## 2. 중복 · 누락 · 누수 · 병목
| # | 분류 | 내용 | 위치 | 영향 | 심각도 |
|---|---|---|---|---|---|
| R1 | 중복 | 차단 시 관심이웃 삭제 규칙이 두 벌 — `deleteNeighborFollowsBetween` 는 운영 호출처 0(시험만), 실제는 `blockUserSocial` 안에 같은 조건 복사(클라이언트 묶음 문제 회피) | `neighbor-follow-list.server.ts:78` · `social-relations.ts:835-853` | 한쪽만 고치면 어긋남. 시험 `neighbor-follow-ssot.test.ts:151` 은 안 쓰이는 쪽을 시험 | 중간 |
| R2 | 중복 | 「보이는 관심이웃」 정의가 둘 — 목록·개수는 탈퇴·차단 제외 함수, 피드 `neighborOnly`·메신저 bootstrap following 은 원본 행 | `queries.ts:287` → `social-filter.ts:51-70` · `community-messenger/service.ts:2817,6323,6644` | 지금 운영 잔존 0건이라 결과 차이 없음 | 낮음 |
| R3 | 중복 | 걸러내는 열이 섞임 — `type` 만 / `relation_type OR type` | route·blockUserSocial·어드민 vs 목록·피드 | 운영 불일치 0건(§3) | 낮음 |
| R4 | 중복 | 경로 문자열 하드코딩 3곳(상수 있음) | `lib/mypage/mypage-ia.ts:139` · `app/(main)/mypage/settings/[section]/page.tsx:8` · `app/(main)/my/settings/favorite-users/page.tsx:5` | 경로 바뀌면 누락 | 낮음 |
| R5 | 누락(시험) | 탈퇴·영구 삭제 route 가 관심이웃을 지우는지 시험 없음 · 옛 주소 4개 중 3개 시험 없음 · UserBlockButton 늦은 캐시 재현 시험 없음 | `app/api/admin/users/[id]/delete/route.ts:237` 등 | 회귀를 못 잡음 | 중간 |
| R6 | 누락(예산) | 새·변경 조회 라우트가 요청 예산 표에 없음 — `/api/me/mypage-summary`(요약 1회당 +1~3 조회), `neighbor-relations` GET·POST, `block-relations` GET, `/api/me/relations/[type]`, 어드민 GET. 설계 §2 「예산 값 낮춤」 미반영 | `lib/perf/request-budget.ts` | 「예산 없는 라우트」 경보(하루 1,000건)로만 감시 | 낮음(규칙) |
| R7 | 누락(문서) | 설계와 구현 차이 미기록 — POST 응답 `count` 없음, 어드민은 별도 GET 라우트 · `lib/my/schema.md:5` 에 없는 표 `user_favorites` | 설계 §1-A·§1-E·§5 | 문서 불일치 | 낮음 |
| R8 | 누락(서버 검사) | 어드민 삭제 사유 최소 2자를 화면만 강제(서버는 빈 값만 검사) · 감사 기록을 기다리지 않음(`void appendAuditLog`, 저장소 40곳 공통 방식) | `app/api/admin/users/[id]/neighbor-relations/route.ts:118,134` | 직접 호출 시 1자 사유 가능 | 낮음 |
| R9 | 죽은 코드 | `NeighborFollowPostResponse` export · 훅의 `setFollowing` 반환 · `deleteNeighborFollowsBetween` 운영 미사용 | `neighbor-follow-contract.ts:29` · `NeighborFollowButton.tsx:140` | 정리 대상 | 낮음 |
| L1 | 누수 | 저장소 Map 정리 없음 — 구독 해제 뒤 빈 Set 남음, states·versions·relationGeneration 이 본 작성자 수만큼 증가 | `neighbor-follow-store.ts:120-122` · `user-relation-client.ts:14` | 대상 1명당 약 100바이트, 기능 영향 없음 | 낮음 |
| L2 | 누수(기존) | ⋯ 메뉴 `showToast` 타이머 미정리 → 토스트가 겹치면 먼저 건 타이머가 나중 토스트를 일찍 닫음 | `CommunityMoreMenu.tsx:57-64` | 토스트 조기 닫힘 | 낮음 |
| B1 | 병목 | 관심이웃 목록 API 가 profiles 를 두 번 읽음(1명 이상: 1회 ≈ 5조회 → 4로 줄일 수 있음) · 화면 들어올 때마다 다시 읽음(보기→관리→보기 = 목록 3회) · 사진 줄 누를 때마다 피드 요청(취소 없음, 순번으로 늦은 응답 버림) | `neighbor-follow-list.server.ts:46` · `app/api/me/relations/[type]/route.ts:60` · `NeighborFollowScreen.tsx:69-70` | 사용자 1명당 수 회 — 지금 운영 사용 9명 | 낮음 |
| B2 | 오류 숨김(기존) | 차단 목록 조회 오류를 빈 집합으로 처리 → 관심이웃 글 화면이 오류 대신 「글 없음」, 그 순간 차단 제외 빠짐 | `social-filter.ts:58` · `user-block-ssot.ts:55` | 일시 오류 때 | 낮음 |
| X1 | 같은 패턴(범위 밖) | 로그인 정보를 렌더 중 한 번 읽고 구독 안 하는 사용자 화면 — 거래 `PostFavoriteButton:65`·`PostCard:197`·`ProductCard:47`·`ChatProductSummary:85`·`FavoritePostCard:24`·`FavoritePostTradeActions:46`, 설정 5곳(`userId ?? "me"` 키: Personalization·VideoAutoplay·NotificationsSettings·ChatSettings·CountrySettings), `RecentViewedList:83`·`MyOffersView:77`(`?? "session"`), `PhilifeNeighborhoodWriteForm:240`, `SupportModalHost:376` | 각 파일 | 주소로 바로 열면 내 글 판정·설정 키가 틀어질 수 있음 — **실측 안 함** | NOT_PROVEN |

## 3. 운영 데이터·로그 점검 (결함 없음, 15:03~15:08 PHT)
- 인덱스: `(user_id,target_user_id,type)` 유일 · `user_id` · `target_user_id` — 조회 조건을 모두 덮음. created_at 정렬 인덱스 없음(1인 최대 100행이라 불필요).
- `user_relationships`: neighbor_follow 14 · blocked 5 · hidden 1, **type≠relation_type 0건**, 옛 `favorite` 행 0, `user_favorites` 표 없음.
- neighbor_follow 14행 정합: 자기 자신 0 · 대상/주인 프로필 없음 0 · 대상/주인 탈퇴 0 · 차단된 쌍 0(`user_relationships` blocked · `user_social_relations` 활성 차단 2건 · `user_blocks` 활성 0 세 기준 모두) · 1인 최대 4명(9명 사용).
- 오류 기록(배포 12:57 PHT 이후): Vercel 실행 오류 관심이웃 경로 0건(전체 2건은 홈 캐시 fetch 실패 — 무관), Postgres 오류 중 관계 표 관련 0건.

## 4. 결함 없음 확인 (근거)
- 추가·해제 SSOT: neighbor_follow 쓰기 경로 4곳뿐(상태 지정 POST · 차단 · 어드민 삭제 · 탈퇴/영구 삭제), 옛 토글은 400, 옛 favorite 경로 400 — 코드.
- 차단 정리: 차단 쓰기 4개 라우트가 모두 `blockUserSocial` 을 거쳐 양방향 삭제 — 코드 + 운영 DB 잔존 0.
- 탈퇴·영구 삭제·빈 계정 삭제에서 맺은·받은 관계 삭제 — 코드 + 운영 DB 잔존 0.
- 글 상세 1회 진입 관심이웃 추가 조회 0(서버 첫 데이터 seed) · 피드 카드 N+1 없음 · 관리 목록 100행 조회 0 · 상한 셈은 `count head` — 코드.
- 피드 거름: DB 단계 `.in("user_id")`, 0명이면 조회 생략, 남의 관심이웃 우회 막힘 — 코드 + 시험.
- 어드민: 권한·uuid 2개·회원이 낀 행만·사유 필수·감사 기록 — 코드(운영 화면은 NOT_PROVEN, 아래).
- i18n: 새 키 23개 ko·en 모두 있고 사용 중, 삭제 키 19개 잔존 참조 0 — 코드.
- #696: 캐시 같은 참조면 알림 없음, 재그림 세션당 몇 번, 하이드레이션 null 로 저장소 안 비움 — 코드 + 실측(14:58 주소 직접 열기 PASS).
- 실측 PASS(오늘): 상세 안내↔⋯ 메뉴 동기화·토스트·되돌리기·관리 제목·글 카드·빈 화면·[완료]·뒤로(Android 2대·iPhone), 주소 직접 열기 안내 상자·입력줄(iPhone), 공개 프로필 버튼 표시·해제(iPhone 14:18·15:05).

## 5. 확인 못 함 (NOT_PROVEN — 이유)
- 어드민 회원 상세 관심이웃 노출·삭제 운영 화면: 어드민 계정 로그인이 필요(작업자는 비밀번호 입력 불가).
- 본인 글 ⋯ 메뉴에 관심이웃 항목 없음: zxzx11 본인 글 0건, 운영에 시험 글 만들지 않음.
- D1·D2·D7 화면 재현: 순서 경쟁이라 2회 시도에서 안 남 — 강제 재현에는 네트워크 지연 조작이 필요.
- 관리 화면 직접 진입 [완료] 화면 미끄러짐 방향: 화면 전환 중간 캡처 불가.
- X1 거래·설정 화면들: 이번 감사에서 실측 안 함.

## 6. 실행 기록
- 운영 사이트 열기(시뮬레이터) 이번 감사 2회(15:05 `/u/lynkim`, 15:11 `/u/zxzx11`) · 같은 날 묶음 누계 6회(상한 10) · 예상 운영 Supabase 요청 약 1,170건(6×195).
- 운영 DB 조회 = 읽기 전용(`begin read only … rollback`), 컬럼 먼저 확인. 데이터 변경 없음.
