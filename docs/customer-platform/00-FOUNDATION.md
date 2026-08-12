# 00 — Foundation Principles

DIBAY / Customer Platform 공통 원칙. 세부 계약은 `01`–`08`.

## 적용 범위

MyPage · Admin · Community · Delivery · Messenger · Store · CMS · 이후 도메인.

## 절대 원칙

- 원인 1개 → 권위 1개 → 구현 1개  
- 기존 기능 KEEP / MOVE / MERGE (삭제형 축소 금지)  
- 미실측·미LOCK 항목 추측 구현 금지  
- UI 전면 작업은 Design System LOCK 이후  
- Facts/Domain/Nav/CTA/Motion/Runtime LOCK 이후 Slice 1  

## Gate

```text
Audit → AUDIT PASS → Architecture LOCK → Facts → Authority → Design System → UI → …
```

## 금지

- 화면만 닮은 패치  
- Admin/Member가 다른 Facts를 읽기  
- 당근 주황 브랜드 자산  
- dirty 작업 트리 혼입 · 무관 도메인(auth/messenger/call) 임의 변경  

## Android 당근

NOT_AVAILABLE — 비교 권위에서 제외. DIBAY APK는 Runtime 대상만.
