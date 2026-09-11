// Local native GPU renderer. The browser receives real encoded frames, not interpolation.
export class NativeHost {
  constructor({ canvas, onStatus, onFrame }) {
    this.canvas = canvas;
    this.onStatus = onStatus;
    this.onFrame = onFrame;
    this.mode = "loading";
    const options = new URLSearchParams(location.search);
    this.online = !options.has("solo") && (!options.has("qa") || options.has("online"));
    this.inputDelayMs = options.has("qa")
      ? Math.max(0, Math.min(150, Number(options.get("inputdelay")) || 0))
      : 0;
    this.presentationHeadroom = 3;
    this.presentationLimit = this.online ? 8 : 6;
    this.videoQueue = [];
    this.decodedAt = new WeakMap();
    this.videoStarted = false;
    const paint = () => {
      // Rollback produces short bursts while simulation catches up. Retain a
      // bounded FIFO so those distinct frames can meet successive display ticks.
      if (this.videoQueue.length >= this.presentationHeadroom) this.videoStarted = true;
      if (this.videoStarted && this.videoQueue.length) {
        const frame = this.videoQueue.shift();
        const queueMs = performance.now() - this.decodedAt.get(frame);
        this.metrics.presentationQueueMs += queueMs;
        this.metrics.maxPresentationQueueMs = Math.max(this.metrics.maxPresentationQueueMs, queueMs);
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
      presentationQueueMs: 0,
      maxPresentationQueueMs: 0,
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
        "This browser needs WebCodecs video decoding. Open this site in Chrome, Edge, or the Codex browser.",
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
    const endpoint = new URL(this.online ? "/room-session" : "/engine-session", location.href);
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
        if (m.type === "room") {
          if (m.token) sessionStorage.setItem("melee.roomToken", m.token);
          if (this.room && this.room.code !== m.room.code) {
            this.decoder?.close();
            this.decoder = undefined;
            for (const frame of this.videoQueue) frame.close();
            this.videoQueue = [];
            this.audio = [];
            this.audioLength = 0;
          }
          this.room = m.room;
          this.roomReceivedAt = performance.now();
          // Refresh held state so a release outside the rollback window cannot
          // leave a controller stuck after a connection stall.
          if (
            m.room.phase === "match" &&
            this.lastInputState &&
            performance.now() - (this.lastInputSentAt || 0) > 100
          )
            this.setInputState(this.lastInputState);
          window.dispatchEvent(new CustomEvent("melee-room", { detail: m.room }));
          return;
        }
        if (m.type === "input-error") {
          this.inputError = m.error;
          return;
        }
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
        while (this.audioLength > (this.online ? 9600 : 48000) && this.audio.length) {
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
            this.decodedAt.set(frame, performance.now());
            this.videoQueue.push(frame);
            while (this.videoQueue.length > this.presentationLimit) {
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
    await this.request(
      "boot",
      this.online ? { token: sessionStorage.getItem("melee.roomToken") } : {},
    );
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
    this.lastInputState = { ...state };
    this.lastInputSentAt = performance.now();
    const packet = JSON.stringify({
      type: "input",
      payload: state,
      epoch: this.room?.epoch,
      frame: this.room
        ? this.room.frame +
          1 +
          Math.min(
            2,
            Math.floor((Math.max(0, performance.now() - this.roomReceivedAt) * 60) / 1000),
          )
        : undefined,
    });
    const send = () => {
      if (this.socket?.readyState === 1) this.socket.send(packet);
    };
    if (this.inputDelayMs) setTimeout(send, this.inputDelayMs);
    else send();
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
