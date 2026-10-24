# §2 묶음 1 타임라인 — 감사·원인·최소 수정 설계 (구현 전)

- 작성: 2026-10-23 ~23:50 PHT
- Owner 승인 범위: **감사 · 원인 확인 · 최소 수정 설계까지** (코드·DB·main·Prod·네이티브 **금지**)
- SSOT: `docs/audit/messenger-2026-10-22-reaudit-plan.md` §2 우선1 · §5-1
- **제외:** 묶음 2~5 · 통화/네이티브 · CLOSED 재조사 · C2-C/D·E-F1·SIDE · 날짜구분·읽음 UI 일반론(§2 묶음1 ID 밖)

---

## 1. §2 묶음 1 원래 요구사항

| ID | 결함(계획 원문) | 설계 방향(§5-1) | 당시 근거 경로 |
|---|---|---|---|
| **M-2** | seed 병합이 pending 행을 「보냄」으로 바꿈 | pending·failed는 서버 확인(id·cid 일치) 전까지 상태 불변 | `merge-primed-timeline-seed.ts` |
| **M-3** | 같은 프레임 bump 버림 | bump는 프레임 단위로 버리지 않고 큐에 모아 처리 | `use-messenger-room-bump-broadcast-subscription.ts` |
| **M-1** | 텍스트 bump가 FCM 순차 발송 뒤 | 저장 직후 **bump 먼저** · 푸시는 그 뒤 `after()` | `rooms/.../messages/route.ts` · post-ack effects |
| **M-8** | 실패 시 새 입력 덮어씀 | (묶음1 표기 · 실패 시 입력 복원은 덮어쓰기 없이) | `phase2` controller send 경로 |

실기기 표기(계획): M-1·2·3 = Y (기준선 채택 조건). **이번 세션 실기기 재측정 없음 → 기기 판정 NOT_PROVEN.**

---

## 2. 항목별 현재 상태 (코드 대조 · 2026-10-23 HEAD)

| ID | CODE | DEVICE | 요약 |
|---|---|---|---|
| **M-2** | **PASS** | **NOT_PROVEN** | `mergePrimedTimelineSeedIntoExisting`가 `mergeRoomMessages(store∪prev, seed)` · pending은 cid 일치 전 유지(`community-messenger-room-helpers.tsx`). 구「seed로 통째 교체」패턴 **없음**. |
| **M-3** | **FAIL** | **NOT_PROVEN** | `onBump`가 `cancelAnimationFrame` 후 새 rAF만 예약 → **같은 프레임 선행 bump의 rAF 본문(스냅샷 merge) 유실**. `scheduleCatchUp`의 `pendingHint` 합류는 힌트만 보존 · 선행 스냅샷 적용을 대체하지 못함. |
| **M-1** | **FAIL** | **NOT_PROVEN** | `messages/route.ts` `after()`: `runCommunityMessengerSendDeferredPostAckEffects`(FCM 순차) **후** `publishMessengerRoomBumpAfterMutation`. 계획·`messenger-realtime-policy`의 「bump 우선」과 **불일치**. |
| **M-8** | **FAIL** | **NOT_PROVEN** | 전송 시 `setMessage("")` · 텍스트 `busy`로 입력 미차단(`isMessengerComposerOutboundBusy`가 `send` 제외). 실패 시 무조건 `setMessage(restoreOnFail)` → **전송 대기 중 새로 친 글 덮어씀**. |

일반 UI(표시·정렬·시간·날짜구분·읽음 뱃지): §2 묶음1 **명시 ID 아님** → 이번 범위 **제외** · 별도 승인 없이 수정 제안 없음.

---

## 3. 확인된 결함 원인

### M-3
- **원인:** 단일 `remoteBumpCatchUpRafRef` + 수신 시 이전 rAF **cancel**. merge·catchUp이 rAF 콜백 안에 있어, 동일 프레임 N개 bump 중 **마지막만** 실행.
- **영향:** 연속 수신 시 중간 메시지 스냅샷 즉시 병합 누락 → catchUp/HTTP에 의존(지연·누락 가능).

### M-1
- **원인:** T5 ACK 지연 완화로 room bump를 `after()`에 두고, 같은 `after()`에서 **FCM dispatch를 bump보다 먼저** 실행.
- **영향:** 수신측 Realtime 표시가 푸시 경로보다 늦어질 수 있음(계획 M-1·정책과 반대).

### M-8
- **원인:** 실패 복원이 「전송했던 원문」고정값이며, 현재 입력칸이 비었는지/사용자가 다른 글을 썼는지 **가드 없음**.
- **영향:** 빠른 연속 입력 + 실패 시 작성 중 문장 유실.

### M-2
- **원인(과거):** seed로 타임라인 치환. **현재 코드에 해당 패턴 없음** → 수정 제안 없음.

---

## 4. 최소 수정 설계 (승인 후 구현)

| ID | 파일(예상) | 변경 요지 | 웹/DB/네이티브 |
|---|---|---|---|
| **M-3** | `lib/community-messenger/room/use-messenger-room-bump-broadcast-subscription.ts` | rAF cancel 시 **대기 큐에 payload/hint 적재** → 한 프레임 flush에서 **모두** merge(+ catchUp 1회 coalesce). 기존 180ms catchUp 합류 유지. | **웹만** |
| **M-1** | `app/api/community-messenger/rooms/[roomId]/messages/route.ts` (± group-rooms 동일 패턴) | `after()` 내 순서: **`publishMessengerRoomBumpAfterMutation` → 그다음** deferred FCM/mirror. ACK 전 await bump는 T5 지연 영향 → **1차는 after 내 순서만**(Owner가 ACK 전 await를 원하면 별도 승인). | **웹만** |
| **M-8** | `lib/community-messenger/room/phase2/use-messenger-room-phase2-controller.ts` | 실패 시 `setMessage(restoreOnFail)`는 **현재 입력이 빈 문자열일 때만**(또는 전송 직후 클리어 상태일 때만). 사용자가 이미 새 글을 치면 **덮어쓰지 않음**. | **웹만** |
| M-2 | — | 변경 없음 | — |

**잠금 테스트(구현 시):**
- M-3: 동일 틱 bump 2건 → 두 messageId 모두 merge 또는 catchUp hint 보존.
- M-1: route/after 순서 단위 테스트 또는 주석+계약 assert(가능 범위).
- M-8: 입력 중 실패 시 composer 불변 · 빈 칸일 때만 복원.

**영향:** 방 타임라인 수신 지연·연속 수신·전송 실패 UX. 홈 unread(SIDE-06)·통화·푸시 정책 본문·DB 스키마 **비변경**.

**미변경:** CallKit/VoIP/FCM **정책** · 네이티브 · DB 구조 · 묶음 2~5.

---

## 5. Owner 추가 승인 필요 여부

| 항목 | 필요 |
|---|---|
| 위 M-1/M-3/M-8 **웹 최소 수정 구현** | **예** (본 보고 후 별도 승인) |
| M-1을 ACK **이전** `await` bump로 강화 | **별도** (T5 지연 트레이드오프) |
| main 병합 · Production | **별도** |
| DB · 네이티브 빌드 | **불필요**(본 설계) |
| 실기기 행렬 (S·Xiaomi·iPhone) | 구현 승인 후 · 미실시면 **NOT_PROVEN** |
| 묶음 1을 「결함 없음」으로 종료 | **불가** — M-1·M-3·M-8 CODE FAIL 잔존 |

---

## 6. 결론

- 묶음 1 **수정 대상: M-1 · M-3 · M-8** (웹 최소).
- **M-2는 코드상 정상** → 손대지 않음.
- 구현·배포·실기기 **미실시** · 본 문서로 **STOP** (Owner 구현 승인 대기).

---

## 7. 구현 보고 (Owner 승인 후 · 2026-10-23 ~23:55 PHT)

| ID | 수정 |
|---|---|
| M-3 | `queue-room-bump-frame.ts` + bump 구독: rAF cancel 제거 · 큐 flush |
| M-1 | 1:1 `messages/route.ts` `after()`: bump → FCM 분리 try |
| M-8 | fail-restore 세션(dirty/gen) · composer draft 복원 가드 |
| M-2 | 미변경 |

로컬: vitest 22 PASS · eslint error 0 · `typecheck:build` PASS · `npm run build` (아래 실측).  
**main / Production: 미반영 · 별도 승인 필요.** 실기기 NOT_PROVEN.

---

## 8. 최종 검증 · CLOSED (2026-10-24 ~00:26 PHT)

| 항목 | 결과 |
|---|---|
| Production | `1528d514d` · `dpl_J8mSa358wvyfmuRJ757TDDyo4c7p` Ready |
| M-1 | CODE **PASS** · SAM↔XIA DEVICE **PASS** · iPhone DEVICE **PASS** (Owner: 3개 확인 `b1ip-m1-002604-a` 외) |
| M-3 | CODE **PASS** · SAM↔XIA DEVICE **PASS** · iPhone DEVICE **PASS** (연속 3건 무누락) |
| M-8 | CODE **PASS** · DEVICE **NOT_PROVEN** (강제 실패 주입 금지 · Owner 수용) |
| M-2 | CODE **PASS** · 무변경 |
| 추가 수정 | **없음** |

**§2 묶음 1 = CLOSED.** 묶음 2 착수 없음.
