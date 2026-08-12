# 2. 기능별 First Bad Change + 변경 전/후

**Mode:** 증명 · Partial Rollback 미결정  
**실측:** asas55 · Xiaomi/Samsung · `capture-all.json`

---

## 2.1 App Icon — 20 vs 22

### 실측 분해 (Xiaomi home, asas55)

| 필드 | 값 |
|------|-----|
| A `memberNotificationUnread` | 0 |
| GD | 3 |
| Group | 0 |
| Trade | 2 |
| Order (customer) `orderUnreadRooms` | 15 |
| `memberConversationUnreadRooms` | **20** (= 3+0+2+15) |
| `memberAppIconAuthority.appIconTotal` / Cap 경로 | **20** (= A+B_member) |
| `domainUnreadRooms.store_order` | **17** |
| owner SO 추정 | 17 − 15 = **2** |
| `appIconUnified` / `http_unified_appIconTotal` | **22** (= 20 + 2 owner) |

### 왜 20인가 / 왜 22인가 (코드 연결)

| | 공식 | owner SO |
|--|------|-----------|
| **20 (member path)** | A + GD+Group+Trade+**Customer** SO | **제외** |
| **22 (unified path)** | NotificationAttention + ChatAttention(GD+Group+Trade+Customer+**Owner**) | **포함** |

### 변경 전 (`06bab8001^`)

`build-notification-badge-projection.ts`:

```text
storeOrderForAppIcon = ownerForHub + buyer   // App Icon chat축에 owner 포함
appIconTotal = resolveDomainAppIconBadgeCount(...)  // 사실상 unified류 합
```

이때는 **단일 appIconTotal가 owner를 포함**하는 쪽에 가까움 → 이중 20/22 분열 없음(또는 다른 축).

### 변경 후 (`06bab8001`)

```text
storeOrderForAppIcon = buyer   // owner 제외 ← Slice 2-3 의도
memberAppIconWebTotal = A + B_member
```

동시에 `chat-notification-attention-projection.ts`의  
`ChatAttentionTotal = … + Owner` 와 `unifiedAttention.appIconTotal` **계산·HTTP 반환 유지**.

### First-bad

| | |
|--|--|
| First-bad | **`06bab8001`** — member icon에서 owner 제외하면서 unified를 권위 후보로 남김 |
| Amplify | **`6c8e2c8eb`** — `memberAppIconAuthority`를 Cap 정식으로 고정, HTTP에 두 값 병존 강화 |
| Echo | `e2cb00ec8` — Cap이 member 20을 그림 → 런처=20, smoke가 22를 PASS로 읽음 |

### 제품 의미 (아직 KEEP/REVERT 결정 전 사실만)

명령서 §1·§2: Member App Icon에 Owner(C/B_store) **합산 금지** → **20이 명령서 공식과 일치**.  
22는 legacy ChatAttention(owner 포함) → **Member App Icon 권위로는 불일치**.  
“22가 틀린 숫자”가 아니라 **Member App Icon 정의에 맞지 않는 두 번째 공식**이다.

---

## 2.2 Notification Center — OwnerLite + FAB

### 실측

사용자 스크린샷 `/notifications`:

- 「주문 현황」「받은 문의」+ badge **16**
- 좌하단 초록 **+** FAB
- A empty (Bell 0과 일치)

### 변경 전 (Step8 직전, `6c8e2c8eb^`)

Bell 클릭:

```text
setOpen((v) => !v)   // 팝업 — 풀페이지 셸 미진입
```

「모두 보기」:

```text
href="/mypage/notifications#notification-inbox"
```

`conditional-app-shell-flags.ts` (Gate3에서 **미수정**, 현재도 동일 논리):

```text
isMypageHub = pathname.startsWith("/mypage")
showOwnerLiteStoreBar = showBottomNav && !isMypageHub && !isCommunityApp && …
showFloat = !isMypageHub && !isCommunityApp && …
```

→ `/mypage/notifications` 에서는 OwnerLite·Float **꺼짐**.

### 변경 후 (`6c8e2c8eb` Step8)

```text
router.push("/notifications")
href="/notifications"
```

신규 `app/(main)/notifications/page.tsx`.

pathname `/notifications`:

- `isMypageHub` = false  
- `isCommunityApp` = false  
- → `showOwnerLiteStoreBar` **가능(true)**  
- → `showFloat` **가능(true)**

### First-bad

| | |
|--|--|
| First-bad (진입) | **`6c8e2c8eb` Step8** — Bell/See-all을 `/notifications`로 이동 |
| OwnerLite를 NC에 “추가”한 커밋 | **없음** — 셸 미변경 |
| 인과 | 새 경로가 **기존 mypage 제외 규칙 밖**으로 떨어짐 |

증명 요지: Gate3 file list에 shell flags **0건**.

---

## 2.3 Bell UX — Popup → Route

| | 변경 전 | 변경 후 (`6c8e2c8eb`) |
|--|---------|----------------------|
| 클릭 | popup toggle | `/notifications` |
| aria | dialog | 제거 |
| 제품 계획 §7 | NC 전체화면이 목표 | 방향 일치, 셸 미완 |

First-bad UX 진입: **`6c8e2c8eb`**.  
Digit SSOT A: `d6dbb91d4` (숫자 오염 증거 없음 on asas55).

---

## 2.4 Bottom / Trade list “소실”

| 주장 | asas55 실측 | First-bad |
|------|-------------|-----------|
| Bottom 없음 | HTTP=3, Samsung UI=3 | **배정 불가 (미재현)** |
| Trade list empty | roomLinkCount=82, hub unread=2 | **배정 불가 (미재현)** |

---

## 2.5 요약표 (요청 형식)

| 기능 | 변경 전 | 변경 커밋 | 변경 내용 | 제품 영향 |
|------|---------|-----------|-----------|-----------|
| App Icon | 단일에 가깝게 owner 포함 가능 | `06bab8001` | member는 owner 제외, unified는 owner 포함 유지 | **20 vs 22** 실측 FAIL |
| App Icon amplify | dual 시작 | `6c8e2c8eb` | memberAppIconAuthority 정식화 | Cap=20 / smoke=22 |
| Bell digit | mixed attention | `d6dbb91d4` | A only | asas55 A=0 일관 |
| Bell 클릭 | Popup | `6c8e2c8eb` Step8 | Route `/notifications` | UX 변경 |
| See-all | `/mypage/notifications` (OwnerLite off) | `6c8e2c8eb` | `/notifications` (OwnerLite on) | **Owner 16 + FAB** |
| NC 페이지 | 없음/비정규 | `6c8e2c8eb` | page 신설, 셸 미연동 | Member/Store UI 혼입 |
| Shell flags | mypage 제외 | *(변경 없음)* | — | Step8과 결합해 회귀 |
| Native echo | 다양 | `e2cb00ec8` | MemberAppIcon echo | 런처=20 고정 |
