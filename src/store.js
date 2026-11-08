// JSON file storage. One small club fits comfortably in a single file, and it keeps
// the app free of a database server (Render's free tier has no persistent disk; the
// demo reseeds on start when the file is missing).
import fs from 'node:fs';
import path from 'node:path';

export class Store {
  constructor(file, seedFn) {
    this.file = file;
    this.seedFn = seedFn;
    this.data = null;
  }

  load() {
    if (this.file && fs.existsSync(this.file)) {
      this.data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } else {
      this.reset();
    }
    return this.data;
  }

  reset() {
    this.data = this.seedFn();
    this.save();
    return this.data;
  }

  save() {
    if (!this.file) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }

  log(kind, message, extra = {}) {
    this.data.log.unshift({ at: new Date().toISOString(), kind, message, ...extra });
    this.data.log = this.data.log.slice(0, 300);
  }
}
