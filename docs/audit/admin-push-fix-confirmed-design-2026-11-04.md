# 운영자 알림·혜택 동의 — 남은 결함 확정 설계안 (2026-11-04 08:10 PHT · 승인 대기)

> 원 설계: `admin-push-complete-fix-design-2026-11-04.md` (같은 번호). 이 문서는 그 B·C 단계를 **현재 main `0d131be5b` 코드 줄 + 운영 DB(08:06 PHT 읽기 전용)** 로 한 항목씩 다시 확인한 결과다.
> 설계 기준(`0fc60529c`) 이후 main 변경 중 범위 파일을 건드린 커밋: 없음 (`392fe39c9` 거래 검수 알림 문구 · `8360a176f` 거래 마이그레이션 — 운영자 알림·동의 코드 무관).
> 코드·운영 DB·기기 변경 없음.

## 0. 작업자 잘못 (먼저)
- **원 설계 B-1 의 호출처 누락**: 「실제로 연 것」 경로로 3곳(알림함 행·종 팝업 행·앱 안 배너)만 적었는데, **알림 상세 화면**(`app/(main)/notifications/[notificationId]/page.tsx:114-119`, 상세를 열면 `{ids}` 로 읽음)도 실제 열기다. 이번 설계에 넣는다.
- 단계 1 에서 만든 결함(열람 부풀림 I-1 · 고객센터 「모두 읽음」 열람 I-2 · 방해금지 오분류 I-6)은 아래 B-1·B-2 로 고친다(원 설계와 같음).

## 1. 단계 정리
| 단계 | 상태 | 근거 |
|---|---|---|
| A (S-1 원인 확정) | 끝 | v3 실기: 공지 수신 0.37초 · 표시 문제는 Android 요약 카드(빌드 36·37 로 처리) |
| D (공지 우선순위 high) | **취소** | 지연 없음(위) · Owner R-5 「지연 증명 시에만」 |
| **C (운영 DB)** | 남음 — 아래 §3 | 운영 DB 현재값 그대로 |
| **B (웹·서버)** | 남음 — 아래 §2 (19항목 전부 현재 코드에 결함 그대로) | 코드 줄 |
| E (실기) | 수정 후 **Cursor 프롬프트**로 1회 | §5 |

## 2. 단계 B — 재확인 결과와 수정 (웹·서버만 · 네이티브 무변경)

| # | 결함 (현재 코드 · 직접 확인) | 수정 |
|---|---|---|
| **B-1** 열람 = 연 것만 | `inbox-read-bridge.ts:374` 가 **모든 읽음**(밀어서 읽음·고객센터 글 읽음 `customer-center-read-state.ts:145`·업데이트 보고 `app-release-report.ts:150`)에서 `markCampaignDeliveriesOpenedForEvents` 호출 · 그 함수(`campaign-delivery-recorder.ts:264-279`)는 채널 구분 없이 push 행까지 `opened` · 목록 집계 `campaign-list-service.ts:551-581` 은 **행 수**(기기 3대 = 열람 3) | `PATCH /api/me/notifications` 에 `opened: true` 추가 → **실제 열기 4곳만** 보냄: 알림함 행 탭(`MyNotificationsView`) · 종 팝업 행 탭(`PhilifeHeaderNotificationInbox`) · 앱 안 배너 탭(`InAppNotificationBannerHost`) · **알림 상세 화면**(신규 포함). `patchInboxNotificationIdsRead(…, { campaignOpened })` 가 `true` 일 때만 기록 · 그때 `in_app` 행만. 푸시 탭(`/api/me/notifications/read`) = `in_app`+`push` 행(채널 지정, 같은 UPDATE 2회 제거). 집계 = `user_id` 함께 읽어 **채널별 고유 회원 수** |
| **B-2** 막힌 이유 순서 | `effective-notification-preference.ts:375-393` — 방해금지(`quiet_hours`)가 영역 사유보다 먼저 → 미동의 회원이 방해금지 시간엔 「방해금지」로 기록 | 판정 결과에 `domainPushReason`(추가 필드, 기존 `reason` 불변) · `campaignPushSkipReasonFromDecision`(`campaign-eligibility.ts:87-107`) 이 **영역 사유 → 방해금지** 순 |
| **B-3** 「푸시만」 퇴역 | `campaign-input.ts:83,98` 조용히 변환 + `[campaignId]/route.ts:226` 예전 값 유지 · 작성 화면 `CreatePage.tsx:55,311,1163-1165` 예전 분기 | 입력 `push_only` → **400 `push_only_retired`** · `keepLegacyPushOnly`·화면 분기 삭제 · 회차 생성(`ensureDraftCampaignSendOccurrence`·예약 claim)에서 남은 `push_only` 는 발송 안 하고 `push_only_retired` 실패 |
| **B-4** 미리보기 = 발송 | `loadCampaignPreferenceSnapshots`(`campaign-eligibility.ts`) 가 두 조회 **오류를 무시**하고 빈 설정(기본값)으로 판정 → 미리보기 숫자가 조용히 틀림(발송은 `evaluateCampaignPushGate` fail-closed 라 다름) · 쓰지 않는 `loadCampaignSettingsMaps`(미리보기 `:101`·배치 `:235,350`)·항상 참 `evaluateCampaignUserEligibility` | 조회 오류 → `push_preview_failed: true` · 화면 「푸시 인원 계산 실패 — 다시 시도」 · 죽은 조회·인자·분기 삭제 · 옛 열 `marketing_push_enabled` 읽기 제거(DB 열 유지) |
| **B-5** 기록 사유 | `campaign-send-user.ts:334` dispatch 빈 결과를 `dispatch_disabled` 외 전부 `token_missing` 으로 · 라벨표(`campaign-recipient-labels.ts`)에 `already_sent`·`delivery_in_flight`·`apns_not_configured` 등 없음(해당 1건만) | dispatch 사유(`server_misconfigured`·`notification_event_not_found`·안전 게이트 사유) 그대로 기록, 기기 0 일 때만 `token_missing` · 실제 기록되는 사유 전부 한·영 라벨 |
| **B-6** 상세 「다시 보내기」 | `AdminNotificationCampaignDetailPage.tsx:380,859` `resendOccurrence` = 같은 회차 재실행(기존 알림함 행 재사용 → 앱 사용 중 표시 없음) | 목록과 같은 `resend`(`mode=failed`, 새 캠페인) 호출 · `resendOccurrence` 삭제 |
| **B-7** 테스트 회차 마무리 | `run-campaign-send-batch.ts:325-372` 루프에 try/finally 없음 → 예외 시 회차 `sending` 고착 | 회원별 try/catch(실패 기록 후 계속) + finally `refreshOccurrenceMetrics(terminal)` |
| **B-8** 배지 0 | `campaign-send-user.ts:236-242` 배지 계산 실패 → `resolveMemberAppIconTotalForNativeFcm(undefined)` = **0** → iPhone `aps.badge=0`(숫자 지움) · 게이트(`:279`)보다 **먼저** 6조회 | 실패면 `badgeCount` 미포함 · 게이트 **뒤**로 이동 |
| **B-9** 오류 숨김 | `recordCampaignDelivery` 중복 외 오류 `console.warn` 후 null · `upsertCampaignTargetRows` 오류를 `recordUserTargetStatus`(`campaign-send-user.ts:49`)가 무시 · `refreshOccurrenceMetrics` 읽기 오류 `return`(`:68`) | 회차 `record_error_count` 증가(C-5) + 상세 「기록 실패 N건」 · 대상 기록 오류 → 그 회원 `failed` · 집계 오류 → 로그·다음 배치 재시도 |
| **B-10** 집계 1,000행 | `refreshOccurrenceMetrics` 단일 조회(`:63-66`) · 현재 발송 기록 **3,005행** | 페이지 읽기(`readCampaignDeliveries`) |
| **B-11** 대상 스캔 | `campaign-target-scan.ts:20-51` offset 방식 · `active_users` 기준 시각 배치마다 재계산 | `id > cursor` 방식(`send_progress_cursor`, C-5) · 기준 시각 회차 시작 때 고정(`active_since`) |
| **B-12** 회차 번호 | `campaign-occurrence-service.ts:212-224` 「최대+1」(경쟁) · `claim-scheduled-campaign.ts:415-423` 반복 계산이 **테스트 회차까지** 셈 | 번호를 RPC 안에서 배정(C-6) · 반복 계산은 `trigger_type='recurring'` 만 |
| **B-13** 결과 표시 | `campaign-list-kind.ts:82-97` 채널 무시 · 대상 0 회차 = 「전부 성공」(`ok`) | 알림함 전용 → 푸시 「해당 없음」 · 대상 0 → 「대상 없음」 배지(상태 값·CHECK 6종 유지) · 합계 = 테스트 제외 최신 실제 회차 · 반복 2회차부터 대상 스냅샷 |
| **B-14** 동의 저장 순서 | `legal-consent/route.ts:168-186` 필수 동의 **먼저** 저장 → 선택 동의 실패 시 500 이지만 필수는 이미 저장 → 다음 방문에 동의 화면 안 나옴(선택 동의 영영 안 물음) | 신규 회원: 선택 동의 먼저 → 성공 시 필수 동의 · 실패면 둘 다 저장 안 함 · 가입 화면 조회 오류 시 체크박스 표시 |
| **B-15** 알림 설정 저장 | `notification-settings/route.ts:142` 현재 행 읽기 오류 무시 → 기본값으로 **전 열 덮어쓰기**(`:221`) | 읽기 오류 → 503 · 바뀐 열만 upsert |
| **B-16** 대상 `marketing_opt_in` | `campaign-input.ts:18` · 미리보기 라우트 `:11` 허용 · 배포 어댑터 기본값 `adapters.ts:192` | 입력 거부 · 어댑터 기본 `all` · 과거 라벨 유지 |
| **B-17** 닫음 기록 | `markCampaignDeliveryDismissed`(`:300-309`) 가 `opened` 를 `dismissed` 로 덮음 | `sent`/`pending` 만 · 집계에서 `dismissed` 푸시 = 받음 |
| **B-18** 테스트 발송 권한 | `test-send/route.ts:23` `requireAdminApiUser` 만 · 남에게 최대 20명 발송 가능 · 횟수 제한 없음 (실제 발송은 `send/route.ts:45` `manage`) | 본인 외 ID 포함 시 `requireAdminPermission("manage")` · 관리자당 1분 10회(기존 `lib/security/rate-limit-presets.ts` 재사용) 초과 429 |
| **B-19** 죽은 코드 | `DibayBottomNotificationBanner` 사용처 0(테스트 1개만) · `admin-banner-feed` 라우트는 그 컴포넌트 전용(테스트 1개) | 컴포넌트·라우트·두 테스트 삭제 |
| **B-20** 예전 고유키 재시도 (원 C-2 코드 부분) | `campaign-target-rows.ts:31-51` 23505 이면 `(campaign_id,user_id)` 로 다시 upsert → 반복 2회차가 1회차 대상 행을 **덮어씀** | 재시도 제거(C-2 키 삭제와 같은 반영) |

영향 화면: 회원 알림함·종 팝업·앱 안 배너·알림 상세(요청 본문 필드 1개), 어드민 작성·목록·상세·미리보기, 가입 동의·알림 설정. 통화·메신저·네이티브 코드 무관(통화 규정 범위 밖 — `lib/push/**` 통화 발송 미변경).

## 3. 단계 C — 운영 DB (08:06 PHT 현재값 · Owner 승인 · B 반영 **전** 적용)
| # | 내용 | 현재값 |
|---|---|---|
| C-1 | 인덱스 `notification_campaign_deliveries(notification_event_id)` | 없음 · 3,005행 |
| C-2 | `admin_notification_campaign_targets_campaign_id_user_id_key` 삭제 | 있음 |
| C-3 | 데이터: 「푸시만」 초안 → 「알림함+푸시」 · `marketing_opt_in` 초안 → `all` (적용 전 id·이전 값 백업, 적용 후 열 대조) | 37건 · 2건 (발송된 푸시만 4건은 기록 보존) |
| C-4 | 대기 회차 중 발송 기록 **있는** 것 → 집계 규칙과 같은 최종 상태 · 기록 없는 31건 그대로 | queued 63 · 기록 있음 32 · sending 0 |
| C-5 | 회차 열 `record_error_count int default 0` · `send_progress_cursor text` · `active_since timestamptz` | 3열 모두 없음 |
| C-6 | `ensure_admin_notification_campaign_occurrence(uuid,integer,…)` — 번호 null 이면 캠페인 행 잠금 후 배정 · 같은 번호 다른 종류면 오류 | 현재 번호를 호출자가 넘김 |
회차 상태 CHECK 6종(`queued·sending·sent·partially_failed·failed·cancelled`)은 바꾸지 않음.

## 4. 바꾸지 않는 것
원 설계 §3 그대로(같은 토큰 중복 0 · 웹 푸시 구독 0 · 발송 병렬화 · 언어 29명 · 요약 카드 구조 · K-1/K-3) + 단계 D 취소 · Android 아이콘 숫자 「37 방식 유지」.

## 5. 반영·검증
1. C 마이그레이션·데이터(승인) → 열 대조·백업 보고.
2. B 구현 → `typecheck:build`·`typecheck:test`·관련 vitest·eslint·`verify:routes`(라우트 삭제) 1회 → `[배포 구분] 웹` → main 1회.
3. Production SHA 1회 확인 → **Cursor 실기 프롬프트** 작성(Android = USB 연결 기기 · iOS = 시뮬레이터, 시뮬레이터 한계(APNs 수신 없음 등)는 별도 표). 이미 PASS 한 항목(수신 속도·요약 카드·아이콘 숫자)은 다시 보지 않고 **이번 수정 항목만**: 열람(행 탭·상세 = 열람 1 / 밀어서 읽음·고객센터 모두 읽음 = 0 / 기기 여러 대 = 회원 1) · 막힌 이유 칸 · 「푸시만」 거부 · 미리보기 · 상세 다시 보내기 = 새 발송 · 반복 2회차 대상 행 보존 · 테스트 발송 권한 · 동의 저장.

## 6. 확인 못 함
- iPhone 실기기 배지 유지(B-8)는 시뮬레이터로 확인 불가 → NOT_PROVEN 으로 남김.

## 7. 구현 결과 (Owner 「설계안 승인」 2026-11-04 · 작업자 직접)

### 7-0. 작업자 잘못 (먼저)
1. **C-3 데이터 변경이 이벤트 배포 푸시 초안 4건까지 바꿨다** — 설계 재확인 때 「푸시만」을 만드는 호출처 중 **이벤트 배포(프로모션) 기능**(`lib/platform-promotion-distribution/save-event-distribution.ts` → `createAdminNotificationCampaign(channel: "push_only")`, 계약 `independence.ts` `mapPushBellToCampaignChannel` = 푸시 push_only · 종 in_app_only 따로)을 찾지 못했다. 바로 4건을 적용 전 값으로 되돌렸다(증거 `evidence/admin-push-stage-c-2026-11-04/after.md`).
2. C-3 첫 실행에서 두 UPDATE 를 한 문장에 넣어 2건의 대상 변경이 빠졌다 → 별도 실행으로 바로잡음(이후 위 1 로 원래 값 복구).

### 7-1. Owner 결정 필요 (설계와 기존 계약 충돌 · 규정 7 — 임의 선택 안 함)
| 항목 | 충돌 | 이번에 한 것 |
|---|---|---|
| B-3 발송 직전 방어(「푸시만」 회차 실패 처리) · B-16 이벤트 배포 기본 대상 `all` | 이벤트 배포는 「푸시 = push_only」「종 = in_app_only」를 **따로** 만드는 계약. 푸시를 알림함+푸시로 바꾸면 종과 함께 켠 이벤트는 알림함 행이 2번 생긴다. 발송 직전 방어를 넣으면 이벤트 푸시가 전부 실패한다 | **하지 않음.** 관리자 작성·수정 입력만 거부(조용한 변환 제거), 예전 행(이벤트 배포 초안 포함) 수정은 유지 · 다시 보내기는 새 규칙(알림함+푸시·전원)으로 |

### 7-2. 반영 (단계 B · 웹만)
| # | 변경 |
|---|---|
| B-1 | `PATCH /api/me/notifications` `opened` · 열기 4곳(알림함 행·종 팝업 행·앱 안 배너·**알림 상세**)만 전송 · 서버는 `campaignOpened` 일 때만 **in_app 행**만 열람 · 푸시 탭 = 그 알림 전체 · 열람 수 = 회원 수(중복 제거) |
| B-2 | 판정 결과 `domainPushReason` 추가 · 사유 = 영역(전체 끔·미동의·공지 끔) → 방해금지 순 |
| B-3 | 입력 `push_only` → 400 `push_only_retired`(예전 행 수정만 유지) · 다시 보내기는 알림함+푸시 |
| B-4 | 미리보기 설정 읽기 오류 → `pushPreviewFailed` · 작성 화면 「푸시 인원 계산 실패 · 다시 시도」 · 쓰지 않던 `loadCampaignSettingsMaps`·`evaluateCampaignUserEligibility`·`maps` 인자 삭제 · 설정 읽기에서 옛 열 `marketing_push_enabled` 제거(DB 열·타입 유지) |
| B-5 | dispatch 빈 결과 사유 그대로 기록 · 실제 기록되는 사유 한·영 라벨 |
| B-6 | 상세 「재발송」 = `resend(mode=failed)` 새 알림 → 새 알림 상세로 이동 · `resendOccurrence` 삭제 |
| B-7 | 테스트 발송: 회원별 예외 → 실패 기록 후 계속 · finally 로 회차 항상 마무리 |
| B-8 | 게이트 → 배지 순서 · 배지 계산 실패면 `badge_count` 없음(0 안 보냄) |
| B-9 | 발송 기록 실패 → 회차 `record_error_count`+1 · 상세 「기록 실패 N건」 · 대상 기록 실패 → 예외 → 그 회원 `failed`(그것도 못 쓰면 배치 중단·다음 실행이 이어서) · 집계 읽기 실패 → 완료 처리 안 함 |
| B-10 | 회차 집계 페이지 읽기 |
| B-11 | 대상 스캔 = 마지막 id 다음(`send_progress_cursor`) · `active_users` 기준 시각 회차에 고정(`active_since`) |
| B-12 | 회차 번호 DB 배정(`p_sequence_number = null`) · 반복 횟수·직전 시각 = 반복 회차만 · 반복 회차 멱등 키 = 반복 시각 |
| B-13 | 결과 배지: 대상 0 = 「대상 없음」 · 알림함 전용 = 「알림함 전달 · 푸시 해당 없음」, 푸시 칸 「해당 없음」 · 캠페인 합계 = 테스트 제외 최신 회차 · 반복 회차 대상 스냅샷 |
| B-14 | 가입 동의: 선택 동의 먼저 저장 → 실패면 필수도 저장 안 함 · 조회 오류면 체크박스 보임 |
| B-15 | 알림 설정 PATCH: 현재 행 읽기 오류 503 · 행 있으면 바뀐 열만 UPDATE |
| B-16 | 입력 `marketing_opt_in` → 400 `marketing_opt_in_retired`(예전 행 수정만 유지) · 미리보기·스캔은 예전 행 표시용으로 유지 |
| B-17 | 닫음 = push 행 `sent/pending` 만 · 집계에서 닫음 = 받음 · 푸시 탭 열람은 닫음 행도 열람으로 |
| B-18 | 테스트 발송: 본인 외 회원 → `manage` · 관리자당 1분 10회(429) |
| B-19 | `DibayBottomNotificationBanner`·`admin-banner-feed` 라우트·두 테스트 삭제 |
| B-20 | 예전 키 재시도 삭제 · 반복 회차는 이전 회차 받는 사람을 **복사**(옮기지 않음) |

### 7-3. 검증 (로컬 · 최종 트리 1회)
`typecheck:build` PASS · `typecheck:test` PASS · 관련 vitest 117 파일 1,367건 PASS(신규 `admin-push-confirmed-fix-2026-11-04.test.ts` 13건 포함) · 변경 파일 eslint 오류 0(경고 7 = 기존 코드) · `verify:routes` PASS. 운영·실기기는 NOT_PROVEN(Cursor 실기 대기).
