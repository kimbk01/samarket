# Domain list cutover — slice-1

**선행:** Hub badge slice-1  
**상태:** **PASS (slice-1)** · CM home paint KEEP · **STOP** (Bell/AppIcon · full Domain UI paint)

---

## 1. 함

| 항목 | 내용 |
|------|------|
| Domain list writers | `apply*ListProjection` → `ok` + last snapshot |
| Bootstrap | `load*ListBootstrap` → `tryLoadDomainListByChatDomain` (sb 필수) |
| Dual-write | home `chats`+`groups` settle → Domain projections |
| Pillar refresh | trade/delivery mount → Domain bootstrap load |
| CM home | `applyHomeListPatch` **KEEP** (표시 SSOT) |

## 2. 안 함

- CM 홈 혼합 목록을 Domain-only UI로 교체
- Bell / App Icon
- R2 poll 삭제 · R3/R4 삭제

## 3. Hub R1–R4 측정 결과

| ID | 판정 | 조치 |
|----|------|------|
| R1 optimistic | **remove_now** | 호출부 제거 · 함수 no-op · file-lock callers=0 |
| R2 poll 180s | **keep** | 전체 hub breakdown 필요 |
| R3 App Icon | defer | App Icon cutover |
| R4 Bell | defer | Bell cutover |

근거: `lib/chat-domain/projections/hub-r1-r4-measurement.ts`
