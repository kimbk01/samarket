# 매장 입점 신청 → 어드민 접수 → 승인·보완(보류)·반려 감사 (2026-11-10)

> 보고만 · 코드 수정 없음. 시안: `docs/audit/store-apply-form-mockup-2026-11-10.html`

## 0. 확인 조건·범위

| 항목 | 값 |
|---|---|
| 기준 코드 | **origin/main `6e4a35785`** (작업 브랜치 `fix/chrome-s1-back-unify` 는 main 보다 뒤처져 서약·승인 리다이렉트가 없음 → main 기준으로 감사) |
| 운영 화면 | `samarket.vercel.app/stores/owner/apply` · 내장 브라우저 375×812 · 로그인 `@aaaa`(매장 없음, 일반 회원) · 확인 시각 2026-11-10 PHT · **신청 제출은 하지 않음**(운영 행 생성 방지) |
| 운영 DB | `ckdosyydvgzqwpbwuhon` 읽기 전용 조회만 (테스트 DB 미사용) |
| 직접 본 화면 | 신청 폼 1개(매장 없음 상태). **대기·검토중·보완·반려 상태의 사장님 화면, 어드민 심사 패널은 화면으로 보지 못함 → 코드 판정만** |

### 운영 데이터 사실 (조회 결과)
- 사장님 소유 매장 17개 전부 `store_kind = legacy_test`, 실매장(`real`) **0개**. 전체 122개 모두 `approved`, 대기·검토중·보완·반려 **0건**.
- 감사 로그: `store.approve_store` 5건(마지막 2026-11-03)뿐. **반려·보완 요청·재심사 열기·사장님 재제출은 운영에서 한 번도 실행된 적 없음.**
- 입점 약관 `store_partner_terms` ko·en 모두 **draft**(게시본 없음), 서약 기록 `store_partner_agreements` 0건.
- `phone_verified = true` 인데 전화번호가 비어 있는 회원 **32명 / 인증 83명**.
- username 에 `_` 가 있는 회원 **66명 / 137명** (매장 ID 계산에서 `_` 가 지워짐).

## 1. 프로세스별 판정

| 단계 | 판정 | 근거 |
|---|---|---|
| 신청 폼 표시 | **FAIL** | A-1·A-2·A-5·A-7 (운영 화면 확인) |
| 신청 제출 | **FAIL**(코드) | A-1·A-3·A-4·A-6 / 실제 제출은 NOT_PROVEN |
| 어드민 접수(목록·알림) | 일부 FAIL(코드) | B-3 · 대기 집계(`pending+under_review`)는 코드 PASS |
| 어드민 심사 패널 | **FAIL**(코드) | B-1·B-2 |
| 승인 | 코드 PASS · 운영 NOT_PROVEN | 상태 전이표·조건부 갱신·사장님 알림·감사 기록 있음. 실매장 0개라 운영 확인 불가 |
| 보완 요청(보류) | **FAIL**(코드) | D-1·D-2 · 운영 실행 이력 0 |
| 반려 | **FAIL**(코드) | D-3 · 운영 실행 이력 0 |
| 재심사 열기·재제출 | **FAIL**(코드) | D-2 · 운영 실행 이력 0 |

## 2. 결함 목록

### A. 신청 화면 (`app/(main)/stores/owner/apply/page.tsx`, `components/business/BusinessApplyForm.tsx`)

| ID | 등급 | 결함 | 증거 |
|---|---|---|---|
| A-1 | P1 | 전화번호 없는 회원도 폼이 열리고 「신청하기」가 켜짐 → 누르면 「전화번호 형식」 오류로 실패. 화면에서 고칠 길은 작은 링크뿐 | **운영 화면**: `@aaaa` 화면 「전화번호 * 번호 미등록」, 실명 입력 후 `신청하기 disabled=false`(JS 확인). DB: 이 계정 `phone_verified=true`·번호 없음, 같은 회원 32명. 코드: 게이트가 인증 플래그만 봄 `lib/profile/profile-requirements.ts:97`, 제출 판정에 전화 없음 `lib/business/business-apply-submit-gate.ts`, 실패 처리 `apply/page.tsx` `phone_rule` |
| A-2 | P1 | 화면 「매장 ID」 = `@회원아이디` 인데 실제 저장값은 소문자·`_` 제거한 슬러그. 예 `@kim_bk` 표시 → `kimbk` 저장(매장 주소 `/stores/kimbk`). `@` 는 회원 핸들 표기라 매장 주소로 읽히지 않음 | 표시 `BusinessApplyForm.tsx` `ownerHandle`, 계산 `apply/page.tsx` `computedStoreSlug`(`[^a-z0-9-]` 제거). 대상 회원 66명 |
| A-3 | P2 | 매장 ID를 만들 수 없거나(3자 미만) 겹치면 해결 수단 없음. 겹침은 「요청을 처리할 수 없습니다」 일반 문구. 서버의 재시도 4회는 **같은 슬러그로 4번** 시도해 의미 없음 | `app/api/me/stores/route.ts` 삽입 루프 `const slug = storeSlug`. 현재 데이터 겹침 0건(잠재 결함) |
| A-4 | P2 | 서버 오류 코드 원문이 화면에 그대로 나옴. 예: 매장 이름 1글자 → 화면은 `required` 만 검사해 통과, 서버 최소 2자 → 화면에 `shopName_required` 표시. 그 밖 `invalid_*`·`store_location_coords_required` 등 | `apply/page.tsx:281` `typeof json?.error === "string" ? json.error` |
| A-5 | P2 | 서약 섹션 제목 「입점·수수료 서약 (필수)」 + 본문 「지금은 서약 없이 신청할 수 있습니다」 — 같은 칸이 필수이면서 필요 없다고 말함 | **운영 화면** 본문 확인. DB 약관 draft. `BusinessApplyPartnerSection.tsx` 제목 키 `partner_apply_section_title` 고정 |
| A-6 | P2 | 서약 정보 불러오는 중·실패 동안 `required=false` 로 보고 「신청하기」 켜짐 → 약관 게시 후엔 서버가 `partner_agreement_required` 로 거부, 사용자는 실패 후에야 앎 | `BusinessApplyPartnerSection.tsx` 상태 주석 「불러오기 전·실패 = false」 |
| A-7 | P2 | 용어 혼용: 제목 「매장 입점 신청」·「매장 ID」 vs 섹션 「상점 정보」「상점 이름 *」「상점 소개」. 필수 표시(*)도 매장 이름·전화만 있고 실명·대표 주소·업종엔 없음 | 운영 화면 글자. 키 `business_phase7_141~145` |
| A-8 | P2 | 매장(미승인)이 있으면 상태 배지 + 「신청중입니다」 + 「진행 중에는 추가 신청 불가」만. **반려·정지에서도 「신청중입니다」**, 사유·다음 행동 버튼 없음 (승인 매장만 운영 홈으로 보냄 — UN-01 일부만 반영) | `apply/page.tsx:330,392` |
| A-9 | P3 | 신청 완료 후 `router.push("/stores/owner")` — storeId 없이 이동해 셸이 한 번 더 이동, 「접수됨」 안내 없음 | `apply/page.tsx:286` (2026-11-03 감사 §3 와 같은 지적) |
| A-10 | P3 | 「취소」 = 항상 `/mypage` (진입 경로 무관) | `BusinessApplyForm.tsx:647-648` |

### B. 어드민 접수·심사 패널 (`components/admin/stores/AdminStoreReviewPanel.tsx`)

| ID | 등급 | 결함 | 증거 |
|---|---|---|---|
| B-1 | P1 | 「신청 정보」에 신청서가 받은 **전화번호·카카오 ID가 없음**. 대신 신청서에 없는 「GCash 번호」(`email` 칸)·「GCash 계정 이름」(`website_url` 칸)을 보여 줘 신규 신청은 항상 「—」 | main `AdminStoreReviewPanel.tsx:335-337,758-759`. 신청 API 는 `phone`·`kakao_id` 저장, `email`·`website_url` 저장 안 함 |
| B-2 | P2 | 「매장 주소」 이름으로 **신청자 회원 대표 주소**(주소록 스냅숏 `application_address_book`)를 보여 줌 — 매장 위치가 아님. 승인 뒤 사장님이 입력한 실제 매장 위치는 이 행에 안 나옴 | `admin-store-review-model.ts:95-101` |
| B-3 | P2 | 새 신청·보완 재제출 때 관리자 알림(알림센터·푸시) 없음 — 대기 건수·소리만. (주소 변경 재검증은 `createAdminNotification` 호출함) | `app/api/me/stores/route.ts` POST, `store-profile-core.server.ts` 재제출 분기에 알림 호출 없음. 소리 실제 동작 NOT_PROVEN |

### C. 승인
- 코드 PASS: 전이표(`admin-store-decision-rules.ts`)·상태 조건부 갱신(동시 처리 409)·서약 게이트(약관 게시 시 동의 없으면 409)·사장님 알림·감사 기록.
- 운영 NOT_PROVEN: 실매장 0개, 서약 기록 0건, 약관 미게시라 승인 게이트·무료 정책 생성은 한 번도 실행되지 않음.
- 참고(결함 아님): 승인 후 영업까지 「입점 승인 → 판매 승인 → 노출 켜기」 3번, 각각 사유 입력.

### D. 보완 요청(보류)·반려·재제출

| ID | 등급 | 결함 | 증거 |
|---|---|---|---|
| D-1 | P1 | 보완 요청 받은 사장님이 **매장 이름·업종을 고칠 수 없음**. `owner_can_edit_store_identity` 기본값 `false` 라 서버가 매장명·업종 변경을 무시 → 보완 사유가 매장명·업종이면 해결 불가 | `store-profile-core.server.ts:173-200`, DB 기본값 `false` 확인 |
| D-2 | P1 | 재제출이 **보이지 않음**: 보완 화면 CTA 는 「매장 프로필 보완하기」(프로필 편집)뿐이고 「다시 제출」 버튼 없음. 신청 항목 아무거나(영업시간 포함) 저장하면 그 순간 심사 대기로 넘어감 → 사장님은 제출됐는지 모르고, 일부만 고친 상태로 넘어감. 실명·요청 사항은 고칠 곳 없음 | `MyBusinessPage.tsx` revision 분기, `admin-store-decision-rules.ts` `OWNER_RESUBMIT_CONTENT_FIELDS`(`business_hours_json` 포함) |
| D-3 | P2 | 반려 화면 막다른 길: 매장명·「신청이 반려되었습니다」·사유·배지뿐, 버튼 없음. 계정당 매장 1개(DB 유일 인덱스 `stores_one_owner_one_store_uidx`)라 재신청도 불가 → 사장님이 할 수 있는 행동 0 | `MyBusinessPage.tsx` rejected 분기 |
| D-4 | P3 | 「심사 시작(검토중)」은 사장님 알림 없음, 사장님 화면도 대기·검토중 문구 같음 | `admin-store-decision.ts` `DECISION_BY_ACTION` 에 `start_review` 없음 |

### E. 「보류」 용어 — Owner 결정 필요
시스템에 「보류」 상태는 없다. 현재 상태는 `pending 신청대기` → `under_review 검토중` → `revision_requested 보완요청` / `approved 승인` / `rejected 반려`.
- 「보류」가 **사장님이 고쳐야 하는 것**이면 = 지금의 「보완 요청」 (시안은 이 뜻으로 그림)
- 「보류」가 **관리자가 판단을 미루는 것**이면 = 「검토중」 + 사유 메모 (사장님 행동 없음)

## 3. 수정안 (원인별 · 같은 단계에서 영향 화면 함께 정리)

| 묶음 | 대상 결함 | 수정 | 바뀌는 파일 | 함께 확인할 화면 |
|---|---|---|---|---|
| 1. 신청 폼 판정 | A-1·A-6 | 제출 판정에 `phone`(번호 값 없음)·`partner_loading` 사유 추가, 사유 줄에 「전화번호 등록하기」 버튼. 인증 게이트 전체(`phone_verified` 판정) 수정은 모든 행동에 영향 → 이번엔 신청 화면만, 전체는 보고만 | `business-apply-submit-gate.ts`, `BusinessApplyForm.tsx`, `BusinessApplyPartnerSection.tsx`, i18n | 신청 폼 |
| 2. 매장 ID | A-2·A-3 | 슬러그 계산을 서버 함수 1개로(`make-store-slug` 재사용), 화면은 그 결과를 「`dibay.ph/stores/kimbk`」 형태로 표시(`@` 제거). 겹치면 서버가 `-2,-3` 붙여 재시도(루프가 실제로 다른 값 시도) | `app/api/me/stores/route.ts`, `apply/page.tsx`, `BusinessApplyForm.tsx` | 신청 폼, 매장 공개 주소 |
| 3. 오류 문구 | A-4 | 서버 코드 → 문구 표 1개(`owner-api-error-i18n` 확장), 원문 코드 노출 금지. 매장 이름 화면 검사 2~40자 | `apply/page.tsx`, i18n | 신청 폼 |
| 4. 문구·구성 | A-5·A-7 | 「상점」→「매장」 통일, 필수 칸 * 일괄, 서약 섹션은 약관 게시 때만 「(필수)」+체크 2개, 미게시면 섹션 숨김 | i18n, `BusinessApplyPartnerSection.tsx` | 신청 폼 |
| 5. 신청 후 흐름 | A-8·A-9·A-10 | 매장이 있으면 상태 무관 `OwnerRoutes.hub(id)` 로 replace(상태 안내는 운영 홈 한 곳). 완료 시 hub(id) 로 이동 + 「신청이 접수되었습니다」. 취소 = 뒤로(없으면 내정보) | `apply/page.tsx`, `BusinessApplyForm.tsx` | 운영 홈 대기 카드 |
| 6. 어드민 심사 패널 | B-1·B-2 | 「신청 정보」 = 실명·@아이디·매장 이름·매장 ID·전화·카카오·업종·소개·요청 사항·신청자 대표 주소(라벨 정정)·서약. GCash 두 줄은 승인 후 「운영 정보」 블록으로 이동 | `AdminStoreReviewPanel.tsx`, `admin-store-review-model.ts`, i18n | 매장 상세 패널(같은 컴포넌트) |
| 7. 관리자 알림 | B-3 | 새 신청·재제출 때 `createAdminNotification`(권한 `business`, 링크 `/admin/stores?status=actionable`) — 주소 재검증과 같은 함수 | `app/api/me/stores/route.ts`, `store-profile-core.server.ts` | 어드민 알림센터 |
| 8. 보완·재제출 | D-1·D-2 | 보완 요청 화면 = **신청서 다시 쓰기 폼**(신청 폼 재사용, 보완 사유 상단 고정) + 「보완 내용 제출」 버튼 → 서버 전용 동작 `resubmit_application`(신청 항목 저장 + `revision_requested→pending` 한 번에). 보완 상태에서는 매장명·업종 편집 허용. 프로필 일반 저장의 자동 재제출은 제거 | `MyBusinessPage.tsx`, 신청 폼, `app/api/me/stores/[storeId]`, `admin-store-decision-rules.ts`, `store-profile-core.server.ts` | 운영 홈 보완 카드, 매장 프로필 저장, 어드민 「재제출」 표시 |
| 9. 반려 | D-3·D-4 | 반려 카드에 「고객센터 문의(입점 심사)」 버튼(기존 `STORE_APPROVAL` 문의 유형). 「검토중」 전환 시 사장님 알림 1건 | `MyBusinessPage.tsx`, `admin-store-decision.ts`, i18n | 운영 홈 |

DB 변경: 없음(묶음 8 은 기존 컬럼·상태만 사용). 통화·네이티브 영향 없음 → 웹 배포만.

## 4. 남는 확인(NOT_PROVEN)
- 대기·검토중·보완·반려 상태의 사장님 실제 화면, 어드민 심사 패널 실제 화면 (운영에 해당 상태 매장 0개 · 어드민 화면 미확인)
- 실제 제출 1건(운영 행 생성이 필요해 하지 않음)
- 관리자 대기 소리 실제 울림
