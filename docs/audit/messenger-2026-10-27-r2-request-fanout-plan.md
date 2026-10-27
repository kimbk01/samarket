# R2 기존 구조 요청 줄이기 — 측정·원인·계획 (2026-10-27 PHT)

> 상태: **설계만 · 구현 전 · Owner 승인 대기**. 근거 코드 `origin/main` `5d9c475e6`. 운영 측정은 읽기 전용(Supabase `edge_logs` 24시간, `pg_stat_statements` 10-22 14:31Z 이후 누적, Vercel observability).
> R2-a 는 통화 권한 함수(`canStartDirectCallBetweenUsers`)에 닿으므로 **통화 변경 규정**을 적용한다. 나머지는 메신저 규정을 적용한다.

## 1. 측정

- Supabase API 371,190건/24시간 — 사용자 5명·기기 7대. **98.5% 가 Vercel 서버 함수에서 나온다.** Vercel 함수 호출 약 5.5만 건 × 평균 6.7 조회.
- 표별 상위(24시간 GET 기준): `profiles` 54,667 (그중 `select=status,deleted_at` **22,511**) · `user_social_relations` 29,611 · `participants` 26,555 · `rooms` 23,337 · `user_blocks` 17,642 · `presence_snapshots` 기록 16,351 · `community_friend_requests` 13,122 · `group_bans` 12,701 · `user_relationships` 12,542.
- 방 스냅샷: 읽기 6,025 · 생성 RPC **8,162** · 저장 **8,151** (24시간). 생성 RPC 는 DB 시간 1위다(`pg_stat_statements`: 12,106회, 평균 15.3ms, 누적 185초). 저장도 누적 57초.
- Vercel 경로(24시간): presence **16,328** · 통화 세션 6,629(10단계에서 정리) · 방 부트스트랩 **6,495** · 방 화면 3,445.

## 2. 원인 (코드 확인 · file:line)

| # | 원인 | 근거 | 요청 1건당 |
|---|---|---|---|
| C1 | **일반 친구 1:1 방**에 들어가면 관계 값과 통화 권한을 두 함수가 따로 조회한다. 같은 표를 중복 조회한다: `user_social_relations` ×5 · `user_blocks` ×4 · `user_relationships` ×2 · `community_friend_requests` ×3 · `profiles` ×3 | `service.ts:16151-16173` → `resolveDirectRoomPeerRelation`(`direct-room-peer-relation.ts:35-43`) + `canStartDirectCallBetweenUsers`(`direct-call-permission.ts:303-343`). 공유 캐시 없음 | **17** |
| C2 | 방 부트스트랩이 방 종류와 상관없이 매번 `rooms(deleted_at)` 1회 + `group_bans` 1회를 조회한다(1:1 방에도) | `bootstrap/route.ts:80`, `:97` | 2 (1:1 방은 불필요) |
| C3 | 방 스냅샷의 「신선」 기준이 **5초**다. 5초가 지난 요청은 거의 모두 스냅샷을 새로 만들고(RPC) 저장한다. 그래서 생성:저장이 1:1 이다. 이벤트 무효화(`room-bootstrap-snapshot-cache.ts:27-33`)도 참가자 전원 재생성을 예약한다 | `room-bootstrap-snapshot-counter.ts:5` · `room-bootstrap-snapshot.ts:63-80` | 읽기 1 + RPC 1 + 저장 1 |
| C4 | presence 하트비트가 화면이 보이는 동안 **12초마다** 오고, 앱 복귀·포커스·연결 때도 온다. 각 요청은 proxy 의 회원 상태 확인(`profiles status,deleted_at`, **캐시 무시**)과 presence 저장으로 2건이다 | `use-community-messenger-presence-runtime.ts:28` · `enforce-api-member-mutation-policy.ts:144`(`bypassCache: true`) | 2 |
| C5 | 목록 위 28개 방을 미리 받는다. 맨 위 28개 방 중 하나의 마지막 메시지 시각이 바뀔 때마다 다시 실행된다(60초 안의 스냅샷은 건너뜀) | `room-prefetch-queue.ts:26` · `CommunityMessengerHome.tsx:2481-2497` | 방마다 부트스트랩 1건 |

C4 의 회원 상태 확인 「항상 DB 재조회」는 Owner 보안 계약(P0-R3, fail-open 금지)이다(`enforce-api-member-mutation-policy.ts:141-142` 주석). 그래서 **이 계획에서 바꾸지 않는다**.

## 3. 계획 — 이번 회차 (기능 동일 · 중복과 불필요 조회만 제거)

| 단계 | 바꾸는 파일·함수 | 바뀌는 동작 | 줄어드는 양(추정) |
|---|---|---|---|
| **R2-a** (통화 규정) | `service.ts` 방 스냅샷의 일반 친구 1:1 분기, `direct-room-peer-relation.ts`, `direct-call-permission.ts`(선택 인자 추가) | 관계 원천(친구 쌍·차단 쌍·대기/거절 요청)을 **요청당 1회** 읽고, `resolveDirectRoomPeerRelation` 과 `canStartDirectCallBetweenUsers` 에 같은 값을 넘긴다. 이미 있는 `friendshipPreload` 방식을 차단 쌍·요청까지 넓힌다. 판정 로직·결과 값은 같다. 통화 시작 API(`calls` POST)는 preload 없이 지금처럼 직접 조회한다 | 일반 친구 1:1 방 진입 1건당 17 → 약 8 |
| **R2-b** | `bootstrap/route.ts:80·97` | 정식 방 조회(A)에서 이미 받은 방 종류·삭제 값을 쓴다. `group_bans` 확인은 **단체방에만** 한다. 1:1 방의 그룹 차단 확인과 중복 `rooms` 조회를 없앤다 | 1:1 방 진입 1건당 2 |
| **R2-c** | `room-bootstrap-snapshot.ts`, `room-bootstrap-snapshot-cache.ts` | 저장 스냅샷이 실제로는 캐시 노릇을 못 한다(C3). 그래서 **critical 첫 화면은 통합 RPC 결과만 쓰고 저장 행을 읽고 쓰지 않는다**. 이벤트 무효화의 「참가자 전원 재생성 예약」도 없앤다(다음 진입 때 RPC 가 새로 계산). 사용자에게 보이는 값은 항상 새로 계산한 RPC 결과가 된다(지금보다 옛 값이 나올 수 없다) | 진입 1건당 읽기 1 + 저장 1 · 메시지마다 참가자 수만큼 재생성 · DB 시간 1위 RPC 호출 수 감소 |

**R2-c 의 대가 (hot path):**
- 지금은 5초가 지난 저장 행을 바로 돌려주고 뒤에서 다시 만든다. 그래서 방 진입 첫 응답이 「읽기 1건」으로 빠르지만, 값이 옛것일 수 있다.
- R2-c 뒤에는 매 진입이 통합 RPC 를 기다린다(DB 평균 15ms).
- 방 첫 화면 체감 성능 검증(`docs/messenger-performance-targets.md` 방 진입 p95)을 R2-c 완료 기준에 넣는다. 목표를 넘으면 R2-c 는 되돌린다.

R2-a·R2-b·R2-c 는 **각각 단독 커밋**으로 한다. 한 단계를 실기기 PASS 한 뒤 다음 단계로 간다.

## 4. 이번 회차에서 하지 않는 것 (보고만)

- **C4 presence:**
  - 줄이려면 ① Owner 보안 계약(회원 상태 매 요청 DB 재조회)을 presence 에 대해 예외로 하거나, ② 온라인 판정 기준(`presence-policy.ts:4` 15초)과 12초 하트비트를 함께 바꾸는 계약 변경이 필요하다.
  - 둘 다 Owner 결정 사항이라 별도 설계로 올린다.
- **C5 목록 미리 받기:**
  - 미리 받기가 전체 부트스트랩 중 몇 %인지 측정 수단이 없다(요청 구분값 `cmReqSrc` 가 서버 집계에 남지 않음). NOT_PROVEN.
  - R2-a~c 뒤 1건당 비용이 줄어든 상태에서 다시 측정한다.
- proxy 가 화면·RSC 요청마다 가입 단계 `profiles` 를 조회한다(약 5천 건/일, `proxy-signup-gate.ts:32-36`). 범위 밖이라 보고만 한다.

## 5. 영향받는 경로와 보호 검증 (Owner 지시 항목)

| 경로 | R2-a | R2-b | R2-c | 확인 방법 |
|---|---|---|---|---|
| 권한(방 멤버 아님·나간 방) | — | 정식 방 조회 결과 그대로 | — | 비멤버 방 주소 진입 → 404/거부 |
| 차단(내가 차단·상대가 차단) | 같은 차단 쌍 값으로 판정 | — | 스냅샷 대신 RPC 값 | 차단 바·[차단 해제]·메시지 거부·통화 버튼 비활성 |
| 친구·대기 요청·거절 | 같은 값 | — | — | 친구 아님 안내·요청 대기 표시·수락 후 즉시 반영 |
| 그룹 차단(ban)·정지·삭제된 방 | — | 단체방은 그대로 확인 · 1:1 방 삭제 값은 A 결과 사용 | — | 단체방 강퇴 사용자 진입 거부 · 삭제된 방 진입 |
| 전달·읽음·배지·목록 | — | — | 읽음 위치를 RPC 가 새로 계산(D-12 같은 옛 읽음 표시가 구조적으로 사라짐) | 읽음 숫자·목록 배지·전달 후 방 진입 |
| 통화 버튼·통화 시작 | 버튼 상태는 같은 판정 값 · 통화 시작 API 는 그대로 | — | — | 친구/비친구/차단 상대 통화 버튼과 발신 결과 |

- **설치된 구 바이너리:** 웹·서버만 바꾼다. 앱이 받는 응답 모양은 같다(값의 출처만 같은 계산). 앱 재빌드는 없다.
- **롤백:** 단계별 단독 커밋을 `git revert` 해서 main 에 푸시한다(웹 재배포).

## 6. 검증

- **코드:** `typecheck:build`. 단계별 vitest 는 기존 `direct-room-peer-relation`·`direct-call-permission`·`room-bootstrap*`·`peer-relation` 테스트에 같은 입력·같은 결과 계약 테스트를 더한다. eslint 도 돌린다.
- **효과(운영 읽기 전용):** 같은 시나리오(일반 친구 1:1 방 진입 5회·단체방 진입 3회)에서 Supabase `edge_logs` 표별 건수를 수정 전후로 대조한다.
- **실기기(Production SHA 기록):**
  1. 1:1 친구 방 진입·메시지·읽음 표시
  2. 비친구 방 안내·친구 요청 대기 표시·수락 후 반영
  3. 차단 → 차단 바·메시지 거부·통화 버튼 비활성 → 해제
  4. 단체방 진입·강퇴 사용자 거부
  5. 삭제된 방 진입
  6. 목록 배지·읽음 숫자
  7. 통화 버튼 상태와 발신 결과(친구·차단 상대) — R2-a 통화 규정
- 실기기 FAIL 시 즉시 중단하고 revert 한다.

## 7. R2-a 결과 (`8296e6281` · Production Ready 확인 06:28 PHT)

- **효과(운영 edge_logs):** 앱을 다시 켜고 방에 들어간 같은 상황에서, 1:1 방 부트스트랩 1건(`peer_notices` 1건 기준)당 관계 표 조회가 **35.2 → 26.6** 으로 줄었다. 같은 시간대 다른 요청이 섞여 근사값이다.
- **실기기 PASS:**
  1. Samsung w테스트1 방 진입 — 「친구가 아닌 사용자」 바 정상(06:28:42).
  2. Samsung 이 차단(06:29:40) → iPhone 방 통화 버튼 비활성·통화 불가(Owner 확인). 서버 `[call-permission] deny_blocked relationLabel=blocked`(22:30:35Z, 새 경로).
  3. 06:36 차단 해제 → Samsung 방 다시 열림·바 정상.
  4. iPhone 통화 버튼 활성 → 발신 `a7085f3e` 수락 06:37:06·연결 08.6·종료 12.7.
- **CI:** R3-b 테스트 파일 타입 오류(`typecheck:test`)를 `3157a0084` 에서 수정했다. 앞으로 커밋 전 `typecheck:test` 도 돌린다.

## 8. R2-b·R2-c 결과

### R2-b (`936423d13`)
- 기기 앱 안에서 부트스트랩을 직접 호출해 확인했다.
  - 1:1 방(iPhone·Samsung) 200 — 방 정보 1건(`room_type,deleted_at`)만 조회하고 강퇴 표 조회는 없다.
  - 단체방(iPhone `3e92fa77`) 200 — 강퇴 확인을 그대로 한다.
  - 삭제된 그룹(Samsung `d60e4ea7`·`e6dbe294`) **410 `group_deleted`**.
  - 강퇴·나간 그룹(iPhone `d492f8b5`) 404 — 앞 단계(멤버 아님)에서 거부된다.
- 403(강퇴 확인) 단계 자체는 NOT_PROVEN 이다. 운영 DB 에 「강퇴됐는데 아직 참가자」인 경우가 0건이라 실기기로 도달할 수 없다. 계약 테스트로만 확인했다.

### R2-c (`bf0223c9b`)
- **저장 스냅샷 테이블 접근(edge_logs):** 배포 전 25분(22:30~22:55Z)에 읽기 63 · 저장 71 · 삭제 5 · RPC 71. 배포 후(22:55~23:02Z)에는 **읽기·저장·삭제 0** · RPC 35(방 진입분만).
- **읽음 표시(D-12 시나리오, Owner 확인):** iPhone 이 보낸 메시지의 「1」이 사라졌고, 방을 나갔다 다시 들어와도 읽음 상태가 유지됐다.
- **단체방 진입:** iPhone `3e92fa77` 200 · private_group · 메시지 25건.
- **성능:**
  - 웜 상태 서버 처리 시간은 15회 측정(Samsung 앱, 3초 간격) 기준 **p50 152ms · p95 250ms** 다. 목표 p95 500ms 이내다.
  - 같은 요청의 기기 체감 왕복은 319~680ms(중앙 약 386ms)로, 네트워크가 포함된 값이다.
  - 배포 직후 콜드 스타트가 섞인 16건은 p95 1,184ms 였다. 콜드 스타트 영향으로 본다.
  - 24시간 자연 트래픽 p95 비교는 다음 날 1회 측정한다(NOT_PROVEN).

## 9. R2-c 이후 방 부트스트랩 응답 시간 (10-27 07:00~09:10 PHT, Vercel 관측)

- `/api/community-messenger/rooms/[roomId]/bootstrap`: **p95 511ms · p50 191ms** (기준 p95 654ms).
- 실기기 시험 시간대 위주 2시간 표본 — 24시간 p95 는 아직 NOT_PROVEN (내일 같은 쿼리로 재측정).
