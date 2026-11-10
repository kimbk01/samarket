# 필리핀 전화 인증 문자 지연 — 재감사 결과와 설계안 (v2)

- 작성: 2026-11-10 PHT (v1 대체)
- Owner 지시 원문:
  1. 「필핀 전화인증 번호가 늦게 오는 부분을 확인 해라」
  2. 「크래딧이 올라 간다고??? 그게 맞어??」
  3. 「정확히 다시 감사 해서, 정확힌 부분이면 적용 하고 다른 문제는 없는지?? 철저히 확인 해서, 설계안을 다시 만들어라」
- 관련 결정: 필리핀 +63 = Semaphore · 한국 +82 = Solapi (Owner 2026-11-09)
- 배포 구분: **웹만** (`lib/` 2파일 + 테스트). 네이티브·DB·환경변수 변경 없음.

## 1. 확인된 사실 (모두 직접 조회)

| # | 항목 | 증거 | 결과 |
|---|---|---|---|
| F1 | 지금 발송 경로 | `lib/auth/semaphore-sms.ts` → `POST /api/v4/messages` | 일반 대기열 |
| F2 | 서버 → Semaphore → 통신사 넘김 | `GET /messages/{id}` created_at→updated_at, 운영 DB 발송 기록과 같은 초 | Globe 5건 3~5초(11-10 11:32~11:38) · Smart 4건 3~5초(11-09) |
| F3 | 늦는 구간 | F2 | **통신사 → 휴대폰** (DIBAY·Semaphore 구간 아님). 휴대폰 도착 시각은 **NOT_PROVEN** (통신사 수신 확인 없음) |
| F4 | 회원 체감 | 운영 DB `phone_otp_delivery_events`·`phone_otp_challenges` | 11-10 회원 50b199bb 6분간 5회 발송, 인증 0, 입력 시도 0 · 11-09 회원 d7c444e3 15:06~16:10 5회 후 인증 |
| F5 | 크레딧 | Semaphore `GET /account/transactions` | `/messages` 앱 발송 16건(10-19~11-10) 모두 **-1** · `/otp` 1건(11-09 05:41, 메시지 284460624, type=Otp, 33자, Smart, 3초 뒤 Sent) **-2** |
| F6 | `/otp` 사용 가능 | F5 의 1건 | 이 계정·발신 이름 DIBAY 로 `/otp` 발송 성공. 이 1건은 DIBAY 발송 기록에 없음 — 직접 호출, 출처 확인 못 함 |
| F7 | 잔액·사용량 | `GET /account` · 운영 DB | 9,967 크레딧 · 최근 30일 필리핀 성공 16건 → 바꾸면 월 +16 크레딧 |
| F8 | 운영 설정 | `auth_phone_settings` | 유효 300초 · 재발송 대기 60초 · 시도 5회 |
| F9 | 번호 지정 이름 | Semaphore 문서(api.semaphore.co/docs) | 같은 절에 `code`(요청 설명)와 `otp`(응답 설명) 두 이름이 적혀 있음 — 하나로 확정 못 함 |
| F10 | 서버 응답 시간 | Vercel 런타임 로그 | 전화 인증 요청은 로그가 남지 않음 → 측정 못 함. 대신 F2 에서 운영 DB 기록 시각과 Semaphore 접수 시각이 같은 초로 확인됨 |

## 2. 재감사 결과 — 문제 목록

| # | 문제 | 근거 | 이번 반영 |
|---|---|---|---|
| P1 | 인증번호를 일반 대기열 경로(`/messages`)로 보냄. Semaphore 는 인증번호용으로 따로 있는 길(`/otp`, 통신사에 문자가 몰려도 도착하도록 만든 경로)을 제공 | F1·Semaphore 문서 | **반영** (3절) |
| P2 | 다시 보내기마다 새 번호로 덮어써서, 늦게 온 앞 문자의 번호는 「올바르지 않습니다」 | `phone-otp-service.ts:304` 새 번호 → `:308` 덮어쓰기 (회원), `store-phone-otp-service.ts` 새 행 (매장) | 미반영 — 인증 규칙·DB 변경이라 **Owner 결정 필요** (5절) |
| P3 | 회원 인증: 문자 보내기 **전에** 새 번호로 덮어씀 → 보내기가 실패해도 앞에 받은 유효 번호가 무효가 됨 (화면은 「실패」) | `phone-otp-service.ts:308`(덮어쓰기) → `:311`(발송). 매장 인증은 실패 시 새 행을 지워 이 문제 없음 | 미반영 — 보고만 (5절) |
| P4 | Semaphore 호출에 시간 제한 없음 → Semaphore 가 멈추면 화면이 「보내는 중」으로 오래 남음 | `semaphore-sms.ts` fetch 에 시간 제한 없음 | 미반영 — 보고만 (실제 발생 기록 없음) |
| P5 | 발송 기록에 통신사(Globe/Smart)·접수→넘김 시각이 없음 → 지연을 조사하려면 Semaphore 를 따로 조회해야 함 | `phone_otp_delivery_events` 열 | 미반영 — 보고만 |

확인했지만 문제 없음: 화면 [계속]·[다시 보내기]는 보내는 중·대기 시간 동안 눌리지 않음(`PhoneVerificationBox.tsx:286`·`:666`) · 서버 60초 재발송 제한 · 한국(Solapi) 경로는 이번 변경과 무관.

## 3. 반영한 변경 (P1)

### 3-1. `lib/auth/semaphore-sms.ts`
- `sendSemaphoreSms`(일반 경로) → `sendSemaphoreOtpSms(number, messageTemplate, otpCode)` 로 대체 (다른 호출처 없음 — 저장소 전체 검색).
  - `POST {base}/otp` · `apikey`·`number`·`message`(`{otp}` 자리 포함)·`sendername` + 우리 번호를 **`code`·`otp` 둘 다** 같은 값으로 보냄 (F9: 이름이 확정되지 않아 둘 다 보냄).
  - 성공 = 접수(message_id) + 실패 상태 아님 + **회원이 받는 번호가 우리 번호와 같음**(응답 `code` 또는 응답 `message` 에 우리 번호). 확인 안 되면 실패 + `error_summary` 에 `code_mismatch message_id=…` 기록.
  - HTTP 오류는 `error_summary` 에 `Semaphore HTTP {상태}` 로 기록 (전에는 원인 없이 「발송에 실패했습니다」만).
  - `{otp}` 자리가 없는 문구·6자리가 아닌 번호는 보내지 않음.
  - 실패 시 일반 경로로 다시 보내지 않음 — 같은 번호 두 번·비용 두 배 방지.
  - 비운영 차단(`checkSideEffectAllowed("sms_semaphore")`)·번호 형식 검사 그대로.

### 3-2. `lib/auth/phone-verify-sms.ts`
- 필리핀만: `sendSemaphoreOtpSms(target.e164, "[DIBAY] Verification code: {otp}", otpCode)`. 회원이 받는 문구는 지금과 같음(33자, 1건). 한국 분기 그대로.

### 3-3. 테스트
- `lib/auth/__tests__/semaphore-sms.test.ts`: `/otp` 주소·`code`·`otp`·`{otp}` 전송 · 응답 `message` 로 확인 · 다른 번호 → 실패·원인 기록 · Failed·HTTP 500 → 실패 · 잘못된 요청은 보내지 않음.
- 함수 이름 변경 반영: `phone-otp-runtime-gate.test.ts`·`phone-otp-send-preserves-profile.test.ts`·`side-effect-gate-transports.test.ts`.

## 4. 영향 범위 (저장소 전체 검색)

| 호출처 | 화면 | 영향 |
|---|---|---|
| `lib/auth/phone-otp-service.ts` | 회원 전화 인증 | 필리핀 문자 경로만 바뀜. API 응답·화면 변경 없음 |
| `lib/stores/store-phone-otp-service.ts` | 매장 신청 전화 인증 | 같음 |
| `semaphore-account.ts`·`phone-otp-ops.ts` | 어드민 전화 인증 운영 | 계정 조회만 — 변경 없음 |
| 한국 +82 Solapi | — | 변경 없음 |

- 비용: 필리핀 1건 1 → 2크레딧 (F5 실측). 월 +16 크레딧 (F7 기준).
- 설치된 앱 바이너리와 무관 (서버에서 발송).

| 깨질 수 있는 것 | 대응 |
|---|---|
| F9 이름이 둘 다 무시되면 Semaphore 가 자기 번호를 만들어 보냄 | 응답 대조로 즉시 실패·기록 → 스테이징 1건으로 확인 (6절). 실패하면 Promote 하지 않음 |
| `/otp` 로도 통신사 구간이 늦음 | 효과는 실기기 측정으로만 판정. 개선 없으면 FAIL 보고 |

롤백: 커밋 1개 `git revert` → main. 운영은 Vercel 직전 배포 「Instant Rollback」. DB·설정 정리 없음.

## 5. Owner 결정 필요 (이번에 손대지 않음)

- **P2** 다시 보내기 후 앞 번호 무효: 고치려면 「유효 시간 안의 앞 번호도 받는다」 같은 인증 규칙 변경 + 앞 번호 보관 열(DB) 추가가 필요. P1 실기기 결과로 지연이 해소되면 필요 없을 수 있음.
- **P3** 회원 인증 발송 실패 시 앞 번호 무효: 매장 인증처럼 「보낸 뒤 저장」 또는 「실패 시 되돌림」으로 바꾸는 수정. 인증 기록 계약 테스트(`phone-otp-contract`) 범위.
- **P4·P5**: 실제 발생 기록 없음 — 보고만.

## 6. 검증

| 단계 | 내용 | 상태 |
|---|---|---|
| 코드 | `typecheck:build`·`typecheck:test`·관련 vitest 624건·변경 파일 eslint·`check:i18n-quality` | 보고서 참조 |
| 스테이징 1건 | 스테이징 주소에서 필리핀 번호로 1회 발송 → 운영 DB `phone_otp_delivery_events` 가 success(provider_message_id) 인지, `code_mismatch` 가 아닌지 · Semaphore `GET /messages/{id}` type=Otp · 받은 번호로 인증 성공 | NOT_PROVEN (휴대폰 필요) |
| 실기기 지연 | Globe 1번호·Smart 1번호 각 3회: 요청 시각(DB)·Semaphore 넘김 시각·휴대폰 도착 시각·인증 성공. 바꾸기 전 기록(F2·F4)과 비교 | NOT_PROVEN |
| 운영 반영 | Promote 는 Owner 승인 후 | 대기 |
