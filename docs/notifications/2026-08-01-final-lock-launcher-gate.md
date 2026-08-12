# Final LOCK gate — Launcher App Icon (2026-08-01)

**Production / APK:** `ec9c3e7b3` / `dibay-fpv-ec9c3e7b3-ec9c3e7b3.apk`  
**Baseline Authority:** App Icon **32** · Bottom 4 · Trade 1 · Customer 25 · Owner 2 · Bell 2  
**Structure:** RoomUnread / Badge / Bell LOCK — **not modified**

## Chain (first split)

| Layer | Xiaomi | Samsung |
|-------|--------|---------|
| Explain appIconTotal | 32 (prior FPV) | 32 |
| badge-count API | 32 | 32 |
| Cap Badge.get (warm FPV) | 32 | 32 |
| FCM/APNS wire (Phase 2-4 identity) | wireOk | wireOk |
| **홈 화면 Launcher 표시** | **점만 (숫자 32 없음)** | **표시 없음** |

## 육안 증거

| Device | Screenshot | Verdict (team criteria) |
|--------|------------|-------------------------|
| Xiaomi `24076RP19G` | `.qa-logs/badge-ssot-phase4/launcher/xiaomi-home-after-badge-sync.png` | **앱 계산 PASS / OEM 표현 정책** — DIBAY에 점(dot)만, 숫자 32 아님. Google 폴더는 숫자 1 표시 → 런처가 숫자 배지 가능하나 DIBAY는 점형. |
| Samsung `SM-M156S` | `.qa-logs/badge-ssot-phase4/launcher/samsung-home-after-badge-sync.png` | **Native/Launcher Product FAIL** — DIBAY 배지 없음. 옆 Messages는 **145** 숫자 배지 정상. |

Xiaomi channels include `dibay_badge_silent_v1` with `mShowBadge=true` (Samsung dump). App notification importance DEFAULT userSet=true.

## 판정

```text
ANDROID API / Cap Badge.get / Explain   PASS (prior FPV)
ANDROID Launcher 숫자형 App Icon        FAIL (Samsung none / Xiaomi OEM dot)
WEB Product Validation                  PASS (prior)
IOS                                     BLOCKED
PRODUCT PASS — FINAL LOCK               미선언
```

```text
ANDROID PRODUCT VALIDATION PASS   →  partial: API·Cap 기준만; Launcher glyph 미완
DIBAY NOTIFICATION SYSTEM RUNTIME PARTIAL  유지
```

## 수정 원칙 (다음, 승인 후)

최초 갈라진 계층 = **Launcher (Samsung none) / OEM number policy (Xiaomi dot)**  
→ RoomUnread / Badge 계산식 / Bell **금지**  
→ Native Capawesome Badge ↔ OEM ShortcutBadger / notification-number path만 조사  
→ 별도 단일 원인 커밋 + 동일 Case 3회 재검증  
→ Batch B 계속 금지

## Held (not run this gate)

Full domain +1/−1 fixtures ×3, full FCM FG/BG/killed ×3 — **blocked until Launcher gate closes or team accepts OEM-dot as policy**.
