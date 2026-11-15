# 통화 중 두 번째 통화 — 대기 통화 「거절 / 종료 후 받기」 설계안 (2단계, 2026-11-15 PHT)

> 상태: **설계안 (구현 전 · 통화 변경 규정 3번 Owner 승인 대기).** 1단계(PR #319, 통화 중이던 사람에게 부재중)는 운영 반영·실기 PASS(Android).
> 기준: `origin/main` `e5a76f86f` · 운영 DB 읽기 전용.
> 분류: **서버 + 운영 DB 마이그레이션 + Android·iOS 네이티브** — 단계별 반영(§9). 운영 DB 적용은 별도 승인 항목.

## 0. Owner 지시 (원문)
- 「다른 곳은 통화중시,,,에서 통화가 추가로 연결 해서 끊기 나 받기를 하면, 기존 통화가 대기등 끊기는 부분인데.. 디바이에는 연결이 안되는 부분을 확인 하고자 하는 부분이다.」
- 「2단계 대기 통화 설계안 작성」

## 1. 기준 (레거시·플랫폼 원문)
| 출처 | 동작 | 근거 |
|---|---|---|
| **WhatsApp 공식 도움말 「How to use call waiting」**(Android·iOS) | 통화 중 다른 WhatsApp 통화가 오면 **기존 통화는 끊기지 않고** 알림이 뜬다. **「Answer」(종료 후 받기) = 기존 통화 종료 + 새 통화 받기 / 「Decline」 = 새 통화 거절, 기존 통화 유지.** 보류(hold) 언급 없음 | faq.whatsapp.com/518449998779266 |
| Telegram Android | 대기 통화 **없음** — 통화 중 새 요청은 기기가 자동 거절(Busy) | `MessagesController.java:20585~20597` |
| Signal Android | 대기 통화 **없음** — 통화 중 새 요청은 부재중 기록 후 종료 | `ActiveCallActionProcessorDelegate.java:140~170` |
| Apple CallKit | 두 번째 통화를 보고하면 시스템이 대기 화면을 띄운다. 「종료 및 수락」을 누르면 **진행 중 통화의 `CXEndCallAction` → 새 통화의 `CXAnswerCallAction`** 이 한 묶음으로 온다(DTS 답변). 같은 앱의 두 번째 CallKit 통화는 **대기음이 안 날 수 있어 앱이 직접 내도 된다**(DTS). `maximumCallGroups` 기본 2, 보류는 `CXCallUpdate.supportsHolding` | developer.apple.com/forums/thread/775874 · /thread/71641 · CallKit 문서 |
| DIBAY 1단계(현재) | 통화 중이면 연결 안 됨 + 통화 중이던 사람에게 부재중 | PR #319 |

→ **기준 = WhatsApp 형태: 「거절」「종료 후 받기」 2개, 보류 없음.** 보류(hold)·합치기는 넣지 않는다(기준 앱에 없음, 엔진 1개 구조와도 맞지 않음 §2-4).

## 2. 지금 막는 곳 (전수 · 코드 판정)

### 2-1. 서버
| # | 위치 | 동작 |
|---|---|---|
| S1 | `lib/community-messenger/service.ts` 발신 판정(20760~20800) | B 가 다른 1:1 `ringing`/`active` → `peer_busy`(세션을 울리지 않음) |
| S2 | 같은 파일 `filterDirectIncomingRowsForPolicy`(1355~) + `getViewerIncomingBlockingLiveSessionId`(1072~) | B 의 수신 목록 조회 때 B 가 live 면 다른 `ringing` 을 `missed`+`incoming_policy_superseded` 로 즉시 정리 |
| S3 | 수신 푸시 `lib/community-messenger/incoming-call-voip-dispatch.ts` | 통화 중 판정 **없음**(S1 이 유일한 관문) — 바꿀 것 없음 |
| S4 | 수락 `updateCommunityMessengerCallSession`(21256~, accept 22119~) | 다른 live 통화 확인 **없음** → 「종료 후 받기」를 서버가 원자적으로 처리하는 경로 없음 |

### 2-2. 운영 DB 제약
`supabase/migrations/20260917140000_caller_live_call_unique.sql`
- `one_live_per_initiator (initiator_user_id) WHERE direct AND status IN (ringing, active)`
- `one_live_per_recipient (recipient_user_id) WHERE direct AND status IN (ringing, active)`
- (`20260611160000`) `one_live_per_room (room_id) WHERE status IN (ringing, active)` — 다른 방이라 대기 통화와 무관
→ B 가 지금 통화의 **수신자**였으면 새 `ringing`(B=수신자) insert 가 `one_live_per_recipient` 에 막힌다. B 가 **발신자**였으면 막히지 않는다(역할마다 따로 셈) — 제약이 「사람 단위」가 아니다.

### 2-3. Android (`android/app/src/main/java/com/dibay/app/`)
| 위치 | 동작 |
|---|---|
| `nativevoice/NativeVoiceCallRuntime.java` 수신 처리(139~162) · `nativevideo/NativeVideoCallRuntime.java`(116~132) | 다른 통화가 있으면 수신 화면을 띄우지 않음(`busy_suppressed`), 거절도 안 보냄 |
| `nativecall/NativeCallEngineOwnership.java` `prepareJoin` | Agora 엔진 점유 중이면 `BUSY` — 엔진 1개 |
| Telecom `ConnectionService` | **사용 안 함**(검색 0건) → 시스템 대기 화면 없음, 앱이 직접 그려야 함 |

### 2-4. iOS (`ios/App/App/`)
| 위치 | 동작 |
|---|---|
| `Push/CallKitProvider.swift:116~130` | live 통화가 있으면 새 수신을 `device_busy_live_call` 로 **무음 보고 후 즉시 종료** |
| 같은 파일 44 | `maximumCallsPerCallGroup = 1`, `supportsHolding`·`CXSetHeldCallAction` 없음 |
| `Call/NativeVoiceCallAgoraEngine` · `Call/Video/NativeVideoCallAgoraEngine` | 각 엔진 1개 점유 |

### 2-5. 데스크톱 웹
CallV4 경로(`components/community-messenger/call-v4/**`). 통화 중 수신 표시는 없음(S1 이 막음).

## 3. 운영 실측 (읽기 전용)
| 항목 | 값 |
|---|---|
| 최근 30일 `peer_busy` | 27건 — 그중 **25건은 B 가 이미 연결된 통화 중**(대기 통화가 생기면 「거절 / 종료 후 받기」가 뜰 대상) |
| 최근 14일 활성 앱 사용자(푸시 기기) | 29명 · 기기 2대 이상 2명 · 서로 다른 플랫폼 0명 |
| 활성 설치 버전 | Android 1.2.5(37)~1.2.7(54) · iOS 1.2(21)~1.2.2(35) — 모두 대기 통화 코드 없음 |

## 4. 제품 계약 (설계로 고정)
| # | 상황 | B(통화 중) | A(새로 거는 사람) | C(B 와 통화 중인 상대) |
|---|---|---|---|---|
| K1 | A 가 B 에게 건다, B 는 **연결된** 통화 중, B 의 모든 기기가 대기 지원 | 진행 중 통화 유지 + **대기 알림**(이름·음성/영상 + 「거절」「종료 후 받기」) + 짧은 대기음(벨 아님) | 평소처럼 발신음 | 변화 없음 |
| K2 | B 가 「거절」 | 대기 알림 닫힘, 진행 중 통화 유지 | 「거절」(기존 거절과 같음) | 변화 없음 |
| K3 | B 가 「종료 후 받기」 | 진행 중 통화 종료 → 새 통화 연결 | 연결 | 「통화 종료」(평소 종료와 같은 기록) |
| K4 | B 가 응답 없음(30초) | 대기 알림 닫힘 + **부재중**(1단계와 같은 알림·기록) | 「응답 없음」(기존 무응답) | 변화 없음 |
| K5 | A 가 울리는 중 취소 | 대기 알림 닫힘 + 부재중(11-13 규칙) | 「취소」 | 변화 없음 |
| K6 | 대기 중 B 의 기존 통화가 먼저 끝남(C 종료 등) | 대기 알림 → **일반 수신 화면으로 전환**(남은 시간만 울림) | 계속 발신음 | 종료 |
| K7 | B 가 연결 전 상태(울리는 중·거는 중) / B 의 기기 중 하나라도 대기 미지원 / 이미 대기 통화가 1건 있음 / 그룹 통화 | **1단계 그대로**(`peer_busy` + 부재중) | 「통화 중」 | — |
| K8 | A 본인이 통화 중 | 지금처럼(앱이 진행 중 통화로 돌려보냄 / 서버 `caller_busy`) | — | — |
- 대기 통화는 **동시에 1건만**. 보류·합치기 없음.
- 데스크톱 웹: 이번 단계 **제외** — B 의 진행 중 통화가 웹에서 연결된 것이면 K7(1단계). 범위 고정.

## 5. 설계

### 5-1. 서버 (웹·서버 반영)
| # | 변경 | 위치 |
|---|---|---|
| WS1 | 발신 판정: B 의 live 가 **`active`(answered_at 있음)** 이고 K7 예외가 아니면 `peer_busy` 대신 새 세션을 `ringing` 으로 만들고 수신 푸시 발송. 세션에 `waiting=true`(아래 DB1) 기록 | `service.ts` 20760~20800 |
| WS2 | 대기 지원 판정 `userSupportsCallWaiting(userId)`: 최근 활성 푸시 기기(`user_devices` fcm/voip_apns) **전부**가 플랫폼별 최소 빌드 이상. B 가 진행 중 통화의 수신자였으면 응답 기기(`answered_device_id`)도 그 기기들 중 하나여야 함(웹에서 받은 통화 제외). B 가 발신자였을 때 발신 기기는 서버에 저장되지 않음 → 기기 전부 조건만 적용(웹 발신 통화 구별 불가 — §10) | 신규 `lib/community-messenger/call-waiting-capability.ts` |
| WS3 | 수신 목록 정리(S2): B 의 live 가 `active` 이고 다른 `ringing` 이 `waiting=true` 면 **정리하지 않고** 목록에 함께 돌려줌(대기 표시용). 그 밖은 지금처럼 | `filterDirectIncomingRowsForPolicy` · `getViewerIncomingBlockingLiveSessionId` |
| WS4 | 「종료 후 받기」 원자 처리: accept 요청에 `endOtherLive: true` → 서버가 같은 요청 안에서 ① B 의 다른 `active` 통화를 평소 종료(`end`, 종료 사유 = B 가 끊은 것과 같은 기존 값)로 닫고 ② 새 통화를 accept. ①이 실패하면 ②를 하지 않음 | `updateCommunityMessengerCallSession` accept 분기 |
| WS5 | accept 안전장치: `endOtherLive` 없이 다른 `active` 가 남아 있으면 accept 거절(`other_call_active`) — 두 통화가 동시에 active 되지 않게 | 같은 곳 |
| WS6 | 기록·알림: 거절·무응답·취소·부재중은 **기존 종료 사유 그대로**(새 문구 없음). `waiting` 은 표시 분기용으로만 | — |

### 5-2. 운영 DB (마이그레이션 · 별도 승인)
| # | 변경 |
|---|---|
| DB1 | `community_messenger_call_sessions.waiting boolean not null default false` (대기 통화로 울린 세션 표시) |
| DB2 | `one_live_per_recipient` → 두 개로 분리: `one_ringing_per_recipient (recipient_user_id) WHERE direct AND status='ringing'` + `one_active_per_recipient (recipient_user_id) WHERE direct AND status='active'` |
| DB3 | 사람 단위 동시 active 1건은 인덱스로 못 묶음(발신자·수신자 두 열) → WS5 서버 검사로 보장 + 감시 쿼리(운영 점검용) |
- 롤백: 인덱스를 원래대로 되돌리기 전에 `waiting=true` 인 live 행이 0건인지 확인(서버 WS1 을 먼저 끈다).

### 5-3. Android (네이티브 · 빌드 필요)
| # | 변경 | 위치 |
|---|---|---|
| WA1 | 수신 FCM 이 `waiting=true` 이고 진행 중 통화가 **연결됨**이면 `busy_suppressed` 대신 **대기 알림**: 높은 중요도 알림(카테고리 call) + 버튼 「거절」「종료 후 받기」, 진행 중 통화 화면 위에 작은 카드. 벨 대신 짧은 대기음(통화 스트림, 2회) | `NativeVoice/VideoCallRuntime` 수신 처리 · 신규 `nativecall/CallWaitingPresenter.java` |
| WA2 | 「거절」 → 기존 `reject` API(새 통화만) | 같은 곳 |
| WA3 | 「종료 후 받기」 → 서버 `accept(endOtherLive)` 성공 후 ① 기존 통화 로컬 정리(Agora `leave`, 화면 닫기) ② 엔진이 비면(`NativeCallEngineOwnership.prepareJoin` = PROCEED) 새 통화 참가·화면 표시. 순서 고정 | `NativeCallEngineOwnership` 은 그대로, 호출 순서만 |
| WA4 | 대기 중 기존 통화 종료(K6) → 대기 알림을 일반 수신 화면으로 전환 | 정리 경로에서 대기 세션 확인 |
| WA5 | 대기 통화 종료(무응답·취소·거절) 신호 → 대기 알림만 닫음, 진행 중 통화 무변화 | 종료 FCM 처리 |

### 5-4. iOS (네이티브 · 빌드 필요)
| # | 변경 | 위치 |
|---|---|---|
| WI1 | 수신 VoIP 가 `waiting=true` 이고 진행 중 통화가 연결됨이면 `device_busy_live_call` 대신 **정상 보고**(`supportsHolding=false`) → CallKit 시스템 대기 화면(「종료 및 수락」「거절」) | `Push/CallKitProvider.swift:116~130` |
| WI2 | 「종료 및 수락」: 진행 중 통화 `CXEndCallAction` 과 새 통화 `CXAnswerCallAction` 이 한 묶음 → 서버 `accept(endOtherLive)` 1회로 처리하고 기존 통화 종료 요청은 서버로 따로 보내지 않음(중복 방지). 엔진 정리 → 새 통화 참가 순서 | `CXEndCallAction`·`CXAnswerCallAction` 처리(794·754) · 음성·영상 코디네이터 |
| WI3 | 「거절」(새 통화 `CXEndCallAction`, 진행 중 통화는 유지) → `reject` API | 같은 곳 |
| WI4 | 대기음: 같은 앱 두 번째 통화는 시스템 대기음이 안 날 수 있음 → 앱이 짧은 대기음 재생(진행 중 통화 오디오 세션 안에서) | 신규 작은 재생기 |
| WI5 | 맥(CallKit 없음, 빌드 37~): 대기 지원 **제외**(WS2 최소 빌드 판정에서 맥 기기는 미지원) | `DibayCallPlatformCapability` |

### 5-5. 구 바이너리 호환
- WS2 가 **B 의 모든 활성 푸시 기기**가 최소 빌드 이상일 때만 대기 통화를 만든다 → 구 빌드가 하나라도 있으면 1단계 그대로(구 빌드는 `busy_suppressed`·무음 종료로 대기 통화를 숨겨, 상대가 30초 울리고 부재중이 되는 나쁜 경험을 막음).
- 최소 빌드 값은 새 Android·iOS 빌드 번호가 정해질 때 상수로 넣는다(그 전에는 서버 기능이 사실상 꺼진 상태).

## 6. 영향 경로 (통화 규정 3번)
| 경로 | 영향 |
|---|---|
| 일반 발신·수신·연결·종료 | 없음(대기 조건일 때만 분기) |
| 발신 판정 | 연결 중인 B + 지원 기기 → 울림, 나머지는 1단계 그대로 |
| VoIP/FCM 발송 | 대기 통화도 같은 발송(페이로드에 `waiting` 추가) |
| iOS CallKit | 대기 조건에서만 정상 보고로 바뀜 · 「종료 및 수락」 묶음 처리 신규 |
| Android 수신 화면 | 대기 조건에서 알림 카드(전체 화면 아님) |
| 취소·거절·무응답·부재중 | 기존 사유·알림 그대로 |
| 통화 기록·채팅방 기록 | 기존 그대로(새 문구 없음) |
| 상태 조회·종료 감시 | 대기 세션도 같은 방식 |
| 1단계(부재중) | K7 조건에서 그대로 유지 |

## 7. 위험
| 위험 | 방지 |
|---|---|
| 「종료 후 받기」 중 엔진 넘김 실패 → 두 통화 모두 끊김 | 서버 원자 처리(WS4) 후 로컬 순서 고정, 새 통화 참가 실패는 기존 실패 처리(`fail`)·안내 |
| iOS 「종료 및 수락」 묶음을 두 번 처리(기존 통화 end + accept 따로) | WI2: 묶음 감지 시 서버 요청 1회 |
| 같은 사람 두 통화 동시 active | WS5 + DB3 감시 |
| 대기음이 진행 중 통화 소리에 섞여 너무 큼 | 짧은 2회·낮은 음량(실기에서 확인) |
| 구 빌드 기기를 가진 사용자 | WS2 로 1단계 유지 |
| DB 인덱스 변경 중 경합 | 서버 WS1 을 끈 상태에서 마이그레이션 → 서버 반영 순서(§9) |

## 8. 실기 검증 행렬 (통화 규정 5번 + 대기 통화 · Production SHA·빌드 번호·서버 시각 DB 대조)
| # | 상황 | 기대 |
|---|---|---|
| CW1 | B(Android) 음성 통화 중 ← A 음성 | B 대기 알림+대기음, C 통화 유지, A 발신음 |
| CW2 | CW1 에서 「거절」 | B 통화 유지, A 「거절」 |
| CW3 | CW1 에서 「종료 후 받기」 | C 「통화 종료」, A↔B 연결, 소리 정상 |
| CW4 | CW1 에서 무응답 30초 | B 부재중 1건, A 「응답 없음」 |
| CW5 | CW1 에서 A 취소 | B 대기 닫힘·부재중, 통화 유지 |
| CW6 | 대기 중 C 가 먼저 끊음 | B 일반 수신 화면으로 전환 |
| CW7~12 | CW1~6 을 B = iPhone 으로(CallKit 대기 화면) | 같음 |
| CW13 | 영상 통화 조합(영상 중 음성 대기, 음성 중 영상 대기) | 같음 + 카메라 전환 정상 |
| CW14 | B 에 구 빌드 기기 1대 섞임 | 1단계(통화 중 + 부재중) |
| CW15 | B 가 울리는 중·거는 중 | 1단계 |
| CW16 | 이미 대기 1건 중 세 번째 발신 | 1단계 |
| CW17 | 맥(김봉기 기기)이 B | 1단계 |
| CW18 | 기본 행렬 무회귀 | 발신·수신·거절·벨 중 취소·지연 푸시·무응답·통화 중·종료 후 즉시 재발신 |

## 9. 반영 순서 (통화 단독 · 단계마다 실기 PASS 후 다음)
1. **Android·iOS 네이티브**(WA1~5·WI1~5) — 서버가 `waiting` 을 보내기 전이라 동작 변화 없음. 빌드는 Owner 일괄 빌드 때.
2. **운영 DB 마이그레이션**(DB1~3) — Owner 별도 승인 후 적용, 적용 결과 보고.
3. **서버**(WS1~6) — 최소 빌드 상수를 새 빌드 번호로 설정 → 그 빌드를 설치한 사용자끼리만 대기 통화 동작.
4. 실기 CW1~18.

## 10. 범위 밖 (보고만)
- 일반 전화(이동통신) 통화 중 DIBAY 수신 처리 — WhatsApp 은 같은 두 선택을 준다. 이번 설계 제외.
- 데스크톱 웹 대기 통화.
- 그룹 통화 중 1:1 대기.

## 11. 구현 메모 — 1단계(네이티브) (2026-11-15, Owner 「네이티브부터 승인」)
**설계와 다르게 구현한 것 (보고):**
- WS4(서버가 accept 요청 안에서 기존 통화 종료) 대신, 두 플랫폼 모두 **기존 통화를 평소 종료 경로(서버 end 포함)로 끝냄 → 그 통화 정리 완료 신호 → 새 통화를 일반 수신으로 등록하고 accept** 순서로 구현했다.
  - 이유: iOS CallKit 「종료 및 수락」이 원래 `CXEndCallAction`(기존) → `CXAnswerCallAction`(새) 순서로 오고, 기존 종료 경로가 이미 서버 end·엔진 leave·오디오 세션 정리를 한다. 엔진이 1개라(Android `NativeCallEngineOwnership`, iOS `NativeCallAgoraLaneGuard`) 기존 통화가 엔진을 놓기 전에 새 통화가 참가하면 실패하고 그 실패 처리가 **새 통화를 서버에서 끝낸다**. 정리 완료를 기다리는 방식이 이 두 문제를 함께 막는다.
  - 결과: 서버 3단계에서 WS4 는 필요 없다(WS5 「같은 사람 두 통화 동시 active 금지」는 유지).
- 대기 통화는 두 플랫폼 모두 런타임(통화 상태 목록)에 넣지 않고 별도 보관 — Android `nativecall/NativeCallWaitingPresenter`, iOS `Call/NativeCallWaitingCoordinator`.

**동작 조건:** 수신 데이터 `waiting=true`(서버 3단계 전에는 항상 false) + 이 기기의 다른 통화가 **연결됨** + 대기 1건 없음(+ iOS 는 맥 제외). 아니면 기존 처리(Android `busy_suppressed`, iOS `device_busy_live_call`) 그대로.

**검증(코드):** Android `compileDebugJavaWithJavac` + 단위 시험(통화 정리·무응답·채널·대기 표시) PASS · iOS 시뮬레이터 `xcodebuild` BUILD SUCCEEDED · TS 계약 시험 713파일 4,663건 + 대기 통화 계약 8건 PASS · `verify:call-authority-contract`·native voice/video runtime·iOS caller identity 검사 PASS.
**실기:** NOT_PROVEN — 서버(3단계)가 `waiting=true` 를 보내야 동작하므로 서버 반영 뒤 CW1~CW18.

## 12. 구현 메모 — DB·서버 단계 (2026-11-15)
- DB: `waiting` 열만 운영 적용(15:55 PHT, `20261115075522`). DB2 는 운영에 해당 제약이 없어 불필요 — `docs/audit/call-waiting-db-stage-plan-2026-11-15.md` §0 (설계 오류 정정).
- 서버 WS1·WS2: `lib/community-messenger/call-waiting-capability.ts`(순수 판정) + `service.ts` `resolvePeerCallWaitingGate`. 기기 조건을 「활성 기기 정확히 1대」로 좁힘 — 2대 이상이면 통화 중이 아닌 기기가 평범한 수신처럼 울리므로(맥 포함) 1단계.
- 최소 빌드 `CALL_WAITING_MIN_BUILD` = Android 55 · iOS 41(대기 통화 네이티브가 들어간 첫 설치 빌드). 실제 빌드 번호가 다르면 빌드 때 맞춘다.
- WS3: 대기 통화는 수신 목록 정리에서 닫지 않고 목록에도 넣지 않음. WS4 불필요(§11). WS5: `other_call_active`.
