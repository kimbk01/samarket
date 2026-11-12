# 모임 남은 항목 감사·설계안 (2026-11-12)

Owner 지시 (2026-11-12): 「결정 필요 부분은 권장안을 따르고, 남은 위험·할 일은 정확한 감사를 실시해서 설계안을 보고해라」

- 조회 조건: 운영 DB `ckdosyydvgzqwpbwuhon`, 읽기 전용 조회 2026-11-12 14:xx PHT
- 코드 기준: `origin/main` + PR #182(M6) 브랜치 `718c62112`

## 0. 확정한 결정 (권장안)

- 신고자 결과 알림 `moim_report_result` 는 기존 커뮤니티 신고 결과 알림과 똑같이 둔다.
  - 알림함에는 항상 남는다.
  - 푸시는 사용자의 커뮤니티 알림 설정을 따른다.
- 설계 문구 「푸시 없음 · 끌 수 없음」은 이 결정으로 대체한다. 알림을 누르면 모임 페이지로 간다(알림 상세 화면 없음).
- 코드 변경은 없다. PR #182 에 들어간 그대로다.

## 1. 운영자 `moim` 권한

### 감사 결과 (운영 DB)

| 계정 | 수 | 저장된 권한 행 | `moim` 있음 | 모임 어드민 사용 |
|---|---|---|---|---|
| 최고관리자 (`super_admin`, 활성) | 2 | 1개 있음(19개), 1개 없음 | 저장값엔 없음 | **가능** — 최고관리자는 저장값을 무시하고 전체 기본 권한을 쓴다(`loadEffectiveStaffPermissions`) |
| 운영자 (`admin`·`operator`, 활성) | 2 | 둘 다 있음(18개) | **없음** | **불가 — FAIL** |
| 운영자 (해지) | 6 | 없음 | — | 로그인 불가 (해당 없음) |

- **원인:** 저장된 권한 행이 있으면 그 값만 쓰고 기본값을 보지 않는다(`resolveEffectiveStaffPermissionsFromStored`). M5 에서 기본 권한에 `moim` 을 넣었지만, 행이 있는 운영자 2명에게는 적용되지 않았다.
- **영향:**
  - 활성 운영자 2명은 어드민 메뉴 「커뮤니티 › 모임」이 안 보인다.
  - 모임 API 가 403 이라 모임 신고 처리(M6)를 할 수 없다.
  - 메신저 신고 큐에 붙은 「모임」 링크도 403 이 된다.

### 설계안

- 기존 선례 `20270521121300_community_admin_ads_for_all_active_operators.sql`(홍보 권한 `ads` 를 모든 활성 운영자에게)와 같은 방식이다.
- 새 마이그레이션 `…_moim_admin_permission_for_active_operators.sql` 을 만든다.
  - 대상은 `admin_memberships.status='active'` 이고 `role='admin'` 이며, `permissions` 가 배열인데 `moim` 이 없는 행이다.
  - 그 행에 `'["moim"]'` 을 덧붙인다. 다른 권한은 그대로 둔다.
  - 최고관리자와 해지 계정은 제외한다. 다시 실행해도 안전하다.
- 적용 전후 대조: 대상 2행, 적용 뒤 `moim` 이 없는 활성 운영자 0.
- 되돌리기: 같은 행에서 `permissions - 'moim'`.
- 운영 DB 데이터 변경이라 **Owner 승인 후 적용**한다.
- 「앱에 반영」 확인은 운영자 계정으로 로그인해야 하므로 NOT_PROVEN 으로 남는다. `/api/admin/me` 를 쓸 때와 같은 판정 함수로 권한 목록만 확인한다.

## 2. 모임 카테고리

### 감사 결과

- 운영 `moim_categories` 0행, `moims` 0행.
- `moims.category_id` 는 NOT NULL 이다. 카테고리 없이는 모임을 만들 수 없다.
- 화면 (코드 기준):
  - 모임 탭의 「만들기」를 누르면 「준비 중」 안내만 나온다(`MoimTabHome.tsx:47`).
  - 만들기 1단계에도 같은 안내만 나온다(`MoimCreateWizard.tsx:153`).
  - 카테고리 칩은 표시되지 않는다.
- **판정: FAIL** — 지금 운영에서는 고객이 모임을 하나도 만들 수 없다.
- **원인:** 설계 M2 「카테고리 시드 없음(M5 어드민)」. 설계 v1 에 카테고리 목록 값이 없다 → **목록은 Owner 결정 필요**.

### 설계안

- **등록 경로:** 정식 함수 `moim_admin_category_save(p_admin, p, p_reason)` 로 등록한다.
  - 사유 필수이고, `moim_events` + `audit_logs` 에 기록된다.
  - 실행 방법은 둘 중 하나다:
    - Owner 가 어드민 「카테고리 관리」 화면에서 직접 입력한다.
    - Owner 의 관리자 ID 로 작업자가 SQL 로 같은 함수를 호출한다.
  - SQL 직접 INSERT 는 쓰지 않는다(감사 기록이 남지 않음).
- **목록 초안 (Owner 확정 전 — 값 확정 필요).** 개설 금지 표시는 모두 안 함.

| 순서 | slug | ko | en |
|---|---|---|---|
| 1 | sports | 운동 | Sports |
| 2 | outdoor | 등산·아웃도어 | Outdoors |
| 3 | food | 맛집·카페 | Food & Cafes |
| 4 | hobby | 취미·공예 | Hobbies |
| 5 | culture | 문화·공연 | Arts & Shows |
| 6 | study | 공부·자기계발 | Study |
| 7 | language | 언어 교환 | Language Exchange |
| 8 | pets | 반려동물 | Pets |
| 9 | parenting | 육아·가족 | Parenting |
| 10 | volunteer | 봉사 | Volunteering |
| 11 | games | 게임 | Games |
| 12 | music | 음악·악기 | Music |
| 13 | etc | 기타 | Other |

- **확인 계획:** 등록 후 운영 DB 13행을 조회한다. 모임 탭의 칩과 만들기 1단계는 Owner 휴대폰 화면 기준이라 확인 전까지 NOT_PROVEN 이다.

## 3. 백업 테이블 `_moim_m1b_backup_20261112`

### 감사 결과

- 10행, 40 kB.
- 열: `kind`, `object_name`, `definition`, `saved_at`.
- RLS 켜짐, `service_role`·`postgres` 만 권한.
- 의존 객체 0. 이 테이블을 참조하는 함수·뷰는 없다.
- **내용:** M1b 에서 옛 모임 참조를 빼느라 고쳐 쓴 기존 객체의 **변경 전 정의** 9개 함수 + 1개 뷰다.
  - 함수: `admin_action_queue_counts`, `admin_community_is_audit_target`, `admin_community_period_stats`, `community_import_publish`, `community_post_image_unreferenced`, `ensure_community_post_for_post_ads`, `get_cm_bootstrap_full_snapshot`, `philife_list_default_section_topics_for_feed`, `philify_list_default_section_topics_for_feed`
  - 뷰: `public.philife_topics`
- **쓸모:** 옛 정의로 되돌리는 데만 쓰인다. 하지만 옛 모임 테이블은 이미 삭제됐고 그 위에 M2~M6 이 올라가 있다. 이 정의로 되돌리면 없는 테이블을 참조하게 되어 실제로 되돌릴 수 없다.

### 설계안

1. 10행의 정의를 저장소 `docs/audit/moim-m1b-backup-definitions-2026-11-12.sql` 로 내보낸다. 기록은 git 에 남긴다.
2. 새 마이그레이션 `…_moim_m1b_backup_drop.sql` 로 `drop table public._moim_m1b_backup_20261112` 를 실행한다.
3. 적용 전 확인 (행 10·의존 0) → 적용 → 테이블 없음 확인.

- 운영 DB 변경이라 **Owner 승인 후 적용**한다.
- 1번 파일은 화면에 반영할 코드가 없으므로 2번 마이그레이션과 같은 PR 에 넣는다.

## 4. Android `/moim` 링크

### 감사 결과

- Android 는 푸시를 누를 때와 `dibay://`·https 링크로 열 때 모두, 웹으로 넘기기 전에 `DibayAppRouteGuard` 허용 목록을 통과해야 한다. 목록에 없는 경로는 이동하지 않는다.
- `moim` 은 M3 커밋 `2ab70c38b`(2026-11-12 07:17 PHT)에서 허용 목록에 추가됐다.
- 설치 중인 Android 최신 빌드는 1.2.6 (40)이다. `versionCode 40` 커밋은 2026-11-11 02:07 PHT 로 M3 보다 앞선다.
- 최근 14일 Android 기기 39대 모두 40 이하라 `moim` 이 없다.
- **영향 (코드 기준, 실기기 NOT_PROVEN):** Android 에서 모임 알림(가입 승인·일정·제재·신고 결과 등)을 눌러도 모임 화면으로 이동하지 않는다.
- 앱 안에서 탭·링크로 이동하는 것은 웹 라우터라 영향이 없다.
- iOS 에는 같은 허용 목록이 없다. 푸시 이동은 웹 `PushRouteListener` 가 같은 주소인지만 검사하므로, 코드 기준으로는 빌드 없이 이동한다(실기기 NOT_PROVEN).

### 설계안

- 고칠 코드는 이미 main 에 있다. 추가 코드 변경은 없다.
- 다음 Android 일괄 빌드(Owner 진행)에 함께 들어간다. 그때 `versionCode` 41 이상, `npm run native:prepare` 를 쓴다.
- 그 전까지 위험은 「Android 에서 모임 알림을 눌러도 이동하지 않음」이다.
- 빌드 뒤 실기기 확인 항목: Android 에서 앱이 꺼져 있을 때·뒤에 있을 때 모임 알림을 눌러 `/moim/…` 으로 이동하는지 본다.

## 5. 적용 결과 (Owner 「둘 다 적용」 2026-11-12)

| 항목 | 적용 | 전후 대조 |
|---|---|---|
| §1 운영자 `moim` 권한 — `20271113500000_moim_admin_permission_for_active_operators.sql` | 14:14 PHT 운영 | 활성 운영자 2명: 18 → 19개, 추가 `moim` 만·삭제 0. 최고관리자 행 변경 없음(updated_at 그대로). 적용 후 `moim` 없는 활성 운영자 0 |
| §3 백업 테이블 삭제 — `20271113510000_moim_m1b_backup_drop.sql` | 14:14 PHT 운영 | 적용 전 10행·의존 0·참조 뷰/함수 0 → 내보내기 `moim-m1b-backup-definitions-2026-11-12.sql` 10/10 md5 일치 → 삭제 후 `to_regclass` NULL |
| 마이그레이션 이력 | 2건 기록 | `schema_migrations` 20271113500000·20271113510000 |
| §2 카테고리 13개 — 정식 함수 `moim_admin_category_save` (실행 관리자 = 활성 최고관리자 「메인관리자」, 사유 「Owner 2026-11-12 카테고리 목록 초안 등록 지시」) | 14:16 PHT 운영 (Owner 「카테고리 목록 초안대로 등록해」) | 적용 전 0행 확인 후 한 트랜잭션 등록 → 13행(순서·slug·ko·en 초안과 일치, 모두 사용·개설 허용), `audit_logs` `moim.admin_category_created` 13건. `moim_events` 는 모임 단위 기록이라 카테고리는 남지 않음(설계 그대로) |
| 모임 탭 카테고리 칩·만들기 1단계 | NOT_PROVEN | Owner 휴대폰 화면 확인 안 함 — `/api/moim/categories` 는 사용·개설 허용 카테고리를 순서대로 반환(코드) |
| 운영자 화면에서 모임 메뉴 보임 | NOT_PROVEN | 운영자 계정 로그인 확인 안 함 — 권한 판정 코드상 저장값 그대로 사용 |
