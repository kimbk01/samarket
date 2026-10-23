# E-C1 구현 보고 — busy 발신자 전용 기록 (2026-10-23)

- **배포 구분:** 웹만 (네이티브·DB 마이그레이션 없음)
- **main:** `f0f0c26bef528cab356a4cbf9bd7297ce0a43cc2` (단독 커밋 · 2026-10-23 ~19:04 PHT push)
- **Production:** Ready `dpl_HP2cwkA6oZh7wpMYdAvTZN6meHCC` · alias `samarket.vercel.app` · SHA **`f0f0c26be`** (GitHub Production deployment 일치)
- 설계: `messenger-2026-10-23-stage-e-c1-busy-record-design.md`

## 1. call_stub 발신자 전용 가능 여부 (구현 전 확인)

| 사실 | 결론 |
|---|---|
| `call_stub` = 방 공유 메시지 행 | 수신자도 타임라인·목록 tip에 노출 |
| viewer별 tip 문구만 가능 · **행 자체 숨김 없음** | 스키마/RPC 없이 수신자 미표시 **불가** |
| Owner 정책: 수신자 stub·알림·unread·벨·푸시 금지 | **공유 stub 미작성** |

**채택 대안:** 터미널 세션(`cancelled` + `ended_reason`) + `call_logs` 1건 + 목록에서 peer 필터 + 발신 기기 로컬 채팅 줄.

## 2. 원인 → 수정

| 원인 | 수정 |
|---|---|
| busy 시 세션/call_log 0건 | `persistBusyCallAttemptForCaller` — ringing 없이 즉시 `cancelled` 세션 + call_log |
| 본인/상대 동일 `peer_busy` 문구 | API `error=peer_busy` 유지 + `busyKind=peer\|caller` · 안내/배지 분리 |
| 기록 탭 busy→「실패」 | displayType `busy` · 배지 peer/self |
| 공유 stub 위험 | `projectCallStub:false` + `shouldPersistCallStubProjection(busy)=false` 유지 |

게이트 조건·VoIP/FCM/CallKit 디스패치 경로 **미변경** (busy는 기존처럼 ok:false, incoming push 없음).

## 3. 테스트 (로컬)

- vitest: `call-busy-attempt-record` · peer-busy local · call-log-display-type · notice contract · terminal-reason — **32 PASS**
- `eslint` 변경 파일 — error 0 (기존 unused warning 2)
- `typecheck:build` — **PASS**
- `verify:i18n-key-exposure` — (실행 결과 본 보고에 기입)

## 4. 실기기 (Samsung·Xiaomi·iPhone · Production `577aa6e88` / E-C1 `f0f0c26be`)

상세: `messenger-2026-10-23-stage-e-c1-device-report.md`

| # | 항목 | 결과 |
|---|---|---|
| 1 | 상대 busy → 발신자 통화 탭 1건 · 안내 「상대 통화 중」 | **PASS** (`55682fc7`) |
| 2 | 본인 busy → 발신자 1건 · 「다른 통화 중」 | **PASS** DB·목록 (`74f54071`) / 안내 문구 **FAIL** (peer 카피) |
| 3 | 수신자: 채팅 stub·busy call_log 0 (DB) · iPhone 탭 busy 없음 | **PASS** (Owner 확인) |
| 4 | 종료 후 재발신 정상 | **PASS** |
| 5 | 무응답·거절·취소 기록 무회귀 | **PASS** (`23c96f76` / `e2466e77` / `df042466`) |

## 5. 복구

`git revert f0f0c26be` (+ 필요 시 `577aa6e88`) → push main → 앱 재시작.  
운영 DB busy 행 정리는 **별도 Owner 승인 전 금지**.

## 6. 최종 상태

| 층 | 결과 |
|---|---|
| CODE | PASS |
| COMMIT / PUSH / main | PASS `f0f0c26be` + CI `577aa6e88` |
| PRODUCTION | Ready · tip `577aa6e88` |
| RUNTIME / 실기기 | **PARTIAL** (peer/caller 기록·회귀 PASS · caller 안내 문구 FAIL) |
| **E-C1** | **DEVICE_PARTIAL** (CLOSED 아님 — 안내 문구만) |
