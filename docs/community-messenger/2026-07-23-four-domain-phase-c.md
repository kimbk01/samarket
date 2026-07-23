# Phase C — Domain + identity (컬럼·API · migration 작성만)

**기준:** Phase B freeze `2026-07-23-four-domain-phase-b-freeze.md`  
**상태:** **PASS (write-only)** · migration **미적용** · 제품 라우트 **미배선** · **STOP** (Phase D 승인 전)

---

## 1. 산출물

| 산출 | 경로 |
|------|------|
| Migration **draft** (auto-apply 밖) | `docs/community-messenger/migrations-draft/20260723_phase_c_chat_domain_identity.sql` |
| Identity builders (+ SO room) | `lib/chat-domain/four-domain-freeze.ts` |
| Legacy ↔ freeze map | `lib/chat-domain/domain-identity-legacy-map.ts` |
| Domain create/find API | `lib/chat-domain/create-or-find/index.ts` |
| 단위 테스트 | `lib/chat-domain/__tests__/four-domain-phase-c.test.ts` |

---

## 2. Identity 확정 (Phase B 보완)

| Domain | `domain_identity` (room UNIQUE) | 비고 |
|--------|----------------------------------|------|
| `general_direct` | `gd:{sorted(a,b)}` | legacy DB `direct_key` = prefix 없는 pair |
| `group` | `group:{roomId}` | 생성 후 roomId로 확정 |
| `trade` | `trade:{itemId}:{sorted(seller,buyer)}` | `trade_pc:`/`trade_item:`만으로 backfill **금지** |
| `store_order` | `so:order:{orderId}` | **1 order = 1 room** |

| Projection (room UNIQUE 아님) | 키 |
|-------------------------------|-----|
| SO customer viewer | `so:customer:{orderId}:{userId}` (`buildStoreOrderIdentity`) |
| SO owner viewer | `so:owner:{orderId}:{userId}` |
| Participant | draft 컬럼 `store_order_role` = `customer`\|`owner` |

---

## 3. API (thin wrap · dual-write 없음)

| API | Delegates to | plannedColumns |
|-----|--------------|----------------|
| `createOrFindGeneralDirectRoom` | `ensureGeneralFriendDirectRoom` | GD |
| `createOrFindGroupRoom` | `createGroupRoom` | group |
| `createOrFindTradeRoom` | `ensureCommunityMessengerDirectRoomFromProductChat` | trade (item×seller×buyer 필수) |
| `createOrFindStoreOrderRoom` | `ensureStoreOrderMessengerRoom` | `so:order:…` |
| `findRoomIdByDomainIdentity` | `domain_identity` 우선 → legacy fallback | trade는 컬럼 backfill 전 legacy find 불가 |

**Phase C에서 하지 않음:** `app/api/**` · ensure* 본체에 컬럼 INSERT · Surface writer 교체 · REMOVE 삭제.

---

## 4. `inferMessengerDomain*` 축소 계획 (실행은 이후 Phase)

| 단계 | 내용 |
|------|------|
| C (지금) | freeze identity + create/find 준비 · 추론 코드 **유지** |
| D | Domain bootstrap이 `chat_domain` 읽기 · list DTO에 domain 포함 |
| E~F | realtime/read가 domain envelope 사용 |
| H+ | Surface가 projection만 · `inferMessengerDomainFromChatRoom` 제품 경로 호출 0 목표 |
| J | 추론 헬퍼 quarantine → 호출 0 증명 → 삭제 |

**축소 대상(삭제 금지·호출만 줄임):**  
`lib/chat-domain/messenger-domains.ts` · `lib/chats/server/load-chat-room-detail.ts` · `lib/community-messenger/messenger-room-domain.ts` · home classification · notification bridge.

---

## 5. Ledger / UNIQUE 정책 (APPLY 전 필수 결정 — 미결정 기록)

1. **Trade:** CM `trade_pc`/`trade_item` vs `product_chats` triple — freeze identity UNIQUE 전에 **단일 ledger** 선택.  
2. **Store order:** room = `so:order:` · role은 participant/projection.  
3. **Backfill dry-run:** misclassify count 보고서 없이 APPLY 금지.

---

## 6. Gate

| # | 조건 | 결과 |
|---|------|------|
| 1 | migration **작성** · `supabase/migrations` 미투입 | PASS |
| 2 | create/find Domain API 존재 · ensure* wrap | PASS |
| 3 | identity 문자열 = freeze | PASS |
| 4 | Surface writer 교체 0 | PASS |
| 5 | REMOVE 실삭제 0 | PASS |
| 6 | Native Call 수정 0 | PASS |
| 7 | trash 복원 0 · `verify:chat-domain-file-lock` | PASS |
| 8 | 제품 라우트 배선 0 (의도) | PASS |
| 9 | vitest phase-c | PASS |
| 10 | migration **APPLY** | **미실시** (별도 승인) |

**판정:** `PASS (write-only)` · **STOP** — Phase D / migration APPLY 각각 별도 승인.

---

## 7. Phase D 킥오프 (승인 후만)

```text
docs/community-messenger/2026-07-23-four-domain-phase-c.md 준수.
Phase D만. GD/group/trade/SO 독립 bootstrap + list DTO.
migration APPLY·Surface writer 교체·REMOVE 실삭제 금지.
Native Call LOCK 수정 금지. 끝나면 STOP.
```

## 8. Migration APPLY 킥오프 (Phase D와 별개 · 승인 후만)

```text
docs/community-messenger/migrations-draft/20260723_phase_c_chat_domain_identity.sql
을 supabase/migrations 로 승격 + dry-run backfill 보고서 후 APPLY.
create/find dual-write 컬럼 기록은 APPLY 승인 후 별도 PR.
```
