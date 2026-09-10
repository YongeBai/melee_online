import { test } from "node:test";
import assert from "node:assert/strict";
import { RollbackSession, neutralPad } from "./rollback.mjs";
// Reordered input changes must retain the newer event at its own frame.
test("out-of-order input changes reconcile without erasing later releases", async () => {
  let x = 0;
  const saves = new Map(),
    r = new RollbackSession({
      suppress: async () => {},
      restore: async (i) => (x = saves.get(i)),
      advance: async (i, p, save) => {
        if (save) saves.set(i, x);
        x += p[0].stickX - 128;
      },
    });
  for (let i = 0; i < 8; i++) await r.advance();
  r.input(0, 6, neutralPad());
  r.input(0, 2, { ...neutralPad(), stickX: 224 });
  await r.advance();
  assert.equal(x, 4 * 96);
  assert.equal(r.stats.rollbacks, 1);
});
import { createServer } from "node:http";
import { EventEmitter, once } from "node:events";
import WebSocket from "../../web/node_modules/ws/wrapper.mjs";
import { attachRooms } from "./rooms.mjs";
class FakeWorker extends EventEmitter {
  state = { major: 2, minor: 0, sceneKind: 8, sceneFrame: 300, cssReady: true };
  calls = [];
  async open() {}
  async css() {
    return this.state;
  }
  close() {}
  async request(type, payload) {
    this.calls.push({ type, payload });
    return this.state;
  }
  async rollback(action, payload) {
    this.calls.push({ action, payload });
    return { state: this.state };
  }
}
async function connect(port) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/room-session`, {
    origin: "http://localhost:3000",
  });
  let sequence = 0;
  const pending = new Map();
  ws.on("message", (d) => {
    const m = JSON.parse(d);
    if (m.type === "room") {
      ws.room = m.room;
      if (m.token) ws.token = m.token;
    }
    const p = pending.get(m.id);
    if (p) {
      pending.delete(m.id);
      m.error ? p.reject(Error(m.error)) : p.resolve(m.result);
    }
  });
  await once(ws, "open");
  ws.request = (type, payload = {}) =>
    new Promise((resolve, reject) => {
      const id = ++sequence;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, type, payload }));
    });
  return ws;
}
test("room protocol isolates seats, rejects a third player and resumes private seats", async () => {
  const server = createServer(),
    workers = [];
  const service = attachRooms(server, {
    access: { authorized: () => true },
    origins: ["http://localhost:3000"],
    makeWorker: () => {
      const w = new FakeWorker();
      workers.push(w);
      return w;
    },
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const clients = [];
  try {
    const a = await connect(server.address().port),
      b = await connect(server.address().port),
      c = await connect(server.address().port);
    clients.push(a, b, c);
    await a.request("boot");
    await b.request("boot");
    await c.request("boot");
    assert.notEqual(a.room.code, b.room.code);
    await b.request("roomJoin", { code: a.room.code.toLowerCase() });
    assert.equal(a.room.seat, 0, "Room owner is P1");
    assert.equal(b.room.seat, 1, "Joining player is P2");
    assert.equal(b.room.code, a.room.code);
    await assert.rejects(c.request("roomJoin", { code: a.room.code }), /full/);
    await assert.rejects(c.request("roomJoin", { code: "ZZZZZZ" }), /not found/);
    b.send(JSON.stringify({ type: "input", payload: { ...neutralPad(), mask: 1, port: 0 } }));
    await b.request("roomPing");
    const padCall = workers[0].calls.filter((x) => x.action === "pads").at(-1);
    assert.equal(padCall.payload.pads[0].mask, 0);
    assert.equal(padCall.payload.pads[1].mask, 1);
    await assert.rejects(b.request("meleeControl", { action: "quit" }), /not available/);
    await a.request("meleeControl", { action: "start" });
    assert.equal(workers[0].calls.filter((x) => x.payload?.action === "start").length, 0);
    await b.request("meleeControl", { action: "start" });
    assert.equal(workers[0].calls.filter((x) => x.payload?.action === "start").length, 1);
    const token = b.token;
    b.close();
    await once(b, "close");
    await new Promise((r) => setTimeout(r, 20));
    const resumed = await connect(server.address().port);
    clients.push(resumed);
    await resumed.request("boot", { token });
    assert.equal(resumed.room.seat, 1);
    assert.equal(resumed.room.code, a.room.code);
    await assert.rejects(c.request("meleeControl", { action: "start" }), /Waiting/);
    const ownerToken = a.token;
    const roomCode = a.room.code;
    a.close();
    await once(a, "close");
    await new Promise((r) => setTimeout(r, 20));
    const ownerResumed = await connect(server.address().port);
    clients.push(ownerResumed);
    await ownerResumed.request("boot", { token: ownerToken });
    assert.equal(ownerResumed.room.seat, 0, "Owner stays P1 after refresh");
    assert.equal(ownerResumed.room.code, roomCode);
    assert.equal(resumed.room.seat, 1, "Guest stays P2 when the owner reconnects");
  } finally {
    for (const c of clients) c.close();
    service.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("simultaneous guests cannot claim the same seat", async () => {
  const server = createServer();
  const service = attachRooms(server, {
    access: { authorized: () => true },
    origins: ["http://localhost:3000"],
    makeWorker: () => new FakeWorker(),
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const clients = [];
  try {
    for (let i = 0; i < 3; i++) {
      const ws = await connect(server.address().port);
      clients.push(ws);
      await ws.request("boot");
    }
    const [a, b, c] = clients;
    const joined = await Promise.allSettled([
      b.request("roomJoin", { code: a.room.code }),
      c.request("roomJoin", { code: a.room.code }),
    ]);
    assert.equal(joined.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(joined.filter((r) => r.status === "rejected").length, 1);
    assert.equal(service.rooms.get(a.room.code).seats.filter(Boolean).length, 2);
  } finally {
    for (const c of clients) c.close();
    service.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("a stale CSS scene number cannot enable Ready before menu frames advance", async () => {
  const server = createServer();
  const worker = new FakeWorker();
  const service = attachRooms(server, {
    access: { authorized: () => true },
    origins: ["http://localhost:3000"],
    makeWorker: () => worker,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const client = await connect(server.address().port);
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  try {
    await client.request("boot");
    worker.state = { major: 2, minor: 1, sceneKind: 9, sceneFrame: 500 };
    await sleep(150);
    worker.state = { major: 2, minor: 0, sceneKind: 8, sceneFrame: 500, cssReady: true };
    await sleep(1750);
    assert.equal(
      client.room.phase,
      "loading",
      "Old objects and a frozen counter are not a ready menu",
    );
    await assert.rejects(
      client.request("meleeControl", { action: "start" }),
      /Not at character select/,
    );
    worker.state.sceneFrame += 120;
    await sleep(150);
    assert.equal(client.room.phase, "selecting");
  } finally {
    client.close();
    service.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("owner can use a CPU, reopen the room, and revoke a guest seat", async () => {
  const server = createServer(),
    workers = [];
  const service = attachRooms(server, {
    access: { authorized: () => true },
    origins: ["http://localhost:3000"],
    makeWorker: () => {
      const w = new FakeWorker();
      workers.push(w);
      return w;
    },
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const clients = [];
  try {
    for (let i = 0; i < 3; i++) {
      const c = await connect(server.address().port);
      clients.push(c);
      await c.request("boot");
    }
    const [owner, guest, other] = clients,
      code = owner.room.code,
      worker = workers[0];
    service.rooms.get(code).joining = true;
    await assert.rejects(owner.request('roomCpu', {enabled:true}), /Change opponent/);
    service.rooms.get(code).joining = false;
    await owner.request("roomCpu", { enabled: true });
    assert.equal(owner.room.cpu, true);
    assert.deepEqual(worker.calls.find((c) => c.payload?.action === "opponent").payload, {
      action: "opponent",
      cpu: true,
    });
    await assert.rejects(guest.request("roomJoin", { code }), /full/);
    worker.state.sceneFrame += 120;
    await new Promise((r) => setTimeout(r, 1700));
    await owner.request("meleeControl", { action: "start" });
    assert.equal(worker.calls.find((c) => c.payload?.action === "start").payload.cpu, true);
    worker.state = { major: 2, minor: 2, sceneKind: 2, sceneFrame: 100, match: { elapsed: 2 } };
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(owner.room.phase, "match");
    assert.equal(owner.room.rollback, null, "CPU mode does not allocate rollback checkpoints");
    worker.state = { major: 2, minor: 0, sceneKind: 8, sceneFrame: 300, cssReady: true };
    await new Promise((r) => setTimeout(r, 150));
    worker.state.sceneFrame += 120;
    await new Promise((r) => setTimeout(r, 1700));
    await owner.request("roomCpu", { enabled: false });
    worker.state.sceneFrame += 120;
    await new Promise((r) => setTimeout(r, 1700));
    await guest.request("roomJoin", { code });
    assert.equal(guest.room.seat, 1);
    const token = guest.token;
    service.rooms.get(code).changing = true;
    await assert.rejects(guest.request('roomLeave'), /transition/);
    service.rooms.get(code).changing = false;
    await guest.request('roomPing'); // A rejected transition must retain membership.
    await assert.rejects(guest.request("roomKick"), /Only the room owner/);
    await assert.rejects(guest.request("roomCpu", { enabled: true }), /Only the room owner/);
    await assert.rejects(owner.request("roomCpu", { enabled: true }), /Remove the other player/);
    const closed = once(guest, "close");
    await owner.request("roomKick");
    await closed;
    assert.equal(owner.room.hasGuest, false);
    assert.equal(owner.room.phase, "selecting");
    const resumed = await connect(server.address().port);
    clients.push(resumed);
    await resumed.request("boot", { token });
    assert.notEqual(resumed.room.code, code, "Kicked token cannot reclaim the room");
    await other.request("roomJoin", { code });
    assert.equal(other.room.seat, 1);
    other.close();
    await once(other, "close");
    await new Promise((r) => setTimeout(r, 30));
    await owner.request("roomKick");
    assert.equal(owner.room.hasGuest, false, "Disconnected guest can be removed");
    assert.equal(owner.room.phase, "selecting");
  } finally {
    for (const c of clients) c.close();
    service.close();
    await new Promise((r) => server.close(r));
  }
});
