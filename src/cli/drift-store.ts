import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import { ProviderBaseline } from '../drift-detector';

export interface DriftStore {
  load(providerName: string): Promise<ProviderBaseline | null>;
  save(baseline: ProviderBaseline): Promise<void>;
  listProviders(): Promise<string[]>;
}

export class FileDriftStore implements DriftStore {
  constructor(private dir: string) {}

  private getFilePath(providerName: string): string {
    return path.join(this.dir, `${providerName}.json`);
  }

  async load(providerName: string): Promise<ProviderBaseline | null> {
    const filePath = this.getFilePath(providerName);
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(content) as ProviderBaseline;
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        return null;
      }
      throw err;
    }
  }

  async save(baseline: ProviderBaseline): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    const filePath = this.getFilePath(baseline.providerName);
    const content = JSON.stringify(baseline, null, 2);
    await fs.writeFile(filePath, content, 'utf-8');
  }

  async listProviders(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.dir);
      return files
        .filter((f) => f.endsWith('.json'))
        .map((f) => f.slice(0, -5));
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        return [];
      }
      throw err;
    }
  }
}
