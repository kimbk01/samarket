# Android 알림이 「읽지 않은 알림 N개」 밑으로 접히는 결함 — 수정 설계안 v3 (2026-11-04 · 승인 요청)

> 설계 보고. 코드·DB·기기 변경 없음. v1(기기별 요약 카드 제거)·v2(근거 일부 추정) **철회**.
> 이 문서의 모든 줄은 아래 증거로 직접 확인했다: 실기 v3 Samsung 덤프·로그(Production `8671c2f75`, 앱 1.2.5 (32)) · Android 원본 코드(AOSP main · 로컬 SDK `android-36.1` 소스) · androidx core 1.17.0 원본(우리 앱 버전) · 우리 코드.

## 0. 작업자 잘못 (먼저)
- 10-29 같은 증상을 화면만 보고 두 번 고침(`70dadb078`, `a214ecc12`) → 빌드 32 재발.
- 이번 설계도 v1·v2 를 확인 없이 보고했다. v3 는 추정 0 — 증거 표(§1)에 없는 내용은 쓰지 않았다.

## 1. 증거
| # | 확인한 사실 | 근거 (위치) |
|---|---|---|
| E1 | 캠페인 카드는 0.37초 만에 도착·게시됨 | B logcat `05:25:09.427 [fcm] message_received` · `05:25:09.483 native_notification_posted … title=[실기v3] V-1` |
| E2 | 시스템이 DIBAY 요약 카드(id 710001)와 캠페인 카드를 한 시스템 묶음 `g:Aggregate_NormalNotificationSection` 으로 합침 | B dumpsys +30s 3행(`AUTOGROUP_SUMMARY`) · 91행(요약 카드 groupKey) · 176행(캠페인 groupKey) |
| E3 | **이 기기의 정렬 = 시각 순서 방식**(`sortSectionByTime` 켜짐) | 같은 dumpsys `mGlobalSortKey=…:intrsv=2:…` — AOSP `RankingHelper.sort` 에서 `intrsv=2` 는 이 설정이 켜졌을 때만 나옴 |
| E4 | 묶음 안 순서: 1위 요약 카드(순서 시각 05:25:09.475, 중요도 2) · 2위 캠페인 카드(05:25:08.770, 중요도 4) — **중요도가 높은 캠페인이 아래** = 시각만으로 정렬 | dumpsys 143·144행(`rnk=0x0001`, `mRankingTimeMs=…109475`) · 233·234행(`rnk=0x0002`, `…108770`) |
| E5 | 시각 순서 비교 규칙 = 순서 시각만 비교, 최신이 위 | AOSP `NotificationTimeComparator.compare`: `return -1 * Long.compare(left.getRankingTimeMs(), right.getRankingTimeMs());` |
| E6 | 순서 시각 = 앱이 지정한 `when` 이 유효하면 그 값, 아니면 게시 시각(업데이트 때도 유효한 `when` 우선) | AOSP `NotificationRecord.calculateRankingTimeMs`: `if (n.hasAppProvidedWhen() && n.getWhen() <= getSbn().getPostTime()) return n.getWhen();` → 아니면 이전 값/게시 시각 |
| E7 | 「앱이 지정한 when」 판정 = `when != 0 && when != creationTime` · `creationTime` 은 알림 객체 생성 시각 · `build()` 는 `when` 을 바꾸지 않음 | SDK `android-36.1` `Notification.java:4584-4586`(hasAppProvidedWhen) · `2826-2827`(생성자) · `5028-5031`(setWhen) |
| E8 | 우리 요약 카드는 `when` 을 지정하지 않음 → androidx 가 생성 시각을 넣고 기본 빌더 생성 시각과 같아 「앱 지정 아님」 → 순서 시각 = 게시 시각(09.475, `when` 09.473 과 다름) | 우리 `DibayAppIconDeliveryAdapter.java:164-180`(setWhen 없음) · androidx core 1.17.0 `NotificationCompat.java:1340`(`mNotification.when = System.currentTimeMillis()`) · `NotificationCompatBuilder.java:79`(`mBuilder.setWhen(n.when)`) · dumpsys 87·144행 |
| E9 | 요약 카드는 일반 알림을 띄운 **직후** 다시 게시됨 → 항상 게시 시각이 가장 늦음 | `DibayFirebaseMessagingService.java:425-427`(notify 후 `onDomainNotificationPosted`) · B logcat 같은 ms(.483) |
| E10 | 일반 알림 카드는 자기 발생 시각을 `when` 으로 지정 → 순서 시각 = 그 시각 | `DibayNotificationPresentation.java:97-98` · dumpsys 234행(`108770` = `when`) |
| E11 | 접힌 묶음 앞면 = 묶음 안 1위 알림. DIBAY 묶음 앞면 「읽지 않은 알림 N개」 = 1위 요약 카드(E4) · 같은 기기 Play 스토어 묶음 앞면 「(광고) PHP 20 할인…」 = 그 묶음의 가장 최신 알림 | B 알림창 캡처(`B-v1-+30s-shade.png`, v2 `B-s1-shade.png`) · dumpsys Play 스토어 레코드 `when` |
| E12 | 앱 아이콘 숫자는 요약 카드 `setNumber` + 런처 숫자 저장소(ShortcutBadger)로 전달 · Samsung 런처는 저장소 값을 우선 표시 | `DibayAppIconDeliveryAdapter.apply` · 10-28 HoneySpace 로그(`notification-b1-samsung-launcher-badge-plan-2026-10-28.md` §1) · B logcat `launcher_provider_applied total=52 ok=true` |

## 2. 원인 (E3·E4·E5·E6·E8·E9·E11)
이 기기는 묶음 안 알림을 **시각 순서로만** 정렬한다. 요약 카드는 `when` 을 지정하지 않아 순서 시각이 「게시 시각」이 되고, 일반 알림 직후 매번 다시 게시되므로 **항상 1위**가 된다. 접힌 묶음 앞면은 1위 알림이라 회원은 「읽지 않은 알림 N개」만 본다. (여러 알림이 한 묶음에 들어가는 것 자체는 OS 기본 동작 — Play 스토어도 동일.)

## 3. 수정 (네이티브 1파일 · 2줄)
`android/app/src/main/java/com/dibay/app/DibayAppIconDeliveryAdapter.java` `postOrUpdateSummary` 의 빌더에 추가:
```java
.setWhen(1L)          // 순서 시각 고정(과거) — E6·E7: 1 ≠ 0, 1 ≠ 생성 시각 → 앱 지정, 1 ≤ 게시 시각 → 순서 시각 = 1
.setShowWhen(false)   // 고정 시각을 화면에 표시하지 않음
```
그 밖(채널·묶음 키·숫자·탭 이동·자동 지움 안 함·소리 없음·게시 순서) 변경 없음.

## 4. 수정 후 동작 (근거로 도출)
| 항목 | 결과 | 근거 |
|---|---|---|
| Samsung(시각 순서 기기) 묶음 앞면 | 최신 실제 알림 · 요약 카드는 맨 아래 | E5(최신 위) + 요약 순서 시각 1(E6·E7) + 실제 알림 = 발생 시각(E10) |
| 이미 쌓인 묶음 | 다음 요약 카드 갱신 때 바로 맨 아래로 | E6: 업데이트 때도 유효한 `when` 이 이전 순서 시각보다 우선 |
| 중요도 순서 기기(설정 꺼짐) | 지금도 캠페인(중요도 4)이 요약 카드(2)보다 위 → 수정 후도 같음(같은 중요도끼리는 시각 비교에서 요약 카드가 아래) | AOSP `NotificationComparator`: 중요도 구간·중요도가 시각보다 먼저 |
| 앱 아이콘 숫자 | 변경 없음 | 숫자 코드 무변경(E12) — `when`·`showWhen` 은 숫자와 무관 |
| 소리·진동·통화 | 변경 없음 | `setSilent(true)`·`setOnlyAlertOnce(true)` 유지 · 통화 경로는 요약 카드 갱신을 호출하지 않음 |

## 5. 반영·검증 (승인 후)
1. 구현 1파일 + Android 단위 테스트(빌드된 요약 카드 `when == 1` · `EXTRA_SHOW_WHEN == false`).
2. 네이티브 → `versionCode` 1회 증가. 현재 main `versionCode 33`(다른 세션 Android 업데이트 작업이 올림, 아직 설치 빌드 전) → **같은 설치 빌드에 함께**, 번호 추가 증가 없음(그 세션과 순서 맞춤).
3. `npm run native:prepare` 성공 후 APK → A·B USB 직접 설치(기기 사용 승인 필요).
4. 실기 1회(Cursor 프롬프트, 녹화는 기기 안 분리 실행): A·B 백그라운드 공지 1건 → 알림창 첫 화면 묶음 앞면 = `[실기]` 제목 · dumpsys 요약 카드 `mRankingTimeMs=1`·`rnk` 맨 끝 · 앱 아이콘 숫자 = 서버 숫자.

## 6. 승인 요청
- 구현 + Android 설치 빌드(번호는 다른 세션 33 과 같은 빌드) 승인.
- Owner 결정 R-2(요약 카드 구조 유지)와 충돌 없음 — 구조·숫자 전달은 그대로, 표시 순서만 바꿈.

Sources: [AOSP RankingHelper.java](https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/services/core/java/com/android/server/notification/RankingHelper.java) · [AOSP NotificationTimeComparator.java](https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/services/core/java/com/android/server/notification/NotificationTimeComparator.java) · [AOSP NotificationRecord.java](https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/services/core/java/com/android/server/notification/NotificationRecord.java) · [AOSP NotificationComparator.java](https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/services/core/java/com/android/server/notification/NotificationComparator.java) · [AOSP GroupHelper.java](https://android.googlesource.com/platform/frameworks/base/+/refs/heads/main/services/core/java/com/android/server/notification/GroupHelper.java)
