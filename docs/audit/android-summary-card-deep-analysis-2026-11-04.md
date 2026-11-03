# Android 요약 카드 — 처음부터 다시 한 철저 분석 · 수정 설계 v4 확정본 (2026-11-04 · 승인 요청)

> 분석 보고. 코드·DB·기기 변경 없음.
> 방법: Android 알림 서버 원본(AOSP main `NotificationManagerService`·`NotificationRecord`·`RankingHelper`·`NotificationTimeComparator`·`NotificationComparator`·`GroupHelper`·`NotificationAttentionHelper` — 직접 내려받아 전문 검색), SDK `android-36.1` `Notification.java`, androidx core 1.17.0 원본, 우리 앱 Android 전체 알림 게시 코드, 실기 v3·v35 기기 덤프·시스템 로그를 **한 줄씩 대조**.

---

## 0. 작업자 잘못 — 왜 같은 실수가 반복됐나 (먼저)
| # | 반복된 실수 | 실제 원인 | 이번부터 바꾸는 방식 |
|---|---|---|---|
| W-1 | 10-29 묶음 수정 2회 · v1·v2·v3 설계 모두 일부만 확인 | 문제와 **직접 닿는 규칙 하나**(정렬 또는 묶음)만 찾고, 같은 값(`when`)이 쓰이는 **다른 단계(게시 거부)** 를 찾지 않았다 | 바꾸는 값이 Android 원본 어디에서 쓰이는지 **전부 검색**해 표로 대조(§2) |
| W-2 | 단위 테스트 통과를 근거로 「확인」 보고 | 단위 테스트(Robolectric)는 Android 서버의 게시 거부·정렬을 재현하지 않는다 | 네이티브 알림 변경의 PASS 는 **기기 시스템 로그·덤프**로만 |
| W-3 | 주석에 제조사 이름 → CI 실패 | 바꾼 파일을 읽는 계약 테스트를 다 돌리지 않았다 | 바꾼 파일 이름으로 테스트를 검색해 **전부** 실행 |
| W-4 | 빌드 번호 검사 FAIL 확인 전 푸시 → 35 | 검사와 푸시를 한 명령에 묶었다 | 검사 `RELEASE READY` 확인 **후에만** 푸시 |
| W-5 | 35 첫 APK 실행 즉시 종료 | 빌드 폴더에 `google-services.json` 등 비공개 설정 파일이 없는데 빌드 준비(`native:prepare`)가 확인하지 않음 · 프롬프트도 확인 안 시킴 | §4 P-1 |
| W-6 | Cursor 「첫 화면 PASS」를 바로 믿을 뻔함 | 요약 카드가 **없어서** 생긴 결과였다 | PASS 조건에 「요약 카드가 실제로 있음 + 거부 로그 없음」을 함께 둔다 |

## 1. 문제 정의 (증거)
| # | 사실 | 근거 |
|---|---|---|
| S-1 | 빌드 32: 시스템 묶음 앞면이 요약 카드 「읽지 않은 알림 N개」 → 실제 알림은 펼쳐야 보임 | 실기 v3 B 덤프·캡처 |
| S-2 | 원인: 시각 순서 정렬 기기에서 요약 카드는 `when` 미지정 → 순서 시각 = 게시 시각 → 일반 알림 직후 매번 다시 게시돼 항상 1위 = 앞면 | v3 덤프 `intrsv=2` · `mRankingTimeMs` 09.475(요약) > 08.770(캠페인) · 설계 v3 §1 |
| S-3 | 빌드 35: `when=1` → 「14일보다 오래된 앱 지정 시각」으로 **게시 거부** | A·B 시스템 로그 `Ignored enqueue for old 1 notification …\|710001` · AOSP `NotificationManagerService.java:8782-8786` |
| S-4 | 35 설치 기기 = 시험 기기 A·B 2대 | 운영 DB `user_devices` |

## 2. `when` 이 쓰이는 Android 원본 위치 — 전수 (이번에 빠짐없이 검색)
| 위치 | 하는 일 | v4(`지금 − 13일`) 판정 |
|---|---|---|
| `NotificationManagerService.java:8782` 게시 거부 | 앱 지정 `when` 이 14일(`NOTIFICATION_MAX_AGE_AT_POST`, 620행)보다 오래되면 거부 · **갱신도 포함** | 13일 < 14일 → **통과** (게시할 때마다 다시 계산) |
| `NotificationRecord.java:1126-1131` 순서 시각 | 앱 지정 `when` ≤ 게시 시각이면 그 값 | 13일 전 ≤ 지금 → 순서 시각 = 13일 전 |
| `Notification.hasAppProvidedWhen` (SDK 4584) | `when != 0 && when != creationTime` | 13일 전 ≠ 생성 시각 → 앱 지정 |
| `Notification.getWhen` (SDK 8449) | `when==0` 이면 생성 시각 | 해당 없음 |
| `NotificationAttentionHelper.java:1657` 몰림(avalanche) 예외 | **대화형 알림만** `when` 비교 | 요약 카드는 대화형 아님 · 소리 없음 → 무관 |
| `NotificationTimeComparator` | 순서 시각만 비교, 최신 위 | 요약 카드는 13일 전 → 새 알림보다 아래 |
| `NotificationComparator`(정렬 설정 꺼진 기기) | 중요도 구간 → 중요도 → … → 순서 시각 | 요약(중요도 2) < 일반 알림(4) → 원래도 아래, 변화 없음 |
| `RankingHelper.sort` | 묶음 순위 = 묶음 안 1위의 순위 · 묶음 안 순서 = 개별 순위 | 1위 = 최신 실제 알림 |
| `GroupHelper` | 묶음 판단은 묶음 키·개수 기준 — `when` 안 씀 | 무관(묶이는 것은 OS 기본) |

게시 거부 규칙 전체(같은 함수 `checkDisqualifyingFeatures`, 8652행~)도 대조:
| 거부 규칙 | 요약 카드 해당 여부 |
|---|---|
| 갱신이 초당 5건 초과(`DEFAULT_MAX_NOTIFICATION_ENQUEUE_RATE = 5f`, 427행) | 기존 동작과 같음(v4 가 갱신 횟수를 바꾸지 않음) · 증거 폴더 기기 로그 「Package enqueue rate」 0건 |
| 앱당 50건(`MAX_PACKAGE_NOTIFICATIONS`, 426행) | 갱신이라 개수 늘지 않음 |
| 다시 알림 대기·알림 차단 | 기존과 같음 |
| 14일보다 오래된 시각 | §2 첫 줄 — 통과 |

## 3. 우리 앱 알림 게시 경로 전수 (Android)
| 경로 | `when` | v4 영향 |
|---|---|---|
| 요약 카드 `DibayAppIconDeliveryAdapter` | v4: 지금 − 13일 | 수정 대상 |
| 일반 알림 `DibayFirebaseMessagingService` → `DibayNotificationPresentation.apply` | 서버 `createdAt`(= 발생 시각, `fcm-data-payload-contract.ts:234`) · 없으면 지금 | 변경 없음 |
| 이미지 붙여 다시 게시(같은 id, 같은 빌더) | 위와 같음 | 변경 없음 |
| 부재중·통화 알림(`MissedCallNotificationHelper`, `IncomingCallNotificationBuilder`, 음성·영상 통화) | `when` 미지정 | 변경 없음(통화 파일 무수정) |

v4 동작(규칙으로 도출):
1. 새 알림(발생 시각 ≈ 지금)이 오면 요약 카드(13일 전)보다 항상 최신 → **묶음 앞면 = 실제 알림**.
2. 요약 카드가 다시 게시돼 **숫자 전달 복구**(35 에서 끊긴 Xiaomi 경로 포함).
3. 요약 카드가 앞면이 되는 경우 = 알림창에 남은 DIBAY 실제 알림이 **모두 발생 13일보다 오래됐을 때**뿐(그때도 숫자 전달은 정상).
4. 요약 카드 혼자 있을 때 알림창 안 위치: 시각 순서 기기에서 다른 앱 알림보다 아래(13일 전). 지금은 맨 위 근처 — **표시 위치가 바뀐다**(숫자·탭 동작은 동일).

함께 발견한 기존 동작(이번 변경과 무관 · 보고만): 서버 발생 시각이 14일보다 오래된 일반 알림(예: 기기가 14일 넘게 꺼져 있다 받은 FCM — FCM 기본 보관 4주)은 같은 규칙(S-3)으로 기기가 게시를 거부한다.

## 4. 빌드·검증 절차 결함과 수정
| # | 결함 | 수정 |
|---|---|---|
| P-1 | `native:prepare` 가 서명·Firebase 설정 파일(`android/app/google-services.json`, `android/key.properties`, `android/local.properties`) 존재를 확인하지 않음 → 35 첫 APK 실행 즉시 종료 | `scripts/native-prepare.mjs` Android 단계에 세 파일 존재 확인 → 없으면 STOP(값은 읽지·출력하지 않음) |
| P-2 | 프롬프트의 PASS 조건이 「요약 카드 없음」을 걸러내지 못함 | v4 실기 PASS = ① 시스템 로그 `Ignored enqueue for old … 710001` 없음 ② 덤프에 요약 카드 있음·`when`≈13일 전 ③ 같은 묶음 안 요약 카드 순위가 캠페인보다 뒤 ④ 알림창 첫 화면 앞면 = 실제 제목 ⑤ 아이콘 숫자 = `summary_applied total` (Xiaomi 포함) |
| P-3 | 로컬 검증 범위 | 바꾼 네이티브 파일 이름으로 vitest·Android 테스트 검색 → 전부 실행 · Android 전체 단위 테스트(통화 3건 기존 실패는 변경 전 커밋에서 같은 결과임을 다시 대조) · 빌드 번호 검사 `RELEASE READY` 후 푸시 |

## 5. 수정 내용 (승인 요청)
1. `DibayAppIconDeliveryAdapter.postOrUpdateSummary`: `setWhen(System.currentTimeMillis() - 13일)` (게시마다 계산) · `setShowWhen(false)` 유지 · 주석에 제조사 이름 없음.
2. 단위 테스트: `when` 이 (지금−14일, 지금−12일) 사이 · `showWhen=false` · `number` 유지 · 갱신 후에도 범위 유지.
3. `scripts/native-prepare.mjs`: P-1 파일 확인.
4. `versionCode 36` — 1·3 과 같은 푸시(검사 PASS 후).
5. Cursor 프롬프트(빌드 전 파일 확인 · P-2 PASS 조건 · 녹화 기기 안 분리 실행 · 거부 로그 검색).

Sources: [AOSP NotificationManagerService.java](https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/services/core/java/com/android/server/notification/NotificationManagerService.java) · [AOSP NotificationRecord.java](https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/services/core/java/com/android/server/notification/NotificationRecord.java) · [AOSP RankingHelper.java](https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/services/core/java/com/android/server/notification/RankingHelper.java) · [AOSP NotificationTimeComparator.java](https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/services/core/java/com/android/server/notification/NotificationTimeComparator.java) · [AOSP NotificationComparator.java](https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/services/core/java/com/android/server/notification/NotificationComparator.java) · [AOSP GroupHelper.java](https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/services/core/java/com/android/server/notification/GroupHelper.java) · [AOSP NotificationAttentionHelper.java](https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/services/core/java/com/android/server/notification/NotificationAttentionHelper.java)
