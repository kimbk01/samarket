# DIBAY Apple App Store 정식 출시 — 콘텐츠 안전·연령 보호·약관 동의·규정 준수 통합 설계

- **상태:** 설계·근거만. **Owner 승인 전 코드·DB·네이티브·배포·실기기 금지.**
- **감사 기준:** `origin/main` (조사 시점 `c168655f` 계열) + 현 워크스페이스 코드 대조. Production 런타임·운영 SLA는 **NOT_PROVEN**.
- **제품 전제(검토안):** 최소 연령 **만 14세** 검토(한국 §22조의2 정렬). **Owner 확정 전 임의 적용 금지.** (이전 초안 만 13세는 폐기 후보.)
- **선행 감사:** ASC 연령 등급 1단계 8문항 · 가입 동의·Legal CMS 전수 감사(동일 세션).
- **기존 SSOT 재사용:** `docs/dibay-first-entry-legal-consent-ssot.md` · `docs/audit/marketing-consent-and-push-audience-plan-2026-11-03.md` (마케팅 Owner 지시 반영·미구현 부분 통합).

---

## 0. 한 줄 결론

DIBAY는 **UGC·소셜·채팅·광고가 이미 있는 슈퍼앱**이다. Apple **1.2**는 신고·차단·연락처 **대부분 존재**, 게시 전 필터는 커뮤니티 금지어만 **PARTIAL**. **연령 게이트·Declared Age Range는 없음.**  
**가입 동의**는 이미 **이용약관+개인정보 2필수·버전 재동의·Admin Legal CMS·서버 게이트(B3)** 가 SSOT로 존재한다. 부족한 것은 **선택(마케팅) 가입 수집·동의 이력 원장·연령 확인 항목·약관 kind 확장(커뮤니티 정책 등)·어드민 회원별 동의 조회**이다.  
출시 P0 = **콘텐츠 필터/신고 갭 + 최소 연령 게이트 + 동의 화면·CMS 확장(기존 재사용)** . Parental Controls 전용 제품·중복 Legal 시스템은 **만들지 않는다.**

---

## 1. 공식 규정 대조 (2026-11 기준)

### 1.1 의무 구분 범례

| 구분 | 의미 |
|---|---|
| **A — Apple 심사 의무** | App Review 통과·유지에 필요. 미충족 시 거절·제거 위험. |
| **B — 법·규제 의무** | 적용 관할에서 법적 의무(상담 필요). 본 문서는 법률 자문이 아님. |
| **C — DIBAY 권장** | 심사/법 최소를 넘는 운영 안전·신뢰. Owner 선택. |

### 1.2 Apple

| 문서 | URL | 조항·요지 | 적용 | 시행 |
|---|---|---|---|---|
| App Review Guidelines | https://developer.apple.com/app-store/review/guidelines/ | **1.2 UGC**: (1) 게시 전 유해물 **필터 방법** (2) **신고** + timely response (3) **차단** (4) **공개 연락처**. NCII·AI 생성 포함 명시 강화(2026-10-16). | UGC·소셜·채팅 앱 = DIBAY 전부 | **시행 중 (A)** |
| Guidelines 업데이트 공지 | https://developer.apple.com/news/?id=vvzx6cul · https://developer.apple.com/news/?id=92th7e5i | 1.2 범위 명확화·Developer Code of Conduct 연동; §5 아동 착취 앱 제거 | 동일 | **2026-10-16 발표 (A)** |
| Age ratings definitions | https://developer.apple.com/help/app-store-connect/reference/app-information/age-ratings-values-and-definitions/ | Parental Controls · Age Assurance · UGC · Social · Under-13 social off · Messaging · Ads · Unrestricted Web | ASC 설문 | **시행 중 (A 설문)** |
| Social media questionnaire | https://developer.apple.com/news/?id=tlur8uvi | 소셜 능력 선언; Under-13 비활성 시 Time Allowance Social 제외 가능 | ASC · 2026-09부터 제출 시 응답 필수(공지) | **설문 가능 · 2026-09 제출 의무 (A)** |
| Time Allowances | https://developer.apple.com/news/?id=0d2gpmml | 소셜=예 → Social Time Allowance·최소 13+ 경향; Under-13 off + Declared Age Range 최소 | iOS 26+ 가족 기능 | **단계 시행 (A/제품)** |
| Age assurance Q&A | https://developer.apple.com/support/age-assurance/ | Declared Age Range: 전 세계 사용 가능·공유는 사용자 선택; **개발자가 앱 연령 제한 책임**; 법 의무 지역에서는 확인 필요. SDK **iOS 26.2+** (기능 확장 26.4/26.5) | iOS 네이티브 | **API 가용 (A 조건부·B 지역)** |
| Privacy (5.1) | Guidelines §5.1 | 수집 목적·최소 수집·계정 삭제 등 | 전 앱 | **시행 중 (A)** |

**Apple 1.2 해석 (설계용):**

- “filtering … from being posted” = **게시(타인에게 노출)되기 전** 검사 방법이 있어야 함. 완벽 ML이 필수는 아니나 **존재·설명 가능**해야 함.
- “timely responses” = 가이드 본문에 고정 시간(24h)은 없으나, 심사·거절 사례에서 **운영 응답**을 본다 → **SLA는 C이지만 A를 뒷받침**.
- Declared Age Range로 ASC 「13세 미만 소셜 비활성 = 예」를 고르려면 **최소 API 호출 + 소셜 비활성 + 연령적합 UGC**가 필요. API 없이 「예」는 **허위**.

### 1.3 필리핀

| 문서 | URL | 요지 | 구분 |
|---|---|---|---|
| Data Privacy Act of 2012 (RA 10173) | https://privacy.gov.ph/ (법령·IRR) | PIC 보안·투명성·목적 제한. 아동 전용 “디지털 동의 연령”은 법률에 **고정값 없음**(국회 개정안 논의). | **B** (적용 시) |
| NPC Advisory 2024-03 Child-Oriented Transparency | https://privacy.gov.ph/wp-content/uploads/2024/12/Advisory-2024.12.17-Guidelines-on-Child-Oriented-Transparency-w-SGD.pdf | **아동 = 18세 미만**. 아동 대상·아동이 **접근할 가능성** 있는 서비스에 아동 지향 투명성·위험 기반·CPIA 권고. 자문이지 새 벌칙 창설은 아니라고 FAQ. | **B 가이드 / C 실무** |
| FAQ (2024-12) | https://privacy.gov.ph/wp-content/uploads/2024/12/FAQs-Advisory-on-Guidelines-on-Child-Oriented-Transparency.pdf | 디지털 동의 연령은 Advisory로 정할 수 없음. | 참고 |

**설계 함의:** 제품이 **13+만 허용**해도 “likely accessed by children” 리스크는 남을 수 있음 → 연령 게이트·투명성·고위험 처리(채팅·이미지) 강화는 **C + B 리스크 완화**. 법률 확정은 **필리핀 변호사 자문(Owner)**.

### 1.4 한국 (추가 적용 가능)

| 문서 | URL | 요지 | 구분 |
|---|---|---|---|
| 개인정보 보호법 §22조의2 | https://www.law.go.kr/ (아동의 개인정보 보호) | **만 14세 미만** 개인정보 처리 시 **법정대리인 동의·확인** 의무. | **B** (한국법 적용 시) |
| 시행령 §17조의2 | 동의 확인 방법 7종 | 동의 확인 방법 규정 | **B** |

**설계 함의:** 최소 연령을 **13**으로 두면 한국법상 **13세(만 14 미만)** 구간이 생길 수 있음. 한국 이용자·한국법 적용 여부는 **Owner 법률 결정**. 옵션: (a) 최소 연령 **만 14세**로 상향 (b) 13–14 한국 이용자 법정대리인 동의 경로 (c) 한국법 비적용 전제 — **임의 단정 금지**.

### 1.5 연령 등급 설문(1단계) — 코드 근거 권장값 (재확인)

| # | 질문 | 권장 | 비고 |
|---|---|---|---|
| 1 | 유해 콘텐츠 차단 = **Parental Controls** | **아니요** | 보호자 전용 제한 UI 없음. UGC 필터≠Parental Controls |
| 2 | 나이 확인 = **Age Assurance** | **아니요** (현 상태) / 게이트 도입 후 **예** 가능 | 자기신고 DOB는 Age Assurance의 약한 형태; Apple 정의상 Declared Age Range·정부 ID 등과 구분하여 App Review notes에 명시 |
| 3 | 무제한 웹 | **아니요** | 자사 WebView 셸 |
| 4 | UGC | **예** | |
| 5 | 소셜 | **예** | |
| 6 | 13세 미만 소셜 비활성 | **아니요** (현 상태) | Declared Age Range + 서버 게이트 후만 「예」 검토 |
| 7 | 메시지·채팅 | **예** | |
| 8 | 광고 | **예** | |

---

## 2. 현재 구현 전수 조사 요약

### 2.1 재사용 가능 (중복 구현 금지)

| 영역 | 상태 | 근거 |
|---|---|---|
| 커뮤니티 금지어(부분일치) | **PARTIAL** | `findBannedWord` `lib/community-feed/community-ops-settings.ts:67–76` · posts/comments/neighborhood write |
| 거래·커뮤니티·메신저·모임·매장 신고 API | **EXISTS** | `reports` · `community_reports` · `community_messenger_reports` · `chat_reports` · `meeting_reports` · `store_reports` |
| 사용자 차단 SSOT | **EXISTS** (채팅·커뮤니티 피드) | `lib/social/user-block-ssot.ts` · send gate `assert-messenger-room-send-allowed.ts:119–136` |
| Admin 통합 신고·제재 원장 | **EXISTS** | `lib/admin-reports/*` · `/admin/reports` · domain queues |
| 제재 집행 | **EXISTS** | `assertCommunityWriteAllowed` · `assertTradeActivityAllowed` · `account_suspended` |
| 공개 연락처 | **PARTIAL** | `support@dibay.app` privacy/auth/delete · 고객센터 케이스 |
| 탈퇴 요청 | **EXISTS** | `/api/me/leave-request` · `account_deletion_*` |
| 약관 UGC 금지 문구 | **EXISTS** | legal CMS seed `20261019120000_app_legal_documents.sql` |
| 광고 제품 SSOT | **EXISTS** | `lib/ads/ads-canonical-product-ssot.ts` |
| 외부 링크 https-only CTA | **EXISTS** | `lib/destination/open-destination.ts` · destination-contract |

### 2.2 확인된 결함·갭

| ID | 결함 | 심각도 | 근거 |
|---|---|---|---|
| G1 | 거래 글·메신저·스토어 리뷰·프로필 텍스트에 **게시 전 콘텐츠 필터 없음** | **P0 (A 1.2)** | trade create sanctions only; messenger send no scan |
| G2 | 커뮤니티 금지어는 **목록 비면 무효**·단순 substring·이미지 미검사 | **P0/P1** | `findBannedWord`; ops default `banned_words: []` 가능 |
| G3 | 신고 UI 갭: 공개 프로필 `/u/[username]`, 매장 리뷰, 통화 기록, **광고 크리에이티브** | **P0** | store review i18n only (`store-review-flow-rv-fixes.test.ts`); ads no report |
| G4 | 차단 후 **거래 목록에 차단 판매자 글이 남을 수 있음** | **P0** | posts list에 block filter 미확인 |
| G5 | 신고 **SLA·우선순위 자동 강제 없음** | **P0 운영** | priority 컬럼은 chat 일부; due/SLA 없음 |
| G6 | 연령 수집·게이트·Declared Age Range **없음** | **P0 정책** | profiles에 birth 없음; signup=consent only |
| G7 | 독립 Community Guidelines URL **없음** | **P1 (C/A notes)** | terms/privacy만 |
| G8 | 이미지 NSFW/CSAM 자동 검사 **없음** | **P0 고위험 / P1 ML** | upload = resize/storage only |
| G9 | 「13세 미만 소셜 비활성」 ASC **예 불가** (API 없음) | **정책** | iOS grep 0건 |

### 2.3 도메인별 UGC 맵

| 도메인 | UGC | 필터 | 신고 | 차단 영향 | Admin 숨김 |
|---|---|---|---|---|---|
| 커뮤니티/Philife | 글·댓글·이미지 | 금지어 PARTIAL | EXISTS | 피드 EXISTS | EXISTS |
| 거래 | 글·이미지 | MISSING | EXISTS | 목록 **갭** | EXISTS |
| 메신저 1:1/그룹 | 메시지·미디어 | MISSING | EXISTS | 송신 EXISTS | EXISTS (CM) |
| 배달 주문 채팅 | 메시지 | MISSING | 경로 PARTIAL | 송신 계열 | PARTIAL |
| 매장 리뷰 | 텍스트 | MISSING | **UI MISSING** | n/a | admin hide EXISTS |
| 프로필 | 닉·아바타·bio | 형식만 | 사용자 단위 PARTIAL | PARTIAL | — |
| 광고 | 배너·팝업·boost | 운영 승인 일부 | **신고 MISSING** | n/a | admin ops |

---

## 3. 통합 유해 콘텐츠 필터 설계

### 3.1 원칙

1. **단일 서버 권한 경로** — 클라만의 필터는 우회로 보지 않음. 모든 write API에서 동일 정책.
2. **기존 `banned_words` / admin ops를 확장** — 새 병렬 엔진 테이블 남발 금지.
3. **허용 / 보류(hold) / 거절** 3단. 자동 정확도 **미검증 → PASS 금지**.
4. **채팅 본문은 기본 자사 서버만** 검사; 외부 API 전송은 Owner 승인 + 최소화 페이로드.
5. **CSAM·착취 의심은 자동 공개 보류 + 인간 우선 큐** (오탐 시 복원).

### 3.2 검사 대상 × 처리 (설계)

| 범주 | 1차(필수 P0) | 2차(P1·검증 후) |
|---|---|---|
| 욕설·괴롭힘·혐오 | KO/EN/TL **운영 금지어·정규화**(공백·특수문자·자모 치환 규칙) | 상용 텍스트 분류기 후보 평가 |
| 성적 착취·아동 착취 | 키워드·패턴 + **즉시 hold** | 이미지 CSAM/NSFW 벤더 (아래 비교) |
| 불법·사기·피싱 | 키워드 + URL 위험 리스트 | 링크 reputation |
| 개인정보 노출 | 전화·이메일·주민·카드 정규식 **경고/보류** | — |
| 스팸 | 기존 rate limit + 반복 문구 | — |
| 외부 링크 | https only 유지; 단축 URL 펼침은 P1 | — |
| 이미지 | P0: 업로드 시 **메타/크기**만 + 신고 우선 | P1: Vision API |

### 3.3 처리 파이프라인 (공통)

```
Client submit
  → Auth + sanctions gate (기존)
  → ContentSafety.evaluate(domain, payload)   // 신규 SSOT 모듈
       · ALLOW → 기존 insert
       · HOLD  → row status=pending_moderation (도메인 상태 필드 재사용 우선)
       · BLOCK → 4xx + 사용자 문구 + appeal CTA
  → (비동기) 이미지/링크 심화 검사 → HOLD→ALLOW/BLOCK
```

**신규 SSOT 위치(제안):** `lib/content-safety/`  
- `policy.ts` (카테고리·심각도)  
- `normalize-text.ts`  
- `evaluate-text.ts` (금지어 + 정규식)  
- `evaluate-link.ts`  
- `evaluate-image.ts` (stub → 벤더)  
- `write-gate.ts` (도메인 adapter만 — trade/community/messenger/review/profile)

**도메인 adapter만 추가**, 도메인별 복제 엔진 금지.

### 3.4 언어

| 언어 | P0 | 비고 |
|---|---|---|
| 한국어 | 필수 | 주 사용자 |
| 영어 | 필수 | |
| 타갈로그/필리핀어 | P0 기본 욕설·착취·사기 표 | 정확도 검증 전 “완전 지원” 표기 금지 |

### 3.5 외부 필터 벤더 (비교만 — **미선정**)

| 후보 | 강점 | 약점 | 국외이전·비용 | 결정 |
|---|---|---|---|---|
| 자사 금지어+정규식 | 통제·저비용·채팅 비전송 | 우회·이미지 약함 | 없음 | **P0 채택** |
| OpenAI Moderation | 텍스트·일부 이미지 | 영중점·지연·비용·메시지 유출 | 미국 전송 | **평가 과제** |
| Google Cloud Vision SafeSearch | 이미지 | 비용·개인사진 전송 | 국외 | **평가 과제** |
| AWS Rekognition | 이미지 | 동일 | 국외 | **평가 과제** |
| Hive / 전문 모더레이션 | UGC 특화 | 벤더 락·단가 | 국외 | **평가 과제** |

**Owner 승인 전 설치·계약 확정 금지.** 평가 KPI: 정밀도/재현율(샘플 라벨셋), p95 지연, $/1k, DPA 계약, 채팅 제외 가능 여부.

### 3.6 오탐·이의

- 사용자: 「검토 요청」→ 기존 support `appeal` 유형 재사용 (`support-category-registry` appeal).
- Admin: 원 결정 번복 + `report_actions` / sanction ledger에 감사 기록.
- 오탐률 목표·측정 전 **필터 정확도 PASS 보고 금지**.

---

## 4. 신고·차단·관리자 통합 (Apple 1.2)

### 4.1 목표 상태

| 요건 | 목표 |
|---|---|
| 모든 UGC에서 신고 | G3 갭 메움 (프로필·매장 리뷰·광고·통화 상대) |
| 차단 | 서버 강제 + **거래 목록 필터** 추가 |
| 접수 확인 | 기존 done 화면 유지 + 표준 토스트/시트 |
| Admin 큐 | 통합 원장 유지; 위험도 우선순위 규칙 추가 |
| SLA | 아래 표 (현실적) |
| 연락처 | `support@dibay.app` + 고객센터; ASC Review notes·앱 내 「신고·안전」안내에 동일 |

### 4.2 제안 SLA (운영 인력 전제 — Owner 확정)

| 위험 | 예 | 1차 응답 | 조치 완료 목표 |
|---|---|---|---|
| Critical | CSAM·착취·imminent 폭력·실명 협박 | **4시간** (PHT 영업+당직) | **24시간** 숨김/계정 |
| High | 노골적 성적·사기·혐오 | **24시간** | **72시간** |
| Normal | 욕설·스팸·분쟁 | **72시간** | **7일** |

- SLA는 **코드 타이머 + admin 대시보드**로 가시화(P0 운영). 미달 시 FAIL이지 자동 PASS 아님.
- 주말·1인 운영이면 Critical만 당직, 나머지는 공개 안내(“영업일 기준”) — **심사 notes에 명시**.

### 4.3 최소 권한

- 기존 admin permission 키(`reports`, domain scopes) 유지.
- Critical 숨김은 domain mod 권한; **계정 영구 정지**는 상위 역할만.
- 채팅 원문 열람은 신고 건 컨텍스트로 제한(전수 감청 UI 신설 금지).

### 4.4 구현 순서 (신고·차단)

1. 거래 목록·홈에 `fetchBlockedAuthorIdsForViewer` 적용 (기존 커뮤니티 패턴 재사용).  
2. `/u/[username]` · 매장 리뷰 · 광고 캐러셀에 기존 ReportActionSheet/API 연결.  
3. Admin 큐: severity 필드(신고 사유 매핑) + SLA 컬럼(뷰).  
4. 광고 신고는 Apple 2.5.18 정합(부적절 광고 신고).

---

## 5. 연령 확인·미성년자 보호

### 5.1 제품 정책 초안 (Owner 승인 필요 · **확정 전 적용 금지**)

| 항목 | 검토안 |
|---|---|
| 최소 연령 | **만 14세** 우선 검토(한국 §22조의2). 만 13은 Apple Social/Time Allowance와만 맞출 때 대안. |
| 수집 | **생년월일** 및/또는 「만 N세 이상」 체크(§16.3). 주민·정부 ID **비수집** |
| 검증 수준 | **자기신고** — “검증된 신원” **표현 금지** |
| 미확인 | 가입 완료·UGC·채팅·소셜 **불가** (서버 게이트) |
| 미만 | 계정 생성 거부 또는 즉시 차단 + 삭제 안내 |
| 플랫폼 | Web·Android·iOS **동일 서버 정책** |
| 가입 UX 연동 | §16 동의 화면과 **동일 P0** |

### 5.2 기존 vs 신규 회원

| 집단 | 처리 |
|---|---|
| 신규 | 온보딩에 DOB 단계 추가 → 서버 검증 → `age_attested_at` |
| 기존 | 유예 기간(Owner: N일) 후 soft gate → UGC/메신저 차단 → 강제 입력 |

### 5.3 DB (제안 — 승인 후)

`profiles`에 최소 컬럼만:

- `date_of_birth date null`
- `age_gate_status text` (`unverified` \| `ok` \| `blocked_underage`)
- `age_attested_at timestamptz`
- (선택) `age_attestation_method` = `self_declared` \| `apple_declared_range`

RLS·API: DOB는 **본인·admin만**. 공개 프로필에 나이 노출 기본 금지.

### 5.4 서버 게이트

`requireAgeGateOk(userId)`를 `assertCommunityWriteAllowed` / messenger send / trade create / review write 앞에 연결.  
클라 숨김만으로 우회 가능하면 **FAIL**.

### 5.5 Apple Declared Age Range — **Native Change Gate**

| | |
|---|---|
| 필요 조건 | iOS 26+ SDK, Xcode 26.2+, capability, `requestAgeRange` |
| 용도 | ASC 「Under 13 social disabled = 예」 또는 지역법 Age Assurance |
| 공유 거부·구 OS | **서버 self-declared DOB로 fallback** 또는 소셜 기능을 보수적으로 제한 — Owner 선택 |
| 표현 | API 결과 = Apple 계정 공유 연령대. **정부 신원 확인으로 과장 금지** |

**분리:** 웹/서버 DOB 게이트(P0)와 iOS Declared Age Range(네이티브 빌드·버전 bump)는 **별 커밋·별 승인**.

### 5.6 국가별

| 관할 | 설계 메모 |
|---|---|
| PH | 아동(18미만) 투명성·CPIA 권고; 13+ 금지로 처리량 감소. 자문 권장 |
| KR | 만 14미만 법정대리인 — 최소연령 14 상향 또는 별도 동의 플로우 Owner 결정 |
| Apple | 소셜 앱 → 설문·Time Allowance; Under-13 off는 API 전제 |

---

## 6. Parental Controls 판단

| 질문 | 답 |
|---|---|
| Apple Parental Controls ≠ UGC 필터? | **다름**. 전자는 보호자 도구, 후자는 1.2 필터. |
| 13+ 전면 금지 시 보호자 대시보드 필수? | **법적·ASC 필수 아님 (현 자료 기준)**. 「예」만 받으려 기능 추가 **금지**. |
| ASC 1번 권장 | **아니요** 유지 (전용 보호자 제어 미구현 시). |
| 권장 C | Screen Time·가족 공유는 OS에 위임; 앱은 연령 게이트 + 신고. |

---

## 7. 개인정보·성능·비용

| 주제 | 설계 |
|---|---|
| 필터 위치 | **서버(Vercel/Node API + 필요 시 백그라운드 잡)**. 클라 프리체크는 UX용만. |
| 채팅 | 기본 **자사 검사만**. 외부 ML 시 메시지 ID·해시·필요 시 텍스트 최소·보유 TTL·로그 마스킹. Owner 승인. |
| 최소 수집 | DOB만 연령용. 실명·정부 ID 연령용 강제 금지(별 제품 없으면). |
| 보관 | DOB: 계정 수명; 모더레이션 로그: 사유·액션 위주, 원문 최소·TTL(Owner: 예 180일). |
| 검사 실패 | **Fail-closed for Critical categories** (착취·CSAM 키워드); 일반 욕설은 fail-open+로그 후 수동 — Owner 선택. 기본 제안: Critical fail-closed, else fail-open with metric. |
| DB 부하 | 동기 금지어 O(텍스트); 이미지 비동기 큐. 메신저 hot path에 외부 HTTP 동기 호출 **금지**(P0). |
| 비용 | P0 ≈ 엔지니어링만. P1 Vision 예: 이미지 1k당 단가 × 일 업로드 — **측정 후**. 사용량 cap + admin kill switch. |
| 성능 | messenger/community p95 회귀 게이트 기존 verify와 충돌 시 비동기화. |
| 장애 | 필터 모듈 circuit breaker; 설정 플래그 `content_safety_mode=off\|text_only\|full`. |

---

## 8. UI/UX/CTA (기존 디자인 유지)

- 토큰: `--sam-primary` 그린 · 라이트 · `Sam.btn` · 터치 ≥44.  
- **신규 화면만 최소 추가:** 연령 입력(온보딩) · 게시 거절 사유 · 검토 중 배지 · 이의(기존 고객센터 appeal).  
- 신고/차단: 기존 `ReportReasonModal` / `ReportActionSheet` / More 메뉴 확장 — **새 디자인 시스템 금지**.  
- Admin: 기존 report list + severity/SLA 뱃지.  
- 카피: 한국어 우선, 과장(“완전 차단”“AI가 검증”) 금지.  
- Android·iOS·Web: 동일 웹 UI(Capacitor) — Declared Age Range만 iOS 네이티브 시트.

---

## 9. 검증 관문 (현재 상태 → 목표)

| # | 항목 | 현재 | 목표 PASS 조건 |
|---|---|---|---|
| 1 | Apple 1.2 | **PARTIAL** (필터 약함·갭) | 전 write 텍스트 필터 + 전 UGC 신고 + 차단 목록 정합 + 연락처 |
| 2 | 연령 정책 | **FAIL/없음** | 서버 게이트 + 약관/privacy 수치 일치 |
| 3 | 서버 필터 | **PARTIAL** | 공통 evaluate + 도메인 adapter; 정확도는 별도 라벨 평가 **NOT_PROVEN→측정** |
| 4 | 신고·차단 | **PARTIAL** | G3·G4 해소 |
| 5 | Admin | **PARTIAL** | SLA 가시화 + Critical 경로 |
| 6 | 개인정보 | **PARTIAL** | DOB 최소·삭제·마스킹 |
| 7 | Web/Android/iOS 일치 | 웹 동일 / AgeRange **미구현** | 서버 동일; iOS API는 Native Gate |
| 8 | 운영 DB | 마이그레이션 미적용 | Owner 승인 후 적용 증거 |
| 9 | 성능·비용 | **NOT_PROVEN** | p95·$ cap 대시보드 |
| 10 | ASC 설문 | 권장값 §1.5 | 구현 후 2·6번 재평가 |

**테스트 시나리오(구현 후):** 정상 게시 · 금지어 · 우회 변형 · 이미지 위반 · 차단 우회 · 미성년 DOB · API 직접 호출 · 동시 신고 · 필터 장애 fail 모드 · 복구 · 오탐 appeal.

코드 PASS ≠ Production PASS.

---

## 10. 단계별 구현 순서 (승인 후)

### P0 — 출시 필수 (Apple 1.2 + 최소 연령 + 가입 동의)

1. **ContentSafety 텍스트 SSOT** + 커뮤니티 금지어 이관·강화 + trade/messenger/review/profile write 연결.  
2. **신고 갭** (프로필·매장 리뷰·광고) + **거래 목록 차단 필터**.  
3. **Admin severity + SLA 표시** + Critical runbook(문서).  
4. **약관/privacy** 최소 연령·UGC·연락처 문구 정합.  
5. **가입 동의 P0 (§16):** 연령 확인 항목 · 마케팅 선택(기존 마케팅 계획과 통합) · 동의 이력 append-only · 어드민 회원 동의 조회 · (선택) community_guidelines kind.  
6. **자기신고 DOB 또는 연령 확인 체크 + 서버 age gate** (네이티브 API 없이) — Owner가 확정한 최소 연령.  
7. App Review notes 체크리스트(필터·신고·차단·연락처·동의 경로).

### P1 — 운영 안정

1. 이미지 비동기 검사 벤더 PoC(정확도·비용 리포트 후 선정).  
2. 링크 reputation.  
3. Community Guidelines 공개 페이지.  
4. 신고자/피신고자 알림 템플릿 정교화.  
5. 필터 메트릭·오탐 대시보드.

### P2 — 선택

1. **Declared Age Range** (Native Gate) → ASC 6번 「예」 재검토.  
2. Parental Controls 제품화 — **기본 비추** (13+ 정책 시).  
3. 다국어 분류 ML.  
4. 한국 14세 법정대리인 플로우(법률 결정 시).

---

## 11. 회귀 위험

| 변경 | 위험 | 완화 |
|---|---|---|
| 메신저 send에 동기 외부 API | 지연·실패 폭주 | 동기 금지; 텍스트 로컬만 |
| HOLD 상태 신설 | 목록·Realtime 깨짐 | 기존 status enum 재사용 우선 |
| DOB 강제 | 기존 회원 이탈 | 유예 기간·명확 카피 |
| 금지어 과도 | 정상 거래 용어 차단 | 도메인 allowlist·이의 |
| 통화 코드 혼입 | 통화 회귀 | **통화 파일 비터치** (별 규정) |
| 네이티브 AgeRange | 빌드·버전 | Native Gate + `native:prepare` |

---

## 12. 예상 비용 (개략 · 미검증)

| 항목 | 추정 | 상태 |
|---|---|---|
| P0 엔지니어링 | 중(수 주, 범위·인력 의존) | 일정 Owner |
| P0 인프라 | 낮음(기존 API) | |
| P1 Vision/Moderation | 사용량 비례 $/월 | **PoC 후** |
| 운영 인력 | Critical 당직 ≥1 | SLA 전제 |
| 법률 자문 PH/KR | 외부 | **권장** |

---

## 13. Owner 결정 사항 (구현 전 필수)

1. **최소 연령:** 만 **14세(검토안)** vs 만 13 — **확정 전 코드 적용 금지.**  
2. 연령 확인 UX: **DOB 입력** vs **「만 N세 이상입니다」 체크** vs 병행.  
3. **기존 회원** 연령·동의 유예 일수.  
4. **마케팅:** 가입 화면 선택 체크 도입 + 기존 회원 기본값(기존 Owner 지시: 기존=ON 검토) 재확인.  
5. **커뮤니티 운영정책:** 가입 필수 체크 vs `/terms` 내 고지 vs 별도 kind.  
6. **위치·거래·배달 약관:** 가입 비표시·기능 시점 고지 **확정**(권장).  
7. **필터 fail 정책** · 채팅 외부 ML · 이미지 PoC · ASC 6번 · Parental Controls · SLA · PH/KR 자문 · DB 적용 시점 (기존과 동일).

---

## 14. 산출물 체크리스트

| 항목 | 본 문서 |
|---|---|
| Apple 필수 | §1.2 · §9 |
| 현재 구현(안전) | §2 |
| 가입·동의 감사 | **§16** |
| 결함 | §2.2 · §16.2 |
| 필수·선택·고지표 | **§16.3** |
| UI/UX 동의 | **§16.4** |
| Admin 약관 | **§16.5** |
| 서버·DB 동의 | **§16.6** |
| 기존 회원 전환 | **§16.7** |
| 네이티브 | Declared Age Range = 별 Gate |
| 구현 순서 | §10 · §16.9 |
| Owner 결정 | §13 · §17.11 |
| HTML 시안 | **§17.0** `consent-ux-ssot-mockup-2026-11-05.html` |
| 레거시 비교 | §17.1 |

---

## 15. 명시적 비범위

- 통화(CallKit/FCM/Agora) 시그널링 변경  
- 임시 “심사만 통과” 더미 필터  
- 필터 정확도 미측정 PASS  
- 벤더 무조건 선정  
- Parental Controls를 설문용으로만 추가  
- 자기신고 DOB를 “본인인증 완료”로 카피  
- **병렬 Legal CMS / 동의 엔진 신설**(기존 `app_legal_documents`·`legal-consent` 재사용)  
- 카카오·네이버·당근·배민 **실기 UI를 확인했다고 허위 보고** (원칙만 §16.4.1)

---

## 16. 회원가입 동의·약관·관리자 운영 SSOT (P0 추가)

### 16.1 현재 가입·동의 구조 (코드 근거)

```
OAuth/이메일/카카오 등 로그인 성공
  → 세션 있음 · signupComplete = consentComplete ONLY
       (lib/auth/dibay-signup-status.ts:142–150)
  → 미동의: /auth/onboarding/terms (AuthConsentForm)
       · 체크: 이용약관 · 개인정보처리방침 (필수 2)
       · 전체동의·마케팅·연령·위치·거래·배달 체크: 없음
       · 상세: /terms · /privacy (target=_blank)
       · CTA: 둘 다 체크 시 활성 · inFlight 중복 방지
  → PATCH /api/me/legal-consent
       · 서버: resolveRequiredConsentVersionsStrict
       · profiles.terms_/privacy_{accepted_at,version} 기록
       · 화면 버전≠필수 → 409 consent_version_stale
       · 이미 동의 → idempotent
  → 이후 @id / 닉네임 / 주소 / 전화(기능별) — 동의와 분리
재로그인: 버전이 맞으면 동의 화면 스킵
버전 개정(CMS 새 version 문자열): hasStoreTermsConsent false → 재동의
Android·iOS·Web: 동일 웹 온보딩(Capacitor)
```

| 항목 | 상태 | 근거 |
|---|---|---|
| 공급자별 다른 동의 UI | **없음** (공통) | AuthConsentForm · dibay-signup-status |
| 필수 terms+privacy | **EXISTS** | AuthConsentForm.tsx:144–171 · legal-consent:61–63 |
| 전체 동의 | **MISSING** | |
| 서버 검증 | **EXISTS** | legal-consent + B3 mutation gate |
| 버전·재동의 | **EXISTS** | hasStoreTermsConsent · CMS version |
| 동의 철회(필수) | **MISSING** (회원) | 마케팅 off만 설정에서 가능 |
| 동의 이력 테이블 | **MISSING** | profiles 현재값만 |
| Legal CMS | **EXISTS PARTIAL** | terms/privacy · draft/publish · effective_at · audit_logs · **diff/회원조회 없음** |
| 마케팅 가입 수집 | **MISSING** | 내정보 알림 설정만 (marketing plan 2026-11-03) |
| 연령 확인 | **MISSING** | |
| 위치/거래/배달 가입 동의 | **MISSING** (권장: 기능 시점) | OS geo만 |

계약 원문: `docs/dibay-first-entry-legal-consent-ssot.md`.

### 16.2 확인된 결함 (동의 도메인)

| ID | 결함 | 심각도 |
|---|---|---|
| C1 | 가입에 **연령 확인 없음** (출시·한국법 리스크) | P0 |
| C2 | **마케팅 선택**이 가입에 없고 설정에만 있음 — Owner 지시 계획과 미정렬 | P0 |
| C3 | **동의 이력 append-only 없음** — 과거 위조 방지·감사 약함 | P0 |
| C4 | 어드민 **회원별 동의 조회** 없음 | P0 |
| C5 | Legal kind가 terms/privacy만 — 커뮤니티 정책·마케팅 문서 kind **미확장** | P0/P1 |
| C6 | 문서 **버전 간 diff UI** 없음 | P1 |
| C7 | 전체 동의 UX 없음 (필수만이면 선택적) | P2 UX |
| C8 | 필수 약관 **회원 철회** 경로 없음 (탈퇴로만 정리) | 정책 결정 |
| C9 | PATCH에 버전 미동봉 시 stale 검사 생략(구 클라) | P1 hardening |

### 16.3 필수·선택·고지 최종 권장표

| # | 항목 | 분류 | 시점 | 구현 방식 | 비고 |
|---|---|---|---|---|---|
| 1 | 서비스 이용약관 | **필수 동의** | 가입 | 기존 체크+CMS terms | 유지 |
| 2 | 개인정보 수집·이용(처리방침) | **필수 동의** | 가입 | 기존 체크+CMS privacy | 유지 |
| 3 | 커뮤니티 운영정책 | **고지 또는 필수(Owner)** | 가입 | 권장: terms 내 섹션 **또는** kind=`community_guidelines` 체크 | 체크 남발 금지 — Owner 선택 |
| 4 | 만 N세 이상·연령 확인 | **필수** (제품) | 가입 | 체크 및/또는 DOB — **Owner 확정 연령** | 자기신고≠신원확인 |
| 5 | 위치정보·위치기반 | **기능 시점 고지/OS 권한** | 지도·주소 사용 시 | 가입 체크 **비권장** | OS permission + 안내 |
| 6 | 중고거래 정책 | **고지** | 거래 글쓰기/구매 시 또는 terms 내 | 가입 체크 비권장 | |
| 7 | 배달 이용정책 | **고지/주문 시점** | 주문 전 | 가입 체크 비권장 | 기존 주문 약관·스냅샷 유지 |
| 8 | 마케팅 정보 수신 | **선택 동의** | 가입+내정보 | CMS kind=`marketing` + 체크(기본 OFF 신규) | 기존 계획 재사용 |
| 9 | 광고성 푸시 | **선택** (8과 동일 축) | 가입/설정 | `marketing_enabled` SSOT 1축 | 이중 토글 정리(기존 계획) |
| 10 | 이메일·SMS 마케팅 | **선택** | 설정 우선 | 채널별 필드 — 가입에 과다 노출 금지 | SMS 전용 **현재 MISSING** |
| 11 | 맞춤형 광고 | **선택/고지** | 설정 또는 privacy 고지 | 가입 체크 비권장(필리핀·한 법률 자문) | |

**원칙:** 법률상 동의 ≠ 무조건 체크박스. 고지로 충분한 항목은 약관·화면 고지. 위치·거래·배달은 **기능 사용 시점**.

### 16.4 UI/UX/CTA 설계

#### 16.4.1 레거시 UX 원칙 (외부 앱 실기 미확인 — 원칙만)

카카오·네이버·당근·배민 **실기 화면은 본 감사에서 열람하지 않음 → PASS/동일 복제 주장 금지.**  
업계에서 반복되는 원칙만 채택:

- 필수/선택 라벨 분리 · 전체 동의는 편의(선택 항목까지 묶을 때 개별 해제 가능)  
- 선택 거부해도 가입 CTA 활성  
- 전문 보기 후 체크 상태 유지  
- 가입 화면에 항목 과다 배치 금지  

#### 16.4.2 DIBAY 동의 화면 (기존 셸 유지)

`DibayOnboardingOverlayShell` + 그린 CTA 유지.

```
[서비스 이용 동의]
필수
 ☐ [필수] 이용약관 동의  · 보기
 ☐ [필수] 개인정보처리방침 동의  · 보기
 ☐ [필수] 만 N세 이상입니다  (또는 DOB 필드 — Owner)
선택
 ☐ [선택] 혜택·이벤트 알림 받기  · 보기   ← 기본 미체크
(고지 한 줄) 위치·거래·배달은 해당 기능 이용 시 안내됩니다.
[동의하고 계속하기]  ← 필수만 충족 시 활성
```

| UX 규칙 | 내용 |
|---|---|
| 전체 동의 | P2 — 추가 시 개별 체크와 양방향 동기; **필수가 아니면 생략 가능** |
| 상세 보기 | 기존처럼 `/terms` `/privacy` (및 `/legal/marketing`) — 새 탭/시트 후 **체크 유지** |
| 미동의 CTA | disabled + `auth_consent_*_required` 정확 문구 |
| 로딩·중복 | `submitting` + `inFlightRef` 유지 |
| 터치 | ≥44 · safe-area · 키보드와 CTA 겹침 방지(기존 온보딩 셸) |
| 가로/세로 | 동일 웹 반응형 — 불필요 재설계 금지 |
| 대비 | sam 토큰 · 에러 `role=alert` |

### 16.5 관리자 약관 운영 설계 (기존 CMS 확장)

**재사용:** `/admin/app/legal` · `app_legal_documents` · `AdminAppLegalDocumentForm` · `audit_logs legal_document.*` · settings 권한.

| 기능 | 현재 | 설계 |
|---|---|---|
| 목록·상세·초안·게시·중지 | EXISTS | 유지 |
| 버전·시행일(effective_at) | EXISTS | 유지 |
| ko/en | EXISTS | 유지 |
| kind 확장 | terms/privacy만 | + `marketing` (기존 계획) · + `community_guidelines`(Owner) |
| 필수/선택 메타 | MISSING | kind 또는 `consent_role`: `required` \| `optional` \| `notice` — **변경 시 사유·승인 강제** |
| 재동의 필요 | 버전 문자열 | 유지 + 게시 확인 문구(기존) |
| diff | MISSING | P1: 버전 A/B 본문 비교 |
| 회원 동의 조회 | MISSING | 회원 상세에 terms/privacy/marketing/age 현황 + **이력 테이블 링크** |
| 마케팅 채널 | 알림 설정 | 회원 설정 SSOT + 캠페인 eligibility (기존 계획) |
| 이력 위변조 | profiles 덮어쓰기 | **append-only consent_events** — UPDATE/DELETE 금지(또는 admin 불가) |

필수↔선택 변경: `settings` 권한 + 변경 사유 필수 + audit. **과거 consent_events 행 수정으로 현재 동의 위장 금지.**

### 16.6 서버·DB SSOT

| 계층 | SSOT |
|---|---|
| 필수 버전 | `resolveRequiredConsentVersions*` (기존) |
| 동의 판정 | `hasStoreTermsConsent` 확장 또는 `hasRequiredConsents(profile, required)` — age+terms+privacy |
| 기록 API | `PATCH /api/me/legal-consent` 확장 (marketing optional · age attestation) |
| Mutation 게이트 | B3 `member-consent-mutation-policy` 유지 |
| 클라 신뢰 금지 | 체크만으로 complete 금지 — 서버 기록 필수 |

**DB (승인 후 · 기존 우선):**

1. `profiles` — 기존 terms/privacy 유지 + `date_of_birth`/`age_gate_status`/`age_attested_at`(연령 설계와 통합).  
2. `user_notification_settings` — 마케팅 동의 시각·source·version (마케팅 계획 재사용).  
3. **신규** `member_consent_events` (append-only):  
   `id, user_id, kind, version, action(agree|withdraw|admin_note), source(signup|reconsent|settings|migration), created_at, actor_admin_id null`  
4. `app_legal_documents.kind` CHECK 확장.  
5. 롤백: kind 확장 마이그레이션은 하위 호환; events 테이블 drop은 최후.

중복 제출: 기존 idempotent 유지. 철회: 선택(마케팅)만 즉시 settings off + event; 필수 철회=서비스 이용 불가(재동의 화면) — **탈퇴와 구분**.

연령 게이트 ↔ `signupComplete`: **동의 완료에 age_ok 포함**할지, 동의 후 별도 age step인지 Owner 결정. 권장: **같은 동의 화면에서 age 확인 후 한 번의 PATCH**로 원자 기록.

### 16.7 기존 회원 전환

| 규칙 | 내용 |
|---|---|
| 자동 간주 금지 | 구 동의를 신 약관·신 연령으로 **자동 동의 처리 금지** |
| terms/privacy | 버전 일치 시 유지; CMS 새 version 시 **기존 재동의 게이트** 그대로 |
| 연령 | 미기록 = `unverified` → 유예 후 UGC/쓰기 차단(콘텐츠 설계 §5와 동일) |
| 마케팅 | Owner 기존 지시(기존 ON) 재확인 후 1회 migration + event `source=existing_member_default` — **승인 전 실행 금지** |
| 선택 기본값(신규) | OFF |
| 재동의 UI | 기존 `/auth/onboarding/terms` 재사용(필드만 확장) |
| 거부 시 | 필수 거부 = 쓰기 차단(B3)·읽기 정책 기존 유지; **진행 중 통화·주문은 B3 예외 유지** |
| 데이터 보호 | 거래·채팅·주문 스냅샷 삭제 금지 |

### 16.8 Apple·PH·KR 대조 (동의)

| 규정 | 함의 |
|---|---|
| Apple 5.1 / 계정 | 동의·삭제 경로 유지; 연락처 공개 |
| Apple 연령 설문 | Age Assurance 도입 후 설문 2번 재평가 |
| PH DPA | 목적·투명성; 마케팅은 선택·철회 가능해야 함 |
| KR §22조의2 | 만 14세 미만 법정대리인 — **최소연령 14 검토안**과 정렬 시 가입 차단으로 회피 가능(자문) |

### 16.9 구현 단계·회귀 (동의)

**P0:** AuthConsentForm 확장 · legal-consent API · age 필드 · marketing kind+가입 체크 · consent_events · 회원 어드민 조회 · privacy/terms 문구.  
**P1:** diff UI · community_guidelines kind · C9 버전 강제 동봉 · SMS 채널.  
**P2:** 전체 동의 UX.

**회귀:** 미동의 mutation 403 · 버전 stale 409 · 재로그인 스킵 · 마케팅 OFF 캠페인 제외 · 통화/주문 예외 · Capacitor 동의 화면 · 기존 CMS 게시 경로.

---

**다음 단계:** Owner가 §13(+§16.3 표)·§17 시안을 확인·승인하면 P0를 티켓으로 쪼개 구현한다. **본 문서·시안 승인 전 코드/DB/네이티브 수정 없음.**

---

## 17. UI/UX/CTA SSOT · 레거시 실물 비교 · HTML 시안 (2026-11-05)

### 17.0 시안 파일 (필수)

| 산출물 | 경로 |
|---|---|
| **통합 HTML 시안** | [`docs/audit/consent-ux-ssot-mockup-2026-11-05.html`](./consent-ux-ssot-mockup-2026-11-05.html) |

시안에서 전환 가능: 기기 4종 · 화면 10종 · 가입 상태 10종. **API/DB 미호출.** 시안 PASS ≠ 실기기 PASS.

### 17.1 레거시 앱별 실물 비교

| 앱 | 확인 플랫폼 | 버전/근거 | 확인 범위 | UI·동작 요지 | DIBAY 적용 | 미적용 이유 |
|---|---|---|---|---|---|---|
| **카카오** | 공식 문서(웹) | [developers.kakao.com 로그인·싱크](https://developers.kakao.com/docs/ko/kakaologin/prerequisite) · [싱크 FAQ](https://developers.kakao.com/docs/ko/kakaosync/faq) · 2026-11-05 열람 | 간편가입·필수/선택 약관·만14세 연령동의 추가·동의 미리보기·재동의 API | 필수/선택 약관 등록, 연령 동의 항목, 선택만으로는 추가동의 화면 미표시 | **적용:** 필수/선택 구분·연령 항목·버전 기반 재동의 | 카카오 계정 UI 복제 안 함 |
| **카카오톡 앱 네이티브** | — | — | 최초 가입 실화면 | — | — | **NOT_PROVEN** (실기기 조작 Owner 승인 전 금지) |
| **네이버** | **웹 실물** | [nid.naver.com 가입 동의](https://nid.naver.com/user2/join/agree?lang=ko_KR) 2026-11-05 WebFetch | 전체 동의 구조·필수 이용약관·선택(실명/위치/개인정보 수집)·이벤트·혜택·어린이 안내·수집고지 | 「회원가입을 위한 약관 동의가 필요해요」·[필수] 이용약관+보기·선택 다수·위치약관이 가입에 포함·개인정보 수집 고지 블록 | **적용:** 필수 라벨·보기 링크·선택 거부 가입·수집 고지와 동의 구분 | **미적용:** 가입 시 위치약관(DIBAY는 기능 시점)·과도한 선택 항목 |
| **당근** | 공식 privacy + 2차 글 | [privacy-policy.daangn.com](https://privacy-policy.daangn.com/previous_pp/20230320/) · 블로그 가입 절차(비공식) | 마케팅=선택·설정에서 철회 경로 공식; 가입 화면 체크 구성은 블로그 | 필수 약관+마케팅 선택+만14세 확인(블로그) · 마케팅 철회: 나의당근>설정>푸시>마케팅 | **적용:** 마케팅 선택·내정보 철회·연령 확인(검토) | 네이티브 가입 UI **NOT_PROVEN**(앱 미조작); 블로그는 보조만 |
| **배달의민족** | — | — | — | — | — | **NOT_PROVEN** |
| **토스** | — | — | — | — | — | **NOT_PROVEN** |

**검증된 공통 UX (공식문서·네이버 웹만 근거):**

1. 필수/선택 시각 구분  
2. 전문 「보기」  
3. 선택 거부해도 가입 가능  
4. 연령(만 14) 관련 항목 존재(카카오 문서·당근 정책/블로그)  
5. 마케팅은 선택·이후 설정에서 변경  
6. 약관 변경 시 필수면 재동의  

### 17.2 DIBAY 현재 화면과의 차이

| 영역 | 현재 | 목표(시안) |
|---|---|---|
| 가입 `AuthConsentForm` | 필수 2(약관·개인정보)만 · 전체동의 없음 · 연령/마케팅 없음 · 보기=`_blank` | 전체동의(편의) · 필수+연령 · 선택 마케팅 · 시트/인앱 전문(체크 유지) |
| 내정보 `MyPolicyHub` | 약관·개인정보·사업자 3행 | **약관 및 개인정보** 허브: 전문·동의내역·마케팅·(위치 OS) 확장 |
| 마케팅 | 알림 설정 토글만 | 가입 선택 + 내정보 명확 ON/OFF + 이력 |
| Admin legal | CRUD·버전·감사 | + 정책 표·회원 동의 이력·diff(P1)·시행본 삭제 금지 |
| CTA | 온보딩 primary 유지 | 동일 토큰 · sticky + safe-area |

### 17.3 최종 권장 UI 구조

```
가입: 전체동의 → [필수] 이용약관 / 개인정보수집·이용 / 연령(검토안)
              → [선택] 마케팅
              → sticky CTA「동의하고 계속하기」(필수만으로 활성)
내정보 › 약관 및 개인정보 → 전문 · 동의내역 · 마케팅 · 위치(OS)
Admin › /admin/app/legal → 문서 · 정책 · 회원상세 동의탭
```

개인정보**처리방침**(고지) vs **수집·이용 동의**(필수 체크)를 라벨로 구분. 처리방침 URL(`/privacy`)은 고지·열람, 체크 문구는 「수집·이용 동의」.

### 17.4–17.7 시안 화면·기기

HTML 시안 내 전환. 기기:

| 기기 | viewport(시안) | safe | 검증 |
|---|---|---|---|
| iPhone 세로 | 390×844 | 47/34 | CTA·시트 |
| Android 세로 | 384×832 | 28/24 | 동일 |
| Tablet 가로 | 1024×680 | 20/16 | max-width 640 |
| Windows/Web | 1120×720 | 0/0 | 마우스·키보드 |

### 17.8 CTA 전체 동작표

| CTA | 화면 | 예정 동작 |
|---|---|---|
| 동의하고 계속하기 | 가입/재동의 | `PATCH /api/me/legal-consent` (terms+privacy+age[+marketing]) |
| 보기(약관/개인정보/마케팅) | 가입 | 인앱 시트 또는 `/terms` `/privacy` `/legal/marketing` · 체크 유지 |
| 마케팅 토글 | 내정보 | `PATCH /api/me/notification-settings` + consent_events |
| 초안 저장/게시 | Admin | 기존 admin legal API · 사유 필수 |
| 정책 승인 요청 | Admin 정책 | 즉시 토글 금지 · 감사 로그 |
| 회원 동의 | Admin 회원 | **조회만** · 대리 동의 금지 |

### 17.9 서버·DB 연결표

관리자 게시(`app_legal_documents`) → `resolveRequiredConsentVersions` → 가입/재동의 UI → `legal-consent` → `profiles` + **`member_consent_events` append-only** → Admin 회원상세 조회.  
마케팅 ON/OFF → 캠페인 eligibility(기존 계획). **기존 회원 마케팅을 근거 없이 ON 간주하지 않음**(Owner 별도 승인 데이터 작업만).

### 17.10 기존 회원 영향

- terms/privacy: 버전 불일치 시 재동의 화면(시안 10)  
- 연령 미기록: 유예 후 게이트(§5)  
- 마케팅: 현 설정값 유지 · 강제 ON 금지  
- 진행 중 통화·주문: B3 예외 유지  

### 17.11 미확인 · Owner 결정

| 항목 | 상태 |
|---|---|
| 카톡·당근·배민·토스 **네이티브** 동의 UI | **NOT_PROVEN** |
| 최소 연령 숫자·DOB vs 체크 | Owner (§13) |
| 개인정보 체크 문구(수집·이용 vs 처리방침 동의) | 법률 검토 후 확정 |
| 커뮤니티 운영정책 별도 kind | Owner |
| 기존 회원 마케팅 일괄 ON | **금지 기본** · 이전 지시와 충돌 시 Owner 재확인 |
| 시안 승인 후 구현 | Owner |

### 17.12 구현 범위·회귀·검증

- **범위:** AuthConsentForm·MyPolicyHub 확장·legal-consent·consent_events·Admin 회원탭·marketing kind — **병렬 CMS 금지**  
- **회귀:** B3 게이트·버전 stale·알림 설정·탈퇴·통화/주문 예외  
- **검증:** 시안 상태 매트릭스 → 구현 후 Android/iPhone/Tablet/Web 실기기(별도 Owner 시나리오) · 코드 PASS≠Production PASS  

### 17.13 UI 토큰 SSOT

- 색: `--sam-primary` / `#0B421A` · 앱 BG `#FFFCFC`  
- 체크·토글·CTA: 기존 onboarding / MyToggle / Overlay primary  
- 터치 ≥44 · 본문 대비 4.5:1 목표  
- 화면별 신규 CSS 복제 금지 — 시안은 토큰 반영 프로토타입
