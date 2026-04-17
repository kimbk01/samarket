# Community Messenger Real-Usage Checklist

목표: "로그상 안정"이 아니라 "실제로 오래 써도 안 느려짐"을 확인한다.

## Quick Start

1. `Network` 탭에서 아래 4개만 필터로 본다.
   - `incoming?directOnly=1`
   - `auth/session`
   - `store-owner-hub-badge`
   - `community-messenger/presence`
2. `Home -> Community Messenger -> Room -> Home` 를 5회 왕복한다.
3. 하단 메뉴 `home <-> community-messenger <-> my <-> stores` 를 5회 반복한다.
4. 브라우저를 숨겼다가 다시 띄운다.
5. 아래 셋 중 하나라도 보이면 실패다.
   - 빈 슬롯 / 흰 화면 / 리스트 사라짐
   - 같은 요청이 이동마다 연속 반복
   - 뒤로 갈수록 같은 동작이 느려짐

## 준비

- 브라우저 DevTools `Network` 탭을 연다.
- `Preserve log`를 켠다.
- `Disable cache`는 끈다. 실제 서비스 체감을 본다.
- 가능하면 `Performance monitor`도 함께 연다.
- 앱은 로그인된 상태에서 시작한다.

## 같이 볼 경로

- `GET /api/community-messenger/calls/sessions/incoming?directOnly=1`
- `GET /api/auth/session`
- `GET /api/me/store-owner-hub-badge`
- `POST /api/community-messenger/presence`
- 메신저 방 진입 시 `GET /api/community-messenger/rooms/[roomId]/bootstrap`

## 1분 왕복 체크

시나리오:

1. `Home -> Community Messenger Home -> Room -> Home`를 5회 반복
2. 하단 메뉴 `home <-> community-messenger <-> my`를 5회 반복

확인:

- 클릭 직후 100ms 안에 하단 탭 pressed/active가 보이는지
- 리스트가 사라졌다 다시 생기지 않는지
- `incoming?directOnly=1`가 왕복 중 계속 늘지 않는지
- `auth/session`이 탭 이동마다 새로 찍히지 않는지
- `store-owner-hub-badge`가 매 이동마다 새로 찍히지 않는지

문제 기준:

- 같은 1분 구간에 `auth/session`이 3회 이상 반복되면 점검
- 하단 메뉴 이동만 했는데 `store-owner-hub-badge`가 연속 2회 이상 반복되면 점검
- 리스트 빈 슬롯/빈 카드/흰 화면이 보이면 실패

## 5분 왕복 체크

시나리오:

1. `Home <-> Room` 왕복을 5분간 반복
2. 중간에 `hidden -> visible` 3회 반복
3. 하단 메뉴 이동을 섞어서 반복

확인:

- 메신저 Room 진입 체감이 처음과 같은지
- scroll 위치가 복귀 때 튀지 않는지
- skeleton -> 실데이터 교체 때 깜빡임이 없는지
- Network에서 `incoming`, `auth/session`, `store-owner-hub-badge` 누적 속도가 증가하지 않는지
- Performance monitor에서 CPU / JS heap이 계속 우상향하지 않는지

문제 기준:

- 뒤로 갈수록 Room 진입이 눈에 띄게 느려지면 실패
- hidden -> visible 때 `incoming` 또는 `auth/session`이 연속 burst로 여러 번 찍히면 실패
- JS heap이 복귀 없이 계속 증가하면 실패

## 10분 왕복 체크

시나리오:

1. `Home <-> Room` 왕복
2. `Home <-> Community Messenger <-> My <-> Stores` 반복
3. 중간에 브라우저를 background로 두었다가 다시 복귀

확인:

- 첫 1분 대비 이동 속도 저하가 없는지
- `incoming`이 background 동안 계속 돌지 않는지
- `presence`가 visible 복귀 후 정상적으로만 다시 시작되는지
- `mark_read`가 interval 없이도 정상 작동하는지

문제 기준:

- background 중 `incoming?directOnly=1`가 계속 늘면 실패
- visible 복귀 후 `presence`가 과도하게 burst하면 실패
- unread가 읽혔는데 badge가 오래 남으면 실패

## 빈 화면 / 튐 체크

확인 위치:

- `Community Messenger Home`
- `Community Messenger Room`
- 하단 메뉴 탭 전환

봐야 할 것:

- 빈 섹터/빈 슬롯/흰 화면
- skeleton -> 실데이터 전환 깜빡임
- 리스트 reorder 튐
- scroll 위치 점프
- Room 복귀 후 이전 메시지 위치가 크게 흔들리는지

문제 기준:

- 리스트가 한번 내려갔다가 다시 그려지는 느낌이 나면 실패
- 스크롤이 사용자가 건드리지 않았는데 튀면 실패

## 로그 체크 포인트

개발 로그에서 최소한 아래를 비교한다.

- `GET /api/community-messenger/calls/sessions/incoming?directOnly=1`
- `GET /api/auth/session`
- `GET /api/me/store-owner-hub-badge`
- `POST /api/community-messenger/presence`

좋은 신호:

- idle / background 구간에서 `incoming` 추가 증가 없음
- 일반 탭 이동만으로 `auth/session`이 거의 안 찍힘
- `store-owner-hub-badge`는 이벤트/복귀 시점 위주로만 드물게 찍힘

나쁜 신호:

- focus / visibility / route change만으로 같은 요청이 연속 반복
- 시간이 지날수록 같은 동작 대비 요청 수가 늘어남
- foreground 복귀 때 같은 요청이 burst로 여러 번 겹침
