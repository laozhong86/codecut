import type { StorageAdapter } from "./types";

export class IndexedDBAdapter<T> implements StorageAdapter<T> {
	private dbName: string;
	private storeName: string;
	private version: number;

	constructor(dbName: string, storeName: string, version = 1) {
		this.dbName = dbName;
		this.storeName = storeName;
		this.version = version;
	}

	private createStoreIfMissing(db: IDBDatabase): void {
		if (!db.objectStoreNames.contains(this.storeName)) {
			db.createObjectStore(this.storeName, { keyPath: "id" });
		}
	}

	private async openDB(version?: number): Promise<IDBDatabase> {
		return new Promise((resolve, reject) => {
			const request =
				version === undefined
					? indexedDB.open(this.dbName)
					: indexedDB.open(this.dbName, version);

			request.onerror = () => reject(request.error);
			request.onblocked = () =>
				reject(
					new DOMException(
						"IndexedDB upgrade blocked by an open connection.",
						"InvalidStateError",
					),
				);
			request.onsuccess = () => {
				const db = request.result;
				db.onversionchange = () => db.close();
				resolve(db);
			};

			request.onupgradeneeded = () => {
				this.createStoreIfMissing(request.result);
			};
		});
	}

	private async ensureObjectStore(db: IDBDatabase): Promise<IDBDatabase> {
		if (db.objectStoreNames.contains(this.storeName)) {
			return db;
		}

		const nextVersion = db.version + 1;
		db.close();
		return this.openDB(nextVersion);
	}

	private isVersionError(error: unknown): boolean {
		return error instanceof DOMException
			? error.name === "VersionError"
			: error instanceof Error && error.name === "VersionError";
	}

	private async getDB(): Promise<IDBDatabase> {
		try {
			const db = await this.openDB(this.version);
			return await this.ensureObjectStore(db);
		} catch (error) {
			if (!this.isVersionError(error)) {
				throw error;
			}

			const db = await this.openDB();
			return await this.ensureObjectStore(db);
		}
	}

	async get(key: string): Promise<T | null> {
		const db = await this.getDB();
		const transaction = db.transaction([this.storeName], "readonly");
		const store = transaction.objectStore(this.storeName);

		return new Promise((resolve, reject) => {
			const request = store.get(key);
			request.onerror = () => reject(request.error);
			request.onsuccess = () => resolve(request.result || null);
		});
	}

	async set(key: string, value: T): Promise<void> {
		const db = await this.getDB();
		const transaction = db.transaction([this.storeName], "readwrite");
		const store = transaction.objectStore(this.storeName);

		return new Promise((resolve, reject) => {
			const request = store.put({ id: key, ...value });
			request.onerror = () => reject(request.error);
			request.onsuccess = () => resolve();
		});
	}

	async remove(key: string): Promise<void> {
		const db = await this.getDB();
		const transaction = db.transaction([this.storeName], "readwrite");
		const store = transaction.objectStore(this.storeName);

		return new Promise((resolve, reject) => {
			const request = store.delete(key);
			request.onerror = () => reject(request.error);
			request.onsuccess = () => resolve();
		});
	}

	async list(): Promise<string[]> {
		const db = await this.getDB();
		const transaction = db.transaction([this.storeName], "readonly");
		const store = transaction.objectStore(this.storeName);

		return new Promise((resolve, reject) => {
			const request = store.getAllKeys();
			request.onerror = () => reject(request.error);
			request.onsuccess = () => resolve(request.result as string[]);
		});
	}

	async getAll(): Promise<T[]> {
		const db = await this.getDB();
		const transaction = db.transaction([this.storeName], "readonly");
		const store = transaction.objectStore(this.storeName);

		return new Promise((resolve, reject) => {
			const request = store.getAll();
			request.onerror = () => reject(request.error);
			request.onsuccess = () => resolve(request.result || []);
		});
	}

	async clear(): Promise<void> {
		const db = await this.getDB();
		const transaction = db.transaction([this.storeName], "readwrite");
		const store = transaction.objectStore(this.storeName);

		return new Promise((resolve, reject) => {
			const request = store.clear();
			request.onerror = () => reject(request.error);
			request.onsuccess = () => resolve();
		});
	}
}

export async function deleteDatabase({
	dbName,
}: {
	dbName: string;
}): Promise<void> {
	return new Promise((resolve, reject) => {
		const request = indexedDB.deleteDatabase(dbName);
		request.onsuccess = () => resolve();
		request.onerror = () => reject(request.error);
	});
}
