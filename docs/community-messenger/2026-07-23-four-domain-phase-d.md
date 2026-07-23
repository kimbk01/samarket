# Phase D — Domain bootstrap 계약 + list DTO

**선행:** Phase C migration **promoted** → `supabase/migrations/20261001120000_cm_rooms_chat_domain_identity.sql`  
**상태:** **PASS (contract)** · 홈 Surface **미교체** · **STOP** (Phase E 승인 전)

---

## 1. Migration APPLY (본 라운드)

| 항목 | 결과 |
|------|------|
| Repo promote | `supabase/migrations/20261001120000_cm_rooms_chat_domain_identity.sql` |
| Schema | `chat_domain`, `domain_identity`, `store_order_role` (nullable) |
| Backfill UPDATE | **미실행** (dry-run 보고서 전) |
| create/find dual-write | `bestEffortWriteRoomDomainColumns` (null identity만) |
| Remote DB push | **BLOCKED** — remote history에 local에 없는 `20261022120000` 존재(롤백 잔여). Dashboard에서 본 SQL **수동 실행** 또는 `migration repair` 후 push |
| List SELECT에 domain 컬럼 | **미포함** (remote 미적용 시 bootstrap 깨짐 방지). 컬럼 적용 확인 후 별도 PR |

Draft 포인터: `docs/community-messenger/migrations-draft/20260723_phase_c_chat_domain_identity.sql`

---

## 2. Phase D 산출

| 산출 | 경로 |
|------|------|
| List DTO | `lib/chat-domain/list/domain-list-dto.ts` |
| Domain bootstrap stubs + tryLoad | `lib/chat-domain/bootstrap/index.ts` |
| Summary optional fields | `CommunityMessengerRoomSummary.chatDomain` / `domainIdentity` |
| Select + summarize 전파 | `lib/community-messenger/service.ts` (컬럼 있을 때만 채움) |
| Tests | `lib/chat-domain/__tests__/four-domain-phase-d.test.ts` |

---

## 3. Gate

| # | 조건 | 결과 |
|---|------|------|
| 1 | Domain별 bootstrap 계약(스텁) 4종 | PASS (`not_wired`) |
| 2 | list DTO에 domain+identity | PASS |
| 3 | mixed CM home type-split 가짜 Domain **없음** | PASS |
| 4 | applyHomeListPatch / hub / bell 미교체 | PASS |
| 5 | REMOVE 실삭제 0 | PASS |
| 6 | Native Call 0 | PASS |
| 7 | `verify:chat-domain-file-lock` | PASS |
| 8 | Backfill dry-run | **미실시** |

**판정:** `PASS (contract)` · **STOP**

---

## 4. Phase E 킥오프 (승인 후만)

```text
docs/community-messenger/2026-07-23-four-domain-phase-d.md 준수.
Phase E만. Domain envelope realtime + dedupe key.
목록 직접 조작 payload 제거 계획만·Surface writer 교체·REMOVE 실삭제 금지.
Native Call LOCK 수정 금지. 끝나면 STOP.
```

## 5. Backfill APPLY (별도 승인)

GD/group/SO UPDATE dry-run 보고서 후 uncomment. Trade는 ledger 정책 후.
