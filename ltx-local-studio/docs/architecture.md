# Architecture

## System Overview

```
Mac (Development / User Interface)
    │
    └─ ltx-local-studio/apps/web (Next.js)
           │
           └─ VideoGenerationProvider (abstraction)
                   ├─ MockVideoProvider    ← default, no server needed
                   ├─ ComfyUIProvider      ← Windows GPU server
                   └─ NvidiaBuildProvider  ← NVIDIA cloud API (skeleton)
                              │
                              ▼
               Windows GPU Server (future)
                    └─ ComfyUI + LTX-Video
                              │
                              ▼
                    vendor/WhatDreamsCost-ComfyUI
                    (LTX Director Custom Node)
```

## Monorepo Structure

```
ltx-local-studio/
├── vendor/WhatDreamsCost-ComfyUI/   # Fork clone (reference, not modified)
├── apps/web/                         # Next.js production tool UI
├── packages/
│   ├── shared-types/                 # Zod schemas, TypeScript types
│   └── generation-core/              # Provider interfaces, Mock/ComfyUI/NVIDIA
├── docs/                             # Documentation
├── .env.example                      # Environment variable template
├── pnpm-workspace.yaml
└── package.json
```

## Design Decisions

### Provider Abstraction
All video generation goes through `VideoGenerationProvider` interface.
The UI never talks directly to ComfyUI or any model API.
This allows switching between Mock, ComfyUI, and NVIDIA Build without changing the UI.

### Mock-First Development
The app is fully functional with `MockVideoProvider` — no GPU, no server needed.
All states (queued, processing, completed, failed, cancelled) are simulated.
Configurable failure rate for testing error handling.

### IndexedDB Persistence
All project data (projects, shots, assets, generations) stored in IndexedDB via Dexie.
Asset blobs stored as actual Blob objects, not URL strings (which expire).
No server-side database required.

### Vendor as Reference
`vendor/WhatDreamsCost-ComfyUI` is a **read-only reference**.
We study its data structures and workflow JSONs.
We do NOT import Python code or depend on ComfyUI internals.
The actual connection to ComfyUI happens via the REST API (`/prompt`, `/history`, etc.).

## Data Flow

```
User creates Shot
    ↓
Inspector sets prompt, duration, aspect ratio, camera preset
    ↓
User clicks "Generate"
    ↓
GenerationStore.submitGeneration()
    ↓
activeProvider.submitGeneration(VideoGenerationInput)
    ↓ (Mock: simulates; ComfyUI: POST /prompt with workflow JSON)
GenerationSubmission { providerJobId }
    ↓
Poll every 1s: provider.getGenerationStatus(providerJobId)
    ↓
GenerationStatusResult { status, progress, outputUrl }
    ↓
Update Generation record in IndexedDB
    ↓
UI re-renders via Zustand state
```

## State Management

Three Zustand stores:
- `useProjectStore` — project CRUD, active project, import/export
- `useShotStore` — shot CRUD, ordering, active shot
- `useAssetStore` — file upload, blob management
- `useGenerationStore` — submit, poll, cancel, retry

All stores persist via Dexie on every mutation.
Stores are hydrated from IndexedDB on app mount.
