# 혜택·이벤트 수신 동의 + 알림 받는 사람 — 수정 계획안 (2026-11-03 17:30 PHT)

> 계획 보고. 코드·운영 DB 변경 없음. 기준: origin/main `0a1bdf964` · 운영 DB 읽기 전용.
> Owner 지시 원문(2026-11-03): 「기존 회원은 마켓팅 수신의 동의로 하고 신규부분부터 동의 화면을 넣는 부분으로 하고 명확히 어드민에서 동의 화면을 수정 하게 해줘, 내정보에서도 해당 동의 부분을 on off 형식으로 명확하게 해줘」
> 앞 문서: `admin-push-event-send-audit-2026-11-03.md`(결함) · `admin-push-process-redesign-2026-11-03.md`(프로세스)

## 0. 지금 상태 (확인한 것)
| 항목 | 지금 | 근거 |
|---|---|---|
| 가입 동의 화면 | 필수 2개(이용약관·개인정보)만, 광고 동의 없음 | `components/auth/AuthConsentForm.tsx` |
| 어드민 문서 관리 | `/admin/app/legal` — 약관·개인정보만 (ko/en·버전·게시) | `app_legal_documents.kind CHECK ('terms','privacy')` |
| 동의 기록 | `profiles.terms_version/privacy_version/…_accepted_at` — 광고 동의 기록 없음 | 운영 DB `profiles` 열 |
| 내정보 | 「마케팅·이메일 › 마케팅 알림」 스위치, 설명 없음 | `NotificationsSettingsContent.tsx:368` |
| 동의 저장 | 2곳 동시: `user_notification_settings.marketing_enabled` + `user_settings.marketing_push_enabled` | 같은 파일 |
| 운영 회원 130명 | 둘 다 ON 9 · 둘 다 OFF(설정 행 있음) 8 · 행 없음/OFF 113 | 운영 DB 조회 |

## 1. 바꾸는 것 (5단계 · 한 작업으로 main 1회 반영)

### 단계 1 — 어드민에서 동의 문구 수정 (`/admin/app/legal`)
- 문서 종류에 **「혜택·이벤트 수신 동의」(`marketing`)** 추가. 약관·개인정보와 같은 화면·같은 방식(ko/en · 버전 · 작성 중/게시).
- 내용: **제목** = 가입 화면 체크박스·내정보 스위치 이름 (예: 「혜택·이벤트 알림 받기」) · **본문** = 무엇을·어떻게 보내는지·끄는 방법 (필리핀 DPA 목적 고지).
- 게시한 최신 버전이 가입 화면과 내정보에 바로 쓰인다. 버전이 바뀌어도 기존 동의 회원에게 다시 묻지 않는다(선택 항목).
- 파일: `lib/legal/app-legal-documents.ts`(`APP_LEGAL_KINDS`), `AdminAppLegalDocumentsPage.tsx`, `AdminAppLegalDocumentForm.tsx`, `app/api/admin/app-legal-documents/**`, `app/api/legal/[kind]`, 회원용 전문 화면 `/legal/marketing`(기존 `/terms`·`/privacy` 와 같은 화면 재사용).
- DB: `app_legal_documents.kind` 허용값에 `marketing` 추가 + ko/en 첫 문서 1건씩(게시).

### 단계 2 — 신규 가입 동의 화면
- 필수 2개 아래 **[선택] 「(어드민 제목)」 [전문 보기]** 체크박스 1개. **처음엔 체크 안 됨**.
- 「동의하고 시작」 버튼 조건은 필수 2개 그대로 (선택 항목은 안 해도 가입됨).
- 저장: 체크 = 동의(ON), 안 함 = 거부(OFF) · 동의 시각 · 동의한 문서 버전 · 출처 `signup`.
- 파일: `AuthConsentForm.tsx`, `app/api/me/legal-consent/route.ts`, `lib/legal/resolve-required-consent-versions.ts`(marketing 게시 버전 읽기).

### 단계 3 — 기존 회원 = 동의 (데이터 1회 적용)
- 가입 완료된 회원 전원(운영 130명 · 적용 시점 재조회)을 **ON** 으로 설정. 출처 `existing_member_default` · 적용 시각 기록.
- 신규 회원(적용 이후 가입)은 단계 2 화면에서 고른 값.
- **운영 DB 적용 = Owner 승인 후** (마이그레이션 + 데이터 변경). 적용 전 130명 현재값 백업 · 적용 후 열 단위 대조 보고.

### 단계 4 — 내정보 ON/OFF
- 내정보 › 알림 설정 맨 위 구역 **「혜택·이벤트 알림」**: 큰 스위치 + 상태 글자 **「받음 / 받지 않음」** + 어드민 본문 요약 1줄 + [전문 보기] + 「마지막 변경 2026-11-03 17:30」.
- 끄면 즉시 저장, 이벤트·마케팅 **푸시**가 멈춤(알림함은 계속 — 단계 5). 켜면 다시 받음. 변경 시각·출처 `settings` 기록.
- 이름을 회원 알림 탭 「혜택·이벤트」와 같게. 「마케팅·이메일」 구역 이름 정리.
- 파일: `NotificationsSettingsContent.tsx`, `app/api/me/notification-settings/route.ts`, i18n `my.ts`.

### 단계 5 — 발송 판정 (받는 사람)
| 분류 | 알림함 | 푸시 |
|---|---|---|
| 공지사항 · 시스템 안내 · 업데이트 | 전체 | 기기 있는 전체 |
| 이벤트 · 마케팅 | **전체** | **동의 ON 회원만** |
- 동의 판정은 **1곳**(단계 3의 열)만 읽는다. `user_settings.marketing_push_enabled` 판정 제거.
- 어드민 작성 화면: 받는 사람에 「알림함 N명 · 푸시 N명(동의 회원)」 표시 · 「광고 수신 동의 회원」 대상 선택지 삭제.
- 어드민 결과: 「푸시 미동의」 칸을 「기기 없음」과 분리.
- 파일: `campaign-eligibility.ts`, `campaign-audience-preview.ts`, `campaign-send-user.ts`, `AdminNotificationCampaignCreatePage.tsx`, `AdminNotificationCampaignsPage.tsx`, `AdminSentNotificationPanels.tsx`, `campaign-list-service.ts`.

## 2. DB 변경 (마이그레이션 1개 · 운영 적용 별도 승인)
- `user_notification_settings`: `marketing_consent_at timestamptz`, `marketing_consent_source text`(signup·existing_member_default·settings), `marketing_consent_version text` 추가. **동의 = `marketing_enabled` 하나**.
- `app_legal_documents.kind` CHECK 에 `marketing` 추가 + 첫 문서 ko/en.
- 기존 회원 데이터: 단계 3.

## 3. 영향받는 곳 · 같은 단계에서 처리
| 영향 | 처리 |
|---|---|
| 기존 계약 `campaign-eligibility`(알림함까지 동의 판정) · 고객 커뮤니케이션 hard-lock 문서 | 단계 5 표로 개정 |
| 어드민 「받는 사람 › 광고 수신 동의」 필터(목록) | 과거 발송 표시는 유지, 새 작성에서만 삭제 |
| 가입 흐름 테스트·`verify-app-boot-consent-contract` | 선택 항목 추가에 맞춰 갱신 |
| 매장 주문 알림 「마케팅·이벤트 알림 받기」(`order_notifications_marketing`) | 손대지 않음 (다른 기능) — 범위 밖 |
| 네이티브 | 변경 없음 → 웹 배포만, 앱 재시작으로 반영 |

## 4. 위험 · 충돌 (보고)
1. **Apple 4.5.4 충돌**: iPhone 홍보 푸시는 「앱 화면 동의 문구로 명시적 동의」가 조건. 기존 회원 일괄 ON 은 이 동의가 아님. 해당 iPhone 회원 = 기기 등록 5명(푸시 토큰 살아 있는 iPhone 2대). 심사에서 문제될 수 있음 — Owner 지시대로 진행하되 위험으로 기록.
2. **8명**은 알림 설정 저장 기록이 있고 광고 OFF 상태 — 직접 끈 것인지 구분할 기록이 없음. 지시대로 ON 으로 바꾸면 필리핀 DPA 「거부 권리」에 걸릴 수 있음. 내정보 스위치로 끌 수 있게 하는 것으로 대응.
3. 단계 5로 공지·시스템의 「회원이 공지 알림 끔(notice_disabled)」 판정을 없앨지는 앞 프로세스 문서 기준(전원)으로 진행 — 회원은 OS 알림 끄기만 가능.

## 5. 검증
- 코드: `typecheck:build` · 관련 vitest(동의·발송 판정·문서 종류) · 변경 파일 eslint · `typecheck:test`.
- 운영(적용 후): 130명 동의 열 대조 · 어드민에서 동의 문서 수정→가입 화면 문구 반영 · 시험 계정 신규 가입(체크/미체크 각 1) · 내정보 ON/OFF 저장 · 이벤트 시험 발송(시험 계정만) 알림함 전원·푸시 동의만.
- 실기기: Android·iPhone 가입 화면 · 내정보 스위치 · 이벤트 푸시 수신·탭 → 목적지. 측정 전 NOT_PROVEN.
