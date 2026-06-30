# Architecture Decisions

## D-001: vendor 관리 방식 — .gitignore로 제외 + 설치 스크립트

**선택**: vendor/WhatDreamsCost-ComfyUI를 `.gitignore`로 제외하고 별도 clone 스크립트 제공

**대안**: Git Submodule

**근거**:
- Submodule은 복잡한 git 명령어가 필요하고 (`git clone --recurse-submodules`), 팀원들이 실수로 vendor에 push할 위험이 있다
- vendor는 참고용 읽기 전용 Clone이므로 버전 고정이 필요하지 않다
- `.gitignore` 방식은 `git clone` 후 setup 스크립트 한 번만 실행하면 된다
- upstream 업데이트는 vendor 내에서 직접 `git fetch upstream`으로 관리

**결과**: `docs/next-steps.md`에 설치 명령어 문서화

---

## D-002: Next.js App Router 선택

**선택**: App Router (Next.js 13+)

**근거**:
- Server Components와 Edge Runtime 지원으로 향후 서버 측 Provider 연동 용이
- 파일 기반 라우팅으로 확장 시 페이지 추가가 명확
- React 19 호환

---

## D-003: Zustand 선택 (Redux 대비)

**선택**: Zustand

**근거**:
- 보일러플레이트가 극히 적다
- TypeScript 타입 추론이 자연스럽다
- persist 미들웨어 없이 IndexedDB와 직접 연동 가능
- 전역 상태가 많지 않은 단일 사용자 앱에 적합

---

## D-004: IndexedDB (Dexie) 선택

**선택**: Dexie.js

**근거**:
- 첫 버전은 서버 DB 없이 오프라인으로 동작해야 한다
- Asset Blob을 localStorage에 저장하면 용량 제한(5MB)에 걸린다
- Dexie는 IndexedDB의 복잡한 transaction API를 단순화한다
- 나중에 서버 DB로 마이그레이션 시 store 레이어만 교체하면 된다

---

## D-005: Mock Provider 기본값

**선택**: 환경변수 `NEXT_PUBLIC_DEFAULT_PROVIDER=mock` 미설정 시 Mock 자동 사용

**근거**:
- Mac에서 CUDA 기반 모델을 실행할 수 없다
- 외부 서버 없이도 전체 UI 흐름이 동작해야 한다
- Generation 상태 전이 (queued → processing → completed/failed)를 테스트할 수 있다

---

## D-006: LTX Director 직접 실행 대신 Adapter 패턴

**선택**: ComfyUI REST API + WorkflowAdapter

**근거**:
- LTX Director는 ComfyUI Custom Node이므로 독립 실행 불가
- ComfyUI는 완전한 REST API를 제공한다 (`/prompt`, `/history`, `/view`)
- 워크플로우 JSON을 LTX Director가 이미 제공하므로 재구현 불필요
- LTX Director가 업데이트돼도 Adapter 인터페이스는 유지됨

---

## D-007: pnpm 선택

**선택**: pnpm workspace

**근거**:
- 모노레포 native 지원 (workspace:*)
- 심볼릭 링크 기반으로 디스크 사용량 적음
- npm/yarn 대비 설치 속도 빠름
