# NVIDIA Build Integration

## Status: Skeleton Only

The `NvidiaBuildProvider` exists as a skeleton.
It returns `NotConfiguredError` for all generation calls.

## To Implement

1. Get an NVIDIA Build API key from https://build.nvidia.com
2. Identify the video generation model ID (e.g., `nvidia/cosmos-1-0-diffusion-7b-video2world`)
3. Set environment variables:
   ```
   NVIDIA_API_KEY=nvapi-xxxx
   NVIDIA_VIDEO_MODEL=nvidia/cosmos-1-0-diffusion-7b-video2world
   NVIDIA_API_BASE_URL=https://integrate.api.nvidia.com/v1
   ```
4. Implement `NvidiaBuildProvider.submitGeneration()` with the actual API call
5. Implement polling via `getGenerationStatus()`

## API Pattern (when implemented)

```typescript
// Submit
const res = await fetch(`${baseUrl}/video/generation`, {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: modelId,
    prompt: input.prompt,
    // ...
  }),
});

// Poll
const status = await fetch(`${baseUrl}/video/generation/${jobId}`, {
  headers: { "Authorization": `Bearer ${apiKey}` },
});
```

## Why This Is Phase 2

- NVIDIA Build API pricing and availability needs to be evaluated
- ComfyUI + LTX Director gives more control over the generation parameters
- The Provider abstraction makes switching trivial once ready
