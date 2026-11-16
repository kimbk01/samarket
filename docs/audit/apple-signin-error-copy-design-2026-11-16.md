# Apple 로그인 실패 문구 설계안 (2026-11-16)

## 근거
- 11-16 07:58~08:01 PHT iPhone(1.2.2 (35)) Apple 가입 실패 = Apple 인증 서버 HTTP 503 14회(akd 로그). Apple 창이 자체 경고를 띄운 뒤 앱에 `ASAuthorizationError Code=1000` 반환.
- 앱 경로: `NativeAppleAuthPlugin.swift` `authorizationController(didCompleteWithError:)` — 취소(1001) 외 모든 오류를 `call.reject("apple_native_config_error", localizedDescription)` → JS `mapNativeApplePluginError` → `apple_native_config_error` → `use-oauth-login.ts:267` → `auth_err_oauth_start_failed`「소셜 로그인을 시작하지 못했습니다.」
- 문제: 실제로는 Apple 단계에서 끝나지 않은 것인데 「시작하지 못했다」·「소셜」로 표시 → 고객이 원인·다음 행동을 알 수 없음.

## 변경 (웹만)
| 파일 | 변경 |
|---|---|
| `lib/auth/oauth/use-oauth-login.ts:267` | `apple_native_config_error`·`apple_native_token_missing` → 새 키 `auth_err_apple_native_not_completed` |
| `lib/i18n/catalog/auth-ui.ts` (ko·en 동시) | 새 키 추가 |
| `lib/auth/oauth/use-oauth-login.ts:238` | `mapOAuthErrorToMessage` export (시험용) |
| `lib/auth/oauth/__tests__/` | 매핑 시험 1개 |

문구 초안 (Owner 확인 대상):
- ko: 「Apple 로그인이 완료되지 않았습니다. 잠시 후 다시 시도해 주세요. 계속되면 다른 방법으로 로그인해 주세요.」
- en: "Apple sign-in didn't finish. Please try again in a moment. If it keeps happening, use another sign-in option."

## 바꾸지 않는 것
- 네이티브(Swift)·빌드 번호 — 설치된 1.2.2 (35)·1.2.3 (46) 모두 이미 `apple_native_config_error` 를 보내므로 웹 반영만으로 바뀜.
- 취소(1001) 문구, 서버 교환 오류 문구(verify_failed 등), 카카오·Google 문구.

## 한계
- `Code=1000` 은 Apple 서버 503 과 앱 설정 오류(권한 누락 등)에 똑같이 나온다. 로그상 userInfo 도 비어 있어("(null)") 앱이 503 을 구분할 수 없음 → 문구에 「Apple 서버 장애」라고 단정하지 않는다.
- 실패가 서버에 기록되지 않는 문제는 이 설계 범위 밖(보고만).

## 영향 화면
`useOAuthLogin` 사용처 전부 같은 함수 경유: `app/login/LoginPageClient.tsx`, `components/auth/AuthLoginPanel.tsx`, `components/auth/AuthModal.tsx`, `components/auth/AuthProviderEmailConflictHost.tsx`.

## 검증
- 코드: 매핑 vitest · `check:i18n-quality` · `typecheck:build` · eslint.
- 실기: Apple 503 은 재현 불가 → 실기 NOT_PROVEN. 대체로 iPhone 에서 Apple 창의 오류 경로를 직접 일으킬 방법 없음.
- 배포 구분: 웹 — main 반영 후 앱 재시작.
- 롤백: 매핑 1줄 원복.
