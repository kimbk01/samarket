# E-C1 구현 보고 — busy 발신자 전용 기록 (2026-10-23)

- **배포 구분:** 웹만 (네이티브·DB 마이그레이션 없음)
- **main / Production:** **미반영** (Owner 별도 승인 전)
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

## 4. 남은 실기기 (Production 반영 후)

설계 §7: peer busy 기록 1 · caller busy 문구 · peer 목록 0 · 벨/푸시 0 · 재발신 정상 · 이중 줄 없음.  
**현재: NOT_PROVEN** (미배포).

## 5. 복구

busy persist만 제거/`rejectStartCallPeerBusy`에서 persist 호출 생략 → 게이트는 현행 유지, 기록만 다시 0.  
잘못 쌓인 `ended_reason in (peer_busy,caller_busy)` 행 정리는 Owner DB 승인 후.

## 6. 변경 파일 (요약)

- `lib/community-messenger/call-busy-attempt-record.ts` (신규)
- `service.ts` — persist + list filter + call_log stub skip
- presentation / display-type / notice / i18n / navigation-seed / local-log
- 설계·본 보고 문서
