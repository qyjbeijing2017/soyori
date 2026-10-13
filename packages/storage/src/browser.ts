import { encode, type Storage, validateKey, validatePrefix } from "./index.js";

export function createBrowserStorage(database = "agent-plan-storage"): Storage {
  // Existing IndexedDB names are retained across the Soyori rename.
  async function transaction<T>(
    mode: IDBTransactionMode,
    action: (store: IDBObjectStore, result: (value: T) => void) => void,
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      let blocked = false;
      const opening = indexedDB.open(database, 1);
      opening.onupgradeneeded = () => opening.result.createObjectStore("documents");
      opening.onerror = () => reject(opening.error);
      opening.onblocked = () => {
        blocked = true;
        reject(new Error("STORAGE_BLOCKED: Close other tabs using this database."));
      };
      opening.onsuccess = () => {
        const db = opening.result;
        if (blocked) {
          db.close();
          return;
        }
        db.onversionchange = () => db.close();
        const tx = db.transaction("documents", mode);
        let value: T;
        tx.oncomplete = () => {
          db.close();
          resolve(value);
        };
        tx.onabort = () => {
          db.close();
          reject(tx.error ?? new Error("STORAGE_ABORTED"));
        };
        tx.onerror = () => {
          /* onabort reports the failure */
        };
        try {
          action(tx.objectStore("documents"), (v) => {
            value = v;
          });
        } catch (e) {
          tx.abort();
          reject(e);
        }
      };
    });
  }
  return {
    read(key) {
      validateKey(key);
      return transaction("readonly", (store, result) => {
        const request = store.get(key);
        request.onsuccess = () => {
          try {
            result(
              request.result === undefined
                ? { found: false, value: null }
                : { found: true, value: JSON.parse(request.result) },
            );
          } catch {
            request.transaction?.abort();
          }
        };
      });
    },
    write(key, value) {
      validateKey(key);
      const text = encode(value);
      return transaction("readwrite", (store, result) => {
        store.put(text, key);
        result({ key });
      });
    },
    delete(key) {
      validateKey(key);
      return transaction("readwrite", (store, result) => {
        const request = store.count(key);
        request.onsuccess = () => {
          store.delete(key);
          result({ deleted: request.result > 0 });
        };
      });
    },
    list(prefix = "") {
      validatePrefix(prefix);
      return transaction("readonly", (store, result) => {
        const request = store.getAllKeys();
        request.onsuccess = () =>
          result({
            keys: request.result
              .map(String)
              .filter((key) => key.startsWith(prefix))
              .sort(),
          });
      });
    },
  };
}
