import { NextRequest, NextResponse } from "next/server";

/**
 * Proxies ComfyUI /view requests so the browser never receives the internal
 * ComfyUI origin (e.g. http://192.168.x.x:8188).
 *
 * Usage: /api/comfyui-proxy/video?filename=...&subfolder=...&type=output
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const filename = searchParams.get("filename");
  const subfolder = searchParams.get("subfolder") ?? "";
  const type = searchParams.get("type") ?? "output";

  if (!filename) {
    return NextResponse.json(
      { error: "filename 파라미터가 필요합니다." },
      { status: 400 }
    );
  }

  const baseUrl =
    process.env.COMFYUI_BASE_URL ?? "http://127.0.0.1:8188";

  const params = new URLSearchParams({ filename, subfolder, type });
  const upstreamUrl = `${baseUrl}/view?${params.toString()}`;

  let res: Response;
  try {
    res = await fetch(upstreamUrl, {
      signal: AbortSignal.timeout(60_000),
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: `ComfyUI 서버에 연결할 수 없습니다: ${
          err instanceof Error ? err.message : "알 수 없는 오류"
        }`,
      },
      { status: 502 }
    );
  }

  if (!res.ok) {
    return NextResponse.json(
      { error: `ComfyUI /view 요청 실패: HTTP ${res.status}` },
      { status: res.status }
    );
  }

  const contentType = res.headers.get("content-type") ?? "video/mp4";

  return new NextResponse(res.body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=86400, immutable",
    },
  });
}
