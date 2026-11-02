# 알림 경로 처리완료(ACK) 미전달 · 접근불가 이동 1회 제한 — 원인·수정 설계 (2026-11-02)

상태: **설계 · Owner 승인 대기** (코드 변경 없음)
근거 결함: F-5 — 샤오미 태블릿(zxzx11, 1.2.5 (32))에서 통화 종료 뒤 메신저 오른쪽 칸이 22:42:06~22:45:37 PHT 동안 빈 화면.
기준 코드: `origin/main` (Production `b5419b6b5` 와 해당 파일 동일).

---

## 1. 확정된 원인 (증거)

| # | 결함 | 위치 | 생긴 날 | 증거 |
|---|---|---|---|---|
| ① | `getNativeIncomingCallPlugin()` 이 기기(Android·iOS)에서 **끝나지 않음(영원히 대기)**. 그래서 이 함수를 거치는 네이티브 호출이 한 번도 실행되지 않음 | `lib/push/native/push-route-native-bridge.ts` 55–104 | 2026-06-27 (`364e6847b`) | Capacitor 8.4 `registerPlugin` = `new Proxy({}, { get })` (`node_modules/@capacitor/core/dist/index.js:157`). `has` 함정이 없어 `"then" in plugin` 이 false → 보호 Proxy를 씌우지 않음 → `Promise.then(w => w.plugin)` 이 결과값의 `then(resolve, reject)` 을 호출 → Capacitor 래퍼가 **거부된 Promise 를 반환할 뿐 resolve/reject 를 부르지 않음**(`index.js:111-123`) → 바깥 Promise 는 끝나지 않고, 반환된 거부가 처리되지 않아 `Uncaught (in promise) "NativeIncomingCall.then()" is not implemented` 로그. (정정: 처음 보고의 「항상 거부」는 틀림 — 영원히 대기. `await` 뒤 코드가 실행되지 않는 결론은 같음.) 테스트 `push-route-native-bridge-plugin-access.test.ts` 로 고정. X logcat 같은 로그 25회, 모두 경로 처리 직후 |
| ② | `redirectResourceAccessDenied` 의 `redirectInFlightKey` 를 **한 번 설정하면 지우지 않음**. 같은 웹페이지 수명에서 같은 키로 두 번째 「접근 불가」부터 안내도 이동도 없음 | `lib/auth/resource-access-denied-flow.ts` 15, 55–57 | 2026-06-06 (`363279879`) | 해제 코드 0곳. 호출 화면 3곳 모두 거부 시 `return null` |

F-5 사슬 (X logcat · 운영 DB):
1. 22:40:38 adb 로 방 a7c0 을 엶 → 네이티브가 경로를 보관 (`pending_route_saved`).
2. 웹이 같은 경로임을 확인하고 처리완료 전송 → ① 때문에 네이티브에 닿지 않음 (`pending_route_cleared` 0건).
3. 22:40:48 X 가 그 방을 나감.
4. 22:42:05 통화 종료 뒤 앱 복귀 → 네이티브 메모리에 남은 a7c0 경로를 다시 보냄. 메모리 값은 60초 만료 대상이 아님.
5. 22:42:06 나간 방으로 이동 → 입장 거부 → 1회차는 안내 + 목록 이동.
6. 22:42:10 네이티브 재전송 → 다시 그 방 → ② 때문에 이동 없음 → `CommunityMessengerRoomBootstrapGate` 가 `return null` → 빈 화면.
7. 22:42:48 w 스티커로 X 재참가 (`community_messenger_participants.joined_at`). 같은 주소라 다시 그려지지 않음. 뒤로가기 뒤에야 복구.

작업자 원인 (먼저 적음):
- 시험 중 adb 딥링크와 나가기를 연달아 실행해 이 상황을 만들었습니다.
- S-1(`bf8344405`)이 1:1 방 개설자의 나가기 차단(`owner_cannot_leave`)을 풀었습니다. 그래서 「나간 방으로 이동」이 일어날 기회가 늘었습니다.
- 결함 ①·② 자체는 그 이전부터 있었습니다.

---

## 2. 수정 범위와 분리 (규정 적용)

| 단계 | 내용 | 분류 | 규정 |
|---|---|---|---|
| **A** | 결함 ② + 거부된 목적지의 보관 경로 정리 | 웹 (통화 무관) | 일반 웹 변경 |
| **B** | 결함 ① — **알림 경로 함수 4개만** 동작하는 접근으로 바꿈 | 웹이지만 **통화 동작이 바뀜** (§4 B-3) | 통화 변경 규정 전체 적용: 이 문서 = 영향 분석, Owner 승인 후 구현, 단독 커밋·단독 main 반영, 코드 PASS + 실기 행렬 PASS |
| **C** | 결함 ① 중 통화 함수(`markCallConsumed` 동기화 등)는 **이번에 살리지 않음** | 통화 | 보고만 (§4 B-5). 통화 규정 §2: 통화 결함 증거 없이 통화 경로를 바꾸지 않음 |

접근자 전체를 고치지 않는 이유 (규정 판단):
- 접근자를 고치면 Android V4 통화 종료마다 네이티브 `markCallConsumed`·`clearPendingCallRoute` 가 **처음으로** 실행됩니다 (§4 B-5).
- 이것은 F-5 수정과 무관한 통화 동작 변경입니다. 통화 결함 증거도 없습니다.
- 통화 규정 §2(증거 없이 통화 경로 변경 금지)·§4(한 번에 한 원인)가 SSOT 정리보다 우선합니다.
- 그래서 B 는 알림 경로 함수만 **기존에 동작하는 즉시 접근자** `getSyncNativeIncomingCallPlugin()` 으로 바꿉니다. 새 접근자는 만들지 않습니다. 벨 시작·중지가 이미 쓰는 접근자입니다.
- 고장 난 비동기 접근자와 그 통화 호출은 C 로 따로 보고합니다.

순서: **A 먼저** (일반 웹, 단독 반영, 빈 화면 재발 차단) → **B** (Owner 승인 후 통화 규정으로 단독 반영 + 실기 행렬).
네이티브 파일은 바꾸지 않습니다 (빌드·설치 불필요).

---

## 3. 단계 A — 접근 불가 이동 (결함 ②)

### A-1 변경
`lib/auth/resource-access-denied-flow.ts`
- `redirectInFlightKey` 를 「이동 대기 중」에만 유지합니다. `setTimeout` 안에서 `router.replace` 를 호출한 뒤 `null` 로 되돌립니다.
- 목적은 그대로입니다. 같은 순간 두 화면(방 입구 Gate + 방 내부 phase1)이 동시에 이동시키지 않게 합니다.
- 바뀌는 점: 이동이 끝난 뒤 같은 키의 다음 거부는 다시 안내하고 이동합니다.

### A-2 거부된 목적지의 보관 경로 정리 (같은 함수 안, 한 곳)
- 거부 시점의 현재 주소(`pathname + search`)가 sessionStorage 보관 경로(`readPendingPushRoute`)와 같으면 `clearPendingPushRoute()` 를 호출합니다.
- 네이티브에는 `ackNativePushRouteConsumed({ path })` 를 보냅니다. 네이티브는 경로가 일치할 때만 지웁니다 (`MainActivity.ackPushRouteConsumed`, `PushRouteAckMatch`).
- 이유: 열 수 없는 목적지를 「처리 끝」으로 정리하지 않으면 B 이후 앱이 다시 보일 때마다(최대 60초) 같은 거부가 반복됩니다.
- A 단계에서 네이티브 전달은 ① 때문에 아직 실패합니다 (현재와 같음). B 반영 시 함께 동작합니다.

### A-3 영향받는 화면 (호출처 전부)
| 호출처 | 키 | 거부 시 화면 | 수정 후 |
|---|---|---|---|
| `components/community-messenger/room/CommunityMessengerRoomBootstrapGate.tsx:234` | `/community-messenger` | `return null` | 매번 안내 + 목록 이동 |
| `lib/community-messenger/room/use-messenger-room-client-phase1.ts:798` | `cm-room:<roomId>` | 방 내부 | 매번 안내 + 목록 이동 |
| `components/chats/ChatRoomScreen.tsx:127` (거래·필라이프·스토어 스트림) | `listHref` | `return null` (592) | 매번 안내 + 목록 이동 (같은 결함이 거래 채팅에도 있었음) |

각 화면의 「마운트당 1회」 ref(`redirectedRef` 등)는 그대로 둡니다. 화면별 중복은 그 ref 가 막고, 전역 키는 동시 이동만 막습니다.

### A-4 깨질 수 있는 것 / 대책
- Gate 와 phase1 이 500ms 안에 함께 거부 → 키가 달라 둘 다 이동 예약. **현재도 같은 동작**(키 `/community-messenger` 와 `cm-room:<id>` 는 이미 다름). 이번 변경과 무관합니다.
- 대기 중(500ms) `return null` 빈 화면은 현재와 같습니다. 안내가 함께 뜹니다.

### A-5 검증
- 코드: vitest
  - 같은 키로 이동 → 타이머 경과 → 다시 이동이 실행되는지
  - 대기 중 같은 키 재호출은 무시되는지
  - 보관 경로가 같은 주소일 때만 지우는지
  - `messenger-room-bootstrap-gate-contract.test.ts` 회귀
- typecheck · eslint (변경 파일)
- 실기 (Production SHA 확인 후, 시험 계정·시험 방만):
  - 나간 1:1 방 주소를 두 번 연속 열기 → 두 번 모두 안내 + 목록 (Android 분할 화면, iPhone)
  - 거래 채팅 접근 불가 방 두 번

---

## 4. 단계 B — 플러그인 접근자 (결함 ①)

### B-1 변경
`lib/push/native/push-route-native-bridge.ts`
- 다음 4개 함수만 `const plugin = await getNativeIncomingCallPlugin()` 을 `const plugin = getSyncNativeIncomingCallPlugin()` 으로 바꿉니다:
  - `readNativePersistedPendingPushRoute`
  - `clearNativePersistedPendingPushRoute`
  - `notifyNativePushRouteConsumerReady`
  - `ackNativePushRouteConsumed`
- 이 함수들은 플러그인 객체를 Promise 로 넘기지 않고 메서드만 호출하므로 `then` 문제에 닿지 않습니다. `getSyncNativeIncomingCallPlugin` 의 판정은 고치지 않습니다. 고치면 통화 쪽이 바뀝니다.
- 통화 함수(`readNativePersistedCallPendingRoute`·`clearNativePersistedCallPendingRoute`, 그리고 다른 파일의 통화 함수)는 그대로 둡니다.
- `getNativeIncomingCallPlugin` 의 주석에 「기기에서 끝나지 않음 — C 참조, 통화 승인 전 사용 금지」를 적습니다.
- 회귀 테스트: Capacitor 와 같은 `get`-only Proxy 를 주입해 4개 함수가 네이티브 메서드에 도달하는지 확인합니다. 기존 테스트는 이 접근자를 mock 해서 결함을 잡지 못했습니다.

### B-2 살아나는 알림 경로 호출 (통화 외)
| 함수 | 호출처 | 지금 | 수정 후 |
|---|---|---|---|
| `ackNativePushRouteConsumed` | `PushRouteListener.tsx:163` (경로 처리완료) | 네이티브 미도달 → 보관 경로가 메모리에 남아 재전송 (F-5) | 경로 일치 시 네이티브가 저장·메모리 경로를 지움 |
| `notifyNativePushRouteConsumerReady` → `consumePendingRoutes` | `PushRouteListener.tsx:577` (마운트 + 화면 보일 때마다) | 거부 → `.then` 뒤의 `consumePendingRoutes` 가 **한 번도 실행 안 됨** | 네이티브가 보관 경로를 재전송하고, 웹은 sessionStorage·네이티브 보관 경로를 다시 처리 |
| `readNativePersistedPendingPushRoute` | `PushRouteListener.tsx:563` | 미실행 | 네이티브 저장 경로(60초) 읽기 |
| `clearNativePersistedPendingPushRoute` | `PushRouteListener.tsx` 14곳, `client-session-wipe.ts:296` (로그아웃 강제 삭제) | 미도달 → **로그아웃해도 네이티브 보관 경로가 남음** | 실제로 지워짐 |

B-2 의 위험과 대책:
- **보관 경로 재처리가 처음 동작**합니다.
  - 정상 처리된 경로는 처리완료로 지워져 재처리 대상이 없습니다.
  - 열 수 없는 목적지는 A-2 가 지웁니다.
  - 8초 안에 주소가 맞지 않은 경로(`consume_unconfirmed_keep_pending`)는 60초 안에 화면이 다시 보일 때 한 번 더 이동을 시도할 수 있습니다. 이것은 원래 설계(2026-09-07 `2031c7c8a` 「ACK 전까지 보관」)가 의도한 동작이며, 지금까지 실행되지 않았을 뿐입니다.
- 같은 경로가 네이티브 재전송과 웹 재처리로 두 번 들어올 수 있습니다. 두 번째는 `same_route_ack` 로 끝납니다 (현재 로그에서도 같은 처리 확인).
- 구 바이너리:
  - `ackPushRouteConsumed`·`notifyPushRouteConsumerReady` 는 2026-09-07 이후 Android 빌드에만 있습니다. 없는 빌드에서는 호출이 거부되고 `try/catch` 로 끝나 현재와 같습니다.
  - Android 설치 버전은 `user_devices` 기준 1.0 ~ 1.2.5 (32) 혼재입니다. 「1.0」 표기 빌드의 생성 시점은 확인 못 함 → 해당 빌드는 동작 변화 없음 또는 위 정상 동작 둘 중 하나입니다.
- iOS: `NativeIncomingCall` 플러그인이 **iOS 에는 없습니다** (`ios/App/**` jsName 목록). 수정 후 호출은 모두 「not implemented」 거부 → 각 함수의 `try/catch` 로 끝납니다. 처리되지 않는 거부가 남는 곳은 §4 B-3 표에 적습니다.

### B-3 B 로 바뀌는 통화 동작 (통화 규정 §3 영향 분석)
웹 `PushRouteListener` 는 통화 경로를 받으면 `clearNativePersistedPendingPushRoute()`(force 없음)를 호출합니다. 호출 위치:
- `v3_call_route_suppressed`
- `legacy_web_establishment_removed`
- `v4_route_delivered`
- 수락 경로
- `call_v3_wake`

지금은 네이티브에 닿지 않습니다. B 이후 네이티브 `NativeIncomingCallPlugin.clearPendingPushRoute` → `MainActivity.clearPersistedPendingPushRouteIfConsumed` 가 실행됩니다. 통화 경로는 채팅방 경로가 아니므로:
- 저장 경로 삭제
- **메모리 `pendingAppPath` 삭제**
- **통화 로딩 화면 닫기** (`clearInMemoryPendingRouteState`, `MainActivity.java:1022-1027`)

| 영향 경로 | 바뀌는 점 | 깨질 수 있는 것 | 확인 방법 |
|---|---|---|---|
| Android V4 잠금화면 수락 (`beginLockV4AcceptBackgroundHydration` 이 수락 경로를 메모리·저장에 보관, `MainActivity.java:554-565`) | 웹이 그 경로를 받아 처리하면 네이티브 보관 경로가 지워짐 | 웹 복원 뒤 재전송(`maybeReplayPendingV4AcceptRouteAfterWebHydration`)이 보관 경로를 다시 필요로 하면 재전송이 사라짐 | 실기: 잠금 상태 수신 → 수락 → 연결·통화 화면 표시 |
| 통화 경로 전달 직후 앱 복귀 | 메모리 경로가 없어 복귀 시 통화 경로 재전송 없음 (현재는 남아서 재전송·`legacy_web_establishment_removed` 반복) | 웹이 아직 통화 화면을 못 띄운 상태라면 재전송으로 복구되던 경우가 사라짐 | 실기: 수락 직후 홈 → 앱 복귀 |
| 통화 로딩 화면 | 웹이 통화 경로를 받으면 네이티브 로딩 화면이 닫힘 | 통화 화면이 뜨기 전에 로딩 화면이 닫혀 메신저가 잠깐 보일 수 있음 | 실기: 알림 수락·앱 내 수락 화면 전환 관찰 |
| 로그아웃 (`client-session-wipe.ts:296`, force) | 네이티브 저장 보관 경로가 실제로 지워짐 | 없음 (의도된 계정 분리) | 실기: 로그아웃 → 다른 계정 |

구 바이너리 호환:
- `clearPendingPushRoute` 는 2026-06-15 이후 모든 Android 빌드에 있습니다.
- 통화 경로 분기(`isChatMessengerRoomPendingPath`)가 들어간 날은 확인 못 함.
- 설치 Android 빌드 중 최근 활동 기기: 1.2.5 (24)·(32)·(20) 등 (`user_devices`, 2026-11-02 조회).
- iOS: 플러그인 없음 → 즉시 접근자로 메서드 호출 시 「not implemented」 거부 → 각 함수의 `try/catch`. 변화 없음.

롤백: B 커밋 revert 1개 (웹만, 앱 재시작으로 복구).

### B-5 (C) 살리지 않는 통화 호출 — 보고만
비동기 접근자를 고치면 동작이 바뀌는 통화 호출입니다 (`origin/main` 코드 분석 + X logcat):

| 호출 | 실제 Android 도달 | 지금 | 살아나면 |
|---|---|---|---|
| `requestCallV4NativeConsumedSync` (`call-v4-native-lifecycle.ts:58-71`). V4 정리(`cleanupCallV4`)·거절에서 호출 | **도달 확인**: X logcat 22:36:14·22:42:07 `native_consumed_sync_requested` 직후 같은 오류 | 매번 대기 상태로 멈춤 — `native_consumed_sync_failed` 로그 0건과 일치 (네이티브가 자체적으로 이미 표시: `MainActivity.java:819,841`) | 종료마다 네이티브 `markCallConsumed`: 부재중 타이머 취소, 120초 처리 표시, 벨 중지, 알림 닫기. 웹이 잘못 종료 판단한 경우 진행 중 통화의 재수신이 120초 막힐 위험 |
| `clearNativePersistedCallPendingRoute` ← `hardClearActiveCallSession` ← `finalizeCallV4Terminal` | terminal finalize 로그는 있음. 이 호출의 도달은 확인 못 함 | 대기 상태로 멈춤(실행 안 됨) | 통화 보관 경로를 **통화 id 구분 없이** 삭제 → 다음 통화(B) 수락 경로가 지워질 위험 |
| 그 밖의 호출 (`hydrateDibayCallConsumedFromNative`·`isCallConsumedIncludingNative`·`drainPendingTerminalEventsFromNative`·`getForegroundIncomingCallId`·`dismissNativeForegroundIncomingUi`·`dismissAllIncomingCallNotifications`) | 기기에서는 V4 화면만 마운트(`CallIncomingChrome.tsx:83-91`) → 호출 화면이 마운트되지 않음, 또는 레거시 경로라 도달 확인 못 함 | 대기 상태로 멈춤(실행 안 됨) | 해당 없음 / 확인 못 함 |

C 는 통화 결함 증거가 생길 때 통화 규정 절차로 따로 다룹니다. 이번 A·B 와 묶지 않습니다.

### B-4 단계 B 검증 (통화 규정 §5 최소 행렬 + 알림 경로)
- 코드: vitest (B-1 회귀 + 통화 관련 기존 테스트), typecheck:build, typecheck:test, eslint
- 실기: 각 회차마다 Production SHA 기록, 서버 시각은 운영 DB 로 대조
  - 알림 경로: 알림 탭 → 방 열림 → 네이티브 `pending_route_cleared` 로그 → 통화 후 복귀 시 재전송 없음
  - 로그아웃 → 다른 계정 로그인 → 이전 알림 경로가 열리지 않음
  - B-3 표의 4개 확인 항목 (잠금화면 수락, 수락 직후 복귀, 로딩 화면, 로그아웃)
  - 통화 행렬 (Android↔iPhone):
    - 음성·영상 발신·수신
    - 거절
    - 벨 중 취소
    - 취소 후 지연 푸시 (재울림 없음)
    - 통화 중(busy)
    - 무응답 타임아웃
    - 정상 종료 후 즉시 재발신
- 롤백: B 커밋 revert 1개 (웹만, 즉시 반영)

---

## 5. 이번 설계에 넣지 않는 것 (보고만)
- 네이티브 `MainActivity.pendingAppPath`(메모리)는 60초 만료가 없습니다. 처리완료가 안 오면 프로세스가 끝날 때까지 남습니다. B 이후에는 처리완료로 지워집니다. 네이티브 변경이 필요해 이번에는 넣지 않습니다.
- `lib/lifecycle/launch-intent.client.ts:38` 이 `NativeIncomingCall` 을 별도로 `registerPlugin` 합니다. 결함과는 무관합니다(직접 메서드 호출).
- F-4 (iPhone 흰 화면 21:39): 원인 확인 못 함. 앱을 완전히 종료하고 다시 실행해도 지속되었으므로 이 사슬(②의 키는 재실행 시 초기화)로는 설명되지 않습니다.
