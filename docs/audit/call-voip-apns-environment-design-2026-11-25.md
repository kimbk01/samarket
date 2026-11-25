# 통화 VoIP 발송 환경 수정 설계 (2026-11-25)

- 상태: **설계 개정 2판 — Owner 승인 전 (구현·커밋 없음)**
- 개정 이유 (Owner 2026-11-25): 「기능 문제·누수·추가 호출 없이 레거시 앱 형식의 구조와 완성도」. 1판의 반대 서버 재시도(V1)·성공 환경 별도 저장(V3)·등록 시 환경 저장(V4·V5)은 모두 추가 호출이라 **삭제**.
- 규정: AGENTS.md 「통화 변경 규정」 2·3·4·5번. 통화만 단독 PR·단독 main 반영.
- 작성 기준: 운영 SHA `86ac083f6`, 운영 DB 읽기 전용 조회 (2026-11-25 09:40~10:10 PHT)

---

## 1. 결함 (증거)

**증상**: 김선희2(Android) → BK iPhone 영상 통화 `75716aa5` (2026-11-25 09:37:38 PHT). 거는 쪽 수신음은 26초 울렸지만 iPhone 에 수신 화면(CallKit)이 나오지 않았다. 판정 **FAIL**.

| 시각 (PHT) | 운영 DB 기록 |
|---|---|
| 09:37:38.955 | `community_messenger_call_events` ringing (김선희2) |
| 09:37:39.209 | `notification_deliveries` call_ringing · **voip_apns failed · http 400 `BadDeviceToken`** · 토큰 `97c1df43…` |
| 09:37:41.831 | 같은 iPhone 일반 알림(apns) call_ringing sent — 배너만, 수신 화면 아님 |
| 09:37:41 | VoIP 행 `97c1df43` `is_active=false` (실패 토큰 비활성화) |
| 09:38:04.811 | 김선희2 취소 |

**원인 (확인된 사실만)**

1. **BK iPhone 설치본 = 개발용 서명** — `samarket-builds/1.2.7-82-61-86ac083f6/App.app` 서명 조회: `aps-environment = development`, `get-task-allow = true`, 프로필 「iOS Team Provisioning Profile: com.dibay.ph」, 1.2.7 (61). 같은 기기 일반 알림 행 `apns_environment = sandbox` (앱 자기 보고).
2. **운영 서버 VoIP 는 운영(production) Apple 서버로만 보낸다** — Vercel `APNS_PRODUCTION` 마지막 수정 2026-11-08 01:42 PHT (값은 비밀이라 읽지 않음). 발송 기록이 그 3분 사이에 뒤집힘:

   | 시각 (PHT) | VoIP 발송 |
   |---|---|
   | 11-08 01:39 | BK **운영** 토큰 `f8efb585` → BadDeviceToken |
   | **11-08 01:42** | **설정 변경** |
   | 11-08 01:47 ~ 11-17 | 같은 운영 토큰 68건 전부 sent |
   | 11-08 01:52 | 다른 사용자 **개발** 토큰 `80fcdd71` → BadDeviceToken (11-05 에는 3건 sent) |

3. **코드가 VoIP 에 기기별 환경·재시도를 쓰지 않는다** — `lib/push/dispatch/apns-sender-impl.ts:302` `sendVoipApnsImpl` 은 `host` 없이 보내 전역 `APNS_PRODUCTION` 호스트만 쓴다(`:36`, `:53` 주석 「VoIP unchanged」). 일반 알림 `sendApnsAlertImpl`(`:283-296`)은 기기 환경 우선 + BadDeviceToken 시 반대 환경 1회 재시도. 발송 뒤 환경 기억(`dispatch-push-for-user.ts:621-633`)도 `apns` 만. 등록 API 도 `apns` 만 환경을 받는다(`app/api/me/devices/register/route.ts:85`). VoIP 토큰 등록(`register-native-push-client.ts:512-520`)은 환경을 보내지 않는다.
4. **이 토큰은 한 번도 성공하지 못함** — `97c1df43` (1.2.7 (61)) 11-13 21:25 ~ 11-25 09:37 VoIP **10건 전부 BadDeviceToken**, sent 0. 같은 30일 운영 서명 토큰은 전부 sent (50b199bb 76건 · 5a22455c 12건 · 42d91e9e 4건 · 92286300 4건).

**영향 범위**: 개발용(Xcode Debug) 서명으로 설치한 iPhone 전부 — 통화 수신 화면이 뜨지 않는다. App Store·TestFlight 설치본은 이 경로로 거절된 기록 없음(위 4번). 실기 시험용 Debug 설치본이 해당하므로 **통화 실기 행렬 자체를 iPhone Debug 로는 할 수 없는 상태**.

**기존 설계와의 충돌 (허위 보고 금지 7번)**: 10-19 PR #70 (`88a427110`) PUSH-02 는 「VoIP path untouched」로 일부러 VoIP 를 뺐고, 테스트 `push02-apns-environment.test.ts:102` 가 「VoIP keeps the global host and never retries on the other host」를 계약으로 고정한다. 이 설계는 그중 「전역 호스트만」을 「기기 환경 호스트」로 바꾼다(「재시도 없음」은 유지) → Owner 승인 대상.

**범위 밖 (이 설계에 넣지 않음)**: 09:21 Android 부재중 2건(`483ed921`·`3e11eb34`) — 앱이 「잠금 화면 표시」를 보고했고 화면이 실제로 보였는지는 NOT_PROVEN. 이 결함과 무관.

---


## 2. 구조 (레거시 앱 기준)

레거시 메신저 구조: **앱이 자기 푸시 환경을 등록 때 서버에 알리고, 서버는 저장된 환경의 Apple 서버 하나로만 보낸다.** 시도·실패·재시도로 환경을 알아내지 않는다. (예: Telegram 공개 API `account.registerDevice` 의 `app_sandbox` 값.)

DIBAY 는 이 구조가 **일반 알림 토큰에는 이미 있다** — iOS 앱이 등록 때 서명 프로필의 `aps-environment` 를 읽어 보낸다(`lib/push/native/apns-environment-native.ts`, 네이티브 `DibayDeviceClassPlugin.getApnsEnvironment`, 10-19 PR #69). 같은 앱 설치본의 일반 알림 토큰과 VoIP 토큰은 같은 서명 프로필 → 같은 환경이다. 증거: BK 1.2.6 (58) 일반 알림 `production` + VoIP 운영 서버 68건 sent, BK 1.2.7 (61) 일반 알림 `sandbox` + VoIP 운영 서버 10건 전부 BadDeviceToken.

→ **VoIP 는 같은 기기(device_id)의 일반 알림 행에 이미 저장된 환경을 쓴다.** 그 행은 발송 대상 조회에서 이미 함께 읽고 있다(`load-active-push-targets.ts:61`, 같은 사용자의 활성 행 전부를 `apns_environment` 열까지 한 번에 조회). 새 조회·새 쓰기·새 요청 0.

## 3. 바꾸는 것

| # | 파일·함수 | 바뀌는 동작 |
|---|---|---|
| V1 | `lib/push/dispatch/filter-user-device-push-targets.ts` `filterUserDevicePushTargets` | `voip_apns` 대상의 `apns_environment` = 자기 행 값 ?? **같은 `device_id` 의 활성 `apns` 행 값** (이미 받은 `rows` 배열 안에서 찾음). 지금은 `apns` 대상에만 붙임(`:86`). |
| V2 | `lib/push/dispatch/apns-sender.ts` `sendVoipApnsToTarget` | `target.apns_environment` 를 V3 에 넘김 (일반 알림 `:47` 과 같은 방식). |
| V3 | `lib/push/dispatch/apns-sender-impl.ts` `sendVoipApnsImpl` | 입력 `apnsEnvironment` 추가. 호스트 = `apnsHostForEnvironment(apnsEnvironment ?? defaultApnsEnvironment())`. **재시도 없음** — 1회 발송, 결과 처리 지금과 같음. |
| T | `lib/push/dispatch/__tests__/push02-apns-environment.test.ts` · `filter-user-device-push-targets.test.ts` | `:102` 계약을 「기기 환경 호스트 · 재시도 없음」으로 변경. 형제 행 환경 붙이기·환경 모름 → 서버 기본·취소 푸시 같은 호스트 테스트 추가. |

- 바꾸지 않는 것: 등록 API·등록 클라이언트·DB(열·함수·데이터)·네이티브(`android/**`·`ios/**`)·서버 설정·발송 순서·실패 토큰 비활성화 규칙.
- `[배포 구분]` = 웹. 앱 재빌드 불필요.

## 4. 호출 수 (추가 호출 0 확인)

Debug(개발 서명) iPhone 통화 1건 수신 기준, 운영 DB 기록으로 센 현재 값:

| 요청 | 지금 (09:37 `75716aa5`) | 바뀐 뒤 |
|---|---|---|
| 발송 대상 조회 (`user_devices`) | 1 | 1 (같은 조회) |
| Apple VoIP 발송 | 1 (거절) | 1 (성공) |
| Apple 일반 알림 대체 발송 | 1 (VoIP 실패라 나감) | 0 (VoIP 성공 시 `ios_call_alert_callkit_owned` 로 건너뜀 — 11-24 50b199bb 6건 기록과 같음) |
| VoIP 행 비활성화 쓰기 | 1 | 0 |
| 취소 시 VoIP 발송 | 0 (행이 꺼져 대상 없음) | 1 (CallKit 벨 정리 — 운영 설치본과 같음) |

운영 서명 설치본: 모든 행 변화 없음 (1차 발송 호스트 같음).

## 5. 영향받는 경로

| 경로 | 영향 |
|---|---|
| 발신 시작·세션 생성·상태 폴링·하트비트·고스트 종료·통화 기록·팝업 | 없음. |
| VoIP 수신 (`incoming_call`) | 운영 서명: 같은 운영 서버 → 변화 없음. 개발 서명: sandbox 서버 → 수신 화면 표시. |
| VoIP 취소 (`call_canceled`) · 응답됨 등 통화 종료 신호 | 같은 함수 → 같은 호스트 규칙. 수신과 같은 서버로 가서 개발 설치본 CallKit 벨도 끝남. |
| iOS 일반 알림 대체 발송 | 판정 로직 무변경. VoIP 가 성공하면 지금 운영 설치본처럼 건너뜀. |
| 부재중 지연(`missed-call-ios-hold`) | 로직 무변경. VoIP sent 가 생기는 기기가 운영 설치본과 같은 규칙을 탐. |
| Android FCM · 웹 푸시 | 없음. |
| 채팅 푸시 묶음 발송(`chat-push-facts-batch.ts:260`) | 같은 필터 함수를 쓰지만 채팅은 VoIP 금지(`voip-apns-non-call-ban`) → 동작 변화 없음. |

## 6. 설치된 구 바이너리 호환

운영 활성 iOS VoIP 행 26개 (2026-11-25 조회), VoIP 행 자기 환경은 26개 모두 null. 같은 기기 활성 일반 알림 행 환경: production 8 · sandbox 0 · 없음/모름 18 (1.2 (22) 5 · 1.2.2 (34) 3 등).

- 형제 환경 production → 운영 서버 = 지금과 같음.
- 형제 환경 없음·모름 → 서버 기본(`APNS_PRODUCTION`) = 지금과 같음.
- 바뀌는 기기 = 형제 환경 sandbox 인 기기(개발 서명 설치본)만. 지금 운영 활성 0대 — BK 1.2.7 (61) VoIP 행은 09:37 실패로 꺼져 있고, 앱을 다시 실행하면 재등록으로 켜진다(11-13 이후 실패 10번마다 반복된 기록).
- 네이티브 수신 처리·페이로드 무변경.

## 7. 회귀·누수 위험

| 위험 | 판단 |
|---|---|
| 벨 두 번 | 발송 횟수 무변경(1회). 재시도 없음. |
| 운영 설치본 수신 실패 | 운영 설치본의 형제 환경은 production 또는 없음 → 호스트 무변경. 형제가 sandbox 인 운영 설치본은 Apple 규칙상 없다(같은 서명 프로필). |
| 형제 행이 옛 설치본 값 | 같은 기기 재설치로 환경이 바뀌었는데 새 일반 알림 등록이 아직 안 된 짧은 사이 → 옛 환경으로 1회 거절 = 지금과 같은 실패, 그보다 나빠지지 않음. 일반 알림 등록은 앱 실행 때 환경을 다시 쓴다(`register/route.ts:205`). |
| 알림 권한 끔 등으로 형제 행이 없음 | 서버 기본 = 지금과 같음. 개발 설치본이면 여전히 실패 — 남은 한계(아래 §10). |
| 누수 (메모리·연결·타이머) | 새 연결·타이머·저장 없음. 필터의 배열 1회 순회 안에서 기기별 환경 표 1개(요청 끝나면 사라짐). |
| 사용자 노출 문구 | 없음. |

## 8. 롤백

웹 전용 → 원인 PR 되돌리기 또는 Vercel Instant Rollback(AGENTS.md 개발 프로세스 2번). DB 에 쓰는 것이 없어 되돌릴 데이터 없음.

## 9. 검증

**코드**: `npm run typecheck:build` · 관련 vitest(`lib/push/dispatch/__tests__/*`) · 변경 파일 eslint · `npm run typecheck:test`.

**실기** (매 시험 Production SHA 확인 · 발신·세션·VoIP/FCM 발송·수신 화면·연결·종료 시각 기록, 서버 시각은 운영 DB 대조 · 앱 실행 상한 10회):

| # | 조건 | PASS 기준 |
|---|---|---|
| K1 | Android → iPhone **Debug(61)** 영상, 잠금 | VoIP sent 1건 · 일반 알림 skipped · CallKit 수신 화면 · 받기 연결 |
| K2 | Android → iPhone Debug, 벨 중 취소 | 취소 VoIP sent · CallKit 벨 즉시 끝남 · 재울림 없음 |
| K3 | Android → iPhone **운영 서명(60 또는 58)** 음성·영상 | 지금과 같이 VoIP sent · 수신 화면 (회귀 없음) |

그다음 통화 변경 규정 5번 최소 행렬: Android↔iPhone 음성·영상 발신·수신, 거절, 벨 중 취소, 취소 후 지연 푸시(재울림 없음), 통화 중(busy), 무응답 타임아웃, 정상 종료 후 즉시 재발신.

## 10. 남은 한계 (이 설계로 해결 안 됨 — 보고만)

- 개발 설치본이면서 일반 알림 행이 없는 기기(알림 권한 거부 등)는 여전히 VoIP 거절. VoIP 등록 때 환경을 따로 저장하면 풀리지만 등록마다 쓰기 1회가 늘어 이번 범위에서 뺐다.
- 09:21 Android 부재중 2건 화면 표시 NOT_PROVEN — 별건.

## 11. 반영 방식 · Owner 결정

- 브랜치 `fix/call-voip-apns-environment`, **통화만 단독 PR**, 이 문서 포함. 통화 변경이라 자동 병합 등록은 Owner 승인 뒤.
- **Owner 결정 필요**: 이 설계(V1~V3·T) 구현 승인. 승인되면 10-19 PUSH-02 의 「VoIP 무변경」 계약은 이 문서 §3 으로 대체.
