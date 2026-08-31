import type { PendingDraft, Profile } from "./types";

const DATABASE_NAME = "sign-spotter";
const DATABASE_VERSION = 1;
const STORE_NAME = "app-state";
const PROFILE_KEY = "profile";
const DRAFT_KEY = "pending-draft";

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () =>
      reject(request.error ?? new Error("IndexedDB request failed.")),
    );
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve());
    transaction.addEventListener("abort", () =>
      reject(transaction.error ?? new Error("IndexedDB transaction was aborted.")),
    );
    transaction.addEventListener("error", () =>
      reject(transaction.error ?? new Error("IndexedDB transaction failed.")),
    );
  });
}

export class AppRepository {
  private databasePromise: Promise<IDBDatabase> | null = null;

  private open(): Promise<IDBDatabase> {
    if (this.databasePromise) return this.databasePromise;
    this.databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.addEventListener("upgradeneeded", () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          request.result.createObjectStore(STORE_NAME);
        }
      });
      request.addEventListener("success", () => resolve(request.result));
      request.addEventListener("error", () =>
        reject(request.error ?? new Error("Could not open local app storage.")),
      );
      request.addEventListener("blocked", () =>
        reject(new Error("Local app storage is blocked by another open tab.")),
      );
    });
    return this.databasePromise;
  }

  private async read<T>(key: string): Promise<T | null> {
    const database = await this.open();
    const transaction = database.transaction(STORE_NAME, "readonly");
    const result = await requestResult(transaction.objectStore(STORE_NAME).get(key));
    await transactionDone(transaction);
    return (result as T | undefined) ?? null;
  }

  private async write<T>(key: string, value: T): Promise<void> {
    const database = await this.open();
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).put(value, key);
    await transactionDone(transaction);
  }

  private async remove(key: string): Promise<void> {
    const database = await this.open();
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(key);
    await transactionDone(transaction);
  }

  getProfile(): Promise<Profile | null> {
    return this.read<Profile>(PROFILE_KEY);
  }

  saveProfile(profile: Profile): Promise<void> {
    return this.write(PROFILE_KEY, profile);
  }

  getDraft(): Promise<PendingDraft | null> {
    return this.read<PendingDraft>(DRAFT_KEY);
  }

  saveDraft(draft: PendingDraft): Promise<void> {
    return this.write(DRAFT_KEY, draft);
  }

  deleteDraft(): Promise<void> {
    return this.remove(DRAFT_KEY);
  }

  async clearAll(): Promise<void> {
    const database = await this.open();
    database.close();
    this.databasePromise = null;
    await requestResult(indexedDB.deleteDatabase(DATABASE_NAME));
  }
}
