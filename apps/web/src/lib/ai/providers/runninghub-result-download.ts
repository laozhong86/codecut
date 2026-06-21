const RUNNINGHUB_DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_RUNNINGHUB_VIDEO_BYTES = 512 * 1024 * 1024;
const MAX_RUNNINGHUB_AUDIO_BYTES = 100 * 1024 * 1024;

type FetchLike = (
	input: RequestInfo | URL,
	init?: RequestInit,
) => Promise<Response>;

function isRunningHubCosHost({ hostname }: { hostname: string }): boolean {
	return (
		hostname.startsWith("rh-images-1252422369.cos.") &&
		hostname.endsWith(".myqcloud.com")
	);
}

export function assertAllowedRunningHubResultUrl({
	url,
}: {
	url: string;
}): URL {
	const parsed = new URL(url);
	if (parsed.protocol !== "https:") {
		throw new Error("RunningHub result URL must use HTTPS");
	}
	if (!isRunningHubCosHost({ hostname: parsed.hostname })) {
		throw new Error("RunningHub result URL host is not allowed");
	}
	return parsed;
}

function assertRunningHubMediaContentType({
	contentType,
	mediaType,
}: {
	contentType: string | null;
	mediaType: "audio" | "video";
}): string {
	if (!contentType) {
		throw new Error("RunningHub result download returned no content type");
	}
	const normalized = contentType.split(";")[0]?.trim().toLowerCase();
	if (!normalized?.startsWith(`${mediaType}/`)) {
		throw new Error(`RunningHub result download returned a non-${mediaType} file`);
	}
	return contentType;
}

async function readBodyWithLimit({
	response,
	maxBytes,
	mediaType,
}: {
	response: Response;
	maxBytes: number;
	mediaType: "audio" | "video";
}): Promise<Uint8Array> {
	const contentLength = response.headers.get("content-length");
	if (contentLength) {
		const parsedLength = Number(contentLength);
		if (Number.isFinite(parsedLength) && parsedLength > maxBytes) {
			throw new Error(`RunningHub result ${mediaType} exceeds the maximum size`);
		}
	}
	if (!response.body) {
		throw new Error("RunningHub result download returned an empty body");
	}

	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let receivedBytes = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			receivedBytes += value.byteLength;
			if (receivedBytes > maxBytes) {
				await reader.cancel();
				throw new Error(
					`RunningHub result ${mediaType} exceeds the maximum size`,
				);
			}
			chunks.push(value);
		}
	} finally {
		reader.releaseLock();
	}

	const bytes = new Uint8Array(receivedBytes);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return bytes;
}

export async function downloadRunningHubMediaResult({
	url,
	mediaType,
	maxBytes,
	fetchImpl = fetch,
}: {
	url: string;
	mediaType: "audio" | "video";
	maxBytes: number;
	fetchImpl?: FetchLike;
}): Promise<{ bytes: Uint8Array; contentType: string }> {
	const parsedUrl = assertAllowedRunningHubResultUrl({ url });
	const abortController = new AbortController();
	const timeout = setTimeout(
		() => abortController.abort(),
		RUNNINGHUB_DOWNLOAD_TIMEOUT_MS,
	);
	try {
		const response = await fetchImpl(parsedUrl, {
			redirect: "manual",
			signal: abortController.signal,
		});
		if (response.status >= 300 && response.status < 400) {
			throw new Error("RunningHub result download redirects are not allowed");
		}
		if (!response.ok) {
			throw new Error(`RunningHub result download failed: ${response.status}`);
		}
		const contentType = assertRunningHubMediaContentType({
			contentType: response.headers.get("content-type"),
			mediaType,
		});
		const bytes = await readBodyWithLimit({
			response,
			maxBytes,
			mediaType,
		});
		return { bytes, contentType };
	} finally {
		clearTimeout(timeout);
	}
}

export function assertAllowedRunningHubVideoUrl({ url }: { url: string }) {
	return assertAllowedRunningHubResultUrl({ url });
}

export function assertAllowedRunningHubAudioUrl({ url }: { url: string }) {
	return assertAllowedRunningHubResultUrl({ url });
}

export async function downloadRunningHubVideoResult({
	url,
	fetchImpl = fetch,
}: {
	url: string;
	fetchImpl?: FetchLike;
}) {
	return downloadRunningHubMediaResult({
		url,
		mediaType: "video",
		maxBytes: MAX_RUNNINGHUB_VIDEO_BYTES,
		fetchImpl,
	});
}

export async function downloadRunningHubAudioResult({
	url,
	fetchImpl = fetch,
}: {
	url: string;
	fetchImpl?: FetchLike;
}) {
	return downloadRunningHubMediaResult({
		url,
		mediaType: "audio",
		maxBytes: MAX_RUNNINGHUB_AUDIO_BYTES,
		fetchImpl,
	});
}
