# 발신 후 수신 전 취소 → 수신자 「부재중」 — 감사·설계안 (2026-11-13 PHT)

> 상태: **설계안 — 코드 변경 0건.** 통화 변경 규정 3번(Owner 승인 후 구현) · 통화 단독 PR.
> 기준: main `4bf987ea0`, 운영 DB(읽기 전용) 최근 14일 1:1 통화.

## 0. Owner 지시 (원문)
> 「발신후 수신전 취소 하면 발신자는 취소가 되는 거지만 수신자는 부재중으로 되어야 하는 부분이다, 받지 않을 때도 부재중이지만」

| 경우 | 발신자 | 수신자 |
|---|---|---|
| 발신 후 수신 전 발신자 취소 | 취소 | **부재중** |
| 받지 않음(시간 초과) | (지금 그대로) | 부재중 |

## 1. 감사 — 현재 상태 (증거)
| # | 항목 | 현재 | 증거 | 판정 |
|---|---|---|---|---|
| A1 | 수신자 화면 문구(채팅방 기록·채팅 목록 미리보기·통화 기록) | **「취소」** | `lib/community-messenger/call-event-presentation.ts` `resolveCallEventCanonical` — `cancelled_by_caller`/`cancelled` → `outgoing_cancelled`, 보는 사람 역할 무시. 주석 「발신자가 취소 → 취소 — 발신자·수신자 동일 (제품 결정 2026-10-16)」(`0ebb82f15`) | **FAIL** |
| A2 | 같은 계약의 다른 문서와 충돌 | `call-history/call-log-display-type.ts` 주석은 「발신자 취소: 수신자 `incoming_missed`(부재중)」 — 코드(A1)와 반대 | 파일 주석 4~7줄 | 계약 불일치 |
| A3 | 수신자 부재중 알림(서버) | **만들지 않음** | `call-missed-notification-authority.ts` `decideRoomBoundMissedCallNotification` — `status !== missed` 면 제외, `ended_reason canceled/cancelled` 제외. 호출부 `service.ts` `notifyRoomBoundMissedCallBestEffort` 첫 줄 `if (mapped.status !== "missed") return` | **FAIL** |
| A4 | 수신자 기기 알림(Android) | 취소 신호를 받으면 벨만 멈춤, 부재중 알림 없음 | `IncomingCallTerminalHandler.handle`(정리만) · 부재중 알림은 `IncomingCallActionCoordinator.handleMissedTimeout`(기기 시간 초과) 또는 서버 `missed_call` 푸시(`DibayFirebaseMessagingService` 90~93줄 → `MissedCallNotificationHelper.show`) 때만 | FAIL (A3 의 결과) |
| A5 | 운영 실제 — 발신자 취소 | 14일 115건 · 이 중 114건은 수신자 폰이 실제로 울림(`incoming_push_claimed_at` 있음) · 평균 12.1초 후 취소 · 통화 기록 115건 모두 「cancelled」 · 수신자 부재중 알림 **0건** | 운영 DB 조회 | FAIL 실측 |
| A6 | 운영 실제 — 받지 않음 | 14일 75건 · 통화 기록 「missed」 75건 · 수신자 부재중 알림 75건 · 그중 푸시 발송 기록 `sent` 62건 | 운영 DB 조회 | PASS |
| A7 | 말풍선 색 판정 | 「부재중」 판정을 저장 상태(`callStatus === "missed"`) 또는 **한국어 글자**(`/부재중/`)로 함 → 수신자 문구만 부재중으로 바꾸면 한국어는 맞지만 **영어 화면은 「취소」 색** | `components/community-messenger/room/phase2/MessengerTimelineBubbleInners.tsx:173-176` | 같이 고쳐야 함 |
| A8 | 채팅 목록 방 배지(부재중 수) | 서버 부재중 알림(`notification_events type=missed_call` 안 읽음)으로 셈 | `lib/notifications/load-orphan-missed-call-facts.ts` → `missedCallByRoom` | A3 를 고치면 함께 맞춰짐 |

## 2. 레거시 앱 기준 (원문)
텔레그램 Android (DrKLO/Telegram master):
- `VoIPService.hangUp` — 발신자가 응답 전(`STATE_WAITING && isOutgoing`) 끊으면 사유 `DISCARD_REASON_MISSED`(시간 초과와 같은 「부재중」 사유)로 보냄.
- `MessageObject` `TL_messageActionPhoneCall` — 같은 「부재중」 사유를 **보낸 사람 = 「Cancelled Call」(취소), 받은 사람 = 「Missed Call」(부재중)** 으로 표시.
→ Owner 지시와 같다. 기존 「양쪽 동일」(2026-10-16)은 레거시와 다르다.

## 3. 충돌 보고
- 승인됐던 제품 결정 「종료 결과는 보는 사람과 무관 — 취소는 양쪽 취소」(2026-10-16, `0ebb82f15`) ↔ 이번 Owner 지시 「수신자는 부재중」.
- 이 설계는 **이번 지시와 레거시(텔레그램)** 를 따라 「발신자 취소」 한 경우만 보는 사람에 따라 나눈다. 거절·받지 않음·연결 후 종료는 지금 그대로.

## 4. 설계
### D1. 화면 문구 — 발신자 취소는 보는 사람에 따라
- `resolveCallEventCanonical`: `cancelled_by_caller`(또는 저장 상태 `cancelled`) 이고 **보는 사람이 수신자** → `incoming_missed`(부재중). 발신자 → `outgoing_cancelled`(취소) 그대로.
- 이 함수 하나를 채팅방 기록(`call-event-message.ts`)·채팅 목록 미리보기(`call-stub-room-tip.ts` → `cm-home-list-copy.ts`)·통화 기록(`call-log-display-type.ts`)이 모두 쓰므로 세 화면이 함께 바뀐다(진입점 전수).
- 통화 중(`peer_busy`·`caller_busy`)은 이 줄보다 먼저 「통화 중」으로 판정되므로 영향 없음.
- 보는 사람을 모를 때(`viewerRole = null`)는 지금처럼 저장된 공유 문구(「취소」) — 채팅 목록은 항상 보는 사람을 넘기므로 실제로는 해당 없음.
- 주석의 「양쪽 동일」을 이번 지시로 고치고, `call-log-display-type.ts` 주석(A2)과 맞춘다.

### D2. 말풍선 색 — 글자 대신 판정 결과로
- `MessengerTimelineBubbleInners` 의 부재중·취소 색 판정을 `/부재중/`·`callStatus` 대신 D1 판정 결과(`isMissed`·canonical)로. 한국어·영어 같은 색.

### D3. 서버 부재중 알림 — 발신자 취소도 수신자에게
- `decideRoomBoundMissedCallNotification`: `status = cancelled` + `ended_reason = canceled|cancelled`(발신자 취소)도 알림 대상. 통화 중(`peer_busy`·`caller_busy`·`callee_busy`)·`answered_elsewhere`·`redial_replaced`·`incoming_policy_superseded`·거절은 지금처럼 제외.
- `notifyRoomBoundMissedCallBestEffort` 첫 줄의 `status !== "missed"` 를 같은 판정 함수로 바꾼다.
- 알림 1건/세션(기존 `dedupeKey` = 세션·수신자) — 중복 없음.
- 알림이 생기면 기존 경로가 그대로 처리: 푸시(`missed_call`) → Android `MissedCallNotificationHelper`(현재 바이너리), 앱 안 배너, 방 부재중 배지(A8).
- 발신자에게는 알림 없음(지금과 같음).

### D4. Android·iOS 네이티브
- **변경 없음.** 서버 `missed_call` 푸시는 지금 설치된 앱(1.2.6 (50))이 이미 받아 부재중 알림을 띄운다(A6 `sent` 62건과 같은 경로). 재빌드 불필요.

### D5. 지난 기록
- 지난 115건은 다시 만들지 않는다(지난 데이터 소급 없음 — Owner 규정). 단 D1 은 화면 계산이라 **지난 기록도 수신자 화면에서 「부재중」으로 바뀌어 보인다**(저장값 무변경). 부재중 알림·배지는 앞으로 생기는 취소부터.

## 5. 바뀌는 파일 (웹·서버만)
| 파일 | 변경 |
|---|---|
| `lib/community-messenger/call-event-presentation.ts` | D1 판정·주석 |
| `lib/community-messenger/call-history/call-log-display-type.ts` | 주석 정리(A2) |
| `components/community-messenger/room/phase2/MessengerTimelineBubbleInners.tsx` | D2 색 판정 |
| `lib/community-messenger/call-authority/call-missed-notification-authority.ts` | D3 판정 |
| `lib/community-messenger/service.ts` (`notifyRoomBoundMissedCallBestEffort`) | D3 호출 조건 |
| 시험 | 기존 「양쪽 동일」 고정 시험 갱신: `call-stub-room-tip.test.ts`·`call-record-copy-language.test.ts`(+ `fixtures/call-record-copy-ko-snapshot.json`)·`call-timeline-recency-contract.test.ts`·`call-chat-projection-authority.test.ts`·`b5-call-fallback-removal.test.ts`·`call-stub-room-tip-row-models.test.ts` 중 해당 줄. 신규: 역할별 문구(발신 취소/수신 부재중), 부재중 알림 판정(취소 포함·통화 중 제외) |

## 6. 영향·위험·롤백 (통화 규정 3번)
| 경로 | 영향 |
|---|---|
| 발신·수신·연결·종료·벨·PiP·통화 화면 | 없음(세션 상태·종료 사유 저장값 무변경) |
| 채팅방 기록·목록 미리보기·통화 기록 | 수신자에게 발신자 취소가 「부재중」 |
| 수신자 알림 | 발신자 취소마다 부재중 알림 1건(푸시·배너·방 배지) |
| 네이티브 구 바이너리 | 영향 없음(기존 `missed_call` 처리 경로) |

| 위험 | 방지 |
|---|---|
| 벨이 울리기 전 아주 빠른 취소도 부재중 알림 | 14일 115건 중 1건(울림 기록 없음). 텔레그램도 응답 전 취소는 모두 부재중 처리 → 그대로 둠 |
| 같은 세션 부재중 알림 중복(시간 초과 + 취소 경합) | 세션당 1건 `dedupeKey`, 종료 상태는 하나뿐 |
| 수신자가 앱을 보고 있을 때 | 기존과 같이 시스템 알림 대신 앱 안 배너(`appVisible` 분기) |

롤백: PR 되돌림(웹 배포만, 앱 재설치 불필요).

## 7. 검증 (구현 후)
| # | 항목 | 방법 |
|---|---|---|
| 1 | 발신자 취소 → 수신자 채팅방·목록·통화 기록 「부재중」, 발신자 「취소」 | Xiaomi 발신 → Samsung 울림 중 Xiaomi 취소 → 양쪽 화면 캡처 + 운영 DB(`call_sessions`·`notification_events`) |
| 2 | 수신자 부재중 알림 1건(앱 꺼짐 상태 시스템 알림·앱 안 배너) | Samsung 앱 백그라운드에서 같은 시험 + `notification_deliveries` |
| 3 | 받지 않음 → 지금처럼 양쪽 부재중·알림 1건 | 시간 초과 시험 |
| 4 | 통화 중(busy)·거절 → 변화 없음 | 각 1회 |
| 5 | 영어 화면 말풍선 색 | 기기 언어 영어로 1회 |

## 8. NOT_PROVEN (설계 단계)
- 실제 기기 화면에서 수신자에게 「취소」로 보이는 것(코드·DB 로 확인, 화면 캡처 없음).
- iPhone 표시·iOS 부재중 푸시 처리.
- 보고만: `call-log-display-type.ts` 주석의 「미응답: 발신자 `unanswered`(응답 없음)」도 코드(양쪽 부재중)와 다르다 — 이번 지시 범위 밖(발신자 시간 초과 문구)이라 바꾸지 않음.
