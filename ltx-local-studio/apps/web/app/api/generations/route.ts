import { NextRequest, NextResponse } from "next/server";
import { getServerProvider } from "@/lib/server/provider";
import type { VideoGenerationInput } from "@ltx-studio/generation-core";

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
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Submission failed" },
      { status: 500 }
    );
  }
}
