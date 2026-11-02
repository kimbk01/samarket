# 내정보 「앱 설정」 헤더 진입 · 「고객지원」 분류 카드 설계안 (승인 요청, v2)

2026-11-03 PHT · 감사·설계만 · 코드·DB·네이티브·배포 변경 없음 · 실기 조작 없음

## 0. Owner 지시 원문
> 내정보의 설정 지원 부분은 헤더의 종옆으로 옮기고 관리 되도록 원하는 부분이다
> (정정) 앱설정만 옮기고 고객센터는 분류 카드에 고객지원으로 남기면 되잖아

- v1 오류(작업자): 「설정·지원」 전체를 톱니로 옮기고 고객센터 새 글 배지까지 톱니에 붙이는 안이었음 → 폐기.

## 1. 현재 (코드 근거)
| 항목 | 현재 | 근거 |
|---|---|---|
| 내정보 홈 헤더 오른쪽 | 알림 종 1개 | `components/my/MyPageHeader.tsx:40` → `components/my/MyMypageHeaderActions.tsx` |
| 「설정·지원」 분류 카드 | 6번째 카드, 고객센터 새 글 수 배지 | `components/mypage/myinfo/MyInfoHomeCategoryHub.tsx:111-114` |
| 「설정·지원」 화면 `/mypage/section/settings` | ① 앱 설정: 알림 · 채팅 설정 · 언어 · 캐시 삭제 · 버전 정보 ② 고객지원·약관: 고객센터 · 이용약관 · 개인정보처리방침 · 사업자 정보 ③ 로그아웃 · 탈퇴하기 · 관리자 접속 | `lib/mypage/mypage-ia.ts` settings groups |

## 2. 설계
### 2.1 헤더 톱니 = 「앱 설정」 (홈 L0 만)
- 오른쪽 아이콘 = **[⚙ 앱 설정] [🔔 알림]** — 종은 다른 탭과 같은 오른쪽 끝 자리 유지, 톱니는 종 왼쪽. 배지 없음.
- 톱니 → `/mypage/section/settings` · 화면 제목 **「앱 설정」** · 뒤로 = 내정보 홈.
- 「앱 설정」 화면 내용:
  - 앱 설정: 알림 · 채팅 설정 · 언어 · 캐시 삭제 · 버전 정보
  - 계정 나가기: 로그아웃 · 탈퇴하기 · 관리자 접속(관리자만)
- 접근성 이름 「앱 설정」, 터치 칸 44×44(`SAM_TIER1_HEADER_ACTION_BTN_CLASS`). 하위 화면에는 톱니·종 없음(기존 규칙). 비로그인은 톱니 없음(로그인 화면 아래 공개 목록이 언어·버전 포함).

### 2.2 분류 카드 「고객지원」 (6개 유지)
- 6번째 카드 「설정·지원」 → **「고객지원」** · 고객센터 새 글 수 배지·문구는 그대로 이 카드에 남김.
- 「고객지원」 화면 `/mypage/section/support` (L1, 하단 탭 보임, 뒤로 = 홈): 고객센터 · 이용약관 · 개인정보처리방침 · 사업자 정보.
- 하위 화면 뒤로 목적지: 고객센터·이용약관 → 고객지원 / 알림·채팅 설정·언어·캐시·버전 → 앱 설정 (`mypage-ia.ts` 의 행 소속만 바꾸면 기존 「제목 = 행 이름, 뒤로 = 소속 분류」 규칙이 그대로 적용).
- 주소는 그대로: 약관 `/mypage/section/settings/terms` 등 기존 주소 유지(북마크·알림 링크 보호), 소속 분류만 고객지원.
- 비로그인 공개 경로(약관·버전·언어·고객센터) 변경 없음.

### 2.3 바뀌는 파일·영향
| 파일 | 변경 | 영향 확인 |
|---|---|---|
| `lib/mypage/mypage-ia.ts` | settings 분류 = 앱 설정(카드에서 제외, 헤더 진입) · 새 분류 `support` = 고객지원(카드) | 제목·뒤로 표, 하단 탭 규칙(`isMypageTopLevelPath` 에 support 포함) |
| `components/my/MyMypageHeaderActions.tsx` | 톱니 링크 추가 | 내정보 홈 헤더만 사용 |
| `components/mypage/myinfo/MyInfoHomeCategoryHub.tsx` | 6번째 카드 = 고객지원(배지 그대로) | 홈 레이아웃 무변경(6개 2×3) |
| `components/account/AccountDeletionRequestForm.tsx` | 탈퇴 [취소] 목적지 = 앱 설정(현재와 같은 주소) | 변경 없음 확인만 |
| i18n | 「앱 설정」 「고객지원」 분류 제목·설명 | 한·영 |
| 테스트 | `mypage-home-menu-order.test.ts`(분류 목록·스냅샷), `mypage-ia.test.ts`(제목·뒤로), `mypage-tier1-title-coverage.test.ts` | 같은 단계에서 개정 |
- 스크롤: 홈 → 톱니 → 앱 설정 → 뒤로 = 홈의 떠난 위치(스크롤 SSOT 설계 P1).
- 웹만 가능(네이티브 무관). 앱 재시작으로 반영.

## 3. 레거시·기준
- 카카오톡 「더보기」 탭 오른쪽 위 톱니 = 설정 (2026-11-03 iPhone 미러링 화면에서 확인, 진입 동작은 미측정).
- Apple HIG 탭바: 같은 탭 안 이동은 탭 상태 유지 — 톱니 진입 후 뒤로 시 홈 위치 복원 (https://developer.apple.com/design/human-interface-guidelines/tab-bars).

## 4. 검증 계획 (승인 후)
- 코드: typecheck(build·test) · 관련 vitest · eslint · 내정보 검증 3종 · `verify:routes`.
- Production 웹: 홈 헤더 톱니·접근성 이름, 카드 6개(고객지원 배지), 앱 설정·고객지원 화면 제목·뒤로, 하위 화면 뒤로 목적지, 360·393·768·1024 넘침 0.
- 실기: Owner 승인 후에만.
