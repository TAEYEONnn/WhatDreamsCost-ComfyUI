# LTX Local Studio

개인용 AI 영상 제작 도구. Mac에서 동작하는 Next.js 앱으로, Windows GPU 서버의 ComfyUI + LTX-Video와 연결된다.

## 빠른 시작

```bash
# 의존성 설치
pnpm install

# Mock Mode로 개발 서버 실행 (GPU 불필요)
pnpm dev

# 브라우저에서 http://localhost:3000 열기
```

## 모노레포 구조

```
ltx-local-studio/
├── vendor/WhatDreamsCost-ComfyUI/   # Fork Clone (참고용, 수정 금지)
├── apps/web/                         # Next.js 제작 도구 UI
├── packages/
│   ├── shared-types/                 # Zod 스키마, TypeScript 타입
│   └── generation-core/              # Provider 인터페이스, Mock/ComfyUI/NVIDIA
└── docs/                             # 문서
```

## Provider 설정

`.env.local` 파일 생성:

```bash
# Mock Mode (기본, 외부 서버 불필요)
NEXT_PUBLIC_DEFAULT_PROVIDER=mock

# ComfyUI Mode (Windows GPU 서버)
NEXT_PUBLIC_DEFAULT_PROVIDER=comfyui
COMFYUI_BASE_URL=http://[서버IP]:8188
```

## 검증

```bash
pnpm lint        # ESLint
pnpm typecheck   # TypeScript
pnpm test        # Vitest
pnpm build       # Production build
```

## 문서

- [아키텍처](docs/architecture.md)
- [LTX Director 분석](docs/ltx-director-audit.md)
- [ComfyUI 연동](docs/comfyui-integration.md)
- [LTX 워크플로우 Adapter](docs/ltx-workflow-adapter.md)
- [NVIDIA Build 연동](docs/nvidia-build-integration.md)
- [Upstream 상태](docs/upstream-status.md)
- [결정 사항](docs/decisions.md)
- [다음 단계](docs/next-steps.md)

## Vendor 초기 설정

```bash
git clone https://github.com/TAEYEONnn/WhatDreamsCost-ComfyUI.git vendor/WhatDreamsCost-ComfyUI
cd vendor/WhatDreamsCost-ComfyUI
git remote add upstream https://github.com/WhatDreamsCost/WhatDreamsCost-ComfyUI.git
```
