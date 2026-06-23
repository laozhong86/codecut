import { beforeEach, describe, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";

let authEnabled = true;
let session: unknown = { user: { id: "user-1" } };
let r2Configured = true;
let uploaded:
	| { data: ArrayBuffer | Uint8Array; key: string; contentType: string }
	| null = null;

mock.module("@/lib/auth/server", () => ({
	auth: {
		api: {
			getSession: async () => session,
		},
	},
	isAuthEnabled: () => authEnabled,
}));

mock.module("@/lib/r2/upload", () => ({
	generateUploadKey: ({ filename }: { filename: string }) =>
		`uploads/test-${filename}`,
	isR2Configured: () => r2Configured,
	uploadToR2: async ({
		data,
		key,
		contentType,
	}: {
		data: ArrayBuffer | Uint8Array;
		key: string;
		contentType: string;
	}) => {
		uploaded = { data, key, contentType };
		return `https://cdn.example.com/${key}`;
	},
}));

const { POST } = await import("../image/route");

function uploadRequest({ file }: { file: File }): NextRequest {
	const formData = new FormData();
	formData.append("file", file);
	return new NextRequest("http://localhost:4100/api/upload/image", {
		method: "POST",
		body: formData,
	});
}

function pngBytes(): Uint8Array {
	return new Uint8Array([
		0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00,
	]);
}

describe("image upload route", () => {
	beforeEach(() => {
		authEnabled = true;
		session = { user: { id: "user-1" } };
		r2Configured = true;
		uploaded = null;
	});

	test("rejects uploads when auth is disabled", async () => {
		authEnabled = false;

		const response = await POST(
			uploadRequest({
				file: new File([pngBytes()], "reference.png", {
					type: "image/png",
				}),
			}),
		);

		expect(response.status).toBe(503);
		expect(uploaded).toBeNull();
	});

	test("rejects uploads without an authenticated session", async () => {
		session = null;

		const response = await POST(
			uploadRequest({
				file: new File([pngBytes()], "reference.png", {
					type: "image/png",
				}),
			}),
		);

		expect(response.status).toBe(401);
		expect(uploaded).toBeNull();
	});

	test("rejects client MIME spoofing before uploading to R2", async () => {
		const response = await POST(
			uploadRequest({
				file: new File(["<svg><script>alert(1)</script></svg>"], "x.png", {
					type: "image/png",
				}),
			}),
		);

		expect(response.status).toBe(400);
		expect(uploaded).toBeNull();
	});

	test("uses the server-detected image content type for R2 upload", async () => {
		const response = await POST(
			uploadRequest({
				file: new File([pngBytes()], "reference.bin", {
					type: "application/octet-stream",
				}),
			}),
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			url: "https://cdn.example.com/uploads/test-reference.bin",
		});
		expect(uploaded?.contentType).toBe("image/png");
	});
});
