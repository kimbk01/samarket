# 카톡 · 당근 · 배민 동급 — **단일 진행 순서** (속도 구조 포함)

> **목적**: 세 참조 앱(메신저 **카카오톡**, 거래+커뮤니티 **당근마켓**, 배달·서비스형 **배달의민족** — [samarket-perf-domain-checksheet.md](./samarket-perf-domain-checksheet.md))과 **속도·구조·관측**까지 같은 축으로 맞추되, 작업은 **한 라운드 = 원인 1개**로 쪼갠다.  
> **헌장**: [samarket-native-feel-charter.md](./samarket-native-feel-charter.md) — 코드 완료 ≠ 체감 완료; `[x]`는 **측정·합의 후** 체크시트에서만.

---

## 1) 속도 구조 — 세 앱과 **같은 축**으로 맞출 것

아래 **행**은 “카톡/당근/배민이 공통으로 갖는 체감 구조”다. 도메인마다 구현체는 다르지만, **라운드 설계·리뷰 질문은 동일**하게 가져간다.

| 구조 축 | 무엇을 맞출지 (한 줄) | 당근(§1) | 배민(§3) | 카톡(§2) |
|--------|----------------------|----------|----------|----------|
| **A. 첫 응답 경로** | RSC/라우트가 **꼭 필요한 데이터만** 첫 await에 넣는가 | `/post` 본문·CTA | 스토어 홈·상세 첫 페인트 | 홈·방 타임라인 최소 |
| **B. 스트리밍·지연 로드** | 비핵심은 **Suspense/후속 청크**·API로 분리하는가 | related 스트림(P1 등) | taxonomy·부가 섹션 | 부트스트랩 단계 분리 |
| **C. 단일 비행·중복 제거** | 동일 URL·동일 키 **fan-out 방지** | 거래 feed·상세 fetch | `home-feed`/taxonomy dedupe | home-sync·list prefetch |
| **D. 탭·의도 prewarm** | pointerdown 직후 **목적지 캐시**만 데우는가 | `/market`·`/post` prefetch | `/stores` 키 정렬·TTL | `/community-messenger` bootstrap |
| **E. 경합 제거** | 비목적지 work는 **quiet window** 등으로 밀었는가 | Philife warm vs 탭 | 동일 | 동일 |
| **F. 서버·DB 계약** | 병렬 가능한 읽기는 **Promise.all**, 인덱스·RPC는 별도 라운드 | trade-detail·related | taxonomy·주문 조회 | HS·unread·RPC |
| **G. Realtime·정합** | “빠름만”이 아니라 **한 채널·한 의미**로 맞는가 | 거래 채팅·상태 | 주문 채팅 | 메신저 bump·read |
| **H. 측정·게이트** | 동일 조건 **3회**·스크립트·SLO 문서 | `verify:trade-hot-path-contract` | nav-perf·스토어 curl | composer·home-sync 로그 |

**진행 순서는 위 표를 위에서 아래로 “공통화”한다:** 먼저 **A~E**(탭·셸·첫 응답·중복·경합)를 세 도메인에 **같은 질문**으로 적용하고, 그다음 **F**, 마지막 **G·H**.

---

## 2) **마스터 순서** (제가 정한 한 줄 — 여기만 따르면 됨)

동시에 세 앱 축을 **한 커밋에 섞지 않는다**. 아래 번호는 **테마 우선순위**이고, 각 칸 안에서는 **라운드 1원인**만 연다.

| 순서 | 테마 | 세 앱 정렬 | 체크시트 | 주로 쓰는 게이트·문서 |
|------|------|------------|----------|----------------------|
| **0** | **공통 게이트·언어** | 셋 다 같은 “완료” 정의 | 요약 % 산식 | `npm run verify:parity-gates`, 헌장 [4][5] |
| **1** | **셸·탭·전환** (A+E+D) | 탭이 물리적으로 같으므로 **먼저** 공유 축 | §1·§2·§3 공통 | `measure:nav-perf`, BN 계열, `bottom-nav-tap-prewarm-data` |
| **2** | **당근 — 거래 핫패스** (A+B+C+F) | 목록→상세→채팅 | §1 | `trade-post-detail-chat-hot-path.mdc`, `verify:trade-hot-path-contract` |
| **3** | **배민 — 스토어·주문** (A+B+C+D+F) | 탭→피드→상세→주문 | §3 | `store-delivery-api-client`, BN2–5, 주문 채팅 경로 |
| **4** | **카톡 — 메신저** (A~D+F+G+H) | 홈→방→입력·읽음 | §2 | `messenger-performance-targets.md`, `messenger-realtime-policy.md`, `verify:messenger-home` |
| **5** | **횡단 마감** (B+H + 체크시트 3·4·5번) | 스크롤·뒤로가기·재진입·배지 | §1§2§3 나머지 행 | 도메인별 E2E·SLO 합의 후 `[x]` |

**왜 이 순서인가 (한 줄씩)**  
- **0**: 셋 다 “같이 맞췄다”고 말하려면 측정·게이트부터 통일해야 한다.  
- **1**: 카톡·당근·배민 모두 **하단 탭·첫 전환**이 첫인상이며, 한곳을 깨면 세 도메인이 같이 느려진다.  
- **2**: 거래(당근)가 **RSC·핫패스 계약**의 기준선이 되어 배민·카톡의 “첫 블록 분리” 패턴을 재사용한다.  
- **3**: 같은 탭 인접에 **스토어(배민)** 를 묶어 셸→스토어 데이터 파이프를 마친다.  
- **4**: **메신저(카톡)** 는 SLO·Realtime·composer 가장 빡세서, 셸·거래·스토어가 안정된 뒤 측정 노이즈를 줄인다.  
- **5**: 체크시트 **나머지 행**(스크롤·뒤로가기·배지 등)을 **도메인별로 같은 라운드 규칙**으로 마감한다.

**순서 1에서 이미 반영한 코드 라운드 예:** **S1**(2026-05-10) — idle·부트웜 `/stores` prewarm 이 BN3 pointerdown 과 **동일 region `home-feed` suffix** 를 쓰도록 `BottomNav` 정렬 — [samarket-performance-track-state.md](./samarket-performance-track-state.md) 「라운드 S1」.

**순서 2(거래 핫패스) — 2026-05-10 작업 마감:** 라운드 **P1** related `Suspense`·`getTradeDetailRelatedData` 단일 경유·`openCreateTradeChat` 비대기 계약을 검증 스크립트·코드로 재확인([samarket-performance-track-state.md](./samarket-performance-track-state.md) 「라운드 P1」판정). related 번들 **내부** DB·캐시는 별 라운드(원인 1개)로 분리.

---

## 3) Phase 블록 (문서·트랙과의 대응)

위 **마스터 순서 2~4**가 기존 “Phase 1 거래 → Phase 2 배민 → Phase 3 카톡”과 **동일한 뜻**이다. 이름만 **숫자 마스터 순서**로 통일했다.

| 마스터 | 기존 Phase 이름 | 비고 |
|--------|-----------------|------|
| 2 | Phase 1 당근 | P1 related 스트림 등 — [samarket-performance-track-state.md](./samarket-performance-track-state.md) |
| 3 | Phase 2 배민 | BN1–5 및 이후 스토어 상세·주문 |
| 4 | Phase 3 카톡 | M/R/S/U, HS, composer_wall 합의 |

---

## 0) 매 작업 전·후 공통 게이트

```bash
npm run verify:parity-gates
```

포함: `verify:trade-hot-path-contract`, `verify:messenger-home`, `tsc`. 전체는 `npm run check`(라우트 등).

---

## 완료율 %

[samarket-perf-domain-checksheet.md](./samarket-perf-domain-checksheet.md) 요약 표만 갱신한다.

---

## 금지

- 증거 없이 체크시트 `[x]`  
- 한 라운드에 원인 여러 개  
- “당근/배민/카톡 달성”을 측정 없이 선언  

**이 파일이 제품의 “진행 순서 단일 기준”이다.** 다른 문서와 어긋나면 **본 파일을 먼저** 고친다.
