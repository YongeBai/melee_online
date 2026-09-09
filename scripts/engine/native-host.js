// Local native GPU renderer. The browser receives real encoded frames, not interpolation.
export class NativeHost {
  constructor({ canvas, onStatus, onFrame }) {
    this.canvas = canvas;
    this.onStatus = onStatus;
    this.onFrame = onFrame;
    this.mode = "loading";
    this.videoQueue = [];
    this.videoStarted = false;
    const paint = () => {
      if (this.videoQueue.length >= 3) this.videoStarted = true;
      if (this.videoStarted && this.videoQueue.length) {
        const frame = this.videoQueue.shift();
        this.ctx.drawImage(frame, 0, 0, 1280, 720);
        frame.close();
        this.metrics.presented++;
        this.onFrame({ native: true, ...this.metrics });
      }
      if (!this.videoQueue.length) this.videoStarted = false;
      requestAnimationFrame(paint);
    };
    requestAnimationFrame(paint);
    this.sequence = 0;
    this.pending = new Map();
    this.audio = [];
    this.audioLength = 0;
    this.metrics = {
      decoded: 0,
      presented: 0,
      received: 0,
      width: 1280,
      height: 720,
      decodeErrors: 0,
    };
    canvas.width = 1280;
    canvas.height = 720;
    canvas.style.width = "min(100vw,177.777dvh)";
    canvas.style.height = "min(56.25vw,100dvh)";
    this.ctx = canvas.getContext("2d", { alpha: false, desynchronized: true });
    this.adapter = { request: (type, payload) => this.request(type, payload) };
  }
  async mountFile() {
    if (!globalThis.VideoDecoder)
      throw Error(
        "This browser needs WebCodecs video decoding. Open localhost:3000 in Chrome, Edge, or the Codex browser.",
      );
    this.socket?.close();
    this.decoder?.close();
    this.decoder = undefined;
    for (const frame of this.videoQueue) frame.close();
    this.videoQueue = [];
    this.videoStarted = false;
    this.audio = [];
    this.audioLength = 0;
    this.onStatus("Starting the local GPU renderer…");
    const endpoint = new URL("/engine-session", location.href);
    endpoint.protocol = location.protocol === "https:" ? "wss:" : "ws:";
    this.socket = new WebSocket(endpoint);
    this.socket.binaryType = "arraybuffer";
    await new Promise((resolve, reject) => {
      this.socket.onopen = resolve;
      this.socket.onerror = () => reject(Error("The game server is unavailable."));
    });
    this.socket.onmessage = (event) => {
      if (typeof event.data === "string") {
        const m = JSON.parse(event.data);
        const p = this.pending.get(m.id);
        if (p) {
          this.pending.delete(m.id);
          m.error ? p.reject(Error(m.error)) : p.resolve(m.result);
        } else if (m.error) {
          this.mode = "error";
          this.onStatus(m.error);
        }
        return;
      }
      const data = new Uint8Array(event.data);
      if (data[0] === 2) {
        if (this.paused) return;
        const pcm = new Int16Array(event.data.slice(1));
        this.audio.push(pcm);
        this.audioLength += pcm.length;
        while (this.audioLength > 48000 && this.audio.length) {
          this.audioLength -= this.audio.shift().length;
        }
        return;
      }
      if (data[0] !== 1) return;
      this.metrics.received++;
      const key = Boolean(data[1]),
        timestamp = new DataView(event.data).getFloat64(2, true),
        encoded = data.subarray(10);
      if (!this.decoder) {
        if (!key) return;
        let codec = "avc1.42C020";
        for (let i = 0; i < encoded.length - 7; i++)
          if (
            encoded[i] === 0 &&
            encoded[i + 1] === 0 &&
            encoded[i + 2] === 1 &&
            (encoded[i + 3] & 31) === 7
          ) {
            codec =
              "avc1." +
              Array.from(encoded.subarray(i + 4, i + 7), (v) =>
                v.toString(16).padStart(2, "0"),
              ).join("");
            break;
          }
        this.decoder = new VideoDecoder({
          output: (frame) => {
            this.metrics.decoded++;
            this.videoQueue.push(frame);
            while (this.videoQueue.length > 6) {
              this.videoQueue.shift().close();
              this.metrics.dropped = (this.metrics.dropped || 0) + 1;
            }
          },
          error: (error) => {
            this.metrics.decodeErrors++;
            this.onStatus(error.message);
            this.decoder = undefined;
          },
        });
        this.decoder.configure({
          codec,
          codedWidth: 1280,
          codedHeight: 720,
          optimizeForLatency: true,
        });
      }
      try {
        this.decoder.decode(
          new EncodedVideoChunk({ type: key ? "key" : "delta", timestamp, data: encoded }),
        );
      } catch (e) {
        this.onStatus(e.message);
      }
    };
    this.socket.onclose = () => {
      this.mode = "error";
      for (const request of this.pending.values())
        request.reject(Error("Game server disconnected. Reload this page to reconnect."));
      this.pending.clear();
      this.onStatus("Game server disconnected. Reload this page to reconnect.");
    };
    await this.request("boot");
    this.mode = "dolphin";
  }
  request(type, payload = {}) {
    if (this.socket?.readyState !== 1)
      return Promise.reject(Error("Native bridge is not connected"));
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      const timer = setTimeout(
        () => {
          this.pending.delete(id);
          reject(Error(`Native ${type} request timed out`));
        },
        type === "boot" ? 90000 : 15000,
      );
      this.pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      this.socket.send(JSON.stringify({ id, type, payload }));
    });
  }
  setInputState(state) {
    if (this.socket?.readyState === 1)
      this.socket.send(JSON.stringify({ type: "input", payload: state }));
  }
  start() {
    this.paused = false;
    this.audio = [];
    this.audioLength = 0;
    if (this.socket?.readyState === 1)
      void this.request("start").catch((error) => this.onStatus(error.message));
  }
  pause() {
    this.paused = true;
    if (this.socket?.readyState === 1)
      void this.request("pause").catch((error) => this.onStatus(error.message));
    this.audio = [];
    this.audioLength = 0;
  }
  configureAudioWorklet() {
    return Promise.resolve({ available: false });
  }
  async mixAudio(frames = 1024) {
    const n = Math.min(frames * 2, this.audioLength),
      samples = new Int16Array(n);
    let at = 0;
    while (at < n) {
      const chunk = this.audio[0],
        count = Math.min(chunk.length, n - at);
      samples.set(chunk.subarray(0, count), at);
      at += count;
      this.audioLength -= count;
      if (count === chunk.length) this.audio.shift();
      else this.audio[0] = chunk.subarray(count);
    }
    return {
      available: true,
      frames: n / 2,
      channels: 2,
      sampleRate: 48000,
      samples,
      stats: `native PCM · ${this.metrics.presented} displayed frames`,
    };
  }
}
