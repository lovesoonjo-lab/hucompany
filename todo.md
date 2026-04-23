# Shopping Shorts Auto Creator — Project TODO

## 핵심 기능

- [x] 사용자 인증(Manus OAuth) 기반 로그인/로그아웃 플로우 동작
- [x] 프로젝트(캠페인) CRUD: 생성/조회/삭제, 사용자별 격리
- [x] 프로젝트 설정: 제목, 화면 비율(9:16/16:9/1:1)
- [x] Krea AI API Key 설정 페이지 (사용자별 저장)
- [x] Upload-Post API Key 설정 (선택)

## 1단계: 대본 입력 & 장면 분리
- [x] 스크립트 텍스트 입력 UI (멀티라인 에디터)
- [x] LLM으로 장면(Scene) 자동 분리·분석 (시각적 요소/분위기·톤/카메라 앵글)
- [x] 제품 사진 업로드 (storagePut)
- [x] 참고 인물 사진 업로드 (storagePut)

## 2단계: AI 이미지 프롬프트 자동 생성
- [x] 장면별 영어 프롬프트 자동 생성 (LLM 기반)
- [x] 프롬프트 필드: 인물/배경/제품 상호작용/스타일/화면 비율
- [x] 프롬프트 수동 편집 가능

## 3단계: Krea AI 이미지 생성
- [x] 장면별 모델 자동 추천 (제품+인물 → Nano Banana Pro, 제품 클로즈업 → Seedream 4, 일반 → Krea 1)
- [x] 사용자가 모델 수동 선택 (Krea 1, Nano Banana Pro, Flux, ChatGPT Image, Seedream 4, Imagen 4, Ideogram 3.0, Flux Kontext)
- [x] 이미지 생성 API 호출 + 미리보기
- [x] 재생성 버튼
- [x] Topaz 업스케일 버튼 (시뮬레이션)

## 4단계: 이미지→영상 변환
- [x] 비디오 모델 선택 UI (Veo 3.1, Kling 2.6, Hailuo 2.3, Seedance 2.0, Wan 2.5, Hailuo 2.3 Fast)
- [x] 클립 길이 설정 (5~12초)
- [x] Start Image 지정 및 영상 생성 요청
- [x] 영상 미리보기 플레이어 (포스터 프레임)

## 5단계: SNS 멀티 플랫폼 일괄 업로드
- [x] 업로드 대상 플랫폼 선택 (TikTok, Instagram Reels, YouTube Shorts)
- [x] 캡션/해시태그 입력
- [x] 업로드 상태 표시 (대기/업로드 중/완료/실패)

## 대시보드 & UI
- [x] 5단계 스텝 인디케이터 (진행 상태 시각화)
- [x] 프로젝트 목록 대시보드
- [x] 장면별 카드 뷰 (썸네일, 프롬프트, 모델, 이미지/영상 상태)
- [x] 우아하고 완성도 높은(Elegant/Perfect) 디자인 톤 적용 — 아이보리/옵시디언/샴페인 골드 팔레트, Cormorant Garamond + Inter 페어링

## 데이터 모델
- [x] projects 테이블
- [x] scenes 테이블 (프롬프트, 이미지 URL, 영상 URL, 상태)
- [x] assets 테이블 (업로드된 제품/인물 사진)
- [x] uploads 테이블 (SNS 업로드 기록)
- [x] user_settings 테이블 (Krea/Upload-Post API Key)

## 테스트
- [x] shared/catalog 단위 테스트 (모델/플랫폼/추천 로직) — 7건 통과
- [x] server/pipeline 단위 테스트 (장면 분석/프롬프트/이미지/영상) — 8건 통과
- [x] auth.logout 기존 테스트 유지 — 1건 통과

## 프로젝트 설정
- [x] 프로젝트 생성 시 타깃 플랫폼 선택 UI (체크박스 그리드) 추가
- [x] DB `projects.targetPlatforms` JSON 컴럼 추가 및 마이그레이션 적용
- [x] Step 5 업로드 단계 기본 선택값을 프로젝트 타깃 플랫폼으로 자동 채움

## 모델 추천 로직 확장
- [x] `recommendImageModel`에 closeUp/graphic/edit 분기 추가 (제품 클로즈업 → Seedream 4 · 일반 클로즈업 → Imagen 4 ÷ 디자인 → Ideogram 3.0 ÷ 편집 → Flux Kontext)
- [x] `recommendImageModelAlternatives`로 대안 모델 제공

## 영상 미리보기
- [x] 실제 `<video controls>` 플레이어 (mp4/webm/mov 파일 감지 시) + 이미지 포스터 폴백

## 테스트 (최종)
- [x] 핵심 tRPC 라우터 통합 테스트 (`server/routers.test.ts`) - 15건 통과
- [x] 전체 vitest 31건 모두 통과 (catalog 7 / pipeline 8 / routers 15 / auth 1)

## 외부 API 실 연동 상태
- [x] Krea AI Image API HTTP 연동: `kreaClient.kreaGenerateImage` (키 설정 시 실 호출, 없으면 내장 헬퍼 폴백)
- [x] Krea AI Image-to-Video HTTP 연동: `kreaClient.kreaGenerateVideo` + Job polling (키 설정 시 실제 응답 수신, 없으면 시작 이미지 포스터 폴백)
- [x] Topaz Generative Upscale HTTP 연동: `kreaClient.kreaTopazUpscale` (키 설정 시 실 업스케일 URL 저장, 없으면 플래그만 토글)
- [x] Upload-Post HTTP 연동: `uploadPostClient.uploadPostVideo` (API 키 + 사용자 ID 설정 시 실 디스패치, 없으면 시뮬레이션)
- [x] GCS 검증 HTTP 연동: `@google-cloud/storage` SDK로 버킷 조회 + 7개 폴더 .keep 마커 생성


## 사용자 요청 변경 (플랫폼 명칭/추가)
- [x] PlatformId를 "TikTok" | "Instagram" | "YouTube" | "Facebook"로 변경
- [x] PLATFORMS 카탈로그에 Facebook 추가, Instagram Reels→Instagram, YouTube Shorts→YouTube로 라벨 변경
- [x] uploadPostClient의 PLATFORM_MAP에 facebook 추가, 기존 매핑 키 업데이트
- [x] DB enum에 신규/레거시 값 병행 보관 + UI에서 `normalizePlatformId`로 표시 정규화
- [x] NewProject·UploadPanel·ProjectWorkspace UI 라벨 일괄 교체 (4열 그리드)
- [x] catalog/routers vitest 케이스 갱신 후 전체 31건 통과


## Google Cloud Storage (GCS) 자동 업로드 설정
- [x] DB `user_settings`에 GCS 컬럼 5종 추가 (projectId, bucketName, serviceAccountEmail, privateKey, verifiedAt)
- [x] 마이그레이션 생성 및 적용 (`webdev_execute_sql`)
- [x] tRPC `settings.get/save`에 GCS 필드 포함, `settings.verifyGcs` 검증 mutation 추가
- [x] API 설정 페이지에 "Google Cloud Storage (GCS) 설정" 카드 추가 (Project ID, Bucket Name, Service Account Email, Private Key JSON, "저장 및 검증" 버튼)
- [x] 폴더 구조 안내(reference/, scripts/, audio/, subtitles/, images/, videos/, final/) 표기 + 검증 시 7개 .keep 마커 생성
- [x] gcsClient는 `@google-cloud/storage` SDK로 버킷 조회 후 폴더 생성


## 브랜드 로고
- [x] 사이드바 헤더에 가족 일러스트 로고 추가 + "HUCOMPANY"(상단 라벨) + "Shopping Shorts"(메인 타이틀) 2단 표기
- [x] 사이드바 하단 사용자 프로필 제거, "Sign out" 버튼만 유지
- [x] 사인-인 화면 헤드라인 HUCOMPANY · Shopping Shorts로 일치

## 외부 API 실 연동 (폴백 안전)
- [x] Krea API 키 있을 시 `kreaClient`로 이미지/영상/Topaz 실 HTTP 호출, 없으면 내장 헬퍼 폴백
- [x] Upload-Post API 키 + 사용자 ID 설정 시 `uploadPostClient`로 실 SNS 디스패치, 미설정 시 시뮬레이션
- [x] GCS 검증: `@google-cloud/storage` SDK로 버킷 존재 확인 + 7개 폴더 .keep 마커 생성
- [x] UI 업로드 패널에 "Upload-Post 사용자 ID" 입력 추가 및 mutation에 전달
- [x] 전체 vitest 31건 통과 재확인
