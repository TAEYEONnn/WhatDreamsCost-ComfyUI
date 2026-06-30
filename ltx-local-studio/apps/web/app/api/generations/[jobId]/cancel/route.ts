import { NextRequest, NextResponse } from "next/server";
import { getServerProvider } from "@/lib/server/provider";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const provider = getServerProvider();
  try {
    if (provider.cancelGeneration) {
      await provider.cancelGeneration(jobId);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Cancel failed" },
      { status: 500 }
    );
  }
}
