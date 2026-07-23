# Phase F — 방 단위 원자 read · stale snapshot 방지

**선행:** Phase E  
**상태:** **PASS** · **STOP** (Phase G 승인 전)

---

## 1. 산출

| 산출 | 경로 |
|------|------|
| Version / compare | `lib/chat-domain/room-read/domain-room-read-version.ts` |
| Atomic apply | `lib/chat-domain/room-read/atomic-room-read.ts` |
| Snapshot attach | `lib/chat-domain/room-read/attach-room-read-version.ts` |
| Snapshot optional fields | `CommunityMessengerRoomSnapshot.readVersionMs` / `readVersionSource` |
| pick / prime wire | `messenger-room-initial-snapshot-authority.ts` · `room-snapshot-cache.ts` `primeRoomSnapshot` |
| Tests | `lib/chat-domain/__tests__/four-domain-phase-f.test.ts` |

---

## 2. 계약

- **versionMs** = content clock (`lastMessageAt` + message `createdAt`), **not** cache write time  
- incoming.versionMs **&lt;** prev → **reject** (stale restore 방지)  
- equal version → **source rank**: server_bootstrap &gt; memory/hot/idb &gt; unknown &gt; **optimistic**  
- optimistic은 equal-or-newer server/cache를 덮지 못함  

---

## 3. Gate

| # | 조건 | 결과 |
|---|------|------|
| 1 | stale reject unit | PASS |
| 2 | optimistic &lt; server on equal | PASS |
| 3 | pickRichest: fresher server &gt; rich stale cache | PASS |
| 4 | hub/bell/applyHomeListPatch/REMOVE/Native 미변경 | PASS |
| 5 | `verify:chat-domain-file-lock` | PASS |

**판정:** `PASS` · **STOP**

---

## 4. Phase G 킥오프 (승인 후만)

```text
docs/community-messenger/2026-07-23-four-domain-phase-f.md 준수.
Phase G만. Domain push/sound/route.
Surface writer 교체·REMOVE·Native Call 금지. 끝나면 STOP.
```
