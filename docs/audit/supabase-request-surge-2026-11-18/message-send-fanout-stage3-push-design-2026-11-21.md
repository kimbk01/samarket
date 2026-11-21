# 메시지 보내기 3단계 — 푸시 단계 묶기 · 설계 + 통화 영향 분석 (2026-11-21 PHT)

- 지시: Owner 「3단계 설계 진행」. 앞 단계: 1단계 PR #542(반영) · 2단계 PR #547(DB 적용 · 병합 대기).
- **통화 변경 규정 적용 대상** — 바꾸는 파일이 `lib/push/**`·서버 푸시 발송(통화 푸시와 공용)이다. 이 문서가 규정 3번의 「영향 분석·계획 문서」다. **Owner 승인 전 구현하지 않는다.** 구현은 이 변경만 단독 PR · 단독 반영 · 코드 PASS + 실기 PASS.
- 근거: 코드 추적(main `daa6ede` · 파일:줄 아래) · 운영 DB 읽기 전용(설치 앱 버전) · Vercel 관측 11-20. 운영 변경 없음.

## 1. 지금 — 받는 사람 1명당 푸시 단계 16~17번 (차례로 한 명씩)
보내기 뒤 `send-post-ack-effects.ts:250` 이 받는 사람을 **한 명씩 기다리며** `dispatchNotificationEvent` 를 부른다.

| # | 단계 (파일:줄) | Supabase | 받는 사람마다? |
|---|---|---|---|
| 2 | 앱 아이콘 배지 계산 `notify-push-dispatcher.ts:179` → `fetchDomainBadgeAuthorityPayload(force)` | rpc `get_member_unread_room_inputs` · `notification_events`(안 읽은 알림 행) · `stores`(소유 매장) | 예 (3) |
| 4 | 방금 저장한 알림 다시 읽기 `dispatch-push-for-user.ts:247` | `notification_events` by id | 예 (1) — 호출부가 이미 같은 행을 가짐 |
| 5~8 | 안전 확인 `notification-delivery-safety-gate.ts:213,53,71,90` | 차단 관계 · **방(모두 같음)** · 참가 · 그룹 강퇴 | 예 (3~4) |
| 9 | 알림 설정 `notification-preference-storage-reader.server.ts:72-113` | 표 4개 | 예 (4) |
| 10~11 | 푸시 대상 `load-active-push-targets.ts:52,73` | `user_devices` · `web_push_subscriptions` | 예 (2) |
| 12·14 | 발송 기록 저장·갱신 | `notification_deliveries` | 기기마다 (2×기기) |
| 17 | 인계 완료 `chat-notification-push-handoff.ts:96` | `notification_events` | 예 (1) |

## 2. 통화 푸시와 공유하는 지점 (코드 확인)
| 공용 함수 | 통화 쪽 사용 | 갈라지는 곳 |
|---|---|---|
| `dispatchNotificationEvent` | **부재중 통화**(`missed_call`) — `service.ts:1432` · 인계 cron | `notification-event-dispatcher.ts:66` |
| `dispatchNotificationPushIfAllowed` | 부재중 통화 — 배지 계산(:179)을 **같이 실행** | `notify-push-dispatcher.ts:188` |
| `dispatchPushForUser` | 수신·취소·거절·종료·다른 기기 수락·부재중 **전부** | `callPush`(:238) 면 다시 읽기·안전 확인 생략 · `terminalDismiss`(:239) 면 설정 생략 · 부재중 iOS 보류(:382) · VoIP 우선(:372) |
| 설정 읽기 `readNormalizedNotificationPreferenceSnapshot` | 부재중 통화(설정 확인함) | `dispatch-push-for-user.ts:298` |
| 대상·발송 기록·전송·페이로드(`loadActivePushTargets`·`insertNotificationDeliveryDetailed`·`sendToTarget`·`buildFcmDataFields`) | 전부 | 통화 분기가 각 파일 안에 있음 |
| 알림 저장(`notification-event-repository`) · 인계 모듈(`CHAT_CALL_TYPES`) | 부재중 통화 저장·cron 재발송 | — |

→ 채팅만 바꾸고 통화가 실행하는 줄을 **하나도** 안 건드리려면, 채팅 전용 묶음 발송 함수를 새로 만들어 위 로직을 복제해야 한다(약 400줄 · 두 경로가 갈라질 위험). **채택하지 않는다.**
→ 채택: 공용 함수에 「미리 읽은 값」 선택 인자를 추가(통화 호출은 인자를 넘기지 않으므로 지금과 같은 조회·같은 분기). 통화가 실행하는 줄이 바뀌므로 **이 문서 승인 + 통화 실기 행렬**을 거친다.

## 3. 설계 (채팅 보내기 경로만 미리 읽기 · 통화 호출은 인자 없음 = 지금 동작)
| 항목 | 바꾸는 것 | 통화 호출 |
|---|---|---|
| 3-1 | 보내기 뒤 푸시 루프: 받는 사람 전원 사실을 **한 번에** 미리 읽기 — 안전 확인(차단·참가·강퇴 `.in` · 방 1번) · 알림 설정 4표(`.in`, 사람당 행 2개 이상이면 지금과 같은 「설정 읽기 실패」 처리) · 푸시 대상(`user_devices`·`web_push_subscriptions` `.in`, 같은 정렬 후 사람별로 기존 `filterUserDevicePushTargets`) | 인자 없음 → 기존 조회 |
| 3-2 | 알림 행 다시 읽기 생략 — 미리 읽은 행 사용. 단 지금 「행이 없으면 건너뜀(`notification_event_not_found`)」 동작을 지키려고 묶음 읽기 1번(`.in(id)`)으로 존재 확인 | 통화는 원래 다시 읽지 않음 |
| 3-3 | 앱 아이콘 배지: 받는 사람 전원 입력을 묶음으로(새 DB 함수 `get_member_unread_room_inputs_many` · 안 읽은 알림 행·소유 매장 묶음) → **기존 계산 함수에 미리 읽은 입력을 넣어** 같은 숫자 | 부재중 통화는 인자 없음 → 기존 계산 |
| 3-4 | 인계 완료 표시: 성공한 사람들 묶음 1번(`.in(id)` · 같은 `pending`·claim 조건) | 통화 무관(cron 경로 그대로) |
| 3-5 | 「인계 대기」 표시(보내기 1단계에서 미룬 ⑤): 알림 저장 열에 포함 → 저장 뒤 갱신 1번 생략 | 부재중 통화 저장은 인자 없음 → 지금 그대로 |
| 3-6 | 받는 사람 차례 대기 → 동시 처리(상한 8) — 받는 사람끼리 순서 의존 없음(코드 확인: 모든 읽기·쓰기가 그 사람·그 이벤트·그 기기 키, 발송 기록 고유 키 = 이벤트×기기) | 무관 |
| 유지 | 발송 기록 저장·갱신(기기마다 · 재시도 장부) · 전송 · 페이로드 생성 | 무변경 |

- **페이로드는 바이트 단위로 같아야 한다**(설치 앱이 읽는 키: Android `FcmPayloadResolver`·`DibayFirebaseMessagingService` badgeCount · iOS `aps.badge`). 새 경로와 기존 경로가 같은 입력에서 같은 `out`·`opts` 를 만드는지 스냅샷 테스트로 고정한다.

## 4. 효과 (보내기 1번당 Supabase · 2단계 후 기준)
| 방 | 2단계 후 | 3단계 후 | 근거 |
|---|---|---|---|
| 1:1 (받는 사람 1) | 약 37 | 약 36 | 묶어도 1명이면 같음(다시 읽기·인계 대기 2번만 줄어듦) |
| 그룹 4명 | 약 72 | 약 37 | 받는 사람당 약 15 → 기기당 2 + 묶음 약 15 |
| 그룹 100명 | 약 1,900 | 약 250 | 남는 비례분 = 발송 기록 2×기기 수 |

## 5. 통화 영향 분석 (규정 3번 항목)
| 항목 | 내용 |
|---|---|
| 바꾸는 파일·함수 | `send-post-ack-effects.ts`(푸시 루프 · 채팅 전용) · `notification-event-dispatcher.ts`·`notify-push-dispatcher.ts`(미리 읽은 값 인자 전달) · `dispatch-push-for-user.ts`(인자 있으면 다시 읽기·안전·설정·대상 조회 대신 사용) · `notification-delivery-safety-gate.ts`·`notification-preference-storage-reader.server.ts`·`load-active-push-targets.ts`(미리 읽은 값 받는 버전 추가) · 배지 계산(입력 주입) · 알림 저장(인계 대기 열) · 새 DB 함수 1개 |
| 바뀌는 동작 | 채팅 보내기 푸시만: 조회 묶음 · 동시 발송. **통화 푸시(수신·취소·거절·종료·다른 기기 수락·부재중)는 인자를 안 넘기므로 같은 조회·같은 분기** |
| 영향받는 경로 | 발신 시작·세션 생성(무관) · VoIP/FCM 발송(공용 함수 경유) · iOS CallKit/Android 수신 화면(페이로드 동일해야) · 취소/거절/종료/부재중(인자 없음) · 상태 폴링(무관) · 통화 기록(무관) |
| 설치된 구 바이너리 | 운영 `user_devices`(11-21): Android 1.2.7 (80) 23대 · (54) 5대 · iOS 1.2.6 (58) · 1.2.5 (56) · 1.2.4 (53) · 그 이전 일부 — **페이로드 키·값 불변**이라 영향 없음(스냅샷 테스트로 고정) |
| 회귀 위험 | ① 묶음 읽기가 사람별 판정과 다르면 알림 누락·오발송 → 단위 테스트(사람별 경로와 같은 결과) + 운영 되돌림 시험 ② 동시 발송으로 FCM/APNs 순간 부하 → 상한 8 ③ 공용 함수에 인자 분기 추가 — 통화는 인자 없음 |
| 롤백 | Vercel Instant Rollback(재빌드 없음) → 원인 수정 PR. DB 새 함수는 안 써도 무해 |
| 실기 검증 항목 | **통화 행렬**(규정 5번): Android↔iPhone 음성·영상 발신·수신 · 거절 · 벨 중 취소 · 취소 후 지연 푸시(재울림 없음) · 통화 중(busy) · 무응답 타임아웃(부재중 알림·배지) · 정상 종료 후 즉시 재발신. **채팅 푸시**: 1:1·그룹 수신(앱 꺼짐·백그라운드) · 음소거 방(소리 없음) · 차단 상대(알림 없음) · 강퇴된 사람(알림 없음) · 앱 아이콘 배지 숫자 · 알림음 설정. 각 항목 발송 시각·`notification_deliveries`·수신 화면 시각 기록(운영 DB 대조) · 매 시험 Production SHA 확인 |
| 반영 방식 | 이 변경만 단독 PR · 단독 main 반영 · 실기 FAIL 이면 즉시 중단·롤백 |

## 6. NOT_PROVEN · 확인 필요
- FCM/APNs 공급자 쪽 동시 전송 한도(APNs HTTP/2 세션 동시성) — 상한 8 이 안전한지 실기에서 확인.
- iOS 알림 서비스 확장이 읽는 키 전체 목록(코드 추적 범위 밖) — 페이로드 불변 원칙으로 대응.
- 실기 시험 앱 실행 횟수: 규정상 10회 이하 — 행렬 항목 수로 볼 때 초과 가능성 → 시작 전 횟수 계획 보고.

## 7. 구현 범위 (Owner 「설계 승인」) — 3a 먼저 · 3b 다음
| 항목 | 이번(3a) | 다음(3b) |
|---|---|---|
| 3-1 안전 확인·설정·대상 묶음 읽기 | 구현 — `lib/push/dispatch/chat-push-facts-batch.ts` | |
| 3-2 알림 행 다시 읽기 → 묶음 존재 확인 | 구현 | |
| 3-4 인계 완료 묶음 | 구현 — `markChatPushHandoffFastPathSentMany` | |
| 3-6 동시 발송(상한 8) | 구현 — `send-post-ack-effects.ts` | |
| 3-3 앱 아이콘 배지 묶음(새 DB 함수 + 배지 계산 입력 주입) | | **보류** — 배지 계산 함수가 크고 부재중 통화·배지 API·읽음 응답이 함께 쓴다. 따로 PR |
| 3-5 인계 대기를 저장 열에 합치기 | | **보류** — 알림 저장(부재중 통화 저장과 공용) |

**공용 함수 변경(통화가 실행하는 줄)**: `dispatch-push-for-user.ts` 에 `preloaded_chat_facts` 선택 인자 — `callPush` 면 무시(통화 4종·부재중은 넘기지도 않음). `notify-push-dispatcher.ts`·`notification-event-dispatcher.ts` 는 부재중 통화 분기에 넘기지 않음. 그 밖: 순수 함수 export 추가(`isExpired`·설정 select 상수·웹푸시 행 변환 공유).

**3a 효과(정정)**: 배지 3번이 받는 사람마다 남으므로 그룹 4명 **약 72 → 약 50**, 그룹 100명 **약 1,900 → 약 550**(배지 3 + 발송 기록 2×기기). §4 표(약 37·약 250)는 3b 까지 포함한 값.
