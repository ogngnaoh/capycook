// CDP screencast recorder — adapted from tools/demo.mjs. The renderer PUSHES
// frames as events, so nothing serializes behind (and deadlocks) the
// automation's evaluate/waitFor commands — a blocking Page.captureScreenshot
// on the same renderer does exactly that. During live-sim windows every
// evidence still therefore comes from latestFrame(), never page.screenshot().
import { writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const CAP_MS = 200; // 5 fps — evidence, not cinema; keeps frame dirs small

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class Recorder {
  constructor(page, dir) {
    this.page = page;
    this.dir = dir;
    this.frames = []; // { t: ms-since-start, file }
    this.latest = null;
    this.startedAt = null;
    this.running = false;
    this.done = null;
    this.client = null;
    mkdirSync(dir, { recursive: true });
  }
  async start() {
    this.client = await this.page.target().createCDPSession();
    this.client.on('Page.screencastFrame', (frame) => {
      this.latest = Buffer.from(frame.data, 'base64');
      this.client.send('Page.screencastFrameAck', { sessionId: frame.sessionId }).catch(() => {});
    });
    await this.client.send('Page.startScreencast', { format: 'png', everyNthFrame: 2 });
    this.running = true;
    this.startedAt = Date.now();
    this.done = (async () => {
      let n = 0;
      while (this.running) {
        const t0 = Date.now();
        if (this.latest) {
          n += 1;
          const file = `frame-${String(n).padStart(5, '0')}.png`;
          writeFileSync(join(this.dir, file), this.latest);
          this.frames.push({ t: Date.now() - this.startedAt, file });
        }
        const rest = CAP_MS - (Date.now() - t0);
        if (rest > 0) await sleep(rest);
      }
    })();
  }
  // The non-blocking "screenshot" for mid-wait evidence.
  latestFrame() { return this.latest; }
  async stop() {
    if (!this.running) return;
    this.running = false;
    await this.done;
    try { await this.client.send('Page.stopScreencast'); } catch { /* gone */ }
    try { await this.client.detach(); } catch { /* gone */ }
  }
  // Pick ≤ maxFrames evenly spaced frames over [fromMs, toMs] for a judge's
  // evidence sheet. Returns [{ t, file }] referencing files in this.dir.
  sampleFrames({ fromMs = 0, toMs = Infinity, maxFrames = 20 } = {}) {
    const inWindow = this.frames.filter((f) => f.t >= fromMs && f.t <= toMs);
    if (inWindow.length <= maxFrames) return inWindow;
    const step = (inWindow.length - 1) / (maxFrames - 1);
    return Array.from({ length: maxFrames }, (_, i) => inWindow[Math.round(i * step)]);
  }
}

// Best-effort mp4 assembly of a frame dir (kept for the human at B5, not for
// judges — judges read sampled stills). Skips quietly when ffmpeg is absent.
export function encodeVideo(frameDir, outFile, fps = 5) {
  const hasFrames = readdirSync(frameDir).some((f) => f.startsWith('frame-'));
  if (!hasFrames) return false;
  const res = spawnSync('ffmpeg', [
    '-y', '-framerate', String(fps), '-pattern_type', 'glob',
    '-i', join(frameDir, 'frame-*.png'),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-vf', 'scale=800:-2',
    outFile,
  ], { stdio: 'ignore' });
  return res.status === 0;
}
