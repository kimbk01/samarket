# PR-2 N1 구현 기록 — 알림 진입 방 ◁ → 목록 → ◁ (2026-11-18 · PR #447)

> **Owner 승인 설계와 구현 방식이 달라졌다.** 승인 설계(`docs/audit/messenger-chat-fix-design-2026-11-18.md` PR-2 N1 —
> 「표시는 유지, 방 ◁ 가 목록 replace 일 때 바로 앞 항목의 표시를 지움」)는 독립 검토에서 틀린 것으로 확인되어 철회했다.
> 아래 방식(Navigation API 로 웹이 목적지를 직접 이동)으로 구현했다. 병합 전 Owner 확인 대상.
>
> 이 문서는 설계 문서(PR-1 #442 브랜치에만 있음)와 파일이 겹치지 않도록 따로 두었다. #442 병합 뒤 설계 문서 N1 절에 이 문서 링크를 단다.

## 1. 1판 「표시 지우기」가 틀린 이유
- 웹 표시(`lib/push/push-navigation-back.ts` 의 「알림으로 떠난 항목」)와 Chromium 「건너뛰기」 표시는 **다른 것**이다.
  - 웹 표시는 그 항목으로 돌아오면(traverse) 지워지지만, Chromium 건너뛰기는 남는다(11-13 실측: 이후 터치로도 안 풀림).
  - 사용자가 알림 직전 화면에서 터치·입력을 했으면(사용자 활성화) 애초에 건너뛰기가 생기지 않는다.
- 1판은 「앞 항목에 웹 표시가 없으면 건너뛰기도 없다」고 가정했다. 그래서 두 가지가 틀렸다.
  - 콜드 HOME → 알림 → ◁ → 목록 탭 → 알림 → ◁ → ◁ 에서 무반응(HOME 의 건너뛰기가 남음).
  - 활성화가 있으면 표시를 지운 뒤 WebView 기본 뒤로가 이전 방 B·같은 목록으로 감.
- 1판 테스트는 알림 직전 항목을 늘 건너뛰기로 두어 이 결함을 가렸다.

## 2. 새 방식과 근거
- Chromium 건너뛰기를 추측하지 않는다. `navigation.entries()`(url·key·index)로 웹이 목적지를 정해 `navigation.traverseTo(key)` 로 이동한다.
- 근거: 웹이 부르는 이동(`history.back()`)은 건너뛰기 영향이 없다(`docs/design/push-entry-back-fix-design-2026-11-13.md` §1 실측). traverseTo 는 같은 「웹 호출 이동」으로 보고 썼다 — **소스 경로 미확인·실기 미측정(NOT_PROVEN)**.
- 구현 `lib/community-messenger/room/messenger-list-web-back.ts`:
  - (a) 방 → 목록: 앞쪽에서 같은 목록 주소(경로 + `section`(기본 chats)·`storeId`) 항목 j 를 찾는다. j 와 현재 사이가 메신저 방·알림 항목뿐이면 `traverseTo(j)`, 아니면 `router.replace`.
  - (b) 도착한 목록 항목에 「웹 뒤로 담당」 기록을 남긴다(sessionStorage `dibay:cm-list-web-back`, 상한 50, key·목록 구분·도착 방식).
    - 그 목록이 현재 항목인 동안 `overlay-back-stack` 페이지 뒤로 주인으로 등록한다.
    - 처리 순서가 오버레이 → 페이지 주인 → 결함 E 라서 결함 E 의 `history.back()` 보다 먼저 처리된다.
  - (c) Navigation API·traverseTo 가 없으면 지금 동작(replace).
- 바꾸지 않은 것: `PushRouteListener`·통화 라우트·결함 E 표시와 overlay-back-stack.

## 3. 독립 검토(재구현판 6be975362) 결함 처리
| 결함 | 처리 |
|---|---|
| D1 reload 뒤 담당 소실 | `restoreMessengerListWebBackAfterReload()` 추가. 새 전역 컴포넌트 `components/community-messenger/MessengerListWebBackRestore.tsx`(그리지 않음, 마운트 1회)를 `MainAppProviderTree` 의 `FriendQrAppLinkListener` 옆에 둠. 통화 표면을 감싸지 않음(자식 없는 형제 요소). PushRouteListener 무수정. |
| D2 앱 안에서 들른 방까지 건너뜀 | traverse 로 온 목록: 목적지 = 바로 앞 항목 중 같은 목록이 아닌 첫 항목(방도 건너뛰지 않음). replace 로 온 목록: 알림 진입 직전의 방(알림으로 떠난 방·알림으로 열린 방)만 건너뜀. |
| D3 traverseTo 실패 시 무반응 | 방 쪽: 동기 예외·committed reject 이면(아직 방에 있을 때만) `router.replace`. 목록 쪽: `history.go(차이)`. |
| D5 iOS | iOS 앱(`resolveCapacitorShellPlatform() === "ios"` 또는 `hasLikelyIosCapacitorShell()`)은 새 이동·담당을 쓰지 않고 지금처럼 replace(N2 「iPhone 측정 먼저」, Owner 결정 3). |

traverse 로 온 목록에도 주인을 두는 이유: 바로 앞 항목이 Chromium 건너뛰기인지 웹이 알 수 없다. 건너뛰기면 WebView 기본 뒤로가 무반응이거나 더 앞 화면으로 간다(경로 5). 웹이 목적지를 정해야 결과가 기기 상태와 무관하다. 바로 앞 항목에 결함 E 표시가 있으면 결함 E 의 목적지와 같다.

## 4. 남은 NOT_PROVEN·위험
- traverseTo 와 Chromium 건너뛰기의 관계(소스 경로 미확인) — Android WebView 실기 측정 필요. iOS 는 이번 변경 대상 아님(N2 측정 대기).
- Next 라우터가 traverse(popstate) 뒤 화면을 제대로 복원하는지 실기 미확인.
- `cm_return` 에 쿼리로 목록을 가르는 주소(`section`·`storeId` 밖의 쿼리)가 실리면 다른 목록을 같은 목록으로 판정할 수 있다.
- 페이지 뒤로 주인은 슬롯 1개다. 다른 화면이 목록 위에서 같은 슬롯을 썼다가 해제하면, 목록을 떠났다 돌아올 때까지 목록 담당이 빠질 수 있다.
