# 단계 C 적용 전 백업 (운영 DB 읽기 · 2026-11-04 08:2x PHT)

## C-3 캠페인 39건 (모두 status=draft)
이전 값: channel=`push_only` 37건 전부. target_type = 아래 표기 외 `selected_users`.
- target_type=`marketing_opt_in` (→ `all`): 3e46b897-609d-4bf1-bcef-14c42a1cf4ae · fb87b8f9-33fa-4e99-8470-e8dcee600cb9 (두 건 모두 channel=push_only 이기도 함 → 실제 행 수 37)
- target_type=`all`: 7c0f7e55-e7bc-4b5a-aa90-bb5c93faa224
- id 목록(channel push_only → push_and_in_app): 110ea806-bb5d-48a3-8fa1-b2055a5930dd 11111111-1111-4111-8111-111111111103 1433898e-560b-4384-89f8-0d51d2ab4e96 15f7a469-2a9c-4fc0-9e4a-fdff6ed0200c 1bbdb493-3021-457f-9a71-ebbf9e91f077 1ef98ba7-369b-43ae-a371-c076d52f9cdd 2db70c11-ec80-4f48-a196-940bdabcb58f 30cd824a-08d6-4dd2-97ec-01b263fb17ff 3e3b252a-82ca-4457-874e-d94eaa4d869f 3e46b897-609d-4bf1-bcef-14c42a1cf4ae 3e4a034e-e4ef-4167-a1bf-6606cda5965f 415a3eae-f09c-400f-b3f9-64dbf0424da8 5171118d-7913-4643-919e-36c9de104af3 5cfee492-a655-4a7d-81fd-480575567259 6022339f-8008-457a-a75f-2034b9b1a7cb 603b482a-c7a9-418b-8941-dfcdd62027a3 611bddf1-0bc8-4720-873d-a1cb4bb174e4 7a1bf369-f9fe-473e-a833-a3d3254d899d 7bee88f9-887f-46a5-b0a8-1e2dc858f377 7c0f7e55-e7bc-4b5a-aa90-bb5c93faa224 7c5888b7-dd77-44ed-b3c9-7f6a6d5e3a54 81414d09-da67-4e07-8a7a-f79b9da9b1bd 8acb7054-5ea9-4748-b724-9203bcab286a 972bdd2b-34a5-44cf-99f7-6cb672975cf6 973fa56a-9fc7-4031-bdaf-aa9d3daffca7 98bd79e3-6458-4349-b7ea-e1939f39a5ec a49d1aec-0492-4b0c-b648-48ec362c3bf8 b24e234c-d91f-4914-a6fb-568f126456df b2824d84-53d5-4a9f-89a4-028c0d29bc25 b2bf13a8-9054-4434-8ce0-a45f37039dfa b934e1e0-3ca5-4591-8a98-e9b31d510b63 bac826e1-a35e-4d3d-8f8e-8956f00ce078 bf37d9ff-5efe-48d3-9be8-4037f338713d c720716a-27ee-4761-9ce3-463585da3bc9 e42aa243-2916-4be4-a846-06956abe7595 ef637f52-7804-454a-b2d6-1c785c523044 fb87b8f9-33fa-4e99-8470-e8dcee600cb9

## C-4 대기 회차 32건 (이전 status=queued · completed_at=null · 캠페인 모두 draft)
테스트(seq 2) 19건: 000af591 03bd8918 07356016 12f51a12 32b7ea9b 416a3319 66f1acdf 6a3231ea 75e426e6 895664a5 8ce964c4 b26c77dc b6423939 c05529da c736eacc d1f34e6a d35d74af fc9ab7fa ff396939
즉시(seq 1) 13건: 06dcb3da 078f9a92 1a4fd1ac 28c22794 29992458 420ee785 4c4c68f3 5a93e5e8 5bfc83d2 c2e4148f e186118a e710ca35 f374ff56
(전체 id·이전 집계 숫자는 적용 SQL 실행 결과 표 `after.md` 의 before 열에 함께 기록)
