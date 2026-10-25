# §2 묶음 7 — 구현 보고 (main 반영 · W-8)

- 작성: 2026-10-24 PHT
- 브랜치: `feature/messenger-bundle7-wave-abc`
- 기준 tip (분기 시점): `21210d2b1` (origin/main)
- `[배포 구분] 웹만` — 네이티브 재빌드 불필요
- **main 반영: `6eaf9d82` (W-8 · 2026-10-24 22:40 PHT)** — 작업 브랜치 `2b386f418` 을 main 위로 가져오며 1단계 문서 §2 기준으로 일부 보정 (아래 「W-8 보정」)
- Production: **NOT_PROVEN** (본 문서 갱신 시점에 배포 상태 미확인 · Owner 확인)
- 운영 DB: **변경 없음** (묶음 7 은 DB 변경 없음)
- 작업 브랜치의 `vitest.config.ts` 범위 이탈 변경은 main 에 **미포함**

---

## 항목 판정

| ID | 원인 | 수정 파일 (대표) | 검증 증거 | 판정 |
|---|---|---|---|---|
| S-1 | media POST 멤버십 미검사 | `group-rooms/.../media/route.ts` | vitest Wave A contract | CODE PASS |
| F-9 / P-2 | 죽은 friendships 구독 + room 객체 deps | `use-messenger-room-friendship-sync.ts`, `messenger-room-friendship-sync.ts` | vitest friendship-sync + contract | CODE PASS |
| G-2 | left 포함·off-by-one | `service.ts` joinOpenGroup | vitest Wave A contract | CODE PASS |
| F-11 | DB 오류 fail-open `[]` | friends SSOT Result · route 5xx · hydrate 캐시 유지 | vitest friends-ssot F-11 | CODE PASS |
| L-4 | visibility/back 미닫힘 | `CommunityMessengerHome.tsx` + swipe activity | contract L-11/L-4 wiring | CODE PASS · DEVICE NOT_PROVEN · **W-8: 근거 없는 5초 무조작 닫힘 제거** (화면 이탈·뒤로 닫힘 유지) |
| L-5 | 거래목록 scroll/outside 없음 | `DomainTradeListCanaryGate.tsx` | vitest Wave B contract | CODE PASS · DEVICE NOT_PROVEN · **W-8: 5초 닫힘·관련 prop 체인 제거** (스크롤·바깥 탭 닫힘 유지) |
| L-8 | 정책 유지 | 변경 없음 | leave soft/DELETE 분기 유지 | KEEP |
| L-9 | viewer vs room archived 혼동 | swipe-actions + list hint + toggle gate | vitest L-9 | CODE PASS · **W-8: 「복원」 비활성 시 누르면 사유 안내** |
| L-10 | busy·낙관·error clear | Home/Trade busy `action:roomId` · archive 낙관 | typecheck + code review | CODE PASS · DEVICE NOT_PROVEN · **W-8: 8초 오류 박스 → 스낵바 1회로 통일** |
| L-11 | 닫힌 액션 포커스 | `MessengerChatListItem` tabIndex/inert | vitest L-11 | CODE PASS · DEVICE NOT_PROVEN |
| F-5 | DotMenu 연타 | OneToOneDotMenu → friend-requests client | vitest F-5 | **W-8: 묶음 6 보완판으로 대체** (요청 취소·수락·메뉴 비활성 표시) · 묶음 6 판정을 따름 |
| F-6 | relations/friend gate 부재 | `relations/friend/route.ts` | vitest F-6 | CODE PASS |
| F-8 | 숨김/차단 실패 무알림·원문 | Home snackbar · PeerNotice · phase2 controller | code + i18n keys | CODE PASS · DEVICE NOT_PROVEN · **W-8: 실패 문구 = 무엇이 안 됐는지 + 다음 행동** |
| F-13 | 레거시 주석 | `community-messenger-friendships-ssot.ts` | 문서 정합 | CODE PASS |
| P-1 | clearExpired 항상 새 state | typing store + timeline room bucket | vitest P-1 | CODE PASS |
| P-3 | 친구탭 무조건 fetch | Home hydrate gate (full+비어있지 않으면 skip) | code | CODE PASS · RUNTIME NOT_PROVEN |
| K-5 | 방별 draft 없음 | composer draft storage | vitest K-5 | CODE PASS |
| K-7 | 멘션 키보드 미연결 | Composer keydown + focus-within | vitest K-7 | CODE PASS · DEVICE NOT_PROVEN · **W-8: 하드코딩 색 → `--sam-primary`·`--sam-primary-soft`** |
| M-10+ | 원문 없음 | — | — | EXCLUDED |

---

## 자동화 검증

- vitest Bundle7 Wave A/B/C contracts + friendship/friends-ssot: **PASS** (32)
- `NODE_OPTIONS=--max-old-space-size=8192 npm run typecheck:build`: **PASS**
- eslint (변경 파일): **0 errors** (기존 warnings 존재)
- 브라우저/실기기: **NOT_PROVEN**
- 묶음 6 중앙 팝업 Realtime: **여전히 NOT_PROVEN** (묶음 7로 대체하지 않음)

---

## W-8 보정 요약 (main `6eaf9d82`)

| 항목 | 작업 브랜치 | main (W-8) |
|---|---|---|
| L-4·L-5 | 5초 무조작 시 스와이프 닫힘 | 5초 닫힘 **제거** (근거 없음) · 화면 이탈·뒤로·스크롤·바깥 탭 닫힘 유지 |
| L-9 | 복원 CTA 비활성만 | 비활성 + 누르면 **사유 안내** |
| L-10 | 8초 오류 박스 | **스낵바 1회** |
| F-5 | DotMenu → friend-requests client | 묶음 6 보완판(취소·수락·비활성 표시)으로 **대체** |
| K-7 | `#006241`·`#EAF4EF` | `--sam-primary`·`--sam-primary-soft` |
| F-8 | 실패 알림 추가 | 문구 형식 통일 (무엇이 안 됐는지 + 다음 행동) |
| 나머지 (S-1·F-9/P-2·G-2·F-11·L-11·F-6·F-13·P-1·P-3·K-5) | — | 원 커밋 그대로 |

## W-9 (참고 · 묶음 7 아님)

- main `d372be96` (2026-10-24 22:47 PHT) — 통화 안내(E-C3 중앙 팝업) **문구·색만** 정리. 통화 규정에 따라 **통화 단독 커밋**이며 묶음 7 범위에 포함하지 않는다.
- 안내 표시 시점·종류·발송·상태 전이·네이티브 표시 변경 없음. 실기기: **NOT_PROVEN**.

## 판정

- 묶음 7: **main 반영 완료 (CODE PASS)** · Production **NOT_PROVEN** · DEVICE (L-4·L-5·L-10·L-11·F-8·K-7·P-3) **NOT_PROVEN** → 실기기 확인 전 **CLOSED 아님**.
- 묶음 6 중앙 팝업 Realtime: **여전히 NOT_PROVEN** (묶음 7 로 대체하지 않음).

## 범위 준수

- main: **`6eaf9d82` 반영** · 운영 DB: **미변경**
- 통화·네이티브·SIDE·E-C2-C/D·Stage F: **미착수**
- 묶음 1~5 CLOSED 유지 · 묶음 6 구현 유지
