# 운영 Postgres 오류 로그 감사 (2026-11-14)

- 대상: 운영 Supabase `ckdosyydvgzqwpbwuhon` (kimbk01's Project, ap-south-1) · 읽기 전용
- 방법: Supabase 대시보드 Logs → Postgres → Severity=Error, 기간 2026-11-08 00:00 ~ 11-15 00:00 PHT. 전 행(371건) 상세를 열어 `query` 로 출처 분류
  - `-- source: POST /mcp` = 작업자(Claude 등) Supabase MCP 임의 SQL
  - `pgrst_source`/`pgrst_body` = PostgREST(앱 서버·스크립트가 supabase-js 로 호출)
  - 그 외 = Supabase 내부 서비스·직접 접속
- Logs Explorer(새 ClickHouse 엔진)는 `postgres_logs` 조회 결과 0건 — 사용 불가, 화면 뷰어로만 확인

## 1. 일자별 오류 수 (PHT)

| 날짜 | 전체 | 그룹 읽음 수 `pending:` | 작업자 MCP SQL | 그 외 |
|---|---|---|---|---|
| 11-08 | 55 | 0 | 9 | 46 (광고 환급 ID 27 등) |
| 11-09 | 51 | 0 | 22 | 29 (Realtime 내부 19 등) |
| 11-10 | 49 | 0 | 16 | 33 |
| 11-11 | **19** | 0 | 8 | 11 |
| 11-12 | **112** | **60** | 15 | 37 |
| 11-13 | **80** | **53** | 13 | 14 |
| 11-14 (~02시) | 3 | 0 | 0 | 3 (showcase) |

→ 11-11 감소 후 11-12·13 상승분의 **거의 전부(113건)가 그룹 채팅 읽음 수 조회 오류**다.
「수정 후 줄었다」는 그 수정이 무엇인지는 이번 로그로 특정하지 못함(확인 못 함). 11-11 감소는 MCP 오류·광고 환급 오류가 그날 적었던 결과로만 확인된다.

## 2. 원인별 (출처·코드 경로)

### A. 그룹 채팅 읽음 수 — 임시 메시지 ID 가 uuid 로 전달 (113건, 상승 주원인 · 앱 결함)
- 오류: `invalid input syntax for type uuid: "pending:<방ID>:N"` / `"pending:image:<방ID>:N"`
- SQL: RPC `community_messenger_group_message_read_counts(p_room_id uuid, p_message_ids uuid[])`
- 경로: 그룹 방에서 내가 보낸 메시지 id 목록(`CommunityMessengerRoomPhase2MessageTimeline.tsx:627` `groupMineMessageIds`, 마지막 24개) → `useGroupMessageReadCounts` (`lib/community-messenger/group/use-group-message-read-counts.ts`) → `POST /api/community-messenger/group-rooms/[roomId]/media` → `lib/community-messenger/group/group-room-read-service.ts:30` RPC
- 전송 중 낙관적 메시지 id(`use-messenger-room-phase2-controller.ts:1103` `pending:${room}:${n}`, `:1683` `pending:image:…`)가 걸러지지 않고 서버까지 감. 서버 라우트도 uuid 검사 없음. 배열에 하나라도 섞이면 **RPC 전체 실패** → 그 조회의 모든 메시지 읽음 수가 비게 됨(화면 영향은 NOT_PROVEN).
- 3건씩 묶여 나오는 것 = 전송 중 방 snapshot·id 목록이 바뀔 때마다 재조회.
- 11-12 이전에 없던 이유: 그룹 방 전송이 11-12~13 그룹 채팅 작업·실기 중에 집중됨(그 전 7일 0건). 코드는 06-19 도입분 그대로 — 새 회귀가 아니라 **잠복 결함이 그룹 사용으로 드러난 것**.
- 이미 같은 계열 가드가 있는 곳: `messenger-room-catchup-anchor.ts:20`, `use-messenger-room-load-older-messages-fetch.ts:58` (`pending:` 제외 + `isUuidLikeString`). 읽음 수 경로만 빠져 있음.

### B. 작업자 MCP 임의 SQL (83건 + 직접 접속 일부 · 사용자 무관)
- 오류: `column … does not exist`, `relation … does not exist`, `invalid regular expression` 등
- 출처: `-- source: POST /mcp` — 작업 세션이 스키마 확인 없이 추측 컬럼명으로 운영 DB 조회 (예: `user_devices.device_info`, `posts.hidden`, `community_messenger_rooms.last_message_id`)
- PostgREST 경유 스크립트도 같은 성격: `user_devices.voip_token`(11-13 21:27), `community_posts` 컬럼(11-12 08시 13건), 가짜 id `verify-*`·`audit-x-*` (13건)
- 대시보드 오류 수를 부풀리지만 고객 화면과 무관.

### C. 광고 종료 환급 원장 ID 가 보류 테이블 uuid 열로 조회 (30건 · 앱 결함)
- 오류: `invalid input syntax for type uuid: "feed-ad-end-refund:<id>"` (11-08 00시 27건, 11-10·11 3건)
- SQL: `feed_ad_point_holds … WHERE request_id = ANY($1)`
- 경로: `lib/points/point-period-history.ts` `pointHoldKey` → `loadCapturedPointHoldKeys` — 보류 줄의 related_id 를 그대로 uuid 열에 넣음. 오류 시 `{ ok:false }` 반환 → 그 회원의 포인트 기간 내역 요약 실패 가능(화면 NOT_PROVEN, 해당 원장 행 DB 대조 NOT_PROVEN).

### D. 중고거래 샘플(showcase) 카드 id 로 posts 조회 (3건, 11-14 00:48 · 앱 결함)
- 오류: `invalid input syntax for type uuid: "showcase-<id>"`
- SQL: `posts … WHERE id = $1` — 샘플 카드 id(`lib/trade/showcase/trade-showcase-post.ts:24` `showcase-${id}`)가 글 상세 조회로 들어감. 정확한 진입 화면은 확인 못 함.

### E. 매장 id 자리에 문자열 (16건 · 앱 결함 추정)
- `stores.owner_user_id … WHERE stores.id = $1` 에 `"sin"`·`"sinjinkim00"`·`"5823"`·`"2530"` — 매장 경로 파라미터(슬러그·아이디)를 uuid 열에 직접 비교. 호출 코드 위치 확인 못 함.

### F. 매일 03:50 PHT 문장 시간 초과 (6건, 매일 1건 · 앱/DB 결함)
- `canceling statement due to statement timeout` — RPC `community_post_image_gc_candidates` (cron `/api/cron/community-post-images-gc`). 매일 같은 시각 실패 = 커뮤니티 이미지 정리 작업이 **매일 끝나지 못함**.

### G. 외부(Supabase 플랫폼) 요인 — 유일한 외부 요인
- 11-09 07:50 19건 `there is no unique or exclusion constraint matching the ON CONFLICT` — 쿼리 `with candidates as (select … from pg_publication_tables …)` = Supabase Realtime 내부 쿼리. 1회 몰림, 이후 재발 없음.

### H. 기타 소량
- `DELETE FROM users` FK 위반(`gift_certificate_transfers`) 3건 — 회원 삭제 시 상품권 이전 기록이 막음(Auth 관리 삭제).
- `notification_events_user_dedupe_uidx` 중복 3건, `moim_room_*_managed_by_moim` 4건(트리거 차단 — 정상 방어), `missed:<id>` 4건(11-10).

## 3. 결론

- 「다시 상승」= **외부 요인 아님**. 상승분은 A(그룹 채팅 읽음 수에 임시 id 전달) — 앱 코드 결함이며 그룹 방 전송이 늘면 계속 늘어난다.
- 상시 바닥(하루 15~50건)은 B(작업자 MCP·스크립트 추측 SQL)가 절반, 나머지는 C·D·E·F 앱 결함.
- 외부 요인은 G(Supabase Realtime 내부, 11-09 1회)뿐.

## 4. 근본 대책 (구현 전 승인 필요 · 도메인별 PR 분리)

| # | 대상 | 대책 | 도메인 |
|---|---|---|---|
| A | 그룹 읽음 수 | 클라이언트 훅에서 uuid 가 아닌 id 제외 + 서버 라우트에서 uuid 만 RPC 로 (둘 다) | 메신저 |
| C | 포인트 기간 내역 | 보류 키 조회 전 uuid 형식만 남김 | 포인트 |
| D | showcase 카드 | 글 조회 진입점에서 `showcase-` id 차단(조회 전 분기) — 진입 화면 먼저 특정 | 거래 |
| E | 매장 id | 호출처 특정 후 uuid 아니면 조회 안 함/슬러그 경로 분리 | 매장 |
| F | 이미지 GC | RPC 실행 계획·인덱스 확인 후 대상 범위/배치 축소 | 커뮤니티·DB |
| B | 작업 규칙 | 운영 DB 조회 전 `information_schema.columns` 로 컬럼 확인, 가짜 id 로 운영 API 호출 금지 | 작업 절차 |

NOT_PROVEN: 각 오류의 고객 화면 영향(A·C·D), C 원장 행 DB 대조, D·E 진입 화면, 11-11 감소를 만든 「수정」의 정체.

## 5. 처리 결과 (2026-11-14 · Owner 「A 수정 진행」「C·D·E·F 도 순서대로 수정 진행」)

| # | 상태 | 확정 원인 (감사 §2 정정 포함) | 수정 |
|---|---|---|---|
| A | PR #279 병합 `dd41799ad` | 그룹 읽음 수 RPC 에 `pending:` 임시 id | 훅·서버가 uuid 만 (`selectGroupReadCountMessageIds`) |
| C | PR (포인트) | **정정**: `point-period-history.ts` 가 아니라 `project-point-financial-history.ts` `loadFeedAdHoldStatusMap` — 포인트 내역 화면이 `related_type=feed_ad_request` 줄 전부의 id 를 모으는데 환급 원장(`ad_refund`, `feed-ad-end-refund:<campaignId>`)도 같은 related_type 이라 섞임. 오류 시 빈 맵 → 그 페이지 피드 광고 보류 줄 상태가 「보류 중」으로 보일 수 있음(화면 NOT_PROVEN) | uuid 만 조회 |
| D | PR (거래) | `lib/posts/map-post-detail-row.ts` `loadPostRowForDetail` 3단계 select 가 `showcase-<id>` 로 3번 실패(3건 = 3단계). 샘플 카드 클릭은 `PostCard` 에서 막혀 있음 — 들어온 진입 경로(주소 직접·공유 등)는 확인 못 함 | 상세 조회 공통 함수가 uuid 아니면 조회 없이 「글 없음」 |
| E | PR (어드민 회원) | **정정**: 매장 경로가 아니라 어드민 회원 검색(`app/api/admin/users/route.ts`) — 검색어 그대로 `stores.id = 검색어` 조회. `sin`·`sinjinkim00`·`5823`·`2530` = 어드민이 입력한 검색어. API Gateway 로그 `select=owner_user_id&id=…&limit=` 확인 | uuid 검색일 때만 매장 id 조회 |
| F | 마이그레이션 `20271114230000` · **운영 DB 적용 02:36:59 PHT** (Owner 「F 운영 DB 적용 승인」) | 아래 F | uuid 집합 대조 + 잔여만 position 재확인 |

### F. 커뮤니티 이미지 정리 시간 초과 — 원인·설계안

- 원인(코드 확인): `community_post_image_unreferenced(p_names)` (`supabase/migrations/20271031140000_…image_gc.sql`) 가 호출마다
  ① 65개 열(채팅 메시지·메신저 메시지·알림·글 본문 등 **가장 큰 표 전체**)의 글자를 `refs` 로 통째 생성하고
  ② 후보마다 `position(stem in r.t)` 로 전체 행을 다시 훑는다 → 비용 = 전체 행 × 후보 수(최대 800). 데이터가 늘수록 커져 매일 03:50 `statement timeout`. 정리 작업이 하루도 끝나지 못함.
- 운영 측정(읽기 전용, 02:2x PHT): 참조 표 전체 46MB·약 4만 행, 정리 후보 104개, authenticator `statement_timeout=8s`. 기존 함수 실행 14.96~17.83초(> 8초 = 매일 실패 재현).
- 운영 정의 ≠ 저장소 첫 정의: `20271112200000_moim_m1b` 가 12줄(옛 모임 9·community_chat_* 3)을 뺀 50줄이 운영 현재 — 새 마이그레이션은 운영 현재 목록 그대로.
- 시행착오 1건: 앞보기 정규식(`(?=(...))`)은 Postgres 에서 캡처가 비어 104개 전부 「미참조」로 나옴 → 폐기(운영 적용 전 읽기 전용 비교에서 발견).
- 설계안 (Owner 승인 · 구현은 1번만 — 2번 열 축소는 참조 누락 시 사진 삭제 위험이라 하지 않음, 3번은 1번으로 충분해 불필요):
  1. 판정 방식 변경 — 후보마다 전체 훑기 대신 `refs` 에서 커뮤니티 이미지 파일명 형식(`/community/(import/)?<uuid>.`)만 정규식으로 **한 번** 뽑아 집합으로 만들고 후보와 해시 조인 (전체 행 × 후보 → 전체 행 1회).
  2. 대상 열 축소 — 커뮤니티 이미지(`post-images/<uid>/community/…`)를 실제로 담을 수 있는 열만 남김(열 목록은 저장 경로별 전수 확인 후 확정).
  3. 위 1·2 후에도 시간 초과면 cron 을 표별로 나눠 실행.
- 적용 전후 (운영, 같은 데이터): 기존 14.96초 → 새 방식 1.47초, 결과 8건 동일. 적용 전 정의 백업 후 읽은 정의와 대조(변경 없음) → 단일 트랜잭션 적용 + `schema_migrations` 기록.
- 적용 후 확인: 새 본문·참조 50줄·EXECUTE 권한 service_role(+postgres)만 · service_role·8초 제한으로 `community_post_image_gc_candidates` 1.40초, 8건(적용 전과 동일).
- NOT_PROVEN: 다음 03:50 PHT cron 실제 성공·정리 삭제 결과 — 다음 날 Postgres 로그·cron 응답으로 확인.
- 롤백: 적용 전 `pg_get_functiondef` 원문으로 `create or replace` 1회.

### B. 작업자 임의 SQL — 작업 규칙 (Owner 「B 작업 규칙도 정리해서 진행」 2026-11-14)
- 코드 수정 대상 아님 — PR #285 `AGENTS.md` 「Claude 작업 효율 규정」 10번 「운영 DB 임의 조회 규칙」: 컬럼 추측 금지(`information_schema`·`pg_get_functiondef` 먼저) · 읽기 전용 트랜잭션 · 가짜 id 로 운영 API 호출 금지 · 감사 때 `-- source: POST /mcp` 별도 집계.
- PR: C #281 · D #282 · E #284 · F #283.
- NOT_PROVEN: 규칙 반영 뒤 MCP 오류 감소 — 다음 감사에서 같은 분류로 대조.
