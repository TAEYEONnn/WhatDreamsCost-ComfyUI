# ComfyUI Integration Guide

## Overview

LTX Local Studio connects to ComfyUI via its REST API.
The app itself runs on Mac; ComfyUI runs on a Windows GPU server.

```
Mac (LTX Local Studio)
    │  HTTP REST API
    ▼
Windows GPU Server
    └─ ComfyUI (port 8188)
           └─ LTX Director Custom Node
```

## ComfyUI REST API Endpoints Used

| Endpoint | Method | Purpose |
|---|---|---|
| `/system_stats` | GET | Connection health check |
| `/prompt` | POST | Submit workflow for generation |
| `/history/{promptId}` | GET | Poll generation status |
| `/view` | GET | Download output file |
| `/interrupt` | POST | Cancel current generation |
| `/queue` | GET | View queue status |

## Required Custom Nodes

Install these in ComfyUI's `custom_nodes/` directory:

1. **WhatDreamsCost-ComfyUI** (this fork)
   ```bash
   cd custom_nodes
   git clone https://github.com/TAEYEONnn/WhatDreamsCost-ComfyUI.git
   ```

2. **ComfyUI-LTX-Video** — core LTX-Video nodes
3. **ComfyUI-VideoHelperSuite** — video I/O utilities
4. **ComfyUI-KJNodes** — additional utilities (optional)

## Workflow JSON Export

1. Open ComfyUI in browser
2. Load one of the example workflows from `vendor/WhatDreamsCost-ComfyUI/example_workflows/`
3. Click `⚙ Settings → Enable Dev mode options`
4. Click `Save (API Format)` — this generates the API-compatible JSON
5. Copy the JSON into your app config

## Connecting LTX Local Studio

1. Set environment variables in `apps/web/.env.local`:
   ```
   NEXT_PUBLIC_DEFAULT_PROVIDER=comfyui
   COMFYUI_BASE_URL=http://[Windows-IP]:8188
   ```

2. Load the exported workflow JSON in the app (Settings → Provider → ComfyUI → Upload Workflow)

3. The `ComfyUIProvider` and `LtxWorkflowAdapter` will patch the workflow with Shot parameters before submission.

## Workflow Input Mapping

| LTX Studio Shot Field | ComfyUI Workflow Node/Widget |
|---|---|
| `prompt` | KSampler positive / CLIPTextEncode text |
| `negativePrompt` | CLIPTextEncode negative text |
| `seed` | KSampler seed |
| `durationSeconds` | LTXDirector duration_seconds |
| `aspectRatio` | LTXDirector custom_width / custom_height |
| `startFrameAssetId` | Timeline image segment (start) |
| `endFrameAssetId` | Timeline image segment (end, isEndFrame=true) |

## Network Requirements

- ComfyUI must be accessible from Mac on port 8188
- If on local network: use server's LAN IP (e.g. `192.168.1.xxx`)
- If on VPN/internet: use public IP or tunnel (ngrok, tailscale, etc.)
- No HTTPS required for local network

## Troubleshooting

| Error | Cause | Fix |
|---|---|---|
| Connection refused | ComfyUI not running | Start ComfyUI on Windows |
| 403 Forbidden | CORS | Add `--listen 0.0.0.0` to ComfyUI launch args |
| Workflow error | Wrong node version | Update custom nodes |
| NotConfiguredError | No workflow JSON loaded | Export and upload API format workflow |
