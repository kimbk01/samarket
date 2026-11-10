# 채팅 P0 — 구조 안정화 감사·설계서 (2026-11-11 · 설계 승인 전 구현 없음)

- 지시: Owner 「채팅 P0 — 구현 전 구조 감사」(2026-11-10). C~G 계획 종료 후 착수하는 별도 작업.
- 실측 조건: 스테이징(`7755710`·`24deb05`), Samsung M15(폭 384)·Xiaomi 태블릿, 각 기기 로그인 계정. WebView DevTools — 프레임 간격·긴 작업·CPU 프로파일·네트워크(전체 주소)·`Intl.DateTimeFormat` 생성 계측(측정 후 복구).
- 코드 추적: 저장소 `origin/main` 읽기(하위 조사 + 직접 확인). 표기: **실측** · **코드** · **추정** · **NOT_PROVEN**.

## 1. M1~M6 실제 근본 원인

| # | 증상 | 근본 원인 | 근거 |
|---|---|---|---|
| M1 | 방 진입 1.5~1.9초 멈춤, 메시지 많을수록 더 멈춤 | ① 진입 중 상태가 여러 번 바뀌며 **타임라인 전체가 약 28번 다시 그려짐** ② 행 `memo` 가 사실상 무효 — 렌더마다 새 `measureElement` 화살표 함수를 넘김 ③ `mergeRoomMessages` 가 내용이 같아도 새 객체·새 배열을 돌려줘 모든 행이 바뀐 것으로 판정 ④ 시각 표시가 호출마다 `new Intl.DateTimeFormat` ⑤ 2,500줄 미만은 가상 스크롤 없이 불러온 메시지 전부를 그림 | 실측: 40줄 진입 1,283~1,986회 생성·렌더 묶음 7개(최대 1,320회/0.6초) · 340→490줄 이전 메시지 1페이지 로드마다 5,850→7,392회·멈춤 1.9→2.3초(최장 0.72→0.93초) · 코드: `messenger-clock-time.ts:10`, `CommunityMessengerRoomPhase2MessageTimeline.tsx:2073·2104-2113`, `MessengerTimelineVirtualRow.tsx:141-185·561-569·711·728`, `community-messenger-room-helpers.tsx:173-235`, `messenger-room-timeline-paint-model.ts:21`(2,501 미만 direct) |
| M2 | 진입 직후 요청 7~20건 몰림 | ① 진입 따라잡기 2건 동시(`messages?after=…&limit=80` + `messages?latest=1&limit=40`) ② **같은 `cmReqSrc=room_silent` bootstrap 2회**(882ms·1,636ms) ③ 진입 즉시 채팅 목록 주소 3개 미리 받기(`CommunityMessengerRoomClientInner.tsx:107-118`) ④ 친구 관계 조회(`peer-relation`) 진입 즉시 | 실측 전체 주소(메인관리자 방): RSC → peer-relation·messages×2·bootstrap(room_silent) 동시 → bootstrap(room_silent) 재요청 → presence · 코드: `use-messenger-room-client-phase1.ts:1120-1130·1368-1420`, `use-messenger-room-friendship-sync.ts:81-123` |
| M3 | 대화·친구·통화 탭 전환 시 2번 끊김 | 탭 상태를 바꾼 뒤 `router.replace(?section=…)` → Next 서버 요청(160~300ms) → 페이지 다시 렌더 → `CommunityMessengerHome` memo 비교에서 `initialSection` 변경으로 홈 전체 다시 렌더 | 실측: 누름 후 ~100ms 1차 멈춤 + 0.2~0.33초 뒤 50~124ms 2차 멈춤 · 코드: `use-community-messenger-home-navigation.ts:114-122·64-96`, `CommunityMessengerHome.tsx:365·412-414`, URL→탭 맞춤 `use-community-messenger-home-shell-effects.tsx:185-261`(D-10) |
| M4 | 통화 탭 들어갈 때마다 0.6~1.2초 | 탭 패널이 조건부 마운트 → 방문마다 `/api/community-messenger/calls` 재조회(캐시 없음) + `missed-call-read` POST(부재중 0건이어도) | 실측 616~1,206ms · 코드: `MessengerHomeMainSections.tsx:391-406`, `MessengerCallLogsPanel.tsx:190-199`, `NotificationRouteReadSync.tsx:62-75` |
| M5 | 태블릿 방 진입 시 주소 2번 변경 | 분할 화면에서 방 경로에 기본 탭(`?section=chats`)을 다시 써 넣는 `guardedRouterReplace` | 실측(태블릿) · 코드: `use-community-messenger-home-shell-effects.tsx:124-131·251-260` |
| M6 | 진입 직후 첫 스크롤 끊김 | M1·M2 작업이 진입 후 약 2.5초 이어짐(모든 행 다시 그림) | 실측: 진입 직후 스크롤 긴 작업 0.76초, 이후 스크롤 0건 |
| (G 이관) | 모든 탭 이동마다 `/api/community-messenger/friend-requests` 2회 | 메신저 전역 요청 — 호출처 NOT_PROVEN | 실측 32/32 |

## 2. 해결책 — 최소이면서 구조적으로 완결

| 단계 | 대상 | 해결 | 파일 범위 |
|---|---|---|---|
| P0-1 | M1·M6 | ⓐ 진입 상태 갱신을 한 커밋으로 묶음(bootstrap 적용·따라잡기 병합·친구 관계·읽음 패치) ⓑ `mergeRoomMessages` 가 바뀌지 않은 행은 기존 참조 유지·변화 없으면 이전 배열 반환 ⓒ 행에 넘기는 콜백·라벨을 안정 참조로(`measureElement` 는 virtualizer 의 고정 함수 + `data-index`) ⓓ 시각·날짜 라벨은 모듈 단위 포맷터 인스턴스 + 메시지당 1회 파생 목록에서 계산(포맷터만 바꾸는 단독 수정 아님) | `messenger-clock-time.ts`, `community-messenger-room-helpers.tsx`, `CommunityMessengerRoomPhase2MessageTimeline.tsx`, `MessengerTimelineVirtualRow.tsx`, `use-messenger-room-client-phase1.ts`, `use-messenger-room-remote-catchup.ts`, `CommunityMessengerRoomClientPhase2Body.tsx` |
| P0-2 | M2 | ⓐ 진입 따라잡기 1건(latest 유지 — D-13 전체삭제 반영) + latest 창 밖일 때만 after ⓑ 방금 끝난 bootstrap 이 있으면 room_silent 재요청 생략(1:1 상대 읽음은 1회 유지 — D-12 ③) ⓒ 목록 RSC 미리 받기·peer-relation 은 진입 안정(첫 그림 + idle) 뒤 | `use-messenger-room-client-phase1.ts`, `messenger-room-bootstrap-refresh.ts`, `CommunityMessengerRoomClientInner.tsx`, `use-messenger-room-friendship-sync.ts` |
| P0-3 | M3·M5 | 탭·기본 탭 주소는 Next `window.history.replaceState` 연동으로(서버 요청 없음, `useSearchParams` 동기) · `initialSection` 은 마운트 후 무시(memo 비교 제외) · URL→탭 맞춤 effect(D-10) 를 같은 단계에서 맞춤 | `use-community-messenger-home-navigation.ts`, `use-community-messenger-home-shell-effects.tsx`, `CommunityMessengerHome.tsx` |
| P0-4 | M4 | 통화 목록을 viewer 단위 모듈 저장소로 — 홈 실시간 call_logs 신호로만 무효화 · missed-call-read 는 부재중 미읽음 > 0 일 때만 | `MessengerCallLogsPanel.tsx`, `use-community-call-history-realtime-sync.ts`, `NotificationRouteReadSync.tsx` — **통화 규정 적용**(통화 기록·알림 읽음 경로) |
| P0-5 | M1 확장성 | 불러온 메시지가 많을 때 가상 스크롤 기준(현재 2,501) 재설계 | `messenger-room-timeline-paint-model.ts` + 뷰포트 계약 문서 — **`community-messenger-mobile-room-viewport.md` 계약 변경 = 별도 승인** |

## 3. 통화·Realtime·인증·알림 영향
- **Realtime**: bump 스냅샷 병합 우선·HTTP 증분 보조(`messenger-realtime-policy.md`)는 그대로. P0-1 ⓑ 는 병합 결과(순서·중복 제거)를 바꾸지 않고 참조만 유지 — 순서·중복 시험 필수.
- **읽음**: P0-2 ⓑ 에서 room_silent 를 생략할 때 1:1 상대 읽음 반영(D-12 ③)이 빠지지 않게 1회는 유지.
- **통화**: P0-4 만 통화 목록·부재중 읽음에 닿음 → AGENTS 통화 규정(영향 분석·단독 커밋·실기 행렬) 적용. P0-1~3·5 는 통화 코드 무변경.
- **인증**: 변경 없음. **알림·배지**: P0-4 missed-call-read 조건 변경 → 배지 숫자 시험.

## 4. 성능 성공 기준 (같은 기기·계정·SHA, n≥5)
- 방 진입(40줄): 타임라인 전체 렌더 ≤3회 · `Intl.DateTimeFormat` 생성 ≤10회 · 긴 작업 합계 휴대폰 ≤300ms · 진입 요청 ≤4건(첫 그림 전).
- 이전 메시지 1페이지 로드(400줄 상태): 긴 작업 최장 ≤100ms.
- 대화·친구·통화 탭 전환: 서버 요청 0건 · 멈춤 1회 ≤100ms.
- 통화 탭 재방문(캐시 유효): 요청 0건. 태블릿 방 진입: 주소 변경 1회.

## 5. 기능 회귀 검증 기준 (Owner 보호 계약)
메시지 누락·중복·순서 · 전송·수신·읽음 · Realtime 연결·재연결 · 방 이동·복귀 · 백그라운드 복귀 · 통화 수신·발신·연결·종료(Android↔iPhone 음성·영상, 거절·취소·busy·타임아웃·재발신) · 통화 중 채팅 이동 · 알림·배지·푸시 · 계정 A→B 전환 데이터 혼입 · Android·iOS·태블릿·PC. 측정 안 한 항목은 NOT_PROVEN.

## 6. 확장성 검증 계획 (운영 부하 시험 없음)
- 방 크기별: 5 · 40 · 400 · 1,000 · 2,000줄(이전 메시지 반복 로드) — 진입·로드·스크롤 긴 작업·DOM 수·메모리.
- 연속 수신: 시험 계정 2개(두 기기) 간 1분 30건 — 렌더 횟수·멈춤 (시험 메시지 = 운영 DB 데이터 → 실행 전 Owner 승인).
- 장시간: 방 30분 유지 — 메모리·리스너·긴 작업 추이.
- 100명·1,000명 동시 사용(서버·DB·Realtime 용량): **NOT_PROVEN** — 별도 근거 필요.

## 7. 미확인 위험·후속 백로그
- 진입 중 28회 렌더의 원인별 분해(어느 상태 변경이 몇 회) — P0-1 착수 시 React 프로파일러로 확정.
- `friend-requests` 탭 이동마다 2회 호출처 · `/api/me/settings`·`app-language` 방 진입 시 재요청 트리거.
- 수신 배너·연속 수신 상황 실측 없음(NOT_PROVEN).

## 8. P0-5 설계·구현 (Owner 「P0-5 승인」 2026-11-11)
- **실측 근거**(삼성 M15, 스테이징 `aa08ce5`, 메인관리자 방, 이전 메시지 1페이지당): JS 실행 136→212ms(거의 일정) · 레이아웃 7~9ms · **스타일 계산 64→176ms·그 밖(그리기 등) 약 300→480ms 가 줄 수(40→540)에 비례 증가**. 늘어나는 비용 = 화면 밖 행까지 매번 스타일 계산·그리기.
- **가상 스크롤 기준(2,501) 은 그대로 둔다**: 2026-06-20 `65406ec`(추정 높이 위치로 그려 말풍선 사이 빈칸) 이후 direct 가 기본. 기준을 낮추면 빈칸·진입 위치 튐·이전 메시지 로드 위치 보정 위험이 다시 열린다.
- **해결**: direct 행이 한 번 실제 크기로 그려진 뒤(2프레임 뒤) `data-cm-cv` 를 붙이고 CSS `content-visibility:auto` + `contain-intrinsic-block-size: auto 64px` — 화면 밖 행은 브라우저가 **기억한 실제 높이**로 자리를 유지한 채 스타일·그리기를 건너뛴다. 타임라인은 `overflow-anchor: none`(수동 위치 보정)이라 추정 높이로 건너뛰면 위로 스크롤 시 튐 → 「한 번 그린 뒤에만」이 필수.
- **영향 화면·호출처**: `MessengerTimelineVirtualRow`(direct 행만) · `app/samarket-components.css`. 진입 위치 결정·이전 메시지 로드 위치 보정·검색 이동(scrollIntoView)·D4 돌아옴 위치는 행 높이를 그대로 읽는다(기억한 실제 크기). 길게 누름 강조·검색 강조 행은 끔(`data-cm-cv-off`, paint containment 가 그림자·외곽선을 자르지 않게).
- **남는 한계**: 진입 첫 레이아웃(40줄 전부 처음 그림)은 줄지 않는다. 행 수만큼 DOM 노드는 그대로(메모리). iOS 18 미만 WebView 는 속성을 무시(동작 동일, 효과 없음).
- **회귀 확인**: 위로 스크롤 시 위치 튐 · 이전 메시지 로드 후 위치 유지 · 진입 맨 아래/첫 안 읽음 · 검색 결과 이동 · 길게 누름 메뉴 그림자 · 이미지 말풍선.
