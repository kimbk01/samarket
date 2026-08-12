# 06 — Policy CMS

Slice 8. 단일 CMS 권위.

```text
Admin → CMS → 회원 노출
```

## 콘텐츠 종류

| Kind | Notes |
|------|-------|
| 공지 | 일반 공지 |
| 정책 | 약관 · 개인정보 · 운영정책 |
| FAQ | |
| 배너 | |
| 운영 공지 / 점검 공지 | |
| 팝업 (앱 Popup) | |
| 버전별 정책 | |
| 지역별 정책 | |
| 다국어 | ko/en 최소 · key 원문 UI 금지 |

기존 `app_notices` 등: 흡수·역할 분리 후 중복 CRUD 금지.

## 권위

Writer = Admin CMS · Reader = Member/Guest Projection · Audit = Admin Audit Scope.
