# 03 — Navigation · CTA · Motion

Architecture LOCK #3 · #4 · #5.

## Navigation Authority

구조: Main → Section → Sub → Detail

| Transition | Allowed | Forbidden | Notes |
|------------|---------|-----------|-------|
| push | list→detail, settings→account | destructive confirm | 당근 실측 기본 |
| modal | logout / nickname / alert confirms | primary browsing | |
| sheet | profile edit (유지 여부 LOCK) | | |
| alert | OS/version | duplicate of modal flows | |
| replace | auth boundary, leave done | in-section browse | |
| browser back | web/PWA | must = gesture back | |
| gesture back | native | must = browser back | |

부속: 스크롤 복원 · 더블탭 root→top (iOS 당근 PROVEN).

<a id="cta-authority"></a>

## CTA Authority

| Kind | 용도 | 예 |
|------|------|-----|
| Primary | 주 진행 | 프로필 저장 |
| Secondary | 대안 | 모달 취소 |
| Danger | 파괴·비가역 | 로그아웃 · 탈퇴 · Admin 정지/삭제 |
| Inline | 본문/리스트 보조 | 공지 보기 · 변경 |
| Icon | 헤더/툴바 | gear · bell · share |
| Context | 행/카드 메뉴 | ⋯ · chevron row |

신규 CTA 종류 금지 (LOCK 개정 필요).

<a id="motion-contract"></a>

## Motion Contract

| Motion | Duration/easing | 적용 |
|--------|-----------------|------|
| push | **300ms** (ease platform) | section→detail |
| back | **300ms** (inverse of push) | gesture/browser |
| modal | **200ms** fade+scale | confirm (logout 등) |
| sheet | **280ms** bottom present | profile edit |
| toast | **220ms** | feedback |
| loading | blocking spinner only (no fixed ms) | blocking wait |
| skeleton | first paint preferred (no fixed ms) | mypage/admin |

코드 SSOT: `lib/mypage/mypage-authority-contract.ts` → `MYPAGE_MOTION_MS`.  
중간 프레임 실측 WAIVED여도 **수치 계약**은 LOCK.
