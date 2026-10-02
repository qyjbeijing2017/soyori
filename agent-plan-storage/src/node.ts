import { randomUUID } from "node:crypto";
import type { Dirent } from "node:fs";
import { lstat, mkdir, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { encode, type Storage, validateKey, validatePrefix } from "./index.js";

function missing(error: unknown) {
  return (error as NodeJS.ErrnoException).code === "ENOENT";
}

export async function atomicWrite(file: string, text: string) {
  await mkdir(dirname(file), { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, text, { flag: "wx", mode: 0o600 });
    await rename(temporary, file);
  } finally {
    await unlink(temporary).catch((e) => {
      if (!missing(e)) throw e;
    });
  }
}

export function createFileStorage(directory: string): Storage {
  const root = resolve(directory);
  async function file(key: string) {
    validateKey(key);
    const parts = `${key}.json`.split("/");
    let current = root;
    // Reject symlinks below the configured root, including existing data files.
    for (const part of parts) {
      current = join(current, part);
      try {
        if ((await lstat(current)).isSymbolicLink())
          throw new Error("STORAGE_PATH: Symlinks inside storage are unsupported.");
      } catch (e) {
        if (!missing(e)) throw e;
      }
    }
    return current;
  }
  return {
    async read(key) {
      const path = await file(key);
      let text: string;
      try {
        text = await readFile(path, "utf8");
      } catch (e) {
        if (missing(e)) return { found: false, value: null };
        throw e;
      }
      try {
        return { found: true, value: JSON.parse(text) };
      } catch {
        throw new Error(`STORAGE_CORRUPT: Invalid JSON at key ${key}.`);
      }
    },
    async write(key, value) {
      const text = encode(value);
      await atomicWrite(await file(key), text);
      return { key };
    },
    async delete(key) {
      const path = await file(key);
      try {
        await unlink(path);
        return { deleted: true };
      } catch (e) {
        if (missing(e)) return { deleted: false };
        throw e;
      }
    },
    async list(prefix = "") {
      validatePrefix(prefix);
      const keys: string[] = [];
      async function walk(dir: string, base: string) {
        let entries: Dirent[];
        try {
          entries = await readdir(dir, { withFileTypes: true });
        } catch (e) {
          if (missing(e)) return;
          throw e;
        }
        for (const item of entries) {
          if (item.isSymbolicLink()) continue;
          const name = `${base}${item.name}`;
          if (item.isDirectory()) await walk(join(dir, item.name), `${name}/`);
          else if (item.isFile() && name.endsWith(".json")) {
            const key = name.slice(0, -5);
            try {
              validateKey(key);
            } catch {
              continue;
            }
            if (key.startsWith(prefix)) keys.push(key);
          }
        }
      }
      await walk(root, "");
      return { keys: keys.sort() };
    },
  };
}
