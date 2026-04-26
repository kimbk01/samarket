# 사마켓 체감 성능 — 트랙 상태 · 미완 체크

> **갱신 규칙**: 라운드마다 이 파일을 업데이트한다. 새 채팅·새 창에서는 이 파일(+ [samarket-native-feel-charter.md](./samarket-native-feel-charter.md))이 연속성의 기준이다.  
> **정책 전문**: [samarket-native-feel-charter.md](./samarket-native-feel-charter.md) — **`[5-보조]`** composer_wall·warm 추가 판정(1100ms/200ms 편차·역행 무효·체감 1초) 포함.  
> **도메인별 완료율(동일 % 산식)**: [samarket-perf-domain-checksheet.md](./samarket-perf-domain-checksheet.md) — 성능 작업 **시작 시·종료 시** 갱신하고, 보고 시 **도메인별 %**를 함께 적는다. **UI 규격은 본 파일 범위 밖.**

| 필드 | 값 |
|------|-----|
| Last updated | 2026-04-26 |
| Owner | (선택) |

---

## 현재 최종 목표 (한 줄)

거래+커뮤니티 **당근마켓급** · 메신저 **카카오톡급** · 배달·서비스형 **배달의민족급**; 탭·리스트·전환 **선택 즉시 반응**. (UI 토큰·컴포넌트 시각 규격은 별도 관리.)  
**체크시트·완료율 %:** [samarket-perf-domain-checksheet.md](./samarket-perf-domain-checksheet.md) — 항목 `[x]` = 완료, 라운드 수치만 바뀐 경우는 **트랙 상태(본 파일)**에만 기록.

---

## 체크시트 연동 — 메신저 ([samarket-perf-domain-checksheet.md](./samarket-perf-domain-checksheet.md) §2)

| # | 기준(요약) | 체크시트 | 최근 증거·메모 |
|---|------------|----------|----------------|
| 1 | 방 탭 후 즉시 입력 | **미완료** `[ ]` | `composer_wall` 축은 **종료**. **라운드 M**(2026-04-23): `input_ready` 기록을 `useEffect`→`useLayoutEffect` — breakdown **CTV→input 3회 모두 0ms**, **FMR−CTV ~16–21ms**(H 78.7 대비 ↓). 전체 `composer_wall`/SLO는 별도 합의 전까지 `[ ]` 유지. |
| 2 | 목록·말풍선 지연 | **미완료** `[ ]` | breakdown·부트스트랩 라운드는 진행·종료 기록 있으나 **본 항목 합의 완료 아님**. |
| 3 | 스크롤·재진입·뒤로가기 | **미완료** `[ ]` | 별도 E2E·합의 없음. |
| 4 | 배지·읽음·목록 정합 | **미완료** `[ ]` | 별도 E2E·합의 없음. |
| 5 | 탭·채팅 선택 즉시 반응 | **미완료** `[ ]` | 별도 E2E·합의 없음. |

**도메인 완료율(메신저):** **0 / 5 → 0%** (위 항목이 모두 `[x]`일 때만 100%).

---

## 메신저 실시간 근본조치 (2026-04-22)

| 항목 | 내용 |
|------|------|
| 트랙 이름 | 메신저 실시간 근본조치 — silent subscription / 거래 상태 단일 전파 / 읽음 배지 계약 통일 |
| 현재 상태 | **구현 완료 · 검증 대기** |
| 이번 원인 1개 | `rooms.summary` 거래 메타 파싱에서 **`postId` 누락** + 채널별 각자 다른 `SUBSCRIBED` 해석 때문에, 거래 상태·presence·통화·배지가 같은 날 다시 흔들릴 수 있는 구조였다. |
| 이번 조치 | 1) 공통 `realtime health` 도입과 silent channel 계측 추가 2) 통화·presence·거래 상태 Realtime을 같은 재시도 축으로 정렬 3) 판매 상태 변경 시 **Community Messenger room summary**를 서버에서 직접 동기화 4) 메신저 방 읽음을 **즉시 mark_read**로 통일하고 거래 배지 해제를 같이 전파 |
| 관측 포인트 | `realtime.subscription:silent_channel`, `realtime.subscription:presence_snapshot_fallback`, `db.community_messenger:trade_state_summary_sync`, 기존 `chat.unread_sync:badge_list_align` |

---

## 진행 중 트랙

| 항목 | 내용 |
|------|------|
| 트랙 이름 | 메신저·앱 체감 + 서버 부하 — **고빈도 API 반복 비용(스냅샷/뱃지) 상위 병목** |
| **트랙 상태** | **진행 중** — 라운드 **V-fix**(2026-04-23) 코드 반영: 잘못된 핫패스 회수 + 근본 병목만 유지. |
| 한 줄 요약 | **라운드 U:** 커뮤니티(`/philife`) RSC 시드·초기 부팅. **라운드 V(교정):** 근본 병목은 `community_messenger_participants` → `applyRoomSummaryPatched` 가 **`unreadCount`만 바뀌는데도 매번 `sortRoomOrder(전체 방)`**을 호출한 점(코드로 확정). `lastMessageAt`(피드 정렬 키)이 바뀔 때만 전체 정렬. `applyIncomingMessageEvent`는 새 객체 때문에 `===`로 **항상 정렬**되던 분기를 동일 규칙으로 교정. 키 상한(280) 가지치기는 **초과 시에만** `seedBootstrap`/`seedRoomSnapshot`에서 실행(핫 Realtime 경로에서 매 패치 정렬·가지치기 제거). |

**보조(도메인 순환·`performance-state.json`):** 2026-04-26 — `myinfo`로 남아 있던 **`PurchaseDetailView` 구매 상세 GET**을 비행 패턴(`fetch`만 합류·`clone` 파싱·`credentials`)으로 정리해 한 사이클을 코드까지 마감했다. `currentTarget`은 다음 순환 진입점으로 **`login`**을 유지한다.

---

## 트랙 일시 중단 (보류)

1. **중단 시점:** 라운드 **P** 측정·문서 반영 직후(이후 **Q 재개·측정 완료**, 2026-04-22). **composer_wall 동일 축**·**가상화 숫자만 조정** 트랙은 이미 **종료(재개 금지)** — 아래 **「종료된 트랙」** 표 참고.  
2. **유지:** `CommunityMessengerRoomPhase2`(M), `use-messenger-room-derived-message-lists`(N), 타임라인 읽음 배지(O), `messageRowPreamble`(P), **Q의 타입별 `memo` 분리·`onOpenImageLightbox`** 등 **무효/보류라도 제품 구조로 타당한 변경**은 롤백하지 않음.  
3. **재개 트리거(연속성):** **「다음 라운드 최적화 하자」** / **「최적화 이어가자」** 시 본 절 + **「다음 후보 1개」**를 읽고 **라운드 R**을 연다(Q 다음).

---

## 종료된 트랙 (재개 금지)

| 트랙 이름 | 종료일 | 종료 사유 (헌장 [6] 항목) | 메모 |
|-----------|--------|---------------------------|------|
| 메신저 — 방 입장 `composer_wall_ms` (서버 스냅샷·동일 축) | 2026-04-21 | 동일 축 반복 한계·측정 비재현 | 라운드 G **실패**; F의 `deferSeedRecentMessagesFetchCap` 12→6은 **안정적 개선으로 비채택**·**12 롤백**. 재개 시 새 트랙 명·새 병목 1개로 연다. |
| 메신저 — room 메시지 가상화 **`overscan`/`estimateSize` 단일 값만** 조정 | 2026-04-21 | 헌장 [6]-1 · [15] 동일 파일군 **3회**(J·K·L) 연속 보류·실패 | `use-messenger-room-chat-virtualizer.ts`만의 1값 실험은 **재개 금지**. 가상화 자체 개편이 필요하면 **새 트랙명·다른 병목 1개**로 연다. |

---

## 이번 라운드 (최신: 라운드 Q — `viberInnerBody` 타입별 `memo` 소컴포넌트)

| 항목 | 내용 |
|------|------|
| 원인 1개 | 가상 행 `map` 직후 **`viberInnerBody` IIFE**가 매 행 **클로저·분기** 비용을 만들고, 이미지 분기에서 **`onOpenLightbox` 인라인**으로 **하위 `memo` 이점이 무력화**될 수 있음. |
| 측정 명령 | `PLAYWRIGHT_NO_WEBSERVER=1` `PLAYWRIGHT_BASE_URL=http://localhost:3000` `E2E_TEST_USERNAME` / `E2E_TEST_PASSWORD` — `messenger-room-entry-perf-breakdown.spec.ts` `--workers=1` **3회**(로컬 `npm run dev`). |
| 완료 기준 | winner **`display_room_messages_ready_to_first_message_render_ms`** 가 **라운드 P warm(런2–3) 평균 19ms** 대비 **역행 없이** 감소·동급 안정. |
| 수정 파일 (1~3) | **`CommunityMessengerRoomPhase2MessageTimeline.tsx`만** |

### 라운드 Q — 3회 (ms)

| Run | `phase2_enter` | `merge_applied` | `display_room_messages_ready` | `first_message_render` | **display_ready→FMR** |
|-----|----------------|-----------------|--------------------------------|--------------------------|------------------------|
| 1 | 12621 | 12630 | 12621 | 12634 | **13** |
| 2 | 2594 | 2609 | 2594 | 2613 | **19** |
| 3 | 2454 | 2473 | 2454 | 2478 | **24** |

**Q warm(런2–3) 평균:** **21.5 ms** — **직전 라운드 P warm((15+23)/2) = 19 ms** 대비 **↑** → 헌장 **[5-보조]-2 역행** 적용.  
**판정:** **무효** — 구조 분리·`useCallback`은 **유지**(유지보수·동일 `item` 참조 시 `memo` 여지); **수치상 성공·보류로 올리지 않음**.

---

## 이번 라운드 (참고: 라운드 P — 가상 행 map 직전 createdAt·아바타 중복 제거)

| 항목 | 내용 |
|------|------|
| 원인 1개 | **가상 행 `map`마다** 인접 `gapMs`용 **`new Date(createdAt).getTime()` 2회**, 내 말풍선마다 **동일 `viewerUserId` 아바타** `communityMessengerMemberAvatar`(내부 `members.find`) **반복**, 상대 말풍선마다 **동일 `senderId`에 대한 `find` 반복**. |
| 측정 명령 | `PLAYWRIGHT_NO_WEBSERVER=1` `PLAYWRIGHT_BASE_URL=http://localhost:3000` — `messenger-room-entry-perf-breakdown.spec.ts` `--workers=1` **3회**(3회차 1회 실패 후 **재시도 1회**로 대체). |
| 완료 기준 | winner **`display_room_messages_ready_to_first_message_render_ms`** 가 라운드 O warm 대비 **안정적 감소**. |
| 수정 파일 (1~3) | **`CommunityMessengerRoomPhase2MessageTimeline.tsx`만** |

### 라운드 P — 3회 (ms)

| Run | `phase2_enter` | `merge_applied` | `display_room_messages_ready` | `first_message_render` | **display_ready→FMR** |
|-----|----------------|-----------------|--------------------------------|--------------------------|------------------------|
| 1 | 8627 | 8640 | 8628 | 8643 | **15** |
| 2 | 1703 | 1716 | 1703 | 1718 | **15** |
| 3 | 2601 | 2620 | 2601 | 2624 | **23** |

**P 평균:** **~17.7 ms** (O warm 런2–3 **16+23** 평균 **19.5 ms** 대비 **↓**) · 런1은 절대 시각이 크나 **winner는 15ms**  
**판정:** **보류** — **2/3회 15ms**로 베스트는 좋아졌으나 **23ms** 한 번으로 **완전 입증은 어려움**; 구조 변경은 **유지**.

---

## 이번 라운드 (참고: 라운드 O — 타임라인 읽음 배지 파생 단일화)

| 항목 | 내용 |
|------|------|
| 원인 1개 | **`latestReadableMineMessageId`** 와 **`peerHasReadMyLatestMessage`** 가 각각 `displayRoomMessages`를 **역순 전체 스캔**하고, 후자는 추가로 **`filter(!pending)` 전 배열 + `find` 2회**로 **동일 렌더 틱에 중복 스캔**이 발생했다. |
| 측정 명령 | `PLAYWRIGHT_NO_WEBSERVER=1` `PLAYWRIGHT_BASE_URL=http://localhost:3000` — `messenger-room-entry-perf-breakdown.spec.ts` `--workers=1` **3회**. |
| 완료 기준 | winner **`display_room_messages_ready_to_first_message_render_ms`** 가 라운드 N 대비 **안정적 감소**. |
| 수정 파일 (1~3) | **`CommunityMessengerRoomPhase2MessageTimeline.tsx`만** |

### 라운드 O — 3회 (ms)

| Run | `phase2_enter` | `merge_applied` | `display_room_messages_ready` | `first_message_render` | **display_ready→FMR** |
|-----|----------------|-----------------|--------------------------------|--------------------------|------------------------|
| 1 | 7828 | 7850 | 7828 | 7856 | **28** |
| 2 | 2775 | 2796 | 2776 | 2799 | **23** |
| 3 | 1836 | 1849 | 1836 | 1852 | **16** |

**O 평균(warm 런2–3만):** **~19.5 ms** (N warm **~19.0 ms**와 동급) · 런1은 절대 시각 cold에 가까워 **제외**  
**판정:** **보류** — 구조 개선(스캔 횟수 실감 감소) **채택**, winner ms **유의미 감소 미입증**.

---

## 이번 라운드 (참고: 라운드 N — `useMessengerRoomDerivedMessageLists` 단일 순회)

| 항목 | 내용 |
|------|------|
| 원인 1개 | **`roomMessages` 갱신 직후** `useMessengerRoomDerivedMessageLists`가 **서로 독립인 `useMemo` 6~7개**로 **각각 전 배열을 순회**해, `displayRoomMessages`가 타임라인·가상화에 도달하기 전 **동일 렌더 틱에서 CPU를 과다 사용**한다. |
| 측정 명령 | `PLAYWRIGHT_NO_WEBSERVER=1` `PLAYWRIGHT_BASE_URL=http://localhost:3000` `E2E_TEST_USERNAME` / `E2E_TEST_PASSWORD` — `messenger-room-entry-perf-breakdown.spec.ts` `--workers=1` **3회**(warm 위주; 1회는 절대 시각이 커 cold에 가까움). |
| 완료 기준 | `MESSENGER_ROOM_ENTRY_PREFMR_GAP_JSON`의 **`display_room_messages_ready_to_first_message_render_ms`(winner)** 가 **직전(M 이후) 관측 대비 유의미 감소**. |
| 수정 파일 (1~3) | **`use-messenger-room-derived-message-lists.ts`만** |

### 라운드 N — 3회 (ms)

| Run | `display_room_messages_ready` | `first_message_render` | **display_ready → FMR** (winner) | 비고 |
|-----|--------------------------------|------------------------|----------------------------------|------|
| 1 | 2105 | 2128 | **23** | phase2·display 동대역 |
| 2 | 2509 | 2525 | **16** | |
| 3 | 2107 | 2125 | **18** | |

**N 평균(winner):** **~19.0 ms** (M 직후 동일 스펙에서 자주 보던 **~16–21ms**와 **동급**; cold 혼입 러닝에서는 **29ms**까지 벌어짐)  
**판정:** **보류** — 구조적으로 **O(n) 한 번**으로 줄였으나, **로컬 dev 3회만으로 winner 구간의 안정적 단축은 입증되지 않음**(노이즈·cold 경로). **코드는 유지**(메시지 수 증가 시 이점 확대).

---

## 이번 라운드 (참고: 라운드 M — `input_ready` 를 `useLayoutEffect`로 이전)

| 항목 | 내용 |
|------|------|
| 원인 1개 | **`input_ready_ms`** 가 **`useEffect`**(페인트 이후)에서만 기록·`first_interactive` 호출되어, 동일 DOM 기준에서도 **CTV→input** 게이트가 **프레임만큼 불필요하게 커질 수 있음**. |
| 측정 명령 | `PLAYWRIGHT_NO_WEBSERVER=1` `PLAYWRIGHT_BASE_URL=http://localhost:3000` `E2E_TEST_USERNAME` / `E2E_TEST_PASSWORD` — `messenger-room-entry-perf-breakdown.spec.ts` `--workers=1` **3회 연속**. |
| 완료 기준 | **H 대비** CTV→input **악화 없음** + FMR−CTV **감소**(동일 스펙·로컬 dev). |
| 수정 파일 (1~3) | **`CommunityMessengerRoomPhase2.tsx`만** |

### 라운드 M — 3회 (ms)

| Run | `phase2_enter` | `composer_textarea_visible` | `input_ready` | `first_message_render` | **FMR − CTV** | **CTV → input** | **p2 → CTV** |
|-----|----------------|----------------------------|---------------|--------------------------|---------------|-------------------|--------------|
| 1 | 5799 | 5799 | 5799 | 5820 | **+21** | **0** | **0** |
| 2 | 2121 | 2121 | 2121 | 2139 | **+18** | **0** | **0** |
| 3 | 1658 | 1658 | 1658 | 1674 | **+16** | **0** | **0** |

**M 평균:** FMR−CTV **~18.3 ms** (H **78.7 ms** 대비 ↓) · CTV→input **0 ms** (H **20.7 ms** 대비 ↓) · p2→CTV **0 ms**  
**판정:** **성공** — 동일 조건 3회에서 **역행·편차 과대 없음**.

---

## 이번 라운드 (참고: 라운드 L — `estimateSize` 96→104 시도 후 롤백)

| 항목 | 내용 |
|------|------|
| 원인 1개 | **가설:** `estimateSize(96)`이 과소 추정이면 초기 가상 행 수가 많아 **첫 메시지 커밋 비용**이 커진다 → **104**로만 **한 값** 상향 검증. |
| 측정 명령 | `PLAYWRIGHT_NO_WEBSERVER=1` `PLAYWRIGHT_BASE_URL=http://localhost:3000` `E2E_TEST_USERNAME` / `E2E_TEST_PASSWORD` — `messenger-room-entry-perf-breakdown.spec.ts` **프로세스 분리 3회**(`--workers=1`). (중간 실패 2회는 재시도로 대체.) |
| 완료 기준 | FMR−CTV **H 78.7ms 대비 감소** + CTV→input_ready·phase2→CTV **악화 없음** |
| 수정 파일 (1~3) | **`use-messenger-room-chat-virtualizer.ts`만** — 시도 후 **`estimateSize` 96 원복** |

### 라운드 L — 3회 (ms)

| Run | `phase2_enter` | `composer_textarea_visible` | `input_ready` | `first_message_render` | **FMR − CTV** | **CTV → input** | **p2 → CTV** |
|-----|----------------|----------------------------|---------------|--------------------------|---------------|-------------------|--------------|
| 1 | 5225 | 5225 | 5233 | 5242 | **+17** | **8** | **0** |
| 2 | 2119 | 2119 | 2247 | 2270 | **+151** | **128** | **0** |
| 3 | 1887 | 1887 | 1897 | 1905 | **+18** | **10** | **0** |

**L 평균:** FMR−CTV **~62 ms** (H **78.7**보다 ↓) · CTV→input **~48.7 ms** (H **20.7**보다 ↑ — **런2 악화로 기준 불충족**) · p2→CTV **0 ms**  
**판정:** **보류** — 동일 스펙에서 **런 간 편차 큼**(FMR−CTV 17↔151); 채택 시 **입력 지연 악화** 구간 재현 가능.

---

## 이번 라운드 (참고: 라운드 K — `estimateSize` 96→80 시도 후 롤백)

| 항목 | 내용 |
|------|------|
| 원인 1개 | **가설:** `estimateSize(96)`이 과대면 초기 virtual range·측정이 커져 **FMR**이 늦어진다. **검증:** **80**으로만 하향. |
| 측정 명령 | `messenger-room-entry-perf-breakdown.spec.ts` **3회 분리 실행**(`--workers=1`); 2회차는 로그 미포착으로 **추가 1회**로 3개 수치 확보. |
| 완료 기준 | FMR−CTV **H 78.7ms 대비 감소** + CTV→input·phase2→CTV **악화 없음** |
| 수정 파일 (1~3) | **`use-messenger-room-chat-virtualizer.ts`만** — `estimateSize` **원복 96** |

### 라운드 K — 수정 적용 시 (ms)

| Run | `phase2_enter` | `composer_textarea_visible` | `input_ready` | `first_message_render` | **FMR − CTV** | **CTV → input** | **p2 → CTV** |
|-----|----------------|----------------------------|---------------|--------------------------|---------------|-------------------|--------------|
| 1 | 3792 | 3792 | 3820 | 3886 | **+94** | **28** | **0** |
| 2 | 1049 | 1049 | 1072 | 1139 | **+90** | **23** | **0** |
| 3 | 1317 | 1317 | 1337 | 1382 | **+65** | **20** | **0** |

**K 평균:** FMR−CTV **~83.0 ms** (H **78.7 ms**보다 ↑) · CTV→input **~23.7 ms** (H **20.7 ms**보다 ↑) · p2→CTV **0 ms**

---

## 이번 라운드 (참고: 라운드 J — virtualizer `overscan` 12→6 시도 후 롤백)

| 항목 | 내용 |
|------|------|
| 원인 1개 | **가설:** 초기 `overscan`이 크면 첫 virtual item 준비·측정이 늘어 **FMR**이 늦어진다. **검증:** `overscan` **12→6**만 변경. |
| 측정 명령 | `PLAYWRIGHT_NO_WEBSERVER=1` `PLAYWRIGHT_BASE_URL=http://localhost:3000` `E2E_TEST_USERNAME=aaaa` `E2E_TEST_PASSWORD=1234` — `messenger-room-entry-perf-breakdown.spec.ts` **프로세스 3회 분리** |
| 완료 기준 | FMR−CTV **H 78.7ms 대비 유의미 감소** + CTV→input_ready·phase2→CTV **악화 없음** |
| 수정 파일 (1~3) | **`lib/community-messenger/room/use-messenger-room-chat-virtualizer.ts`만** (시도 후 **overscan 원복 12**) |

### 라운드 J — 수정 적용 시 3회 (ms)

| Run | `phase2_enter` | `composer_textarea_visible` | `input_ready` | `first_message_render` | **FMR − CTV** | **CTV → input** | **p2 → CTV** |
|-----|----------------|----------------------------|---------------|--------------------------|---------------|-------------------|--------------|
| 1 | 1850 | 1850 | 1893 | 1983 | **+133** | **43** | **0** |
| 2 | 1706 | 1705 | 1734 | 1820 | **+115** | **29** | **−1** |
| 3 | 2396 | 2395 | 2415 | 2469 | **+74** | **20** | **−1** |

**J 평균:** FMR−CTV **~107.3 ms** · CTV→input **~30.7 ms** · p2→CTV **≈ −0.7 ms**

**H 기준(동일 스펙 이전 기록):** FMR−CTV **78.7 ms** · CTV→input **20.7 ms**

---

## 이번 라운드 (참고: 라운드 I — `first_message_render` 조건 완화 시도 후 롤백)

| 항목 | 내용 |
|------|------|
| 원인 1개 | `first_message_render_ms`가 **`getVirtualItems().length > 0`와 동시에** 잡히며 라운드 H에서 **+70~+91ms** 간격을 만든다는 가설 — **DOM(`[id^="cm-room-msg-"]`) 존재 시에도 virtualizer count 0이면 통과**하도록 완화 시도. |
| 측정 명령 | 동일 `messenger-room-entry-perf-breakdown.spec.ts` — 수정 후 **프로세스 3회 분리**(`1..3 \| ForEach-Object { npx playwright test … }`)로 route perf 오염 방지. |
| 완료 기준 | FMR−CTV 평균 **라운드 H 대비 유의미 감소** + phase2→CTV·input_ready **악화 없음** |
| 수정 파일 (1~3) | **`CommunityMessengerRoomPhase2.tsx`만** (시도 후 **원복** — 현재 트리는 라운드 H와 동일 조건) |

### 라운드 H (기준선, 코드 변경 없음)

| Run | `phase2_enter` | `composer_textarea_visible` | `input_ready` | `first_message_render` | **FMR − CTV** |
|-----|----------------|----------------------------|---------------|--------------------------|---------------|
| 1 | 1925 | 1925 | 1946 | 1995 | **+70** |
| 2 | 1566 | 1565 | 1584 | 1640 | **+75** |
| 3 | 1109 | 1109 | 1131 | 1200 | **+91** |

**H 평균 FMR−CTV:** **78.7 ms** · `CTV→input_ready` 평균 **20.7 ms** · `phase2→CTV` **0~1 ms**

### 라운드 I — 수정 적용 중 3회 (동일 계정·분리 실행)

| Run | `phase2_enter` | `composer_textarea_visible` | `input_ready` | `first_message_render` | **FMR − CTV** |
|-----|----------------|----------------------------|---------------|--------------------------|---------------|
| 1 | 1320 | 1320 | 1354 | 1437 | **+117** |
| 2 | 1218 | 1218 | 1245 | 1316 | **+98** |
| 3 | 1365 | 1365 | 1400 | 1476 | **+111** |

**I 평균 FMR−CTV:** **108.7 ms** (↑) · `CTV→input_ready` 평균 **32 ms** (↑) · `phase2→CTV` **0 ms**

### 롤백 후 확인 1회

| `phase2_enter` | `composer_textarea_visible` | `input_ready` | `first_message_render` | **FMR − CTV** |
|----------------|------------------------------|-----------------|------------------------|---------------|
| 1700 | 1699 | 1724 | 1787 | **+88** |

---

## 미완 체크리스트 (라운드 J)

- [x] 코드 완료 — `overscan` 시도 후 롤백
- [x] 동일 조건 3회 측정(분리 실행, `--workers=1` 동등)
- [x] 수정 전·후 비교(H 기준)
- [x] 판정 기록 — **실패**
- [x] 트랙 유지 — **유지**

---

## 3회 측정 결과

### 수정 전 (동일 스펙·동일 room, 2026-04-21 기록)

| Run | cold/warm | `composer_wall_ms` |
|-----|-----------|---------------------|
| 1 | cold 편차 | **5094** |
| 2 | warm | **1596** |
| 3 | warm | **1696** |

**수정 전 warm 평균 (런2–3):** **1646 ms**

### 라운드 A 수정 후 (page canonical 직렬 제거, 2026-04-21)

| Run | cold/warm | `composer_wall_ms` |
|-----|-----------|---------------------|
| 1 | 스펙상 예열 후 첫 루프 | **1448** |
| 2 | warm | **1268** |
| 3 | warm | **976** |

**라운드 A warm 평균 (런2–3):** **1122 ms**

### 라운드 B 수정 후 (participants `profiles!…` embed + `hydrateProfilesLabelsOnlyWithMap` prefetched, 2026-04-21)

| Run | cold/warm | `composer_wall_ms` |
|-----|-----------|---------------------|
| 1 | 참고(첫 루프) | **841** |
| 2 | warm | **1070** |
| 3 | warm | **1217** |

**라운드 B warm 평균 (런2–3):** **1143 ms** (목표 ≤1000ms **미달**).

### 라운드 C 수정 후 (defer seed messages `.limit` → `min(messageLimit, 12)`, select 컬럼 동일, 2026-04-21)

| Run | cold/warm | `composer_wall_ms` |
|-----|-----------|---------------------|
| 1 | 참고(첫 루프) | **1705** |
| 2 | warm | **1365** |
| 3 | warm | **598** |

**라운드 C warm 평균 (런2–3):** **981.5 ms** (목표 ≤1000ms **달성**).  
**messages 쿼리:** defer seed 시 **최대 12 row** (이전 대비 라운드 B 대비 **20→12** 상한). select: `id, room_id, sender_id, message_type, content, metadata, created_at` **변경 없음**(줄인 항목은 **row 수 = `.limit()` 상한** 1건뿐).

**환경 노이즈:** 로컬 `npm run dev`, `PLAYWRIGHT_NO_WEBSERVER=1`, 동일 room id. (간헐적 `goto` 타임아웃 후 재시도 1회 성공.)

### 라운드 D 수정 후 (defer seed 시 rooms select에서 `notice_text` 제외, 2026-04-20)

| Run | cold/warm | `composer_wall_ms` |
|-----|-----------|---------------------|
| 1 | 참고(첫 루프) | **1433** |
| 2 | warm | **1928** |
| 3 | warm | **1297** |

**라운드 D warm 평균 (런2–3):** **1612.5 ms** — 라운드 C warm 평균 **981.5 ms** 대비 **역행** → **무효** 규칙 적용.  
**rooms 쿼리:** `deferSecondaryRequested`일 때만 `notice_text` 미포함(그 외는 기존과 동일 select 문자열).

### 라운드 E 수정 후 (비-defer messages 상한 20, defer 시드 12행 유지, 2026-04-21)

| Run | cold/warm | `composer_wall_ms` |
|-----|-----------|---------------------|
| 1 | 참고(첫 루프) | **1004** |
| 2 | warm | **1420** |
| 3 | warm | **2055** |

**라운드 E warm 평균 (런2–3):** **1737.5 ms**. 런2–3 편차 **635ms** (≥200ms). warm 둘 다 **≥1100ms**.  
**messages 쿼리:** defer seed 시 **최대 12 row**(라운드 C와 동일). 비-defer 시 **최대 20 row**(`Math.min(messageLimit, 20)`). → **Playwright 시드(defer) 경로의 messages row 수는 C와 동일**; 본 3회 값은 **노이즈·다른 단계** 비중이 큼.

### 라운드 F 수정 후 (`deferSeedRecentMessagesFetchCap` 12→6, 2026-04-21)

| Run | cold/warm | `composer_wall_ms` |
|-----|-----------|---------------------|
| 1 | 참고(첫 루프) | **1501** |
| 2 | warm | **670** |
| 3 | warm | **1255** |

**라운드 F warm 평균 (런2–3):** **962.5 ms** (≤1000ms **달성**). 런2–3 편차 **585ms** (≥200ms). warm3 **1255ms** (≥1100ms, **<1100 미달**).  
**messages 쿼리:** defer seed 시 **최대 6 row** (`deferSeedRecentMessagesFetchCap = 6`; 라운드 G 후 **롤백**으로 현재는 다시 **12**). 라운드 E warm 평균 **1737.5ms** 대비 **악화 아님** → **무효 규칙 미적용**.

### 라운드 G (F와 동일 코드, 재측정만, 2026-04-21)

| Run | cold/warm | `composer_wall_ms` |
|-----|-----------|---------------------|
| 1 | 참고(첫 루프) | **1665** |
| 2 | warm | **1102** |
| 3 | warm | **1732** |

**라운드 G warm 평균 (런2–3):** **1417 ms** — 라운드 F **962.5ms** 대비 **악화**. warm2 **1102ms** (엄밀히 **<1100ms** 미달). warm3 **1732ms**. 편차 **630ms** (≥200ms).

**라운드 G 종료 조치:** 판정 **실패** — F 개선 수치 **재현 실패** → `deferSeedRecentMessagesFetchCap` **12로 롤백**(현재 코드). **`composer_wall_ms` 동일 축 트랙 종료.**

---

## 판정 · 트랙 (라운드 G·`composer_wall` 축 마감)

| 항목 | 값 |
|------|-----|
| 판정 | **실패** — 라운드 F 개선 **재현 실패**; warm 평균 **1417ms**; warm2·3 **<1100ms** 미달; 편차 **630ms**. **`deferSeedRecentMessagesFetchCap` 12→6 패치는 안정적 개선으로 채택하지 않음**(12 롤백). |
| 트랙 유지 / 종료 | **`composer_wall_ms` 서버 동일 축 트랙 종료** — 다음은 **클라이언트 gate / hydration / route transition blocking** 중 원인 **1개** 특정 트랙으로 전환. |

---

## 보류·무효 연속 카운터 (같은 병목·파일군)

헌장 [15]: 같은 병목에서 보류/무효 **3회 누적** 시 트랙 종료 후 상위 병목으로 이동.

| 대상 (병목/파일군) | 연속 보류·무효 횟수 | 비고 |
|--------------------|---------------------|------|
| 메신저 `composer_wall` / `service.ts` 첫 `Promise.all` | — | **트랙 종료**(2026-04-21)로 본 축 카운터 종료. |
| 메신저 room **`use-messenger-room-chat-virtualizer.ts` 단일 레버** (`overscan` / `estimateSize`) | **3** | **J·K·L** 누적 → 헌장 **[15]**에 따라 **이 파일에서 overscan·estimateSize만 바꾸는 미세 트랙 종료**. 다음 라운드는 **가상화 외** 축만. |

---

## 다음 후보 1개 (헌장 [8] 순서)

**다음 라운드(라운드 T) 후보 1개:** `GET /api/community-messenger/rooms/[roomId]/bootstrap`의 `room_silent` 경로(로그 **2.4~2.8s**)에서 **minimal 부트스트랩 쿼리 왕복(rooms/participants/profile hydrate) 1축**을 분리·축소하는 구조 개선 1건.
