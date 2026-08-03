# Gate 3 Step 12 — Room Identity Fallback 종료 보고

**판정: ROOM IDENTITY AUTHORITY CODE PASS**

선언 금지 유지: Badge Authority 전체 CODE PASS · Runtime · Product · Hard Lock · Production cutover READY.

## 1. 기존 `*:room:{uuid}` 생성·사용 경로

| 경로 | 조치 |
|------|------|
| `build-domain-badge-authority-http.ts` invent | **DELETE** — loader 키/peer만 전달 |
| `conversation-b-from-participant-facts.ts` invent | **DELETE** |
| `buildConversationDomainIdentityKey` | canonical resolver로 위임 |
| DB에 남은 `*:room:` 키 | ADAPTER(필드 있으면) / QUARANTINE |

## 2. 수정 파일

- `lib/notifications/badge-authority-rebuild/canonical-conversation-room-identity.ts` (신규)
- `lib/notifications/badge-authority-rebuild/conversation-b-from-participant-facts.ts`
- `lib/notifications/badge-authority-rebuild/member-conversation-b-authority.ts`
- `lib/notifications/pipeline/build-domain-badge-authority-http.ts`
- `lib/notifications/load-messenger-unread-room-facts-from-participants.ts`
- `lib/notifications/load-trade-store-order-unread-room-facts-from-participants.ts`
- `lib/notifications/badge-authority-rebuild/__tests__/room-identity-fallback-contract.test.ts` (신규)
- `lib/notifications/badge-authority-rebuild/__tests__/member-app-icon-authority.test.ts`
- docs: fallback-map · quarantine-contract · 본 보고 · README

## 3. Canonical identity resolver

`resolveCanonicalConversationRoomIdentity` / `normalizeConversationRoomsForAuthority`  
→ `status: canonical | adapted | quarantined`

## 4. Domain별 필수 identity 필드

General: viewerId+peerId · Group: groupId · Trade: listing+seller+counterparty · Customer Order: orderId · Owner: storeId+orderId (Member B 금지)

## 5. ADAPTER 대상

- GD + peer (key 없거나 `:room:` fallback)
- Group → `group:{roomId}`
- Trade/Order with full fields or valid canonical key

## 6. QUARANTINE 대상

불완전 identity · 복원 불가 `:room:` · Owner-in-B · domain mismatch — 이유 코드는 quarantine-contract 문서.

## 7. 삭제한 fallback writer

HTTP / Fact-bag `*:room:{uuid}` invent만 제거. DB row 삭제 없음.

## 8. quarantined count 진단

`identityIncompleteCount` + `quarantined[]`; HTTP log: `identity_incomplete_count`, `identity_quarantined`

## 9. surface 집계 제외 증거

`projectSurfacesFromConversationAuthority` ← B only; App Icon ← A+B(canonical); contract tests PASS

## 10. missed-call 비회귀

Canonical room-bound → B · incomplete → A/B 자동 진입 금지 · XOR contract 유지

## 11. A/B/C/App Icon 비회귀

관련 vitest 116 PASS (A set · B · App Icon · Cap · Legacy · Push · NC · Owner C · Step12)

## 12. 테스트 결과

`room-identity-fallback-contract` 11 + 회귀 스위트 PASS

## 13. tsc / lint

`npx tsc --noEmit` PASS · `npm run lint` PASS

## 14. 남은 segmented legacy fallback

**남아 있음** (Step 12 범위 외). 다음 단계.

## 15. live dry-run 진입 가능 여부

**NOT READY** — segmented legacy + Runtime 미증명. live Production dry-run 금지 유지.
