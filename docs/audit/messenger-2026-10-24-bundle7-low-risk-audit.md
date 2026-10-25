# §2 묶음 7 그 밖의 낮은 위험 — 감사·원인·최소 수정 설계 (구현 전)

- 작성: 2026-10-24 ~07:30 PHT · **Owner 처리 방향 고정:** ~07:34 PHT
- Owner 지시: 「다음 작업으로 이어 가자」→ 묶음 1~5 CLOSED 유지 · 묶음 6은 **완전 종료 아님** · **§2 우선7 감사·최소 설계만** · 코드·DB·main·Prod·네이티브 **금지**
- SSOT: `docs/audit/messenger-2026-10-22-reaudit-plan.md` §2 우선7  
  원 정의: `docs/dibay-messenger-full-audit-2026-10-21.md` (git `9e987efb`, 현 WT 없음)  
  선행: 묶음 1~5 CLOSED · 묶음 6 tip `21210d2b1` (main+운영 DB PASS · **중앙 팝업 Realtime NOT_PROVEN** → **CLOSED 금지**)
- **제외:** 묶음 1~5 재개봉 · 묶음 6 잔여(팝업 Realtime)와 혼합 금지 · 통화/네이티브 · SIDE · E-C2-C/D · Stage F · M-10/11/14/15(원문 부재)

`[배포 구분] 웹만` — 단 **본 문서는 감사·설계만 · 구현 승인 없음 · STOP**.

기준 tip: `21210d2b1`

---

## 0. 선행 상태 (재조사 없음)

| 항목 | 판정 |
|---|---|
| 묶음 1~5 | **CLOSED** 유지 |
| 묶음 6 | main+운영 DB **PASS** · 중앙 팝업 Realtime·DEVICE **NOT_PROVEN** → **완전 종료(CLOSED)로 판정하지 않음** |
| E-C* / SIDE | 별도 대장 · 본 묶음 혼합 금지 |

**Owner 확정 (2026-10-24):** 묶음 7은 현재 **감사 + 최소 수정 설계까지**만 완료. 실제 결함 수정은 미착수. 구현 승인 전 STOP 유지.

---

## 1. §2 묶음 7 원래 요구사항

| ID 군 | 원 감사 요지 |
|---|---|
| F-5·6·8·9·11·13 | 친구/차단 경로 일관성·에러 UX·죽은 Realtime·조회 fail-open·문서/잔재 |
| L-4·5·8~11 | 스와이프 자동/외부 닫힘 · 거래목록 · leave 분기 · 보관 판정 · busy · a11y |
| M-10·11·14·15 | **원 메신저 전면감사 표에 행 없음** (M-1~M-9만) → 본 묶음 **정의 NOT_PROVEN** |
| K-5·7 | 방별 draft · 멘션 키보드 |
| P-1~3 | typing 리렌더 · friendship-sync deps · 친구 탭 과다 fetch |
| G-2 | 오픈그룹 정원(left 포함·off-by-one) |
| S-1 | 그룹 media POST 멤버십 미검사 |

---

## 2. 항목별 현재 상태 (코드 대조)

| ID | CODE | 요약 · 증거 |
|---|---|---|
| **F-5** | **PARTIAL** | 주 경로 Bundle6 RPC로 23505 사용자 노출 **SUPERSEDED**. `OneToOneDotMenu` 연타 가드·레거시 insert `error.message` 노출 **EXISTS** |
| **F-6** | **EXISTS** | `/friend-requests`만 signup/profile gate · `/relations/friend`는 rate-limit만 |
| **F-8** | **EXISTS** | 숨김/PeerNotice/수신배너 차단 실패 무알림 · 방 안 차단 raw `json.error` |
| **F-9** | **EXISTS** | `use-messenger-room-friendship-sync.ts` → `community_messenger_friendships` 구독 |
| **F-11** | **EXISTS** | 친구/숨김 조회 DB 오류 시 `[]` fail-open |
| **F-13** | **PARTIAL** | friend-request-client 사체 **FIXED**(현 client). 「RPC 동일 가드」주석·friendships 잔재 **EXISTS** |
| **L-4** | **EXISTS** | 스크롤/섹션 전환은 닫힘. **5초 타이머·visibility·하드웨어 back·section 밖 탭** 없음 |
| **L-5** | **EXISTS** | `DomainTradeListCanaryGate`에 scroll/outside → swipe close 배선 없음 |
| **L-8** | **EXISTS** | private_group soft `left_at` vs 그 외 DELETE (의도적 분기 가능 · 제품 통일 여부 Owner) |
| **L-9** | **EXISTS** | 방 `archived` vs viewer `is_archived` 혼재 · 복원은 viewer 플래그만 |
| **L-10** | **EXISTS** | 단일 `busyId` · archive 낙관 없음 · `actionError` 자동 clear 없음 |
| **L-11** | **EXISTS** | `aria-hidden={dragX===0}` 안 focusable 버튼 |
| **M-10·11·14·15** | **NOT_PROVEN** | 메신저 전면감사에 ID 행 없음 · admin 설계 M-*와 충돌 가능 → **구현 후보 제외** |
| **K-5** | **EXISTS** | 방별 draft persist 없음 (`useState("")`) |
| **K-7** | **EXISTS** | 멘션 Arrow/Enter/229/focus-ring 미연결 |
| **P-1** | **EXISTS** | `clearExpired`가 변화 없어도 새 `byRoomId` 반환 → 1.5s 리렌더 |
| **P-2** | **EXISTS** | friendship-sync deps `snapshot?.room` → 읽음 변경 시 채널 teardown |
| **P-3** | **EXISTS** | 친구 탭 hydrate 무조건 fetch (횟수 1~3은 런타임 NOT_PROVEN) |
| **G-2** | **EXISTS** | 정원 판정 경로에 left 미필터·off-by-one (요약 count는 active 필터 있음 — 입장 gate와 불일치 가능) |
| **S-1** | **EXISTS** | `group-rooms/.../media` POST read-counts 멤버십 검사 없음 |

실기기: 전항 **NOT_PROVEN** (본 단계 코드만).

---

## 3. 확인된 원인 (유지)

1. Bundle6이 친구 **요청 모델**만 바꿨고, 방 sync·에러 UX·스와이프 주변·성능 잔여는 손대지 않음.  
2. F-9/P-2는 같은 훅의 죽은 테이블 + 객체 deps.  
3. L-4/L-5는 Bundle5가 L-1~3·6·7만 닫아 우선7 스와이프 잔여가 남음.  
4. M-10+는 계획 ID만 있고 메신저 감사 원문이 없어 이번 묶음에서 **채택 불가**.

---

## 4. Owner 처리 방향 (2026-10-24 확정)

| 구분 | 처리 방향 |
|---|---|
| **Wave A** | 보안·정확성 결함 **우선 수정** (S-1 · F-9/P-2 · G-2 · F-11) |
| **Wave B** | UI·UX·접근성 결함 수정 (L-4·5·11 · F-5 잔여 · F-6 · F-8 · **L-9 · L-10**) |
| **Wave C** | 성능·입력 결함 수정 (P-1 · P-3 · K-5 · K-7) — **선택 아님 · 묶음 7 완료에 포함** |
| **L-8** | 기존 그룹 soft leave / 1:1 DELETE **정책 유지** (코드 변경 없음) |
| **F-13** | 본 문서 최소 수정안 적용 (Wave B와 동일 승인 범위) |
| **M-10·11·14·15** | 원문 정의 없음 — **제외** |
| **묶음 1~5** | **CLOSED 유지** |

**완료 조건:** Owner가 묶음 7 **전체 구현**을 승인하면 Wave **A → B → C** 순으로 확인된 결함을 **모두** 처리한다. Wave A만 하고 B·C를 방치하면 묶음 7 **미완료**.

---

## 5. 최소 수정 설계 (구현 승인 후 · 웹만)

### Wave A — 보안·정확성

| ID | 최소 수정 | 비고 |
|---|---|---|
| **S-1** | POST 전 active membership(`left_at IS NULL`) 검사 → 비멤버 403 | GET과 동일 권한 |
| **F-9 + P-2** | 구독 테이블 → `user_social_relations` (owner=viewer) · deps를 `roomId`·`viewerUserId`·`peerUserId` 원시값만 | 한 훅 |
| **G-2** | 오픈그룹 capacity SELECT에 `left_at IS NULL` · `count >= memberLimit`로 판정 통일 | 요약 count와 동일 SSOT |
| **F-11** | DB 오류 시 빈 목록 대신 기존 캐시 유지 + 5xx/토스트 | fail-open 금지 |

### Wave B — UI·UX·접근성

| ID | 최소 수정 |
|---|---|
| **L-4** | 열린 스와이프: visibility hidden · Cap `backButton`(닫기만 소비) · 무조작 5초 타이머(액션 hit 시 리셋) |
| **L-5** | 거래 목록에 Home과 동일 scroll/outside → `setOpenedSwipeItemId(null)` |
| **L-9** | 복원 CTA는 **viewer `is_archived`만**. 방 단위 archived는 별 배지/비활성 |
| **L-10** | busy 키를 `action:roomId`로 · archive 낙관 1회 · actionError 8s clear |
| **L-11** | 닫힘 시 액션 `tabIndex={-1}` + `inert` 또는 포커스 가능 요소 제거 |
| **F-5 잔여** | DotMenu 친구 CTA busy/단발 가드 (RPC 경로) |
| **F-6** | `/relations/friend` POST에 friend-requests와 동일 signup/profile gate |
| **F-8** | 숨김/차단 실패 → 공통 스낵바 · 방 안 차단은 safeT 코드 매핑(원문 금지) |
| **F-13** | 주석/문서 정합 · friendships blocked 리더는 archive-only 명시 |

### Wave C — 성능·입력 (묶음 7 완료에 필수)

| ID | 최소 수정 |
|---|---|
| **P-1** | `clearExpired`: 변경 없으면 동일 state 반환 · Timeline은 현재 room bucket만 구독 |
| **P-3** | 친구 탭 hydrate: stale 시각/티어 조건 복구 (주석과 일치) |
| **K-5** | 방별 draft Map + sessionStorage try/catch |
| **K-7** | 멘션 ArrowUp/Down·Enter 선택 · `isComposing`/keyCode 229 · `:focus-within` |

### 정책 유지 (수정 없음)

| ID | 방침 |
|---|---|
| **L-8** | 그룹 soft `left_at` vs 1:1 DELETE **유지** |

---

## 6. 비범위

- 묶음 1~5 CLOSED 재개봉  
- 묶음 6 완전 종료 선언 · 중앙 팝업 Realtime 잔여를 묶음 7에 흡수  
- M-10·11·14·15 (정의 없음)  
- 통화·네이티브·SIDE·E-C2-C/D  
- Stage F 전체 회귀  
- 운영 DB 마이그레이션 (필요 시 **별도 승인**)  
- **구현 승인 전** 코드·커밋·푸시

---

## 7. Owner 승인 체크리스트 (구현 전 · 현재 전부)

- [x] 묶음 7 **전체 구현** 승인 (Wave A → B → C 전부) — 구현 완료 · `messenger-2026-10-24-bundle7-impl-report.md`  
- [x] L-8 정책 유지 · M-10+ 제외 확인  
- [x] main — `6eaf9d82` (W-8 · 1단계 문서 §2 보정 포함) · Production **NOT_PROVEN**  

---

## 8. 결론 (설계 당시 · 아래 §9 가 현재 상태)

- 묶음 7 = **감사 + 최소 수정 설계까지 완료**. 실제 결함 수정 **미착수**.  
- 묶음 6 = main+운영 DB PASS이나 중앙 팝업 Realtime **NOT_PROVEN** → **완전 종료 아님**.  
- **구현 승인 없음 · STOP 유지.** Owner가 묶음 7 전체 구현을 승인하면 Cursor가 범위 내 수정·검증을 A→B→C 순으로 진행한다.

**STOP.**

---

## 9. 현재 상태 (2026-10-25 · W-8·W-9 기준)

| 항목 | 상태 |
|---|---|
| 묶음 7 Wave A–C | **main 반영** `6eaf9d82` (W-8) · CODE PASS |
| W-8 보정 | L-4·L-5 5초 닫힘 제거 · L-9 비활성 사유 안내 · L-10 스낵바 · F-5 묶음 6 보완판 대체 · K-7 토큰 · F-8 문구 형식 |
| W-9 | `d372be96` 통화 안내 문구·색 — **통화 단독 · 묶음 7 아님** |
| Production | **NOT_PROVEN** |
| DEVICE | L-4·L-5·L-10·L-11·F-8·K-7·P-3 **NOT_PROVEN** → **CLOSED 아님** |
| 묶음 6 | 중앙 팝업 Realtime **NOT_PROVEN** 유지 (묶음 7 로 흡수하지 않음) |
