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
