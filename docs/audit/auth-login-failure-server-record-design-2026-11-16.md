# 로그인 실패 서버 기록 설계안 (2026-11-16)

## 왜
11-16 07:58~08:01 PHT Apple 가입 실패 7회가 서버에 0건 → 기기 로그(sudo log collect)로만 확인 가능했다.
로그인 버튼 이후 **서버 교환 전**에 끝난 실패·취소는 지금 기기 콘솔(`[oauth] auth_lifecycle_complete`)에만 남는다.

## 기존 자산 (재사용)
- `lib/auth/oauth/auth-lifecycle-trace.ts` — 로그인 1회마다 `authFlowId`·platform·provider·lastStage·elapsedMs·result(ok/fail/cancel)·errorCode 를 이미 계산하고 민감 키를 지운다(`redactAuthLifecycleDetail`). 모든 제공자(Apple·카카오·Google·웹 OAuth)가 `failAuthLifecycle`/`cancelAuthLifecycle` 를 거친다(`use-oauth-login.ts` 6곳).
- `x-dibay-auth-flow-id` 헤더가 이미 교환 요청에 실림 → 서버 교환 로그와 같은 ID 로 이을 수 있음.
- 앱 진입 계측 C8 (`app/api/telemetry/entry` · `app_entry_failures` 30일 · sendBeacon · 항상 204 · 남용 제한 · IP 미저장) — 같은 틀을 그대로 쓴다.

## 설계
1. **수집 지점 1곳**: `completeAuthLifecycle` 의 관측 콜백(`setAuthLifecycleCompletionSink`, 추적 모듈 import 금지 계약 유지) → `use-oauth-login.ts` 가 등록, `fail`·`cancel` 이면 sendBeacon 1회. (`ok` 는 보내지 않음 — 성공은 교환 API 가 이미 기록)
2. **보내는 값** (계약 파일에서 허용 목록으로 정규화):
   `authFlowId`(무작위) · `provider` · `platform` · `result` · `errorCode` · `lastStage` · `elapsedMs` · `nativeErrorCode`(숫자만, 없으면 null) · `appVersion`·`appBuild` · `webSha`
   보내지 않음: 사용자 ID·이메일·토큰·nonce·오류 설명 원문·IP·User-Agent.
3. **Apple 오류 번호 (`nativeErrorCode`)**: 지금 Swift 는 `reject("apple_native_config_error", localizedDescription)` 로 보내 JS 에서 설명이 버려진다. `native-apple-auth-plugin.ts` catch 에서 플러그인 오류 원본의 설명에서 `AuthorizationError … 1000` 의 **숫자만** 뽑아 오류 객체에 붙인다(웹만 → 설치된 35·46 에도 적용). 설명 문구가 언어별로 달라 실제로 숫자가 들어있는지는 **실기 NOT_PROVEN** — 없으면 null.
4. **서버**: `app/api/telemetry/auth-failure/route.ts` (인증 없음·항상 204·본문 크기 제한) → Vercel 로그 1줄 `[dibay-auth-failure]` + `public.auth_login_failures` 표에 저장(30일, 같은 authFlowId 1행, 인스턴스 분당 60행·IP 당 시간당 20행 제한 — C8 과 같은 값).
5. **회원 게이트**: `lib/auth/member-action-policy.ts` 비회원 허용 경로에 수집 경로 추가(로그인 전 기록이라 필수).

## 바뀌는 파일
| 구분 | 파일 |
|---|---|
| 웹 | `lib/auth/oauth/auth-lifecycle-trace.ts`, `lib/auth/native/native-apple-auth-plugin.ts`, 새 `lib/telemetry/auth-failure-telemetry.{contract,client}.ts`, 새 `lib/telemetry/auth-failure-store.server.ts`, 새 `app/api/telemetry/auth-failure/route.ts`, `lib/auth/member-action-policy.ts` |
| DB | 새 마이그레이션 `auth_login_failures` (RLS 켬·정책 없음 = service_role 만) |
| 시험 | 계약 정규화(민감값 제거)·숫자 추출·저장 대상(fail/cancel 만) |

## 영향·위험
- 로그인 동작 무변경: 송신은 sendBeacon·실패 삼킴(기존 `emitAuthLifecycleLog` 와 같이 예외가 로그인을 막지 않음).
- 503 으로 Apple 경고를 닫은 경우 일부는 앱에 **취소(1001)** 로 들어온다(11-16 로그 07:59:13). 그래서 cancel 도 기록한다 — 사용자의 진짜 취소와 섞이므로 판정은 시각·연속 횟수로 한다.
- 로그인 화면 외 경로 영향 없음(수집 지점이 로그인 흐름 추적에만 있음).

## 순서·승인
- 배포 구분: 웹 + DB. **운영 DB 적용(표 생성) Owner 승인 필요** → 승인 후 적용 → PR 병합(자동 병합 예외: DB 먼저).
- 검증: 코드 PASS(vitest·i18n 무관·typecheck·eslint) + iPhone 에서 Apple 창 「취소」 1회 → 표에 1행·`result=cancel` 확인(운영 DB 조회). Apple 503 실패 기록은 재현 불가 → NOT_PROVEN.
- 롤백: 수집 지점 1줄 제거(표는 남겨도 무해).
