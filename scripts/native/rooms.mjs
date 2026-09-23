import { randomBytes, randomInt } from "node:crypto";
import { WebSocketServer } from "../../web/node_modules/ws/wrapper.mjs";
import { RoomWorker } from "./room-worker.mjs";
import { RollbackSession, dolphinAdapter, neutralPad, sanitizePad } from "./rollback.mjs";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function attachRooms(
  http,
  { access, origins, maxRooms = 4, makeWorker = (id) => new RoomWorker(id) },
) {
  const rooms = new Map(),
    tokens = new Map();
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4096 });
  const send = (ws, obj) => {
    if (ws?.readyState === 1) ws.send(JSON.stringify(obj));
  };
  http.on("upgrade", (req, socket, head) => {
    if (req.url !== "/room-session") return;
    if (!origins.includes(req.headers.origin) || !access.authorized(req)) {
      socket.end("HTTP/1.1 403 Forbidden\r\n\r\n");
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit("connection", ws, req));
  });
  function view(room, seat) {
    return {
      code: room.code,
      seat,
      connected: room.seats.map((s) => !!s?.ws && s.ws.readyState === 1),
      ready: room.seats.map((s) => !!s?.ready),
      cpu: !!room.cpu,
      hasGuest: !!room.seats[1],
      phase: room.phase,
      epoch: room.epoch,
      frame: room.rollback?.frame ?? 0,
      rollback: room.rollback?.stats ?? null,
      pacing: room.pacing ?? null,
      error: room.error || null,
    };
  }
  function publish(room) {
    for (let i = 0; i < 2; i++) send(room.seats[i]?.ws, { type: "room", room: view(room, i) });
  }
  async function stopRollback(room) {
    room.running = false;
    await room.step?.catch(() => {});
    if (room.rollback) {
      await room.worker.rollback("stepping", { value: false });
      room.rollback = null;
    }
  }
  async function destroy(room) {
    rooms.delete(room.code);
    clearInterval(room.timer);
    room.running = false;
    for (const s of room.seats) if (s) tokens.delete(s.token);
    room.worker.close();
  }
  function bind(room, index, ws, token = randomBytes(24).toString("base64url")) {
    const old = room.seats[index];
    if (old?.ws && old.ws !== ws) old.ws.close(4001, "Session resumed elsewhere");
    const seat = { ws, token, ready: false, tapJump: old?.tapJump ?? true, lastInput: 0 };
    room.seats[index] = seat;
    ws.membership = { room, index };
    tokens.set(token, { room, index });
    send(ws, { type: "room", room: view(room, index), token });
    publish(room);
  }
  async function create(ws) {
    if (rooms.size >= maxRooms) throw Error("All game rooms are busy. Try again shortly.");
    let code;
    do {
      code = Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join("");
    } while (rooms.has(code));
    const room = {
      code,
      seats: [null, null],
      phase: "loading",
      pads: [neutralPad(), neutralPad()],
      worker: makeWorker(code),
      running: false,
      scene: "",
      emptySince: 0,
      cpu: true,
    };
    rooms.set(code, room);
    bind(room, 0, ws);
    room.worker.on("media", (data) => {
      for (const seat of room.seats) {
        const peer = seat?.ws;
        if (peer?.readyState !== 1) continue;
        if (peer.bufferedAmount > 2e6) {
          peer.needsKey = true;
          continue;
        }
        if (data[0] === 1 && peer.needsKey) {
          if (!(data[1] & 1)) continue;
          peer.needsKey = false;
        }
        peer.send(data);
      }
    });
    room.worker.on("failure", (error) => {
      room.error = error.message;
      room.running = false;
      room.phase = "error";
      publish(room);
    });
    room.boot = (async () => {
      await room.worker.open();
      room.state = await room.worker.css({ cpu: room.cpu });
      room.scene = `${room.state.major}:${room.state.minor}:${room.state.sceneKind}`;
      room.sceneAt = Date.now() - 2000;
      room.sceneFirstFrame = room.state.sceneFrame - 120;
      room.lastSceneFrame = room.state.sceneFrame;
      room.lockedScene = room.sceneAt;
      await room.worker.request("meleeControl", { action: "roomLayout", online: true });
      room.phase = "selecting";
      publish(room);
      room.timer = setInterval(() => void monitor(room), 100);
    })();
    try {
      await room.boot;
    } catch (e) {
      room.phase = "error";
      room.error = e.message;
      publish(room);
      delete ws.membership;
      await destroy(room);
      throw e;
    }
    return room;
  }
  async function monitor(room) {
    if (room.monitoring || !rooms.has(room.code)) return;
    room.monitoring = true;
    try {
      if (!room.seats.some((s) => s?.ws?.readyState === 1)) {
        room.emptySince ||= Date.now();
        if (Date.now() - room.emptySince > 30000) await destroy(room);
        return;
      }
      room.emptySince = 0;
      if (
        room.rollback ||
        room.starting ||
        room.changing ||
        room.joining ||
        ["disconnected", "error"].includes(room.phase)
      )
        return;
      const state = await room.worker.request("meleeInspect");
      room.state = state;
      const scene = `${state.major}:${state.minor}:${state.sceneKind}`;
      if (scene !== room.scene || state.sceneFrame < room.lastSceneFrame) {
        room.scene = scene;
        room.sceneAt = Date.now();
        room.sceneFirstFrame = state.sceneFrame;
      }
      room.lastSceneFrame = state.sceneFrame;
      const sceneProgress = state.sceneFrame - room.sceneFirstFrame;
      if (room.cpu && state.major === 2 && state.minor === 2 && state.sceneKind === 2) {
        room.phase = "match";
        publish(room);
        return;
      }
      if (
        state.major === 2 &&
        state.minor === 2 &&
        state.sceneKind === 2 &&
        state.match?.elapsed >= 1 &&
        sceneProgress >= 6 &&
        room.seats.every((s) => s?.ws?.readyState === 1)
      ) {
        await room.worker.request("pause");
        await room.worker.rollback("stepping", { value: true });
        await room.worker.rollback("step");
        room.rollback = new RollbackSession(dolphinAdapter(room.worker));
        room.pacing = { deadlineResets: 0, maxBehindMs: 0 };
        for (let port = 0; port < 2; port++) room.rollback.input(port, 0, room.pads[port]);
        room.epoch = randomBytes(8).toString("hex");
        room.phase = "match";
        room.running = true;
        publish(room);
        void run(room);
        return;
      }
      if (state.major === 2 && state.minor === 1) room.phase = "stage";
      if (state.major === 2 && state.minor === 0 && state.sceneKind === 8) {
        const settled = state.cssReady && sceneProgress >= 90 && Date.now() - room.sceneAt > 1500;
        if (settled && room.restoreCpu) {
          await room.worker.request("meleeControl", { action: "opponent", cpu: true });
          room.restoreCpu = false;
          room.phase = "loading";
          room.sceneAt = Date.now();
          room.sceneFirstFrame = state.sceneFrame;
          publish(room);
          return;
        }
        room.phase = settled ? "selecting" : "loading";
        if (settled && Date.now() - (room.layoutAt || 0) > 1000) {
          await room.worker.request("meleeControl", { action: "roomLayout", online: true });
          room.layoutAt = Date.now();
        }
        if (settled && room.lockedScene !== room.sceneAt) {
          await room.worker.request("meleeControl", {
            action: "lockCss",
            online: true,
            cpu: room.cpu,
          });
          room.lockedScene = room.sceneAt;
          for (const s of room.seats) if (s) s.ready = false;
        }
      }
      if (
        state.major === 2 &&
        state.minor === 4 &&
        state.sceneKind === 5 &&
        state.sceneFrame > 180 &&
        Date.now() - room.sceneAt > 3000
      ) {
        await room.worker.request("meleeControl", { action: "returnCss", online: true });
      }
      publish(room);
    } catch (e) {
      if (room.phase !== "error") room.error = e.message;
      publish(room);
    } finally {
      room.monitoring = false;
    }
  }
  async function run(room) {
    let next = performance.now();
    try {
      while (room.running && rooms.has(room.code)) {
        room.step = room.rollback.advance();
        const result = await room.step;
        room.state = result.state;
        publish(room);
        if (result.state.major !== 2 || result.state.minor !== 2) {
          await stopRollback(room);
          await room.worker.request("start");
          break;
        }
        next += 1000 / 60;
        const behind = performance.now() - next;
        room.pacing.maxBehindMs = Math.max(room.pacing.maxBehindMs, behind);
        // A correction burst can exceed 100 ms despite ample average headroom.
        // Catch up instead of permanently slowing the match after each burst;
        // discard the deadline only after a substantial host stall.
        if (behind > 500) {
          next = performance.now();
          room.pacing.deadlineResets++;
        }
        await sleep(Math.max(0, next - performance.now()));
      }
    } catch (e) {
      room.running = false;
      room.phase = "error";
      room.error = e.message;
      publish(room);
    }
  }
  async function leave(ws) {
    const m = ws.membership;
    if (!m) return;
    const { room, index } = m;
    if (index === 1 && room.seats[0]) return kick(room, 0, false);
    delete ws.membership;
    const seat = room.seats[index];
    if (seat?.ws !== ws) return;
    tokens.delete(seat.token);
    room.seats[index] = null;
    room.pads[index] = neutralPad();
    if (!room.seats.some(Boolean)) {
      await destroy(room);
      return;
    }
    await stopRollback(room);
    await room.worker.request("pause");
    room.phase = "disconnected";
    publish(room);
  }
  async function kick(room, index, notify = true) {
    if (index !== 0) throw Error("Only the room owner can kick a player");
    if (room.starting || room.changing || room.joining) throw Error("Wait for the room transition");
    const guest = room.seats[1];
    if (!guest) throw Error("There is no player to kick");
    room.changing = true;
    try {
      tokens.delete(guest.token);
      room.seats[1] = null;
      room.cpu = true;
      room.restoreCpu = true;
      room.pads = [neutralPad(), neutralPad()];
      room.seats[0].ready = false;
      if (guest.ws) {
        delete guest.ws.membership;
        if (notify) {
          send(guest.ws, { type: "kicked" });
          guest.ws.close(4003, "Removed by room owner");
        }
      }
      await stopRollback(room);
      await room.worker.rollback("pads", { pads: room.pads });
      const state = await room.worker.request("meleeInspect");
      if (state.major === 2 && state.minor === 2) {
        await room.worker.request("meleeControl", { action: "quit" });
        room.phase = "returning";
      } else if (state.major === 2 && state.minor === 1) {
        await room.worker.rollback("pads", { pads: [{ ...neutralPad(), mask: 2 }, neutralPad()] });
        await room.worker.request("start");
        await sleep(180);
        await room.worker.rollback("pads", { pads: room.pads });
        room.phase = "loading";
      } else {
        await room.worker.request("meleeControl", { action: "opponent", cpu: true });
        room.restoreCpu = false;
        room.phase = "loading";
        room.sceneAt = Date.now();
        room.sceneFirstFrame = state.sceneFrame;
      }
      await room.worker.request("start");
      publish(room);
    } finally {
      room.changing = false;
    }
  }
  wss.on("connection", (ws) => {
    ws.needsKey = true;
    let commands = Promise.resolve(),
      budget = 0;
    const quota = setInterval(() => (budget = 0), 1000);
    ws.on("message", (data) => {
      if (++budget > 180) {
        ws.close(1008, "Too many messages");
        return;
      }
      let msg;
      try {
        msg = JSON.parse(data);
      } catch {
        ws.close(1008, "Invalid message");
        return;
      }
      if (msg.type === "input") {
        try {
          const m = ws.membership;
          if (!m) return;
          const { room, index } = m;
          if (room.seats[index]?.ws !== ws) return;
          if (room.changing || room.joining || room.starting) return;
          if (room.phase === "stage" && index !== 0) return;
          if (room.rollback && msg.epoch !== room.epoch) return;
          const pad = sanitizePad(msg.payload);
          room.pads[index] = pad;
          room.seats[index].lastInput = Date.now();
          if (room.rollback) {
            if (msg.epoch === room.epoch) room.rollback.input(index, msg.frame, pad);
          } else if (
            room.phase === "selecting" ||
            room.phase === "stage" ||
            (room.cpu && room.phase === "match")
          ) {
            if (room.phase === "stage" && index !== 0) return;
            if (room.phase !== "match") pad.mask &= ~16;
            void room.worker.rollback("pads", { pads: room.pads }).catch(() => {});
          }
        } catch (e) {
          send(ws, { type: "input-error", error: e.message });
        }
        return;
      }
      commands = commands
        .catch(() => {})
        .then(async () => {
          try {
            let m = ws.membership,
              result = {};
            const p = msg.payload || {};
            if (msg.type === "boot") {
              if (!m && p.token && tokens.has(p.token)) {
                const saved = tokens.get(p.token);
                bind(saved.room, saved.index, ws, p.token);
                m = ws.membership;
                await saved.room.boot;
              }
              if (!m) {
                await create(ws);
                m = ws.membership;
              } else await m.room.boot;
              if (
                m.room.phase === "disconnected" &&
                (m.room.seats.every((s) => s?.ws?.readyState === 1) ||
                  (m.room.cpu && m.index === 0) ||
                  (m.room.state?.minor === 0 &&
                    m.room.seats.every((s) => !s || s.ws?.readyState === 1)))
              ) {
                await m.room.worker.request("start");
                m.room.phase = "selecting";
                publish(m.room);
              }
              result = { engine: "native", width: 1280, height: 720, room: view(m.room, m.index) };
            } else if (msg.type === "roomJoin") {
              const code = String(p.code || "")
                .trim()
                .toUpperCase();
              const target = rooms.get(code);
              if (!target) throw Error("Room not found");
              if (target === m?.room) {
                result = view(target, m.index);
              } else {
                if (
                  target.joining ||
                  target.starting ||
                  target.changing ||
                  target.seats[1] ||
                  !["selecting", "loading"].includes(target.phase)
                )
                  throw Error("Room is full or already playing");
                target.joining = true;
                try {
                  await leave(ws);
                  if (!rooms.has(target.code)) throw Error("Room closed");
                  bind(target, 1, ws);
                  ws.needsKey = true;
                  await target.boot;
                  if (target.cpu) {
                    await target.worker.request("meleeControl", { action: "opponent", cpu: false });
                    target.cpu = false;
                    target.phase = "loading";
                    publish(target);
                    target.state = await target.worker.css({ cpu: false });
                    target.scene = `${target.state.major}:${target.state.minor}:${target.state.sceneKind}`;
                    target.sceneAt = Date.now() - 2000;
                    target.sceneFirstFrame = target.state.sceneFrame - 120;
                    target.lastSceneFrame = target.state.sceneFrame;
                    target.lockedScene = target.sceneAt;
                  }
                  target.pads = [neutralPad(), neutralPad()];
                  for (const seat of target.seats) if (seat) seat.ready = false;
                  await target.worker.rollback("pads", { pads: target.pads });
                  await target.worker.request("start");
                  target.phase = "selecting";
                  publish(target);
                  result = view(target, 1);
                } finally {
                  target.joining = false;
                }
              }
            } else if (!m) throw Error("Create or join a room first");
            else {
              const { room, index } = m;
              if (msg.type === "meleeInspect") {
                result = room.state || (await room.worker.request("meleeInspect"));
                result = {
                  ...result,
                  cssCursor: result.cssCursors?.[index] || result.cssCursor,
                  tapJump: result.tapJumpByPort?.[index] ?? result.tapJump,
                  netplay: { mode: room.cpu ? "cpu" : "server-rollback", ...view(room, index) },
                };
              } else if (msg.type === "start" || msg.type === "pause") {
              } // UI never suspends another player.
              else if (msg.type === "roomLeave") {
                await leave(ws);
                await create(ws);
                result = view(ws.membership.room, 0);
              } else if (msg.type === "roomKick") {
                await kick(room, index);
              } else if (msg.type === "roomCpu") {
                if (index !== 0) throw Error("Only the room owner can change the opponent");
                if (room.phase !== "selecting" || room.starting || room.changing || room.joining)
                  throw Error("Change opponent at character select");
                if (room.seats[1]) throw Error("Remove the other player before adding a CPU");
                if (typeof p.enabled !== "boolean") throw Error("Invalid CPU setting");
                room.changing = true;
                try {
                  await room.worker.request("meleeControl", { action: "opponent", cpu: p.enabled });
                  room.cpu = p.enabled;
                  room.sceneAt = Date.now();
                  room.sceneFirstFrame = room.state.sceneFrame;
                  room.pads = [neutralPad(), neutralPad()];
                  await room.worker.rollback("pads", { pads: room.pads });
                  room.seats[0].ready = false;
                  room.phase = "loading";
                  publish(room);
                } finally {
                  room.changing = false;
                }
              } else if (msg.type === "meleeControl") {
                if (p.action === "start") {
                  if (room.starting || room.changing || room.joining)
                    throw Error("Wait for the room transition");
                  if (room.phase !== "selecting") throw Error("Not at character select");
                  if (!room.cpu && !room.seats.every((s) => s?.ws?.readyState === 1))
                    throw Error("Waiting for the other player");
                  room.seats[index].ready = !room.seats[index].ready;
                  publish(room);
                  if (
                    (room.cpu || room.seats.every((s) => s.ready)) &&
                    !room.starting &&
                    !room.changing
                  ) {
                    room.starting = true;
                    room.phase = "starting";
                    publish(room);
                    try {
                      await room.worker.request("meleeControl", {
                        action: "start",
                        online: true,
                        cpu: room.cpu,
                      });
                      room.pads = [neutralPad(), neutralPad()];
                      await room.worker.rollback("pads", {
                        pads: [{ ...room.pads[0], mask: 16 }, room.pads[1]],
                      });
                      await sleep(180);
                      await room.worker.rollback("pads", { pads: room.pads });
                      room.phase = "stage";
                    } catch (e) {
                      room.phase = "selecting";
                      for (const seat of room.seats) if (seat) seat.ready = false;
                      throw e;
                    } finally {
                      room.starting = false;
                      publish(room);
                    }
                  }
                } else if (p.action === "tapJump") {
                  if (room.phase !== "selecting") throw Error("Change controls before the match");
                  room.seats[index].tapJump = p.enabled !== false;
                  await room.worker.request("meleeControl", {
                    action: "tapJump",
                    online: true,
                    port: index,
                    enabled: p.enabled,
                  });
                } else if (["prepare", "enterCss", "lockCss", "returnCss"].includes(p.action)) {
                } // Lifecycle is server-owned.
                else throw Error("This action is not available in online rooms");
                result = room.state;
              } else if (msg.type === "roomPing")
                result = { now: Date.now(), frame: room.rollback?.frame ?? 0 };
              else throw Error("Unknown room command");
            }
            send(ws, { id: msg.id, result });
          } catch (e) {
            send(ws, { id: msg.id, error: e.message });
          }
        });
    });
    ws.on("close", () => {
      clearInterval(quota);
      const m = ws.membership;
      if (!m || m.room.seats[m.index]?.ws !== ws) return;
      const room = m.room;
      room.seats[m.index].ws = null;
      room.seats[m.index].ready = false;
      room.pads[m.index] = neutralPad();
      room.running = false;
      void stopRollback(room)
        .then(() => room.worker.request("pause"))
        .then(() => room.worker.rollback("pads", { pads: room.pads }))
        .catch(() => {});
      room.phase = "disconnected";
      publish(room);
    });
  });
  const close = () => {
    for (const room of rooms.values()) void destroy(room);
    wss.close();
  };
  process.once("exit", close);
  return { rooms, close };
}
