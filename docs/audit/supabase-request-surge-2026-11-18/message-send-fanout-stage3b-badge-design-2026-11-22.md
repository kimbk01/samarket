# 메시지 보내기 3b단계 — 푸시 앱 아이콘 배지 묶기 · 인계 대기 저장 합치기 · 설계 + 통화 영향 분석 (2026-11-22 PHT)

- 지시: Owner 「3b 설계 진행」. 앞 단계: 3a PR #548(11-21 11:59 PHT 운영 반영 · 실기 미실시).
- **통화 변경 규정 대상** — 배지 계산·푸시 발송·알림 저장은 부재중 통화와 공용. 이 문서 승인 전 구현하지 않는다. 단독 PR · 코드 PASS + 실기 PASS.
- 근거: 코드(main `ec7c67d` · 파일:줄 아래) · 운영 DB 함수·권한·색인 읽기 전용. 운영 변경 없음.

## 1. 지금 — 받는 사람마다 남은 것 (3a 이후)
| 단계 | 위치 | 받는 사람 1명당 |
|---|---|---|
| 앱 아이콘 배지 계산 `fetchDomainBadgeAuthorityPayload(force)` | `notify-push-dispatcher.ts:179` | rpc `get_member_unread_room_inputs` 1 · 안 읽은 알림 행 1 · 소유 매장 1 · (사장님이면 매장마다 RPC 1) · (10% 표본 감시 2~4) |
| 알림 저장 뒤 「인계 대기」 갱신 | `notify-message-pipeline.ts:398` → `chat-notification-push-handoff.ts:64` | 1 |

## 2. 확인한 사실 (코드·운영)
| 사실 | 근거 |
|---|---|
| 푸시에 싣는 숫자 = 앱 아이콘 A+B (알림 A + 대화 B). **사장님 운영 수 O 는 빠진다** | `build-domain-badge-authority-http.ts` `resolveMemberAppIconAuthority({ notificationA, conversationB, ownerOperationCount: 0 })` · `memberAppIconWebTotal = memberAppIconAuthority.appIconTotal` · `notify-push-dispatcher.ts:181` |
| A 는 안 읽은 알림 행에서만(`resolveMemberNotificationAuthorityFromRows`) · B 는 안 읽은 방 입력에서만(`conversationRoomsFromParticipantFactsNormalized` → `resolveMemberConversationAuthority`) | 같은 파일 |
| → 푸시 배지에는 **소유 매장·매장별 RPC·부재중 고아·분류 수가 필요 없다**(전체 배지 응답에만 필요) | 위 |
| `get_member_unread_room_inputs` = `select * from member_unread_room_inputs where user_id = p_user_id` | 운영 함수 정의 |
| 서버 권한은 이 표를 바로 읽을 수 있다 | 운영 `has_table_privilege(service_role, select) = true` |
| 안 읽은 알림 행 읽기 = 사람마다 `unread=true · read_at null · created_at 내림차순 · 최대 2000` | `load-bell-explain-unread-events.ts:17` · 운영 색인 `idx_notification_events_user_unread (user_id, created_at desc) where unread and read_at is null` |

## 3. 설계
| 항목 | 내용 | 통화 쪽 |
|---|---|---|
| 3b-1 계산 하나로 | 배지 계산 함수에서 「앱 아이콘 A+B 를 사실에서 계산」 부분을 **그대로 떼어 내** 순수 함수로(기존 전체 계산도 이 함수를 부른다 → 한 곳). | 전체 배지 계산은 같은 줄을 부르므로 결과 동일 |
| 3b-2 묶음 읽기 | 받는 사람 전원: ① `member_unread_room_inputs` `.in(user_id)` 1번(운영 DB 변경 없음) ② 새 DB 함수 `notification_bell_unread_rows_many(p_user_ids, p_limit)` 1번 — 사람마다 같은 조건·같은 정렬·같은 상한(`row_number() over (partition by user_id order by created_at desc)`) | — |
| 3b-3 사람별 계산 | 사람마다 기존 로더(`loadMessengerUnreadRoomFactsFromParticipants`·`loadTradeStoreOrderUnreadRoomFactsFromParticipants`)에 미리 읽은 입력을 넣고 → 3b-1 함수로 A+B. 로더 안의 조건부 조회(식별 키 없는 1:1 방 상대 조회 등)는 지금 그대로 | — |
| 3b-4 발송에 넘기기 | 채팅 보내기 묶음 경로만 `preloadedBadgeTotal` 을 `dispatchNotificationPushIfAllowed` 에 넘김 → 그때만 배지 계산 생략. **부재중 통화 분기에는 넘기지 않음** | 부재중 통화 = 지금 계산 그대로 |
| 3b-5 인계 대기 합치기 | 알림 저장 입력에 선택 필드(인계 대기 시각) → 저장 문장에 `push_handoff_status='pending'` 등 같은 값을 포함 · 저장 뒤 갱신 생략. 채팅 보내기 파이프라인만 넘김 | 부재중 통화 저장은 필드 없음 → 지금 그대로 |
| 폴백 | 묶음 읽기·새 함수 실패 → 사람마다 기존 배지 계산 | — |

## 4. 효과 (보내기 1번당 Supabase · 3a 후 기준)
| 방 | 3a 후 | 3b 후 | 근거 |
|---|---|---|---|
| 1:1 | 약 37 | 약 35 | 받는 사람 1명: 배지 3 → 묶음 2 · 인계 대기 1 → 0 |
| 그룹 4명 | 약 50 | 약 40 | −(3명 × 4) + 2 |
| 그룹 100명 | 약 550 | 약 160 | −(99 × 4) + 2 · 남는 비례분 = 알림 저장 1 + 발송 기록 2×기기 |
| (사장님 받는 사람) | 매장 수만큼 더 | 0 | 푸시 배지는 매장 수가 필요 없음 |

## 5. 통화 영향 분석 (규정 3번)
| 항목 | 내용 |
|---|---|
| 바꾸는 파일·함수 | `build-domain-badge-authority-http.ts`(A+B 계산 떼어 내기 — 순수 이동) · `notify-push-dispatcher.ts`(`preloadedBadgeTotal` 있으면 계산 생략) · `notification-event-dispatcher.ts`(전달) · `send-post-ack-effects.ts`·`chat-push-facts-batch.ts`(채팅 묶음) · `notification-event-repository.ts`(인계 대기 선택 필드) · `notify-message-pipeline.ts`(채팅만 필드 전달) · 새 DB 함수 1개 |
| 바뀌는 동작 | 채팅 보내기 푸시만: 배지 숫자를 묶음 사실로 계산(같은 계산식) · 인계 대기를 저장과 함께. 통화 4종은 배지 계산을 원래 안 함 · 부재중 통화는 인자 없음 → 지금 그대로 |
| 영향받는 경로 | 배지 숫자 API·읽음 응답·부재중 통화 배지(같은 계산 함수 — 순수 이동이라 결과 같아야 함) · 채팅 푸시 배지 숫자 · cron 재발송(인계 대기 행을 고름 — 같은 값이 저장 시점에 들어감) |
| 설치된 구 바이너리 | 11-21 조회: Android 1.2.7 (80)·(54) · iOS 1.2.6 (58)·1.2.5 (56)·1.2.4 (53) 등 — **페이로드 키·값 불변**(배지 숫자는 같은 식) |
| 회귀 위험 | ① 떼어 낸 함수가 기존과 다르면 모든 배지 숫자가 바뀜 → 같은 입력 비교 테스트 + 운영 실데이터 대조(사람별 기존 계산 vs 묶음 계산, 읽기 전용) ② 새 DB 함수의 상한·정렬 → 되돌림 시험으로 사람별 쿼리와 행 단위 대조 ③ 인계 대기 저장 → cron 이 같은 행을 같은 시각에 고르는지 테스트 |
| 롤백 | Instant Rollback(재빌드 없음) · DB 함수는 안 써도 무해 |
| 실기 검증 | 3a 행렬(통화·채팅 푸시) + **배지 숫자**: 채팅 받은 뒤 앱 아이콘 숫자(Android·iPhone) · 부재중 통화 뒤 배지 숫자 · 읽음 뒤 숫자 감소 |
| 반영 | 단독 PR · 단독 반영 · FAIL 이면 즉시 롤백 |

## 6. NOT_PROVEN
- 받는 사람이 수백 명일 때 묶음 읽기 크기(안 읽은 알림 행 사람당 최대 2000) — 되돌림 시험으로 실행 시간 측정.
- 3a 실기 미실시 상태에서 3b 를 얹는 순서 — 3a 실기 PASS 뒤 3b 반영을 권장(통화 규정 6번 「PASS 전 다음 단계 금지」).

## 7. 구현·검증 (2026-11-22 PHT · Owner 「승인·실기 후 반영」)
| 항목 | 결과 |
|---|---|
| 3b-1 | `computeMemberAppIconFromFacts` 떼어 냄 — 전체 배지 계산도 이 함수를 부른다(순수 이동) |
| 3b-2·3 | `loadPushBadgeTotalsBatch`(`chat-push-facts-batch.ts`) — 표 1번 + 새 DB 함수 1번 → 사람마다 기존 로더 + 같은 함수 · 오류면 null(사람마다 기존 계산) |
| 3b-4 | `PreloadedChatPushFacts.badgeTotal` → `notify-push-dispatcher.ts` 가 있으면 계산 생략. `missed_call` 이면 넘겨도 무시 |
| 3b-5 | `CreateNotificationEventInput.chatPushHandoffPendingNextAt` → 저장 문장에 인계 대기 5열(기존 갱신과 같은 값·같은 60초). 채팅 보내기 파이프라인만 넘김. 저장된 행이 `pending` 이면 저장 뒤 갱신 생략(아니면 지금처럼 갱신) |
| 운영 되돌림 시험 (읽기 전용 트랜잭션 · 함수 생성 후 rollback) | 안 읽은 알림 많은 상위 100명: 사람별 쿼리와 **불일치 0** · 행 2,270 · 사람당 최대 232 · 같은 시각 동점 0 · 100명 묶음 1번 약 0.1~0.5초 |
| 운영 TS 전체 대조(사람별 `fetchDomainBadgeAuthorityPayload` vs 묶음) | **NOT_PROVEN** — 운영에 함수가 없어 실행 불가. 대신: 입력 표 = RPC 정의(`select *`) 동일 · 알림 행 = 위 SQL 대조 · 계산 = 같은 함수(단위 테스트) |
| 반영 | **보류** — 3a 실기 행렬 PASS + Owner 지시 뒤 병합 · 병합 때 DB 함수 적용(승인 필요) |
