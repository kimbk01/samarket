# D6 — 메시지 받을 때 기기마다 HTTP 재조회 · 구조 분석 (2026-11-19)

- 상위: `structural-defects-vs-legacy-2026-11-19.md` §2 D6 · §4 순서 4
- 상태: **분석만 · 구현 없음.** 메신저 hard-lock(`docs/messenger-realtime-policy.md` 「Community 메신저 방 메시지」) 대상 → 설계 승인 후 구현.

## 1. 결론 먼저

| 항목 | 판정 | 증거 |
|---|---|---|
| 결함(구조) | **있음** | 코드: 이미지·파일·음성·통화 기록·수정·삭제·반응 bump 는 받는 기기마다 `messages/{id}` GET (`peer-bump-snapshot-skip-policy.ts` ④·③, 정책 문서 「반응」 행) |
| 지금 운영 영향 | **작음** | Vercel 11-18 00:00~18:00 UTC(08:00~02:00 PHT, 조회 시각까지): `GET rooms/[roomId]/messages/[messageId]` **13건** (같은 18시간 메시지 POST 101건) |
| 회원 증가 시 | 그룹 인원 × (미디어+반응+수정·삭제) 수에 비례 | 산술(§3). 측정 아님 |
| 같은 날 메신저 방 쪽 가장 큰 것 | **방 진입(D4)** | `GET bootstrap` 1,128 · `.rsc` 1,369 · `GET messages` 612 (같은 18시간) |

→ **승인된 순서(D6 다음 D4)와 지금 측정이 다르다.** 지금 줄일 수 있는 양은 D4(방 진입)가 수십~수백 배 크다. 순서 변경은 Owner 결정(허위 보고 금지 7번 — 설계와 측정 충돌 보고).

## 2. 코드 — 지금 받는 쪽 동작

| 받은 bump | 지금 | 근거 |
|---|---|---|
| 상대 새 텍스트·스티커 (스냅샷 검증 성공) | 스냅샷 병합, **GET 없음** | `shouldSkipPeerBumpSingleGet` ①~⑥ |
| 새 이미지·파일·음성·통화 기록 | 스냅샷 병합 후 **GET 1건** | 같은 함수 ④ (서명 URL·메타 보강 가능성) |
| 같은 id 수정·삭제 | **GET 1건** | ③ |
| 반응 추가·교체·해제 | `messageId` 만 → **GET 1건** | 정책 「반응」 행 (`mine` 이 사람마다 달라 스냅샷 없음) |
| 음성 영구 삭제 | `messageAction:"hard_deleted"` → GET 없음 | 정책 「페이로드」 행 |

**이중 수신(병행 구독)**: 같은 방 메시지를 Broadcast bump 와 `postgres_changes`(`community_messenger_messages`, `room_id=eq.`) 둘 다로 받는다.
- 방 화면: `community-messenger-room-message-realtime-channel.ts:94-100`
- 방 묶음: `global-messenger-room-bundle-channel.ts:305-306`
- 홈 목록: `community-messenger-home-realtime-channels.ts:416`
`postgres_changes` 는 REST 요청 수에는 안 잡히지만, 변경 1건마다 **구독자 수만큼 RLS 검사**를 DB 가 한다(Supabase Realtime 동작). 운영 Realtime 부하 실측은 **NOT_PROVEN**.

## 3. 회원 증가 산술 (측정 아님)

- 100명 그룹 방, 사진 1장 → 방을 보고 있는 기기 수만큼 GET (최대 99) + `postgres_changes` RLS 검사 99회.
- 반응 1개 → 똑같이 최대 99 GET.
- 지금 13건/일인 이유(추정 아님, 관측): 그룹 방이 작고 미디어·반응 메시지가 적다(같은 날 이미지 POST 1건, 스티커 POST 1건).

## 4. 레거시 구조

- Telegram: `updateNewMessage` 가 **메시지 객체 전체(미디어 메타 포함)** 를 실어 보낸다. 받는 쪽은 미디어 파일만 따로 받는다(본문 재조회 없음). 반응은 `updateMessageReactions` 로 **집계 + 내가 고른 것** 을 함께 보낸다.
- 공통: 새 이벤트 = 완성된 데이터. 재조회는 끊김 복구(차이 조회) 때만. 같은 이벤트를 두 경로로 받지 않는다.

## 5. 설계안 (승인 시)

| # | 바꿀 것 | 효과 | 영향·위험 |
|---|---|---|---|
| ① | 서버 직렬화가 이미지·파일·음성 **메타(경로·크기·길이·썸네일 경로)** 를 스냅샷에 실음. 서명 URL 은 실지 않고 받는 쪽이 기존 `messages/[messageId]/media` 경로로 필요할 때만 받음 | 미디어 GET 0 | 스냅샷 크기 증가(Broadcast 한도 안 확인 필요) |
| ② | 통화 기록(`call_stub`) 스냅샷 병합 | GET 0 | **통화 변경 규정 대상** (통화 기록 표시) — 별도 영향 분석·승인 |
| ③ | 수정·삭제 bump 에 새 본문/삭제 표시를 실음 | GET 0 | ③ 조건 완화 — 검증 규칙 추가 |
| ④ | 반응 bump 에 **반응별 집계 + 반응한 사람 id**(그룹 상한) → `mine` 은 받는 쪽이 계산 | GET 0 | 큰 방 상한 초과 시 GET 유지 |
| ⑤ | 메시지 `postgres_changes` 병행 구독 제거, 끊김·복귀 때만 차이 조회 1회 | DB RLS 검사 0 | 가장 위험 — bump 누락 시 백업 경로가 없어짐. ①~④ 후 운영 관찰로 누락 0 확인 뒤 |

## 6. NOT_PROVEN

- Realtime(`postgres_changes`) 의 DB 부하 실측.
- 그룹 크기별 실제 사용 패턴.
- 11-19 이후(D1·D3 반영 후) 하루 전체 값.
