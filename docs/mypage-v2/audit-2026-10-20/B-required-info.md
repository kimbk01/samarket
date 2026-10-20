# B. 내정보 필수 정보(아이디·전화 인증·주소) — 데이터 모델·흐름 인벤토리 (읽기 전용 감사)

- 기준 트리: `claude/gifted-cori-78bfpo` HEAD `13388f73c` (2026-10-20). DB 조회 없음 — 모든 판정은 코드·마이그레이션 근거. 근거가 없으면 「확인 필요」.
- 리디자인 커밋: `783146677` (#120, R1·R2·R3 홈 개편). 이전 홈 = `783146677^` (= `55004ef2c`).

---

## 0. 결론 요약 (Owner 판단용)

1. **현재 홈은 완료 상태를 아예 그리지 않는다.** `resolveMypageHomeRequiredItems` 가 미완료 항목만 반환(`lib/mypage/mypage-home-required-items.ts:15-29`)하고, 0개면 컴포넌트가 `null` 반환(`components/mypage/home/MypageRequiredInfoSummary.tsx:83`). 상태 미확정·프로필 없음도 `null`(`:46-47,56-59,83`).
2. 이 동작의 근거는 계약 문서 **`LEGACY-IA-PHASE1-CONTRACT.md:25-27`** ("Required complete → **hide** home complete card") 와 설계서 H0(`docs/mypage-v2/dibay-mypage-v3-final-integrated-spec.md:404,424-430`), 그리고 이를 강제하는 테스트(`lib/mypage/__tests__/mypage-home-required-items.test.ts:46-132`). Owner 요구(항상 표시)와 **정면 충돌** → 계약 문서·테스트를 함께 바꿔야 한다.
3. **이전 홈(`783146677^`)은 "계정 및 인증 정보" 카드에 3행을 항상 표시**했다(완료/미완료 배지·값·힌트·CTA). 단, 전화 「등록된 번호 없음」+「인증 완료」 모순과 주소 「변경」 2중 표기 결함이 있었다(아래 §2).
4. **주소에는 "인증/확인" 상태가 없다.** `user_addresses` 에 verified/status 컬럼 없음 — 판정은 `is_active AND is_default_master` 1건 존재뿐(`lib/addresses/user-address-service.ts:202-218`). 배달 가능 지역은 회원 주소 상태가 아니라 **매장별 주문 시점 판정**(`app/api/stores/[slug]/delivery-serviceability/route.ts`, `app/api/me/store-orders/route.ts:600-641`).
5. **아이디는 기능 게이트가 아니다**(`lib/profile/profile-requirements.ts:30-37`, `lib/profile/member-account-status.ts:7-8`). 실질 게이트는 **전화 인증**(서버 `requirePhoneVerified` 31개 API 라우트)과 **대표 주소**(거래 글쓰기·구매·배달 주문·입점 신청 클라 게이트).
6. 주소 강제 리다이렉트 컴포넌트 `MandatoryAddressGate` 는 **어디에도 마운트되어 있지 않다**(이벤트 상수만 import됨) → 주소 미등록 회원의 `?setup=1` 강제 이동은 현재 동작하지 않음(코드 근거상). 「확인 필요」(런타임).

---

## A. 회원 아이디 (DIBAY @아이디)

### A-1. DB (`public.profiles`)
| 컬럼 | 정의 | 의미 |
|---|---|---|
| `dibay_id` text | `supabase/migrations/20260611120000_dibay_signup_identity.sql:6` | 공개 @아이디(@ 없이 저장). 형식 CHECK `:24-31`, 대소문자 무시 UNIQUE `profiles_dibay_id_lower_unique_idx` `:48-50` |
| `dibay_id_locked` bool | 같은 파일 `:7` | 확정(잠김) |
| `dibay_id_auto_assigned`, `dibay_id_initial`, `dibay_id_changed_once`, `dibay_id_changed_at` | `20260709120000_dibay_id_auto_assign_policy.sql:6-9` | 자동 부여 `dibay_[hex6]` 여부·최초값·1회 변경 사용 여부·시각 |
| `username`, `username_confirmed`, `username_set_at` | (레거시) `confirm_dibay_id` 가 함께 갱신 `20270512120000_confirm_dibay_id_cms_consent_version.sql:123-125` | 레거시 미러 |

### A-2. 형식·중복·변경 정책
- 형식 `^[a-z0-9](?:[a-z0-9_.]{2,18}[a-z0-9])$`(4~20자), 예약어 12개, `dibay_[a-f0-9]{6}` 패턴 금지 — 클라 `lib/auth/dibay-id-policy.ts:3-38`, DB `20270512120000_...sql:53-66`.
- 중복: 예약 API 가 `dibay_id` ilike + `username_confirmed` 인 `username` 검사(`lib/auth/dibay-id-api-handlers.ts:23-49`), 확정 RPC 가 재검사 + unique_violation → `dibay_id_taken`(`20270512120000_...sql:99-114,155-170,188-190`).
- **변경 횟수: 1회.** 자동 부여 ID 보유자 → 1회 커스텀 변경 허용(`...sql:87-131`), `dibay_id_changed_once=true && locked` 면 `dibay_id_change_limit`(`:73-85`), 그 외 잠김이면 `dibay_id_already_locked`(`:134-145`). 약관 미동의면 `terms_required`(`:91-97,147-153`). 클라 판정 `canChangeOnce = auto_assigned && !changed_once && dibay_id`(`lib/auth/dibay-public-id-ssot.ts:166-168`).
- 자동 부여: 프로필 보장 시 `assignAutoDibayIdForUser`(`lib/auth/member-access.ts:328,382`), 복구 API `POST /api/me/dibay-id/assign-auto`(`app/api/me/dibay-id/assign-auto/route.ts:22`).

### A-3. API
| 라우트 | 동작 | 근거 |
|---|---|---|
| `POST /api/me/dibay-id/reserve` | 형식·중복 확인(쓰기 없음) | `app/api/me/dibay-id/reserve/route.ts:9-34` |
| `POST /api/me/dibay-id/confirm` | RPC `confirm_dibay_id` + 프로필 캐시 3종 무효화 | `app/api/me/dibay-id/confirm/route.ts:28-39` |
| `POST /api/me/dibay-id/assign-auto` | 자동 ID 복구 | `app/api/me/dibay-id/assign-auto/route.ts` |
| `POST /api/me/username/{reserve,confirm}` | @deprecated 별칭. **confirm 은 프로필 캐시 무효화를 하지 않음**(`app/api/me/username/confirm/route.ts:26-35`) — 범위 밖 결함, 보고만 | |

### A-4. 판정 SSOT (`lib/auth/dibay-public-id-ssot.ts`)
- `isPublicIdSetupComplete` `:140-151` — 자동 부여 보유 = 완료(`:142`), 커스텀은 `locked` 또는 `username_confirmed`.
- `evaluatePublicIdProfileView` `:154-181` — `atDisplay` 는 setupComplete/autoAssigned/changeComplete 일 때만 값(`:173`).
- 홈 상태 `deriveMemberAccountStatus.handle` `lib/profile/member-account-status.ts:76-82`.

### A-5. 화면·진입
- 페이지 `/mypage/required/dibay-id` (`app/(main)/mypage/required/dibay-id/page.tsx:8-20`) → `MypageRequiredDibayIdClient` → `ProfileDibayIdSection`.
- 시트 `EditDibayIdSheet` (`openSheet("dibay-id")`, `components/mypage/profile-settings/MypageProfileSheetsHost.tsx:43`).
- 공통 폼 `components/my/edit/ProfileDibayIdSection.tsx`: 400ms 자동 중복 확인(`:31,100-136`), 확정 전 reserve 재확인 후 confirm(`:146-206`), **확정 확인 시트 `MobileConfirmBottomSheet`(`mypage_s04_confirm_*`) 존재**(`:63, 333-338` 부근), 아이디 없음 → [복구](`:208-238`).
- 계정 화면 S03 `components/my/MyAccountContent.tsx:303-319`(원본 줄 기준 ≈ `:303-319`): 아이디 행 + 배지 「1회 변경 가능」/「변경 완료」/「설정 필요」.
- 홈 프로필 카드: `projection.username`(=atDisplay) 있으면 표시(`components/mypage/home/MypageProfileSummary.tsx:111-113`).

### A-6. 게이트
- 프록시 가입 게이트 = **약관 동의만**(`lib/auth/dibay-signup-status.ts:142-151`, `lib/auth/proxy-signup-gate.ts:23-48`, `resolveDibaySignupRoute` `:213-226` → 약관 화면만).
- 기능 게이트 필드에 `dibay_id` 타입은 있으나(`lib/profile/profile-requirements.ts:7`) **어떤 액션도 요구하지 않음**(`:78-98`).
- `/mypage/required` 단일 위저드 페이지는 폐기 → `/mypage` 로 redirect(`app/(main)/mypage/required/page.tsx:4-7`). `RequiredInfoFlowClient`/`RequiredInfoActiveStepPanel`/`RequiredInfoList` 는 **import 하는 곳 없음(사용 안 됨)** — 범위 밖, 보고만.

---

## B. 전화번호 인증

### B-1. DB
- `profiles`: `phone`(DB09 `09`+9자리), `phone_country_code`(기본 `+63`), `phone_number` — `20260426030000_secure_auth_profiles_session.sql:10-11`; `phone_verified`, `phone_verified_at`, `phone_verification_status`('unverified'/'pending'/'verified'), `phone_verification_requested_at`, `phone_verification_method`, `phone_verification_attempt_count` — `20260403120000_member_auth_and_phone_verification.sql:46-50`, `20260427142000_auth_phone_settings_and_profile_member_status.sql:10-13`.
- 번호 유일: `profiles_phone_unique_idx ON profiles(phone) WHERE phone IS NOT NULL` — `20260427142000_...sql:37-39`.
- OTP: `phone_otp_challenges`(해시·만료·시도) — `20260427154500_phone_otp_local_sms_semaphore.sql:5`. 설정: `auth_phone_settings` — `20260427142000_...sql:41`. 운영 감사 `20261019123000_phone_otp_ops_admin.sql`.

### B-2. API·공급자·만료·재시도
| 라우트 | 사용처 | 근거 |
|---|---|---|
| `POST /api/account/phone/send-otp` | **현행 UI**(`PhoneVerificationBox`) | `app/api/account/phone/send-otp/route.ts:11-40`; 클라 `components/mypage/profile/PhoneVerificationBox.tsx:144` |
| `POST /api/account/phone/verify-otp` | 현행 UI | `app/api/account/phone/verify-otp/route.ts:13-62`; 클라 `PhoneVerificationBox.tsx:185` |
| `GET /api/me/phone-verification` | 상태+설정 조회 | `app/api/me/phone-verification/route.ts:15-43`; 클라 `lib/mypage/load-phone-verification-state.ts:283-289` |
| `POST /api/me/phone-verification/{send,verify}` | 레거시. 유일 사용처 `components/my/PhoneVerificationRequestForm.tsx:78,125` 는 **import 하는 곳 없음** | send 는 이미 인증 회원이면 발송 없이 반환(`send/route.ts:24-36`) |

- 공급자: Semaphore SMS(`lib/auth/phone-otp-service.ts:21,247-262`), method 라벨 `semaphore_local`(`lib/auth/phone-otp-contract.ts:30,45`). 설정의 `provider: supabase|semaphore` 는 표시용 정규화(`lib/auth/auth-phone-settings.ts:79-82`).
- 기본값(DB 설정 없을 때): `enabled:false`, TTL 300초, 재발송 60초, 최대 시도 5(`lib/auth/auth-phone-settings.ts:21-27`; DB 범위 클램프 `:63-74,95-98`). **OTP on/off SSOT = DB `auth_phone_settings.enabled`**(`:48`).
- 코드: 6자리(`phone-otp-contract.ts:10-18`). 재발송 쿨다운 429(`phone-otp-service.ts:231-238`), 만료 `otp_expired`(`:332-334`), 시도 초과(`:314-320,335-339`), 번호 불일치 `otp_phone_mismatch`(`:329-331`), 오답(`:347-349`), 중복 번호 409 `phone_duplicate`(`:64,73-74,373`).
- 레이트리밋: 발송 8회/시간, 확인 20회/시간(`lib/security/rate-limit-presets.ts:42-55`).
- **번호 변경·재인증**: 인증 회원도 [번호 변경](`PhoneVerificationBox.tsx:306-333`, `setAllowEdit(true)`) → send 는 프로필의 번호·인증 상태를 건드리지 않음(B7/B8, `phone-otp-service.ts:265-286`) → verify 성공 시에만 번호·`phone_verified`·`phone_verified_at` 갱신(`:353-370`). 즉 변경 중 기존 인증 유지.
- 관리자 수동 승인: `buildPhoneVerifiedMemberPatch`(`lib/profile/admin-phone-verification-sync.ts:18`) — 플래그+시각 함께 기록.

### B-3. 인증 판정 SSOT
`hasVerifiedPhone`(`lib/auth/post-login-profile-policy.ts:50-67`): ① 권한 관리자(서버 사실 `privilegedAdmin` 만, role 폴백 없음 `lib/auth/admin-policy.ts:41-46`) ② `phone_verified===true` 또는 `phone_verified_at` 값 ③ 관리자 수동 생성 회원(`isAdminManualProvider`). **번호 컬럼 존재와 무관** → 아래 모순의 원인.

### B-4. 「인증 완료」인데 번호 없음 — 발생 조건
- 조건: `hasVerifiedPhone=true` 이고 `formatProfilePhoneForDisplay(phone, phone_country_code, phone_number)` 가 빈 값. 경로 = 권한 관리자(①), 관리자 수동 생성 회원(③), 혹은 `phone_verified_at` 만 있고 번호 컬럼이 빈 레거시 행(②). 실제 건수는 DB 미조회 → **확인 필요**.
- 표현 상태 `presentation: "verified_without_number"`(`lib/profile/member-account-status.ts:33,83-87`)는 #120 에서 추가됨(이전 파일엔 없음 — `git show 783146677^:lib/profile/member-account-status.ts` 에 `presentation` 없음).
- 이전 홈: 값 「등록된 번호 없음」 + 배지·힌트 「인증 완료」 동시 표시(`783146677^:components/mypage/home/MypageRequiredInfoSummary.tsx:240-251,252-254`).
- 현재 S03 계정: `verified_no_number` → 값 숨김(null) + 배지 「완료」(`lib/mypage/mask-profile-phone.ts:42-51`, `MyAccountContent.tsx` phoneValue 분기).
- 현재 S05(전화 인증 화면): 인증+번호 없음 → 「인증 완료」 + 번호 자리 `—`(`PhoneVerificationBox.tsx:279-285,316-320`). 화면마다 표기 다름.

### B-5. 전화 인증 필수 기능(게이트)
- 서버: `requirePhoneVerified`(`lib/auth/server-guards.ts:346-373`, 403 `PHONE_VERIFICATION_REQUIRED`) — **31개 API 라우트**: 메신저 그룹방 18종, 메신저 방·통화·재발신·친구 즐겨찾기·차단·그룹 생성, 그룹채팅, 거래채팅 방 차단, 신고, 커뮤니티 차단, 거래 광고 신청, 매장 상품 등록, 매장 신고·리뷰(`grep -rl "requirePhoneVerified(" app/api`). 그 외 `lib/posts/phone-gate-for-post-write.ts`(글쓰기), `lib/chat/createOrGetChatRoom.ts`(거래채팅 생성), 통화 시작 가드(`lib/call/outgoing-call-start-guard.ts`).
- 클라: `ACTION_ACCESS_BASE_FIELDS=[phone_verified, display_name]` — 커뮤니티 글·댓글, 거래 글쓰기·채팅·구매, 메신저 새채팅·전송, 배달 담기·주문, 주문채팅, 입점 신청(`lib/profile/profile-requirements.ts:34-98`); 전화만 부족하면 전화 인증 시트(`lib/profile/require-profile-completion.client.ts:89-92`).
- 「풀 회원」 판정 `canUseVerifiedMemberFeatures`(`lib/auth/member-access.ts:719-748`).

### B-6. 화면
- `/mypage/required/phone`(`app/(main)/mypage/required/phone/page.tsx`) + 시트 `PhoneVerificationSheet`(`openSheet("phone")`) — 같은 `PhoneVerificationBox`. 진입 URL 빌더 `buildPhoneVerificationHref` → `/mypage/required/phone?returnTo=`(`lib/auth/client-access-flow.ts:40-43`).

---

## C. 주소

### C-1. DB `public.user_addresses` (`supabase/migrations/20260428120000_user_addresses.sql:4-40`)
- 필드: 라벨·수령인·연락처·PH 행정구역·상세·좌표·`full_address`·`neighborhood_name`·`app_region_id/app_city_id`, 용도 `use_for_*`, 기본 플래그 `is_default_master/life/trade/delivery`, `is_active`(소프트 삭제), 이후 `place_id/formatted_address/road_address/detail_address/delivery_note/last_used_at`(`20260513204000_baemin_style_address_rebuild_fields.sql:4-20`), `linked_store_id`(`20260514100000_user_addresses_linked_store.sql:3-4`), `canonical_lgu_id`(SELECT 목록 `lib/addresses/user-address-service.ts:26`).
- 유저당 활성 대표 1건 UNIQUE `user_addresses_one_master`(`20260428120000_...sql:47-49`).
- **verified/status/confirmed 컬럼 없음** — 마이그레이션 전체에서 `user_addresses` 에 해당 ADD COLUMN 없음(grep 결과). 「주소 확인/인증」 상태는 데이터 모델에 존재하지 않음.

### C-2. 대표(master) 판정·쓰기
- 완료 판정 SSOT: `hasCanonicalDefaultMasterAddress` = 활성 + `is_default_master` 1건(`user-address-service.ts:198-218`), 별칭 `isMandatoryAddressGateSatisfied`(`:220-226`). 문서 `docs/dibay-address-platform-hard-lock.md:11,57`.
- 첫 주소 자동 대표(`ensureSomeoneDefaultIfFirst` `:350-374`), 대표 지정 `POST /api/me/addresses/[id]/set-default`(`app/api/me/addresses/[id]/set-default/route.ts:10-47` → `setUserAddressAsDefault` `user-address-service.ts:390-444`), 삭제 시 대표면 최근 행으로 이전·마지막 삭제면 대표 0건(`:563-603`, 문서 `:57`), 매장 연결 주소는 일반 주소가 있으면 대표 불가(`:103-115,139-170`).
- API: `GET/POST /api/me/addresses`(`app/api/me/addresses/route.ts:25,43-74`), `PATCH/DELETE /api/me/addresses/[id]`, `GET /api/me/address-defaults`(`app/api/me/address-defaults/route.ts:9-25`, master 반환), `GET /api/me/mandatory-address-gate`(`app/api/me/mandatory-address-gate/route.ts:14-45`, `needsBlock = !master`).
- 화면: `/mypage/addresses`, `/mypage/addresses/search`, `/mypage/addresses/edit`(`app/(main)/mypage/addresses/*`). 핀 아이콘 `AddressKindHeadPin kind="master"`(주소 HARD LOCK 표면 계약 `lib/addresses/__tests__/address-platform-hard-lock-contract.test.ts:162-220`).

### C-3. 배달 가능 지역
- 회원 주소 단위 판정 없음. 매장별: `GET /api/stores/[slug]/delivery-serviceability`(매장 좌표·반경·`delivery_service_area_authority`), 주문 생성 시 스냅샷(`app/api/me/store-orders/route.ts:600-641`), 서비스 영역 정의 `lib/delivery/service-area/*`. → 필수 정보 카드에 "배달 가능" 상태를 넣으려면 매장 문맥이 필요하므로 **부적합**.

### C-4. 주소 게이트
- 클라 액션 게이트: `trade_create_item`, `trade_buy`, `delivery_order`(+수령인 전화), `owner_store_register` 가 `default_address` 요구(`lib/profile/profile-requirements.ts:84-97`), 판정은 address-defaults master(`require-profile-completion.client.ts:28-41`).
- 강제 리다이렉트 `MandatoryAddressGate`(`components/addresses/MandatoryAddressGate.tsx:51-80`, `/mypage` 제외 `:70-71`) — **마운트 위치 없음**(`grep "MandatoryAddressGate"` 결과: 이벤트 상수 import 만). setup 화면 `?setup=1`(`lib/auth/profile-setup-flow.ts:4-29`, 완료 = 주소 needsBlock false + 전화 인증 `:46-48`)으로 보내는 주체가 현재 없음 → 런타임 확인 필요. 세션 연기 `profile-setup-defer.client.ts:5-31`.

---

## 1. 현재 홈이 그리는 것 (상태별)

데이터 흐름: `useMypageHomeModel` 이 프로필 + address-defaults 1회 조회(`hooks/use-mypage-home-model.ts:119-150`) → `projectionFromProfile`(`lib/mypage/mypage-home-store.ts:77-97`): `phoneStatus = hasVerifiedPhone ? complete : required`, `addressStatus = master 유무`(`use-mypage-home-model.ts:43-55`), `addressPublicLabel`(동네 공개 라벨, 메모리 전용 `mypage-home-store.ts:30-34`). `mypage-summary` API(`lib/mypage/mypage-summary.server.ts`, 타입 `lib/mypage/mypage-summary-types.ts:364-378`)에는 **필수 정보 필드가 없다**(매너·카운트·배너만).

| 상황 | 프로필 카드(`MypageProfileSummary`) | 필수정보(`MypageRequiredInfoSummary`) |
|---|---|---|
| projection 없음 | 스켈레톤(`:34-55`) | `null` |
| 세션 lite 스냅샷만(profile=null) | 이름·@id·매너 | `null`(`:46-47`) |
| phone/address `unknown` | 정상 | `null`; `loadFailed` 면 오류 1줄+[다시 시도](`:61-81`) |
| 3개 모두 완료 | 정상(@id 표시) | **`null` — 아무것도 없음** |
| 아이디 없음 | @id 없음 | 「아이디 복구가 필요해요」[아이디 복구] → 시트 |
| 전화 미인증 | — | 「전화번호 인증이 필요해요」[인증하기] → 시트 |
| 주소 없음 | — | 핀 + 「기본 주소를 등록해 주세요」[주소 등록] → `/mypage/addresses?returnTo=/mypage` |
(문구 `lib/i18n/catalog/mypage-components.ts:919-924`. 행 스타일 `bg-sam-warning-soft` `MypageRequiredInfoSummary.tsx:107`.)
- 주소 완료 정보는 계정 그룹 「주소관리」 행 값(대표 동네)으로만 노출(`components/mypage/MyPageHomeDashboard.tsx:75,123`).
- 전화 번호·인증 완료, 아이디 변경 가능 여부는 홈 어디에도 없음(S03 계정 화면으로 이동해야 확인).

## 2. 이전 홈(`783146677^`) — "계정 및 인증 정보" 카드
`git show 783146677^:components/mypage/home/MypageRequiredInfoSummary.tsx`
- 제목 「계정 및 인증 정보」 + 설명 「아이디·전화번호·기본 주소를 관리하세요.」(`:184-197`). 주석 "3행을 항상 표시. 3/3 합산·위저드 금지"(`:102-105`).
- 미확정: 「계정 정보를 확인하고 있습니다.」 / 실패: 오류+[다시 시도](`:132-171`).
- 아이디 행(`:200-236`): 배지 복구/「기본 아이디」/「변경 완료」, 값 `@id`, 힌트 「1회 변경할 수 있습니다」/「변경 기회를 사용했습니다」, CTA [아이디 변경]/[복구]/없음, 톤 항상 neutral.
- 전화 행(`:237-267`): 배지 「인증 완료」/「인증 필요」, 값 번호 또는 「등록된 번호 없음」, CTA [변경]/[인증], 미인증이면 빨간 action 톤.
- 주소 행(`:268-303`): 배지 「등록 완료」/「주소 등록 필요」, 값 대표 전체주소(`useRepresentativeFullAddressLine` `:120-123`) 또는 「등록된 기본주소 없음」, 힌트·CTA 둘 다 「변경」(중복 결함).
- 결함(설계서 감사 `dibay-mypage-v3-final-integrated-spec.md:426-428,457-460`): 전화 모순, 주소 「변경」 2회, 루트 네트워크 계약 위반(대표주소 훅 2차 조회, K11 `:149`).

## 3. 관련 계약·테스트 (변경 시 함께 수정 대상)
| 대상 | 현재 고정 내용 |
|---|---|
| `docs/customer-platform/_ios-mypage-audit-2026-08-06/dibay/LEGACY-IA-PHASE1-CONTRACT.md:24-27,52` | 완료 시 홈 카드 숨김, 주소 완료+주소메뉴 중복 CTA 금지 |
| `.../LEGACY-IA-FEATURE-PRESERVATION.md:16,33-34` | "required complete card — UI hide / MOVE to account·sheets" |
| `docs/mypage-v2/dibay-mypage-v3-final-integrated-spec.md:404,424-436,618` | H0 미완료만 · S03 「필수 정보」 그룹도 미완료일 때만 |
| `lib/mypage/__tests__/mypage-home-required-items.test.ts:46-132` | 8조합 미완료만, 완료 시 `[]`, 소스에 `mypage_phone_none`·`mypage_required_status_phone_done`·`mypage_required_change_action`·대표주소 훅 금지 |
| `lib/mypage/__tests__/mypage-root-network-contract.test.ts:120-131` + `scripts/verify-mypage-root-network-contract.cjs:24-29` | 루트 testid `mypage-account-control-card` 유지, `stepIndex`·`mypage-required-info-complete` 금지, 대표주소 훅·`fetchAddressDefaultsSnapshot` 호출 금지 |
| `lib/addresses/__tests__/address-platform-hard-lock-contract.test.ts:162-220` | 주소 진입 = `/mypage/addresses`, 아이콘 = `AddressKindHeadPin` |
| `lib/mypage/__tests__/mypage-home-menu-order.test.ts:74` | `<MypageRequiredInfoSummary` 가 프로필 다음 위치 |
| `lib/profile/__tests__/member-account-status.test.ts:40-78` | 자동 ID = 정상·변경 가능, 번호 문자열 ≠ 인증 |
| `lib/profile/member-account-status.ts:4-13` | 3/3 합산 금지, 기능 게이트가 completedCount 읽기 금지 |
| `docs/customer-platform/08-HARDLOCK.md` | 필수 정보 관련 항목 없음(Trust SSOT 만 `:9`) |

---

## 4. 상태표

### 4-1. 아이디
| 상태 | DB 판정 조건 | 현재 홈 표시 | 현재 상세 화면 | 결함·누락 |
|---|---|---|---|---|
| 입력전(없음) | `dibay_id` NULL/빈값(자동 부여 실패) | 경고줄 「아이디 복구가 필요해요」 | S03 「설정 필요」, S04 [복구](`ProfileDibayIdSection.tsx:208-238`) | 정상 동작. 실제 발생 건수 확인 필요 |
| 진행중 | 해당 없음(예약은 쓰기 없음) | — | S04 자동 확인 중/사용 가능 | — |
| 완료(자동 ID) | `dibay_id=dibay_xxxxxx`, `auto_assigned=true`, `changed_once=false` | **표시 없음**(프로필 카드 @id만) | S03 「1회 변경 가능」 | 홈에서 "1회 변경 가능" 미노출 |
| 완료(커스텀) | `locked=true`(+`changed_once=true`) | **표시 없음** | S03 「변경 완료」, 행 이동 없음 | — |
| 실패 | confirm 오류 `dibay_id_taken/…change_limit/terms_required` | — | S04 오류 문구 | `terms_required` 전용 문구 없음(일반 실패) — 확인 필요 |
| 변경후 | `changed_once=true, changed_at` | 표시 없음 | S03 「변경 완료」 | 홈 반영은 시트 저장 시 projection 패치(`EditDibayIdSheet.tsx:52`) |
| 경계 | `dibay_id` 있음·미잠김·비자동(초안) | `atDisplay=null` 이라 카드에 @id 없음 + `value=dibay_id` 라 필수줄도 없음 | S03 값 표시 | **아무 데도 "확정 필요" 안 보임**(`member-account-status.ts:77`, `dibay-public-id-ssot.ts:173`). 실재 여부 확인 필요(마이그레이션 `20260611…:74` 이 미잠금 행 NULL 처리) |

### 4-2. 전화
| 상태 | DB 판정 조건 | 현재 홈 표시 | 현재 상세 화면 | 결함·누락 |
|---|---|---|---|---|
| 입력전 | `hasVerifiedPhone=false`, 번호 없음 | 경고줄 「전화번호 인증이 필요해요」 | S03 「등록 안 됨」+「인증 필요」 | — |
| 진행중 | `phone_verification_status='pending'`, `phone_verified=false`, challenge 유효 | 미인증과 동일(구분 없음) | S05 코드 입력·쿨다운 | 만료 후에도 status `pending` 유지(만료 시 되돌림 코드 없음) — 확인 필요 |
| 완료 | `phone_verified=true` 또는 `phone_verified_at` (+번호) | **표시 없음** | S03 마스킹 번호+「완료」, S05 「인증 완료」+[번호 변경] | 홈에서 인증 완료 사실 미노출 |
| 완료(번호 없음) | 위 + 번호 컬럼 빈값(관리자/수동 회원) | 표시 없음 | S03 값 숨김+「완료」, S05 「—」 | 화면별 표기 불일치. 설계서 "인증됨 · 번호 미등록" 1회 표기 미적용 |
| 실패 | 발송 실패 502·쿨다운 429·만료·시도 초과·중복 409 | — | S05 오류 문구(`phone-otp-client-errors.ts`) | — |
| 변경후 | verify 성공 → 번호·`phone_verified_at` 갱신, 변경 중엔 기존 인증 유지 | 표시 없음 | S05 새 번호 | — |

### 4-3. 주소
| 상태 | DB 판정 조건 | 현재 홈 표시 | 현재 상세 화면 | 결함·누락 |
|---|---|---|---|---|
| 입력전 | 활성 master 0건 | 핀 + 「기본 주소를 등록해 주세요」 | S03 필수 정보 그룹 「주소 등록 필요」 | — |
| 진행중 | 조회 중(`addressStatus=unknown`) | 표시 없음 / 실패 시 오류줄 | S03 「확인 중」 | — |
| 완료 | 활성 + `is_default_master` 1건 | **필수정보 없음**, 계정 그룹 「주소관리」 행에 동네만 | `/mypage/addresses` 목록 | **S03 에도 완료 주소 행 없음**(필수 그룹이 미완료일 때만 렌더 `MyAccountContent.tsx` essentialsIncomplete) |
| 확인/인증 | **DB 상태 없음** | — | — | 「주소 확인」 개념을 쓰려면 정의 필요(아래 제안은 좌표·LGU 미해결을 "확인 필요"로 쓰는 안 — 확인 필요) |
| 실패 | API 오류 `address_*_failed`, `store_cannot_be_master`, `address_default_conflict` | — | 주소 화면 오류 | — |
| 변경후 | set-default/삭제 → `SAMARKET_ADDRESSES_UPDATED_EVENT` → 홈 강제 재조회(`use-mypage-home-model.ts:209-217`) | 마지막 주소 삭제 시 경고줄 재등장 | — | — |

---

## 5. 제안 — 항상 보이는 「필수 정보」 카드 (3행)

원칙: 기존 흐름·판정 함수만 재사용(`deriveMemberAccountStatus`, `hasVerifiedPhone`, `projection.addressStatus/addressPublicLabel`). 인증 판정 로직 변경 없음. 추가 네트워크 0(루트 계약 유지).

- 위치: 프로필 카드 바로 아래(현행 자리), 루트 testid `mypage-account-control-card` 유지, 제목 「필수 정보」(기존 키 `mypage_account_control_title` 「계정 및 인증 정보」 재사용 가능).
- 자리 고정: profile 미확정/`unknown` 동안 **3행 스켈레톤(행 높이 고정 52px)** — 항상 같은 높이라 흔들림 없음. 조회 실패 = 카드 안 1줄 오류 + [다시 시도](현행 `:61-81` 동작).
- 행 공통: 왼쪽 아이콘(아이디·전화 = 상태 아이콘, 주소 = `AddressKindHeadPin kind="master"` 고정) · 제목 · 값(1줄) · 오른쪽 상태 배지 · 행 전체 탭. 미완료 행만 `bg-sam-warning-soft`. 배지·값·힌트 3중 표기 금지 → **값 1개 + 배지 1개**, CTA 텍스트 없음(배지가 상태, 행 탭이 이동).

| 행 | 배지(상태 → 문구) | 값 | 탭 대상 |
|---|---|---|---|
| 아이디 | 없음 → **미설정**(경고) / 자동 ID·1회 변경 가능 → **변경 가능**(중립) / 커스텀 확정 → **설정 완료**(완료) | `@id` 또는 「아이디 없음」 | `openSheet("dibay-id")` (현행 시트, 변경 완료 상태도 열어서 확인만) |
| 전화번호 | 미인증 → **인증 필요**(경고) / 인증+번호 → **인증 완료**(완료) / 인증+번호 없음 → **인증 완료**, 값 「번호 미등록」(모순 해소: 배지 1개·값 1개) | 마스킹 번호 `maskProfilePhoneForDisplay`(`lib/mypage/mask-profile-phone.ts`) | `openSheet("phone")` (현행 시트, [번호 변경] 포함) |
| 기본 주소 | master 없음 → **미설정**(경고) / master 있음 → **등록 완료**(완료) / (선택) master 좌표·`canonical_lgu_id` 미해결 → **확인 필요** — DB 근거 없음, 채택 전 확인 필요 | `projection.addressPublicLabel`(동네, 이미 로드됨) 또는 「등록된 기본주소 없음」 | `buildMypageAddressesHref("/mypage")` |

- 「주소관리」 메뉴 행과의 중복: 카드 주소 행은 CTA 문구 없이 상태만 → 계약 `:27` 의 "twin CTA" 회피. 메뉴 행 값(동네)과 같은 값이 2번 보이는 점은 Owner 판단 필요 시 메뉴 행 값을 비우는 쪽으로 정함(제안: 메뉴 행 값 제거).

### 영향 파일
- 수정: `components/mypage/home/MypageRequiredInfoSummary.tsx`(전면), `lib/mypage/mypage-home-required-items.ts`(미완료 목록 → 3행 상태 모델로 교체), `lib/profile/member-account-status.ts`(아이디 배지 상태 파생 추가만, 판정 불변), `lib/i18n/catalog/mypage-components.ts`(배지 문구; 기존 `mypage_required_status_*`·`mypage_handle_badge_*` 키 재사용 가능), `components/mypage/MyPageHomeDashboard.tsx`(변경 없음 예상, 위치 유지), 선택 `lib/mypage/mypage-home-menu-config.ts`/`mypage-home-row-values.ts`(주소관리 행 값 중복 정리 시).
- 테스트·계약 갱신: `lib/mypage/__tests__/mypage-home-required-items.test.ts`(완료 시 숨김 → 3행 상태 표), `lib/mypage/__tests__/mypage-root-network-contract.test.ts:120-131`(testid 유지, 훅 금지 유지), `scripts/verify-mypage-root-network-contract.cjs`(변경 불필요 예상), `lib/addresses/__tests__/address-platform-hard-lock-contract.test.ts`(핀·경로 유지로 통과 예상).
- 문서: `LEGACY-IA-PHASE1-CONTRACT.md:25-27`, `LEGACY-IA-FEATURE-PRESERVATION.md:16,33-34`, 설계서 H0 `:404,424-436` 및 S03 `:618`(필수 정보 그룹 상시 표시로 맞출지 동시 결정).
- 범위 밖 발견(보고만): 미사용 컴포넌트 `RequiredInfoFlowClient`/`RequiredInfoActiveStepPanel`/`RequiredInfoList`/`PhoneVerificationRequestForm`, `MandatoryAddressGate` 미마운트, `/api/me/username/confirm` 캐시 무효화 누락, `required-info-flow.ts` 의 `/mypage/required` 반환 경로가 redirect 페이지를 가리킴(`lib/mypage/required-info-flow.ts:8,59-61`).


---
> 보완 2026-10-20: 이 부록의 제안은 본 설계서 §11~§16 이 대체·확정한다 (필수정보 §11 · 헤더/CTA §12 · /home §13 · 사진 §14).
