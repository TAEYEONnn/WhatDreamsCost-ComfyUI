import { NextRequest, NextResponse } from "next/server";
import { getServerProvider } from "@/lib/server/provider";
import type { VideoGenerationInput } from "@ltx-studio/generation-core";
import { GenerationError } from "@ltx-studio/generation-core";

const CLIENT_ERROR_CODES = new Set([
  "IMAGE_REQUIRED",
  "BLOB_URL_NOT_SUPPORTED",
  "WORKFLOW_NOT_CONFIGURED",
]);

export async function POST(request: NextRequest) {
  const provider = getServerProvider();
  let input: VideoGenerationInput;
  try {
    input = (await request.json()) as VideoGenerationInput;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const submission = await provider.submitGeneration(input);
    return NextResponse.json(submission, { status: 201 });
  } catch (err) {
    // Client errors (missing image, bad URL) → 422 Unprocessable Entity
    if (err instanceof GenerationError && CLIENT_ERROR_CODES.has(err.code ?? "")) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Submission failed" },
      { status: 500 }
    );
  }
}
