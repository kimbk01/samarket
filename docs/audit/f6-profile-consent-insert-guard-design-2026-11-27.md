# F6 설계 — 회원이 동의 열을 채운 `profiles` 행을 직접 넣지 못하게 · 2026-11-27 PHT

- 지시: Owner 「F6 설계 작성」 (2026-11-27)
- 상태: **설계만. 코드·DB 변경 없음.** 승인 뒤 운영 DB 에 적용한다.
- 근거:
  - 운영 main `b1a70f8`
  - 운영 DB `ckdosyydvgzqwpbwuhon` 읽기 전용 조회 (2026-11-27 17:00~17:20 PHT). 함수·트리거·권한은 운영의 현재 정의로 판단했다.
- 실기기·운영 사이트: 열지 않음 (실행 0회)

## 1. 결함

**`profiles` 행이 아직 없는 로그인 회원은, 동의 열을 채운 자기 `profiles` 행을 DB 에 직접 넣을 수 있다.**
- 그렇게 넣으면 동의 화면을 거치지 않았는데도 서버가 「약관·개인정보·연령 동의 완료」로 판정한다.
- 동의 기록(`member_consent_events`)도 남지 않는다.

| 근거 (운영 조회) | 값 |
|---|---|
| 표 단위 INSERT 권한 | `authenticated`·`anon` 둘 다 있음 → 모든 열에 넣을 수 있음 |
| INSERT 정책 `profiles_insert_own_or_admin` | `TO authenticated` · `WITH CHECK (id = auth.uid() OR 관리자)` → 본인 행이면 통과 |
| 삽입 방지 트리거 `guard_profiles_self_insert` | 막는 열: 전화 인증·역할·관리자·포인트·아이디·실명 인증. **막지 않는 열: `terms_accepted_at`·`terms_version`·`privacy_accepted_at`·`privacy_version`·`date_of_birth`·`age_gate_status`·`age_attested_at`** |
| 서버 동의 판정 | 위 7개 열만 본다 (`resolve-member-consent-authority.ts:82-85` → `hasRequiredMemberConsents` = 약관 버전 + `member-age-gate.ts:58-71` 연령) |
| 해당될 수 있는 회원 | 로그인 계정은 있고 `profiles` 가 없는 사용자 **9명** (2026-08-08 ~ 11-10 생성. email 7 · kakao 1 · google 1. 마지막 로그인 11-20) |
| 악용 흔적 | **0건.** 동의 기록 없이 동의 열만 있는 회원 31명은 모두 2026-04-27 ~ 10-19 동의다. 동의 기록 표가 생긴 2026-11-06 보다 앞이라 정상적인 옛 데이터다 |

계약:
- C4 `dibay-first-entry-legal-consent-ssot.md` B6: 「동의가 항상 첫 단계」
- 같은 문서: 동의 처리는 `PATCH /api/me/legal-consent` 하나뿐
- 동의는 서버가 기록과 함께 저장해야 한다. 직접 넣은 동의는 기록이 없어 계약 위반 → **FAIL**

**영향 범위:** 가입의 나머지 두 단계는 서버가 지금도 막는다(F3·F4).
- 전화 인증: 열 변경은 트리거가 막고, OTP 는 서버가 확인한다.
- 대표 주소: 회원이 `user_addresses` 에 직접 쓸 수 없다.

따라서 가입 전체를 건너뛸 수는 없고, **동의 단계만** 건너뛸 수 있다.

### 다른 경로는 이미 막혀 있음 (확인함)
| 경로 | 상태 | 근거 |
|---|---|---|
| 이미 있는 행의 약관·개인정보 열 수정 | 막힘 | `guard_profiles_self_update` 가 본인 수정 시 `profiles_restricted_field_update` |
| 연령 3개 열 수정 | 막힘 | `authenticated` 에 열 UPDATE 권한 없음 |
| 옛 연령 인정 표 `member_age_gate_legacy_members` | 막힘 | 회원 쓰기 권한·정책 없음, RLS 켜짐 |
| `profiles` 행 삭제 뒤 다시 넣기 | 막힘 | DELETE 정책 없음 |
| `anon` INSERT | 막힘 | INSERT 정책이 `authenticated` 만 |
| 동의 저장 함수 `record_member_required_consent`·`confirm_dibay_id` | 회원 직접 호출 불가 | 실행 권한 `service_role` 만 |

## 2. 수정 — 삽입 방지 트리거에 동의 열 7개 추가 (DB 만)

- **방법:** `public.guard_profiles_self_insert()` 를 운영의 지금 본문 그대로 두고, 금지 조건에 아래 7개 열을 더한다.
  - `NEW.terms_accepted_at IS NOT NULL` · `NEW.terms_version IS NOT NULL`
  - `NEW.privacy_accepted_at IS NOT NULL` · `NEW.privacy_version IS NOT NULL`
  - `NEW.date_of_birth IS NOT NULL` · `NEW.age_gate_status IS NOT NULL` · `NEW.age_attested_at IS NOT NULL`
  - 어기면 `RAISE EXCEPTION 'profiles_consent_field_insert_forbidden' USING ERRCODE = '42501'`
  - 기존 판정 순서는 그대로 둔다: `service_role` 통과 → 요청 역할이 없으면(DB 직접 실행) 통과 → 회원 요청 검사.
- **열 권한 회수(REVOKE)를 쓰지 않는 이유:** 표 단위 INSERT 권한이 있으면 열 단위 회수는 효과가 없다. 표 단위 권한을 빼고 열 권한으로 다시 주는 방법은 앱의 프로필 생성 경로 전체를 다시 맞춰야 해 위험이 크다. 기존 방식(같은 트리거)에 맞춘다.
- **트리거 정의는 바꾸지 않는다:** `trg_profiles_guard_self_insert BEFORE INSERT FOR EACH ROW` 는 그대로다. 함수 본문만 `CREATE OR REPLACE` 한다.
- **마이그레이션 파일:** `supabase/migrations/20271127220000_f6_profile_consent_insert_guard.sql`. 파일 주석에 운영의 지금 본문(되돌리기용)을 그대로 남긴다.

### 영향받는 곳 전부 (코드 확인)
| 쓰는 곳 | 넣는 동의 열 | 바뀐 뒤 |
|---|---|---|
| 로그인 뒤 프로필 만들기 (`member-access.ts:353-395`, `:500-540`, `ensure-profile-for-user-id.ts:135-161`) | 없음 (약관 열을 넣지 않고 `onboarding_status: "terms_required"`) | 변화 없음 |
| 관리자 회원·직원 만들기 (`admin/users/create`·`admin/staff`·`admin/users/[id]`) | 없음 | 변화 없음 |
| 회원 삭제 초기화 (`admin-user-deletion.ts:49-52`) | `null` 로 수정 (UPDATE·service) | 변화 없음 |
| 동의 저장 (`PATCH /api/me/legal-consent` → `record_member_required_consent`) | 있음 | `service_role` 이라 통과 — 변화 없음 |
| 회원 토큰으로 직접 INSERT (결함 경로) | 있음 | **42501 거부** |

- 앱 화면·API·네이티브 변경 없음. 웹 배포·앱 재빌드 없음.
- 통화 경로와 무관하다.

## 3. 적용·확인 (Owner 승인 뒤)

1. **적용 전 백업(읽기):** `pg_get_functiondef('public.guard_profiles_self_insert')` 를 설계·파일 주석의 원문과 대조한다. 다르면 중단하고 보고한다.
2. **운영 적용:** MCP `apply_migration` 1회.
3. **적용 확인(읽기):** 새 함수 본문에 7개 열이 있는지, 트리거가 켜져 있는지 확인한다.
4. **거부 시험 — 모두 `begin … rollback`, 운영 데이터 남기지 않음:**
   - 시험 대상: 실제로 `profiles` 가 없는 계정 1명(§1 의 9명 중 하나). 가짜 id 는 쓰지 않는다.
   - ① 회원 역할(`authenticated`)·그 계정 토큰 조건에서 동의 열을 채워 INSERT → `42501 profiles_consent_field_insert_forbidden` 이어야 한다.
   - ② 같은 조건에서 동의 열 없이 INSERT(앱의 프로필 만들기와 같은 모양) → 성공한 뒤 롤백. 정상 경로가 막히지 않았는지 보는 시험이다.
   - ③ `service_role` 로 동의 열을 채워 INSERT → 성공한 뒤 롤백. 서버 경로가 막히지 않았는지 보는 시험이다.
   - ④ 시험 뒤 그 계정의 `profiles` 행 0개 재확인.
5. **운영 오류 확인:** 적용 뒤 Postgres 오류 기록에서 내 시험 외의 새 오류 0을 확인하고, Vercel 런타임 오류 0을 확인한다.
6. **PR:** 마이그레이션 + 이 설계 + 감사 문서 정정을 PR 1개로 올리고 자동 병합을 등록한다. DB 만 바뀌므로 Vercel 빌드에 영향이 없다(개발 프로세스 「DB 적용이 먼저 필요한 변경」).

**되돌리기:** 파일 주석의 원래 함수 본문으로 `CREATE OR REPLACE` 1회. 데이터 변화가 없어 되돌릴 데이터도 없다.

## 4. 범위 밖 (보고만)

- `profiles` 가 없는 로그인 계정 9명 자체를 정리(삭제·프로필 생성)하는 일은 이번 범위가 아니다. 이들은 지금 쓰기 API 에서 동의 판정이 `profile_missing` → 503 으로 막힌다.
- `onboarding_status`·`onboarding_completed_at` 은 회원이 직접 바꿀 수 있다. **가입·동의 판정에는 쓰이지 않는다**(확인함):
  - 화면·서버 공통 판정 `deriveDibaySignupStatus` 는 `signupComplete = consentComplete`(약관 열만, `dibay-signup-status.ts:147-157`)다.
  - `onboarding_status` 는 응답에 싣는 표시값이다(`:166-176`).
  - `onboarding_completed_at` 은 `legacyCompleted` 값으로만 돌려주고, 이동 판정에는 쓰지 않는다.
  - 서버 쓰기 관문의 동의·가입 판정도 이 열을 보지 않는다.
  - 결함 아님.
- F1·F5·Owner 결정 7건은 별도다.

## 5. 실행 기록 (Owner 「승인, 적용 진행」 2026-11-27)

| 단계 | 시각 (PHT) | 결과 |
|---|---|---|
| 적용 전 대조(읽기) | 17:04 | 운영 본문 md5 `d9e1537e22232d800b85c4811771068f` = §1 에서 읽은 원문과 같음 · 트리거 켜짐 · 소유자 postgres · 일반(INVOKER) 함수 |
| 운영 적용 | 17:05:33 | MCP `apply_migration` `f6_profile_consent_insert_guard` success |
| 적용 확인(읽기) | 17:05:43 | 새 본문에 `profiles_consent_field_insert_forbidden` 있음 · 트리거 켜짐(O) · `schema_migrations` 에 기록됨 |
| 시험 ① 회원 역할 + 동의 열 INSERT | 17:06:22 | **거부** `42501 profiles_consent_field_insert_forbidden` (대상: profiles 없는 실제 계정 `b39d5538…`) |
| 시험 ② 회원 역할 + 동의 열 없이 INSERT | 17:06 | 성공(1행) → 롤백 — 앱 프로필 만들기 모양은 통과 |
| 시험 ③ service_role + 동의 열 INSERT | 17:06 | 성공(1행) → 롤백 — 서버 동의 저장 경로는 통과 |
| 시험 ④ 남은 행 | 17:07:17 | 대상 계정 profiles 0행 · 전체 85행(적용 전과 같음) |
| 운영 오류 | 17:04~17:07 | Postgres 오류 = 시험 ① 1건(내 시험)뿐 · Vercel 런타임 오류 0 |
