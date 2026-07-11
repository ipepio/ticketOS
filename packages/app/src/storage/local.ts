import fs from 'node:fs/promises';
import path from 'node:path';
import type { StorageAdapter } from '@ticketos/domain';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads');

export class LocalStorageAdapter implements StorageAdapter {
  constructor(private baseDir: string = UPLOAD_DIR) {}

  async ensureDir(): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true });
  }

  async store(input: { key: string; data: Buffer; mimeType: string }): Promise<string> {
    const filePath = path.join(this.baseDir, input.key);
    await fs.writeFile(filePath, input.data);
    return input.key;
  }

  async retrieve(key: string): Promise<Buffer> {
    const filePath = path.join(this.baseDir, key);
    return fs.readFile(filePath);
  }

  async delete(key: string): Promise<void> {
    const filePath = path.join(this.baseDir, key);
    await fs.unlink(filePath).catch(() => {
      // Ignore if file doesn't exist
    });
  }

  async exists(key: string): Promise<boolean> {
    const filePath = path.join(this.baseDir, key);
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}

export class FakeStorageAdapter implements StorageAdapter {
  private _store = new Map<string, Buffer>();

  async store(input: { key: string; data: Buffer; mimeType: string }): Promise<string> {
    this._store.set(input.key, input.data);
    return input.key;
  }

  async retrieve(key: string): Promise<Buffer> {
    const data = this._store.get(key);
    if (!data) throw new Error(`File not found: ${key}`);
    return data;
  }

  async delete(key: string): Promise<void> {
    this._store.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    return this._store.has(key);
  }
}
