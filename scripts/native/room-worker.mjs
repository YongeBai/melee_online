import { fork } from "node:child_process";
import { EventEmitter } from "node:events";
import path from "node:path";
import fs from "node:fs";
import WebSocket from "../../web/node_modules/ws/wrapper.mjs";
const root = path.resolve(import.meta.dirname, "../..");
export class RoomWorker extends EventEmitter {
  constructor(id) {
    super();
    this.id = id;
    this.pending = new Map();
    this.sequence = 0;
  }
  async open() {
    const dir = path.join(root, ".melee-native/rooms", this.id);
    fs.mkdirSync(dir, { recursive: true });
    const log = fs.openSync(path.join(dir, "worker.log"), "a");
    this.child = fork(path.join(root, "scripts/native/server.mjs"), [], {
      env: {
        ...process.env,
        MELEE_ROOM_WORKER: "1",
        MELEE_NATIVE_BACKEND: process.env.MELEE_NATIVE_BACKEND || "OGL",
        MELEE_USER_DIR: dir,
        MELEE_WEB: "0",
        MELEE_PORT: "0",
        MELEE_BIND_HOST: "127.0.0.1",
        MELEE_PUBLIC_ORIGIN: "",
        MELEE_ACCESS_KEY: "",
      },
      stdio: ["ignore", log, log, "ipc"],
    });
    fs.closeSync(log);
    const port = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error("Room worker startup timed out")), 15000);
      this.child.once("message", (m) => {
        clearTimeout(timer);
        resolve(m.port);
      });
      this.child.once("error", reject);
      this.child.once("exit", () => {
        clearTimeout(timer);
        reject(Error("Room worker exited"));
      });
    });
    this.ws = new WebSocket(`ws://127.0.0.1:${port}/engine-session`, {
      origin: "http://localhost:3000",
    });
    this.ws.on("message", (data, binary) => {
      if (binary) {
        this.emit("media", data);
        return;
      }
      const msg = JSON.parse(data);
      const p = this.pending.get(msg.id);
      if (p) {
        this.pending.delete(msg.id);
        clearTimeout(p.timer);
        msg.error ? p.reject(Error(msg.error)) : p.resolve(msg.result);
      } else if (msg.error) this.emit("failure", Error(msg.error));
    });
    this.ws.on("close", () => {
      for (const p of this.pending.values()) {
        clearTimeout(p.timer);
        p.reject(Error("Room worker disconnected"));
      }
      this.pending.clear();
    });
    await new Promise((resolve, reject) => {
      this.ws.once("open", resolve);
      this.ws.once("error", reject);
    });
    return this.request("boot");
  }
  request(type, payload = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.sequence;
      const timer = setTimeout(
        () => {
          this.pending.delete(id);
          reject(Error(`${type} timed out`));
        },
        type === "boot" ? 90000 : 20000,
      );
      this.pending.set(id, { resolve, reject, timer });
      this.ws.send(JSON.stringify({ id, type, payload }));
    });
  }
  rollback(action, options = {}) {
    return this.request("rollback", { action, ...options });
  }
  async css({ cpu = false } = {}) {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    await this.request("start");
    let prepared = false,
      lastPulse = 0,
      entered = 0,
      menuAt = 0,
      cssAt = 0,
      cssFirstFrame = 0,
      lastFrame = 0;
    const end = Date.now() + 60000;
    while (Date.now() < end) {
      const s = await this.request("meleeInspect");
      if (s.major === 2 && s.minor === 0 && s.sceneKind === 8) {
        if (!cssAt || s.sceneFrame < lastFrame) {
          cssAt = Date.now();
          cssFirstFrame = s.sceneFrame;
        }
      } else cssAt = 0;
      lastFrame = s.sceneFrame;
      if (cssAt && Date.now() - cssAt > 2000 && s.sceneFrame - cssFirstFrame >= 120 && s.cssReady) {
        await this.request("meleeControl", { action: "lockCss", online: true, cpu });
        return s;
      }
      if ([0, 24].includes(s.major) && s.sceneFrame > 10 && s.mainPointer !== "0" && !prepared) {
        await this.request("meleeControl", { action: "prepare", online: true, cpu });
        prepared = true;
      }
      if (s.major === 1 && s.sceneKind === 1 && !menuAt) menuAt = Date.now();
      if (
        s.major === 1 &&
        s.sceneKind === 1 &&
        s.sceneFrame > 120 &&
        Date.now() - menuAt > 1500 &&
        Date.now() - entered > 4000
      ) {
        await this.request("meleeControl", { action: "enterCss", online: true, cpu });
        entered = Date.now();
      } else if (s.major !== 1 && s.major !== 2 && Date.now() - lastPulse > 1200) {
        lastPulse = Date.now();
        await this.rollback("pads", { pads: [{ mask: 16 }, {}] });
        await sleep(180);
        await this.rollback("pads", { pads: [{}, {}] });
      }
      await sleep(100);
    }
    throw Error("Room character select timed out");
  }
  close() {
    this.ws?.close();
    this.child?.kill("SIGTERM");
  }
}
