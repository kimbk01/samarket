# USB Guided Capture — iOS Karrot Phase 0 IA (2026-08-06)

## Device
- UDID: `00008120-000025C826F3C01E` (iPhonebk)
- iOS: 26.6 · App: `com.towneers.www` · build UI: 26.31.0 (settings)

## Method
- USB: `pymobiledevice3 developer dvt screenshot … --userspace`
- Auto-tap: NOT (HID N/A) — user operated; agent captured

## Out
`docs/customer-platform/_ios-mypage-audit-2026-08-06/usb/guided-phase0-ia/`

## Captured (DONE)

| File | Screen |
|------|--------|
| P0-00 / P0-01 | 나의 당근 top (프로필·페이·서비스·자주 사용) |
| P0-02 | 하단 설정·고객지원·사업자 정보 |
| P0-05 | 프로필 상세 (매너온도·판매/후기) — P0-04 동일 잘못 명명 |
| P0-06 / P0-08a / P0-09 / P0-13 | 허브 복귀 |
| P0-07 | 설정 |
| P0-08 | 내 계정 |
| P0-10 | 판매관리 push |
| P0-11 | 허브 중간 — 나의 거래·나의 관심 |
| P0-12 | 약관 및 정책 목록 |

## Gaps (optional later)
- Motion mid-frames (HID 없음 → push 연속 샷 미실시)
- 구매내역 / 고객센터 단독 push (판매·약관만 push 증명)

## IA order observed (1-column scroll)
프로필 → 페이/프로모 → 서비스 그리드 → 관심·최근·혜택 → 자주 사용 → **나의 거래** → 나의 관심 → … → 설정 · 고객지원 · 사업자/면책
