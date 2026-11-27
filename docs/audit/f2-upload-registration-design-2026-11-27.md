# F2 사진 올리기 5개 경로 — 계약대로 「가입 필요」로 되돌리기 — 설계 (2026-11-27 PHT)

상태: **설계안 — Owner 승인 전. 코드 변경 없음.**
근거 감사: `docs/audit/registration-process-contract-audit-2026-11-27.md` §1 F2.
지시 (Owner 2026-11-27): 「F2 설계 작성」.
확인 조건:
- 코드: 운영 main `7c5b6e33f`.
- 운영 DB `ckdosyydvgzqwpbwuhon`: 읽기 전용 조회만 함 (14:00~14:20 PHT).

## 0. 감사 보고 정정 (작업자 잘못)

| 감사 F2 의 문장 | 사실 | 증거 |
|---|---|---|
| 「글에 붙지 않은 사진을 지우는 예약 작업은 없다」 | **틀림.** 필라이프(동네생활) 사진은 매일 03:50 PHT `community-post-images-gc` 가 올린 뒤 72시간 동안 어디에도 안 붙은 원본+파생본을 지운다 | `app/api/cron/community-post-images-gc/route.ts`, `vercel.json` `50 19 * * *`, 감사 기록 `community_images.orphan_gc`(11-13·11-19·11-23 실행 기록) |
| (설계 중 작업자 1차 측정) 「11-20 이후 붙지 않은 사진 9장」 | **틀림.** 9장은 원본 3장의 파생본(`.detail`·`.feed`·`.thumb`)이었다. 원본은 모두 글에 붙어 있다 | 운영 `storage.objects` 이름 모양 조회 · 정리 후보 함수 `community_post_image_gc_candidates` = 0건 |
| 거래 사진 | 거래 글 사진(`{uid}/{시각}-{8자}.확장자`)은 붙지 않은 사진을 지우는 예약 작업이 **없다**(맞음). 다만 지금 운영에서 붙지 않은 원본은 **0개**다(72시간 지난 원본 43개 전부 사용 중) | 운영 조회 14:15 |

## 1. 결함 (계약과 다름)

- 계약 C2 `registration-action-cta-ssot-design-2026-11-21.md` §4 표 A(가입 필요)에 아래 경로가 명시돼 있다. Owner 「설계대로 진행」으로 승인된 계약이다.
  - `POST /api/posts/upload-image`
  - `POST /api/community/upload-image`(+`from-url`)
  - `POST /api/philife/upload-image`(+`from-url`)
- 구현: 규칙 표 `lib/auth/member-action-registry.ts:120,121,246,247,258` = `manage`.
  - 커밋 `00ce58fe1`(2026-11-21, 재감사3 #7)이 「사진 올리기 단계는 manage (글 등록 자체가 new)」로 바꿨다.
  - Owner 승인 문서는 없다. 계약 테스트도 그 값을 고정했다(`member-action-registry-contract.test.ts:126-130`).
- 결과: 약관만 동의하고 전화·주소가 없는 회원도 서버 API 를 직접 부르면 공개 버킷 `post-images`(public=true)에 사진을 올릴 수 있다.
  - 공개 주소를 돌려준다(`app/api/posts/upload-image/route.ts:87-92`).
  - 회원당 분당 45장, 장당 8MB(`rate-limit-presets.ts:108-116`).
  - 거래 사진은 붙지 않아도 지워지지 않는다.
- 운영 흔적: 11-21 이후 가입 미완료 회원이 올린 사진은 0개다(감사 §3).

## 2. 앱 화면 영향 — 전수

### 2-1. 이 5개 경로를 부르는 곳 (운영 코드 grep 전수)

| 호출처 | 경로 | 행동 | 지금 실패 표시 |
|---|---|---|---|
| `components/philife/PhilifeNeighborhoodWriteForm.tsx:326`(`uploadCommunityImageFile`) | philife/upload-image | 필라이프 글 쓰기·**내 글 수정**(`editPostId`) | 결과 `error` 문장 |
| 같은 파일 `:511`·`:736` | philife/upload-image-from-url | 붙여넣은 이미지 | `imageErrorText(code)` 문장 |
| `components/write/trade/TradeWriteForm.tsx:1187,1933,1937`(`uploadPostImagesDetailed`) | posts/upload-image | 거래 글 쓰기·**내 글 수정**(`editPostId`) | `tradeWriteUploadFailureDialog` 창(서버 `error` 문장 사용) |
| `components/write/trade/generic/JobsExtendedWriteFields.tsx:841` · `ExchangeExtendedWriteFields.tsx:615`(`uploadPostImages`) | posts/upload-image | 일자리·교환 글 | 업로드 결과 url 만 사용 |
| `lib/products/save-product-from-form.ts:23` ← `app/(main)/products/new` | posts/upload-image | 상품 새로 등록 | — |
| `components/chats/ChatDetailView.tsx`(`uploadPostImages`) | posts/upload-image | 예전 채팅방 사진 보내기 | — |
| `components/moim/use-moim-image-upload.ts:22` ← `MoimCreateWizard.tsx:104`(모임 만들기 표지) · `MoimProfileScreen.tsx:40`(내 모임 프로필 사진) | philife/upload-image | 모임 만들기(계약 A) · 내 모임 프로필 수정(계약 B — 수정은 가입 없이, 새 사진 저장은 §2-3 과 같이 A) | `failed` 만 → 토스트 고정 문구 `moim_screen_upload_failed` |
| `components/moim/manage/MoimManageInfo.tsx:64` | philife/upload-image | 모임장 표지 바꾸기 | 토스트 `r.error` |
| `components/admin/trade/showcase/TradeShowcaseAdminPage.tsx:120` | posts/upload-image | 관리자 | — (특권 관리자는 중앙 관문 면제 `enforce-api-member-mutation-policy.ts:207`) |

### 2-2. 가입 미완료 회원이 이 화면에 실제로 닿는가
- 가입 관문은 로그인한 미완료 회원을 **화면을 옮길 때마다** 빠진 단계 화면으로 보낸다.
  - 근거: `lib/auth/registration-gate.ts`, 계약 C3 「건너뛰기 없음」(Owner 「설계대로 진행」 2026-11-24).
  - 예외는 로그인·`/auth`·약관·고객센터·탈퇴·프로필/주소 수정·통화 화면뿐이다(`client-signup-gate.ts:45-51`, `dibay-signup-status.ts:208-229`).
  - 글쓰기·수정·모임 관리 화면은 예외가 아니다 → **앱에서는 닿지 않는다.**
- 예외: 왕복 감지(전체 감사 A6)로 단계 화면 ↔ 원래 화면이 20초 안에 되돌아오면, 그 화면을 1회 그대로 연다(`registration-gate.ts` `GATE_PASSTHROUGH_MS`). 이때만 작성 화면에서 사진 올리기가 가능하다.
- 운영 수: 가입 미완료 회원 28명 중 필라이프 글이 있는 회원 2명(116개)·거래 글이 있는 회원 3명(40개)·모임장 0명(14:05 조회).
  - 이 회원들의 「내 글 수정」은 지금도 앱에서 닿지 않는다(위 관문). 그래서 분류를 바꿔도 앱에서 달라지는 동작은 20초 예외 창뿐이다.

### 2-3. 계약 §4 B 「내 글 수정 = 가입 없이」와의 관계
- §4 B 는 수정 API(`PATCH …/neighborhood-posts/[postId]` 등)를 가입 없이 둔다. **사진 올리기 경로는 §4 A 에 따로 적혀 있다.**
- 계약 문구대로라면: 수정 중 글자·기존 사진 정리는 가입 없이 되고, **새 사진 추가**(새 파일 저장)는 가입이 필요하다.
- 두 표가 각 경로를 명시하므로 충돌은 아니다. 계약 문구를 그대로 따른다.

## 3. 변경

### 3-1. 규칙 표 (서버 관문 + 화면 안내 장치가 함께 읽음)
`lib/auth/member-action-registry.ts`:
- `POST /api/community/upload-image` · `…/upload-image-from-url` · `POST /api/philife/upload-image` · `…/upload-image-from-url` · `POST /api/posts/upload-image` → **`new`**
- `POST /api/community/upload-image/discard`(안 쓴 사진 정리)는 계약 B 그대로 `manage`. 매장 사장님 올리기(`/api/me/stores/[storeId]/upload-image` 등)는 C1 「기존 매장 운영」이라 그대로 둔다.
- 파일 머리 주석의 「manage … (사진 올리기 단계 포함 — 글 등록 자체가 "new" 로 막힌다)」 문장에서 사진 올리기를 뺀다.

효과:
- 중앙 쓰기 관문(`enforce-api-member-mutation-policy.ts:208-218`)이 가입 미완료 회원에게 `403 {code:"signup_incomplete", step}` 을 준다.
- 추가 DB 조회는 없다. 같은 요청에서 이미 읽는 쓰기 검사 스냅샷 1회를 그대로 쓴다(`resolveMemberRegistrationAuthority(userId, snapshot.registration)`) → 운영 요청 수 변화 0.
- 화면 안내 장치(`registration-guidance-fetch-gate.client.ts`)는 같은 표를 읽는다. 그래서 20초 예외 창에서 사진을 고르면 **서버에 보내기 전에** 「가입 이어하기」 창을 연다(미리 확인 ①). 서버 거절 때도 같은 창을 연다(안전망 ②).

### 3-2. 실패 문구 — 「가입 이어하기」 창과 같은 뜻으로 (계약 C2 §5-3)
안내 장치는 응답의 `error` 를 안내 문장(`registrationGuidanceMessage()`)으로 바꿔 준다. 그런데 올리기 도우미 2개는 `code` 만 보고 고정 문구 「사진을 올리지 못했어요」를 낸다. 그러면 창은 「가입을 마치면 이용할 수 있어요」, 작성 화면은 「올리기 실패」라고 서로 다른 말을 한다.
- `lib/philife/client-image-resize.ts` `uploadCommunityImageFile`: 응답 `code === "signup_incomplete"` 이면 `error` 를 응답의 문장(안내 문장) 그대로 돌려준다.
- `PhilifeNeighborhoodWriteForm.tsx` `imageErrorText(code, status)`: `signup_incomplete` → `registrationGuidanceMessage()`.
- `lib/posts/uploadPostImages.ts`: 이미 응답 `error` 를 `message` 로 넘김 → 변경 없음(창 문장이 그대로 나옴).
- `use-moim-image-upload.ts`: `failed` 만 돌려줘서 화면이 고정 문구를 낸다. 실패 문장(`error`)도 함께 돌려주게 한다. 호출처 2곳(`MoimCreateWizard.tsx:106`·`MoimProfileScreen.tsx:42`)은 안내 문장이면 토스트를 띄우지 않는다(창이 이미 같은 말을 함).
- 같은 문장의 중복 토스트: 기존 억제 장치(`shouldSuppressForRegistrationGuidance` — 내정보 토스트·메신저 스낵바)가 처리한다. 모임 관리 토스트(`useMoimManageToast`)는 그 장치를 쓰지 않으므로 같은 조건으로 억제를 추가한다.
- 문구는 새로 만들지 않는다(기존 키 `auth_reg_gate_title`). i18n 변화 없음.

### 3-3. 테스트
- `lib/auth/__tests__/member-action-registry-contract.test.ts:126-130`: 사진 올리기 2건의 기대값을 `manage` → `new` 로 바꾼다. `direct/start` 는 F1(Owner 결정 대기) 그대로 둔다.
- 경로 5개 + `discard` 를 표 대조에 추가한다. 계약 §4 A 문장을 근거로 주석에 적는다.
- `member-consent-mutation-gate.test.ts`: 가입 미완료 회원의 `POST /api/posts/upload-image`·`/api/philife/upload-image-from-url` → 403 `signup_incomplete`+`step`. `discard` → 통과.
- `registration-guidance-fetch-gate.test.ts`: 빠진 단계가 있을 때 `POST /api/philife/upload-image` 는 서버에 보내지 않고 창이 열린다.
- 도우미 2개: `signup_incomplete` 응답 → 안내 문장.

## 4. 바뀌는 것 / 안 바뀌는 것

| 구분 | 내용 |
|---|---|
| 바뀜 | 약관만 동의하고 전화·주소가 없는 회원의 사진 올리기 API → 403 가입 안내 (계약 §4 A) |
| 바뀜 (화면) | 20초 예외 창에서 사진을 고르면 「가입 이어하기」 창이 뜨고, 작성 화면 문구도 같은 뜻 |
| 안 바뀜 | 가입 완료 회원·관리자·매장 사장님 올리기 · 안 쓴 사진 정리(`discard`) · 필라이프 사진 고아 정리 작업 · 비로그인(이미 401) · 동의 미완(이미 403) |
| 운영 요청 수 | 변화 0 (§3-1) |
| 통화 | 통화 경로·코드 미변경 → 통화 규정 대상 아님 |
| `[배포 구분]` | 웹만 (DB·네이티브 변경 없음) |

## 5. 검증
1. 로컬: `typecheck:build` · `typecheck:test` · 변경 vitest(위 4개 + 도우미) · 변경 파일 eslint · `check:i18n-quality` 1회.
2. PR → `ci-ok` → 병합(= 운영 배포). 운영 배포 SHA 를 확인한다.
3. 운영 확인 (배포 SHA 기준):
   - 운영 코드의 규칙 표 5개 = `new` (배포 파일 조회).
   - 가입 완료 시험 계정으로 필라이프·거래 글 작성 화면 사진 올리기 → 200, 운영 저장소에 원본 생성 → 글 작성 취소 시 `discard`.
   - 가입 미완료 시험 계정은 운영에 없다. 이 경로는 vitest 의 관문 시험(3-3)으로 확인한다. 실기를 하려면 새 SNS 계정 가입을 중간에 멈춘 계정이 필요하다.
   - 앱 실행 10회 이내.

## 6. 롤백
- 규칙 표 5줄과 도우미 변경을 되돌리는 커밋 1개. DB 변경은 없다.
- 장애 때는 Vercel Instant Rollback(개발 프로세스 2번).

## 7. 구현·검증 기록 (Owner 2026-11-27 「승인, 구현 진행」)
- 바꾼 파일:
  - 규칙 표 `member-action-registry.ts`(5줄 + 머리 주석)
  - 올리기 도우미 `uploadPostImages.ts`(사유 `registration_required` · `isRegistrationRequiredUploadFailure`) · `client-image-resize.ts` · `community-image-upload-error.ts`
  - 화면 `TradeWriteForm`·`Jobs/ExchangeExtendedWriteFields`·`ChatDetailView`·`save-product-from-form`·`use-moim-image-upload`·`MoimCreateWizard`·`MoimProfileScreen`·`MoimManageInfo`
  - 테스트 4개(새 파일 `lib/posts/__tests__/upload-registration-required-f2.test.ts`)
- 로컬 1회(14:08~14:30 PHT): 변경 테스트 4파일 72건 PASS · `typecheck:build` PASS · `ci:static`(typegen·typecheck:test·lint·verify 전부) PASS · 전체 vitest 2묶음 실패 0.
