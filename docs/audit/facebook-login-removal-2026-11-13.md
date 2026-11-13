# Facebook 로그인 잔재 제거 · 운영 DB 주석 교체 (2026-11-13)

- 지시: Owner 「2번 묶음 Facebook 로그인 제거도 진행해」·「끝나면 DB 적용하고 바로 PR 올려」 (2026-11-13).
- 근거 감사: `docs/audit/legacy-brand-terms-audit-2026-11-13.md` §H·§I.
- 마이그레이션: `supabase/migrations/20271114200000_remove_facebook_login_provider.sql`.

## 적용 전 조회 (운영 `ckdosyydvgzqwpbwuhon`, 읽기 전용)

| 항목 | 값 |
|---|---|
| Facebook 사용자 | `profiles` 0 · `users` 0 · `user_auth_identities` 0 · `auth.identities` 0 |
| Facebook 프로필 사진 주소 | `profiles.avatar_url` 0 · `auth.users` 메타 0 |
| 설정 행 | `auth_providers.facebook enabled=false`, `auth_login_settings.facebook enabled=false` |
| 참조 | 외래키 0 · 함수 본문 0 |
| CHECK 제약 | 6개에 `'facebook'` 포함 |
| 레거시 주석 | 5건 (당근형 2 · Baemin-style 1 · Telegram/Kakao 1 · Discord/Telegram-style 1) |

### 삭제한 행 백업 (원문)

```json
{"table":"auth_providers","id":"3eb63968-ca01-43e3-8e85-7cf945d3a4b4","provider":"facebook","enabled":false,"client_id":"","client_secret":"","redirect_uri":"https://ckdosyydvgzqwpbwuhon.supabase.co/auth/v1/callback","scope":"","sort_order":5,"created_at":"2026-04-25T22:14:22.377592+00:00","updated_at":"2026-04-26T20:26:42.633596+00:00","client_secret_configured":false}
{"table":"auth_login_settings","id":"facebook","provider":"facebook","label":"Facebook","enabled":false,"sort_order":6,"created_at":"2026-04-25T20:06:19.724398+00:00","updated_at":"2026-10-21T19:59:57.125+00:00"}
```

## 적용

- 2026-11-13 PHT, 운영 DB 한 트랜잭션 실행 + `supabase_migrations.schema_migrations` 에 `20271114200000 remove_facebook_login_provider` 기록 (기존 기록 방식과 같게 version·name 만).

## 적용 후 대조

| 항목 | 전 | 후 |
|---|---|---|
| `'facebook'` 포함 CHECK 제약 | 6 | **0** (같은 이름 6개 재생성 확인) |
| `auth_providers` | facebook:false, google:true, naver:false, apple:true, kakao:true | google:true, kakao:true, naver:false, apple:true |
| `auth_login_settings` | google:true, kakao:true, naver:false, apple:true, facebook:false, password:true | password:true, google:true, kakao:true, naver:false, apple:true |
| 레거시 용어 주석 | 5 | **0** |
| `profiles` 행 수 | 143 | 143 |

Facebook 외 공급자 설정 값은 변경 없음.

## 코드

- 공급자 목록·타입에서 `facebook` 제거: `lib/auth/*`(공급자 목록·로그인 설정 기본값·항상 차단 목록·프로필 정규화·회원 정책), 네이티브 교환 계약·어댑터(Facebook stub 삭제), OAuth 라우팅, 관리자 회원 표시(`lib/admin-users/*`, `lib/types/admin-user.ts`, `AdminTestUserDetail`, `AuthLoginSettingsForm`), 로그인 버튼 아이콘(`SiFacebook`)·스타일, 내 정보 공급자 배지 색.
- i18n 키 삭제: `admin_user_provider_facebook`, `auth_provider_continue_facebook`; OAuth 안내 문구에서 페이스북 제거.
- `config/image-remote-patterns.json` 의 `graph.facebook.com` 제거 (사진 주소 0건 확인).
- 테스트: Facebook 전용 케이스 삭제, 나머지 공급자 검증은 유지.

## 남은 위험

- Supabase 대시보드 Auth 의 Facebook 공급자 설정은 바꾸지 않음 (설정 변경은 별도 승인 항목). 앱·서버 코드가 시작하지 않으므로 로그인 경로는 없음.
- 실기기·Production 확인: NOT_PROVEN.
