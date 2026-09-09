import fs from "node:fs";
import path from "node:path";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
};
const equal = (a, b) => {
  const x = Buffer.from(a),
    y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
export function webAccess({ key = "", secure = false } = {}) {
  const sign = (value) => createHmac("sha256", key).update(value).digest("base64url");
  const validCookie = (req) => {
    const cookie = (req.headers.cookie || "")
      .split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith("melee_session="))
      ?.slice(14);
    if (!cookie) return false;
    const [expiry, nonce, mac, ...extra] = cookie.split(".");
    return (
      extra.length === 0 &&
      Number(expiry) > Date.now() / 1000 &&
      Number(expiry) < Date.now() / 1000 + 28801 &&
      nonce?.length === 22 &&
      mac &&
      equal(sign(expiry + "." + nonce), mac)
    );
  };
  const authorized = (req) => !key || Boolean(validCookie(req));
  return {
    authorized,
    check(req, res) {
      if (authorized(req)) return true;
      const raw = req.headers.authorization?.startsWith("Basic ")
        ? Buffer.from(req.headers.authorization.slice(6), "base64").toString()
        : "";
      if (equal(raw, "player:" + key)) {
        const payload =
          Math.floor(Date.now() / 1000 + 28800) + "." + randomBytes(16).toString("base64url");
        res.setHeader(
          "Set-Cookie",
          `melee_session=${payload}.${sign(payload)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800${secure ? "; Secure" : ""}`,
        );
        return true;
      }
      res.writeHead(401, {
        "WWW-Authenticate": 'Basic realm="Melee", charset="UTF-8"',
        "Cache-Control": "no-store",
      });
      res.end("Private Melee session");
      return false;
    },
  };
}
export function createWebHandler({ root, access = webAccess(), health = () => ({}) }) {
  return (req, res) => {
    if (!access.check(req, res)) return;
    if (!["GET", "HEAD"].includes(req.method)) {
      res.writeHead(405, { Allow: "GET, HEAD" });
      res.end();
      return;
    }
    let url;
    try {
      url = new URL(req.url, "http://local");
    } catch {
      res.writeHead(400);
      res.end();
      return;
    }
    if (url.pathname === "/health") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(health()));
      return;
    }
    if (url.pathname === "/" || url.pathname === "/play") {
      res.writeHead(302, { Location: "/play/" + url.search });
      res.end();
      return;
    }
    let base, relative;
    if (url.pathname === "/play/vendor/three.module.js") {
      base = path.join(root, "web/node_modules/three/build");
      relative = "three.module.js";
    } else if (url.pathname.startsWith("/play/assets/")) {
      base = path.join(root, ".melee-assets");
      relative = url.pathname.slice(13);
    } else if (url.pathname.startsWith("/play/")) {
      base = path.join(root, "scripts/engine");
      relative = url.pathname === "/play/" ? "melee.html" : url.pathname.slice(6);
    } else if (url.pathname.startsWith("/engine/src/")) {
      base = path.join(root, "engines/wasm-dolphin/src");
      relative = url.pathname.slice(12);
    } else {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    let file;
    try {
      file = path.resolve(base, decodeURIComponent(relative));
    } catch {
      res.writeHead(400);
      res.end();
      return;
    }
    if (!file.startsWith(base + path.sep) || !mime[path.extname(file)]) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    let stat;
    try {
      stat = fs.statSync(file);
    } catch {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    if (!stat.isFile()) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": mime[path.extname(file)],
      "Content-Length": stat.size,
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Resource-Policy": "same-origin",
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-cache",
    });
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    const stream = fs.createReadStream(file);
    stream.on("error", () => res.destroy());
    res.on("close", () => stream.destroy());
    stream.pipe(res);
  };
}
