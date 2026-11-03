# Xiaomi 앱 아이콘 숫자 +1 (B7) — 실기로 원인 확정 · 수정 설계 (2026-11-04 · 승인 대기)

> 작업자 직접 실기(Xiaomi A `8b37179f7d94`, 앱 1.2.5 (36), Owner 「지금 실기 해서 확인 해봐」) + Xiaomi 공식 문서 + AOSP 원본. 코드·DB 변경 없음.
> 증거: `docs/audit/evidence/xiaomi-badge-b7-proof-2026-11-04/`

## 1. 실기 결과 (07:44~07:45 PHT)
| 단계 | 알림창의 DIBAY 알림 | 홈 아이콘 숫자 | 근거 |
|---|---|---|---|
| 시작 | 요약 카드(`number=60`) + 시험 알림 `[v36]` 1장(채널 `dibay_admin_notice_v1`) | **61** | `0-before.txt` · `1-home-now.png` |
| 시험 알림 1장만 밀어서 지움(07:45:10) | 요약 카드(`number=60`)만 | **60** | `6-after-dismiss2.txt` · 시스템 로그 `onNotificationRemoved 0\|com.dibay.app\|-1731703033` · `7-home-after-dismiss.png` |

→ **+1 은 요약 카드 외의 DIBAY 알림 1장** 때문(확정).

## 2. 런처 계산 규칙 (확정 근거)
| 근거 | 내용 |
|---|---|
| Xiaomi 공식 문서(dev.mi.com HyperOS 문서 pId=1510) | 「角标的数字代表应用的通知数」— 아이콘 숫자 = 앱 알림 수 · 제외는 **진행률 표시형·상주(常驻) 알림뿐** · MIUI 12 이후 알림별 숫자는 `Notification.number`(`setNumber`) · 채널 배지 설정 언급 없음 |
| 같은 기기 다른 앱(직접) | Chrome 의 유일한 알림은 채널·알림 모두 배지 표시 **꺼짐**(`channel=browser` `mShowBadge=false`) — 그런데 Chrome 아이콘 숫자 **1** (`1-home-now.png` 독) → 이 런처는 채널 배지 설정을 따르지 않음 |
| 이 기기 시스템 로그(직접) | 런처가 `NotificationProvider call method=canShowBadge extras={package=com.dibay.app}` — **앱 단위**로 묻는다(채널 단위 아님) |
| AOSP 기본 런처(Launcher3 원본) | 알림 1장당 `count = Math.max(1, notif.number)` 를 앱 전체로 합산(`NotificationKeyData.java:51`, `DotInfo` 합계) |

정리: 숫자 표시 런처는 **「앱 알림마다 max(1, number) 를 더한 값」** 을 보여 준다. DIBAY 는 요약 카드 `number=서버 총수` + 일반 알림 장수(각 1) → **서버 총수 + 알림창의 일반 알림 장수**가 된다(10-28 43+1=44, 오늘 60+1=61 모두 일치).

## 3. 10-28 수정안 A(일반 알림 채널 배지 끄기) — **효과 없음으로 판정, 채택 안 함**
Xiaomi 문서에 채널 제외 규칙이 없고, 같은 기기에서 배지 꺼진 채널 알림(Chrome)이 숫자로 세어졌다(§2). 이 안으로 구현했다면 채널 8개 이전·회원 채널 설정 초기화만 생기고 숫자는 그대로였다.

## 4. 수정 설계 (네이티브 · 제조사 분기 없음 — 위 공통 규칙만 사용)
요약 카드 숫자 = **서버 총수 − 알림창에 있는 DIBAY 일반 알림의 숫자 합**(각 `max(1, number)`, 요약 카드 자신 제외). 숫자 표시 런처가 더한 결과 = 서버 총수.
| # | 바꾸는 곳 | 내용 |
|---|---|---|
| X-1 | `DibayAppIconDeliveryAdapter.apply(total)` | `NotificationManager.getActiveNotifications()` 로 DIBAY 알림(710001 제외)의 `max(1, number)` 합 `k` 계산 → 요약 카드 `setNumber(max(0, total − k))`. `total − k ≤ 0` 이면 요약 카드를 지운다(일반 알림만으로 이미 `total` 이상 — 이때 표시값 = k). 런처 숫자 저장소(ShortcutBadger) 값은 **total 그대로**(Samsung 은 저장소 값 우선 — 10-28 로그) |
| X-2 | 일반 알림을 회원이 밀어서 지울 때 | 지금 `deleteIntent` 없음(덤프 `deleteIntent=null`) → 앱이 모름 → 지운 만큼 숫자가 작아진 채 남음. 일반 알림에 `deleteIntent`(앱 내부 브로드캐스트, 서버 호출 없음)를 달아 지워지면 마지막 `total` 로 X-1 다시 계산 |
| X-3 | 일반 알림을 탭해 열 때 | 알림 자동 지움 → 앱 열림 → 웹 배지 동기화가 `apply(total)` 호출 → X-1 재계산(기존 경로, 추가 코드 없음) |
| X-4 | 계약 테스트 | `android-app-icon-summary-carrier-contract.test.ts` 의 금지어(`notificationCount`·`total /`)·「요약 카드 단일 운반」 규칙과 충돌 — 규칙 문구를 「요약 카드 숫자 = 총수 − 알림창 일반 알림 합(제조사 분기 금지 유지)」으로 개정 필요 |

## 5. Owner 결정 필요 (규정 7 — 임의 선택 안 함)
- 10-28 결정: 「알림창 알림 수를 빼는 안(B)」은 계약 위반·불안정으로 **채택 안 함**이었다. 이번 실기로 그 대신 고른 안 A 가 효과 없음이 확정됐다. 숫자를 맞추려면 X-1~X-4(= B 의 제조사 분기 없는 형태)가 필요하고, 이는 10-28 결정·계약 테스트를 바꾼다.
- 바꾸지 않으면: Xiaomi 등 숫자 표시 런처에서 아이콘 숫자 = 서버 총수 + 알림창에 남은 DIBAY 일반 알림 장수(열거나 지우면 맞아짐). Samsung 은 영향 없음.

## 6. 검증 계획 (승인 후)
1. Android 단위 테스트: 일반 알림 0·1·3장, `number` 있는 알림, `total ≤ k`, 지움 후 재계산.
2. 바꾼 파일을 읽는 테스트 전부 · Android 전체 · 빌드 번호 검사 PASS 후 `versionCode 37` 과 1회 푸시.
3. 실기(작업자 직접, A·B): 공지 1장 받은 상태 아이콘 = 서버 총수 → 그 알림 밀어서 지움 → 아이콘 = 서버 총수 → 알림 탭해 열기 → 아이콘 = 서버 총수 −1(읽음 반영). Samsung 은 매 단계 저장소 값 = 서버 총수.

Sources: [Xiaomi HyperOS 문서 — 桌面角标](https://dev.mi.com/xiaomihyperos/documentation/detail?pId=1510) · [AOSP Launcher3 NotificationKeyData.java](https://android.googlesource.com/platform/packages/apps/Launcher3/+/refs/heads/main/src/com/android/launcher3/notification/NotificationKeyData.java) · [AOSP Launcher3 DotInfo.java](https://android.googlesource.com/platform/packages/apps/Launcher3/+/refs/heads/main/src/com/android/launcher3/dot/DotInfo.java)
