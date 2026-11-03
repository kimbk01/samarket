# 빌드 35 회귀 — 요약 카드가 「너무 오래된 알림」으로 거부됨 · 원인·수정 설계 v4 (2026-11-04 · 승인 요청)

> 보고·설계. 코드·DB·기기 변경 없음. 대상 빌드 `1.2.5 (35)`(main `f6aa4932b`) — 운영 DB 기준 설치 기기 = 시험 기기 A(zxzx11)·B(q테스트1) 2대뿐. 회원 영향 없음(스토어 미출시).

## 0. 작업자 잘못 (먼저)
- v3 설계에 「모든 줄 확인」이라고 썼지만, Android 가 **알림 게시 단계에서 오래된 `when` 을 거부하는 규칙**을 확인하지 않았다. 그 결과 `setWhen(1L)` 로 요약 카드 게시가 **전부 거부**됐다(회귀).
- Cursor 판정 「첫 화면 PASS」는 수정이 동작해서가 아니라 **요약 카드가 아예 없어서** 나온 결과다 — 수정 효과의 증거가 아니다.

## 1. 확인한 사실
| # | 사실 | 근거 |
|---|---|---|
| R1 | Samsung B 시스템 로그 `NotificationService: Ignored enqueue for old 1 notification 0\|com.dibay.app\|710001` (06:53:21·06:53:43) — 앱 로그는 `summary_applied` 를 남겼지만 시스템이 버림 | `evidence/android-35-summary-2026-11-04/logcat/B-v35-full.log` |
| R2 | Xiaomi A 도 같은 로그(06:52:11·06:53:43) | `A-v35-full.log` |
| R3 | 발송 +20초 덤프에 A·B 모두 요약 카드(710001) 없음, 캠페인 카드만 | `dumpsys/v35-A.txt`·`v35-B.txt` |
| R4 | Android 원본 규칙: `if (Flags.rejectOldNotifications() && n.hasAppProvidedWhen() && n.getWhen() > 0 && (System.currentTimeMillis() - n.getWhen()) > NOTIFICATION_MAX_AGE_AT_POST)` → 거부 · `NOTIFICATION_MAX_AGE_AT_POST = Duration.ofDays(14)` · 이 검사는 **모든 게시(갱신 포함)** 에서 실행 | AOSP `NotificationManagerService.java:620`, `8782-8786`(main, 직접 내려받아 확인) |
| R5 | 지금 A·B 영향: 요약 카드 숫자 경로가 막힘. B(Samsung)는 런처 숫자 저장소(`launcher_provider_applied … ok=true`)로 숫자 전달은 계속됨. A(Xiaomi)는 저장소 `ok=false` 라 요약 카드가 유일한 숫자 경로였음 | `A/B-v35-full.log` · 실기 v3 로그 |
| R6 | v3 의 순서 근거(시각 순서 정렬 · 앱 지정 `when` = 순서 시각 · 묶음 앞면 = 1위)는 그대로 유효 | v3 설계 §1 E3~E11 |

## 2. 원인
`when=1`(1970년)은 Android 의 「14일보다 오래된 앱 지정 시각」 거부 조건(R4)에 걸려 요약 카드가 게시되지 않았다.

## 3. 수정 (네이티브 1파일)
`DibayAppIconDeliveryAdapter.postOrUpdateSummary`:
- `setWhen(1L)` → `setWhen(System.currentTimeMillis() - SUMMARY_RANKING_AGE_MS)` · `SUMMARY_RANKING_AGE_MS = 13일`(밀리초). 게시할 때마다 다시 계산.
- `setShowWhen(false)` 유지 · 그 밖 변경 없음.

조건 검증(R4·v3 E6·E7):
| 조건 | 값 | 결과 |
|---|---|---|
| 앱 지정 판정 `when != 0 && when != creationTime` | 13일 전 ≠ 생성 시각 | 앱 지정 → 순서 시각 = 13일 전 |
| 거부 조건 `now - when > 14일` | 13일 | **거부 안 됨** |
| 순서 시각 ≤ 게시 시각 | 13일 전 ≤ 지금 | 유효 |

동작:
- 새 알림이 오면(= 일반 카드 `when` ≈ 지금) 요약 카드(13일 전)는 항상 그보다 오래됨 → 묶음 앞면 = 최신 실제 알림.
- 요약 카드가 앞면이 되는 경우는 하나뿐: 알림창에 남은 DIBAY 실제 알림이 **모두 13일보다 오래됐을 때**(그 사이 새 알림 0건). 그때도 요약 카드는 게시되고 숫자는 전달된다.
- 앱 아이콘 숫자: 요약 카드가 다시 게시되므로 A(Xiaomi) 숫자 경로 복구 · B 는 저장소 경로 유지.

## 4. 반영·검증
1. 구현 + 단위 테스트(요약 카드 `when` 이 「지금-14일」 보다 늦고 「지금-12일」 보다 이르다 · `showWhen=false` · `number` 유지). 주석에 제조사 이름 쓰지 않음(계약 테스트).
2. 로컬: Android 단위 테스트 전체 · 앱 아이콘 계약 vitest · 빌드 번호 검사 `RELEASE READY` 확인 **후에만** 푸시 → `versionCode 36` 을 기능 커밋과 같은 푸시.
3. Cursor: 빌드(`google-services.json`·`key.properties`·`local.properties` 를 빌드 폴더에 먼저 확인 — 35 때 누락) → A·B 설치 → 백그라운드 공지 1회.
4. PASS 조건: 시스템 로그에 `Ignored enqueue for old … 710001` **없음** · 덤프에 요약 카드 있음, `when`≈13일 전, 같은 묶음 안 순위가 캠페인보다 뒤 · 알림창 첫 화면 앞면 = 실제 제목 · 앱 아이콘 숫자 = `summary_applied total`.

## 5. 승인 요청
수정 v4 구현 + `versionCode 36` 설치 빌드.
