# DIBAY ASSET CONTRACT

| Field | Value |
|-------|--------|
| Version | **v1.1** |
| Status | **FROZEN SSOT** (v1.1 Amendment: AST-004 / AST-005) |
| Type | Asset Definition (최상위 계약) |
| Effective | 2026-08-07 |
| Supersedes | Phase 1 drafts v1.1–v1.3 |
| Code changes in this doc | 0 (definition only) |

---

> **이 문서는 자산(Asset)의 정의와 경계를 확정하기 위한 계약 문서이다.**  
> **현재 구현의 사용처는 계약이 아니다.**  
>  
> 현재 구현은 감사(Evidence)의 대상이며,  
> 향후 사용처 결정은 별도의 **Usage Contract**에서 확정한다.  
>  
> 따라서 본 문서는  
> 기능 추가, 정책 결정, 사용처 확대, 비즈니스 정책을 포함하지 않는다.

---

## Frozen posture

```text
이 문서는 FROZEN SSOT이다.

본문을 키우거나 사용처·정책을 덧붙이지 않는다.
변경이 필요하면 ARTICLE — Asset Amendment Rule 만 따른다.

이후 내용은 Usage Contract / Implementation Contract 에서만 늘어난다.
모든 기능·구현은 이 SSOT를 참조하고 우회하지 않는다.
```

---

## 0. 최상위 원칙

### 0-1. 지위

```text
Asset Contract는 DIBAY의 최상위 계약이다.

새로운 기능이 추가되더라도
Asset Contract를 먼저 변경하지 않는다.

새로운 기능은 반드시
Asset Contract를 준수한 상태에서

  Usage Contract
  → Implementation Contract

순으로 진행한다.

Asset Contract를 우회하는 구현은 금지한다.
```

### 0-2. Asset ≠ Usage

```text
Asset Contract  ≠  Usage Contract
```

### 0-3. 플랫폼 순서 (immutable)

```text
DIBAY PLATFORM

  Asset Contract          ← 본 문서 (FROZEN)
      ↓
  Usage Contract
      ↓
  Implementation Contract
      ↓
  Runtime Verification
      ↓
  Product PASS
      ↓
  Hard Lock
```

이 순서는 변경하지 않는다.

---

## 1. Asset (최상위 개념)

**Asset** = 잔액·원장·소유 권위를 가질 수 있는 가치 단위의 최상위 개념.

```text
Asset
├── AST-001  D-Point
├── AST-002  Business Credit
└── AST-003  Settlement
```

| 규칙 | 내용 |
|------|------|
| 각 Asset | 자체 authority · 잔액 · 원장 · writer 경계 |
| Asset 간 | 합산·동일 원장·자동 전환·암묵 상계 기본 금지 |
| 참조 | Usage / Implementation / 감사 / migration 문서는 **Asset ID**로 참조 |

---

## 2. Asset ID Registry

| Asset ID | 명칭 (현행) | Authority | 상태 |
|----------|-------------|-----------|------|
| **AST-001** | D-Point | `user_id` (member_id) | Active |
| **AST-002** | Business Credit | `store_id` | Active |
| **AST-003** | Settlement | `store_id` (+ settlement keys) | Active |
| **AST-004** | Store Points (Economic) | `store_id` | Active |
| **AST-005** | Business Cash | `store_id` | Active |

- 다음 신규 ID: `AST-006`부터 순번.
- **Amendment 2026-09-01 (Delivery Ads Stage 1):** AST-004 / AST-005 발급. AST-002·Gift Store Cash·`delivery_ad_accounts`와 혼동·재사용 금지.
- Retired ID도 Registry에 영구 유지. **재발급·재사용 금지.**

### ARTICLE — Immutable Identity

```text
Asset ID는 명칭이 변경되어도 유지된다.

예)
  AST-002
    Store Credit
    → Business Credit
    → Biz Credit

이름은 바뀔 수 있으나
AST-002는 영구적으로 동일 Asset을 의미한다.

문서 · 코드 주석 · 감사 · 마이그레이션 · Usage 참조는
명칭이 아니라 Asset ID를 추적 키로 사용한다.
```

---

## 3. 확정 Asset 정의

### AST-001 D-Point

| 항목 | 계약 |
|------|------|
| 의미 | 일반 회원 **개인 자산** |
| Authority | `user_id` (= member_id) |
| 앱 | 내정보 → D-Point |
| Admin | 회원 / 고객 플랫폼 → D-Point 관리 |

### AST-002 Business Credit

| 항목 | 계약 |
|------|------|
| 의미 | 개별 매장 **운영 자산** |
| Authority | `store_id` |
| 성격 | 오너 개인 자산 아님 · 다매장 시 매장별 분리 |
| 앱 | 매장 관리 → Business Credit |
| Admin | 매장 → Business Credit 관리 (AST-003과 형제, 동일 잔액 아님) |

### AST-003 Settlement

| 항목 | 계약 |
|------|------|
| 의미 | 매장 매출 **정산금** |
| Authority | `store_id` (+ settlement keys) |
| 본 문서 | 정산 정책 전체는 다루지 않음. AST-001 / AST-002와 **비혼합**만 고정 |

### AST-004 Store Points (Economic)

| 항목 | 계약 |
|------|------|
| 의미 | 매장 경제/매출 파생 **매장 포인트** (임의 충전 금지 · Business Cash 전환 가능) |
| Authority | `store_id` |
| 금지 | AST-002로 동일시 · member points · 임의 Owner recharge를 잔액 authority로 사용 |
| 비고 | Gift/Settlement 유입 writer는 별도 Usage/Impl. Asset 정의만 본 조항. |

### AST-005 Business Cash

| 항목 | 계약 |
|------|------|
| 의미 | 매장 운영 **소비 잔액** (직접 충전 · SP 전환 입금 · 출금 금지 · Ads/Partner 결제) |
| Authority | `store_id` (selected store; owner-wide 합산 금지) |
| 금지 | Gift `store_cash_accounts`로 동일시 · `delivery_ad_accounts`(owner_user_id) · AST-002 |

---

## 4. Authority

```text
AST-001 D-Point
  owner key : user_id (member_id)
  금지      : store_id를 D-Point 소유자로 삼기

AST-002 Business Credit
  owner key : store_id
  금지      : owner_user_id 단위로 여러 매장 Credit 합산
              member_id만으로 Credit mutate
              “오너 포인트”로 Credit 대체 표기
              AST-004 / AST-005와 합산·동일시

AST-003 Settlement
  owner key : store_id (+ settlement keys)
  금지      : AST-001 / AST-002 / AST-004 / AST-005 잔액과 합산·동일시

AST-004 Store Points (Economic)
  owner key : store_id
  금지      : AST-002 잔액·원장 재사용
              owner_user_id 합산
              임의 충전을 제품 유입으로 위장

AST-005 Business Cash
  owner key : store_id
  금지      : Gift Store Cash / delivery_ad_accounts / AST-002 잔액 재사용
              owner_user_id 지갑
              출금(withdraw) 제품 경로

공통
  같은 사용자가 여러 Asset에 접근할 수 있다
  ≠ 그 Asset들의 소유 권위·잔액·원장이 같다
```
---

## 5. Boundary

```text
AST-001 ≠ AST-002 ≠ AST-003 ≠ AST-004 ≠ AST-005
(향후 추가 Asset 상호 간에도 동일)
```
| 계층 | 규칙 |
|------|------|
| 잔액 | Asset 간 합산·공유 금지 |
| 원장 | owner 권위 없이 혼재 금지 |
| Writer / Reader / API / RPC / DB | Asset을 추론해 임의 처리하는 단일 경로 금지 |
| UI / Admin / 통계 | 한 잔액·한 writer·합산 통계로 혼동 금지 |
| 전환 | 자동 전환·암묵 상계를 본 계약 기본으로 두지 않음 |

표면:

- 무매장 회원: AST-002 잔액(가짜 0 포함) 미노출  
- 매장 보유: 내정보 = AST-001만 · AST-002 = 매장 관리(`store_id`)만  

**사용처 목록은 본 문서에 두지 않는다.** → Usage Contract.

---

## 6. Terminology

| 개념 | 권장 용어 | 참조 키 |
|------|-----------|---------|
| 최상위 | Asset | — |
| 회원 개인 자산 | D-Point | **AST-001** |
| 매장 운영 자산 | Business Credit (비즈니스 크레딧) | **AST-002** |
| 매출 정산 | Settlement / 정산금 | **AST-003** |
| 매장 경제 포인트 | Store Points (Economic) | **AST-004** |
| 매장 소비 Cash | Business Cash | **AST-005** |
| 입금 PHP 금액 | 입금 신청액 (잔액 Asset 아님) | — |

「포인트」만으로 복수 Asset을 지칭하는 것은 용어 위반 후보.  
코드 rename은 본 계약의 의무가 아니다 (Implementation 범위).

---

## 7. ARTICLE — Asset Creation Rule

```text
새로운 Asset은 기존 Asset을 확장하지 않는다.
기존 Asset에 기능을 억지로 추가하지 않는다.
(“그냥 AST-001에 넣자” / “AST-002에 붙이자” 금지)

새 Asset이 필요하면:

  1) Asset Contract 개정 (Amendment Rule)
     - 새 Asset ID 발급 (AST-00N)
     - 의미 · Authority · 표면 · Boundary 기록
     - Registry에 Active 등록

  2) Usage Contract
     - Target Asset = 해당 Asset ID

  3) Implementation Contract
     - 잔액 · 원장 · Writer · API · UI · Admin

Asset Contract에 ID·정의가 없는 상태에서
Usage 또는 Implementation 착수 금지.
```

---

## 8. ARTICLE — Asset Retirement Rule

```text
Asset은 사용처가 없어졌다고 삭제하지 않는다.
원장·잔액·Migration·Admin을 임의로 제거하지 않는다.

Retired 전환 조건 (모두 충족):

  1) 해당 Asset ID를 Target으로 하는 Active Usage 전부 종료(또는 Retired)
  2) 잔액 정합성 확인
  3) 원장 보존·조회 경로 확인 (이력 삭제 금지)
  4) Migration / 스키마 영향 문서화
  5) Runtime에 해당 Asset mutate 없음 확인
  6) Admin 정리 또는 Read-only 이력 유지 확인

절차:

  Asset Contract 개정 (Amendment Rule)
    → 상태 Active → Retired
    → Asset ID는 Registry에 영구 유지 (재발급 금지)
    → 이후 Implementation에서 쓰기 경로 제거 가능
       (읽기·감사 이력은 정책에 따라 유지)

“리팩터링 중 원장 테이블 삭제”는 본 조항 위반이다.
```

---

## 9. ARTICLE — Asset Amendment Rule

```text
기존 Asset의 의미(Meaning),
Authority,
Boundary,
Terminology는
Implementation 단계에서 변경할 수 없다.

변경이 필요하면:

  1. Amendment Proposal 작성
  2. Asset Contract 개정 (버전 bump · 변경 이력)
  3. Usage Contract 영향 분석
  4. Implementation 영향 분석
  5. 승인 후 적용

Usage나 Implementation에서
Asset 정의를 암묵적으로 변경하는 것은 금지한다.

예) AST-001 Authority 변경,
    AST-002 의미 변경,
    AST-003을 AST-002에 포함
    → 모두 Amendment Rule 필수. 우회 금지.
```

---

## 10. 범위 밖 (본 문서에 넣지 않음)

- Evidence를 정책으로 승격  
- 사용처 목록 (광고·수수료·프로모션·AI·구독 등)  
- 충전·요율·만료·출금·전환 정책  
- 구현 · Runtime · Product PASS · Hard Lock  

---

## 11. 최종 요약

```text
════════════════════════════════════════
DIBAY ASSET CONTRACT v1.0
Status: FROZEN SSOT
════════════════════════════════════════

Registry
  AST-001 D-Point                  (user_id)
  AST-002 Business Credit          (store_id)
  AST-003 Settlement               (store_id + settlement keys)
  AST-004 Store Points (Economic)  (store_id)
  AST-005 Business Cash            (store_id)

Lifecycle
  Creation   — 확장 금지 · Contract→Usage→Impl
  Amendment  — Proposal→개정→Usage/Impl 영향→승인
  Retirement — Usage 종료+정합 후 Retired · ID 영구

Identity
  Asset ID immutable (이름 변경 ≠ ID 변경)

Order (immutable)
  Asset → Usage → Implementation → Runtime → PASS → Hard Lock

Bypass: FORBIDDEN
Do not grow this document with Usage or policy.
════════════════════════════════════════
```

---

## Change log

| Version | Date | Note |
|---------|------|------|
| v1.0 | 2026-08-07 | FROZEN SSOT. Drafts v1.1–v1.3 수렴. Creation / Retirement / Amendment / Immutable Identity 포함. |
