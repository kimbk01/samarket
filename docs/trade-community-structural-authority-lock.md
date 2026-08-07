# DIBAY COMMUNITY TRADE STRUCTURAL AUTHORITY LOCK

**Status:** **PASS / LOCKED**  
**Declared:** 2026-08-07 (user-confirmed)  
**Mode:** Structure / SSOT only — not Bridge removal, not UI redesign, not perf claim

## Verdict

```
DIBAY COMMUNITY TRADE STRUCTURAL AUTHORITY LOCK — PASS
```

구조 변경 이후 주요 Runtime이 유지되었고, prod-like 재측정으로 핵심 경로가 확인되었다.

## LOCK 범위 (IN)

이번 LOCK은 **구조 단일화 결과**에만 적용한다.

| Concern | Locked target |
|---------|----------------|
| Listing | **L1** `posts.seller_listing_state` (+ writer converge helpers) |
| Conversation runtime | **C3** CM room + `direct_key` / trade-chat surface |
| Unread direction | **U1** CM participants (HS5 = Bridge, still LIVE) |
| Process UI | **S1** `CommunityMessengerTradeProcessSection` |
| Trade list | **T1** CM trade-chats surface |
| Bridges | **유지** — exit criteria locked; **not removed** |

## LOCK 범위 밖 (OUT)

다음을 제거·완료·성능 개선으로 **해석하지 않는다**.

- HS5 unread bridge 제거
- CM→item trade Mirror 제거
- Legacy product-chat create 제거
- Phase3 cutover 승격(PhB 유지: do not promote now)
- Bridge Exit 조건 충족 선언 후 실제 삭제
- 신규 아키텍처 / UI·UX / 프로세스 도메인 변경

이후 Bridge 제거·추가 cleanup은 **별도 단계**.

## Runtime / 측정 근거 (2026-08-07, `next start` prod-like)

- S1 / S3 / S4 / S5: `docs/perf/trade-checksheet-audit-latest.json`
- S2 continue → CM room → textarea: `docs/perf/trade-s2-chat-entry-latest.json`
  - warm textarea wall p95 **1135ms**
  - warm `chat_click_to_room_ready` p95 **648ms** (AUDIT-4 room_ready 629–726과 동급 구간)

## 유보 (LOCK을 막지 않음 · 단정 금지)

1. **S1 server p95 1040ms** (이전 TRADE-AUDIT-4 **679ms**보다 높음) — 추가 샘플 없이 **성능 개선 선언 금지**.
2. **신규「채팅하기」→ compose** 경로는 이번 S2에서 직접 미측정 (측정은 Continue chat → 기존 CM room).

## 관련 코드 앵커

- L1: `lib/products/seller-listing-state.ts`, `lib/trade/posts-listing-write-fields.ts`
- C3/T1: `lib/chats/surfaces/trade-chat-surface.ts`
- S1: `components/community-messenger/CommunityMessengerTradeProcessSection.tsx`
- Bridge exit (remove 금지 조건): `lib/trade/trade-bridge-exit-conditions.ts`
- Domain ownership: `lib/chat-domain/messenger-domains.ts`
