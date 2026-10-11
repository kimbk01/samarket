# DIBAY 전체 데이터 초기화 시스템 (평상시 LOCKED)

System → 데이터 초기화 → **전체 데이터 초기화**. 모든 규칙은 Postgres에 있고(UI·API는 표시·요청만), 운영 DB에서는 3중으로 차단된다.

## 1. 잠금 구조

| 층 | 위치 | 운영(Production) 상태 |
|---|---|---|
| P0 DB 대상 가드 | `lib/admin/data-reset/database-target-guard.ts` | `ckdosyydvgzqwpbwuhon` 하드코딩 → 파괴 호출 403 |
| DB 가드 행 | `public.data_reset_db_guard` (마이그레이션은 행을 만들지 않음) | 행 없음 → 파괴 함수 `data_reset_db_guard_locked` |
| 초기화 창 | `public.data_reset_windows` | 요청자 ≠ 승인자, 15–240분 후 자동 만료 |
| 계획 2인 서명 | `public.data_reset_plans` | 확인자(백업 참조 필수) ≠ 승인자, 해시 바인딩, 최대 60분 |
| 재인증 토큰 | `lib/admin/data-reset/full/action-token.ts` | HMAC(`DATA_RESET_ACTION_SECRET`), 5분, nonce 1회 소비(DB PK) |
| 확인 문구 | `CONFIRM/APPROVE/RESET <hash8>` | API에서 검사 |

API를 직접 호출해도 위 DB 조건은 함수 안에서 다시 검사한다(SECURITY DEFINER, `service_role`만 EXECUTE).

## 2. 흐름

창 요청(A) → 창 승인(B, 재인증) → Dry-run(계획 생성: 대상 행·보존 사유·Auth·Storage·해시) → 계획 확인(A 또는 B, 백업 참조·문구·재인증) → 계획 승인(다른 사람, 문구·재인증) → 실행(서명자, 문구·재인증) → DB 배치(1,000행/호출, 재개 가능) → Storage(API 삭제, 실제 사라진 것만 deleted) → Auth(잠금 후 참조 재확인, SQL 삭제) → 검증 → 종료(창 closed = 재잠금).

창 만료·닫힘 → 실행 중이면 `abort_requested` → 다음 호출에서 `aborted`로 종료(상태 조회만으로도 종료됨).

## 3. 삭제·보존 규칙 (요약)

- 테이블 분류: `lib/admin/data-reset/full/manifest.json` (생성: `python3 scripts/data-reset-generate-manifest.py`, 원본 `docs/data-reset/p1_classification_matrix.csv`). 새 테이블이 manifest에 없으면 계획 자체가 거부된다.
- KEEP / UNRESOLVED / LEGAL_HOLD(해제 플래그 전) / holdAll / PK 없음 → 테이블 전체 보존.
- 소유 컬럼이 있는 테이블: 소유 컬럼 중 하나 이상이 채워져 있고, 채워진 소유자 **전원이 TESTER**인 행만 후보. 실회원·미분류(UNKNOWN)·관리자·시스템·운영 계정 행은 보존.
- 소유 컬럼 없는 테이블: wholesale(파생 캐시)만 전량, 나머지는 후보인 부모를 따라감(부모가 남으면 보존, 고아·룩업 전용은 보존).
- 고정점: 남는 행이 FK 또는 soft ref로 가리키는 후보는 보존(CASCADE·SET NULL로 남는 데이터가 바뀌는 일 없음).
- 실행 시점 재확인: 배치 행 `FOR UPDATE`, soft ref 원천 테이블 `SHARE` 잠금, 계획 이후 생긴 신고·주문·댓글이 가리키면 `referenced_at_execution`으로 보존.
- Storage: 삭제 대상 행에서 참조된 객체 + TESTER 소유 객체, DB 단계 후 남은 행이 참조하면 보존(공유 이미지).
- Auth: TESTER만, 남은 행·객체가 하나라도 참조하면 보존(사유 기록).

## 4. QA에서 켜는 법 (격리 프로젝트에서만)

1. 별도 Supabase 프로젝트(DB·Auth·Storage 분리)에 마이그레이션 적용.
2. 그 프로젝트에서만: `insert into public.data_reset_db_guard (allow_destructive, environment_label) values (true, 'qa-<name>');`
3. 앱 env: `NEXT_PUBLIC_SUPABASE_URL`=QA 프로젝트, `DATA_RESET_ACTION_SECRET`=32자 이상 랜덤.
4. 최고관리자 2명으로 흐름 실행.

## 5. Production 실행 전제 (현재 모두 미충족 · 별도 Owner 승인)

- U1-C(계정 분류)·U1-D(금전 기록) 확정 → `data_reset_account_overrides` / `data_reset_release_flags` 반영.
- 격리 QA 14개 항목 PASS.
- 마이그레이션 Production 적용 승인, P0 가드 해제 승인(코드 변경), DB 가드 행 삽입 승인, 백업 복구 지점 확보.

## 6. 검증 도구

- `bash scripts/data-reset-local-test.sh` — 로컬 Postgres 16, 합성 픽스처 73개 단언.
- `python3 supabase/tests/data-reset/prod_shape_test.py <shape.txt> lib/admin/data-reset/full/manifest.json` — 운영 스키마 형태(398 테이블·569 FK, 행 데이터 없음) 재구성 후 전체 흐름 + 불변식.
- `lib/admin/__tests__/data-reset-full-system.test.ts` — 토큰·배치·계약 단위 테스트.
