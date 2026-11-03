# Cursor 프롬프트 — 운영자 알림 실기 v2 (단계 1 + R-4 반영 후 · 2026-11-03)

> **실기기 사용은 Owner 별도 승인 후에만.** 승인 전에는 이 문서를 실행하지 않는다.
> 아래 「프롬프트」 절 전체를 Cursor 에 붙여 넣는다. 결과는 `docs/audit/marketing-consent-push-device-scenario-2026-11-03.md` 맨 아래 「결과 v2」 절에 쓴다.

---

## 프롬프트

너는 DIBAY 운영 앱 실기 검증만 한다. 코드 수정·커밋·배포·운영 설정 변경 금지. PASS 는 직접 본 증거(화면 녹화·logcat·운영 DB 조회)가 있을 때만, 없으면 NOT_PROVEN. FAIL 이면 그 자리에서 멈추고 보고. 중간 보고 금지 — 끝나고 1회.

### 0. 시작 조건 (하나라도 아니면 멈추고 보고)
1. Production alias Ready SHA 1회 확인 → `git merge-base --is-ancestor c46d05e32 <SHA>` 와 R-4 커밋(보고서의 main SHA) 포함 확인. 이후 SHA 가 바뀌면 `git diff --stat <직전> <새> -- lib/admin/notification-campaigns lib/legal lib/notifications lib/push components/my/settings components/auth components/admin/notifications app/api/me/notification-settings app/api/me/legal-consent app/api/admin/notification-campaigns app/api/me/notifications android ios` 가 0파일이면 계속, 아니면 멈춤.
2. 운영 DB `ckdosyydvgzqwpbwuhon` **SELECT 만**. `dibay-test`·`dibay-reset-qa` 금지.
3. 설치 버전 `user_devices.app_version` 기록 (Android `1.2.5 (32)` 또는 이후 / iPhone `1.2 (21)`).
4. 기기·계정
   | 기기 | 계정 | user_id |
   |---|---|---|
   | A Xiaomi (adb `8b37179f7d94`) | zxzx11 | `0c4b0a80-9755-4ebe-9a10-f8e1ced4c0cc` |
   | B Samsung (adb `RFCY40PY2CA`) | q테스트1 | `9259ab7d-ae5f-4d4a-819a-8d5bd568ecf8` |
   | C iPhone (미러링) | w테스트1 | `edc8c2f0-2673-4ca8-9d63-92a609d556f4` |
5. 발송 글(새 글 금지): 공지 = 분류 「공지사항」·목적지 「고객센터 글」 `366d11ab-c19f-497a-9894-04ff4f3225bc` / 이벤트 = 분류 「이벤트」·목적지 「고객센터 글」 `0fb73019-e4f4-4d20-8c97-243a5815bf10`.

### 1. 발송 방법 (이것만)
어드민 `/admin/notifications` › 알림 보내기 → 제목 `[실기v2] S-n` → 「고급 설정 — 채널 · 테스트 수신자」 → 채널 「알림함+푸시」(「푸시만」은 없어야 정상) → 「테스트로 함께 받을 회원 ID」에 그 줄의 ID 만 → **「내 폰으로 테스트」만** 누름(「보내기」·예약·반복 금지) → 결과 문구 캡처 + 누른 시각(PHT).

### 2. 증거 (모든 줄)
- 발송 **10초 전부터 화면 녹화**: Android `adb -s <기기> shell screenrecord /sdcard/s-n.mp4` (끝나면 pull), iPhone 미러링 화면 녹화.
- Android logcat: `adb -s <기기> logcat -s DIBAY_FCM DIBAY_APPICON_DELIVERY` 를 발송 전부터 파일로 저장.
- 운영 DB (발송 시각 이후, 해당 user_id):
  - `notification_campaign_deliveries` (channel·status·skip_reason·device_id·occurrence_id·opened_at)
  - `notification_deliveries` (status·environment·provider_response 앞부분)
  - `notification_events` (title·unread·read_at)

### 3. 시나리오
| # | 분류 | 기기 상태 | 기대 (이 셋이 모두 맞아야 PASS) |
|---|---|---|---|
| S-1 | 공지 | A 앱 열림(홈) · B 백그라운드 | A: DB push `sent` · logcat `[fcm] unknown_type_fallback` 뒤에 `native_notification_posted` **없음**(앱 보임 → 기기가 표시 안 함) · 녹화에 **OS 알림 없음 + 앱 안 배너** / B: logcat `native_notification_posted` (제목 `[실기v2] S-1`) · 녹화에 **캠페인 카드**(요약 카드 「읽지 않은 알림 N개」와 별개) |
| S-2 | 공지 | A 백그라운드 · B 앱 열림 | S-1 과 반대 |
| S-3 | 공지 | A·B 종료(최근 앱에서 밀기 · `am force-stop` 금지) | 둘 다 캠페인 카드 · **발송→표시 시간** 기록(R-5 관찰) |
| S-4 | 이벤트 | A 백그라운드 · 내정보 동의 OFF / B 백그라운드 · 동의 ON | A: 알림함 행 있음 · push 기록 `skipped · marketing_not_opted_in` · 녹화에 OS 알림 없음 / B: 캠페인 카드 |
| S-5 | 공지 | S-1 과 같은 상태로 **한 번 더** 발송 | 새 회차(occurrence)에 A·B 의 in_app·push 기록이 **모두** 남음 (2회차 기록 소실 결함 A-1 확인) |
| S-i1 | 공지 | iPhone 앱 열림 (ID = iPhone 만) | OS 알림 없음 · 앱 안 배너 · DB push `sent` |
| S-i2 | 공지 | iPhone 백그라운드 | APNs 알림 표시 · `notification_deliveries` 성공 |
| S-i3 | 이벤트 | iPhone 백그라운드 · 동의 OFF | 알림함만 · `marketing_not_opted_in` |

탭 확인 (표시된 쪽마다)
| # | 할 일 | 기대 |
|---|---|---|
| T1 | 백그라운드 캠페인 카드 탭 | 알림 목록이 아니라 **글 상세** 바로 · `notification_events.read_at` 채워짐 · `notification_campaign_deliveries.opened_at` 채워짐 |
| T2 | 종료 상태 캠페인 카드 탭 | 앱 시작 후 글 상세 · 읽음 · 열람 |
| T3 | 앱 안 배너 탭 | 글 상세 · 읽음 · **열람 기록**(단계 1 A-2) |
| T4 | 알림 목록 줄 탭 | 글 상세 · 읽음 · **열람 기록** |
| T5 | 종 숫자 | 받기 전·후·읽은 뒤 캡처 — 공지·이벤트 모두 +1 / −1 |
| T6 | 「모두 읽음」 | 읽음은 되지만 열람 기록은 **안 남음**(R-7 설계대로) |

어드민 확인
| # | 할 일 | 기대 |
|---|---|---|
| A1 | 작성 화면 분류 「이벤트」 받는 사람 전체 | 「알림함 130명 · 푸시 N명」 — N = 운영 DB 에서 (동의 ON ∧ 활성 FCM/APNs 기기, VoIP 제외) 회원 수와 같음(쿼리 결과 첨부) |
| A2 | 보낸 알림 › 테스트 탭 S-4 줄 | 「푸시 미동의」 1 · 「설정 꺼짐」 0 · 받은 사람 창 사유 「혜택·이벤트 수신 미동의」 |
| A3 | S-5 줄 | 2회차 숫자가 DB 기록과 같음 |

### 4. 끝나고 (반드시)
S-4·S-i3 에서 끈 동의를 내정보에서 다시 켬 → DB 3명 `marketing_enabled=true` 대조. 아니면 보고 맨 앞에.

### 5. 보고 (1회)
첫 줄 `[배포 구분] 웹만` + 확인한 Production SHA · 작업자 잘못(잘못 누른 버튼·실제 회원 발송·복구 실패) 먼저 · 표(줄·기기/상태·발송 시각·DB·녹화/logcat 파일명·판정) · 측정 못 한 칸 NOT_PROVEN + 이유.
