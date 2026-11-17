# 수신 전체 화면이 될 때도 안 될 때도 있음(현상 2) · 받는 쪽 부재중 PATCH 실패(현상 3) — 원인 확정·설계안 (구현 안 함 · Owner 승인 대기) — 2026-11-18 PHT

통화 변경 규정(AGENTS.md) 2·3번 문서다. 승인 전에는 코드를 바꾸지 않는다. 기준: 릴리스 1.2.7 (73), main `0360f85`. 측정 기기: Samsung SM-M156S(Android 16), Xiaomi 24076RP19G.

## 1. 원인 (확정 — AOSP 원본 코드 + 실측)

### 1-1. Android 가 허용하는 기준 (AOSP `frameworks/base` main, 2026-11-18 조회)

- DIBAY 는 백그라운드·잠금 해제 상태에서 수신 FSI PendingIntent 를 직접 `send()` 해 통화 화면을 띄우려 한다(`NativeVoiceCallRuntime.startBackgroundUnlockedActivity`, `:1427`. 영상은 `NativeVideoCallRuntime :1395`).
- 이 시작이 받는 판정: `BackgroundLaunchProcessController.areBackgroundActivityStartsAllowed`(`:120-170`). 허용 사유는 아래 다섯 가지이고, 없으면 `BLOCK` 이다.
  - 권한(계측)
  - 토큰
  - 앞에 있는 uid 에 묶임
  - **「process has activity in foreground task」(`hasActivityInVisibleTask`) → `BAL_ALLOW_FOREGROUND`**
  - 10초 유예
- `hasActivityInVisibleTask` = 그 프로세스의 Activity 가 속한 작업의 `mLayerRank != LAYER_RANK_INVISIBLE`(`WindowProcessController :1256-1257`).
- `mLayerRank` 는 `task.isVisibleRequested()` 인 작업에만 주어진다(`RootWindowContainer.rankTaskLayers :2951-2957`).
- 그 밖의 허용: 사용자가 「다른 앱 위에 표시(SYSTEM_ALERT_WINDOW)」 를 허용한 앱(`BAL_ALLOW_SAW_PERMISSION`, `BackgroundActivityStartController :1091-1098`). DIBAY 매니페스트에는 이 권한이 없다.

### 1-2. Samsung 에서 실제로 갈린 조건 (실측)

| 상태 | `mActivityStateFlags`(dumpsys) | 결과 |
|---|---|---|
| DIBAY 일반 화면 → 홈으로 나감(03:45:15·03:45:34·03:46:14, 60초 넘게) | `VT` (보이는 작업에 Activity 있음) | 수신 시 `BAL_ALLOW_FOREGROUND [realCaller]` → 전체 화면 |
| 통화 화면이 닫힌 뒤(03:47:10·03:47:30·03:48:00) | 비어 있음 | 수신 시 `BAL_BLOCK` → 위쪽 알림 |

- Samsung 은 홈으로 나간 직전 앱 작업을 「보이기 요청(visibleRequested)」 상태로 남긴다. DIBAY 일반 작업(`com.dibay.app`)이 그 작업이면 허용된다.
- 통화 화면은 별도 작업(affinity `com.dibay.app.native.voice`, 최근 목록 제외)이고 통화가 끝나면 제거된다(`wm_task_removed`). 그래서 마지막이 통화 화면이었으면 DIBAY 작업이 남지 않아 차단된다.
- 예측 검증: 예측 3건(C1 차단·D1 허용·C2 차단)이 모두 맞았다. 앞선 기록 13건도 모두 맞는다.
- 결정 요인이 아님(측정): 경과 시간(43초에서 허용·차단 모두 나옴), 보낸 순간의 프로세스 상태(둘 다 `SERVICE`).
- 결론: **전체 화면이 될지는 Samsung 런처가 직전 작업을 어떻게 남겼는지(OEM 부수 효과)에 달려 있다.** 앱이 정할 수 없다. Xiaomi·다른 OEM 에서도 같은지는 측정하지 않았다(NOT_PROVEN).

### 1-3. Android 공식 기준

> 「If your notification includes a full-screen intent … the system UI displays a heads-up notification instead while the user actively uses the device.」 — Android Developers, Time-sensitive notifications

기기를 쓰는 중(잠금 해제·화면 켜짐)이면 **위쪽 알림이 Android 표준**이다. 잠김·화면 꺼짐이면 시스템이 FSI 를 전체 화면으로 띄운다(앱의 백그라운드 시작 허용과 무관).

### 1-4. 현상 3 (부재중 PATCH 실패)

- 수신 벨 단계에는 통화 포그라운드 서비스가 없다. 서비스는 연결 중·연결됨에서만 시작된다(`NativeVoiceCallRuntime :637·687·777·812`).
- 그래서 화면 시작이 막히면 앱이 백그라운드(`SERVICE`→`CAC`)로 남는다. Android 네트워크 정책 `blocked=APP_BACKGROUND` 가 걸린다(03:20:58 `effective=APP_BACKGROUND` 실측). 그 결과 받는 쪽 부재중 PATCH 가 16ms 만에 실패하고 서버에 도착하지 않는다(Vercel 로그).
- 서버 결과는 정확하다. 발신자 쪽 부재중 PATCH 와 서버 cron(`/api/community-messenger/calls/sessions/stale-cleanup`, `*/2 * * * *`, `call-stale-ringing-cleanup.ts`)이 부재중을 확정한다. 실측 2건 모두 DB `missed` 가 정확했다.
- 받는 쪽 사용자 동작도 동작했다(실측).
  - 위쪽 알림 「거절」: 앱이 백그라운드여도 성공(02:55:15 `reject_patch_done 200`, 화면 시작이 막힌 통화).
  - 「수락」: 알림 동작으로 화면이 열려 앞 상태가 된다(02:45·02:52 성공).
- 코드 사실: `patchAsync` 예외 경로는 예외 이름을 로그로 남기지 않는다(`NativeVoiceCallApi :501-502`).

## 2. 설계안

원칙(Owner): Android 기능이 먼저다.

### 안 A (권장) — 잠금 해제·사용 중 수신은 Android 표준(FSI → 위쪽 알림)만 쓴다

| 바꾸는 곳 (음성·영상 동일) | 지금 | 바꾼 뒤 |
|---|---|---|
| `NativeVoiceCallRuntime :222-231` 앱이 안 보이고 잠금 해제 상태 | 수신 알림 게시 + `startBackgroundUnlockedActivity` 로 화면 직접 시작 시도(Samsung 조건부 성공) | 수신 알림(FSI) 게시만. 직접 시작 시도 없음 → 항상 위쪽 알림 「수락·거절」 |
| `:1415-1422` 앞 화면 시작이 1.2초 안에 안 보일 때의 대체 | FSI 게시 + 직접 시작 재시도 | FSI 게시만 |
| `NativeVideoCallRuntime :193-199`, `:1383-1390` | 같음 | 같음 |

바꾸지 않는 것:
- 잠김·화면 꺼짐 수신(시스템 FSI 전체 화면).
- 앱이 보일 때 수신(`startForegroundVisibleActivity`, 보이는 창이라 허용).
- 대기 통화 이어받기 B2(Owner 승인 2026-11-15).
- 수락·거절·부재중·취소 처리, 웹·서버.

효과:
- 잠금 해제 사용 중 수신이 기기 상태와 무관하게 늘 같은 화면(위쪽 알림)이 된다. Android 표준과 같다.
- 막힌 시도 뒤 2.5초 판정·로그 같은 헛동작이 없어진다.

잃는 것:
- Samsung 에서 「직전에 DIBAY 일반 화면을 보다 홈으로 나간」 경우에 나오던 전체 화면이 위쪽 알림으로 바뀐다.

**충돌 보고(허위 보고 금지 7번):** 이 직접 시작은 2026-06-27~28 커밋(`364e6847b`·`6f880b686`)부터 있었다. 이를 Owner 가 승인했다는 문서는 찾지 못했다. 그래도 지금 사용자가 보는 동작이 바뀌므로 Owner 결정이다.

### 안 B — 늘 전체 화면: 「다른 앱 위에 표시」 권한 요청

- `SYSTEM_ALERT_WINDOW` 를 선언하고, 사용자에게 설정 화면에서 허용을 받는다 → `BAL_ALLOW_SAW_PERMISSION` 으로 백그라운드 시작이 허용된다(AOSP).
- 문제:
  - 사용자가 설정에서 직접 켜야 한다.
  - 권한 요청 화면·문구가 새로 생긴다.
  - Google Play 정책을 검토해야 한다.
  - Android 표준(사용 중엔 위쪽 알림)과 반대 방향이다.
- 실기 확인은 하지 않았다(NOT_PROVEN).

### 안 C — 현행 유지

- 동작이 Samsung 런처 상태에 따라 갈린다. 다른 OEM 동작은 모른다.

### 현상 3 — 기능 변경은 하지 않고, 실패 이유만 기록(관측)

- 받는 쪽 부재중 PATCH 는 서버 기록에 필요 없다(발신자 PATCH + 2분 cron). 실패해도 사용자 영향은 없다(실측).
- 그래서 「벨 중 포그라운드 서비스 시작」 같은 기능 변경은 권하지 않는다. 그렇게 하면 벨 단계에 알림 표면이 하나 더 생겨 통화 SSOT §7(RINGING = 수신 알림만)을 바꿔야 하고, 얻는 것은 중복 PATCH 성공뿐이다.
- 권장(작은 별도 PR, 통화 규정): `patchAsync` 예외 경로에 예외 이름을 로그로 남긴다. 동작 변경은 없다.

## 3. 안 A 영향 분석

| 경로 | 영향 |
|---|---|
| 발신·세션 생성·VoIP/FCM 발송 | 없음 |
| 수신 알림(FSI) 게시·벨·부재중 30초 타이머 | 없음(지금도 직접 시작 전에 게시) |
| 잠김·화면 꺼짐 수신 | 없음(시스템 FSI) — 실기 회귀 확인 |
| 앱이 보일 때 수신 | 없음 |
| 대기 통화 이어받기(B2) | 이어받기 시작이 막혔을 때의 대체에서 직접 시작 재시도가 빠진다(FSI 게시는 유지) — 실기 회귀 확인 |
| 위쪽 알림 수락·거절, ◁ 뒤 알림 재게시(#428) | 없음 |
| 구 설치본(≤73) | 지금 동작 그대로(네이티브 변경) |
| iOS | 없음 |

- 회귀 위험: 일부 OEM 에서 「사용 중」인데도 FSI 위쪽 알림이 늦거나 안 보일 수 있다. 실기에서 Samsung·Xiaomi 둘 다 확인한다.
- 롤백: PR 되돌림 + 설치본 재빌드.

## 4. 안 A 실기 행렬

각 항목마다 Production SHA, 설치 버전, 발신·수신 표시·동작 시각을 기록한다.

| # | 항목 | Samsung | Xiaomi |
|---|---|---|---|
| 1 | 잠금 해제·홈 화면(직전 = 일반 화면) 수신 → 위쪽 알림 | | |
| 2 | 잠금 해제·홈 화면(직전 = 통화 화면) 수신 → 위쪽 알림(1과 같음) | | |
| 3 | 1·2 에서 수락·거절·부재중·발신자 취소, 알림 잔류 0 | | |
| 4 | 잠김·화면 꺼짐 수신 → 전체 화면(회귀) | | |
| 5 | 앱이 보일 때 수신 → 전체 화면(회귀) | | |
| 6 | 대기 통화 이어받기(회귀) | | |
| 7 | 1~6 영상 | | |

- 제약: Xiaomi 알림 버튼은 adb 로 누를 수 없다(Owner 가 직접 누르거나 NOT_PROVEN). iPhone 은 이 환경에 없다.
