# 발신 후 수신 전 취소 → 수신자 「부재중」 — 감사·설계안 (2026-11-13 PHT)

> 상태: **구현(Owner 「구현 승인」 2026-11-13) — 브랜치 `fix/call-cancel-callee-missed`, 웹·서버만(앱 재빌드 없음).** 통화 단독 PR.
> 구현 메모: D2 는 말풍선에 `callStatusTone`(문구와 같은 판정)을 넘겨 글자 비교를 대신함. 한국어 문구 스냅샷 4,032개 중 바뀐 48개 = 발신자 취소 × 보는 사람이 발신자 아님(수신자 36 · 대화 참여자가 아닌 X 12 — 기존 「보낸 사람이 아니면 수신자」 규칙), 발신자 문구 변화 0.
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

## 9. 실기 결과 (#220 반영 후) — FAIL · 원인 · 보완 설계 D6
조건: Production `85c3e070e`(#220 병합) · Samsung RFCY40PY2CA 1.2.6 (50) · 로그인 수신자 계정 · 앱 앞 화면 · 2026-11-13 04:58 PHT · 세션 `9c97f6c1` (음성, Xiaomi 발신 → Samsung 울림 4초 → 발신자 취소)

| 항목 | 결과 | 증거 |
|---|---|---|
| 수신자 화면 「부재중」 | PASS (Owner 확인) | — |
| 서버 부재중 알림 행 | PASS | `notification_events` missed_call 04:58:22.69 |
| 서버 푸시 발송 | PASS | `notification_deliveries` missed_call `sent` 04:58:22.93 |
| 기기 푸시 수신 | PASS | logcat 04:58:23.103 `data_type_detected type=missed_call` |
| 시스템 알림(알림창) | 표시 안 함 — 앱 앞 화면이라 설계상 생략 | `foreground_skip_system_notification type=missed_call` (`DibayFirebaseMessagingService.java:309`) — 시간 초과 부재중과 같은 규칙 |
| 앱 안 부재중 배너 | **FAIL** | 알림음(`call_missed`)만 04:58:23.05, 배너 없음 |

**원인 (작업자 누락 — 「모든 진입점」 확인 실패):** 수신자에게 부재중으로 바꿔야 할 진입점 중 3곳이 아직 `status === "missed"` 로만 판정.
| # | 진입점 | 현재 | 결과 |
|---|---|---|---|
| E1 | `lib/community-messenger/service.ts` 통화 기록 메시지 `incrementUnread: input.status === "missed"` (C-N1) | 취소는 수신자 대화방 안 읽은 수를 올리지 않음 | 앱 안 배너는 「안 읽은 수 증가」로만 시작(`cm-participant-unread-full-effects.ts`) → 배너 시작 안 됨 · 대화방 안 읽은 표시 없음 |
| E2 | `lib/community-messenger/notifications/messenger-in-app-banner-content.ts:109` `if (message.callStatus !== "missed") return null` | 취소 통화 기록은 배너 내용 없음 | 배너 없음 |
| E3 | `components/community-messenger/MessengerChatListItem.tsx:571` `isMissedCallPreview = callStatus === "missed"` | 목록 글자는 「부재중 …」인데 빨간색 아님 | 부재중 강조 없음 |
| E4 | `lib/community-messenger/realtime/call-stub-receive-sound-policy.ts` 실시간 수신음 = `callStatus === "missed"` 만 | 취소는 수신음 규칙상 무음(부재중 알림음은 알림 경로로 이미 울림) | 시간 초과 부재중과 소리 경로가 다름 |

### D6. 보완 — 「발신자 취소」를 수신자 쪽에서 시간 초과 부재중과 같게
판정 함수 1개 `isCalleeMissedCallStub({ callStatus, endedReason/resolvedEvent, viewer 가 수신자인가 })` = 부재중 또는 (발신자 취소 && 보는 사람 ≠ 발신자). 위 4곳이 모두 이 함수만 쓴다.
- E1 서버: 발신자 취소(`cancelled` + `canceled`) 통화 기록도 안 읽은 수 증가 — 통화 기록 보낸 사람이 발신자라 증가 대상은 수신자뿐(C-N1 의 「받은·거절 통화는 올리지 않음」 유지, 통화 중·재발신 등 다른 취소는 제외).
- E2 배너: 수신자에게는 발신자 취소도 부재중 배너(제목 「부재중 전화」).
- E3 목록: 같은 판정으로 빨간 글자.
- E4 수신음: 시간 초과 부재중과 같은 규칙(수신자만).
- 시스템 알림: 앱 앞 화면 생략은 시간 초과 부재중과 같은 기존 규칙 그대로(바꾸지 않음).
- 시험: 진입점 4곳 계약 시험(발신자 취소·수신자 → 부재중 처리 / 발신자 → 아님 / 통화 중 취소 → 아님) 추가.

### D6 구현 메모 (Owner 「D6 구현 승인」 2026-11-13)
- 단일 판정 `lib/community-messenger/call-callee-missed.ts` — E1 서버 안 읽은 수(`callStubIncrementsCalleeUnread`, 통화 기록 보낸 사람 = 발신자일 때만), E2 앱 안 배너·E4 실시간 수신음(`isMissedCallStubForViewer`).
- **E3 은 이번에 바꾸지 않음 (충돌 보고):** 목록 행 `callStatus` 가 만들 때 항상 `null`(`use-community-messenger-home-state.ts` 428줄) → 시간 초과 부재중도 원래 빨간색이 아님. 발신자 취소와 무관한 기존 결함이라 「범위 밖 = 보고만」. 수신자 기준으로 발신자 취소와 시간 초과는 지금도 같은 모습(둘 다 기본색).

## 10. D6 반영 후 Owner 실기 (2026-11-13 05:29 PHT) — FAIL · 확인된 사실 / 확인 못 한 것
조건: Production `fec8f2f61` · 수신자 Samsung RFCY40PY2CA 1.2.6 (50)(q테스트1) · 발신자 Xiaomi(zxzx11, Owner 조작) · 세션 `51a1b856` · 수신 05:29:15.63 → 발신자 취소 05:29:20.34 · 수신자 앱 프로세스 앞(통화 수신 화면이 DIBAY 메인 위를 덮은 상태)

**확인된 사실 (기기 로그·DB 원문)**
| # | 사실 | 증거 |
|---|---|---|
| F1 | 수신자 안 읽은 수 0→1 (D6 E1 동작) | `cm_participant_sound.decision prevUnread 0 → nextUnread 1` 05:29:20.405 |
| F2 | **앱 안 배너 띄우기 결정 안 됨** | `participant_increase … banner_ms: null` 05:29:20.428 (wantBanner 가 false 일 때만 null) |
| F3 | 부재중 푸시 수신, **시스템 알림 생략** | `data_type_detected type=missed_call` · `foreground_skip_system_notification type=missed_call` 05:29:21.252 |
| F4 | 알림음만 재생 | `routeNotificationInsertSound type=missed_call` · `playOneShot.play` |
| F5 | 배너 결정(05:29:20.405)은 통화 수신 화면이 닫히고 DIBAY 메인 창이 다시 보이게 되는 도중 | `NativeVoiceCallActivity` 닫힘 05:29:20.353 → 메인 창 `visible = true` 05:29:20.378 → 웹 복귀 신호 `ui_set reason=app_resume` 05:29:20.430 |
| F6 | 결과: 수신자는 시스템 알림도 앱 안 배너도 받지 못함(소리만) | F2·F3·F4 |

**확인 못 한 것 (NOT_PROVEN — 추측으로 원인 단정하지 않음)**
- F2 에서 `wantBanner` 를 false 로 만든 조건이 무엇인지. 후보 4개(롤아웃 단계·`dedupeKey`·`showAppLevelBanner`(앱 보임 상태·같은 방·알림 끈 방)·채팅 알림 설정) 중 어느 것인지 기록이 없다. F5 의 시각 순서는 「결정 순간 웹 문서가 아직 숨김 상태였다」와 맞지만, 결정 순간의 보임 상태 값 자체는 로그에 없다.
- 같은 상황(수신 화면 위에서 **시간 초과** 부재중)에서도 같은 결과인지 — 기준선 실측 없음.
- 작업자 개입: 05:29 직전 작업자가 Samsung 을 2번 탭(뒤로·알림 아이콘)함. 그 탭이 수신 직전 화면 경로를 바꿨는지 확인 못 함 → 이 시험 결과는 작업자 조작이 섞인 결과.

### 설계안 (측정 먼저 — 가정으로 고치지 않음)
- M1 (진단 기록만, 동작 변화 0): 참가자 안 읽은 수 증가 판정 기록(`cm_participant_sound.decision`)에 `appVisibility`(결정 순간 보임 상태)·`activeRoom`·`showAppLevelBanner`·`wantBanner`·`communityChatEnabled`·`rolloutLevel` 을 추가. 배너 내용 단계에 `content`(있음/없음·사유) 기록. FCM `foreground_skip_system_notification` 에 앞 화면 판정 근거(`appVisible` 산출 값) 기록.
- M2 실측 (작업자 기기 조작 없이 Owner 조작): ① 수신 화면 위 발신자 취소 ② 수신 화면 위 시간 초과 ③ 채팅 목록을 보고 있을 때(수신 화면 없이 — 통화 중이 아닌 상대 메시지) — 각 1회, M1 기록으로 막힌 조건 확정.
- M3: 막힌 조건이 확정되면 그 조건별 수정안을 따로 보고 → 승인 후 1회 구현. (지금 수정안 미작성 — 원인 미확정)

## 11. 원인 확정 (실측 2026-11-13 05:38~05:41 PHT) — §10 의 NOT_PROVEN 해소
방법: 수신자 Xiaomi(8b37179f7d94, zxzx11, 1.2.6 (40), Production `fec8f2f61` 웹)에 WebView 디버거로 계측만 붙임(앱 코드 변경 0) — `visibilitychange`·10ms 간격 보임 상태·화면에 「부재중 전화」 글자 등장 기록. 발신자 Samsung(q테스트1)을 작업자가 조작. 수신자 화면: 채팅 목록(`/community-messenger`).

### 조건별 판정 (배너 = `wantBanner` 네 조건)
| 조건 | 판정 | 증거 |
|---|---|---|
| ① 배포 단계 | 배너 켬(2) | 운영 번들 `NEXT_PUBLIC_MESSENGER_NOTIFICATION_ROLLOUT` 미주입(`t.default.env…??""` → 2), 2 이상에서만 찍히는 `cm_participant_sound.decision` 기록 존재 |
| ② 채팅 알림 설정 | 켜짐 | 운영 DB `user_notification_settings.community_chat_enabled = true`(수신자) |
| ③ 방 알림 끔 | 아님 | 운영 DB `community_messenger_participants.is_muted = false`(수신자) |
| ③' 같은 방 | 아님 | 05:29 Samsung `pathname:"/notifications"`, 05:39 Xiaomi `/community-messenger` |
| ④ **앱 보임 상태** | **판정 순간 hidden → 배너 버림** | 아래 표 |

| 경우 | 수신 화면이 덮음(hidden) | 안 읽은 수 판정 | 보임 복귀(visible) | 배너 |
|---|---|---|---|---|
| 발신자 취소 (세션 `307b6e3f`) | 05:38:50.657 | **05:39:06.230** | 05:39:06.334 | `banner_ms: null` · 화면 글자 없음 → **없음** |
| 받지 않음 (시간 초과) | 05:40:12.772 | 05:40:42.795 | **05:40:41.978** | `banner_ms: 0` · 화면 글자 05:40:43.306 → **표시** |
| (05:29 Owner 시험, Samsung) | — | 05:29:20.405 | 05:29:20.43 전후 | `banner_ms: null` |

이어서 부재중 푸시: 05:39:07.120 / 05:40:43.328 / 05:29:21.252 모두 `foreground_skip_system_notification`(앱 프로세스 앞이라 시스템 알림 생략).

### 원인 (확정)
1. **「앱이 앞인가」 판정이 두 경로에서 다르다.** 기기 FCM(`DibayFirebaseMessagingService` `appVisible`)은 **앱 프로세스** 기준 — DIBAY 통화 화면만 떠 있어도 앞 → 시스템 알림 생략. 웹 배너(`resolveParticipantUnreadDeltaInAppEffects`)는 **WebView 문서 보임** 기준 — 통화 화면이 덮으면 뒤 → 배너 생략.
2. **배너 판정이 「안 읽은 수가 바뀌는 순간」 1회뿐이다.** 발신자 취소는 서버가 취소·통화 기록·안 읽은 수를 한 번에 처리해, 안 읽은 수 변경이 **통화 화면이 닫히는 도중(WebView hidden)** 에 도착 → 버려지고, 보임 복귀 후 다시 판정하지 않는다. 시간 초과는 기기가 먼저 통화 화면을 닫고(보임 복귀) 서버 부재중 처리가 뒤따라 순서가 반대라 배너가 뜬다.
3. 결과: 발신자 취소의 수신자는 「앱 앞 + 통화 화면 위」에서 시스템 알림·앱 안 배너 둘 다 받지 못하고 소리만.

### 별도 사실 (이번 결함과 무관 — 보고만)
- 앱 알림함(종)에는 대화방에 묶인 부재중 통화가 들어가지 않는다 — 설계상 제외(`member-notification-a-eligibility.ts` 74~75줄 「Gate 2 missed: room-bound → B only」). 시간 초과 부재중도 같음. 대화방 안 읽은 수·목록「부재중」으로만 알림.

### D7 설계 — 부재중 배너의 근거를 「부재중 알림 이벤트 1건」으로 단일화
| # | 바꾸는 곳 | 내용 |
|---|---|---|
| D7-1 | `components/notifications/NotificationsBadgeRealtimeBridge.tsx` `onInsertSound` (알림 행 실시간 수신 — 지금 부재중 알림음을 내는 같은 자리) | `type = missed_call` 이고 방에 묶인 알림이면 메신저 부재중 배너(`useMessengerInAppMessageBannerStore.pushOrMerge`, `kind:"missed_call"`, 제목·본문 = 알림 행 `title`·`body`, `dedupeKey = missed:<call_session_id>`)를 띄운다. 조건: 그 방을 보고 있지 않음 · 방 알림 끔 아님 · 채팅 알림 켜짐. |
| D7-2 | 같은 자리 | 알림 행 도착 순간 WebView 가 hidden 이면 버리지 않고 **그 통화의 배너 1건을 보류** → 다음 보임 복귀 때 표시(그 사이 그 방을 열었거나 안 읽은 수가 0 이 됐으면 버림). 보류는 「네이티브가 이 통화의 종료를 웹에 넘긴 경우(`terminal_received … source=webview_inject` 의 callId 와 알림 행 `call_session_id` 일치)」에만 — 앱이 정말 뒤에 있던 경우는 시스템 알림이 이미 떴으므로 보류하지 않는다. |
| D7-3 | `cm-participant-unread-full-effects.ts` / `messenger-in-app-banner-content.ts` | 안 읽은 수 증가 경로는 **통화 기록(call_stub) 부재중이면 배너를 만들지 않는다**(D7-1 과 중복 방지). 일반 메시지 배너는 그대로. |
| D7-4 | 기기(Android·iOS) | 변경 없음. |

근거: 알림 행(부재중 알림)은 세 시험 모두 보임 복귀 **뒤** 도착(취소 05:39:07.1·시간 초과 05:40:43.3·05:29:21) — 서버가 취소 응답 후 `after()` 로 만드는 순서. D7-2 가 순서가 뒤바뀐 경우까지 막는다.

영향: 시간 초과 부재중 배너도 D7-1 경로로 옮겨진다(문구 같음, 표시가 약 0.5초 늦어짐). 일반 메시지 배너·시스템 알림·알림함·소리·네이티브 무변경.

### 실기 검증 (구현 후 — 같은 계측)
1 발신자 취소(수신자 채팅 목록) → 배너 1건 · 2 시간 초과 → 배너 1건(중복 없음) · 3 수신자가 그 대화방 안 → 배너 없음 · 4 수신자 앱 뒤 → 시스템 알림만 · 5 일반 메시지 배너 그대로.
