# P1-B — Writer Trace

**Part of:** P1 (`P1-INDEX.md`)  
**Mode:** 감사만 · 코드 수정 없음  
**축:** Task → Writer → Projection → Publisher → Reader → Surface

---

## 0. 왜 Writer Audit가 필요한가

Task는 하나인데 Writer(및 유사 Writer)가 여러 개면:

```text
의도:  notification_events → Bell → App Icon
실제:  events → projection → legacy → cap cache → native → resume → Bell → Icon
```

같은 Task가 여러 단계에서 **다시 발명**되면 Trace Rule 2·4가 깨진다.

---

## 1. 단계 정의

| # | 단계 | 질문 |
|---|------|------|
| W | Writer | 누가 canonical identity를 **처음** 쓰는가? |
| P | Projection | Inbox 집합·∪ 공식을 누가 계산하는가? |
| Pub | Publisher | HTTP/FCM/RT로 무엇을 **내보내는가**? (이중 필드?) |
| R | Reader/Apply | 클라가 어떤 필드를 **권위로 읽는가**? |
| Nat | Native/Cache | Cap·resume·prefs가 권위를 **재발명**하는가? |
| S | Surface UI | UI가 숫자를 **로컬 ±1** 하는가? |

각 Task 행: 단계별 PASS / FAIL / UNKNOWN + 모듈 경로.

---

## 2. 공통 파이프라인 맵 (코드 후보 · 전 Task 공유)

| 단계 | 모듈 후보 |
|------|-----------|
| Writer (N) | `createNotificationEvent` / `notification-event-repository` |
| Writer (C) | messenger/trade/SO participant unread (message insert) |
| Writer (O) | store action open (`NEW_ORDER_PENDING` 등) |
| Projection | `build-notification-badge-projection`, `resolveMemberAppIconAuthority`, `buildUnifiedAppIconProjection`, `projectSurfacesFromConversationAuthority`, C_store ledger |
| Publisher | `build-domain-badge-authority-http` (동시에 memberAppIcon + **unifiedAttention**), FCM `badge_count`, RT |
| Reader | `apply-badge-count-authority-response`, bell/domain stores |
| Native | `NativeBadgeSync`, `sync-native-badge-count`, Cap resume / `applyFromCapBadgeCache` |
| Surface | `PhilifeHeaderNotificationInbox`, BottomNav, Owner FAB, hubs |

---

## 3. Writer Trace 표 (증거 있는 것부터 · 나머지 UNKNOWN)

### Notification (발췌)

| Task | Writer | Projection | Publisher | Reader | Native | Surface | 비고 |
|------|--------|------------|-----------|--------|--------|---------|------|
| N01 공지 | `createNotificationEvent` UNKNOWN확인중 | A/N count UNKNOWN | badge-count HTTP UNKNOWN | apply* UNKNOWN | Cap echo UNKNOWN | Bell Modal **FAIL IA** (Step8 풀페이지) | Surface IA 깨짐은 Task writer와 별개 |
| N11 거래상태 | createNotificationEvent 계열 UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | |
| N13 주문상태 | notify-store-commerce / events UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | |

### Conversation (발췌)

| Task | Writer | Projection | Publisher | Reader | Native | Surface | 비고 |
|------|--------|------------|-----------|--------|--------|---------|------|
| C01 GD | participant unread UNKNOWN | bottom=GD+G **만** (제품: +T+CO) | domainUnreadRooms | apply domain | Icon path | Bottom digit | **Projection**이 Bottom 집합 축소 |
| C03 Trade | participant UNKNOWN | tradeHub OK 방향 | trade rooms | hub apply | Icon member path includes trade | Trade Hub | Bottom 미포함=제품 FAIL |
| C05 OwnerChat | participant owner SO UNKNOWN | owner rooms | storeOrder owner | FAB/hub | **unified에 owner 포함 / member Icon 제외** | FAB | Icon dual → P1-D |

### Operation (발췌)

| Task | Writer | Projection | Publisher | Reader | Native | Surface | 비고 |
|------|--------|------------|-----------|--------|--------|---------|------|
| O01 신규주문 | C_store action / commerce notify UNKNOWN | O vs owner_intake 혼선 위험 | hub + 가능시 events | FAB | Icon ∪ | Bell O_bell·FAB·Delivery | 종 섹션·어드민 라우트 UNKNOWN |

### App Icon ∪ (메타)

| 항목 | Writer | Projection | Publisher | Reader | Native | Surface |
|------|--------|------------|-----------|--------|--------|---------|
| Icon SSOT | — | memberAppIconAuthority **와** unifiedAttention **병행** | HTTP **두 total** | Cap≈member 20 | echo 20 | 런처 20 / smoke 22 | **Publisher에 dual** |

---

## 4. Writer 다중성 안티패턴 (발견 시 P1-D)

| 안티패턴 | 설명 |
|----------|------|
| Dual total publish | 한 HTTP에 Icon 공식 2개 |
| Cache as authority | Cap prefs가 서버 ∪를 덮음 |
| UI invent | 라우트·로컬 −1로 Digit 변경 |
| Legacy second write | notification_events + 별도 notifications 테이블 이중 |
| Resume replay | cold/resume이 다른 Projection 재적용 |

---

## 5. 채우기 규칙

- PASS: 모듈+동작이 Bible과 일치한다는 **증거** (코드 인용 또는 실측)  
- FAIL: 증거 있는 불일치  
- UNKNOWN: 아직 미확인 — **추측으로 PASS 금지**

P1-B는 P1-A Task ID를 키로 전수 확장한다 (급하게 닫지 않음).
