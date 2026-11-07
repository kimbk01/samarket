# PC·태블릿 분할 메신저 — 방 진입 깜빡임 원인·설계 (2026-11-07)

Owner 지시: 「정확한 원인 조사」→「P1·P2 구현」(2026-11-07).

## 1. 재현 (운영 `3c3d40498`, Windows 노트북 크롬 1771px 분할, 로그인, 4ms 간격 기록)

| 시각(클릭=0) | 오른쪽 칸 |
|---|---|
| 0ms | 연두 점무늬 빈 배경(방 선택 전) |
| 87ms | 흰 빈 칸 (`rgb(255,252,252)`, 내용 없음) |
| 523ms | 「채팅방 입장 중…」 칸 전체 대기 화면 (상단바 없음) |
| 613ms | 실제 방 |

판정: 깜빡임 재현 (FAIL). 첫 진입(cold)은 흰 빈 칸 약 1초.

## 2. 원인

1. `app/(main)/community-messenger/rooms/[roomId]/loading.tsx` 가 측정 probe 만 그림 → 분할 오른쪽 칸(`MessengerResponsiveShell` 방 슬롯, 투명)이 흰 바탕 노출.
2. 방 데이터 대기 중 `CommunityMessengerRoomEntryEmpty` 가 칸 전체(상단바 없음)를 덮었다가 실제 방으로 교체.
3. 분할은 진입 애니메이션을 건너뜀(`MessengerRoomSwipeBackShell` `splitPaneMode` — 늦어도 2026-09-24부터) → 교체가 그대로 보임.

계약 충돌(보고만, 이번 범위 아님): `messenger-list-room-slide.ts`·`messenger-view-transitions.css`(2026-07-30)는 「분할은 칸 안 좌→우 진입」이라 적었으나 코드는 진입 애니메이션 없음 → 해당 CSS 미사용.

## 3. 설계·구현 (분할 768px+ 에만)

- `MessengerSplitRoomEntryFrame` — 실제 방과 같은 틀: `[data-cm-room].cm-room-shell`(대화 배경) + `MessengerHeader`(분할 상단바와 같은 클래스·버튼 치수, 계약 테스트로 일치 고정).
  - 일반 1:1(`general_direct`) — 목록에서 누를 때 저장된 진입 의도(`markRoomEntryIntent` seed)의 이름·사진. 거래·배달·그룹은 실제 상단바 모양이 달라 빈 상단바.
- P1 — `loading.tsx` 에 `MessengerRoomSplitLoadingFrame`(분할일 때만 틀, 휴대폰 null).
- P2 — `CommunityMessengerRoomEntryEmpty` 분할 분기: 같은 틀 안 대화 영역에만 대기·실패(다시 불러오기) 표시. 대기 표시는 0.24초 뒤 나타남(빠른 진입에서 번쩍임 방지).
- 휴대폰 경로(목록 복사본·우→좌 진입·대기 화면) 무변경.

## 4. 검증

- 코드: 계약 테스트 6 + 관련 메신저 테스트 60, `typecheck:build`, eslint — PASS.
- 로컬 실측: 개발 서버가 방 진입마다 컴파일·전체 새로고침해 시간 측정 불가 — NOT_PROVEN.
- 운영 실측(노트북 크롬, 같은 4ms 기록): 반영 후 수행.

## 5. 운영 실측 1차 (`df7780be3`, 노트북 크롬 1771px, 23:3x PHT)

| 경우 | 오른쪽 칸 | 판정 |
|---|---|---|
| 처음 여는 방 zxzx11 | 연두 → 0.14초 틀(빈 상단바) → 0.85초 방 | 흰 칸·대기 화면 없음 PASS · 이름 없음 FAIL |
| 처음 여는 방 Shawn Park | 연두 → 0.05초 틀 → 0.61초 방 | 같음 |
| 이미 연 방 | 연두 → 0.22초 방 | PASS |
| 방 → 다른 방 | 방 → 0.04초 틀(빈 상단바) → 0.61초 방 | 이름 약 0.6초 사라짐 FAIL |

대기 표시는 한 번도 보이지 않음(투명도 0). 상단바 높이 틀·방 모두 48px.

## 6. F1 — 이름·사진 누락 정정 (Owner 「F1 반영」)

원인(작업자 결함): 목록 요약에 `chatDomain` 이 없어 진입 의도 seed 에 `expectedDomain` 이 없음(운영 sessionStorage 실측) → `general_direct` 조건에서 전부 탈락.
수정: `runCommunityMessengerRoomForwardNavigation` 이 목록 출처 inbox + `roomType` direct 이면 seed 에 `splitFrameHeader: "direct"` 저장(`isMessengerSplitFrameDirectHeaderRoom`). 틀은 이 표시(또는 `general_direct`)일 때만 이름·사진. 도메인이 다르게 오면 빈 상단바.
남는 차이: 실제 상단바의 이름 아래 작은 줄(「1:1 대화 · …」)은 틀에 없음 — 방이 열릴 때 이름이 몇 px 위로 이동할 수 있음.
