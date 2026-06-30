# Next Steps

## Priority Order

### 1. Windows GPU 서버 설정

```bash
# ComfyUI 설치
git clone https://github.com/comfyanonymous/ComfyUI.git
cd ComfyUI
pip install -r requirements.txt

# GPU 메모리가 부족하면 --lowvram 옵션 추가
python main.py --listen 0.0.0.0 --port 8188
```

### 2. LTX Director Custom Node 설치

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/TAEYEONnn/WhatDreamsCost-ComfyUI.git
cd WhatDreamsCost-ComfyUI
pip install av pillow  # 추가 의존성
```

### 3. LTX Video 관련 필수 Custom Node 설치

```bash
cd ComfyUI/custom_nodes

# LTX-Video 핵심 노드
git clone https://github.com/Lightricks/ComfyUI-LTXVideo.git

# 비디오 유틸리티
git clone https://github.com/Kosinkadink/ComfyUI-VideoHelperSuite.git

# 모델 다운로드 (ComfyUI Manager로 하거나 수동)
# models/checkpoints/ 에 LTX-Video 0.9 체크포인트 배치
```

### 4. ComfyUI에서 LTX Director 워크플로우 실행

1. `vendor/WhatDreamsCost-ComfyUI/example_workflows/LTX_Director_2_Workflow_Hotfix.json` 열기
2. 모델 경로 설정
3. 테스트 프롬프트로 생성 확인

### 5. API Format Workflow JSON Export

1. ComfyUI → Settings → Dev Mode 활성화
2. 워크플로우 열기 → Save (API Format) 클릭
3. JSON 파일 저장

### 6. LTX Workflow Adapter 연결

```typescript
// apps/web/lib/providers/index.ts에 추가
import { ltxWorkflowAdapter } from "@ltx-studio/generation-core";
import workflowJson from "./ltx-director-v2-api.json";

ltxWorkflowAdapter.loadWorkflow(workflowJson);
```

### 7. Mac에서 원격 실행

1. `apps/web/.env.local` 설정:
   ```
   NEXT_PUBLIC_DEFAULT_PROVIDER=comfyui
   COMFYUI_BASE_URL=http://[Windows-IP]:8188
   ```
2. `pnpm dev` 로 앱 실행
3. Shot 생성 → Generate 클릭 → ComfyUI에서 생성 확인

### 8. NVIDIA Build Provider 구현

- `packages/generation-core/src/providers/nvidia-build-provider.ts` 구현
- API 엔드포인트 및 인증 구현
- 참고: `docs/nvidia-build-integration.md`

### 9. OpenCut 연동 검토

- 생성된 Shot들을 OpenCut 타임라인으로 내보내기 가능성 검토
- 각 Shot의 출력 비디오를 시퀀스로 연결
- OpenCut 포맷 지원 여부 확인

---

## Mac에서 할 일

- [x] ltx-local-studio 모노레포 구성
- [x] Mock Mode로 앱 전체 흐름 검증
- [ ] `pnpm dev` 실행 후 UI 검증
- [ ] ComfyUI 연결 후 실제 생성 테스트
- [ ] 워크플로우 Adapter 완성

## Windows GPU 서버에서 할 일

- [ ] ComfyUI 설치 및 실행
- [ ] WhatDreamsCost-ComfyUI 커스텀 노드 설치
- [ ] LTX-Video 모델 체크포인트 다운로드
- [ ] 예시 워크플로우 실행 테스트
- [ ] API Format 워크플로우 Export
- [ ] 포트 8188 방화벽 허용

## ComfyUI에서 할 일

- [ ] LTX Director 워크플로우 최적화
- [ ] 시작/종료 프레임 처리 테스트
- [ ] Prompt Relay 세그먼트 테스트
- [ ] 오디오 인페인팅 테스트
- [ ] Retake 기능 테스트

## NVIDIA Build 연결에 필요한 일

- [ ] NVIDIA Build 계정 및 API Key 발급
- [ ] 사용 가능한 비디오 생성 모델 목록 확인
- [ ] 비용/성능 ComfyUI 대비 평가
- [ ] `NvidiaBuildProvider` 실제 구현
- [ ] 테스트 및 출력 품질 평가

---

## Vendor 클론 초기 설정 (새 개발 환경에서)

```bash
cd ltx-local-studio
git clone https://github.com/TAEYEONnn/WhatDreamsCost-ComfyUI.git vendor/WhatDreamsCost-ComfyUI
cd vendor/WhatDreamsCost-ComfyUI
git remote add upstream https://github.com/WhatDreamsCost/WhatDreamsCost-ComfyUI.git
git fetch upstream
```
