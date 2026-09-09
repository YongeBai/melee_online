import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { WebSocketServer } from "../../web/node_modules/ws/wrapper.mjs";
import { H264Frames, videoPacket } from "./video.mjs";
import { inspectMelee, controlMelee } from "../engine/melee-memory.js";
const root = path.resolve(import.meta.dirname, "../..");
const user = path.join(root, ".melee-native");
const backend = process.env.MELEE_NATIVE_BACKEND || "OGL";
for (const d of ["Config", "Pipes", "Cache", "Logs"])
  fs.mkdirSync(path.join(user, d), { recursive: true });
const pipe = path.join(user, "Pipes", "Melee");
if (!fs.existsSync(pipe)) spawnSync("mkfifo", [pipe]);
fs.writeFileSync(
  path.join(user, "Config", "Dolphin.ini"),
  `[Core]\nCPUThread = True\nCPUCore = 1\nGFXBackend = ${backend}\nEmulationSpeed = 1.0\nEnableCheats = False\nSIDevice0 = 6\nSIDevice1 = 0\nSIDevice2 = 0\nSIDevice3 = 0\n[Interface]\nConfirmStop = False\nUsePanicHandlers = False\n[Display]\nRenderWindowWidth = 1280\nRenderWindowHeight = 720\n[DSP]\nBackend = No audio output\nDSPHLE = True\n[Analytics]\nEnabled = False\n`,
);
fs.writeFileSync(
  path.join(user, "Config", "GFX.ini"),
  `[Hardware]\nVSync = False\n[Settings]\nInternalResolution = 2\nAspectRatio = 2\nMSAA = 1\nShowFPS = False\nShaderCompilationMode = 2\nWaitForShadersBeforeStarting = True\n[Hacks]\nEFBScaledCopy = True\n`,
);
const btns = ["A", "B", "X", "Y", "Z", "Start"];
let padConfig = "[GCPad1]\nDevice = Pipe/0/Melee\n";
for (const b of btns) padConfig += `Buttons/${b} = \`Button ${b.toUpperCase()}\`\n`;
for (const [group, prefix] of [
  ["Main Stick", "MAIN"],
  ["C-Stick", "C"],
])
  for (const [direction, axis, sign] of [
    ["Up", "Y", "+"],
    ["Down", "Y", "-"],
    ["Left", "X", "-"],
    ["Right", "X", "+"],
  ])
    padConfig += `${group}/${direction} = \`Axis ${prefix} ${axis} ${sign}\`\n`;
for (const b of ["L", "R"])
  padConfig += `Triggers/${b} = \`Button ${b}\`\nTriggers/${b}-Analog = \`Axis ${b} +\`\n`;
padConfig += "Main Stick/Radius = 100\nC-Stick/Radius = 100\n";
fs.writeFileSync(path.join(user, "Config", "GCPadNew.ini"), padConfig);
const http = createServer((req, res) => {
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify({ running: !!dolphin, width: 1280, height: 720, backend, ...stats }));
});
const wss = new WebSocketServer({
  server: http,
  maxPayload: 65536,
  verifyClient: (info) => ["http://localhost:3000", "http://127.0.0.1:3000"].includes(info.origin),
});
let dolphin,
  encoder,
  memfd,
  memBase,
  padfd,
  logfd,
  bootPromise,
  serial = Promise.resolve(),
  requestId = 0;
const heap = new Uint8Array(0x1800000),
  module = { HEAPU8: heap };
const pending = new Map();
const stats = { encoded: 0, captured: 0, videoBytes: 0 };
let memoryReady = false,
  nativePaused = false;
const broadcast = (data) => {
  for (const ws of wss.clients) {
    if (ws.readyState !== 1) continue;
    if (ws.bufferedAmount > 2e6) {
      ws.needsKey = true;
      continue;
    }
    if (Buffer.isBuffer(data) && data[0] === 1) {
      if (ws.needsKey && !data[1]) continue;
      ws.needsKey = false;
    }
    ws.send(data);
  }
};
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
function readMemory(full = false) {
  if (memfd === undefined || memBase === undefined) throw Error("Native Melee is booting");
  const read = (offset, length) => {
    let done = 0;
    while (done < length) {
      const n = fs.readSync(memfd, heap, offset + done, length - done, memBase + offset + done);
      if (!n) throw Error("Native memory read ended");
      done += n;
    }
  };
  if (full || !memoryReady) read(0, heap.length);
  else {
    read(0x450000, 0x90000);
    read(0x2f00, 4);
    const v = new DataView(heap.buffer),
      valid = (p) => p >= 0x80003100 && p < 0x81800000;
    const scene = v.getUint32(0x4d6720);
    if (valid(scene)) read(scene - 0x80000000, 16);
    for (let i = 0; i < 2; i++) {
      const slot = 0x453080 + i * 0xe90,
        index = heap[slot + 0xc];
      if (index >= 2) continue;
      const gobj = v.getUint32(slot + 0xb0 + index * 4);
      if (!valid(gobj)) continue;
      read(gobj - 0x80000000 + 0x2c, 4);
      const fp = v.getUint32(gobj - 0x80000000 + 0x2c);
      if (valid(fp)) read(fp - 0x80000000, 0x100);
    }
  }
  if (
    !memoryReady &&
    (Buffer.from(heap.subarray(0, 6)).toString() !== "GALE01" ||
      heap[0x37750c] !== 124 ||
      heap[0x37750d] !== 8)
  )
    throw Error("Waiting for Melee executable");
  const state = inspectMelee(module);
  memoryReady = true;
  return state;
}
function nativeCommand(command, value) {
  if (!dolphin) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const id = ++requestId;
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(Error(`Native ${command} timed out`));
    }, 10000);
    pending.set(id, {
      resolve: () => {
        clearTimeout(timer);
        if (command === "pause") nativePaused = Boolean(value);
        resolve();
      },
      reject: (reason) => {
        clearTimeout(timer);
        reject(reason);
      },
    });
    dolphin.stdin.write(`${command} ${Number(value)} ${id}\n`);
  });
}
const pause = (value) => nativeCommand("pause", value);
async function control(payload) {
  const wasPaused = nativePaused;
  await pause(true);
  try {
    readMemory(true);
    const previous = heap.slice();
    const result = controlMelee(module, { setCorePaused() {} }, payload.action, payload);
    let i = 0,
      codeChanged = false;
    while (i < heap.length) {
      if (heap[i] === previous[i]) {
        i++;
        continue;
      }
      const start = i;
      while (i < heap.length && heap[i] !== previous[i]) i++;
      fs.writeSync(memfd, heap, start, i - start, memBase + start);
      // The low-memory toggle is data; only executable writes need to discard JIT blocks.
      if ((start >= 0x2800 && start < 0x2f00) || (start >= 0x3000 && start < 0x400000))
        codeChanged = true;
    }
    if (codeChanged) await nativeCommand("invalidate", 0);
    return result;
  } finally {
    await pause(wasPaused);
  }
}
const axis = (value) => Math.max(0, Math.min(1, ((value ?? 128) - 128) / 192 + 0.5));
function setInput(p) {
  if (padfd === undefined) return;
  let text = "";
  for (const [mask, name] of [
    [1, "A"],
    [2, "B"],
    [4, "X"],
    [8, "Y"],
    [16, "START"],
    [32, "L"],
    [64, "R"],
    [128, "Z"],
  ])
    text += `${p.mask & mask ? "PRESS" : "RELEASE"} ${name}\n`;
  text += `SET MAIN ${axis(p.stickX)} ${axis(p.stickY)}\nSET C ${axis(p.cStickX)} ${axis(p.cStickY)}\nSET L ${(p.triggerLeft || 0) / 255}\nSET R ${(p.triggerRight || 0) / 255}\n`;
  fs.writeSync(padfd, text);
}
function stop() {
  const child = dolphin;
  dolphin = undefined;
  child?.kill("SIGTERM");
  if (child)
    setTimeout(() => {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    }, 2000).unref();
  encoder?.kill("SIGTERM");
  encoder = undefined;
  for (const fd of [memfd, padfd, logfd])
    if (fd !== undefined)
      try {
        fs.closeSync(fd);
      } catch {}
  memfd = padfd = logfd = memBase = undefined;
  bootPromise = undefined;
  memoryReady = false;
  nativePaused = false;
  for (const request of pending.values()) request.reject(Error("Native renderer stopped"));
  pending.clear();
}
async function boot() {
  if (bootPromise) return bootPromise;
  bootPromise = (async () => {
    const discs = fs.readdirSync(root).filter((n) => /\.(iso|gcm)$/i.test(n));
    const disc = discs.find((n) => /melee/i.test(n)) || discs[0];
    if (!disc) throw Error("Local Melee disc missing");
    const discFd = fs.openSync(path.join(root, disc), "r"),
      header = Buffer.alloc(8);
    fs.readSync(discFd, header, 0, 8, 0);
    fs.closeSync(discFd);
    if (header.subarray(0, 6).toString() !== "GALE01" || header[7] !== 2)
      throw Error("The local renderer requires Melee USA 1.02.");
    Object.assign(stats, { encoded: 0, captured: 0, videoBytes: 0, lastExit: null });
    const log = (logfd = fs.openSync(path.join(user, "Logs", "native.log"), "w"));
    encoder = spawn(
      "ffmpeg",
      [
        "-hide_banner",
        "-loglevel",
        "warning",
        "-f",
        "rawvideo",
        "-pixel_format",
        "rgba",
        "-video_size",
        "960x720",
        "-framerate",
        "60",
        "-i",
        "pipe:0",
        "-an",
        "-vf",
        "pad=1280:720:160:0:black,format=yuv420p",
        "-c:v",
        "libx264",
        "-preset",
        "ultrafast",
        "-tune",
        "zerolatency",
        "-crf",
        "18",
        "-threads",
        "4",
        "-g",
        "60",
        "-keyint_min",
        "60",
        "-x264-params",
        "aud=1:repeat-headers=1:bframes=0:scenecut=0",
        "-fps_mode",
        "passthrough",
        "-f",
        "h264",
        "pipe:1",
      ],
      { stdio: ["pipe", "pipe", log] },
    );
    let sequence = 0;
    const parser = new H264Frames((frame) => {
      const packet = videoPacket(frame, sequence++);
      stats.encoded++;
      stats.videoBytes += frame.length;
      broadcast(packet);
    });
    encoder.stdout.on("data", (chunk) => parser.push(chunk));
    encoder.on("error", (error) => {
      broadcast(JSON.stringify({ error: error.message }));
      stop();
    });
    const videoEncoder = encoder;
    encoder.on("exit", (code, signal) => {
      if (encoder !== videoEncoder) return;
      broadcast(JSON.stringify({ error: `Video encoder stopped (${code ?? signal})` }));
      stop();
    });

    dolphin = spawn(
      path.join(root, "engines/dolphin-native/build/Binaries/dolphin-emu-nogui"),
      ["--platform", "headless", "--user", user, "--exec", path.join(root, disc)],
      {
        cwd: root,
        env: { ...process.env, MELEE_STREAM: "1", EGL_PLATFORM: "surfaceless" },
        stdio: ["pipe", "pipe", log, "pipe", "pipe"],
      },
    );
    const child = dolphin;
    dolphin.on("error", (e) => {
      broadcast(JSON.stringify({ error: e.message }));
      stop();
    });
    dolphin.on("exit", (code, signal) => {
      if (dolphin !== child) return;
      stats.lastExit = { code, signal };
      console.log("Native renderer exited", stats.lastExit);
      broadcast(JSON.stringify({ error: `Native renderer stopped (${code ?? signal})` }));
      stop();
    });
    let output = "";
    dolphin.stdout.on("data", (data) => {
      if (dolphin !== child) return;
      if (logfd !== undefined) fs.writeSync(log, data);
      output += data;
      let i;
      while ((i = output.indexOf("\n")) >= 0) {
        const line = output.slice(0, i);
        output = output.slice(i + 1);
        if (line.startsWith("MELEE_MEM1=")) {
          memBase = Number(line.slice(11));
          memfd = fs.openSync(`/proc/${dolphin.pid}/mem`, "r+");
        }
        if (line.startsWith("MELEE_ACK=")) {
          const id = Number(line.slice(10));
          pending.get(id)?.resolve();
          pending.delete(id);
        }
      }
    });
    let raw = 0;
    dolphin.stdio[3].on("data", (data) => {
      raw += data.length;
      stats.captured = Math.floor(raw / (960 * 720 * 4));
    });
    dolphin.stdio[3].pipe(encoder.stdin);
    encoder.stdin.on("error", () => {});
    let pcmRemainder = Buffer.alloc(0);
    dolphin.stdio[4].on("data", (data) => {
      const pcm = Buffer.concat([pcmRemainder, data]);
      const bytes = pcm.length - (pcm.length % 4); // Complete interleaved stereo samples.
      if (bytes) broadcast(Buffer.concat([Buffer.from([2]), pcm.subarray(0, bytes)]));
      pcmRemainder = pcm.subarray(bytes);
    });
    padfd = fs.openSync(pipe, fs.constants.O_RDWR | fs.constants.O_NONBLOCK);
    const start = Date.now();
    while (Date.now() - start < 60000) {
      if (!dolphin)
        throw Error("Native renderer stopped during boot; see .melee-native/Logs/native.log");
      try {
        readMemory();
        return { engine: "native", width: 1280, height: 720 };
      } catch {}
      await delay(50);
    }
    throw Error("Native disc boot timed out; see .melee-native/Logs/native.log");
  })().catch((error) => {
    stop();
    throw error;
  });
  return bootPromise;
}
wss.on("connection", (ws) => {
  ws.needsKey = true;
  ws.on("close", () => {
    if (wss.clients.size === 0) {
      setInput({ mask: 0 });
      serial = serial
        .catch(() => {})
        .then(() => {
          if (wss.clients.size === 0) return pause(true);
        });
      void serial.catch(() => {});
    }
  });
  ws.on("message", async (data) => {
    let m;
    try {
      m = JSON.parse(data);
      if (m.type === "input") {
        setInput(m.payload);
        return;
      }
      const run = async () => {
        switch (m.type) {
          case "boot":
            return boot();
          case "meleeInspect":
            return { ...readMemory(), nativeStats: stats };
          case "meleeControl":
            return control(m.payload);
          case "pause":
            await pause(true);
            return {};
          case "start":
            await pause(false);
            return {};
          default:
            throw Error("Unknown native command");
        }
      };
      serial = serial.catch(() => {}).then(run);
      const result = await serial;
      if (ws.readyState === 1) ws.send(JSON.stringify({ id: m.id, result }));
    } catch (error) {
      if (ws.readyState === 1) ws.send(JSON.stringify({ id: m?.id, error: error.message }));
    }
  });
});
http.listen(3002, "127.0.0.1", () => console.log("Native GPU bridge on localhost:3002"));
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    stop();
    process.exit();
  });
