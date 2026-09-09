import { EmulatorHost } from "/engine/src/core-host.js";
import { AudioController } from "/engine/src/audio.js";
import { readGamepadInput, selectPreferredGamepad } from "/engine/src/input.js";

const params = new URLSearchParams(location.search);
const nativeEngine = params.get("engine") !== "wasm";
if (!nativeEngine && !params.has("video")) {
  params.set("video", "software");
  params.set("presenter", "webgl");
  for (const [key, value] of Object.entries({
    wasmjit: "1",
    fastsw: localStorage.getItem("melee.quality") || "1",
    nojitcache: "1",
    forcejit: "1",
    jitwarmup: "900",
    swtevfast: "1",
    xfbfast: "both",
    present: "half",
    timedrift: "1",
  }))
    params.set(key, value);
  history.replaceState(null, "", `${location.pathname}?${params}`);
}
const $ = (id) => document.getElementById(id);
const status = $("status"),
  loading = $("loading"),
  keys = new Set();
let paused = false,
  ready = false,
  tickBusy = false,
  lastScene = "",
  pulseTimer,
  pulseUntil = 0,
  gamepadState;
let gameState,
  frames,
  bootStep = 0,
  lastPulse = 0,
  menuSeenAt = 0;
let sceneSample,
  measuredGameFps = 0,
  measuredRenderFps = 0,
  previousSceneFrame = 0;
const actions = [];
let nativeSceneKey = "",
  nativeSceneSince = 0;
const audio = new AudioController();
if (nativeEngine) audio.targetLeadSeconds = 0.08;
const Host = nativeEngine ? (await import("./native-host.js")).NativeHost : EmulatorHost;
const host = new Host({
  canvas: $("screen"),
  onStatus: (message) => {
    if (!ready && !message.includes("MEM1 signature")) status.textContent = message;
    if (nativeEngine && host.mode === "error") {
      status.textContent = message;
      loading.hidden = false;
    }
  },
  onFrame: (frame) => {
    frames = frame;
    $("stats").textContent =
      `${measuredRenderFps} rendered FPS · ${measuredGameFps} simulation FPS${nativeEngine ? " · 1280×720" : ""}`;
  },
});
audio.setSource((frames) => host.mixAudio(frames));
audio.setTransportBridge((config) => host.configureAudioWorklet(config));
const neutral = () => ({
  mask: 0,
  stickX: 128,
  stickY: 128,
  cStickX: 128,
  cStickY: 128,
  triggerLeft: 0,
  triggerRight: 0,
  analogA: 0,
  analogB: 0,
});
const mapping = { KeyP: 1, KeyO: 2, Space: 4, Enter: 16, KeyI: 32, KeyU: 128 };
const relevant = new Set([
  ...Object.keys(mapping),
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "KeyK",
  "KeyM",
  "Comma",
  "Period",
  "ShiftLeft",
  "Escape",
]);
function sample() {
  const pad = neutral();
  if (paused) return pad;
  for (const [code, bit] of Object.entries(mapping)) if (keys.has(code)) pad.mask |= bit;
  const x = Number(keys.has("KeyD")) - Number(keys.has("KeyA")),
    y = Number(keys.has("KeyW")) - Number(keys.has("KeyS"));
  const scale = (keys.has("ShiftLeft") ? 0.5 : 1) / (x && y ? Math.SQRT2 : 1);
  pad.stickX = Math.round(128 + x * 96 * scale);
  pad.stickY = Math.round(128 + y * 96 * scale);
  pad.cStickX = 128 + 96 * (Number(keys.has("Period")) - Number(keys.has("KeyM")));
  pad.cStickY = 128 + 96 * (Number(keys.has("KeyK")) - Number(keys.has("Comma")));
  pad.triggerLeft = keys.has("KeyI") ? 255 : 0;
  pad.analogA = keys.has("KeyP") ? 255 : 0;
  pad.analogB = keys.has("KeyO") ? 255 : 0;
  if (gamepadState) {
    pad.mask |= gamepadState.mask;
    for (const axis of ["stickX", "stickY", "cStickX", "cStickY"])
      if (Math.abs(gamepadState[axis] - 128) > Math.abs(pad[axis] - 128))
        pad[axis] = gamepadState[axis];
    for (const analog of ["triggerLeft", "triggerRight", "analogA", "analogB"])
      pad[analog] = Math.max(pad[analog], gamepadState[analog]);
  }
  return pad;
}
function pulse(mask) {
  clearTimeout(pulseTimer);
  pulseUntil = performance.now() + 180;
  const pad = sample();
  host.setInputState({ ...pad, mask: pad.mask | mask });
  pulseTimer = setTimeout(() => host.setInputState(sample()), 180);
}
let lastPadSignature = "",
  padStartHeld = false;
function pollGamepad() {
  const pad = selectPreferredGamepad(navigator.getGamepads?.() || []);
  gamepadState = pad ? readGamepadInput(pad).state : null;
  if (gamepadState) {
    gamepadState.mask = 0;
    for (const [i, bit] of Object.entries({
      0: 1,
      2: 2,
      1: 4,
      3: 8,
      4: 32,
      5: 128,
      6: 32,
      7: 64,
      12: 256,
      13: 512,
      14: 1024,
      15: 2048,
    }))
      if (pad.buttons[i]?.pressed) gamepadState.mask |= bit;
    gamepadState.analogA = pad.buttons[0]?.pressed ? 255 : 0;
    gamepadState.analogB = pad.buttons[2]?.pressed ? 255 : 0;
    const start = Boolean(pad.buttons[9]?.pressed);
    if (start && !padStartHeld && ready) {
      if (gameState?.minor === 0 && !paused) void control("start").then(() => pulse(16));
      else void setPaused(!paused);
    }
    padStartHeld = start;
  } else padStartHeld = false;
  const signature = JSON.stringify(gamepadState);
  if (signature !== lastPadSignature && performance.now() > pulseUntil) {
    lastPadSignature = signature;
    host.setInputState(sample());
  }
  requestAnimationFrame(pollGamepad);
}
requestAnimationFrame(pollGamepad);
async function setPaused(value) {
  if (!ready) return;
  paused = value;
  keys.clear();
  host.setInputState(neutral());
  if (paused) host.pause();
  else host.start();
  await audio.setMuted(paused);
  $("pause").hidden = !paused;
}
async function quitMatch() {
  if (paused) await setPaused(false);
  if (gameState?.minor === 2) await control("quit");
}
window.addEventListener("keydown", (event) => {
  if (!relevant.has(event.code)) return;
  if (event.code === "Escape") {
    event.preventDefault();
    if (!event.repeat) void setPaused(!paused);
    return;
  }
  if (paused) return;
  event.preventDefault();
  if (event.code === "Enter" && ready) {
    if (!event.repeat && gameState?.minor === 0) {
      void control("start").then(() => pulse(16));
    }
    return;
  }
  if (!paused) {
    keys.add(event.code);
    host.setInputState(sample());
  }
});
window.addEventListener("keyup", (event) => {
  if (!relevant.has(event.code) || paused) return;
  event.preventDefault();
  keys.delete(event.code);
  host.setInputState(sample());
});
window.addEventListener("blur", () => {
  keys.clear();
  host.setInputState(neutral());
});
$("pauseButton").onclick = () => setPaused(!paused);
$("resume").onclick = () => setPaused(false);
$("quit").onclick = () => quitMatch();
$("fullscreen").onclick = () =>
  document.fullscreenElement
    ? document.exitFullscreen()
    : document.documentElement.requestFullscreen();
$("metrics").onclick = () => {
  $("stats").hidden = !$("stats").hidden;
};
$("tapJump").checked = localStorage.getItem("melee.tapJump") !== "false";
for (const id of ["playerSheik", "cpuSheik"]) {
  $(id).checked = localStorage.getItem("melee." + id) === "true";
  $(id).onchange = () => localStorage.setItem("melee." + id, String($(id).checked));
}
$("tapJump").onchange = () => {
  localStorage.setItem("melee.tapJump", String($("tapJump").checked));
  void host.adapter.request("meleeControl", { action: "tapJump", enabled: $("tapJump").checked });
};
async function control(action) {
  const result = await host.adapter.request("meleeControl", {
    action,
    tapJump: $("tapJump").checked,
    startingSheik:
      action === "start" && !params.has("qa")
        ? [$("playerSheik").checked, $("cpuSheik").checked]
        : undefined,
  });
  actions.push({ action, major: result.major, minor: result.minor, frame: result.sceneFrame });
  return result;
}
async function tick() {
  if (tickBusy || paused || host.mode !== "dolphin") return;
  tickBusy = true;
  try {
    const state = await host.adapter.request("meleeInspect", {});
    gameState = state;
    const scene = `${state.major}:${state.minor}`;
    if (scene === "2:0" && state.sceneFrame < previousSceneFrame) lastScene = "";
    previousSceneFrame = state.sceneFrame;
    const now = performance.now();
    const nativeKey = `${state.major}:${state.minor}:${state.sceneKind}`;
    if (nativeKey !== nativeSceneKey) {
      nativeSceneKey = nativeKey;
      nativeSceneSince = now;
    }
    if (!sceneSample || sceneSample.scene !== scene || state.sceneFrame < sceneSample.frame)
      sceneSample = { scene, frame: state.sceneFrame, render: state.renderFrame, time: now };
    if (now - sceneSample.time > 1000) {
      measuredGameFps = Math.round(
        ((state.sceneFrame - sceneSample.frame) * 1000) / (now - sceneSample.time),
      );
      measuredRenderFps = Math.round(
        ((state.renderFrame - sceneSample.render) * 1000) / (now - sceneSample.time),
      );
      sceneSample = { scene, frame: state.sceneFrame, render: state.renderFrame, time: now };
    }
    if (state.major !== 1) {
      menuSeenAt = 0;
    }
    if (state.major === 1 && state.sceneKind === 1 && !menuSeenAt) menuSeenAt = performance.now();
    if (
      state.major === 1 &&
      state.sceneKind === 1 &&
      state.sceneFrame > 60 &&
      performance.now() - menuSeenAt > 1200 &&
      bootStep !== 3
    ) {
      await control("enterCss");
      bootStep = 3;
    } else if (
      [0, 24].includes(state.major) &&
      state.sceneFrame > 10 &&
      state.mainPointer !== "0" &&
      bootStep === 0
    ) {
      await control("prepare");
      bootStep = 1;
    }
    if (state.major === 2) {
      bootStep = 2;
      if (!ready) {
        ready = true;
        loading.hidden = true;
        clearTimeout(pulseTimer);
        host.setInputState(neutral());
      }
      $("hint").hidden = state.minor !== 0;
      $("forms").hidden = state.minor !== 0;
      $("quit").hidden = state.minor !== 2;
      if (state.minor === 0 && state.sceneFrame > 20 && lastScene !== scene) {
        await control("lockCss");
        lastScene = scene;
      }
      if (
        state.minor === 4 &&
        state.sceneKind === 5 &&
        state.sceneFrame > 180 &&
        lastScene !== scene &&
        now - nativeSceneSince > 3000
      ) {
        await control("returnCss");
        lastScene = scene;
      }
      if (state.minor !== 0 && state.minor !== 4) lastScene = scene;
    } else if (
      !ready &&
      state.major !== 1 &&
      bootStep < 2 &&
      performance.now() - lastPulse > 1200
    ) {
      lastPulse = performance.now();
      pulse([0, 24].includes(state.major) ? 16 : 1);
    }
  } catch (error) {
    if (params.has("qa")) $("stats").textContent = error.message;
  } finally {
    tickBusy = false;
  }
}
const begin = $("begin");
begin.onclick = async () => {
  begin.hidden = true;
  try {
    await audio.setMuted(false);
    status.textContent = "Opening your local Melee disc…";
    if (nativeEngine) {
      await host.mountFile();
    } else {
      const response = await fetch("/local-disc");
      if (!response.ok) throw new Error(await response.text());
      const blob = await response.blob();
      const file = new File([blob], "Melee-GALE01.iso", { type: "application/octet-stream" });
      const header = new Uint8Array(await file.slice(0, 8).arrayBuffer());
      if (String.fromCharCode(...header.slice(0, 6)) !== "GALE01" || header[7] !== 2)
        throw new Error("This integration requires the USA 1.02 Melee disc.");
      await host.mountFile(file);
    }
    if (host.mode !== "dolphin") throw new Error("The Dolphin engine could not boot the disc.");
    host.start();
    setInterval(tick, 150);
  } catch (error) {
    status.textContent = error.message;
    begin.hidden = false;
    begin.textContent = "Retry";
  }
};
begin.hidden = false;
status.textContent = "Your local copy · 4 stocks · 8 minutes · Battlefield · No items";
if (params.has("qa")) {
  const panel = document.createElement("div");
  panel.id = "qa";
  const output = document.createElement("pre");
  for (const [name, mask] of [
    ["A", 1],
    ["B", 2],
    ["Start", 16],
    ["Jump", 4],
  ]) {
    const b = document.createElement("button");
    b.textContent = `GC ${name}`;
    b.onclick = () => (mask === 16 ? control("start").then(() => pulse(mask)) : pulse(mask));
    panel.append(b);
  }
  for (const [label, code] of [
    ["W", "KeyW"],
    ["D", "KeyD"],
    ["P", "KeyP"],
    ["O", "KeyO"],
    ["Space", "Space"],
    ["I", "KeyI"],
    ["U", "KeyU"],
    ["K", "KeyK"],
  ]) {
    const b = document.createElement("button");
    b.textContent = `Hold ${label}`;
    b.setAttribute("aria-pressed", "false");
    b.onclick = () => {
      const down = b.getAttribute("aria-pressed") !== "true";
      b.setAttribute("aria-pressed", String(down));
      window.dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { code, bubbles: true }));
    };
    panel.append(b);
  }
  const names = [
    "Captain Falcon",
    "Donkey Kong",
    "Fox",
    "Mr. Game & Watch",
    "Kirby",
    "Bowser",
    "Link",
    "Luigi",
    "Mario",
    "Marth",
    "Mewtwo",
    "Ness",
    "Peach",
    "Pikachu",
    "Ice Climbers",
    "Jigglypuff",
    "Samus",
    "Yoshi",
    "Zelda",
    "Sheik",
    "Falco",
    "Young Link",
    "Dr. Mario",
    "Roy",
    "Pichu",
    "Ganondorf",
  ];
  const selectors = ["Player fighter", "CPU fighter"].map((name, index) => {
    const select = document.createElement("select");
    select.setAttribute("aria-label", name);
    names.forEach((name, id) => select.add(new Option(name, String(id))));
    select.value = index ? "20" : "2";
    panel.append(select);
    return select;
  });
  const choose = document.createElement("button");
  choose.textContent = "Choose fighters";
  choose.onclick = async () => {
    try {
      await host.adapter.request("meleeControl", {
        action: "select",
        player: Number(selectors[0].value),
        cpu: Number(selectors[1].value),
      });
    } catch (e) {
      output.textContent = e.message;
    }
  };
  panel.append(choose);
  const quit = document.createElement("button");
  quit.textContent = "Quit match";
  quit.onclick = () => quitMatch();
  panel.append(quit);
  const verify = document.createElement("button");
  verify.textContent = "Verify all fighters";
  const progress = document.createElement("output");
  progress.setAttribute("aria-label", "Roster verification");
  const results = [];
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  async function waitForGame(predicate, timeout = 90000) {
    const began = performance.now();
    while (performance.now() - began < timeout) {
      const state = await host.adapter.request("meleeInspect", {});
      if (predicate(state)) return state;
      await delay(150);
    }
    throw new Error("Native scene transition timed out");
  }
  async function waitForCss() {
    let previous,
      baseline,
      since = performance.now();
    return waitForGame((state) => {
      const valid =
        state.major === 2 && state.minor === 0 && state.sceneKind === 8 && state.sceneFrame > 45;
      if (!valid || !previous || state.sceneFrame < previous.sceneFrame) {
        baseline = undefined;
        since = performance.now();
      }
      previous = state;
      if (!valid) return false;
      if (baseline === undefined) baseline = state.sceneFrame;
      return state.sceneFrame - baseline >= 60 && performance.now() - since >= 1000;
    });
  }
  verify.onclick = async () => {
    verify.disabled = true;
    try {
      if (paused) await setPaused(false);
      if (gameState?.minor === 2) await quitMatch();
      for (let p = Number(params.get("qaFrom") || 0); p < 26; p += 2) {
        progress.textContent = `Testing ${names[p]} / ${names[p + 1]} (${p / 2 + 1}/13)`;
        await waitForCss();
        selectors[0].value = String(p);
        selectors[1].value = String(p + 1);
        await host.adapter.request("meleeControl", { action: "select", player: p, cpu: p + 1 });
        await delay(800);
        await waitForCss();
        await control("start");
        pulse(16);
        const start = await waitForGame(
          (s) =>
            s.major === 2 &&
            s.minor === 2 &&
            s.sceneKind === 2 &&
            s.sceneFrame > 100 &&
            s.fighters.length === 2,
        );
        if (
          start.match.stage !== 31 ||
          start.match.timeLimit !== 480 ||
          start.match.items !== -1 ||
          start.match.teams !== 0 ||
          start.match.cpuLevel !== 9
        )
          throw new Error("Native match rules differ: " + JSON.stringify(start.match));
        if (start.fighters[0].character !== p || start.fighters[1].character !== p + 1)
          throw new Error("Native fighter selection differs: " + JSON.stringify(start.fighters));
        if (start.fighters.some((f) => f.stocks !== 4)) throw new Error("Initial stocks differ");
        await waitForGame((s) => s.major === 2 && s.minor === 2 && s.sceneFrame > 240);
        const motion = new Set();
        for (const code of ["KeyD", "KeyP", "KeyO", "Space", "KeyI", "KeyU", "KeyK"]) {
          window.dispatchEvent(new KeyboardEvent("keydown", { code, bubbles: true }));
          await delay(220);
          const s = await host.adapter.request("meleeInspect", {});
          s.fighters.forEach((f) => motion.add(f.action));
          window.dispatchEvent(new KeyboardEvent("keyup", { code, bubbles: true }));
          await delay(100);
        }
        results.push({
          player: names[p],
          cpu: names[p + 1],
          rules: start.match,
          stocks: start.fighters.map((f) => f.stocks),
          actions: [...motion],
          simulationFps: measuredGameFps,
          renderFps: measuredRenderFps,
        });
        output.textContent = JSON.stringify(results, null, 2);
        await quitMatch();
        await delay(500);
      }
      await waitForCss();
      progress.textContent = `PASS: ${results.length * 2} fighters loaded into live matches with the fixed rules; returned to character select.`;
    } catch (error) {
      progress.textContent = "FAILED: " + error.message;
    } finally {
      keys.clear();
      host.setInputState(neutral());
      verify.disabled = false;
    }
  };
  panel.append(verify, progress);
  const checkInput = document.createElement("button");
  checkInput.textContent = "Verify pause and tap jump";
  checkInput.onclick = async () => {
    const press = (code, down) =>
      window.dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { code, bubbles: true }));
    checkInput.disabled = true;
    try {
      if (paused) await setPaused(false);
      if (gameState?.minor === 2) await quitMatch();
      await waitForCss();
      // Fox lasers do not cause hitstun, allowing a clean input probe with the level-9 CPU active.
      await host.adapter.request("meleeControl", { action: "select", player: 2, cpu: 2 });
      await delay(800);
      await waitForCss();
      await control("start");
      pulse(16);
      await waitForGame(
        (s) =>
          s.major === 2 &&
          s.minor === 2 &&
          s.sceneKind === 2 &&
          s.match?.timeRemaining >= 479 &&
          s.match.elapsed > 1 &&
          s.match.elapsed < 30 &&
          s.fighters[0]?.air === 0,
      );
      press("Escape", true);
      press("Escape", false);
      await delay(300);
      const pauseStart = await host.adapter.request("meleeInspect", {});
      await delay(700);
      const pauseEnd = await host.adapter.request("meleeInspect", {});
      if (pauseStart.sceneFrame !== pauseEnd.sceneFrame)
        throw new Error("Pause did not stop native simulation");
      press("Escape", true);
      press("Escape", false);
      await delay(100);
      await host.adapter.request("meleeControl", { action: "tapJump", enabled: false });
      const offStart = await host.adapter.request("meleeInspect", {});
      press("KeyW", true);
      const off = await waitForGame((s) => s.sceneFrame >= offStart.sceneFrame + 10, 5000);
      press("KeyW", false);
      await delay(150);
      await host.adapter.request("meleeControl", { action: "tapJump", enabled: true });
      press("KeyW", true);
      const on = await waitForGame(
        (s) => s.fighters[0]?.air === 1 && [25, 26].includes(s.fighters[0]?.action),
        5000,
      );
      press("KeyW", false);
      output.textContent = JSON.stringify(
        {
          pauseFrames: [pauseStart.sceneFrame, pauseEnd.sceneFrame],
          tapFlags: [off.tapJump, on.tapJump],
          hooks: off.tapJumpHooks,
          tapOff: off.fighters[0],
          tapOn: on.fighters[0],
          offStick: off.master.slice(24, 26),
        },
        null,
        2,
      );
      if (off.fighters[0]?.air !== 0 || on.fighters[0]?.air !== 1)
        throw new Error("Jump assertion failed; inspect native states");
      progress.textContent =
        "PASS: Escape freezes/resumes native frames; W stays grounded with tap jump off and jumps with it on.";
    } catch (error) {
      progress.textContent = "FAILED: " + error.message;
    } finally {
      keys.clear();
      host.setInputState(neutral());
      await host.adapter.request("meleeControl", {
        action: "tapJump",
        enabled: $("tapJump").checked,
      });
      checkInput.disabled = false;
    }
  };
  panel.append(checkInput);

  const bench = document.createElement("button");
  bench.textContent = "Benchmark 720p60";
  bench.onclick = async () => {
    bench.disabled = true;
    try {
      if (paused) await setPaused(false);
      const initial = await waitForGame(
        (s) =>
          s.major === 2 &&
          ((s.minor === 0 && s.sceneKind === 8 && s.sceneFrame > 45) ||
            (s.minor === 2 && s.sceneKind === 2 && s.sceneFrame > 300)),
      );
      if (initial.minor === 2) {
        await control("quit");
      }
      await waitForCss();
      await control("start");
      pulse(16);
      await waitForGame(
        (s) =>
          s.major === 2 && s.minor === 2 && s.sceneKind === 2 && s.match?.timeRemaining === 480,
      );
      await waitForGame(
        (s) =>
          s.major === 2 &&
          s.minor === 2 &&
          s.sceneKind === 2 &&
          s.match?.timeRemaining <= 474 &&
          s.match?.timeRemaining >= 460,
      );
      const before = await host.adapter.request("meleeInspect", {}),
        video = { ...host.metrics },
        t0 = performance.now();
      const duration = Math.max(30, Math.min(120, Number(params.get("benchmarkSeconds")) || 30));
      progress.textContent = `Measuring ${duration} seconds of live 720p gameplay…`;
      await delay(duration * 1000);
      const after = await host.adapter.request("meleeInspect", {}),
        seconds = (performance.now() - t0) / 1000;
      if (after.major !== 2 || after.minor !== 2 || after.sceneFrame < before.sceneFrame)
        throw Error("Match ended during measurement; rerun on a fresh match");
      const result = {
        seconds,
        startFrame: before.sceneFrame,
        endFrame: after.sceneFrame,
        startTimer: before.match.timeRemaining,
        endTimer: after.match.timeRemaining,
        resolution: [host.canvas?.width, host.canvas?.height],
        simulationFps: (after.sceneFrame - before.sceneFrame) / seconds,
        renderFps: (after.renderFrame - before.renderFrame) / seconds,
        decodedFps: (host.metrics?.decoded - video.decoded) / seconds,
        presentedFps: (host.metrics?.presented - video.presented) / seconds,
        dropped: (host.metrics?.dropped || 0) - (video.dropped || 0),
        captureFps: (after.nativeStats.captured - before.nativeStats.captured) / seconds,
        encodedFps: (after.nativeStats.encoded - before.nativeStats.encoded) / seconds,
        native: after.nativeStats,
      };
      output.textContent = JSON.stringify(result, null, 2);
      progress.textContent =
        result.renderFps >= 59.5 &&
        result.presentedFps >= 59.5 &&
        result.resolution[0] === 1280 &&
        result.resolution[1] === 720
          ? "PASS: sustained 720p / 60 FPS class native rendering and browser presentation."
          : "Below target; see measured frame rates.";
    } catch (error) {
      progress.textContent = "FAILED: " + error.message;
    } finally {
      bench.disabled = false;
    }
  };
  panel.append(bench);
  const inspect = document.createElement("button");
  inspect.textContent = "Inspect game";
  inspect.onclick = async () => {
    const s = await host.adapter.request("meleeInspect", {});
    output.textContent = JSON.stringify(
      {
        major: s.major,
        minor: s.minor,
        scene: s.sceneKind,
        frame: s.sceneFrame,
        renderFrame: s.renderFrame,
        match: s.match,
        tapJump: s.tapJump,
        fighters: s.fighters,
        pad: s.master.slice(0, 32),
        actions,
        audio: audio.stats,
        performance: {
          simulationFps: measuredGameFps,
          renderFps: measuredRenderFps,
          coreFps: frames?.coreFps,
          jitBlocks: frames?.ppcWasmBlockRunCount,
          jit: frames?.ppcWasmHelperStats?.match(/jit:[^ ]+/)?.[0],
          speed: frames?.gameSpeed,
          visual: frames?.visualChangeFps,
        },
      },
      null,
      2,
    );
  };
  panel.append(inspect, output);
  document.body.append(panel);
}
