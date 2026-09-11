import { createServer } from "node:http";
import path from "node:path";
import { createWebHandler } from "../native/web-server.mjs";

// This preview serves files only. It never starts a native emulator or encoder.
const root = path.resolve(import.meta.dirname, "../..");
const port = Number(process.env.MELEE_BROWSER_PORT || 3003);
createServer(createWebHandler({ root })).listen(port, "127.0.0.1", () => {
  console.log(`Browser-only Melee: http://localhost:${port}/play/?engine=wasm&video=ogl&qa=1`);
});
