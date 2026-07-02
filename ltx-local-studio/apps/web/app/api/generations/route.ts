import { NextRequest, NextResponse } from "next/server";
import { getServerProvider } from "@/lib/server/provider";
import type { VideoGenerationInput } from "@ltx-studio/generation-core";
import { GenerationError } from "@ltx-studio/generation-core";

const CLIENT_ERROR_CODES = new Set([
  "IMAGE_REQUIRED",
  "BLOB_URL_NOT_SUPPORTED",
  "WORKFLOW_NOT_CONFIGURED",
  "WORKFLOW_IMAGE_NOT_WIRED",
  "IMAGE_UPLOAD_FAILED",
]);

export async function POST(request: NextRequest) {
  const provider = getServerProvider();
  let body: VideoGenerationInput & { startFrameData?: string };
  try {
    body = (await request.json()) as VideoGenerationInput & { startFrameData?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Validate startFrameData before reaching the provider
  const sfd = body.startFrameData;
  if (!sfd) {
    return NextResponse.json(
      { error: "이미지-투-비디오 요청에는 시작 이미지가 필요합니다." },
      { status: 422 }
    );
  }
  if (sfd.startsWith("blob:")) {
    return NextResponse.json(
      { error: "첨부 이미지가 임시 브라우저 주소로 전달되었습니다. 이미지를 다시 선택해 주세요." },
      { status: 422 }
    );
  }
  if (!sfd.startsWith("data:")) {
    return NextResponse.json(
      { error: "첨부 이미지 데이터를 읽을 수 없습니다." },
      { status: 422 }
    );
  }

  try {
    const submission = await provider.submitGeneration(body);
    return NextResponse.json(submission, { status: 201 });
  } catch (err) {
    // Client errors → 422 Unprocessable Entity
    if (err instanceof GenerationError && CLIENT_ERROR_CODES.has(err.code ?? "")) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Submission failed" },
      { status: 500 }
    );
  }
}
