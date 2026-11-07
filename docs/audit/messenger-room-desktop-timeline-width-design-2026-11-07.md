# 메신저 대화방 PC 말풍선 영역 폭 — 원인·설계서 (2026-11-07 PHT)

> 상태: **설계만. 구현 0건.** Owner 승인 후 구현한다.
> Owner 지시 원문: 「정확한 원인과 확인후 설계안을 보고 해라.」
> 확인 조건:
> - 운영 main `2bee0d63b` (배포 반영 확인됨)
> - Owner Mac 크롬, 로그인 상태(`/api/me/profile` 200), 창 1740×964, `DESKTOP_SIDE_RAIL`
> - 김선희 1:1 방(안 읽은 메시지 없음)을 열어 **보기만** 했다. 전송·설정 변경 0건
> - 측정 방법: 브라우저 계산 스타일(getComputedStyle)·요소 위치 직접 측정

## 0. 앞 보고 정정
- 앞 보고: 「입력창 약 1000px (607~1607)」 → **틀렸다.**
  - 1000px 은 글자 칸(`textarea`)의 폭이다.
  - 입력줄 전체(`footer.chat-composer`)는 **대화방 칸 전체 542~1740 (좌우 여백 12px)** 이다.
  - 입력 상자는 596~1686 이다.
- 따라서 어긋남은 입력창이 아니라 **말풍선 영역 한쪽**에서 생긴다.

## 1. 정확한 원인 (직접 측정)
| 요소 | 위치·폭 | 폭을 정하는 곳 |
|---|---|---|
| 대화방 칸 (`.cm-room-shell`) | 542~1740 (1198) | 셸 M1 (창 전체) |
| 스크롤 영역 (`.chat-timeline-scroll`) | 542~1740 (1198) | 칸 전체 |
| **말풍선 시트 (`.chat-timeline-sheet`)** | **754~1514 (760), 좌우 여백 211.5px 씩** | **`max-w-[760px] mx-auto`** — `components/community-messenger/room/phase2/CommunityMessengerRoomPhase2MessageTimeline.tsx:1856` |
| 말풍선 줄 (`.chat-timeline-chrome`) | 754~1514, 안쪽 여백 16px | 시트 안 |
| 말풍선 한 개 최대 | 520px | `max-w-[min(76vw,520px)]` (말풍선 행) |
| 사진 카드 최대 | 360px | `max-w-[min(62vw,280px)] sm:max-w-[min(62vw,320px)]` 등 |
| 입력줄 (`footer.chat-composer`) | 542~1740 | 칸 전체, 여백 12px |

- **원인 한 줄:** 말풍선 시트에 **고정 최대 폭 760px + 가운데 정렬**이 걸려 있다. 칸이 1198px 로 넓어지자 말풍선만 가운데 760 열에 남았다. 입력줄과 상단바는 칸 전체라 폭이 서로 어긋난다.
- **도입 시점:** `6b79dc1bb` (2026-06-18, 「viewport shell·nearBottom chip·타임라인 SSOT」). 휴대폰·태블릿에서는 칸이 760 보다 좁아 이 제한이 보이지 않았다.
- 이 760 은 키보드·스크롤 잠금 계약(`docs/community-messenger-mobile-room-viewport.md` §0) 항목이 **아니다**. §0 은 높이·키보드·composer 위치만 다룬다. `app/chat-viewport-shell.css` 의 `.chat-timeline-sheet` 도 높이·flex 만 정한다.

## 2. 목표 (카톡 PC형)
- PC(세로 레일 셸)에서 말풍선 시트가 대화방 칸 전체를 쓴다.
  - 내 말풍선은 칸 오른쪽 끝(여백 16px)에 붙는다.
  - 상대 말풍선은 칸 왼쪽 끝에 붙는다.
  - 입력줄·상단바와 같은 양끝 선이 된다.
- 말풍선 한 개 최대 520px·사진 카드 최대 폭은 **유지**한다. 긴 글이 칸 전체로 늘어나 읽기 어려워지지 않는다(카톡 PC 와 같은 방식).

## 3. 결정
| # | 결정 | 근거 |
|---|---|---|
| T1 | PC 세로 레일 셸에서만 `.chat-timeline-sheet` 의 최대 폭을 푼다: `.app-shell[data-dibay-nav-presentation="DESKTOP_SIDE_RAIL"] [data-cm-room] .chat-timeline-sheet { max-width: none; }` | DESKTOP 계열 한정. 휴대폰·태블릿·APK·iOS 는 760 그대로 |
| T2 | 컴포넌트(TSX) 클래스는 바꾸지 않는다. CSS 한 블록만 `app/app-desktop-side-nav.css` 에 둔다 (데스크톱 셸 규칙 한 곳) | 방 컴포넌트·키보드 계약 파일을 건드리지 않음 |
| T3 | 말풍선 한 개 520px·사진 카드·날짜 칩(22rem) 최대 폭은 유지 | 읽기 폭 |
| T4 | 방 뷰포트 문서 §7 변경 이력에 1행 기록하고, `npm run verify:cm-room-keyboard-layout-contract` 를 돌린다 | `.cursor/rules/community-messenger-room-viewport-continuity.mdc` (타임라인 파일이 glob 대상) |

## 4. 바뀌는 파일
| 파일 | 변경 |
|---|---|
| `app/app-desktop-side-nav.css` | T1 블록 1개 |
| `lib/layout/__tests__/desktop-side-rail-contract.test.ts` | T1 이 DESKTOP 셸 선택자로만 걸리는지, 760 원본 클래스 유지 단언 |
| `docs/community-messenger-mobile-room-viewport.md` | §7 1행 |

## 5. 영향 화면
| 화면 | 바뀌는 것 | 위험 / 처리 |
|---|---|---|
| PC 메신저 1:1·그룹 방 | 말풍선이 칸 양끝으로 | 시스템 안내·날짜 칩은 가운데 그대로(자체 최대 폭). 「맨 아래로」 칩 위치 → 측정 항목 |
| PC 통화 기록 말풍선(영상 통화·취소 등) | 같은 시트라 양끝으로 | 측정 |
| 거래 채팅·주문 채팅 방 | **대상 아님** — 다른 방 구현(`lib/chats`·`lib/order-chat`). PC 에서 같은 문제가 있는지는 **NOT_PROVEN** (이번에 열어 보지 않음) | 범위 밖, 보고만 |
| 휴대폰·태블릿·APK·iOS 방 | 무변화 | 선택자가 DESKTOP 셸 전용. 키보드·스크롤 계약 파일 무변경 |

## 6. 검증
- 코드:
  - `typecheck:build`
  - `typecheck:test`
  - `verify:cm-room-keyboard-layout-contract`
  - 변경 파일을 참조하는 테스트 전체
- 화면 (Owner 크롬, 로그인, 같은 방, 보기만):
  - 말풍선 시트 = 칸 폭(542~1740)
  - 내 말풍선 오른쪽 끝 ≈ 1724
  - 말풍선 최대 520 유지
  - 입력줄과 양끝 일치
- NOT_PROVEN 으로 남을 것: Windows 실기, 휴대폰 실기 무변화, 거래·주문 채팅 방.

## 7. 롤백
- CSS 블록 1개를 지우면 즉시 원래대로 돌아간다.
