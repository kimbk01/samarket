# §2 묶음 7 — 구현 보고 (작업 브랜치)

- 작성: 2026-10-24 PHT
- 브랜치: `feature/messenger-bundle7-wave-abc`
- 기준 tip (분기 시점): `21210d2b1` (origin/main)
- `[배포 구분] 웹만` — 네이티브 재빌드 불필요
- **main 병합 · Production · 운영 DB: 미실행 (별도 Owner 승인 필요)**

---

## 항목 판정

| ID | 원인 | 수정 파일 (대표) | 검증 증거 | 판정 |
|---|---|---|---|---|
| S-1 | media POST 멤버십 미검사 | `group-rooms/.../media/route.ts` | vitest Wave A contract | CODE PASS |
| F-9 / P-2 | 죽은 friendships 구독 + room 객체 deps | `use-messenger-room-friendship-sync.ts`, `messenger-room-friendship-sync.ts` | vitest friendship-sync + contract | CODE PASS |
| G-2 | left 포함·off-by-one | `service.ts` joinOpenGroup | vitest Wave A contract | CODE PASS |
| F-11 | DB 오류 fail-open `[]` | friends SSOT Result · route 5xx · hydrate 캐시 유지 | vitest friends-ssot F-11 | CODE PASS |
| L-4 | 5s/visibility/back 미닫힘 | `CommunityMessengerHome.tsx` + swipe activity | contract L-11/L-4 wiring | CODE PASS · DEVICE NOT_PROVEN |
| L-5 | 거래목록 scroll/outside 없음 | `DomainTradeListCanaryGate.tsx` | vitest Wave B contract | CODE PASS · DEVICE NOT_PROVEN |
| L-8 | 정책 유지 | 변경 없음 | leave soft/DELETE 분기 유지 | KEEP |
| L-9 | viewer vs room archived 혼동 | swipe-actions + list hint + toggle gate | vitest L-9 | CODE PASS |
| L-10 | busy·낙관·error clear | Home/Trade busy `action:roomId` · archive 낙관 · 8s clear | typecheck + code review | CODE PASS · DEVICE NOT_PROVEN |
| L-11 | 닫힌 액션 포커스 | `MessengerChatListItem` tabIndex/inert | vitest L-11 | CODE PASS · DEVICE NOT_PROVEN |
| F-5 | DotMenu 연타 | OneToOneDotMenu → friend-requests client | vitest F-5 | CODE PASS |
| F-6 | relations/friend gate 부재 | `relations/friend/route.ts` | vitest F-6 | CODE PASS |
| F-8 | 숨김/차단 실패 무알림·원문 | Home snackbar · PeerNotice · phase2 controller | code + i18n keys | CODE PASS · DEVICE NOT_PROVEN |
| F-13 | 레거시 주석 | `community-messenger-friendships-ssot.ts` | 문서 정합 | CODE PASS |
| P-1 | clearExpired 항상 새 state | typing store + timeline room bucket | vitest P-1 | CODE PASS |
| P-3 | 친구탭 무조건 fetch | Home hydrate gate (full+비어있지 않으면 skip) | code | CODE PASS · RUNTIME NOT_PROVEN |
| K-5 | 방별 draft 없음 | composer draft storage | vitest K-5 | CODE PASS |
| K-7 | 멘션 키보드 미연결 | Composer keydown + focus-within | vitest K-7 | CODE PASS · DEVICE NOT_PROVEN |
| M-10+ | 원문 없음 | — | — | EXCLUDED |

---

## 자동화 검증

- vitest Bundle7 Wave A/B/C contracts + friendship/friends-ssot: **PASS** (32)
- `NODE_OPTIONS=--max-old-space-size=8192 npm run typecheck:build`: **PASS**
- eslint (변경 파일): **0 errors** (기존 warnings 존재)
- 브라우저/실기기: **NOT_PROVEN**
- 묶음 6 중앙 팝업 Realtime: **여전히 NOT_PROVEN** (묶음 7로 대체하지 않음)

---

## 범위 준수

- main / Production / 운영 DB: **미변경**
- 통화·네이티브·SIDE·E-C2-C/D·Stage F: **미착수**
- 묶음 1~5 CLOSED 유지 · 묶음 6 구현 유지
