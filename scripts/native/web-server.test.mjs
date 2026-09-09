import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import { createWebHandler, webAccess } from "./web-server.mjs";

test("production access issues a signed HttpOnly cookie and rejects tampering", () => {
  const access = webAccess({ key: "a-fixture-password-not-a-real-secret", secure: true }),
    headers = {};
  const req = {
    headers: {
      authorization:
        "Basic " + Buffer.from("player:a-fixture-password-not-a-real-secret").toString("base64"),
    },
  };
  const res = { setHeader: (k, v) => (headers[k] = v) };
  assert.equal(access.check(req, res), true);
  const cookie = headers["Set-Cookie"].split(";")[0];
  assert.match(headers["Set-Cookie"], /HttpOnly; SameSite=Strict/);
  assert.match(headers["Set-Cookie"], /Secure/);
  assert.equal(access.authorized({ headers: { cookie } }), true);
  assert.equal(access.authorized({ headers: { cookie: cookie.slice(0, -1) + "!" } }), false);
  assert.equal(
    access.authorized({ headers: { cookie: "melee_session=9999999999.forged.invalid" } }),
    false,
  );
  assert.equal(access.authorized({ headers: {} }), false);
});
test("production HTTP serves the game privately, blocks traversal and never serves the ISO", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "melee-web-"));
  fs.mkdirSync(path.join(root, "scripts/engine"), { recursive: true });
  fs.writeFileSync(path.join(root, "scripts/engine/melee.html"), "<html>game</html>");
  fs.writeFileSync(path.join(root, "secret.iso"), "disc");
  const access = webAccess({ key: "fixture-key" }),
    server = createServer(createWebHandler({ root, access }));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  try {
    assert.equal((await fetch(base + "/play/")).status, 401);
    const authed = await fetch(base + "/play/", {
      headers: { Authorization: "Basic " + Buffer.from("player:fixture-key").toString("base64") },
    });
    assert.equal(authed.status, 200);
    assert.equal(await authed.text(), "<html>game</html>");
    assert.equal(authed.headers.get("cross-origin-embedder-policy"), "require-corp");
    const headers = { cookie: authed.headers.get("set-cookie").split(";")[0] };
    for (const route of [
      "/local-disc",
      "/secret.iso",
      "/play/%2e%2e%2f%2e%2e%2fsecret.iso",
      "/play/assets/%2e%2e%2fsecret.iso",
    ])
      assert.equal((await fetch(base + route, { headers })).status, 404);
    assert.equal((await fetch(base + "/play/", { method: "POST", headers })).status, 405);
    const entry = await fetch(base + "/", { headers, redirect: "manual" });
    assert.equal(entry.status, 302);
    assert.equal(entry.headers.get("location"), "/play/");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(root, { recursive: true, force: true });
  }
});
