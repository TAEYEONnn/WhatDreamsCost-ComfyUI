import { NextRequest, NextResponse } from "next/server";
import { getServerProvider } from "@/lib/server/provider";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const { jobId } = await params;
  const provider = getServerProvider();
  try {
    const status = await provider.getGenerationStatus(jobId);
    return NextResponse.json(status);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Status check failed" },
      { status: 500 }
    );
  }
}
