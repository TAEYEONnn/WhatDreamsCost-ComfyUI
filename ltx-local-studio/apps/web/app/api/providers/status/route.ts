import { NextResponse } from "next/server";
import { getServerProvider } from "@/lib/server/provider";

export async function GET() {
  const provider = getServerProvider();
  try {
    const status = await provider.checkConnection();
    return NextResponse.json({
      providerId: provider.id,
      providerName: provider.name,
      ...status,
    });
  } catch (err) {
    return NextResponse.json(
      {
        providerId: provider.id,
        providerName: provider.name,
        connected: false,
        error: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 200 }
    );
  }
}
