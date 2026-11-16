# 작업 세션 운영 DB 조회 검사 훅 — 설계안 (2026-11-16)

- 근거: 운영 Supabase Postgres 로그 11-15 10:37 ~ 11-16 10:37 PHT (ERROR 36건 전수) · `.claude/settings.json`·`.claude/hooks/guard.sh` 원문 · 운영 DB 읽기 전용 조회(`pg_settings`·`server_version`·`information_schema` 개수)
- 관련 규칙: AGENTS.md 「Claude 작업 효율 규정」 10번 「운영 DB 임의 조회 규칙」(#285, 11-14) — 문서 규칙만으로는 지켜지지 않음(아래 1절)
- **승인 전 구현 없음.**

---

## 1. 문제 (증거)

24시간 ERROR 36건 중 **22건이 작업 세션 MCP 조회**(`application_name = mgmt-api`, query 에 `-- source: POST /mcp`). 앱 수정(#345~#347, 11-16 04:01~04:03 병합) 뒤 6시간 반 동안 앱 오류 0건, 작업 세션 오류 15건.

| 유형 | 건수 | 예 |
|---|---|---|
| 없는 컬럼·표 이름 추측 | 15 | `user_devices.device_model` ×3, `caller_user_id` ×2, `os_version`, `client_message_id`, `metadata`, `sticker_packs`, `admin_messenger_call_settings` … |
| SQL 문법 오류 | 1 | `syntax error at or near ","` |
| 쿼리 의미 오류 (파서 통과·실행 중 실패) | 4 | 집계 함수 GROUP BY, `text \|\| "char"` 연산자, 하위 쿼리 여러 행, json 형식 |
| 운영 쓰기 시도 | 1 | `set local role authenticated; insert into transaction_reviews …` (권한 거부) |
| 시험 실행 일부러 실패 | 1 | `DO $mig$ … RAISE` 로 되돌림 (`DRYRUN …`) |

### 1-1. 함께 발견한 결함 — 기존 테스트 DB 차단 훅이 지금 동작하지 않음

- `.claude/settings.json` matcher 는 `mcp__Supabase__.*`, `guard.sh` 도 `mcp__Supabase__*` 만 본다.
- 지금 세션들이 쓰는 Supabase 도구 이름은 `mcp__152a0794-7923-4f87-99ce-71e2a0e4f22b__execute_sql` 형태(claude.ai 연결) → **matcher 에 안 걸림** → 「테스트 DB 사용 금지」(절대 금지 1번) 차단도 지금 꺼져 있는 상태.
- 테스트 DB 를 실제로 조회한 세션이 있었는지는 확인 못 함(NOT_PROVEN).

## 2. 서버 쪽에서 막을 수 없는 이유 (확인함)

- 실패한 SQL 은 Postgres 가 무조건 ERROR 로 남긴다. 끄려면 `log_min_messages`·`log_min_error_statement` 를 바꿔야 하는데 둘 다 `context = superuser`, 운영 `postgres` 역할은 `rolsuper = f` (11-16 읽기 전용 조회).
- 그래서 「DB 에 `EXPLAIN` 으로 미리 시험」도 안 된다 — 미리 시험이 실패하면 그것도 ERROR 1건.
- → **SQL 을 DB 에 보내기 전에, 이 컴퓨터 안에서** 검사해야 한다.

## 3. 설계

### 3-1. 바뀌는 파일

| 파일 | 내용 |
|---|---|
| `.claude/settings.json` | PreToolUse matcher 를 도구 이름 끝부분 기준으로: `mcp__.*__(execute_sql\|apply_migration\|list_tables\|list_migrations\|list_extensions\|query_logs\|get_logs\|get_advisors\|generate_typescript_types\|deploy_edge_function\|list_edge_functions\|get_edge_function\|create_branch)` + 기존 CI 도구. `execute_sql` 은 새 훅 `sql-guard.mjs` 도 실행 |
| `.claude/hooks/guard.sh` | `mcp__Supabase__*)` → `mcp__*__*)` + `tool_input.project_id` 가 있을 때만 테스트 DB 검사 (1-1 결함 수정) |
| `.claude/hooks/sql-guard.mjs` (신규) | 아래 3-2 검사 |
| `.claude/hooks/sql-guard-core.mjs` (신규) | 검사 로직(순수 함수, 시험 대상) |
| `package.json`·`package-lock.json` | devDependency `libpg-query@17.8.2` (Postgres 17 실제 파서, WASM · 운영 `server_version = 17.6` · 11-16 기준 2주 넘은 판) |
| `lib/dev-tools/__tests__/sql-guard.test.ts` (신규) | 3-4 시험 |
| AGENTS.md 10번 | 「훅이 강제」 한 줄 추가 |

- 앱 코드(`app/`·`components/`·`lib/` 제품 코드) 변경 없음. 통화 코드 무관.
- worktree(`.claude/worktrees/*`) 도 같은 `.claude/settings.json` 을 쓰고, `libpg-query` 는 위 폴더의 `node_modules` 에서 찾아짐(Node 가 상위 폴더로 찾아감) → **main 병합 후 새로 만든 worktree 부터 적용**. 이미 있는 worktree 는 main 을 받아야 적용.

### 3-2. `execute_sql` 검사 순서 (운영 `ckdosyydvgzqwpbwuhon` 일 때만)

1. **문법** — `libpg-query` 로 파싱. 실패 → **거부**(`deny`), 이유에 파서 메시지와 위치. DB 에 안 감.
2. **쓰기 여부** — 문장 종류가 `SELECT`·`WITH … SELECT`·`EXPLAIN`(ANALYZE 없음)·`SHOW`·`BEGIN READ ONLY`·`SET LOCAL statement_timeout`·`ROLLBACK` 밖이면(`INSERT`·`UPDATE`·`DELETE`·`DO`·DDL·`SET ROLE`·`CALL`·쓰기 함수 호출 등) → **Owner 확인 창**(`ask`). 이유: 「운영 쓰기 — 운영 시험 저장 규칙·운영 DB 적용 승인 대상」. 승인하면 그대로 실행.
   - `DO … RAISE` 로 되돌리는 시험 방식은 실패 기록이 남으므로, 시험은 `begin; … ; rollback;` 으로 하라고 이유에 적는다.
3. **표·컬럼 이름** — 운영 스키마 사진(`pg_attribute`, 표·뷰·구체화 뷰 — `information_schema` 는 구체화 뷰를 빼므로 사용 안 함)과 대조:
   - FROM·JOIN 표가 없으면 → **거부**, 비슷한 이름 3개 제시.
   - `별칭.컬럼` / `표.컬럼` 이 그 표에 없으면 → **거부**, 그 표의 실제 컬럼 목록 제시.
   - 별칭 없는 컬럼은 FROM 표가 1개이고 CTE·하위 쿼리 출력 이름과 겹치지 않을 때만 검사. 애매하면 통과(잘못 막지 않음).
   - CTE 이름·하위 쿼리 별칭·`pg_catalog`·`information_schema`·함수 결과 컬럼은 검사하지 않음.
4. 다 통과 → 허용(아무 출력 없음).

### 3-3. 스키마 사진

- 훅이 `psql`(읽기 전용 트랜잭션, `.env.local` `SUPABASE_DB_PASSWORD` — worktree 는 본 저장소 `.env.local`)로 `pg_attribute` 를 읽어 `$TMPDIR/dibay-prod-schema.json` 에 저장(운영 11-16 실측: 9개 스키마 541표·6,463컬럼, 1초). 이 조회는 항상 성공하는 SQL 이라 오류를 만들지 않는다.
- 10분 지나면 새로 읽음. 모르는 이름이 나오면(사진이 30초보다 오래됐을 때) **1회 새로 읽고** 그래도 없을 때만 거부(방금 적용한 마이그레이션 반영).
- `psql`·비밀번호·파서가 없거나 훅 자체가 실패하면 **통과**(작업을 막지 않음) + 경고 한 줄. 이유: 훅 결함으로 운영 대응이 막히면 더 위험.

### 3-4. 시험 (로컬, DB 연결 없음 — 고정 스키마 사진 사용)

- 11-15~16 실제 오류 22건 원문을 시험 자료로: 이름 추측 15건 → 거부 · 문법 1건 → 거부 · 쓰기 1건·`DO` 1건 → 확인 창 · 의미 오류 4건 → 통과(못 잡음, 아래 4절).
- 같은 기간 성공한 MCP 조회 견본 20건 이상 → 전부 통과 (잘못 막음 0 확인).
- 테스트 DB project_id → `guard.sh` 거부 · 새 도구 이름 형태(`mcp__<uuid>__execute_sql`)에서도 거부.

## 4. 효과와 한계

- 기대: 22건 중 **18건**(이름 15 + 문법 1 + 쓰기·DO 2 — 쓰기는 확인 창에서 멈춤) 이 DB 에 가기 전에 멈춘다. 실제 감소는 병합 후 24시간 로그로 측정(측정 전 NOT_PROVEN).
- 못 잡는 것 4건: 실행해야 알 수 있는 의미 오류(집계 위치·연산자 모호·하위 쿼리 여러 행·json 값). DB 에 보내지 않고는 판정 불가.
- 범위 밖: Bash 의 `psql` 직접 조회(11-15~16 오류 0건이라 이번 제외), Cursor 세션(다른 도구라 이 훅이 안 걸림), 스크립트의 PostgREST 호출.

## 5. 영향·위험·되돌리기

- 바뀌는 동작: 작업 세션이 운영 DB 에 틀린 이름·문법 SQL 을 보내면 거부 이유(실제 컬럼 목록)를 받고 고쳐서 다시 보냄. 쓰기 SQL 은 Owner 확인 창이 뜸.
- 위험: 검사가 맞는 SQL 을 잘못 막는 경우 → 애매하면 통과·훅 실패 시 통과로 설계, 시험 견본 20건으로 확인. Owner 확인 창이 지금보다 늘 수 있음(운영 쓰기 SQL 이 있을 때만).
- 1-1 수정으로 **테스트 DB 차단이 다시 켜짐** — 지금 테스트 DB 를 쓰는 세션이 있으면 그 세션이 막힘(규정상 맞는 동작).
- 배포 구분: `package.json` 이 바뀌므로 main 병합 시 Vercel 빌드 1회. 앱 동작 변경 없음, 앱 재시작·네이티브 빌드 불필요.
- 되돌리기: `.claude/settings.json` 에서 `sql-guard.mjs` 줄을 빼는 PR 1개.

## 6. Owner 결정 필요

- 없음. (쓰기 SQL 을 거부가 아니라 확인 창으로 둔 것은 규정 「운영 DB 적용 = Owner 승인」과 같게 맞춘 것.)

## 7. 구현 결과 (2026-11-16)

- 시험 `lib/dev-tools/__tests__/sql-guard.test.ts` 64건 PASS — 실제 오류 22건(이름 15 거부·문법 1 거부·쓰기 2 확인 창·의미 4 통과), 정상 조회 28건 통과, 쓰기 문장 6종 확인 창, guard.sh 테스트 DB 차단(새 도구 이름 포함)·settings matcher.
- `docs/` 안 SQL 예시 17건에 돌려 거부 4건 — 4건 모두 실제로 틀린 SQL(없는 표 `delivery_ad_campaigns` 2·없는 컬럼 `point_ledger.delta` 1·`:room` 자리표시 1). 잘못 막음 0.
- 이 컴퓨터에서 훅 직접 실행(운영 스키마): 없는 컬럼 거부 1.1초(사진 새로 읽기 포함)·문법 거부 0.06초·쓰기 확인 창 0.06초·정상 통과 0.13초.
- 실제 세션에서 훅이 걸리는지, 병합 후 오류 감소는 NOT_PROVEN (병합 후 새 세션·24시간 로그로 확인).
