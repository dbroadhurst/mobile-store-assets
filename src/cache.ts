import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// On-disk cache for AI-generated background images. The cache key fingerprints
// (provider, model, size, prompt) so any change forces regeneration. A separate
// `force` set lets callers bypass the cache for specific screenshot ids.

export class BackgroundCache {
  private dir: string;
  private force: Set<string>;
  private hits = 0;
  private misses = 0;

  constructor(projectRoot: string, forceIds: string[] = []) {
    this.dir = path.join(projectRoot, 'marketing', '.cache', 'backgrounds');
    this.force = new Set(forceIds);
    fs.mkdirSync(this.dir, { recursive: true });
  }

  /** Force regeneration of a specific id regardless of cache state. */
  shouldForce(id: string): boolean {
    return this.force.has(id) || this.force.has('*');
  }

  key(provider: string, model: string, size: string, prompt: string): string {
    return crypto
      .createHash('sha1')
      .update(`${provider}|${model}|${size}|${prompt}`)
      .digest('hex')
      .slice(0, 16);
  }

  pathFor(key: string): string {
    return path.join(this.dir, `${key}.png`);
  }

  read(key: string): Buffer | null {
    const p = this.pathFor(key);
    if (!fs.existsSync(p)) {
      this.misses++;
      return null;
    }
    this.hits++;
    return fs.readFileSync(p);
  }

  write(key: string, buf: Buffer): void {
    fs.writeFileSync(this.pathFor(key), buf);
  }

  stats(): { hits: number; misses: number } {
    return { hits: this.hits, misses: this.misses };
  }
}
