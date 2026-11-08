# 언어 SSOT S9 — 어드민 영어 계획 (2026-11-08 · Owner 「S9 계획 보고」) · Owner 「권장대로 승인」 → 구현 완료 (§7)

> 설계 `i18n-ko-en-ssot-design-2026-11-08.md` §5 S9 「어드민 영어 안 한글, 키 펼친 영어(`Board Today Items` 류), 치환 불일치」. 측정 기준 = main `7b9a409cf` · `lib/i18n/quality/i18n-quality-baseline.json` + 카탈로그 전수 추출(18:53 PHT).

## 1. 측정 (결함 = 영어 화면에서 고객·운영자가 보는 값이 틀림)

| 결함 | 수 | 위치 | 사용 여부 | 예 (ko → 지금 en) |
|---|---|---|---|---|
| **A. 영어 값이 한국어 그대로** | **703키** | 전부 `lib/i18n/catalog/admin-misc.ts` (en 블록이 ko 복사본) | 703 모두 코드에서 사용 | `admin_dr_page_title` 「DR / 재해복구 시나리오」 → 같은 한국어 |
| **B. 키 이름을 펼친 영어** | **386키** | 전부 `lib/i18n/catalog/admin-ops-tools.ts` (532키 중) | 346 사용 · **40 미사용**(정적·동적 조합 검색 0) | `admin_ops_tools_runbook_tab_logs` 「실행 로그」 → 「Runbook Tab Logs」 |
| **C. 치환값 불일치** | **20키** | ops-tools 19 · `admin-console-core.ts` 1 | 20 모두 사용 | 「당일 항목 {count}건」 → 「Board Today Items」(숫자 빠짐) · `admin_topics_header_desc_simple` en 에만 `{section}` |

- A 화면 분포(상위): QA 보드 132 · 출시 준비/주간 92 · 추천 배포 80 · 리뷰 78 · 운영 벤치마크 60 · 운영 이전(prod migration) 44 · 피드 긴급 39 · 회원 혜택 28 · 보안 26 · DR 22 · 성능 20 · 개인화 피드 20 · 노출 정책 18 · 홈 피드 13.
- B 의 다른 어드민 파일은 같은 규칙으로 116키가 걸리지만 「Report ID」「Copy UUID」「Member ID」처럼 **정상 영어** → 결함 아님(오탐). 그래서 B 검사는 ops-tools 파일 한정.
- C 는 B 와 19키 겹침(B 를 고치면 함께 해결).

**범위 밖 (S9 에 넣지 않음)**
- 어드민 한국어 값 안의 영어(「critical 이슈」「dark (기본)」 등) — S9 는 영어 화면만. 한국어 정리는 계획 완료 후 감사.
- 어드민 화면의 카탈로그 밖 `fallbackEn` 52곳 — 변수 키라 정적 증명 불가(발견 목록 **L15**).
- 사장님 `owner_copy_products_admin_lock_*` 치환 3키 — 기존 기록(설계 §7), 계획 완료 후 감사.

## 2. 안

| 단계 | 내용 | 바뀌는 파일 |
|---|---|---|
| A | `admin-misc.ts` en 703 값을 영어로 작성. ko 블록 diff 0 | `lib/i18n/catalog/admin-misc.ts` |
| B | `admin-ops-tools.ts` en 346 값을 ko 의미대로 다시 작성 · 미사용 40키는 ko·en 함께 삭제(S5 와 같은 판정: 코드·동적 조합 사용 0) | `lib/i18n/catalog/admin-ops-tools.ts` |
| C | 치환값을 ko 와 같게 — ops-tools 19 는 B 에서 · `admin_topics_header_desc_simple` en 을 ko 의미로(「Manage the order, status, and visibility of community categories.」, `{section}` 제거 — 호출부가 값을 넘겨도 무해) | 위 + `admin-console-core.ts` 1줄 |
| 검사 | ① `hangul-in-en` 기준선 703 → **0** ② `placeholder-parity` 23 → **3**(사장님 3 남음) ③ 새 규칙 `key-echo-en`: ops-tools 파일에서 en 이 키 끝 단어를 제목형으로 펼친 값 = 실패(0) ④ 기준선 다시 쓰기 | `lib/i18n/quality/*`, `lib/i18n/__tests__/i18n-quality*.test.ts` |

**작성 기준** (`docs/i18n-ssot.md` §4)
- 문장형 대문자(첫 글자만), 버튼·제목 마침표 없음, 길이 기준(버튼 22·탭/칩/배지 18·제목 40·토스트 80, 치환값 1개 = 3자).
- 어드민은 운영자 화면이라 **API·DB·ID·URL·UUID·QA·DR·CMS 같은 운영 용어는 허용**(고객·사장님 금지어 목록은 어드민에 적용하지 않음 — 설계 §4-3). 단, 키 이름을 펼친 말(「Kg Card Edges」「Rb Link Kill Switch」)은 금지.
- 같은 한국어는 같은 영어로(용어집 `lib/i18n/glossary.ts` 우선).

**작성 예 (구현 시 같은 방식으로 전부)**

| 키 | ko | 지금 en | 새 en |
|---|---|---|---|
| `admin_ops_tools_board_today_items` | 당일 항목 {count}건 | Board Today Items | Today: {count} items |
| `admin_ops_tools_board_high_priority` | High/Critical {count}건 | Board High Priority | High/Critical: {count} |
| `admin_ops_tools_kg_outgoing` | 나가는 관계 {out} / 들어오는 관계 {in} | Kg Outgoing | Outgoing {out} / Incoming {in} |
| `admin_ops_tools_runbook_tab_logs` | 실행 로그 | Runbook Tab Logs | Run logs |
| `admin_ops_tools_routines_th_active` | 활성 | Routines Th Active | Active |
| `admin_ops_tools_learning_th_doc_fit` | 문서적합도 | Learning Th Doc Fit | Doc fit |
| `admin_dr_page_title` | DR / 재해복구 시나리오 | (한국어) | Disaster recovery scenarios |
| `admin_critical_issues` | critical 이슈 | (한국어) | Critical issues |
| `admin_badge_placeholder` | 특별회원, 관리자 등 | (한국어) | e.g. Special member, Admin |

## 3. 영향·깨질 수 있는 것 → 같은 단계 처리

| 바뀌는 것 | 영향 | 처리 |
|---|---|---|
| en 값만 | 어드민 영어 화면 글자. 한국어 화면 변화 0 | ko 블록 diff 0 을 테스트로 고정(변경 전 ko 값 지문 대조) |
| 미사용 40키 삭제 | 사용처 0 → 화면 영향 0 | `MessageKey` 타입에서 사라지므로 typecheck 가 남은 사용처를 잡음 |
| 어드민 UI 래칫·소스 문구 계약 테스트 | 영어 문구를 기대하는 테스트가 있으면 실패 | 같은 단계에서 화면 값 기준으로 갱신(목록 보고) |
| 영어 길이 | 표 헤더·버튼 폭 | 길이 기준 검사(경고)로 확인, 넘치면 짧게 |

통화·네이티브·DB 변경 없음. 웹만(재빌드 불필요).

## 4. 검증

- 코드: 위 검사 4개 + typecheck 2종 + eslint + 관련 vitest(i18n·어드민 UI 래칫·문구 계약).
- 화면: 로컬 개발 서버 어드민 영어 모드로 A·B 대표 화면(QA 보드·출시 준비·DR·운영 도구 보드·런북) 캡처. 어드민 로그인이 로컬에서 안 되면 **NOT_PROVEN** 으로 남기고 운영(main 반영 후) 확인 대상으로 보고.
- 반영: 작업 브랜치 → 검증 → main 1회.

## 5. 되돌리기

커밋 1개 되돌리기(카탈로그·검사 파일만).

## 6. Owner 결정 필요

1. S9 안 승인 (A 703 · B 346 + 미사용 40 삭제 · C 20 · 검사 규칙 `key-echo-en`).
2. 어드민 영어에 운영 용어(API·DB·ID·QA·DR 등) 허용 — 권장: 허용(운영자 화면, 설계 §4-3 금지어는 고객·사장님 한정).

## 7. 결과 (2026-11-08 — Owner 「권장대로 승인」)

### 7-0. 먼저 보고 (작업자 잘못)
- **S8-4b(`2799e03f1`)가 CI `check` 를 깨뜨렸다** — 통화 채널 이름을 리소스로 옮기면서 글자 이름을 기대하던 통화 계약 테스트 `lib/call/__tests__/native-voice-fgs-channel-v2-contract.test.ts` 를 S8-4b 검증 때 돌리지 않았다. Owner 가 CI 결과를 전달한 뒤 `03dc5ba78`(19:02 PHT, 통화 테스트 1파일 단독)로 정정: 이름이 `dibay_call_ch_voice_ongoing_name` 리소스이고 중요도 `IMPORTANCE_DEFAULT` 인지 검사(무음·무진동 검사 그대로, 동작 변경 없음). 안드로이드 소스를 읽는 테스트 45개 + `lib/call` 30파일 174테스트 PASS.

### 7-1. 바꾼 것
| 항목 | 결과 |
|---|---|
| A `admin-misc.ts` 영어 | 703키 작성 (한국어 복사 → 영어) |
| B `admin-ops-tools.ts` 영어 | 346키 다시 작성 · 미사용 40키 ko·en 삭제(532 → 492키) |
| C 치환값 | ops-tools 19 (B 에 포함) · `admin_topics_header_desc_simple` en = 「Manage the order, status, and visibility of community categories.」 |
| 검사 | `key-echo-en` 규칙 추가(`lib/i18n/quality/i18n-quality-rules.ts`, 치환값은 단어로 세지 않음) · 기준선 `hangul-in-en` 703 → **0**, `placeholder-parity` 23 → **3**(사장님 3), `key-echo-en` **0** |
| 한국어 | 두 파일 한국어 값 지문 = S9 전과 같음(`lib/i18n/__tests__/s9-admin-ko-unchanged.test.ts`) |
| 문서 | `docs/i18n-ssot.md` §4-4 — 어드민은 4-1 금지어 미적용(운영 용어 허용), 키 펼침 금지 |

작성 방식: 4묶음 병렬 작성 → 자동 점검(치환값·한글·길이·키 펼침·같은 한국어 다른 영어 24건 중 11건 통일, 문맥별로 다른 것은 유지 — 예 「노출」 Visible/Exposure) → 무작위 40개 검토. 작성자가 불확실하다고 한 값 중 「진행」 버튼(상태를 진행 중으로) → 「Mark in progress」, 「담당」 → 「Assignee」(사장님 Owner 와 겹침 방지) 정정.

### 7-2. 검증
- 코드 PASS: vitest(어드민·i18n·관련 31 + 폴더 410파일 3,580테스트), `check:i18n-quality` 18/18, typecheck 2종, eslint.
- 화면: **NOT_PROVEN** — 로컬 어드민 로그인은 운영 계정 비밀번호가 필요해 작업자가 할 수 없음. main 반영 후 어드민 영어 모드(QA 보드·출시 준비·DR·운영 도구 보드·런북) 확인 대상.
