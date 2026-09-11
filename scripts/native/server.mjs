import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { WebSocketServer } from "../../web/node_modules/ws/wrapper.mjs";
import { H264Frames, videoPacket } from "./video.mjs";
import { inspectMelee, controlMelee } from "../engine/melee-memory.js";
import { createWebHandler, webAccess } from "./web-server.mjs";
const root = path.resolve(import.meta.dirname, "../..");
const worker = process.env.MELEE_ROOM_WORKER === "1";
const user = process.env.MELEE_USER_DIR || path.join(root, ".melee-native");
const backend = process.env.MELEE_NATIVE_BACKEND || "OGL";
const serveWeb = process.env.MELEE_WEB === "1";
const bindHost = process.env.MELEE_BIND_HOST || "127.0.0.1";
const port = Number(process.env.MELEE_PORT || (serveWeb ? 3000 : 3002));
const publicOrigin = process.env.MELEE_PUBLIC_ORIGIN;
const accessKey = process.env.MELEE_ACCESS_KEY || "";
if (publicOrigin && new URL(publicOrigin).origin !== publicOrigin)
  throw Error("MELEE_PUBLIC_ORIGIN must be an origin without a trailing slash");
const external =
  !["127.0.0.1", "localhost", "::1"].includes(bindHost) ||
  (publicOrigin && !["localhost", "127.0.0.1", "[::1]"].includes(new URL(publicOrigin).hostname));
if (external && (!publicOrigin?.startsWith("https://") || accessKey.length < 24))
  throw Error(
    "A public server requires an HTTPS MELEE_PUBLIC_ORIGIN and a 24+ character MELEE_ACCESS_KEY",
  );
const origins = publicOrigin ? [publicOrigin] : ["http://localhost:3000", "http://127.0.0.1:3000"];
const access = webAccess({ key: accessKey, secure: publicOrigin?.startsWith("https://") });
for (const d of ["Config", "Pipes", "Cache", "Logs"])
  fs.mkdirSync(path.join(user, d), { recursive: true });
const pipe = path.join(user, "Pipes", "Melee");
if (!fs.existsSync(pipe)) spawnSync("mkfifo", [pipe]);
fs.writeFileSync(
  path.join(user, "Config", "Dolphin.ini"),
  `[Core]\nCPUThread = ${worker ? "False" : "True"}\nCPUCore = 1\nMMU = ${worker ? "True" : "False"}\nGFXBackend = ${backend}\nEmulationSpeed = 1.0\nEnableCheats = False\nSIDevice0 = 6\nSIDevice1 = ${worker ? 6 : 0}\nSIDevice2 = 0\nSIDevice3 = 0\n[Interface]\nConfirmStop = False\nUsePanicHandlers = False\n[Display]\nRenderWindowWidth = 1280\nRenderWindowHeight = 720\n[DSP]\nBackend = No audio output\nDSPHLE = True\n[Analytics]\nEnabled = False\n`,
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
const http = createServer(
  serveWeb
    ? createWebHandler({
        root,
        access,
        health: () => ({ running: !!dolphin, width: 1280, height: 720, backend, ...stats }),
      })
    : (req, res) => {
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({ running: !!dolphin, width: 1280, height: 720, backend, ...stats }),
        );
      },
);
const wss = new WebSocketServer({
  noServer: true,
  maxPayload: 65536,
  verifyClient: (info) =>
    info.req.url === "/engine-session" &&
    origins.includes(info.origin) &&
    access.authorized(info.req),
});
http.on("upgrade", (req, socket, head) => {
  if (req.url === "/engine-session")
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  else if (worker || req.url !== "/room-session") socket.destroy();
});
const roomService = worker
  ? null
  : (await import("./rooms.mjs")).attachRooms(http, { access, origins });
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
    if (heap[0x479d30] === 2 && heap[0x479d33] === 0) {
      for (let port = 0; port < 2; port++) {
        const cursor = v.getUint32(0x4a0bc0 + port * 4);
        if (valid(cursor) && cursor + 0x14 <= 0x81800000) read(cursor - 0x80000000, 0x14);
      }
    }
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
function nativeCommand(command, value, extra = "") {
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
    dolphin.stdin.write(`${command} ${Number(value)} ${id} ${extra}\n`);
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
      if (
        (start >= 0x1c00 && start < 0x1d00) ||
        (start >= 0x2800 && start < 0x2f00) ||
        (start >= 0x3000 && start < 0x400000)
      )
        codeChanged = true;
    }
    if (codeChanged) await nativeCommand("invalidate", 0);
    return result;
  } finally {
    await pause(wasPaused);
  }
}
const axis = (value) => Math.max(0, Math.min(1, ((value ?? 128) - 128) / 192 + 0.5));
async function directPad(port, p = {}) {
  let button = 0;
  for (const [mask, gc] of [
    [1, 256],
    [2, 512],
    [4, 1024],
    [8, 2048],
    [16, 4096],
    [32, 64],
    [64, 32],
    [128, 16],
  ])
    if (p.mask & mask) button |= gc;
  const values = [
    button,
    p.stickX ?? 128,
    p.stickY ?? 128,
    p.cStickX ?? 128,
    p.cStickY ?? 128,
    p.triggerLeft ?? 0,
    p.triggerRight ?? 0,
    p.analogA ?? 0,
    p.analogB ?? 0,
  ];
  await nativeCommand("pad", port, values.join(" "));
}
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
        if (line.startsWith("MELEE_ERROR=")) {
          const id = Number(line.slice(12));
          pending.get(id)?.reject(Error("Native state save or restore failed"));
          pending.delete(id);
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
  if (serveWeb && [...wss.clients].some((peer) => peer !== ws && peer.readyState === 1)) {
    ws.close(1013, "This private worker already has an active player");
    return;
  }
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
          case "rollback": {
            if (!worker) throw Error("Rollback commands require an isolated room worker");
            const p = m.payload;
            if (p.action === "advance") {
              const startTime = performance.now();
              if (!Number.isInteger(p.slot) || p.slot < 0 || p.slot >= 18)
                throw Error("Invalid rollback slot");
              if (p.save !== false) await nativeCommand("snapshot", p.slot);
              const savedAt = performance.now();
              await directPad(0, p.pads[0]);
              await directPad(1, p.pads[1]);
              const inputAt = performance.now();
              await nativeCommand("step", 1);
              stats.rollbackTiming = {
                save: savedAt - startTime,
                input: inputAt - savedAt,
                step: performance.now() - inputAt,
              };
            } else if (p.action === "pads") {
              await directPad(0, p.pads[0]);
              await directPad(1, p.pads[1]);
            } else if (p.action === "step") await nativeCommand("step", 1);
            else if (p.action === "snapshot" || p.action === "restore" || p.action === "cachetest") {
              if (!Number.isInteger(p.slot) || p.slot < 0 || p.slot >= 18)
                throw Error("Invalid rollback slot");
              await nativeCommand(p.action, p.slot);
            } else if (p.action === "suppress") await nativeCommand("suppress", p.value ? 1 : 0);
            else if (p.action === "stepping") await nativeCommand("stepping", p.value ? 1 : 0);
            else if (p.action === "hash") {
              readMemory(true);
              return {
                hash: createHash("sha256").update(heap).digest("hex"),
                state: inspectMelee(module),
              };
            } else throw Error("Invalid rollback action");
            return { state: { ...readMemory(), nativeStats: stats } };
          }
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
http.listen(port, bindHost, () => {
  console.log(
    `Melee ${serveWeb ? "production server" : "GPU bridge"} on ${bindHost}:${http.address().port}`,
  );
  process.send?.({ port: http.address().port });
});
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    roomService?.close();
    stop();
    process.exit();
  });
