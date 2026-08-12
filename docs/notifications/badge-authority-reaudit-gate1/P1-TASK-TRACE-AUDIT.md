# P1 TASK TRACE AUDIT (legacy filename)

> **이관됨:** `P1-INDEX.md` + **`P1-A-TASK-TRACE.md`**  
> 추가 필수: `P1-B-WRITER-TRACE.md` · `P1-C-SURFACE-TRUTH-TABLE.md` · `P1-D-FIRST-WRONG-WRITER-MATRIX.md`  
> 본 파일은 중복 보존. 신규 기입은 P1-A에 한다.

---

## 0. Audit 목적

각 Task에 대해 제품 계약 경로가 성립하는지 전수 기록한다.

```text
Task 생성 → Inbox 표시 → Surface 표시 → 사용자 확인 → Task 완료
  → 모든 관련 Surface 감소 → App Icon (|N∪C∪O|) 감소
```

**하지 않는 것:** 코드 diff만 보고 Gap을 때우기, 패치, 롤백 결정.

**하는 것:** Task 표 전수 + Trace Rule 1–4 판정 열.

---

## 1. 판정 열 정의

| 열 | 의미 |
|----|------|
| Inbox | N / C / O |
| Identity | canonical 접두 |
| 생성 | 무엇이 Task를 만드는가 |
| Surfaces | 표시 가능 표면 (투영) |
| Completion | 사라지는 방법 |
| 감소 집합 | Completion 시 함께 줄어야 하는 Surface |
| Trace | PASS / FAIL / UNKNOWN / N/A |
| 비고 | 실측·코드 근거 |

Trace FAIL 예: Icon에만 있음, Completion 후 Surface 잔존, 산술 중복 가산.

---

## 2. Notification Inbox Tasks (`N`)

| # | Task | 생성 | Surfaces | Completion | 감소 집합 | Trace | 비고 |
|---|------|------|----------|------------|-----------|-------|------|
| N01 | 공지 admin_notice | 관리자/캠페인 발송 | Bell Modal(N), History, App Icon | 읽음·삭제·Archive | Bell, Icon | UNKNOWN | P1 실측 대기 |
| N02 | 시스템 system | 시스템 이벤트 | Bell(N), History, Icon | 읽음·삭제·Archive | Bell, Icon | UNKNOWN | |
| N03 | 보존형 마케팅/혜택 | 캠페인 (persists) | Bell(N), History, Icon | 읽음·삭제·Archive | Bell, Icon | UNKNOWN | ephemeral banner ≠ N |
| N04 | 마케팅 배너 only | FCM ephemeral | (Digit 제외) | N/A | — | N/A | Icon/Bell 미포함 계약 |
| N05 | 커뮤니티 좋아요 | like 이벤트 | Bell(N), History, Icon | 읽음·삭제·Archive | Bell, Icon | UNKNOWN | |
| N06 | 커뮤니티 댓글 | comment | Bell(N), History, Icon | 읽음·삭제·Archive | Bell, Icon | UNKNOWN | |
| N07 | 커뮤니티 답글 | reply | Bell(N), History, Icon | 읽음·삭제·Archive | Bell, Icon | UNKNOWN | |
| N08 | 커뮤니티 리액션 | reaction | Bell(N), History, Icon | 읽음·삭제·Archive | Bell, Icon | UNKNOWN | |
| N09 | 친구 요청 | friend_request | Bell(N), History, Icon | 읽음·삭제·Archive | Bell, Icon | UNKNOWN | |
| N10 | 친구 수락 | friend_accepted | Bell(N), History, Icon | 읽음·삭제·Archive | Bell, Icon | UNKNOWN | |
| N11 | 거래 상태 변경 | trade status | Bell(N), History, Icon | 읽음·삭제·Archive | Bell, Icon | UNKNOWN | ≠ Trade 메시지 |
| N12 | 거래 예약/완료/후기요청 | trade lifecycle | Bell(N), History, Icon | 읽음·삭제·Archive | Bell, Icon | UNKNOWN | |
| N13 | 주문 상태 (고객) | order_status | Bell(N), History, Icon | 읽음·삭제·Archive | Bell, Icon | UNKNOWN | ≠ Order 채팅 |
| N14 | 배달 상태 (고객) | delivery_status | Bell(N), History, Icon | 읽음·삭제·Archive | Bell, Icon | UNKNOWN | |
| N15 | 결제 완료/실패 (고객) | payment | Bell(N), History, Icon | 읽음·삭제·Archive | Bell, Icon | UNKNOWN | |
| N16 | 환불 결과 (고객) | refund result | Bell(N), History, Icon | 읽음·삭제·Archive | Bell, Icon | UNKNOWN | |
| N17 | 주문 취소/거절 통지 (고객) | cancel/reject notify | Bell(N), History, Icon | 읽음·삭제·Archive | Bell, Icon | UNKNOWN | |
| N18 | 보안/계정 | security | Bell(N), History, Icon | 읽음·삭제·Archive | Bell, Icon | UNKNOWN | |
| N19 | 리뷰 요청/알림 | review | Bell(N), History, Icon | 읽음·삭제·Archive | Bell, Icon | UNKNOWN | |
| N20 | Orphan 부재중 (방 비귀속) | missed_call orphan | Bell(N), History, Icon | 읽음·삭제·Archive | Bell, Icon | UNKNOWN | room-bound ≠ N |
| N21 | 매장 sold-out 등 회원 통지 | commerce notice | Bell(N), History, Icon | 읽음·삭제·Archive | Bell, Icon | UNKNOWN | |
| N22 | 분쟁/문제 주문 통지 | dispute | Bell(N), History, Icon | 읽음·삭제·Archive | Bell, Icon | UNKNOWN | |

**금지 (N에 넣으면 FAIL):** `chat_message`, `trade_message`, `group_message`, `store_order_message`, room-bound missed → **C**.

---

## 3. Conversation Inbox Tasks (`C`)

| # | Task | 생성 | Surfaces | Completion | 감소 집합 | Trace | 비고 |
|---|------|------|----------|------------|-----------|-------|------|
| C01 | General 1:1 메시지 | peer message | Row, Hub(GD), Bottom, Icon | Read ACK | Row, Hub, Bottom, Icon | UNKNOWN | |
| C02 | Group 메시지 | group message | Row, Hub(Group), Bottom, Icon | Read ACK | Row, Hub, Bottom, Icon | UNKNOWN | |
| C03 | Trade 메시지 | trade message | Row, Trade Hub, Bottom, Icon | Read ACK | Row, Hub, Bottom, Icon | UNKNOWN | 상태≠C |
| C04 | Customer Order 오너 대화 | owner→customer msg | Row, Order Hub, Bottom, Icon | Read ACK | Row, Hub, Bottom, Icon | UNKNOWN | 시스템 제외 |
| C05 | Owner Chat 고객 메시지 | customer→store msg | Row, FAB, Delivery, Icon (∪) | Read ACK | Row, FAB, Delivery, Icon | UNKNOWN | **∈C not O** |
| C06 | 추가 메시지 동일 방 | 2nd+ msg | Row↑, Hub/Bottom/Icon 유지1 | Read ACK | 전부 | UNKNOWN | Hub 불변 |
| C07 | Room-bound 부재중 | missed in room | Row/방 타임라인, C, Icon | 정책 ACK/해결 | 관련 C·Icon | UNKNOWN | N orphan과 분리 |

Hub↔List: Hub = 미읽음 방 개수 = 리스트 미읽음 행 방 수.

---

## 4. Operation Inbox Tasks (`O`)

| # | Task | 생성 | Surfaces | Completion | 감소 집합 | Trace | 비고 |
|---|------|------|----------|------------|-----------|-------|------|
| O01 | 신규 주문 대기 NEW_ORDER_PENDING | order→pending | O_bell(종), FAB, Delivery, Icon, Admin | 접수/거절 완료 | Bell, FAB, Delivery, Icon, Admin | UNKNOWN | 동일 op id ∪1 |
| O02 | 환불 요청 REFUND_REQUESTED | refund opened | 종(O_bell), FAB, Delivery, Icon, Admin | 승인/거절/resolve | 동시 감소 | UNKNOWN | |
| O03 | 취소 요청 CANCEL_REQUESTED | cancel opened | 종, FAB, Delivery, Icon, Admin | 승인/거절/resolve | 동시 감소 | UNKNOWN | |
| O04 | 매장 문의 OPEN_STORE_INQUIRY | inquiry | 종, FAB, Delivery, Icon, Admin | INQUIRY_RESOLVE | 동시 감소 | UNKNOWN | ≠ Owner Chat |
| O05 | (확장) 조리 단계 업무 | cook stage | 제품 확정 시 O | 단계 완료 | 동시 감소 | N/A | 계약 VERIFY |
| O06 | (확장) 배달 배차 업무 | delivery assign | 제품 확정 시 O | 배송 완료 처리 | 동시 감소 | N/A | VERIFY |

**O가 아닌 것:** OWNER_CHAT_UNREAD → **C05**. NOTIFICATION_READ만으로 O 감소 → **FAIL**.

---

## 5. 복합 Trace 시나리오 (필수 증명)

| # | 시나리오 | Identity | Surfaces 투영 | Completion | 기대 감소 | Trace |
|---|----------|----------|---------------|------------|-----------|-------|
| X01 | 신규 주문 1건 | `operation:{store}:NEW_ORDER:{orderId}` | Bell+FAB+Delivery+Icon | 접수 | **모두** − (∪1) | UNKNOWN |
| X02 | 같은 주문의 고객 채팅 + 신규주문 | `conversation:…` + `operation:…` | 각각 표시 | ACK / 접수 | **각각** Icon −1 | UNKNOWN |
| X03 | 거래 상태만 | `notification:{id}` | Bell+Icon | 읽음 | Bell+Icon | UNKNOWN |
| X04 | 거래 메시지 | `conversation:trade:…` | Row+TradeHub+Bottom+Icon | ACK | 전부 | UNKNOWN |
| X05 | 고객 주문 상태 | `notification:…` | Bell+Icon | 읽음 | Bell+Icon | UNKNOWN |
| X06 | 고객 주문 오너 대화 | `conversation:store_order:…` | Row+OrderHub+Bottom+Icon | ACK | 전부 | UNKNOWN |
| X07 | Icon 20 vs 22 (asas55) | dual formula | Cap vs unified | — | — | **FAIL** | Union SSOT 없음 · P0 전 실측 |
| X08 | 종→NC+FAB+OwnerLite | UI | `/notifications` | — | — | **FAIL** | Modal/섹션 계약 위반 |

---

## 6. Surface × Inbox 매트릭스

| Surface | N | C | O | Digit 수식 |
|---------|---|---|---|------------|
| App Icon | ∪ | ∪ | ∪ | \|N∪C∪O\| |
| Top Bell | N | — | O_bell | \|N∪O_bell\| |
| Bell Modal | N섹션 | — | O_bell섹션 | 구획 |
| Bell History | 회원 내역 | — | 업무 내역 정책 | 분리 |
| Bottom Chat | — | member C | — | \|Cg∪Cgr∪Ct∪Cco\| |
| Trade Hub | — | C_trade | — | \|C_trade\| |
| Order Hub | — | C_co | — | \|C_co\| |
| Row | — | msg | — | msgUnread |
| Delivery/FAB | — | C_ownerChat | O | \|O∪C_ownerChat\| |
| Native | echo Icon | | | = Icon |

---

## 7. Audit 진행 체크리스트

- [ ] §2 N01–N22 실측/코드 writer 연결  
- [ ] §3 C01–C07 Read ACK 경로 확인  
- [ ] §4 O01–O04 Complete trigger 확인  
- [ ] §5 X01–X06 기기 1회 이상 Trace  
- [ ] X07 dual Icon → P3 REBUILD 입력으로 확정  
- [ ] X08 Bell IA → P3 REBUILD 입력으로 확정  
- [ ] 누락 Task 발견 시 본 표에 **행 추가** (닫지 않음)  
- [ ] 전수 Trace 열 UNKNOWN 해소 후 → **P1 COMPLETE** → P3 KEEP/REBUILD/REVERT  

---

## 8. P1 완료 정의

```text
P1 COMPLETE ⇔
  (1) 알려진 제품 Task가 본 표에 행으로 존재하고
  (2) 각 행에 생성·Surface·Completion·감소 집합이 비어 있지 않으며
  (3) Trace Rule 1–4에 대한 PASS/FAIL이 실측 또는 코드 증거로 채워지고
  (4) FAIL 목록이 P3 매니페스트 입력으로 넘길 수 있다
```

그 전에는 KEEP/REBUILD/REVERT **최종 금지**. 코드 수정 **금지**.

---

## 9. 다음

1. 본 표 UNKNOWN → 코드 writer·실측으로 채움 (계속 Audit)  
2. 누락 Task 추가  
3. P1 COMPLETE 선언 후 P3  

관련: Bible P0 LOCK, `12-detailed-formula-execution-plan.md` (P1 명칭 갱신 필요).
