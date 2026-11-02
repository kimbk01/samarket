# 푸시 전용 알림 열람 기록 — 설계안 (2026-11-02 · 보고만, 승인 후 구현)

## 0. 결함 (FAIL · 운영 증거)
- 운영 2026-11-02, 「실기13」(5d59f734)과 다시 보낸 「실기13」(43440c34) 모두 채널은 푸시 전용(push_only)이고, 시험 계정 2명에게 보냈다.
- 두 기기에서 모두 알림을 눌렀고 지정 공지 글이 열렸다(Samsung 05:36, Xiaomi 05:38 PHT · 화면 확인).
- 그런데 `notification_campaign_deliveries.opened_at`은 4행 모두 비어 있다. 관리자 「열람」도 0이다.
- 운영 집계: 보낸 푸시 전용 캠페인 2건, 푸시 기록 4행 전부 `notification_event_id = null`. 이 경로로 열람이 기록된 적이 한 번도 없다.

## 1. 원인 (코드)
| 단계 | 사실 | 위치 |
|---|---|---|
| 발송 | 푸시 전용은 앱 안 알림 행을 만들지 않아 알림 id 가 없다. 푸시 데이터에 `notification_event_id` 도 없다. | `campaign-notification-presentation.ts:137-140, 188-205` · `campaign-send-user.ts:228` |
| 탭 기록 | 열람 기록은 알림 id 로만 한다(`markCampaignDeliveryOpened(notificationEventId)`). | `campaign-delivery-recorder.ts:248-257` · `app/api/me/notifications/read/route.ts:77` |
| 탭 전달 | Android 네이티브 탭은 웹에 `{경로, 알림 id}` 만 넘긴다. 캠페인 id 는 넘기지 않는다. | `PushRouteListener.tsx:103-111` 주석(F2) |

결론: 푸시 전용 알림은 어느 기기에서 눌러도 서버가 「누가 어떤 발송을 열었는지」 알 방법이 없다.

## 2. 설계 — 목적지 주소에 회차 표시를 싣는다 (웹·서버만)
목적지 주소는 모든 경로가 쿼리까지 그대로 연다. 이 성질을 이용한다.
- Android 32: `FcmPayloadResolver.safeInternalRoute` 가 `?…` 보존.
- iOS·웹: `resolveSafeNotificationInternalRoute` 가 `pathname + search` 보존.

1. **발송 (`buildAdminCampaignNotificationPresentation`)**
   - 앱 안 행이 없는 실발송(푸시 전용)만 대상이다.
   - 푸시 목적지(`targetApprovedRoute`·`link_url`)에 `notif_open=<회차 id>` 를 붙인다.
   - 앱 안 행이 있는 발송·미리보기·테스트 발송은 바꾸지 않는다(이미 알림 id 로 기록되거나 기록 대상이 아님).
   - `campaign-send-user.ts` 가 이미 가진 `occurrenceId` 를 넘긴다.
2. **열람 API (새 `POST /api/me/notifications/campaign-push-opened` `{ occurrence_id }`)**
   - 로그인 회원 본인만 처리한다.
   - 대상 행: 그 회차(`occurrence_id`)·본인(`user_id`)·`channel='push'`·`status='sent'` 행만 `opened`·`opened_at` 으로 바꾼다.
   - 본인에게 간 행이 없으면 아무것도 쓰지 않는다. 남의 회차 id 로는 바뀌지 않는다.
   - 같은 요청을 다시 보내도 결과가 같다(이미 opened 면 그대로).
   - 회원 변경 API 등록부(`member-consent-mutation-policy.ts` `mark_read`)·분류 표(fixture csv)에 추가한다.
3. **앱 (`NotificationRouteReadSync`, 모든 화면에 이미 있는 전역 동기화)**
   - 주소에 `notif_open` 이 있으면 위 API 를 1번 부른다(같은 값은 한 번만).
   - 그다음 주소에서 `notif_open` 만 지운다(`router.replace`, 화면·스크롤 그대로).
   - 실패해도 화면 이동에는 영향이 없다.

### 숫자 정의 (바뀌는 점)
- 「열람」 = 회원 단위다. 기기 여러 대 중 하나를 눌러도 그 회원의 푸시 행 전부를 opened 로 한다.
  - 목록·받은 사람 숫자가 이미 회원 단위(`memberOutcomes`)라 기준이 같다.
  - 어느 기기에서 눌렀는지는 남지 않는다(푸시 데이터에 기기 표시가 없음 — 기기별로 남기려면 네이티브 변경이 필요해 이번 범위 밖).
- 「푸시 성공」은 그대로다(sent·opened 둘 다 성공).

## 3. 영향 범위
| 경로 | 영향 |
|---|---|
| Android 1.2.5 (32)·이후 | 기록됨 (지정 목적지로 열고 쿼리 보존) |
| Android ≤ 31 | **기록 안 됨** — 이 빌드는 푸시 전용 공지·시스템을 목록(`/notifications`)으로 연다(N1 이전). 마케팅 푸시 전용은 지정 목적지로 열어 기록됨(코드 확인 필요 → 구현 때 테스트로 고정) |
| iOS 1.2 (21) | 기록됨 (웹 해석기) |
| 앱 실행 중 받은 푸시 전용 | 시스템 알림으로 표시 → 누르면 같은 경로로 기록 |
| 앱 안 행 있는 발송(푸시+알림함) | 변경 없음 |
| 주소를 공유·북마크 | 쿼리가 화면에 남지 않게 바로 지운다. 남의 회차 id 로는 기록되지 않는다 |
| 운영 DB | 구조 변경 없음 · 마이그레이션 없음. 과거 4행은 그대로(되돌려 채우지 않음) |
| 통화·메신저 | 무관 |

## 4. 바뀌는 파일
- `lib/admin/notification-campaigns/campaign-notification-presentation.ts`: 푸시 전용 목적지에 `notif_open`
- `lib/admin/notification-campaigns/campaign-send-user.ts`: `occurrenceId` 전달
- `lib/admin/notification-campaigns/campaign-delivery-recorder.ts`: `markCampaignPushOpenedByOccurrence(svc, occurrenceId, userId)`
- `app/api/me/notifications/campaign-push-opened/route.ts` (새)
- `components/push/NotificationRouteReadSync.tsx`: 쿼리 처리
- `lib/auth/member-consent-mutation-policy.ts` · `lib/auth/__fixtures__/member-p0-mutation-classification.csv`
- 테스트
  - 푸시 전용만 쿼리가 붙는다.
  - API 는 본인 행만 바꾼다.
  - Android 마케팅·공지·시스템 해석 결과 주소에 쿼리가 남는다.
  - 화면이 쿼리를 지운다.

## 5. 검증
- 코드: typecheck build·test · 관련 vitest · eslint · `npm run build`(새 API).
- 실기(시험 계정 2명, Android 32 · 별도 승인 범위 = 이번 승인):
  - 푸시 전용 공지 1건 발송 → 두 기기에서 탭.
  - `opened_at` 이 PHT 탭 시각과 맞는지 운영 DB 로 확인한다.
  - 관리자 목록 「열람」이 2 가 되는지 확인한다(1440px 화면).
  - iPhone(w테스트1 · 1.2 (21))은 Mac 「iPhone 미러링」으로 실기한다.

## 6. 배포 구분
웹만(앱 재시작). 네이티브 변경·빌드 없음.

## 7. 하지 않는 것 (근거)
- **네이티브가 캠페인 id 를 웹에 넘기게 바꾸기**: 새 빌드가 필요하고 설치된 빌드에는 효과가 없다. 위 방식은 웹만으로 Android 32·iOS 를 모두 덮는다.
- **푸시 전용도 숨은 앱 안 알림 행을 만들기**: 「푸시만」의 뜻(알림함에 남지 않음)과 종 숫자·읽음 계약을 바꾼다.

## 8. 구현·실기 결과 (2026-11-02 · Owner 「구현 승인」)
- 커밋: bfe95b996 (열람 기록) · d783dcb77 (목록 1366px 제목 폭 — 같은 실기에서 함께 확인)
- 실기 「실기14」(시험 계정 2명 · 푸시 전용 · 목록 화면 「알림 보내기」 창으로 발송 12:28 PHT):

| 기기 (Android 1.2.5 (32)) | 상태 | 탭 | 화면 | 운영 DB opened_at |
|---|---|---|---|---|
| Xiaomi 24076RP19G · zxzx11 | 앱 프로세스 종료(am kill) | 12:29:00 | 지정 공지 글 상세 | 12:29:09 PASS |
| Samsung SM-M156S · q테스트1 | 백그라운드 | 12:30:23 | 지정 공지 글 상세 | 12:30:29 PASS |

- 관리자 목록(1366px) 실기14 줄: 대상 2 · 푸시 성공 2 · 열람 2 · 결과 「전부 성공」 PASS. 표 1043px ≤ 칸 1044px(가로 넘침 없음) PASS.
- NOT_PROVEN: Android ≤31(N1 이전 — 설계상 기록 안 됨) · iPhone 앱 종료 상태에서의 탭(이번은 백그라운드만).
- **정정 (작업자 잘못)**: 처음 보고에서 iPhone 을 「연결 기기 없음」이라고 적었다. 사실이 아니다 — iPhone 14 Pro Max 는 Mac 「iPhone 미러링」으로 연결할 수 있다(Owner 지적).
- iPhone 실기 시도 12:35~12:38 PHT: 미러링을 「재개」했으나 창이 약 3분 동안 「다음에 연결 중」에서 넘어가지 않음 → 알림 발송 전 중단. iPhone 결과는 **확인 못 함(NOT_PROVEN)**. 시험 알림은 보내지 않았다.
- **정정 (작업자 잘못)**: 연결 실패 원인을 「Mac 이 iPhone 개인용 핫스팟에 연결돼 있어서」라고 추정 보고했다. 12:43 PHT 에 같은 핫스팟(router 172.20.10.1) 상태 그대로 「다시 시도」로 연결됐으므로 이 추정은 **틀렸다**. 실제 원인은 확인 못 함(로그: 12:39:38 `bringupTimedOut(activatingControlStream)`).
- iPhone 실기 「실기15」(campaign 3ac21ca0 · occurrence 0d4c3c7c · w테스트1 · 푸시 전용 · iPhone 1.2 (21) · 앱은 홈 화면으로 보내 백그라운드):

| 항목 | 증거 | 판정 |
|---|---|---|
| 발송 | 운영 DB: apns 기기 행 `sent` 12:45:07 PHT · voip 기기 행 `skipped`(voip_reserved_for_call_push, 설계대로) | PASS |
| iPhone 수신 | Mac 알림 로그 12:45:15 PHT: `com.dibay.app` · platform iOS · thread `notice` 알림이 iPhone 에서 넘어와 배너로 표시 | PASS |
| 알림 탭 → 공지 상세 | Owner 가 Mac 알림 센터의 iPhone 알림을 탭(작업자 도구로는 알림 센터가 보이지 않아 누를 수 없었음) → 미러링 화면 12:48 PHT: 지정 공지 「CCBOARD-UI-2026-08-15T09-24-02 notice valid hero」 상세 | PASS |
| `opened_at` | 운영 DB: apns 행 `opened` · 12:47:56 PHT | PASS |
| 관리자 목록(1440px) | 실기15 줄: 대상 1 · 푸시 성공 1 · 열람 1 · 「전부 성공」 | PASS |
- 시험 데이터: 캠페인 「실기14」 1건(남김).

## 9. 마감 (2026-11-02 12:5x PHT · Owner 「여기서 정리 · 남은 부분은 향후」)
- main 반영: 73d252343 · d47a381a5 · 6cf8c7a21 · 61b540d6c · b96314162 · 9bde72ff2 · bfe95b996 · d783dcb77 모두 origin/main 포함 확인.
- 빌드: `verify-native-version-bump --release` → 마지막 번호 변경 이후 네이티브 변경 Android 0건 · iOS 0건. 설치 확인(`user_devices.app_version`): Android 시험 기기 2대 1.2.5 (32) · iPhone 1.2 (21) — 새 APK·iOS 빌드 불필요.
- 향후 과제 (이번 섹션에서 하지 않음 · NOT_PROVEN):
  1. iPhone 앱 완전 종료 상태에서 푸시 전용 알림 탭 → 열람 기록.
  2. 반복 중인 알림의 반복 설정 변경(일시정지 → 수정 → 재개) 운영 실기.
  3. 매장 여러 개인 사장님 계정의 「다른 매장 안 읽은 수」 실기.
  4. 새 주문 알림 제목의 매장 이름 표시 실기.
  5. Android ≤31 은 설계상 푸시 전용 열람이 기록되지 않음(범위 밖).
