# DIBAY 통화 복구 통합 계획 (2026-10-22 · Owner 승인 대기)

규정: `AGENTS.md` 「통화 변경 규정」. 이 문서 하나로 통화 복구를 끝까지 진행한다. **이 문서에 없는 통화 변경은 하지 않는다.** 새 결함이 나오면 코드를 바로 고치지 않고 이 문서에 증거·판정을 추가해 승인받은 뒤 진행한다.

## 0. 목표와 완료 기준
- 목표: 오늘(10-22) 웹·서버 통화 변경 이후의 통화를 **레거시 정상 동작 이상**으로 되돌리고, 확인된 결함만 고친다.
- 완료 = 아래 §5 행렬 전 항목 실기기 PASS + 각 callId 운영 DB 대조 일치. 그 전에는 완료 선언 금지.
- 기준 바이너리: Android `1.2.4 (11)` · iOS `1.2 (7)` (네이티브 변경 없음 — 재빌드 없음).

## 1. 레거시 정상 기준 (비교 기준선)
| 항목 | 정상 기준 | 근거 |
|---|---|---|
| Android→iPhone 링 | VoIP 발송 ≤ 0.7s | 10-20 운영 `74fb7b38`·`6fdb9198` VoIP 0.53~0.66s |
| iPhone→Android 링 | FCM 발송 ≤ 1s | 10-19~21 FCM 0.37~1.02s |
| 수락→연결 | ≤ 2s | 10-18~20 연결 이벤트 |
| 통화 중 알림 | CallKit/전체화면 수신 UI 만, 별도 「띵」·배너 없음 | Owner: 레거시 앱 현상 없음 (서버 기록상 iPhone 일반 알림은 7월부터 발송 — 레거시에서 안 보인 이유는 미확인) |
| 부재중 | 통화 종료 후 부재중 알림·기록 | Owner 정상 판정 |

## 2. 오늘 변경 전수 판정 (통화에 닿는 것만)
판정 원칙: **증거로 결함을 만든 변경 → 롤백 / 증거 없음 → 유지하되 §5 행렬에 명시 검증, FAIL 이 그 변경으로 추적되면 그 항목만 롤백.** 증거 없는 일괄 롤백도 검증 안 된 변경이므로 하지 않는다.

### 2-1. 05:49 배포 (`4144fe43`)
| ID | 변경 | 닿는 경로 | 증거 상태 | 판정 |
|---|---|---|---|---|
| C-10 | 발신 전 reconcile 비차단 | 발신 시작 | 10-22 발신 다수 세션 생성 정상(DB) | 유지 · M1 검증 |
| C-11 | cleanup 이 현재 통화 주인일 때만 전역 정리 | 종료·재발신 | 미검증 | 유지 · M9(종료 직후 재발신) |
| C-16 | 통화 화면 밖 종료 시 화면 이동 0 (R1) | 종료 | 미검증 | 유지 · M1·M4 |
| C-17·C-3 | 내 통화중=`self_busy` · 상대 통화중 기록(stub) | 발신 거부 | 미검증 | 유지 · M7 |
| C-4 | 부재중 마감 재예약(최대 2회) | 무응답 | `55aa6d0d`·`74516c3d` 31s 후 missed 정상(DB) | 유지 · M8 |
| C-7 | 끊기 신호 keepAlive · 부재중 벨종료 푸시 보류 | 종료 신호 | 거절·종료 신호 Samsung 도달(DB) | 유지 |
| T절 | 종료 사유별 공통 팝업(callId 범위·중복 방지) · unreachable 판정 | 종료 후 UI | `74516c3d` 「응답 없음」 표시(Cursor) | 유지 · M3·M4·M8 팝업 1회 확인 |
| F-7 | 수신 배너 차단 확인창 | 웹 수신 배너 | 미검증 | 유지 · 범위 외 기능 |
| 통화기록 | 목록 seed/merge | 통화 기록 | 미검증 | 유지 · M10 |

### 2-2. 06:57 배포 (`a3b298f2`)
| ID | 변경 | 닿는 경로 | 증거 상태 | 판정 |
|---|---|---|---|---|
| C-12 | 세션 조회 단일 poller(0.5s→1s) · 429 대기 | 발신자 수락·거절 감지, Android 네이티브 종료 동기화 | 거절 `2b6177be` 6.2s 종료 정상(DB) · 화면 반영 지연 미측정 | 유지 · M3·M4 에서 **상대 동작→Samsung 화면 반영 시간 측정**, >1.5s 면 이 항목 롤백 |
| C-14 | heartbeat 로 connected_at 보정 · connected 재시도 | 연결·통화 시간 | 연결 이벤트 정상(DB) | 유지 · M1 통화시간 기록 확인 |
| P-7 | 종료 후 뒤로 1회 복귀 | 종료 후 화면 | 미검증 | 유지 · M1 종료 후 뒤로가기 1회 |
| V-3 | 발신 상대명 = 프로필명 | 발신 화면·네이티브 peerName | 미검증 | 유지 · M1 표시명 |
| V-8 | 데스크톱 웹 품질 경고 | 데스크톱 웹만 | 앱 무관 | 유지 |

### 2-3. 07:48 배포 (`0ed7d78f`·`4044eb46`, 통화 복구)
| ID | 변경 | 증거 | 판정 |
|---|---|---|---|
| R-1 | 통화 푸시 VoIP·FCM 먼저 | 수정 후 9건 VoIP 0.34~0.42s (수정 전 1.3~14.5s·2건 미발송) | 유지 |
| R-2 | 시작 1.5s 뒤 수신 링은 세션 상태 재확인 | 정상 경로 영향 없음(조회 0) | 유지 |

## 3. 확인된 결함 (증거 있는 것만)
| # | 결함 | 증거 | 원인 | 상태 |
|---|---|---|---|---|
| D1 | Android→iPhone 링 지연·유실 | 07:01~07:04 VoIP 1.3~14.5s·미발송 2 | 같은 iPhone 의 일반 알림이 VoIP 앞에 순차 발송 | R-1 로 수정 · DB PASS · 실기기 M1 진행 중 |
| D2 | 통화 중·취소·거절·종료 때 iPhone 「띵」+배너 | M5 `2f941f70` Owner 확인 · `apns:call_canceled`@28.92s(sound default) | 서버가 VoIP 와 함께 iPhone 일반 알림(소리 포함)을 함께 발송 | **§4 수정 대상** |
| D3 | 통화 시작 때 「전화 왔다」 메시지 | Owner 보고 · `apns:incoming_call` 매 통화 | D2 와 동일 | §4 에 포함 |

미확인(증거 대기, 수정 금지): Android 수신 시 별도 통화 알림 잔존 여부 · 수신 벨소리 종류/겹침 · iPhone CallKit 이 VoIP 를 받았는데 표시 실패한 사례(현재 없음).

## 4. 수정 계획 — D2·D3 단 1건
- 파일·함수: `lib/push/dispatch/dispatch-push-for-user.ts` `dispatchPushForUser` 대상 루프만.
- 동작: 같은 디스패치에서 **같은 기기(`device_id`)로 `voip_apns` 가 `sent`** 이면 그 기기의 `apns` 일반 알림을 `skipped(voip_delivered_same_device)` 로 기록하고 보내지 않는다.
- 적용 kind: `incoming_call` · `call_canceled` · `call_rejected` · `call_ended` · `call_answered_elsewhere`. **`missed_call` 은 그대로 발송.**
- 영향: iPhone CallKit 경로·페이로드 불변 · VoIP 실패 기기는 일반 알림 유지(대체 수단) · VoIP 토큰 없는 iPhone·Android·웹 푸시·통화 외 알림 불변 · 일반 알림은 앱에서 탭 이동에만 쓰임(`PushRouteListener` `pushNotificationActionPerformed`)이라 통화 처리 무관.
- 회귀 위험: VoIP 200 인데 CallKit 표시 실패 시 배너 대체가 사라짐 → 부재중 알림은 유지되어 놓친 통화 기록은 남음.
- 롤백: 커밋 1개 revert. DB·네이티브 변경 없음.
- 반영: 이 변경만 단독 커밋·단독 main 반영. 반영 후 앱 내 웹 배포 SHA 를 새 기준으로 고정.

## 5. 실기기 검증 행렬 (반영 후 처음부터 · 매 테스트 앱 내 웹 배포 SHA 확인)
| # | 시나리오 | 기대 | DB 대조 |
|---|---|---|---|
| M1 | Samsung→iPhone 음성: 링→받기→10s→종료→뒤로 1회 | 링 ≤2s · CallKit 만(띵·배너 없음) · 양방향 음성 · 표시명=프로필명 · 통화시간 기록 · 뒤로 1회 복귀 | VoIP ≤0.7s · apns skipped |
| M2 | Samsung→iPhone 영상 | 영상 양방향 | 동일 |
| M3 | 링 중 iPhone 거절 | Samsung 화면 ≤1.5s 종료 · 「거절」 팝업 1회 · iPhone 띵·배너 없음 | rejected · apns skipped |
| M4 | 링 중 Samsung 취소 (#5 재검) | iPhone 화면 닫힘 · **띵·배너 없음** · 30s 재울림 없음 | cancelled · apns skipped · 이후 incoming 발송 0 |
| M5 | 링 전(1s 내) Samsung 취소 | iPhone 링 없음 또는 즉시 종료 | 동일 |
| M6 | iPhone→Samsung 음성·영상 | 전체화면 수신 · 연결 · Android 별도 알림 잔존 여부 기록 | FCM ≤1s |
| M7 | iPhone 이 Xiaomi 와 통화 중일 때 Samsung→iPhone | Samsung 「통화 중」 · iPhone 벨 없음 · 기록 「통화 중」 | 세션 미생성 · busy stub |
| M8 | 무응답 30s | Samsung 「응답 없음」 · iPhone **부재중 알림 있음** | missed · apns missed_call sent |
| M9 | M1 종료 5s 안 재발신 | 정상 링·연결 | 새 세션 정상 |
| M10 | 통화 기록 탭 | 위 통화들이 올바른 상태로 표시 | call_logs 일치 |
각 항목: callId · 발신 버튼·수신 화면·수락·연결·종료 시각 · 소리/배너 관찰. FAIL 이면 즉시 중단 → §2 판정표로 추적(해당 변경 롤백 또는 증거 추가 후 재승인).

## 6. 실행 순서와 게이트
1. 이 문서 Owner 승인.
2. §4 구현 → 로컬 검증(통화 푸시 테스트·타입·lint) → 단독 main 반영 → 배포 SHA 보고.
3. Cursor: §5 M1~M10 순서대로. 게이트: 각 항목 PASS + DB 대조 일치해야 다음.
4. FAIL → 중단, 원인 증거 → 이 문서에 추가 → 승인 → 그 건만 수정·반영 → 실패 항목부터 재검.
5. 전 항목 PASS → 통화 복구 완료 보고(변경·원인·수정·PASS/FAIL·남은 위험).

## 7. 범위 밖 (통화 복구 완료 전 금지)
친구 시스템 재설계 · DB 마이그레이션 4건 운영 적용 · 네이티브 ④⑤ · 메신저 신규 기능 · §2 의 「유지」 항목 개선 작업. 통화 복구에 필요한 네이티브 결함이 증거로 확인되면 이 문서에 추가해 승인 후 진행.

## 8. 실행 기록 · FAIL 추적
### 8-1. M1 FAIL (`cf12ba2` 기준, 2026-10-22 13:51 PHT)
- 실기기: Samsung→iPhone `92908913` iPhone CallKit 벨 없음 → 30s 후 부재중만 (Owner).
- 운영 DB: 13:48~13:51 Samsung→iPhone 3건(`876d94e5`·`197a1418`·`92908913`) 모두 VoIP `incoming_call` 0.44~0.71s 에 APNs 200 발송, 같은 토큰(`ee03b8ee…`) · 일반 알림 incoming 은 §4 대로 생략 · 3건 모두 missed.
- 같은 토큰·같은 앱(1.2 (7))으로 08:33~08:40 `f3d6747e`·`8bd4877f`·`91c8a885` 은 CallKit 수신·연결 PASS (당시 SHA `502b6cd`, 일반 알림 동시 발송).
- 코드: iOS 네이티브는 일반 알림(apns)을 배지 갱신에만 사용(`AppDelegate.didReceiveRemoteNotification`) — CallKit 표시 경로는 VoIP(`VoIPPushRegistry`)만. 코드상 의존 없음.
- iPhone 앱 수신 여부: iOS 는 수신 확인(push-ack)을 서버에 보내지 않아 DB 로 판정 불가 → 기기 로그 필요.
- 판단: 오전 PASS 와 지금의 차이는 (A) `cf12ba2`(§4 일반 알림 생략) 와 (B) iPhone 측 상태(앱 종료·iOS PushKit 수신 상태 등) 두 가지뿐. 증거로 둘을 구분할 수 없다.
### 8-2. 다음 단계 (승인 대상)
1. §4 롤백 — `cf12ba2` revert 단독 반영 → 통화 코드가 오전 PASS 상태(`502b6cd` 동일)로 복귀. 다른 변경 없음.
2. 롤백 SHA 로 M1 1회 재검 (iPhone 앱 상태 기록: 실행 중/백그라운드/종료).
   - PASS → (A) 확정. §4 는 폐기하고 D2·D3 는 원인 재조사 후 새 계획.
   - FAIL → (B) 확정. iPhone 기기 로그 수집(Mac 콘솔 앱에서 iPhone 선택 · 검색 `[voip]` / `DIBAY`)으로 VoIP 도착·CallKit 보고 여부 확인 후 계획 추가.

### 8-3. M1 재검 FAIL (`a925273` = 오전 PASS 코드) → 원인 확정
- `5ac9cfc6`(14:07) 서버: VoIP 0.45s·일반 알림 1.28s 모두 APNs 200 (오전 PASS 와 동일) → 벨 없음. `cf12ba2a` 는 원인 아님.
- iPhone 콘솔(Owner, `voip` 필터): 14:11:39·14:12:03·14:13:30·14:13:42 `callservicesd: VoIP push for app <private> dropped on the floor` — **iOS 가 앱에 VoIP 를 전달하지 않고 폐기**.
- iOS 규칙: VoIP 수신 시 매번 CallKit 보고 필수. 보고 없이 완료가 반복되면 그 앱의 VoIP 를 폐기한다.
- 위반 경로 증거: iPhone 이 직접 받은 `f3d6747e`·`8bd4877f`·`91c8a885` 에서 서버가 **받은 그 기기**(answered_device_id `85977e86…` = 이 iPhone)에 `voip_apns:call_answered_elsewhere` 발송(08:33:11·08:33:59·08:40:34). 앱(`VoIPPushRegistry.handleTerminalVoipPush` 승자 기기 분기)은 CallKit 보고 없이 완료 → 위반. 08:40 까지 수신 정상 → 13:48 부터 전부 폐기.
- 기존 동작(10-14 에도 같은 발송 8건) — 오늘 반복 수신 테스트로 누적. 앱의 다른 무보고 완료 경로(N-7)도 있어 이것이 유일 원인이라고 단정하지 않음.
### 8-4. 수정 계획 (승인 대상 · 통화 단독)
1. 서버: `call_answered_elsewhere` 발송 시 **받은 기기(`answered_device_id` = `user_devices.device_id`)는 대상에서 제외**. 다른 기기는 기존대로.
   - 파일: `lib/push/send-community-messenger-call-answered-elsewhere-push.ts`(제외 기기 전달) · `lib/push/dispatch/dispatch-push-for-user.ts`(대상 제외 옵션). 페이로드·다른 kind·Android 정책 불변.
   - 영향: 받은 기기는 원래 이 푸시를 무시(승자 분기)하므로 동작 변화 없음 — 위반만 사라짐. 다른 기기 벨 종료 불변.
   - 롤백: 커밋 1개 revert.
2. iPhone 복구(코드 무관): iOS 폐기 상태 해제 = DIBAY 앱 삭제 후 재설치(같은 iOS 1.2 (7) — `npm run native:prepare` 통과 후 Xcode Run) → `w테스트1` 로그인.
3. 재검: 콘솔 `voip` 켜고 M1 → `dropped` 없음·벨 울림 확인 → 받기 3회 반복(위반 재발 없음 확인) → M2~M10.
4. 근본(N-7, 네이티브 ④): 앱의 모든 VoIP 경로가 CallKit 보고하도록 — 별도 계획·승인.

### 8-5. 재설치 후 결과 (`a077795`, 14:55~15:13 PHT)
- **CallKit 수신 복구**: 음성 4·영상 3 수락·연결 (`86024781`·`f7e61c34`·`dcb46347`·`7579c6f6`·`ea1b74a9`·`03ecdf05` 연결, `a8a71390` 취소). VoIP 발송 0.42~0.72s. 받은 iPhone 으로 `voip_apns:call_answered_elsewhere` **0건**(§8-4 동작 확인).
- 거절 `3431e903`: Samsung 종료 0.21s · 팝업 1회 PASS.
- **D2 잔존**: 매 통화 iPhone 에 일반 알림(`apns`) 발송 → CallKit + 「음성 통화 · OOO님의 전화」 배너 동시(「수신 2개」), 종료·취소·거절 후 배너. w테스트1 iPhone 일반 알림 행이 3개(옛 설치 device `85977e86`·`e1383196` + 현재 `d0c29f5a`)라 통화당 3건 발송 — 실제 표시는 현재 설치 토큰 1건.
- `cf12ba2a`(§4) 는 원인 아님이 확정: 되돌린 상태(`a925273`)에서도 벨 없음이었고, 원인은 iOS VoIP 폐기(§8-3).
- **잠금 화면 거절 버튼 없음**: iOS CallKit 표준(잠금 = 「밀어서 통화하기」만, 거절은 측면 버튼 2회). 앱이 바꿀 수 없음 → 결함 아님. M3 거절은 잠금 해제 상태(상단 배너 ✕)로 검증.
- **D4 신규**: `7579c6f6` 통화 중(00:31) iPhone 앱에 빨간 배너 「통화를 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.」(`call_failed` 알림). 서버상 수락·연결 정상. 이 문구를 띄우는 웹 경로가 여러 곳(수신 배너 수락/거절 실패·발신 실패 등) → **iPhone 웹 로그(Safari 웹 속성) 없이는 특정 불가 · 수정 금지**.
- 수신 지연 체감: 서버 VoIP 0.42~0.72s. 기기 CallKit 표시 시각 미측정 → NOT_PROVEN.
### 8-6. 다음 단계 (승인 대상)
1. D2: §4(`cf12ba2a`) 재반영 — 같은 기기 VoIP sent 면 그 기기 통화 일반 알림 생략, 부재중 유지. 옛 설치 행은 토큰이 무효라 표시 없음(변경 없음).
2. D4: 다음 통화 때 Mac Safari → 개발자 → iPhone → DIBAY 웹 속성 콘솔 기록 → 문구 출처 특정 → 계획 추가·승인 후 수정.
3. 재검: M3(잠금 해제 상태 거절)·M4~M10 + 각 항목 「발신 버튼→CallKit 표시」 시각 측정.
