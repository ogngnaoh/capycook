// CDP screencast recorder — adapted from tools/demo.mjs. The renderer PUSHES
// frames as events, so nothing serializes behind (and deadlocks) the
// automation's evaluate/waitFor commands — a blocking Page.captureScreenshot
// on the same renderer does exactly that. During live-sim windows every
// evidence still therefore comes from latestFrame(), never page.screenshot().
import { writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const CAP_MS = 200; // 5 fps — evidence, not cinema; keeps frame dirs small
// everyNthFrame throttles the CDP push rate at the SOURCE. Chrome emits one
// screencast frame per Nth compositor frame; at ~60Hz, N=12 ≈ 5fps — matched to
// CAP_MS so the incoming rate ≈ what we persist. The old N=2 (~30fps) flooded
// PNG frames faster than the fire-and-forget acks could keep up, so Chrome
// silently paused the screencast mid-flood and judges got a frozen pre-handoff
// frame (BC-B-8 intermittent false-FAILs). The 1.5s watchdog below is the
// backstop, not the fix — matching the rates removes the flood that trips it.
const EVERY_NTH_FRAME = 12;

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
      this.lastFreshAt = Date.now();
      this.client.send('Page.screencastFrameAck', { sessionId: frame.sessionId }).catch(() => {});
    });
    await this.client.send('Page.startScreencast', { format: 'png', everyNthFrame: EVERY_NTH_FRAME });
    this.running = true;
    this.startedAt = Date.now();
    this.lastFreshAt = Date.now();
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
        // Watchdog: Chrome pauses the screencast when an ack is lost (the ack
        // send is fire-and-forget), which wedges it permanently mid-flood —
        // frames then go stale while this loop keeps re-stamping them
        // (run-001/002 fed judges a frozen pre-handoff frame labeled 26–29s,
        // mis-failing BC-B-8). No fresh frame for 1.5s on a live page →
        // restart the screencast.
        if (this.running && Date.now() - this.lastFreshAt > 1500) {
          try { await this.client.send('Page.stopScreencast'); } catch { /* gone */ }
          try {
            await this.client.send('Page.startScreencast', { format: 'png', everyNthFrame: EVERY_NTH_FRAME });
            this.lastFreshAt = Date.now();
          } catch { /* session gone; stop() will clean up */ }
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
