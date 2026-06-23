import { type NextRequest, NextResponse } from "next/server";
import { auth, isAuthEnabled } from "@/lib/auth/server";
import { generateUploadKey, isR2Configured, uploadToR2 } from "@/lib/r2/upload";

const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

function detectImageContentType({ bytes }: { bytes: Uint8Array }): string | null {
	if (
		bytes[0] === 0xff &&
		bytes[1] === 0xd8 &&
		bytes[2] === 0xff
	) {
		return "image/jpeg";
	}
	if (
		bytes[0] === 0x89 &&
		bytes[1] === 0x50 &&
		bytes[2] === 0x4e &&
		bytes[3] === 0x47 &&
		bytes[4] === 0x0d &&
		bytes[5] === 0x0a &&
		bytes[6] === 0x1a &&
		bytes[7] === 0x0a
	) {
		return "image/png";
	}
	if (
		bytes[0] === 0x47 &&
		bytes[1] === 0x49 &&
		bytes[2] === 0x46 &&
		bytes[3] === 0x38 &&
		(bytes[4] === 0x37 || bytes[4] === 0x39) &&
		bytes[5] === 0x61
	) {
		return "image/gif";
	}
	if (
		bytes[0] === 0x52 &&
		bytes[1] === 0x49 &&
		bytes[2] === 0x46 &&
		bytes[3] === 0x46 &&
		bytes[8] === 0x57 &&
		bytes[9] === 0x45 &&
		bytes[10] === 0x42 &&
		bytes[11] === 0x50
	) {
		return "image/webp";
	}
	return null;
}

export async function POST(request: NextRequest) {
	try {
		if (!isAuthEnabled()) {
			return NextResponse.json(
				{ error: "Authentication is required for image uploads" },
				{ status: 503 },
			);
		}
		const session = await auth.api.getSession({ headers: request.headers });
		if (!session) {
			return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
		}

		if (!isR2Configured()) {
			return NextResponse.json(
				{ error: "R2 storage is not configured" },
				{ status: 503 },
			);
		}

		const formData = await request.formData();
		const file = formData.get("file");

		if (!(file instanceof File)) {
			return NextResponse.json(
				{
					error:
						"No file provided. Send a file via multipart form field 'file'.",
				},
				{ status: 400 },
			);
		}

		if (file.size > MAX_FILE_SIZE) {
			return NextResponse.json(
				{
					error: `File too large (${(file.size / 1024 / 1024).toFixed(1)}MB).`,
				},
				{ status: 400 },
			);
		}

		const arrayBuffer = await file.arrayBuffer();
		const contentType = detectImageContentType({
			bytes: new Uint8Array(arrayBuffer.slice(0, 16)),
		});
		if (!contentType || !ALLOWED_TYPES.includes(contentType)) {
			return NextResponse.json(
				{
					error: `Invalid image content. Allowed: ${ALLOWED_TYPES.join(", ")}`,
				},
				{ status: 400 },
			);
		}

		const key = generateUploadKey({ filename: file.name });
		const url = await uploadToR2({
			data: arrayBuffer,
			key,
			contentType,
		});

		return NextResponse.json({ url });
	} catch (error) {
		console.error("Image upload error:", error);
		return NextResponse.json(
			{ error: error instanceof Error ? error.message : "Upload failed" },
			{ status: 500 },
		);
	}
}
