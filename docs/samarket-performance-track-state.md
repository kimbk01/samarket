# 사마켓 체감 성능 — 트랙 상태 · 미완 체크

> **갱신 규칙**: 라운드마다 이 파일을 업데이트한다. 새 채팅·새 창에서는 이 파일(+ [samarket-native-feel-charter.md](./samarket-native-feel-charter.md))이 연속성의 기준이다.  
> **정책 전문**: [samarket-native-feel-charter.md](./samarket-native-feel-charter.md) — **`[5-보조]`** composer_wall·warm 추가 판정(1100ms/200ms 편차·역행 무효·체감 1초) 포함.  
> **도메인별 완료율(동일 % 산식)**: [samarket-perf-domain-checksheet.md](./samarket-perf-domain-checksheet.md) — 성능 작업 **시작 시·종료 시** 갱신하고, 보고 시 **도메인별 %**를 함께 적는다. **UI 규격은 본 파일 범위 밖.**

| 필드 | 값 |
|------|-----|
| Last updated | 2026-04-22 |
| Owner | (선택) |

---

## 현재 최종 목표 (한 줄)

거래+커뮤니티 **당근급** · 메신저 **텔레그램·바이버급** · 배달·서비스형 **배민급**; 탭·리스트·전환 **선택 즉시 반응**. (UI 토큰·컴포넌트 시각 규격은 별도 관리.)

---

## 진행 중 트랙

| 항목 | 내용 |
|------|------|
| 트랙 이름 | 메신저·앱 체감 — **클라이언트 gate / hydration / route 전환 blocking** 병목 **1개 특정**(탐색 단계) |
| 한 줄 요약 | **라운드 K**: `estimateSize` **96→80**만 변경(overscan 12 유지) → **FMR−CTV 평균 ~83ms**(H **78.7ms** 대비 **미감소**), **CTV→input_ready 평균 ~23.7ms**(H **20.7ms** 대비 **악화**) → **롤백**. 다음: **가상화 외 클라 blocking** 또는 **estimateSize 미세 상향(한 값)** 등 단일 레버 재검토. |

---

## 종료된 트랙 (재개 금지)

| 트랙 이름 | 종료일 | 종료 사유 (헌장 [6] 항목) | 메모 |
|-----------|--------|---------------------------|------|
| 메신저 — 방 입장 `composer_wall_ms` (서버 스냅샷·동일 축) | 2026-04-21 | 동일 축 반복 한계·측정 비재현 | 라운드 G **실패**; F의 `deferSeedRecentMessagesFetchCap` 12→6은 **안정적 개선으로 비채택**·**12 롤백**. 재개 시 새 트랙 명·새 병목 1개로 연다. |

---

## 이번 라운드 (최신: 라운드 K — `estimateSize` 96→80 시도 후 롤백)

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

---

## 다음 후보 1개 (헌장 [8] 순서)

**가상화 밖 병목** — `overscan`·`estimateSize` 단일 변경은 **연속 악화 또는 미개선**. 다음은 **route chunk / Phase1 merge / 타임라인 외 레이아웃** 등 breakdown 상 **다른 마크 간격**이 큰 축을 1개만 고르거나, **estimateSize를 96보다 소량 상향(한 값)** 같은 반대 방향 실험을 **별도 라운드**로 한정.
