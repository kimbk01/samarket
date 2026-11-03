# 운영자 알림·혜택 동의 — 처음부터 끝까지 재감사 + 원인별 설계안 (2026-11-03 21:5x PHT)

> 설계 보고. 코드·운영 DB 변경 없음. 기준: origin/main `76708d065`(Production) · 운영 DB `ckdosyydvgzqwpbwuhon` 읽기 전용.
> 이 문서가 앞 문서 `campaign-foreground-presence-s5-1-fail-design-2026-11-03.md` 를 **대체**한다 (그 설계안은 아래 B-1 로 바뀜).
> 표기: **[직접]** = 작업자가 코드 줄·운영 DB 로 직접 확인 · **[코드]** = 감사 에이전트가 file:line 으로 확인(작업자 미재확인) · NOT_PROVEN = 확인 못 함.

## 0. 작업자 잘못 (먼저)
1. 「앱 열림 → 서버가 푸시 안 보냄 → 앱 안 배너」를 코드 분기만 보고 맞다고 했다. 그 분기가 읽는 신호가 **메신저 화면에서만** 오는 것을 확인하지 않았다.
2. 앞 설계안(새 신호 표)은 원인을 다시 땜빵하는 안이었다. 이번 재감사에서 **두 기기 모두 앱이 보일 때 OS 알림을 스스로 숨긴다**는 것을 확인했다 → 서버 쪽 「앱 사용 중」 판정 자체가 필요 없다(B-1).
3. 실기 시나리오 T5 에 「이벤트는 종 숫자에 안 더해짐(알려진 결함)」이라고 썼다. 코드상 이벤트(`admin_marketing_banner`)는 종 숫자 대상 목록에 **들어 있다** [직접 `badge-event-classifier.ts` A 목록]. 앞 기재는 근거 없는 기재였다 — 실기 T5 로 확정한다.
4. S5-1 「발송 3」의 기록이 DB 에 1줄만 남은 원인(A-1)을 실기 프롬프트 작성 때 확인하지 않아, 기록 기반 판정이 처음부터 성립하지 않았다.

## 1. 결함 목록 (원인 확정분)

### A. 발송 기록
| # | 심각 | 결함 | 증거 | 실패 장면 |
|---|---|---|---|---|
| A-1 | 치명 | 같은 캠페인을 다시 보내면 받는 사람 기록이 **조용히 버려짐** | [직접] 운영 인덱스 `notification_campaign_deliveries_campaign_user_device_channel_u (campaign_id,user_id,device,channel)` 가 회차 인덱스와 함께 남아 있음 · `campaign-delivery-recorder.ts:41-46` 가 23505 무시 · S5-1(21:04) 「발송 3」인데 DB 기록 1줄(A 푸시만), B·알림함 기록 0 | 「내 폰으로 테스트」 2회차부터, 반복 발송 2회차부터, 같은 캠페인 재발송 — 결과 숫자·받은 사람·열람·「안 읽은 사람 다시 보내기」가 전부 틀림. 운영 캠페인 20건이 회차 2개 이상 |
| A-2 | 중요 | 「열람」이 OS 푸시를 눌렀을 때만 기록됨 | [코드] `read/route.ts:65-78` 만 `markCampaignDeliveryOpened` 호출 · 알림함 탭·배너 탭·글 열람 읽음(`PATCH /api/me/notifications`)은 미기록 | 알림함에서 읽은 회원이 「안 읽음」 → 「안 읽은 사람 다시 보내기」가 읽은 회원에게 또 발송 |
| A-3 | 경미 | 마케팅 푸시가 막힌 이유를 전부 「푸시 미동의」로 기록 · system/notice 사유 뒤바뀜 · 방해금지는 시간 아닌 설정만 봄 | [코드] `campaign-eligibility.ts:117-126,147` | 어드민 「미동의」 칸이 실제보다 큼, 공지 막힘 사유 오기 |
| A-4 | 경미 | 발송 꺼짐·대상 0 을 「토큰 없음」으로 기록 | [코드] `campaign-send-user.ts:383-393` | 원인 오판 |

### B. 앱 안 / 앱 밖
| # | 심각 | 결함 | 증거 | 실패 장면 |
|---|---|---|---|---|
| B-1 | 중요 | 서버가 「앱 사용 중」을 메신저 신호로만 판단 → 메신저 밖에선 늘 「백그라운드」, 앱 막 닫은 30초 안엔 「사용 중」으로 오판해 **푸시를 안 보냄** | [직접] `campaign-presence.ts:11-25` · 신호 보내는 곳 `app/(main)/community-messenger/layout.tsx` 1곳 · A 마지막 신호 02:41, B 03:55 (21:08 조회) | S5-1 기록 「보냄」(실제 화면 표시는 기기가 숨김 → 아래). 반대로 앱 닫은 직후 받은 운영자 알림은 **OS 알림도 배너도 없음** |
| B-2 | 중요 | 푸시만(push_only) + 서버가 「사용 중」 판정 → 알림함 행도 없어 **아무것도 안 보임** | [코드] `campaign-send-user.ts:217-240` | push_only 캠페인 일부 회원 누락 |
| B-3 | 중요(네이티브) | Android 「DIBAY · 읽지 않은 알림 N개」 요약 카드가 알림창에 늘 남고, 누르면 알림 목록으로 감 | [코드] `DibayAppIconDeliveryAdapter.java:146-192`(고정 ID·autoCancel false·url `/notifications`) | S5-1 B 캡처가 이 카드였음 — 캠페인 카드 표시 여부는 NOT_PROVEN. 회원은 숫자 카드만 보고 눌러도 콘텐츠로 못 감 |

확인한 정상 (B 관련):
- Android 앱이 보이면 알림함 행 있는 운영자 알림은 **OS 알림을 띄우지 않음** [직접 `DibayFirebaseMessagingService.java:115-117`, `isAppVisibleForIncomingCall`].
- iPhone 앱이 보이면 OS 알림 안 띄움 — 플러그인 기본값 `[]`, `capacitor.config.ts` 에 `presentationOptions` 없음 [직접 `PushNotificationsHandler.swift:20-56`]. 설치 바이너리 플러그인 버전은 NOT_PROVEN.
- 앱 안 배너: `notification_events` 가 Realtime 구독 대상에 있음 [직접 운영 `pg_publication_tables`] · 배너는 (main) 전 화면(통화 화면 제외)에 붙고, `notice_published`·`admin_marketing_banner` 를 표시 대상으로 둠 [직접 `member-in-app-notification-banner.ts:42,62-136`]. S5-1 A 화면에 배너가 떴는지는 캡처 시점이 늦어 NOT_PROVEN.
- 배너·알림함·푸시 탭 → 저장된 같은 목적지 + 같은 읽음 함수 [코드].

### C. 푸시 대상 판정
| # | 심각 | 결함 | 증거 | 실패 장면 |
|---|---|---|---|---|
| C-1 | 중요 | **공지(type notice) 푸시가 「주문 알림」 설정으로 걸러짐** | [직접] `campaign-notification-presentation.ts:216-217` notification_type `notice` → `web-push-user-settings-gate.ts:87` 가 "notice" 반환 → 이벤트 종류 목록에 없어 null → `notification-preference-policy-registry.ts:203-208` 안전 대체 = **order** | 「주문 알림」 끈 회원은 공지 푸시 못 받음, 「공지 알림」 끈 회원은 받음. 운영 현재 주문·공지 끈 회원 0명이라 아직 실피해 없음 [직접] |
| C-2 | 중요 | 어드민 「푸시 N명」 미리보기와 실제 발송이 **다른 함수** | [코드] 미리보기 `evaluateCampaignPushPreference` / 발송 `shouldSendWebPushForUser` · 미리보기는 VoIP 기기 포함·환경 미지정·방해금지 미반영·800명 표본 추정 | 화면 숫자 ≠ 실제 |
| C-3 | 경미 | 테스트 발송이 `target_payload` 를 빼고 만듦 | [코드] `campaign-test-send-service.ts:151-161` | 테스트 알림의 「읽음 → 글 읽음」 연동이 실제 발송과 다름 (목적지는 같음) |

확인한 정상 (C 관련): 모든 발송 경로(즉시·테스트·예약·반복·재발송)가 `sendCampaignToUser` 하나로 모임 · 알림함은 전원 · 이벤트/마케팅 푸시는 `marketing_enabled=true` 만 · 분류↔type 불일치는 서버 거부 · iPhone sandbox 토큰도 발송 대상(토큰별 APNs 환경, 반대 환경 1회 재시도) [코드].

### D. 혜택·이벤트 동의
| # | 심각 | 결함 | 증거 | 실패 장면 |
|---|---|---|---|---|
| D-1 | 중요 | 가입 때 동의 저장이 실패해도 성공 처리, 다시 안 물음 | [직접] `legal-consent/route.ts:107-118`(실패해도 ok) · `AuthConsentForm.tsx:97-103`(응답의 저장 결과 안 봄) | 체크했는데 OFF·기록 없음 |
| D-2 | 중요 | 내정보 PATCH 가 동의를 **두 번 나눠 씀**(시각·출처 없이 먼저 저장 → 기록 저장) | [직접] `notification-settings/route.ts:175-183,203,213-223` | 두 번째 실패 시 화면은 되돌아가는데 DB 는 바뀐 값·옛 시각 |
| D-3 | 중요 | 어드민이 만든 회원·직원 계정은 동의 화면을 거치지 않음 → OFF·**기록 없음** 상태로 영원히 안 물음 | [코드] `admin/users/create/route.ts:310-313`, `admin/staff/route.ts:250-283` · 운영 현재 기록 없는 회원 0명 [직접] | 이후 어드민 생성 회원은 선택 기회 없음 |
| D-4 | 경미 | 동의 조회 오류를 「기록 없음」으로 처리 | [코드] `marketing-consent.server.ts:67` | 조회 실패 시 기존 ON 회원을 가입 화면 미체크로 OFF 덮어쓸 수 있음 |
| D-5 | 경미 | 기록하는 문서 버전을 클라이언트 값 그대로 저장 | [직접] `legal-consent/route.ts:111` | 게시되지 않은 버전이 기록될 수 있음 |
| D-6 | 경미 | 「마지막 변경」이 기존 회원에게 마이그레이션 시각으로 보임 · PHT 표기 없음 · 토글 후 기기 시계 사용 | [코드] `NotificationsSettingsContent.tsx:203,219,297,399-403` | 바꾼 적 없는데 「마지막 변경 17:33」 |
| D-7 | 경미 | 약관 동의 전에도 설정 PATCH 로 ON 기록 가능(끄기 예외가 켜기까지 허용) | [코드] `member-consent-mutation-policy.ts:81` | 가입 화면이 동의를 안 묻게 됨 |
| D-8 | 경미 | 옛 열 `user_settings.marketing_push_enabled` 를 단독으로 쓰는 경로·미러 쓰기 남음 · 미러 쓰기 오류 미확인 | [코드] `api/me/settings/route.ts:40`, `marketing-consent.server.ts:97-107` | 판정 영향 없음, DB 값 어긋남 |
| D-9 | 경미 | 마이그레이션이 `user_settings` 행이 없던 29명에게 행을 만들며 언어 기본값 `ko` 를 넣음 | [직접] 마이그레이션 `:57-63` · 운영 현재 en 32 / ko 98 | 영어 사용 회원이 서버 판정에서 ko 가 될 수 있음 — 해당 29명 중 실제 영어 사용자 수 NOT_PROVEN |
| D-10 | 경미 | 탈퇴해도 동의 ON 유지 | [코드] `admin-user-deletion.ts:26-55` | 탈퇴 회원 동의 기록 잔존 |
| D-11 | 경미 | 운영 스키마 점검 목록에 새 3열 없음 · 어드민 문서 확인창 문구가 약관용 그대로 | [코드] `required-objects.json:4828-4845`, `AdminAppLegalDocumentForm.tsx:244-247,262-266` | 점검 누락·잘못된 안내 |

## 2. Owner 지시와 기존 설계 충돌 (임의 선택 안 함 · 규정 7)
| # | 충돌 | 지금 코드 | 이 설계안의 처리 |
|---|---|---|---|
| K-1 | Owner 「공지·시스템·업데이트 = 전원 푸시」 vs 회원이 직접 끈 「알림 전체」·「공지 알림」·방해금지 | 끈 회원은 푸시 제외 (운영 현재 해당 0명 · 방해금지 켠 회원 1명) | **회원이 직접 끈 설정은 지킨다**로 설계(알림함은 전원). Owner 가 「끈 회원에게도 푸시」로 정하면 C-1 수정 위치 1곳에서 바꿈 |
| K-2 | 마이그레이션이 기존에 직접 OFF 했을 수 있는 8명까지 ON | Owner 지시대로 적용 완료 | 그대로 둠(이미 보고). 내정보 스위치로 끌 수 있음 |
| K-3 | 앱 버전 자동 「업데이트 안내」는 알림함만, 푸시 없음 | `app-release-report.ts:156-175` | 손대지 않음 — 「업데이트 → 전원 푸시」에 이것이 포함되는지 Owner 확인 대상 |

## 3. 설계안 (원인별 · 땜빵 없음)

### 단계 1 — 웹·서버 (main 1회 반영 · 웹만, 앱 재시작)
| # | 고치는 결함 | 바꾸는 것 | 영향받는 곳 · 같은 단계 처리 |
|---|---|---|---|
| 1 | B-1, B-2 | **서버의 「앱 사용 중」 판정 삭제.** 대상 회원의 모든 활성 기기에 푸시를 보낸다. 앱이 보이면 **기기가 숨긴다**(Android `:117`, iPhone `[]` — 위 확인). `campaign-presence.ts` 와 `foreground_no_os_push` 분기 제거. **「푸시만(push_only)」 선택지는 새 작성에서 없앤다** — Owner 기준 「알림함 = 전원」과 맞지 않고, iPhone 앞 화면에서는 OS 알림도 알림함 행도 없어 누락되기 때문(Android 는 envelope 로 표시되나 iPhone `[]` 는 숨김). 새 알림은 항상 알림함+푸시 | 테스트 `campaign-send-user.test.ts` 「foreground → skip」 → 「항상 발송」으로 갱신 · 어드민 작성 화면 채널 선택에서 push_only 제거(과거 push_only 알림 수정 화면에서만 표시, 서버도 새 생성 거부) · 어드민 사유 라벨 `foreground_no_os_push` 는 과거 기록 표시용으로만 남김 · 메신저 신호·채팅 푸시는 **손대지 않음** |
| 2 | C-1 | 캠페인 푸시 meta 에 실제 알림 종류 `event_type`(= `notice_published` / `admin_marketing_banner` / `admin_notice`)를 넣는다 → 설정 판정이 이 값을 먼저 읽음(`web-push-user-settings-gate.ts:58-60`). 공지 → 「공지 알림」 영역 | 회귀 테스트: 공지·시스템·업데이트·이벤트 각각 어느 설정 영역을 보는지 |
| 3 | C-2, A-3 | 미리보기·발송·사유 기록을 **한 함수**로: 발송이 쓰는 판정(`resolveEffectiveNotificationPreference`)을 미리보기도 회원별로 호출하고, 막힌 사유는 그 결과의 `reason` 을 그대로 기록. 미리보기 기기 수 = 발송과 같은 기기 거르기(VoIP 제외·환경 production) | `campaign-audience-preview.ts`, `campaign-eligibility.ts`(사유 매핑 삭제), 어드민 칸 「푸시 미동의」= 마케팅 동의 OFF 만, 「설정 꺼짐」·「방해금지」 분리 |
| 4 | A-2 | 읽음 처리 공통 함수(`patchInboxNotificationIdsRead`)에서 캠페인 행이면 `markCampaignDeliveryOpened` 호출 → 알림함·배너·글 열람·푸시 탭 모두 같은 열람 기록 | `/api/me/notifications` PATCH · 글 열람 읽음 경로가 같은 함수를 쓰는지 구현 때 확인, 아니면 같은 함수로 모음 |
| 5 | A-4 | 발송 꺼짐 = `push_dispatch_disabled`, 기기 0 = `token_missing` 분리 | 라벨 1개 추가 |
| 6 | C-3 | 테스트 발송도 `target_payload` 포함해 실제 발송과 같은 묶음으로 | — |
| 7 | D-1, D-5 | 가입 동의 API: 동의 기록 저장 실패 → `ok:false, code:marketing_save_failed` · 화면은 머물러 「선택 동의 저장 실패 — 다시 시도」 · 버전은 서버가 게시 문서 버전으로 정함(클라 값 무시) | 재시도 시 필수 동의는 이미 저장된 경로(idempotent) 그대로 |
| 8 | D-2, D-8 | 동의 쓰기 = `writeMemberMarketingConsent` **1회 upsert** 만. 일반 설정 PATCH 의 `marketing_enabled` 일괄 저장 제거. 옛 열 `marketing_push_enabled` 쓰기·읽기 전부 제거(열은 남김) | `/api/me/settings`, normalizer, `campaign-eligibility.ts:136` |
| 9 | D-3 | 어드민 회원·직원 생성 시 동의 기록 `false · source=admin_created` 저장(동의 없음 = 안 보냄), 회원은 내정보에서 켬 | CHECK 에 `admin_created` 추가(마이그레이션) |
| 10 | D-4 | 조회 오류는 「기록 없음」과 구분 → 오류면 체크박스 안 보이고 쓰지 않음 | — |
| 11 | D-6 | 「마지막 변경」은 `settings`·`signup` 일 때만 서버 시각(PHT 표기) · 기존 회원 기본값은 「기존 회원 기본 동의 · 2026-11-03」 | i18n ko/en |
| 12 | D-7 | 약관 동의 전 PATCH 는 `marketing_enabled=false`(끄기)만 허용 | — |
| 13 | D-10 | 탈퇴 처리 시 동의 OFF · `source=settings` | — |
| 14 | D-11 | 스키마 점검 목록 3열 추가 · 어드민 확인창 문구 marketing 분기 | — |

### 단계 1 DB (마이그레이션 1개 · 운영 적용 = Owner 승인)
- A-1: 캠페인 단위 고유 인덱스 `…_campaign_user_device_channel_u` **삭제** → 회차 단위 고유 인덱스만 남김. 회차 없는 옛 행용으로 `WHERE occurrence_id IS NULL` 부분 고유 인덱스 1개 추가. 기록 함수의 23505 무시는 「같은 회차 중복」에만 해당하게 됨.
- D-3: `marketing_consent_source` CHECK 에 `admin_created` 추가.
- D-9: 마이그레이션 전 `user_settings` 행이 없던 29명(작업자 적용 전 백업 목록) 중 `preferred_language` 를 기기 언어 따름(`null`)으로 되돌림 — 적용 전 대상 목록·값 대조 보고.

### 단계 2 — Android 네이티브 (별도 커밋·빌드 · 단계 1 실기 PASS 후)
| # | 고치는 결함 | 바꾸는 것 |
|---|---|---|
| 15 | B-3 | 요약 카드를 실제 알림 카드들의 **묶음 머리(group summary)** 로 바꾼다: 운영자·회원 알림 카드에 같은 묶음 키 부여 + 요약 카드 `setGroupSummary(true)` · 실제 카드가 0 이면 요약 카드도 제거. 회원은 개별 카드(제목·본문, 탭 → 콘텐츠)를 보고, 요약은 묶음 머리로만 남음. 앱 아이콘 숫자 전달은 유지 |
- 네이티브 → `versionCode` 증가·APK 실기·통화 무관 확인(알림 채널만, 통화 채널·CallKit 파일 미변경). 설치 바이너리 `1.2.5 (32)` 에서는 단계 1 만 효과.

## 4. 반영 후 실기 (시나리오 문서 기대값 정정 포함)
- 기대값 정정: 「앱 열림」 = DB push `sent` + **기기 화면 OS 알림 없음 + 앱 안 배너**(기기가 숨김). 서버 기록 사유로 판정하지 않는다.
- 증거 방법: 발송 순간부터 **화면 녹화**(Android `adb shell screenrecord`, iPhone 미러링 녹화) + Android logcat `DIBAY_FCM`(`unknown_type_fallback`, `native_notification_posted`/foreground return) — 캡처 1장으로 판정 금지.
- S5-1~5 · T1~T5 · S6 다시. 「내 폰으로 테스트」를 반복해도 회차마다 기록이 남는지(A-1) 먼저 확인.
- T5: 이벤트도 종 숫자 +1 (코드상 포함) — 실기로 확정.

## 5. 이번 재감사로 확인 못 한 것 (NOT_PROVEN)
- S5-1 A 화면에 앱 안 배너가 실제로 떴는지 · B 에 캠페인 카드가 따로 떴는지 (캡처 시점).
- 설치 iPhone 바이너리의 푸시 플러그인 버전(앞 화면 표시 기본값).
- D-9 29명 중 실제 영어 사용 회원 수.
- 등록 기기 20개 상한 RPC 의 운영 적용 여부.
