# Domain list paint — slice-2 (chatDomain SSOT preference)

**선행:** Domain list slice-1 (writers + dual-write)  
**상태:** **PASS (slice-2)** · legacy contextMeta/directKey fallback 유지

---

## 연결됐던 공백

| 층 | slice-1 | slice-2 |
|----|---------|---------|
| Domain writers | 채워짐 | 동일 |
| UI pillar 필터 | `contextMeta` / `directKey` only | **`chatDomain` 우선** · 없으면 legacy |
| getDomainListProjection UI read | 없음 | 아직 없음 (DTO 빈약) |
| Bell/AppIcon | not_wired | 미착수 |

## 변경

`communityMessengerRoomIsConfirmedTrade` / `…Delivery`:
- `chatDomain === "trade"` / `"store_order"` → true
- 다른 Domain chatDomain → false (fail-closed)
- chatDomain 없으면 기존 contextMeta/directKey

## 잔여

- Bell / App Icon cutover
- Domain projection을 list **행 소스**로 직접 렌더 (enrich DTO 필요)
- DB backfill (nullable dual-write 창)
- R2 poll 재평가
