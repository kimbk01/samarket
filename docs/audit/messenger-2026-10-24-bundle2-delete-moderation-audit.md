# §2 묶음 2 삭제·모더레이션 — 감사·원인·최소 수정 설계 (구현 전)

- 작성: 2026-10-24 ~00:28 PHT
- Owner 지시: 묶음 1 CLOSED 후 순서대로 다음 · **감사 · 원인 · 최소 설계까지** (코드·DB·main·Prod·네이티브 **금지**)
- SSOT: `docs/audit/messenger-2026-10-22-reaudit-plan.md` §2 우선2 · §5-2
- **제외:** 묶음 1·3~5 · 통화/네이티브 · SIDE · E-C* · CLOSED 재조사

---

## 1. §2 묶음 2 원래 요구사항

| ID | 결함(계획 원문) | 설계 방향(§5-2) | 당시 근거 경로 |
|---|---|---|---|
| **D-1** | 전체 삭제 후 답장 인용에 원문 남음 | 전체 삭제 시 그 메시지를 인용한 답장 미리보기를 「삭제된 메시지」로 바꿈 | `service.ts` delete-for-everyone |
| **A-1** | 그룹 앨범이 삭제·숨김 메시지 노출 | 앨범 조회에 삭제·관리자 숨김 조건 추가 | `group-room-media-service.ts` |

실기기 표기(계획): N. **이번 세션 실기기 재측정 없음 → DEVICE NOT_PROVEN.**

---

## 2. 항목별 현재 상태 (코드 대조 · HEAD)

| ID | CODE | DEVICE | 요약 |
|---|---|---|---|
| **D-1** | **FAIL** | **NOT_PROVEN** | `deleteCommunityMessengerMessageForEveryone`(≈18316–18365): 대상 행만 `deleted_for_everyone_at`·`content=""`·`metadata={}`. **`reply_to_message_id = 대상`인 다른 행의 `reply_preview_text` 미갱신.** UI `formatReplyQuoteForMessage`는 저장된 프리뷰를 그대로 표시 → 원문 잔존. `buildReplyPreviewSnapshot`은 **신규** 답장 시에만 placeholder. |
| **A-1** | **FAIL** | **NOT_PROVEN** | `listGroupRoomMedia`: `.is("deleted_at", null)` 만. **`deleted_for_everyone_at`·`is_hidden_by_admin` 필터 없음.** 전원 삭제·관리자 숨김 image/file이 앨범에 남음(삭제 후 content 비어도 행 자체는 조회됨). |

---

## 3. 확인된 결함 원인

### D-1
- 답장 인용은 스냅샷 컬럼(`reply_preview_text` 등)에 고정.
- 전원 삭제가 원문 행만 비우고 **역참조 스냅샷 scrub 없음**.
- 표시 경로가 원문 live join 없이 스냅샷만 사용.

### A-1
- 앨범 쿼리가 soft-delete(`deleted_at`)만 제외.
- 전원 삭제·관리자 숨김은 별도 컬럼이라 앨범에 그대로 포함.

---

## 4. 최소 수정 설계 (승인 후 구현)

| ID | 파일(예상) | 변경 요지 | 웹/DB/네이티브 |
|---|---|---|---|
| **D-1** | `service.ts` delete-for-everyone (+ 잠금 테스트) | 전원 삭제 성공 후 같은 `room_id`에서 `reply_to_message_id = messageId` 인 행의 `reply_preview_text`를 placeholder(`resolveDeletedMessagePlaceholder` / i18n 정합)로 **일괄 update**. (선택) 클라 `formatReplyQuoteForMessage`는 대상이 타임라인에 `deletedForEveryoneAt`면 placeholder 우선 — 서버 scrub이 정본. | **웹만** (기존 컬럼 update · 스키마 변경 없음) |
| **A-1** | `group-room-media-service.ts` (+ index 필터 테스트) | 쿼리에 `.is("deleted_for_everyone_at", null)` · `.neq("is_hidden_by_admin", true)`(또는 `is.false`/null 허용 정책과 동일). SELECT에 필요 시 해당 컬럼 포함. | **웹만** |

**잠금 테스트**
- D-1: 원문 전원 삭제 → 인용 행 `reply_preview_text` = 삭제 placeholder · 원문 content 비움 유지.
- A-1: `deleted_for_everyone_at` / `is_hidden_by_admin` 행이 `listGroupRoomMedia` 결과에 없음.

**영향:** 답장 인용 개인정보 · 그룹 미디어 앨범. 홈 unread·통화·차단(묶음3)·입력창(묶음4) **비변경**.

**미변경:** CallKit/VoIP · 네이티브 · DB 스키마 · 묶음 3~5 · M-8 강제 실패.

---

## 5. Owner 추가 승인 필요 여부

| 항목 | 필요 |
|---|---|
| D-1·A-1 **웹 최소 수정 구현** | **예** (본 보고 후 별도 승인) |
| main · Production | **별도** |
| DB 마이그레이션 | **불필요**(본 설계) |
| 실기기 | 구현 승인 후 · 미실시면 **NOT_PROVEN** |
| 묶음 2 「결함 없음」종료 | **불가** — CODE FAIL 잔존 |

---

## 6. 결론

- 묶음 2 **수정 대상: D-1 · A-1** (웹 최소).
- 구현·배포·실기기 **미실시** · 본 문서로 **STOP** (Owner 구현 승인 대기).

---

## 7. 구현 보고 (Owner 승인 · 로컬만 · 2026-10-24 ~00:33 PHT)

| ID | 수정 | 원자성 / 정합 |
|---|---|---|
| **D-1** | `scrub-reply-previews-for-deleted-message.ts` + `softDeleteCommunityMessengerMessageForEveryone`: 삭제(또는 이미 삭제) 후 같은 `room_id`·`reply_to_message_id` 행 `reply_preview_text` → `resolveDeletedMessagePlaceholder()`. 원문 content/metadata 비움 유지. 권한 변경 없음. | **원자성 FAIL** — 기존 경로가 PostgREST 순차 update(삭제 → purge/bump → scrub). 단일 DB 트랜잭션/RPC **없음**. scrub 실패 시 로그·`ok:true` 유지(purge/bump 동일). **재호출 시 scrub 재실행**으로 부분 실패 치유. |
| **A-1** | `listGroupRoomMedia`: `.is(deleted_for_everyone_at,null)` + `is_hidden_by_admin` null/false · `filterGroupMediaRows` 방어 필터 | 정렬·limit·cursor·권한 유지 |

로컬: vitest 10 PASS · eslint error 0(변경 파일) · `typecheck:build` PASS · `npm run build` **PASS**.  
**main / Production / 운영 DB: 미반영 · 별도 승인.** 실기기 NOT_PROVEN · 기존 데이터 백필 없음.

---

## 8. D-1 원자성 보완 판단 (2026-10-24 ~00:37 PHT · 구현 전 STOP)

### 조사 결과
| 항목 | 결과 |
|---|---|
| 기존 `softDelete…ForEveryone` | PostgREST **순차** update (원문 → purge/bump → scrub). DB `BEGIN` 없음. |
| 기존 delete-for-everyone **RPC** | **없음** (검색: migrations/service `rpc` 호출에 해당 함수 없음). |
| `community_messenger_send_text_message` 등 | 송신 시 원문이 이미 삭제면 프리뷰를 `'삭제된 메시지'`로 넣음 — **삭제 시점 scrub 아님**. |
| 웹만으로 원자성 | **불가** — PostgREST는 다중 UPDATE를 한 트랜잭션으로 묶는 일반 API가 없음. |

### 원자성 확보 가능 여부
**가능 — 단, 최소 운영 DB 마이그레이션 필요 (Owner 승인 전 미구현).**

### 권장 최소 방안 (승인 대기)
**AFTER UPDATE 트리거** on `community_messenger_messages`:
- 조건: `OLD.deleted_for_everyone_at IS NULL` AND `NEW.deleted_for_everyone_at IS NOT NULL`
- 동작: 같은 `room_id` · `reply_to_message_id = NEW.id` 인 행의 `reply_preview_text` 를 placeholder로 UPDATE
- placeholder: 앱 SSOT `resolveDeletedMessagePlaceholder()` = `삭제된 메시지입니다` (송신 RPC의 `삭제된 메시지`와 문구 차이는 별건·본 범위에서 통일하지 않음 — 트리거는 **앱과 동일 문구** 사용 제안)
- 효과: 원문 UPDATE와 scrub이 **같은 DB 트랜잭션** → 원자성 PASS
- TS: 별도 scrub 호출 제거 또는 no-op 유지(중복 update 무해). 권한·content/metadata 비움·purge/bump 흐름 유지.
- **백필 없음.** A-1 무변경.

대안: 신규 RPC `…_soft_delete_message_for_everyone` — 가능하나 권한·호출면 변경이 더 큼 → **비권장**.

### 배포 승인 필요
1. 위 트리거 마이그레이션 **파일 커밋** 승인  
2. **운영 DB 적용** 승인 (별도)  
3. 그 후 main·Prod (웹 TS 정리 포함) 승인  

**현재: 마이그레이션·코드 추가 구현 안 함 · Owner 승인 대기.**

---

## 9. D-1 트리거 구현 · 로컬 원자성 실측 (2026-10-24 ~00:40 PHT)

| 항목 | 결과 |
|---|---|
| SQL | `supabase/migrations/20270624120000_cm_d1_scrub_reply_on_delete_for_everyone.sql` — AFTER UPDATE OF `deleted_for_everyone_at`, SECURITY DEFINER, `search_path=public`, PUBLIC EXECUTE REVOKE |
| TS | `softDelete…ForEveryone` TS scrub **제거** · content/metadata 비움 · purge/bump · 권한 유지 · 이미 삭제 early return |
| A-1 | **무변경** |
| 원자성 실측 | **PASS** — `scripts/sql/verify-d1-delete-reply-scrub-atomicity.sql` 격리 스키마 `d1_atomicity_verify` on local PG `127.0.0.1:5432` · NOTICE `D1_ATOMICITY_VERIFY_PASS` (다수 인용 · 타방 격리 · 재호출 · content-only 미실행 · **scrub 강제 실패 시 원문 UPDATE 롤백**) |
| vitest | 7 PASS (D-1 contract + A-1 회귀) |
| eslint / typecheck:build | error 0 / PASS |

**운영 DB 적용 · main · Production: 미승인 · 대기.** 백필 없음.

---

## 10. 운영 반영 · CLOSED (2026-10-24 ~00:48 PHT)

| 단계 | 결과 |
|---|---|
| 운영 DB | **PASS** `20270624120000` · FN/TRG/ACL/MIG OK · `D1_DB_APPLY_PASS` |
| main | `4f92abf63` |
| Production | **Ready** `dpl_JA7KfR5XLd4xpoyjCLKpm5WTxFtk` · alias `samarket.vercel.app` |
| D-1 CODE/DB | **PASS** (트리거+원자성 로컬 실측) |
| A-1 CODE | **PASS** |
| D-1·A-1 DEVICE (삭제/앨범 시나리오) | **NOT_PROVEN** — 운영 테스트 삭제 미실행 · Owner 요청 전 보류 |
| UI smoke | SAM 채팅 목록 · XIA 방 타임라인 표시 OK (`tmp/bundle2-device-2026-10-24/`) |
| 백필 | 없음 |

**§2 묶음 2 = CLOSED** (확인 결함 D-1·A-1 운영 반영 완료 · 삭제 UI 시나리오는 NOT_PROVEN 보존).
