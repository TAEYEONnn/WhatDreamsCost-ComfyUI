# LTX Director Audit

## 1. 저장소 개요

**WhatDreamsCost/WhatDreamsCost-ComfyUI** 는 ComfyUI용 커스텀 노드 패키지다.
LTX-Video 모델을 ComfyUI에서 WYSIWYG 타임라인 에디터로 제어하는 기능을 제공한다.

핵심 노드: `LTXDirector` — 시각적 타임라인에서 세그먼트·오디오·모션 가이드를 조합해 LTX-Video 잠재 벡터와 컨디셔닝을 출력한다.

---

## 2. 실행 전제조건

| 항목 | 내용 |
|---|---|
| ComfyUI | 최신 버전 (comfy_api.latest 필요) |
| Python | 3.10+ |
| GPU | CUDA 지원 NVIDIA GPU (VRAM 16GB+ 권장) |
| 모델 | LTX-Video 0.9 / 0.9.5 체크포인트 |
| 의존성 | torch, av (PyAV), numpy, PIL, comfy 내부 모듈 |
| 커스텀 노드 | LTX Director Custom Node (이 저장소) |
| JS 번들 | `js/` 디렉터리 — ComfyUI 웹 UI에 자동 로드 |

---

## 3. 파일별 역할

| 파일 | 역할 |
|---|---|
| `ltx_director.py` | 핵심 노드 `LTXDirector` 구현. 타임라인 JSON 파싱, 가이드 이미지 처리, 오디오 합성, 잠재 벡터 생성 |
| `ltx_director_guide.py` | `LTXDirectorGuide`, `LTXDirectorCropGuides` — 가이드 이미지를 ComfyUI 컨디셔닝에 주입 |
| `ltx_sequencer.py` | `LTXSequencer` — 복수 이미지를 특정 프레임 인덱스에 삽입. `LTXVAddGuide` 확장 |
| `ltx_keyframer.py` | `LTXKeyframer` — 잠재 벡터 내 특정 프레임을 이미지로 교체 |
| `prompt_relay.py` | 핵심 알고리즘: 세그먼트별 로컬 프롬프트를 글로벌 프롬프트와 합성. 타임라인 Gaussian penalty mask 계산 |
| `patches.py` | 모델 타입 감지(`detect_model_type`) 및 어텐션 패치 적용(`apply_patches`) |
| `load_video_ui.py` | `LoadVideoUI` — ComfyUI에서 비디오 파일 로드 UI |
| `load_audio_ui.py` | `LoadAudioUI` — ComfyUI에서 오디오 파일 로드 UI |
| `multi_image_loader.py` | `MultiImageLoader` — 복수 이미지 배치 로더 |
| `speech_length_calculator.py` | `SpeechLengthCalculator` — TTS 길이 계산 |
| `__init__.py` | 노드 등록, `WEB_DIRECTORY = "./js"` |
| `js/ltx_director.js` | 클라이언트 측 타임라인 에디터 UI. 캔버스 기반, 드래그 편집 지원 |
| `js/ltx_sequencer.js` | LTXSequencer 노드 UI |
| `example_workflows/` | ComfyUI 워크플로우 JSON 예시 (UI format) |

---

## 4. 데이터 흐름

```
사용자 (브라우저 Canvas UI)
    ↓ JSON 직렬화
LTXDirector 노드 inputs (timeline_data, local_prompts, segment_lengths, guide_strength)
    ↓
ltx_director.py execute()
    ├─ 세그먼트 이미지/영상 로드 → guide_data (이미지 텐서 + 삽입 프레임)
    ├─ prompt_relay.py → CLIP 토큰 + Gaussian mask → 패치된 model
    ├─ 오디오 합성 (_build_combined_audio) → audio_out
    ├─ 잠재 벡터 자동 생성 (LTXV 8n+1 규칙)
    └─ 출력: model, conditioning, video_latent, audio_latent, guide_data, motion_guide_data
         ↓
LTXDirectorGuide 노드
    └─ 가이드 이미지를 VAE 인코딩 → conditioning에 주입
         ↓
KSampler → 영상 생성
```

---

## 5. 타임라인 데이터 모델

`timeline_data` 위젯에 저장되는 JSON 구조:

```json
{
  "global_prompt": "전체 비디오 설명",
  "segments": [
    {
      "type": "image",
      "start": 0,
      "length": 60,
      "imageFile": "whatdreamscost/image.png",
      "imageB64": "data:image/png;base64,...",
      "isEndFrame": false,
      "guideStrength": 1.0
    },
    {
      "type": "video",
      "start": 0,
      "length": 120,
      "imageFile": "whatdreamscost/video.mp4",
      "trimStart": 0
    }
  ],
  "audioSegments": [
    {
      "start": 0,
      "length": 120,
      "audioFile": "whatdreamscost/audio.wav",
      "trimStart": 0
    }
  ],
  "motionSegments": [
    {
      "start": 0,
      "length": 120,
      "videoFile": "whatdreamscost/motion.mp4",
      "trimStart": 0
    }
  ],
  "retakeMode": false,
  "retakeVideo": null,
  "retakeStart": 0,
  "retakeLength": 0,
  "retake_global_prompt": ""
}
```

---

## 6. ComfyUI 의존성

**강한 의존성** (독립 앱에서 직접 사용 불가):

| 모듈 | 용도 |
|---|---|
| `comfy.model_management` | GPU 메모리 관리, `intermediate_device()` |
| `comfy.utils` | 유틸리티 함수 |
| `folder_paths` | 입력/출력 디렉터리 경로 |
| `server.PromptServer` | HTTP 엔드포인트 등록 (`@routes.get/post`) |
| `comfy_api.latest.io` | 노드 스키마 정의 API |
| `node_helpers` | 컨디셔닝 설정 헬퍼 |
| `comfy_extras.nodes_lt` | `LTXVAddGuide` 기반 클래스 |

**외부 라이브러리** (독립 앱에서도 사용 가능):
- `av` (PyAV) — 영상/오디오 디코딩
- `torch`, `numpy`, `PIL` — 이미지 처리
- `wave` (stdlib) — WAV 파일 읽기

---

## 7. 재사용 가능한 로직

독립 앱에서 **영감을 받을 수 있는** 순수 로직:

| 로직 | 위치 | 용도 |
|---|---|---|
| 타임라인 JSON 구조 | `ltx_director.py` | 세그먼트·오디오·모션 데이터 모델 설계 참고 |
| LTXV 8n+1 프레임 규칙 | `ltx_director.py:1151` | 잠재 벡터 크기 계산 |
| `_convert_to_latent_lengths` | `ltx_director.py:736` | 픽셀 공간 → 잠재 공간 길이 변환 알고리즘 |
| 카메라 프리셋 프롬프트 | — | 프롬프트 수정자 설계 패턴 |
| 세그먼트 트림/오프셋 계산 | `ltx_director.py:1006` | 타임라인 세그먼트 시간 계산 |

---

## 8. 직접 복사하면 안 되는 부분

- `ComfyNode` 클래스 → ComfyUI 없이 동작하지 않음
- `PromptServer.instance.routes` → aiohttp 서버 필요
- `comfy.model_management` 접근 코드 → CUDA 런타임 필요
- `folder_paths` 사용 코드 → ComfyUI 파일 시스템 구조 필요
- `apply_patches` / `detect_model_type` → LTX 모델 구조 직접 조작

---

## 9. 독립 앱에 다시 구현할 기능

| 기능 | 구현 방식 |
|---|---|
| 타임라인 에디터 UI | React + Canvas 또는 드래그 라이브러리 |
| Shot / Segment 데이터 모델 | Zod 스키마 (shared-types) |
| Asset 업로드 및 Blob 관리 | IndexedDB (Dexie) |
| Generation 상태 폴링 | Provider 추상화 + setInterval |
| 프롬프트 세그먼트 구성 | Inspector 컴포넌트 |
| 오디오 배치 | Web Audio API (미구현, 추후) |
| 워크플로우 파라미터 주입 | ComfyUIWorkflowAdapter |

---

## 10. 라이선스 주의사항

저장소에 `LICENSE` 파일이 있음. 코드를 복사하기 전 라이선스 조건을 확인할 것.
LTX-Video 모델 자체의 라이선스도 별도로 확인 필요.

---

## 11. Windows GPU 서버 연결 시 필요한 항목

1. ComfyUI 설치 및 실행 (`http://[서버IP]:8188`)
2. WhatDreamsCost-ComfyUI 커스텀 노드 설치
3. LTX-Video 모델 체크포인트 설치
4. 관련 필수 커스텀 노드 설치 (see `docs/comfyui-integration.md`)
5. 워크플로우 JSON을 API format으로 Export
6. `ltx-local-studio/.env.local`에 `COMFYUI_BASE_URL=http://[서버IP]:8188` 설정
7. `NEXT_PUBLIC_DEFAULT_PROVIDER=comfyui` 설정
8. `LtxWorkflowAdapter.loadWorkflow(workflowJson)` 호출 코드 구현
