import { AudioController } from "/engine/src/audio.js";
import { readGamepadInput, selectPreferredGamepad } from "/engine/src/input.js";

const params = new URLSearchParams(location.search);
const nativeEngine = params.get("engine") !== "wasm";
document.getElementById("gameViewport").classList.toggle("native", nativeEngine);
document.body.classList.toggle("native-engine", nativeEngine);
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
let testForms = [false, false];
let nativeSceneKey = "",
  nativeSceneSince = 0;
const audio = new AudioController();
const browserStatus = [];
if (nativeEngine) audio.targetLeadSeconds = 0.08;
const Host = nativeEngine
  ? (await import("./native-host.js")).NativeHost
  : (await import("/engine/src/core-host.js")).EmulatorHost;
const pixelPresenterFactory = nativeEngine ? undefined :
  (await import("./browser-pixel-presenter.js")).createBrowserPixelPresenter;
const host = new Host({
  canvas: $("screen"),
  pixelPresenterFactory,
  onStatus: (message) => {
    if (!nativeEngine) {
      browserStatus.push(String(message));
      if (browserStatus.length > 64) browserStatus.shift();
    }
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
if(host.online){
  const {createRoomUI}=await import('./room-ui.js');
  createRoomUI(host);
  document.body.classList.add('online-room');
  window.addEventListener('melee-room-kicked', () => {
    paused = false;
    controlsChanging = false;
    keyboardModel?.setVisible(false);
    $('controls').close();
    document.body.classList.remove('controls-open');
    keys.clear();
    clearTimeout(pulseTimer);
    $('keyboardButton').hidden = true;
    $('peerKeyboard').hidden = true;
    $('kickMatch').hidden = true;
    ready = false;
    loading.hidden = false;
    status.textContent = 'The room owner removed you. Start a new room to play again.';
    $('begin').hidden = false;
    $('begin').disabled = false;
    $('roomPanel').hidden = true;
    host.room = null;
  });
}
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
const mapping = { KeyP: 1, KeyO: 2, Space: 4, Enter: 16, KeyI: 32, KeyL: 64, KeyU: 128 };
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
  pad.triggerRight = keys.has("KeyL") ? 255 : 0;
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
      else if (!paused) pulse(16);
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
let keyboardModel;
let controlsChanging = false;
async function setPaused(value) {
  // Isolate menu input; keep native CSS/audio running behind the keyboard view.
  if (!ready || controlsChanging || value === paused) return;
  if (value && !(gameState?.major === 2 && gameState.minor === 0 && gameState.sceneKind === 8))
    return;
  controlsChanging = true;
  paused = value;
  keys.clear();
  clearTimeout(pulseTimer);
  pulseUntil = 0;
  host.setInputState(neutral());
  try {
    if (value) {
      $("controls").showModal();
      document.body.classList.add("controls-open");
      if (!keyboardModel) {
        const { createKeyboardModel } = await import("./keyboard-model.js");
        keyboardModel = createKeyboardModel($("keyboardModel"));
      }
      keyboardModel.setVisible(true);
      $("tapJump").focus();
    } else {
      keyboardModel?.setVisible(false);
      $("controls").close();
      document.body.classList.remove("controls-open");
      $("screen").focus();
    }
  } catch (error) {
    console.error("Keyboard controls:", error);
    paused = false;
    $("controls").close();
    document.body.classList.remove("controls-open");
  } finally {
    controlsChanging = false;
  }
}
async function startButton() {
  if (!ready || paused) return;
  if(host.online && gameState?.minor===0){
    try {await control('start');}catch(error){window.dispatchEvent(new CustomEvent('melee-room-error',{detail:error.message}));}
    return;
  }
  if (gameState?.major === 2 && gameState.minor === 0) await control("start");
  pulse(16);
}
async function quitMatch() {
  if (paused) await setPaused(false);
  if (gameState?.minor === 2) await control("quit");
}
// Native CSS cursor origins sit below/left of the fingertip. These bounds
// match the icon in the original 640×480 picture, independent of browser size.
function keyboardHovered(state) {
  const c = state?.cssCursor;
  const shift=host.online&&host.room?.seat===1?44.75:0;
  return Boolean(
    c &&
    Number.isFinite(c.x) &&
    Number.isFinite(c.y) &&
    c.x >= -25.0+shift &&
    c.x <= -22.0+shift &&
    c.y >= -23.1 &&
    c.y <= -20.4,
  );
}
function activateRoomControl(state) {
  const cursor = state?.cssCursor, panel = $('roomPanel');
  if (!cursor || !panel || panel.hidden) return false;
  const rect = $('screen').getBoundingClientRect();
  const x = rect.left + rect.width * (.5 + (cursor.x + 5.0) * .01073);
  const y = rect.top + rect.height * (.5 - (cursor.y - .75) * .01725);
  for (const control of panel.querySelectorAll('button,input')) {
    if (control.hidden || control.disabled || !control.getClientRects().length) continue;
    const box = control.getBoundingClientRect();
    if (x >= box.left && x <= box.right && y >= box.top && y <= box.bottom) {
      if (control.tagName === 'INPUT') control.focus(); else control.click();
      return true;
    }
  }
  return false;
}
async function cssAttack() {
  // Inspect at activation time rather than trusting the slower HUD sample.
  const state = await host.adapter.request("meleeInspect", {});
  gameState = state;
  if (keyboardHovered(state)) await setPaused(true);
  else if (host.online && activateRoomControl(state)) return;
  else if (!paused) pulse(1);
}
function toggleTapJump(value = !$("tapJump").checked) {
  $("tapJump").checked = value;
  $("tapJump").dispatchEvent(new Event("change"));
}
window.addEventListener("keydown", (event) => {
  if(event.target instanceof Element && event.target.closest('#roomPanel input'))return;
  if (!relevant.has(event.code)) return;
  if (!ready && !$("begin").hidden && ["KeyP", "Enter"].includes(event.code)) {
    event.preventDefault();
    if (!event.repeat) $("begin").click();
    return;
  }
  if (paused && ["KeyP", "KeyO", "KeyW", "KeyS", "KeyA", "KeyD"].includes(event.code)) {
    event.preventDefault();
    if (event.repeat) return;
    if (event.code === "KeyO") void setPaused(false);
    else if (["KeyW", "KeyS"].includes(event.code))
      (document.activeElement === $("tapJump") ? $("closeControls") : $("tapJump")).focus();
    else if (event.code === "KeyP") {
      if (document.activeElement === $("closeControls")) void setPaused(false);
      else toggleTapJump();
    } else {
      $("tapJump").focus();
      toggleTapJump(event.code === "KeyD");
    }
    return;
  }
  if (
    !paused &&
    ready &&
    event.code === "KeyP" &&
    gameState?.major === 2 &&
    gameState.minor === 0
  ) {
    event.preventDefault();
    if (!event.repeat) void cssAttack().catch(console.error);
    return;
  }
  if (
    ["Enter", "Space"].includes(event.code) &&
    event.target instanceof Element &&
    event.target.closest("button, input, select")
  )
    return;
  if (event.code === "Escape") {
    event.preventDefault();
    if (!event.repeat) {
      if (paused) void setPaused(false);
      else if (gameState?.major === 2 && gameState.minor === 2) pulse(16);
    }
    return;
  }
  if (paused) return;
  event.preventDefault();
  if (event.code === "Enter" && ready) {
    if (!event.repeat) void startButton();
    return;
  }
  if (!paused) {
    keys.add(event.code);
    host.setInputState(sample());
  }
});
window.addEventListener("keyup", (event) => {
  if (!relevant.has(event.code) || paused) return;
  if (
    ["Enter", "Space"].includes(event.code) &&
    event.target instanceof Element &&
    event.target.closest("button, input, select")
  )
    return;
  event.preventDefault();
  // Start is a bounded pulse. A quick key release must not cancel it before
  // Dolphin samples a frame (especially for Escape and accessibility tools).
  if (
    event.code === "Enter" ||
    event.code === "Escape" ||
    (event.code === "KeyP" && performance.now() < pulseUntil)
  )
    return;
  keys.delete(event.code);
  host.setInputState(sample());
});
window.addEventListener("blur", () => {
  keys.clear();
  host.setInputState(neutral());
});

$("closeControls").onclick = () => setPaused(false);
$("controls").addEventListener("cancel", (event) => {
  event.preventDefault();
  void setPaused(false);
});
$("fullscreen").onclick = () =>
  document.fullscreenElement
    ? document.exitFullscreen()
    : document.documentElement.requestFullscreen();
$("metrics").onclick = () => {
  $("stats").hidden = !$("stats").hidden;
};
$("tapJump").checked = localStorage.getItem("melee.tapJump") !== "false";

$("tapJump").onchange = () => {
  localStorage.setItem("melee.tapJump", String($("tapJump").checked));
  void host.adapter.request("meleeControl", { action: "tapJump", enabled: $("tapJump").checked });
};
async function control(action, overrides = {}) {
  const result = await host.adapter.request("meleeControl", {
    action,
    tapJump: $("tapJump").checked,
    online: params.get("inputprobe") === "1",
    startingSheik: params.has("qa") ? testForms : undefined,
    ...overrides,
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
    if (!host.online &&
      state.major === 1 &&
      state.sceneKind === 1 &&
      state.sceneFrame > 60 &&
      performance.now() - menuSeenAt > 1200 &&
      bootStep !== 3
    ) {
      await control("enterCss");
      bootStep = 3;
    } else if (!host.online &&
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
      $("keyboardButton").hidden = state.minor !== 0 || state.sceneKind !== 8;
      $("keyboardButton").classList.toggle("hand-hover", keyboardHovered(state));
      if (!host.online && state.minor === 0 && state.sceneFrame > 20 && lastScene !== scene) {
        await control("lockCss");
        lastScene = scene;
      }
      if (!host.online &&
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
    } else if (!host.online &&
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
const discPicker = document.createElement("input");
discPicker.type = "file";
discPicker.accept = ".iso,.gcm";
discPicker.hidden = true;
discPicker.setAttribute("aria-label", "Melee USA 1.02 disc");
document.body.append(discPicker);
let browserDisc;
let capabilities;
discPicker.onchange = () => {
  browserDisc = discPicker.files?.[0];
  if (browserDisc) begin.click();
};
begin.onclick = async () => {
  if (!nativeEngine && !browserDisc) {
    discPicker.click();
    return;
  }
  begin.hidden = true;
  try {
    await audio.setMuted(false);
    status.textContent = "Opening your local Melee disc…";
    if (nativeEngine) {
      await host.mountFile();
    } else {
      const { browserCapabilities, requireBrowserBackend } = await import("./browser-capabilities.js");
      capabilities = await browserCapabilities();
      requireBrowserBackend(capabilities, host.videoBackend, host.oglProxyMode);
      const file = browserDisc;
      const header = new Uint8Array(await file.slice(0, 8).arrayBuffer());
      if (String.fromCharCode(...header.slice(0, 6)) !== "GALE01" || header[7] !== 2)
        throw new Error("This integration requires the USA 1.02 Melee disc.");
      if (document.documentElement.dataset.browserRelease === "true") {
        const { installLocalMenuAssets } = await import("./browser-menu-assets.js");
        await installLocalMenuAssets(file);
      }
      await host.mountFile(file);
    }
    if (host.mode !== "dolphin")
      throw new Error(browserStatus.at(-1) || "The Dolphin engine could not boot the disc.");
    host.start();
    setInterval(tick, 150);
  } catch (error) {
    status.textContent = error.message;
    if (!nativeEngine) {
      browserDisc = undefined;
      discPicker.value = "";
    }
    begin.hidden = false;
    begin.textContent = "Retry";
  }
};
begin.hidden = false;
if (!nativeEngine) begin.textContent = "Open Melee disc";
status.textContent = "Your local copy · 4 stocks · 8 minutes · No items";
if (params.has("qa")) {
  const panel = document.createElement("div");
  panel.id = "qa";
  const output = document.createElement("pre");
  // StKind IDs from melee/src/melee/gr/forward.h (not the separate GrKind IDs).
  const stageSelector = document.createElement("select");
  stageSelector.setAttribute("aria-label", "Tournament stage");
  for (const [id, name] of [[31, "Battlefield"], [32, "Final Destination"],
    [28, "Dream Land 64"], [8, "Yoshi's Story"], [2, "Fountain of Dreams"], [3, "Pokémon Stadium"]])
    stageSelector.add(new Option(name, String(id)));
  panel.append(stageSelector);
  for (const [name, mask] of [
    ["A", 1],
    ["B", 2],
    ["Start", 16],
    ["Jump", 4],
  ]) {
    const b = document.createElement("button");
    b.textContent = `GC ${name}`;
    b.onclick = () => (mask === 16 ? startButton() : pulse(mask));
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
  for(const key of ["W","A","S","D"]){
    const b=document.createElement("button");b.textContent=`Step ${key}`;
    b.onclick=()=>{const code=`Key${key}`;window.dispatchEvent(new KeyboardEvent("keydown",{code,bubbles:true}));setTimeout(()=>window.dispatchEvent(new KeyboardEvent("keyup",{code,bubbles:true})),120);};panel.append(b);
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
      testForms = selectors.map((select) => Number(select.value) === 19);
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
      // QA may be activated while WASM is still initializing. Do not send
      // memory inspection requests before the normal boot loop is ready.
      if (!ready) { await delay(150); continue; }
      try {
        const state = await host.adapter.request("meleeInspect", {});
        if (predicate(state)) return state;
      } catch (error) {
        // The disc can be mounted before its DOL initializes MEM1. Only this
        // boot condition is retryable; core/transport errors must remain visible.
        if (!error.message?.includes("Melee MEM1 signature not found")) throw error;
      }
      await delay(150);
    }
    throw new Error("Melee scene transition timed out");
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
  async function waitForSss() {
    let previous,
      baseline,
      since = performance.now();
    return waitForGame((state) => {
      const valid =
        state.major === 2 && state.minor === 1 && state.sceneKind === 9 && state.sceneFrame > 45;
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
  async function startTestMatch(overrides = {}) {
    await control("start", overrides);
    // A cold JIT burst can outlast a wall-clock pulse. Hold the QA Start
    // input until Melee acknowledges the scene transition, then release it.
    clearTimeout(pulseTimer);
    pulseUntil = performance.now() + 90000;
    host.setInputState({ ...sample(), mask: sample().mask | 16 });
    try {
      await waitForGame(s => s.major === 2 && s.minor === 1);
    } finally {
      pulseUntil = 0;
      host.setInputState(sample());
    }
    await waitForSss();
    await host.adapter.request("meleeControl", { action: "selectStage", stage: Number(stageSelector.value) });
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
        testForms = [p === 19, p + 1 === 19];
        await host.adapter.request("meleeControl", { action: "select", player: p, cpu: p + 1 });
        await delay(800);
        await waitForCss();
        await startTestMatch();
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
      testForms = [false, false];
      await host.adapter.request("meleeControl", { action: "select", player: 2, cpu: 2 });
      await delay(800);
      await waitForCss();
      await startTestMatch();
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
      if (pauseStart.match.elapsed !== pauseEnd.match.elapsed || pauseEnd.match.pauser !== 0)
        throw new Error("Melee pause did not freeze the match");
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
          pauseFrames: [pauseStart.match.elapsed, pauseEnd.match.elapsed],
          nativePauser: pauseEnd.match.pauser,
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
        "PASS: Escape pauses/resumes the native match; W stays grounded with tap jump off and jumps with it on.";
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
    progress.textContent = "Preparing a fresh match for measurement…";
    output.textContent = "";
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
      const cpuWorkload = params.get("benchmarkcpu") === "1" || params.get("inputprobe") !== "1";
      await startTestMatch({online: !cpuWorkload});
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
      if (!nativeEngine) {
        if (params.get("ogltestclear") === "1") throw Error("Disable the test pattern before benchmarking gameplay");
        const { measureBrowserGameplay, measureBrowserDelivery, summarizeCoreProfile } = await import("./browser-benchmark.js");
        const capacityProbe = params.get("probe") === "capacity";
        const duration = capacityProbe ? 10 : Math.max(30, Math.min(120, Number(params.get("benchmarkSeconds")) || 30));
        progress.textContent = `Measuring ${duration} seconds of visible browser gameplay…`;
        const profileBefore = (await host.adapter.request("rendererDiagnostics", {})).coreProfile;
        const measure = params.get("probe") === "delivery" ? measureBrowserDelivery : measureBrowserGameplay;
        const result = await measure(host, duration,
          () => host.adapter.request("meleeInspect", {}), {sampleWidth:Number(params.get("samplegrid") || 32)});
        const profileAfter = (await host.adapter.request("rendererDiagnostics", {})).coreProfile;
        result.coreProfile = summarizeCoreProfile(profileBefore, profileAfter, result.seconds);
        if (capacityProbe) { result.diagnosticOnly = true; result.passed = false; }
        result.stage = stageSelector.selectedOptions[0].textContent;
        result.workload = cpuWorkload ? "human versus level 9 CPU" : "two human controller ports (idle)";
        result.engine = {
          coreSha256: host.adapter.expectedCoreSha256,
          backend: host.videoBackend,
          proxy: host.oglProxyMode,
          presentationPacing: host.adapter.bitmapPresentationPacing,
          bitmapPresenter: typeof host.adapter.detachedOglContext?.transferFromImageBitmap === "function",
          pixelPresenter: host.oglSabEnabled ? (host.oglPixelPresenter ? "webgl" : "2d") : null,
          presentationQueue: host.adapter.presentationQueue?.stats,
          timing: host.timingProfile,
          correctTimeDrift: host.correctTimeDrift,
          jitRequested: host.ppcWasmJit,
          jitTier: host.ppcWasmJitTier,
          interpreterDisableMask: host.cachedInterpreterDisableMask,
          profiler: host.ppcProfile,
          metrics: host.collectMetrics,
          emulationSpeed: host.emulationSpeed,
          cpuOverclock: host.cpuOverclock,
          cpuThread: host.cpuThread,
          capabilities,
        };
        output.textContent = JSON.stringify(result, null, 2);
        progress.textContent = result.diagnosticOnly
          ? capacityProbe ? "Diagnostic capacity run; normal-speed acceptance was not tested." : "Diagnostic delivery run; distinct image cadence was not measured."
          : result.passed
          ? "PASS: sustained browser gameplay at 720p60."
          : "Below target; see actual image cadence, source resolution, and simulation speed.";
        return;
      }
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
  if (!nativeEngine) {
    const rollbackCheck = document.createElement("button");
    rollbackCheck.textContent = "Verify browser state replay";
    rollbackCheck.onclick = async () => {
      rollbackCheck.disabled = true;
      progress.textContent = "Preparing browser state replay…";
      let lastAction = "prepare";
      const command = (action, data = {}) => {
        lastAction = action + (data.slot === undefined ? "" : " slot " + data.slot);
        if (action !== "clear") progress.textContent = "Replay: " + lastAction;
        return host.adapter.request("browserRollback", {action, ...data});
      };
      const steps = async () => {
        const records = [];
        let previous = await host.adapter.request("meleeInspect", {});
        for (let i = 0; i < 8; i++) {
          if (params.get("inputprobe") === "1") {
            const pads = [neutral(), neutral()];
            pads[0].stickX = i < 4 ? 220 : 128;
            pads[0].mask = i === 4 ? 1 : i >= 6 ? 4 : 0;
            pads[1].stickX = i < 4 ? 36 : 128;
            pads[1].mask = i === 4 ? 2 : i >= 6 ? 32 : 0;
            await command("pads", {pads, frame: previous.sceneFrame});
          }
          const timing = await command("step", {unthrottled: params.get("stepcapacity") === "1"});
          const state = await host.adapter.request("meleeInspect", {});
          records.push({delta: state.sceneFrame - previous.sceneFrame, milliseconds: timing.milliseconds, transitionMilliseconds: timing.transitionMilliseconds, waitMilliseconds: timing.waitMilliseconds});
          previous = state;
        }
        return {records, state: previous};
      };
      try {
        let current = await waitForGame(() => true);
        if (current.major !== 2) {
          await waitForCss();
          current = await host.adapter.request("meleeInspect", {});
        }
        if (current.major === 2 && current.minor === 2) {
          await control("quit");
          await waitForCss();
          current = await host.adapter.request("meleeInspect", {});
        }
        if (current.major === 2 && current.minor === 0) {
          await waitForCss();
          await startTestMatch();
        } else if (current.major === 2 && current.minor === 1) {
          await host.adapter.request("meleeControl", {action:"selectStage", stage:Number(stageSelector.value)});
          pulse(1);
        }
        await waitForGame(s => s.major === 2 && s.minor === 2 && s.sceneFrame > 300);
        progress.textContent = "Checking complete-machine capture and replay…";
        await command("pause");
        // Align with the existing Dolphin frame-step boundary before capture.
        await command("step");
        const initial = await host.adapter.request("meleeInspect", {});
        if (params.get("timelineprobe") === "1") {
          const {verifyBrowserRollbackTimeline} = await import("./browser-rollback-probe.js");
          const dispatchBefore = params.get("wasmdispatchcompare") === "1"
            ? (await host.adapter.request("rendererDiagnostics", {})).cpuDetails : "";
          const result = await verifyBrowserRollbackTimeline(command,
            () => host.adapter.request("meleeInspect", {}),
            {frames:Number(params.get("timelineframes") || 40),
              delay:Number(params.get("timelinedelay") || 3),
              checkpointPolicy:params.get("checkpoints") || "periodic",
              batchAdvance:params.get("batchadvance") === "1",
              cacheFastPathComparison:params.get("cachecompare") === "1",
              cacheLoopComparison:params.get("batchcompare") === "1",
              inlineDispatchComparison:params.get("dispatchcompare") === "1",
              wasmDispatchComparison:params.get("wasmdispatchcompare") === "1",
              codegenComparison:params.get("codegencompare") === "1" ? {regcache:params.get("regalloc") === "1",fastmem:params.get("fastmemhoist") === "1"} : null,
              onProgress: context => { progress.textContent = "Replay: " + context; }});
          const diagnostics = await host.adapter.request("rendererDiagnostics", {});
          if (params.get("wasmdispatchcompare") === "1") {
            const before = /wasm-dispatch:(\d+)\/(\d+)calls/.exec(dispatchBefore || "");
            const after = /wasm-dispatch:(\d+)\/(\d+)calls/.exec(diagnostics.cpuDetails || "");
            const calls = Number(after?.[2] || 0) - Number(before?.[2] || 0);
            result.optimizationExecution = {dispatcherHandle:Number(after?.[1] || 0), calls};
            result.passed = result.passed && result.optimizationExecution.dispatcherHandle > 0 && calls > 0;
          }
          result.engine = {coreSha256:host.adapter.expectedCoreSha256,
            profileEnabled:diagnostics.coreProfile?.enabled,
            sourceResolution:host.oglSabEnabled ? [host.oglSabWidth,host.oglSabHeight] :
              [host.adapter.presentedWidth,host.adapter.presentedHeight]};
          output.textContent = JSON.stringify(result, null, 2);
          progress.textContent = result.passed ? "PASS: late inputs corrected to identical full state." :
            "Replay or optimization execution check failed; see diagnostics.";
          return;
        }
        const gpuResident = params.get("gpucheckpoint") === "1";
        // Validate a fast checkpoint against independent full CPU/GPU captures.
        if (gpuResident) await command("capture", {slot: 4});
        const coldCapture = await command("capture", {slot: 0, gpuResident});
        const warmCaptures = [];
        if (params.get("checkpointwarm") === "1")
          for (let i = 0; i < 3; i++) warmCaptures.push(await command("capture", {slot: 0, gpuResident}));
        const capture = warmCaptures.at(-1) || coldCapture;
        const first = await steps();
        await command("capture", {slot: 1});
        const restore = await command("restore", {slot: 0});
        const restored = await host.adapter.request("meleeInspect", {});
        await command("capture", {slot: 3});
        const restoreComparison = await command("equal", {a: gpuResident ? 4 : 0, b: 3});
        const second = await steps();
        await command("capture", {slot: 2});
        const comparison = await command("equal", {a: 1, b: 2});
        const inputProbe = params.get("inputprobe") === "1";
        const bothPortsMoved = !inputProbe || [0, 1].every(port => {
          const before = initial.fighters.find(f => f.port === port);
          const after = first.state.fighters.find(f => f.port === port);
          return before && after && before.slotType === 0 && after.slotType === 0 &&
            (after.x - before.x) * (port === 0 ? 1 : -1) > 0.1;
        });
        const passed = comparison.equal && bothPortsMoved && restored.sceneFrame === initial.sceneFrame &&
          [...first.records, ...second.records].every(r => r.delta === 1);
        output.textContent = JSON.stringify({passed, fullMachineBytesEqual: comparison.equal,
          gpuResident, bothPortsMoved, initialFighters: initial.fighters, twoPortInputs: params.get("inputprobe") === "1", unthrottledReplay: params.get("stepcapacity") === "1", comparison: comparison.comparison, restoreComparison, coldCapture, warmCaptures, capture, restore, initialFrame: initial.sceneFrame, restoredFrame: restored.sceneFrame,
          first, second}, null, 2);
        progress.textContent = passed ? "PASS: eight-frame complete-machine replay matches." :
          "Replay differs; this core is not yet suitable for rollback.";
      } catch (error) {
        progress.textContent = "FAILED: " + error.message;
        output.textContent = JSON.stringify({passed:false, action:lastAction, error:error.message}, null, 2);
      } finally {
        try { await command("clear"); } catch {}
        if (params.get("cachecompare") === "1") {
          try { await host.adapter.request("browserRollback", {action:"cacheFastPath", value:params.get("dcbfast") === "1"}); } catch {}
        }
        if (params.get("batchcompare") === "1") {
          try { await host.adapter.request("browserRollback", {action:"cacheLoopBatch", value:params.get("dcbbatch") === "1"}); } catch {}
        }
        if (params.get("dispatchcompare") === "1") {
          try { await host.adapter.request("browserRollback", {action:"inlineDispatch", value:params.get("inlinedispatch") === "1"}); } catch {}
        }
        if (params.get("wasmdispatchcompare") === "1") {
          try { await host.adapter.request("browserRollback", {action:"wasmDispatch", value:params.get("wasmdispatch") === "1"}); } catch {}
        }
        if (params.get("codegencompare") === "1") {
          try { await host.adapter.request("browserRollback", {action:"codegen", regcache:params.get("regalloc") === "1",fastmem:params.get("fastmemhoist") === "1"}); } catch {}
        }
        try { await host.adapter.request("start", {}); } catch {}
        rollbackCheck.disabled = false;
      }
    };
    panel.append(rollbackCheck);
  }
  const menuCheck = document.createElement("button");
  menuCheck.textContent = "Verify menu flow";
  menuCheck.onclick = async () => {
    menuCheck.disabled = true;
    const savedTap = $("tapJump").checked;
    const press = (code, down) =>
      window.dispatchEvent(new KeyboardEvent(down ? "keydown" : "keyup", { code, bubbles: true }));
    try {
      if (paused) await setPaused(false);
      if (gameState?.minor === 2) await quitMatch();
      if (gameState?.minor === 1) pulse(2);
      await waitForCss();
      testForms = [false, false];
      await host.adapter.request("meleeControl", { action: "select", player: 18, cpu: 2 });
      await delay(800);
      const original = await waitForCss();
      progress.textContent = "Checking keyboard view…";
      await setPaused(true);
      $("tapJump").checked = !savedTap;
      $("tapJump").dispatchEvent(new Event("change"));
      await delay(300);
      const frozen = await host.adapter.request("meleeInspect", {});
      press("Space", true);
      press("KeyI", true);
      await delay(350);
      press("Space", false);
      press("KeyI", false);
      const stillFrozen = await host.adapter.request("meleeInspect", {});
      if (
        stillFrozen.sceneFrame <= frozen.sceneFrame ||
        JSON.stringify(frozen.cssCursor) !== JSON.stringify(stillFrozen.cssCursor) ||
        stillFrozen.tapJump === savedTap
      )
        throw Error("Keyboard view did not isolate game input and apply tap jump");
      await setPaused(false);
      await waitForCss();
      await control("start");
      pulse(16);
      await waitForSss();
      progress.textContent = "Checking stage-select Back…";
      pulse(2);
      const returned = await waitForCss();
      if (String(returned.cssCharacters) !== String(original.cssCharacters))
        throw Error("Stage-select Back lost the chosen fighters");
      await control("start");
      pulse(16);
      await waitForSss();
      progress.textContent = "Checking native Sheik hold-A on Fountain of Dreams…";
      press("KeyP", true); // Original Zelda hold-A behavior, no starting-form override.
      await host.adapter.request("meleeControl", { action: "selectStage", stage: 2 });
      const fountain = await waitForGame(
        (s) => s.minor === 2 && s.sceneKind === 2 && s.sceneFrame > 140 && s.fighters.length === 2,
      );
      press("KeyP", false);
      if (fountain.match.stage !== 2 || fountain.fighters[0].character !== 19)
        throw Error(
          "Native stage selection or Zelda hold-A differs: " + JSON.stringify(fountain.fighters),
        );
      press("Escape", true);
      press("Escape", false);
      await delay(400);
      progress.textContent = "Checking native quit chord…";
      for (const code of ["KeyI", "KeyL", "KeyP"]) press(code, true);
      press("Escape", true);
      press("Escape", false);
      await delay(300);
      for (const code of ["KeyI", "KeyL", "KeyP"]) press(code, false);
      await waitForCss();
      await startTestMatch();
      const battlefield = await waitForGame(
        (s) => s.minor === 2 && s.sceneKind === 2 && s.sceneFrame > 140 && s.fighters.length === 2,
      );
      if (battlefield.match.stage !== 31 || battlefield.fighters[0].character !== 18)
        throw Error("Stage or Zelda selection did not reset normally");
      for (const s of [fountain, battlefield]) {
        if (
          s.match.timeLimit !== 480 ||
          s.match.items !== -1 ||
          s.match.cpuLevel !== 9 ||
          s.match.teams !== 0 ||
          s.fighters.some((f) => f.stocks !== 4)
        )
          throw Error("Match rules changed across stages");
      }
      await quitMatch();
      await waitForCss();
      output.textContent = JSON.stringify(
        {
          controlsFrames: [frozen.sceneFrame, stillFrozen.sceneFrame],
          tapJumpApplied: stillFrozen.tapJump,
          retainedCharacters: returned.cssCharacters,
          fountain: { rules: fountain.match, fighter: fountain.fighters[0] },
          battlefield: { rules: battlefield.match, fighter: battlefield.fighters[0] },
          nativeQuit: true,
          returnedToCss: true,
        },
        null,
        2,
      );
      progress.textContent =
        "PASS: keyboard input isolation, tap jump, stage Back, two stages, native Sheik hold-A, native quit chord, and return to character select.";
    } catch (error) {
      progress.textContent = "FAILED: " + error.message;
    } finally {
      keys.clear();
      host.setInputState(neutral());
      if (paused) await setPaused(false);
      $("tapJump").checked = savedTap;
      $("tapJump").dispatchEvent(new Event("change"));
      menuCheck.disabled = false;
    }
  };
  panel.append(menuCheck);
  const stagesCheck = document.createElement("button");
  stagesCheck.textContent = "Verify tournament stages";
  stagesCheck.onclick = async () => {
    stagesCheck.disabled = true;
    const originalStage = stageSelector.value;
    const stages = [];
    output.textContent = "";
    try {
      if (paused) await setPaused(false);
      if (gameState?.minor === 2) await quitMatch();
      await waitForCss();
      for (const option of stageSelector.options) {
        stageSelector.value = option.value;
        progress.textContent = `Checking ${option.textContent} (${stages.length + 1}/6)…`;
        await startTestMatch({online:false});
        const start = await waitForGame(s => s.minor === 2 && s.sceneKind === 2 &&
          s.sceneFrame > 140 && s.fighters.length === 2);
        if (start.match.stage !== Number(option.value) || start.match.timeLimit !== 480 ||
            start.match.items !== -1 || start.match.cpuLevel !== 9 || start.match.teams !== 0 ||
            start.fighters[1].slotType !== 1 || start.fighters.some(f => f.stocks !== 4))
          throw Error(`Wrong match rules on ${option.textContent}`);
        const end = await waitForGame(s => s.sceneFrame >= start.sceneFrame + 300);
        stages.push({name:option.textContent,stage:start.match.stage,rules:start.match,
          startFrame:start.sceneFrame,endFrame:end.sceneFrame,sourceResolution:[$("screen").width,$("screen").height]});
        await quitMatch();
        await waitForCss();
      }
      output.textContent = JSON.stringify({passed:true,stages,returnedToCss:true},null,2);
      progress.textContent = "PASS: all six tournament stages, fixed match rules, live frame progression, and return to character select.";
    } catch (error) {
      output.textContent = JSON.stringify({passed:false,stages,error:error.message},null,2);
      progress.textContent = "FAILED: " + error.message;
    } finally {
      stageSelector.value = originalStage;
      stagesCheck.disabled = false;
    }
  };
  panel.append(stagesCheck);
  const handCheck = document.createElement("button");
  handCheck.textContent = "Move hand to keyboard";
  handCheck.onclick = async () => {
    handCheck.disabled = true;
    try {
      if (paused) await setPaused(false);
      for (let i = 0; i < 120; i++) {
        const state = await host.adapter.request("meleeInspect", {});
        const c = state.cssCursor;
        if (!c) throw Error("Hand navigation requires character select");
        const dx = -23.5 + (host.online&&host.room?.seat===1?44.75:0) - c.x,
          dy = -21 - c.y;
        if (Math.abs(dx) < 0.4 && Math.abs(dy) < 0.4) break;
        keys.clear();
        keys.add("ShiftLeft");
        if (Math.abs(dx) >= 0.4) keys.add(dx > 0 ? "KeyD" : "KeyA");
        if (Math.abs(dy) >= 0.4) keys.add(dy > 0 ? "KeyW" : "KeyS");
        host.setInputState(sample());
        await delay(35);
        keys.clear();
        host.setInputState(neutral());
        await delay(35);
      }
      const state = await host.adapter.request("meleeInspect", {});
      output.textContent = JSON.stringify({
        hand: state.cssCursor,
        hovered: keyboardHovered(state),
      });
    } catch (e) {
      output.textContent = e.stack;
    } finally {
      keys.clear();
      host.setInputState(neutral());
      handCheck.disabled = false;
    }
  };
  panel.append(handCheck);
  const keyboardCheck = document.createElement("button");
  keyboardCheck.textContent = "Verify keyboard navigation";
  keyboardCheck.onclick = async () => {
    keyboardCheck.disabled = true;
    const saved = $("tapJump").checked;
    const source = audio.source;
    let nonzeroPcmChunks = 0;
    const press = (code) => {
      for (const type of ["keydown", "keyup"])
        window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
    };
    try {
      await handCheck.onclick();
      press("KeyP");
      for (let i = 0; i < 60 && (!paused || controlsChanging); i++) await delay(50);
      if (!paused || controlsChanging) throw Error("Hand + P did not open keyboard controls");
      // Allow the neutral input and the room's sampled cursor to catch up before
      // comparing positions, including the QA client's artificial input delay.
      if (host.online) await delay(host.inputDelayMs + 200);
      const before = await host.adapter.request("meleeInspect", {});
      const audioBefore = audio.nextPlayTime;
      audio.source = async (frames) => {
        const chunk = await source(frames);
        if (chunk.samples?.some((sample) => sample !== 0)) nonzeroPcmChunks++;
        return chunk;
      };
      press("KeyD");
      if (!$("tapJump").checked) throw Error("D did not enable tap jump");
      press("KeyA");
      if ($("tapJump").checked) throw Error("A did not disable tap jump");
      press("KeyP");
      if (!$("tapJump").checked) throw Error("P did not toggle tap jump");
      press("KeyS");
      if (document.activeElement !== $("closeControls")) throw Error("S did not select Back");
      press("KeyW");
      if (document.activeElement !== $("tapJump")) throw Error("W did not select Tap jump");
      await delay(1000);
      const after = await host.adapter.request("meleeInspect", {});
      if (
        after.sceneFrame <= before.sceneFrame ||
        JSON.stringify(before.cssCursor) !== JSON.stringify(after.cssCursor) ||
        JSON.stringify(before.cssCharacters) !== JSON.stringify(after.cssCharacters)
      )
        throw Error("Controls must isolate input while keeping native CSS running");
      if (
        audio.muted ||
        audio.context?.state !== "running" ||
        audio.nextPlayTime <= audioBefore ||
        nonzeroPcmChunks === 0
      )
        throw Error("Menu music did not keep playing");
      const result = {
        passed: true,
        cursor: after.cssCursor,
        nativeFrames: [before.sceneFrame, after.sceneFrame],
        audioScheduledSeconds: audio.nextPlayTime - audioBefore,
        audioState: audio.context.state,
        nonzeroPcmChunks,
      };
      press("KeyS");
      press("KeyP");
      await delay(100);
      if (paused) throw Error("P on Back did not close the controls");
      press("KeyP");
      await delay(200);
      press("KeyO");
      await delay(100);
      if (paused) throw Error("O did not close the controls");
      press("KeyP");
      await delay(200);
      press("Escape");
      await delay(100);
      if (paused) throw Error("Escape did not close the controls");
      output.textContent = JSON.stringify(result, null, 2);
    } catch (e) {
      output.textContent = e.stack;
    } finally {
      audio.source = source;
      if (paused) await setPaused(false);
      toggleTapJump(saved);
      keyboardCheck.disabled = false;
    }
  };
  panel.append(keyboardCheck);
  if (!nativeEngine) {
    const diagnostic = document.createElement("button");
    diagnostic.textContent = "Browser engine diagnostics";
    diagnostic.onclick = async () => {
      const d = typeof host.adapter.request === "function"
        ? await host.adapter.request("rendererDiagnostics", {})
        : {};
      const { game, ...frame } = frames || {};
      output.textContent = JSON.stringify({
        frame,
        boot: host.game?.coreBoot,
        capabilities,
        status: browserStatus,
        renderer: {
          requested: d.requestedVideoBackend,
          configured: d.configuredVideoBackend,
          presenter: d.activePresenterBackend,
          errors: d.errors,
          stderr: d.emscriptenPrintErr,
          coreLog: d.coreLog,
          cpuDetails: d.cpuDetails,
          cpuBlocks: d.cpuBlocks,
          profile: d.coreProfile,
          history: d.statusHistory,
          output: d.outputContract,
        },
      }, null, 2);
    };
    panel.append(diagnostic);
  }
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
        cursor: s.cssCursor,
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
