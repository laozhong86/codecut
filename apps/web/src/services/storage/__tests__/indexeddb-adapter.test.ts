import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { IndexedDBAdapter } from "../indexeddb-adapter";

interface FakeDatabaseState {
	version: number;
	stores: Map<string, Map<IDBValidKey, unknown>>;
}

const originalIndexedDbDescriptor = Object.getOwnPropertyDescriptor(
	globalThis,
	"indexedDB",
);

function restoreIndexedDB(): void {
	if (originalIndexedDbDescriptor) {
		Object.defineProperty(globalThis, "indexedDB", originalIndexedDbDescriptor);
		return;
	}

	Reflect.deleteProperty(globalThis, "indexedDB");
}

class FakeObjectStoreNames {
	constructor(private readonly state: FakeDatabaseState) {}

	contains(name: string): boolean {
		return this.state.stores.has(name);
	}
}

class FakeObjectStore {
	constructor(private readonly records: Map<IDBValidKey, unknown>) {}

	get(key: IDBValidKey): IDBRequest<unknown> {
		return successRequest(this.records.get(key));
	}

	put(value: Record<string, unknown>): IDBRequest<IDBValidKey> {
		const key = value.id as IDBValidKey;
		this.records.set(key, value);
		return successRequest(key);
	}

	delete(key: IDBValidKey): IDBRequest<undefined> {
		this.records.delete(key);
		return successRequest(undefined);
	}

	getAllKeys(): IDBRequest<IDBValidKey[]> {
		return successRequest([...this.records.keys()]);
	}

	getAll(): IDBRequest<unknown[]> {
		return successRequest([...this.records.values()]);
	}

	clear(): IDBRequest<undefined> {
		this.records.clear();
		return successRequest(undefined);
	}
}

class FakeIDBDatabase {
	readonly objectStoreNames: FakeObjectStoreNames;

	constructor(private readonly state: FakeDatabaseState) {
		this.objectStoreNames = new FakeObjectStoreNames(state);
	}

	get version(): number {
		return this.state.version;
	}

	createObjectStore(name: string): FakeObjectStore {
		const records = new Map<IDBValidKey, unknown>();
		this.state.stores.set(name, records);
		return new FakeObjectStore(records);
	}

	transaction(storeNames: string[]): {
		objectStore: (name: string) => FakeObjectStore;
	} {
		for (const storeName of storeNames) {
			if (!this.state.stores.has(storeName)) {
				throw new DOMException(
					"One of the specified object stores was not found.",
					"NotFoundError",
				);
			}
		}

		return {
			objectStore: (name: string) => {
				const records = this.state.stores.get(name);
				if (!records) {
					throw new DOMException(
						"One of the specified object stores was not found.",
						"NotFoundError",
					);
				}
				return new FakeObjectStore(records);
			},
		};
	}

	close(): void {}
}

function successRequest<T>(result: T): IDBRequest<T> {
	const request = {
		result,
		error: null,
		onsuccess: null,
		onerror: null,
	} as unknown as IDBRequest<T>;

	queueMicrotask(() => request.onsuccess?.(new Event("success")));

	return request;
}

function makeOpenRequest(): IDBOpenDBRequest {
	return {
		result: undefined,
		error: null,
		onsuccess: null,
		onerror: null,
		onupgradeneeded: null,
	} as unknown as IDBOpenDBRequest;
}

function installFakeIndexedDB(): void {
	const databases = new Map<string, FakeDatabaseState>();

	const fakeIndexedDB = {
		open: (name: string, version?: number): IDBOpenDBRequest => {
			const request = makeOpenRequest();

			queueMicrotask(() => {
				const existingState = databases.get(name);
				if (
					existingState &&
					version !== undefined &&
					version < existingState.version
				) {
					const error = new DOMException(
						"The requested version is lower than the current version.",
						"VersionError",
					);
					Object.defineProperty(request, "error", { value: error });
					request.onerror?.(new Event("error"));
					return;
				}

				const targetVersion = version ?? existingState?.version ?? 1;
				const state =
					existingState ??
					({
						version: targetVersion,
						stores: new Map<string, Map<IDBValidKey, unknown>>(),
					} satisfies FakeDatabaseState);

				databases.set(name, state);
				const needsUpgrade = !existingState || targetVersion > state.version;
				state.version = Math.max(state.version, targetVersion);
				const db = new FakeIDBDatabase(state);
				Object.defineProperty(request, "result", { value: db });

				if (needsUpgrade) {
					request.onupgradeneeded?.({
						target: request,
					} as unknown as IDBVersionChangeEvent);
				}

				request.onsuccess?.(new Event("success"));
			});

			return request;
		},
		deleteDatabase: (name: string): IDBOpenDBRequest => {
			const request = makeOpenRequest();
			queueMicrotask(() => {
				databases.delete(name);
				request.onsuccess?.(new Event("success"));
			});
			return request;
		},
	};

	Object.defineProperty(globalThis, "indexedDB", {
		configurable: true,
		value: fakeIndexedDB,
	});
}

async function createLegacyDatabase({
	dbName,
	storeName,
}: {
	dbName: string;
	storeName: string;
}): Promise<void> {
	await new Promise<void>((resolve, reject) => {
		const request = indexedDB.open(dbName, 1);
		request.onerror = () => reject(request.error);
		request.onupgradeneeded = () => {
			request.result.createObjectStore(storeName, { keyPath: "id" });
		};
		request.onsuccess = () => {
			request.result.close();
			resolve();
		};
	});
}

describe("IndexedDBAdapter", () => {
	beforeEach(() => {
		installFakeIndexedDB();
	});

	afterEach(() => {
		restoreIndexedDB();
	});

	test("creates a missing object store when an existing database has the same version", async () => {
		await createLegacyDatabase({
			dbName: "video-editor-generated-voices",
			storeName: "legacy-store",
		});

		const adapter = new IndexedDBAdapter<{ value: string }>(
			"video-editor-generated-voices",
			"generated-voices",
			1,
		);

		await expect(adapter.get("missing")).resolves.toBeNull();

		await adapter.set("voice-1", { value: "ok" });

		await expect(adapter.get("voice-1")).resolves.toMatchObject({
			value: "ok",
		});
	});
});
