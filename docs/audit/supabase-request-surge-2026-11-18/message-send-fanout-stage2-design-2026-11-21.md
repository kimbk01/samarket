# 메시지 보내기 2단계 — 받는 사람별 DB 작업 묶기 · 설계 (2026-11-21 PHT)

- 지시: Owner 「2단계 설계 진행」. 앞 단계: `message-send-fanout-design-2026-11-21.md`(1단계 PR #542).
- 근거: 코드(main `a8032b7` 이후) · 운영 DB 함수·표 정의(읽기 전용) · Vercel 관측 11-20 UTC(대상 경로 × 출처 라우트). 운영 변경 없음.
- 규정: 메신저 hard lock · 운영 DB 변경 Owner 승인 · 통화 경로(푸시 발송·통화 세션)는 건드리지 않는다.

## 1. 2단계 대상 — 받는 사람마다 도는 DB 작업
| 기호 | 작업 | 위치 | 받는 사람 1명당 |
|---|---|---|---|
| B1 | 알림 대상 「안 읽음」 표시 RPC `upsert_notification_target_unread` | `notification-target-messenger-bridge.ts:495` → `notification-targets.ts:103` | 1 |
| B1a | B1 이 처음 안 읽음으로 바뀌면 사본 3종 즉시 재생성(허브 배지·채팅 목록·사장님 알림) | `notification-targets.ts:46-53` | 최대 6 |
| B7·A15 | 보내는 사람·받는 사람마다 사본 즉시 재생성: 홈 목록 사본(RPC+저장) · 부트스트랩 워터마크 RPC · 허브 배지 사본(RPC+저장) | `send-post-ack-effects.ts:85-99` | 5 |

(푸시 단계의 배지 권위 3번(B9)은 `lib/push/**` 안 → 3단계·통화 규정.)

## 2. 실측 — 즉시 재생성은 대부분 쓰이지 않는다 (Vercel 11-20 UTC 하루)
| 사본 | 쓰기 경로가 즉시 재생성한 횟수 (보내기·읽음·통화·이미지·스티커) | 읽은 횟수 | 읽을 때 다시 만든 횟수 |
|---|---|---|---|
| 홈 목록 사본 `community_messenger_home_sync_snapshots` | **574** (보내기 273 · 읽음 173 · 통화 70 · 이미지 38 · 스티커 20) | 251 (`/home-sync`) | **108** |
| 허브 배지 사본 `hub_badge_user_unread_counters` | **670** (338 · 172 · 73 · 57 · 30) | 384 (`/me/store-owner-hub-badge`) | 9 |
| 부트스트랩 워터마크 | 575 | — | — |

- 두 사본 모두 **5초 TTL**(`homeSyncSnapshotCounterTtlMs`·`hubBadgeUnreadCounterTtlMs` 기본 5,000ms). 읽기 쪽은 이미 「오래됐으면 다시 만든다」 경로가 있다(홈: 동기 RPC · 허브: 오래된 값 응답 + 뒤에서 재생성).
- 즉, 보내기 때마다 받는 사람 전원의 사본을 미리 만들지만, 그 사람이 5초 안에 열지 않으면 버려진다. 홈은 574번 미리 만들었는데도 읽기 251번 중 108번은 다시 만들었다.

## 3. 레거시 구조와 차이
| | 카카오톡·텔레그램 | DIBAY |
|---|---|---|
| 받는 사람 목록 상태 | 쓰는 순간 「바뀜」 표시만(또는 카운터 +1), 읽을 때 그 사람 것만 계산 | 쓰는 순간 받는 사람 전원 사본을 통째로 다시 계산·저장 |
| 받는 사람 여러 명 | 집합 연산 1번 | 사람마다 RPC 6~12번 |

## 4. 설계
### 4-1. 「바뀜 표시」 열 추가 (운영 DB · 표 변경)
- `community_messenger_home_sync_snapshots.invalidated_at timestamptz`
- `hub_badge_user_unread_counters.invalidated_at timestamptz`
- 의미: `invalidated_at > updated_at` 이면 그 사본은 **틀림** → 읽는 쪽이 오래된 값을 쓰지 않고 즉시 다시 만든다.

### 4-2. 묶음 DB 함수 2개 (운영 DB · 기존 함수 규칙 그대로)
| 함수 | 하는 일 | 부르는 횟수 |
|---|---|---|
| `messenger_fanout_invalidate(p_user_ids uuid[])` | 사용자마다 ① 기존 `invalidate_cm_bootstrap_snapshot_watermark` 와 같은 문장(같은 잠금·같은 행) ② 홈 사본·허브 사본 `invalidated_at = now()` | 보내기 1번당 **1** (보내는 사람 + 받는 사람 전원) |
| `upsert_notification_target_unread_many(p_user_ids uuid[], 나머지 인자 같음)` | 사용자마다 기존 `upsert_notification_target_unread` 를 그대로 호출, **처음 안 읽음이 된 사용자 id 목록**을 돌려줌 | 보내기 1번당 **1** |

### 4-3. 코드
| 바꾸는 곳 | 내용 |
|---|---|
| 보내기 뒤 무효화(`send-post-ack-effects.ts:85-99`) | 사용자마다 즉시 재생성 → `messenger_fanout_invalidate` 1번 + 서버 메모리 캐시 무효화(지금과 같음) |
| 대상 bump(`notification-target-messenger-bridge.ts:495`) | 받는 사람마다 RPC → `_many` 1번. 처음 안 읽음이 된 사람만 메모리 캐시 무효화(지금과 같음) · 사본 즉시 재생성(B1a)은 바뀜 표시로 대체 |
| 홈 사본 읽기(`home-sync-snapshot.ts:59` `readHomeSyncSnapshotCounter`) | `invalidated_at > updated_at` 이면 `stale` 이 아니라 **없음**으로 → 기존 동기 RPC 경로(지금 오래된 사본과 같은 경로) |
| 허브 사본 읽기(`owner-hub-badge-snapshot.ts:265` · `hub-badge-unread-counter.ts` `readHubBadgeUnreadCounter`) | 같은 규칙 → 바뀜 표시면 오래된 값 응답(SWR) 대신 **동기 재생성** — 숫자가 늦게 맞는 일이 생기지 않게 |
| 재생성 저장 | `updated_at` 을 **계산을 시작한 시각**으로 저장 → 계산 중에 들어온 바뀜 표시가 지워지지 않음(경쟁 조건) |
| 함수가 없을 때 | 기존 즉시 재생성 경로로 폴백(배포·DB 적용 순서 무관) |

- 읽음 처리·통화·이미지·스티커 경로도 같은 무효화 함수를 쓰므로 **같은 이득**을 본다(위 표의 574·670 전체가 대상). 단 통화 세션 경로(`calls/sessions/[sessionId]` 70·73)는 **통화 규정** — 이번에 그 경로의 호출부는 바꾸지 않는다(공용 함수가 바뀌면 영향받으므로, 통화 경로는 기존 즉시 재생성 함수를 계속 부르도록 분리).

## 5. 효과 (보내기 1번당 Supabase · 1단계 반영 후 기준)
| 방 | 1단계 후 | 2단계 후 | 근거 |
|---|---|---|---|
| 1:1 | 46 | 약 37 | −(B1 1 + B7 5 + A15 5) + 2 |
| 그룹 4명 | 약 93 | 약 72 | −(3×6 + 5) + 2 |
| 그룹 100명 | 약 2,500 | 약 1,900 | −(99×6 + 5) + 2 |

- 읽는 쪽 비용: 바뀜 표시된 사람이 **실제로 열 때만** 재생성 2번(RPC+저장). 11-20 기준 홈 읽기 251 · 허브 읽기 384 — 즉시 재생성 1,244번(574+670)×2 보다 훨씬 적다.
- 남는 받는 사람 비례분(약 17/명)은 푸시 단계(3단계 · 통화 규정)와 알림 저장(인계 표시 포함).

## 6. 위험 · 검증
| 위험 | 대응 |
|---|---|
| 배지·목록 숫자가 늦게 맞음 | 바뀜 표시면 읽는 쪽이 오래된 값 대신 동기 재생성(SWR 금지) → 지금보다 늦지 않음 |
| 계산 중 들어온 메시지 누락 | 저장 시각 = 계산 시작 시각 → 바뀜 표시가 남아 다음 읽기에서 다시 계산 |
| 읽기 지연 | 바뀜 표시된 첫 읽기만 RPC 1번 지연(지금 오래된 사본 경로와 같은 비용) |
| 통화 경로 영향 | 통화 세션 경로는 기존 함수 유지 — 호출부 무변경 |
| 검증 | 운영 되돌림 시험(묶음 함수 = 기존 함수를 사람마다 부른 결과와 행 단위 대조) · 단위 테스트(바뀜 표시 판정·경쟁 조건·폴백) · 실기(보내기 직후 받는 사람 홈 목록·하단 배지·허브 배지 숫자) · 운영 하루 비교(사본 재생성 횟수·보내기 1번당) |

## 7. NOT_PROVEN · 확인 필요
- 채팅 목록 사본(`trade_chat_rooms_snapshots`)·사장님 알림 사본(B1a 의 나머지 2종)도 같은 5초 TTL 구조임은 코드로 확인(`chat-rooms-snapshot.ts:89`·`owner-dashboard-notifications-snapshot.ts:83`). 같은 「바뀜 표시」를 넣을지는 구현 때 읽기 경로를 다시 확인해 같은 PR 에서 결정 — 이번 설계 수치에는 넣지 않음.
- 받는 사람이 수백 명일 때 묶음 함수 1번의 실행 시간(잠금 포함) — 되돌림 시험으로 측정 필요.

## 8. 구현 (Owner 「구현 승인」) · 운영 되돌림 시험
| 구현 | 위치 |
|---|---|
| 열·묶음 함수 3개(바뀜 표시 · 워터마크 묶음 · 대상 묶음) | `supabase/migrations/20271121120000_messenger_send_fanout_stage2.sql` |
| 바뀜 표시 묶음 쓰기(마이크로태스크로 모아 1번 · 실패면 그 사람만 즉시 재생성) | `lib/community-messenger/messenger-snapshot-dirty.ts` |
| 읽는 쪽 판정(순수) · 열 없는 DB 자동 대응 | `lib/community-messenger/messenger-snapshot-invalidated.ts` |
| 보내기 뒤 무효화만 `lazySnapshot`·`deferWatermark` + 워터마크 묶음 | `community-messenger-send-post-ack-effects.ts` |
| 채팅방 대상 bump 묶음(실패한 사람만 사람별) | `notification-targets.ts` `bumpChatRoomTargetsForRecipientsBatch` · `notification-target-messenger-bridge.ts` |
| 읽는 쪽 3곳 바뀜 표시 → 다시 계산 · 저장 시각 = 계산 시작 | `home-sync-snapshot.ts` · `owner-hub-badge-snapshot.ts` · `hub-badge-unread-counter.ts` · `user-chat-unread-parts.ts` |
| 통화·읽음·이미지 등 그 밖 호출부 | **무변경**(옵션 기본값 = 기존 즉시 재생성) — §4-3 의 「읽음·이미지도 같은 이득」은 이번에 넣지 않음(보내기 경로만) |

운영 되돌림 시험(11-21, 11명 그룹방, 모두 되돌림): 묶음 함수와 기존 함수 사람별 호출 결과 비교 —
처음 안 읽음이 된 사람 8/11 **같음** · 대상 행 11개 값 **같음** · 워터마크 11행 같음 · 바뀜 표시 홈 11·허브 11 · 실행 9.1ms(대상)·1.6ms(워터마크).
