# 배달 하단 FAB 섹터 계약

배달 탭 보조 메뉴(`MainBottomNavFabSector`) — `/stores`·장바구니·주문내역 등에서 노출.

**단일 구현:** `components/layout/MainBottomNavFabSector.tsx`  
**토큰:** `lib/layout/main-bottom-nav-fab-sector-config.ts`  
**스크롤:** `lib/layout/use-main-bottom-nav-fab-sector-behavior.ts`  
**스타일:** `app/samarket-components.css` (`.main-bottom-nav-fab-sector*`)  
**자동 검증:** `npm run verify:main-bottom-nav-fab-sector-contract`

---

## 1. DOM·레이아웃 (단일 shell)

```
[data-testid=main-bottom-nav-fab-sector]
  └ __dock (우측 정렬)
      └ __shell  ← 배경·너비·높이 morph 한 몸
          ├ __panel-body  ← 메뉴 목록
          │   └ __list
          └ __toggle      ← X / ‹ 단일 버튼
```

**금지 (회귀)**

- 별도 `__edge`·`__stack`·조건부 panel mount·panel/toggle 분리 배경
- 펼침/접힘 시 FAB 본체와 ‹ 탭이 **따로** 슬라이드·리사이즈

**필수**

- 우하단 고정(`MAIN_BOTTOM_NAV_FAB_BOTTOM_CLASS` + 본문 컬럼 `justify-end`)
- `__shell` 하나가 회색 카드 ↔ 검은 ‹ 탭으로 morph (`data-fab-shell-expanded`)
- `__toggle` 높이 **항상** `--fab-edge-h` (펼침·접힘 동일 — 상하 크기 변화 금지)

---

## 2. 패널 상단 여백 (재발 방지 — 중요)

**불변조건:** 첫 메뉴 아이콘 상단 ↔ 회색 shell 상단 거리 = 좌·우 아이콘 여백 = `--fab-panel-inset`.

산식 (`main-bottom-nav-fab-sector-config.ts`):

```
FAB_PANEL_INSET_REM = (FAB_SHELL_W_REM - FAB_ICON_BOX_REM) / 2   // 0.825rem
```

**적용 방법 (고정)**

- `__panel-body`에 **`fabPanelBodyInlineStyle()` 인라인 `paddingTop`만** 사용
- CSS `@layer components`에서 `__panel-body`·`__shell`에 **`padding-top` 금지**
  - `@layer` + `max-height` morph와 충돌해 **computed padding-top ≈ 0** 회귀가 실제로 발생함

**shell `max-height` (펼침)** 는 inset을 예산에 포함:

```
min(62vh, 19.2rem) + var(--fab-edge-h) + var(--fab-panel-inset)
```

---

## 3. 시각·토큰

| 토큰 | 값 | 비고 |
|------|-----|------|
| `--fab-shell-w` | 4.05rem | 펼침 너비 |
| `--fab-edge-w` | 1.3rem | ‹ 탭 너비 |
| `--fab-edge-h` | 3.25rem | ‹·X 토글 높이 |
| `--fab-icon-box` | 2.4rem | 메뉴 아이콘 박스 |
| `--fab-surface-alpha` | 0.6 | 회색 배경 불투명도 |
| `--fab-dock-ms` | 360ms | morph 공통 |

- 펼침: `--fab-surface-bg`, `border-radius` 전체, 그림자 카드형
- 접힘: `--fab-edge-bg` (#000), 좌측만 라운드, ‹ 흰색

---

## 4. 상태 머신 (`FabPhase`)

| phase | UI | `data-fab-shell-expanded` |
|-------|-----|---------------------------|
| `open` | 메뉴 + X | `true` |
| `closing` | morph → ‹ | `false` (즉시) |
| `closed` | ‹ 탭만 | `false` |
| `opening` | ‹ → 확장 | `false` → rAF 후 `true` |

`opening`은 `panelEnterReady` double-rAF 후 shell 확장.

---

## 5. 스크롤·토글 동작

**스크롤** (`useMainBottomNavFabSectorScroll` · `useBottomNavScrollHide`)

| 동작 | 하단 탭 | FAB |
|------|---------|-----|
| 아래로 3px+ | 숨김 | 접힘 |
| 위로 3px+ | **즉시 표시** | **접힘** |
| 맨 위 (`y < 8`) | 즉시 표시 | 즉시 펼침 |
| 멈춤 후 1.8s | 숨김 상태면 표시 | 접힘 상태면 펼침 |

**X 버튼**

- FAB 접힘 + `router.refresh()`
- `expandLocked = true` → **스크롤·idle로 자동 펼침 없음**
- **`‹` 탭 직접 탭**할 때만 `expandLocked` 해제 후 펼침

**메뉴 항목 탭**

- `collapse()`만 (잠금 없음) → 스크롤 규칙으로 다시 펼쳐질 수 있음

**장바구니 뱃지**

- 펼침: cart 행 (흰 ring)
- 접힘: ‹ 토글 (흰 ring) — **`StoreCommerceCart` hydrate 완료 후에만** 표시 (0→N flash 방지)
- 운영센터 attention: 접힘 ‹ 에 ops 전용 클래스 (`__toggle-ops-badge`), cart와 aria·클래스 분리

---

## 6. 수정 시 체크리스트

1. `npm run verify:main-bottom-nav-fab-sector-contract`
2. `npx tsc --noEmit`
3. `/stores`에서 확인: 상단 inset, ‹ 높이 고정, X 잠금, 스크롤 멈춤 후 1.8s·하단 탭과 동시 펼침
4. 계약 변경 시 **본 문서 + `.cursor/rules/main-bottom-nav-fab-sector-contract.mdc`** 함께 갱신

---

## 7. 변경 이력

| 날짜 | 요약 |
|------|------|
| 2026-05-26 | 스크롤 상·하 이동 시 접힘 (하향만 → 양방향) |
| 2026-05-26 | 단일 shell morph, inset 인라인 고정, X expandLock, idle +2s, 계약·verify 추가 |
| 2026-05-27 | Christmas Starbucks 팔레트 단일 TS 고정·셸/아이콘 재적용, 스크롤 idle 0(rAF 즉시 펼침) |
| 2026-05-27 | 스크롤 접힘 회귀 수정: settled Y 검사 후 펼침, `subscribeAppShellScroll` hub 루트 재바인딩 |
| 2026-05-27 | 스크롤 규칙·idle 1.8s — `useBottomNavScrollHide` 와 단일 상수·방향 분기 공유 |
| 2026-05-27 | FAB scroll 깜빡임 — Context로 하단 탭 hidden 공유, 이중 subscribe·settled 검사 제거 |
| 2026-05-27 | FAB·하단 탭 스크롤 분리 — FAB는 위·아래 스크롤 접힘, 하단 탭은 아래만 숨김 |
| 2026-05-27 | `/stores/browse/*`·`/stores/search` — `isStoresDeliveryHubChromePath` 헤더·FAB 동일 계약 |
| 2026-05-29 | 캡션 줄바꿈·가로 스크롤 제거, 펼침 shell overflow visible·패널 뱃지, clamp 반응형, 스토어 어드민 gold 강조 |
| 2026-06-05 | 접힘 ‹ 장바구니 뱃지 — cart hydrate 게이트, ops `__toggle-ops-badge` 분리 |
