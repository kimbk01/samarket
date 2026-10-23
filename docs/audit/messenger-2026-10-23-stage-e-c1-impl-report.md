# E-C1 구현 보고 — busy 발신자 전용 기록 (2026-10-23)

- **배포 구분:** 웹만 (네이티브·DB 마이그레이션 없음)
- **main tip (안내 수정):** `d02f38386` (busyKind V4 경로) · 선행 `f0f0c26be` / `577aa6e88` / `2139513c3`
- **Production:** Ready · SHA **`d02f38386`** (안내 재검증 기준)
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
| 본인/상대 동일 `peer_busy` 문구 | API `busyKind=peer\|caller` · V4 `showCallInAppNotice(busyKind)` |
| 기록 탭 busy→「실패」 | displayType `busy` · 배지 peer/self |
| 공유 stub 위험 | `projectCallStub:false` + `shouldPersistCallStubProjection(busy)=false` 유지 |

게이트 조건·VoIP/FCM/CallKit 디스패치 경로 **미변경**.

## 3. 테스트 (로컬)

- vitest · eslint · `typecheck:build` — 구현 시점 **PASS** (동일 트리 재실행 안 함)

## 4. 실기기 (Samsung·Xiaomi·iPhone · Production `d02f38386`)

상세 증거: `tmp/ec1-notice-2026-10-23/` · `tmp/ec1-device-*`

| # | 항목 | 결과 |
|---|---|---|
| 1 | 상대 busy → 발신자 기록·안내 | **PASS** (`55682fc7` peer_busy) |
| 2 | 본인 busy → DB `caller_busy` + 안내「다른 통화를 이용 중이라…」 | **PASS** (`fff220d1` · a11y `caller-notice-1.xml`) |
| 3 | 수신자 stub·busy call_log 없음 | **PASS** (Owner) |
| 4 | 종료 후 재발신 | **PASS** |
| 5 | 무응답·거절·취소 무회귀 | **PASS** |

**분리 (E-C1 범위 밖):** SIDE-08 — APK 인앱 안내가 헤더와 Y겹침 · APK↔iOS 알림 표시 차이 → **향후**.

## 5. 복구

`git revert` E-C1 관련 커밋 체인 → push main → 앱 재시작. 운영 DB busy 행 정리는 Owner 승인 전 금지.

## 6. 최종 상태

| 층 | 결과 |
|---|---|
| CODE / COMMIT / PUSH | PASS |
| PRODUCTION | Ready · tip `d02f38386` |
| RUNTIME / 실기기 (E-C1 계약) | **PASS** |
| **E-C1** | **CLOSED** |
| SIDE-08 (표시 레이어) | OPEN · 향후 |
