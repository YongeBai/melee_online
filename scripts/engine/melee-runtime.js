import {isLoadedMeleeMatch} from "./browser-scene-ready.js";
import { AudioController } from "/engine/src/audio.js";
import { characterSelectReady } from "./melee-startup.js";
import { readGamepadInput, selectPreferredGamepad } from "/engine/src/input.js";

const params = new URLSearchParams(location.search);
const nativeEngine = params.get("engine") !== "wasm";
const hostedGame = !nativeEngine && document.documentElement.dataset.hostedGame;
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
let runtimeSettingsMatch = "",
  runtimeSettingsFrame = -1;
let queueClockApplied = false;
const appliedRuntimeSettings = new Set();
async function applyRuntimeSettingOnce(key, action, enabled) {
  if (appliedRuntimeSettings.has(key)) return;
  await host.adapter.request("meleeControl", { action, enabled });
  appliedRuntimeSettings.add(key);
}
const audio = new AudioController({ outputEnabled: nativeEngine });
// Start quietly, before the first user gesture enables the audio context.
let volume = 0.25;
try {
  const saved = localStorage.getItem("melee.volume");
  if (saved !== null && saved.trim() !== "" && Number.isFinite(Number(saved)))
    volume = Math.max(0, Math.min(1, Number(saved)));
} catch { /* Audio controls also work when browser storage is unavailable. */ }
audio.volume = volume;
const volumeControl = $("volume");
if (volumeControl) {
  volumeControl.value = String(Math.round(volume * 100));
  volumeControl.addEventListener("input", () => {
    audio.setVolume(Number(volumeControl.value) / 100);
    try { localStorage.setItem("melee.volume", String(audio.volume)); } catch {}
  });
}
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
    if (!ready && !message.includes("MEM1 signature"))
      status.textContent = hostedGame ? "Starting Melee…" : message;
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
    if (!nativeEngine && !queueClockApplied && host.adapter.presentationQueue &&
        params.get("queueclock") === "raf") {
      host.adapter.presentationQueue.setRateLimited(false);
      host.adapter.bitmapPresentationPacing = "raf-buffered-native-clock";
      queueClockApplied = true;
    }
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
    const loadedMatch = isLoadedMeleeMatch(state);
    if (!loadedMatch) {
      runtimeSettingsMatch = "";
      runtimeSettingsFrame = -1;
      appliedRuntimeSettings.clear();
    } else {
      const matchKey = `${state.major}:${state.minor}:${state.sceneKind}:${state.match?.stage}`;
      if (matchKey !== runtimeSettingsMatch || state.sceneFrame < runtimeSettingsFrame) {
        runtimeSettingsMatch = matchKey;
        appliedRuntimeSettings.clear();
      }
      runtimeSettingsFrame = state.sceneFrame;
      const stage = state.match?.stage;
      // Frozen Stadium is the tournament variant. Its video board is purely
      // decorative and remains one of the neutral map's hottest stage-local
      // render paths, so the frozen profile suppresses it as one setting.
      if ((params.get("stadiumscreen") === "off" || params.get("stadiumfreeze") === "1") && stage === 3)
        await applyRuntimeSettingOnce("stadium-screen", "stadiumScreen", false);
      if (params.get("stadiumfreeze") === "1" && stage === 3)
        await applyRuntimeSettingOnce("stadium-transformations", "stadiumTransformations", false);
      if (params.get("stadiumfreeze") === "1" && stage === 3)
        await applyRuntimeSettingOnce("stadium-decoration", "stadiumDecoration", false);
      if (params.get("background") === "black")
        await applyRuntimeSettingOnce("stage-background", "stageBackground", false);
      if (params.get("backgroundanimation") === "off" && [31, 32].includes(stage))
        await applyRuntimeSettingOnce("background-animation", "staticBackgroundAnimation", false);
      if (params.get("reflection") === "off" && stage === 2)
        await applyRuntimeSettingOnce("fountain-reflection", "fountainReflection", false);
      if (params.get("models") === "low")
        await applyRuntimeSettingOnce("model-detail", "modelDetail", false);
      if (params.get("particles") === "off" && stage === 2)
        await applyRuntimeSettingOnce("fountain-particles", "fountainParticles", false);
      if (params.get("decorations") === "off" && stage === 2)
        await applyRuntimeSettingOnce("fountain-decorations", "fountainDecorations", false);
      if (params.get("scenery") === "off" && stage === 2)
        await applyRuntimeSettingOnce("fountain-scenery", "fountainScenery", false);
      if (params.get("sceneryanimation") === "off" && params.get("scenery") === "off" && stage === 2)
        await applyRuntimeSettingOnce("fountain-animation", "fountainAnimation", false);
      if (params.get("reverb") === "off")
        await applyRuntimeSettingOnce("aux-reverb", "auxReverb", false);
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
      if (!ready && (nativeEngine || characterSelectReady(state))) {
        ready = true;
        audio.setOutputEnabled(true);
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
let booting = false;
begin.onclick = async () => {
  if (booting) return;
  if (!nativeEngine && !browserDisc && !hostedGame) {
    discPicker.click();
    return;
  }
  begin.hidden = true;
  booting = true;
  try {
    if (!hostedGame) await audio.setMuted(false);
    status.textContent = hostedGame ? "Loading Melee…" : "Opening your local Melee disc…";
    if (nativeEngine) {
      await host.mountFile();
    } else {
      const { browserCapabilities, requireBrowserBackend } = await import("./browser-capabilities.js");
      capabilities = await browserCapabilities();
      requireBrowserBackend(capabilities, host.videoBackend, host.oglProxyMode);
      if (hostedGame && !browserDisc) {
        const { loadHostedGame } = await import("./browser-hosted-game.js");
        browserDisc = await loadHostedGame(hostedGame, message => { status.textContent = message; });
      }
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
    booting = false;
  }
};
begin.hidden = Boolean(hostedGame);
if (!nativeEngine) begin.textContent = "Open Melee disc";
status.textContent = "Your local copy · 4 stocks · 8 minutes · No items";
if (hostedGame) {
  loading.querySelector('h1')?.setAttribute('hidden', '');
  status.textContent = 'Loading Melee…';
  // Boot independently of autoplay policy. The first interaction enables sound.
  let enablingAudio = false;
  const enableAudio = async () => {
    if (enablingAudio) return;
    enablingAudio = true;
    try {
      await audio.setMuted(false);
      window.removeEventListener('pointerdown', enableAudio);
      window.removeEventListener('keydown', enableAudio);
    } catch { enablingAudio = false; }
  };
  window.addEventListener('pointerdown', enableAudio);
  window.addEventListener('keydown', enableAudio);
  void begin.onclick();
}
if (params.has("qa")) {
  const panel = document.createElement("div");
  panel.id = "qa";
  const qaToggle=document.createElement("button");qaToggle.textContent="Toggle diagnostics";
  Object.assign(qaToggle.style,{position:"fixed",left:"8px",top:"8px",zIndex:1000});
  qaToggle.onclick=()=>{panel.style.display=panel.style.display==="none"?"":"none";};document.body.append(qaToggle);
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
    const gpuStartDelay = Number(params.get("gpustartdelay"));
    if (!nativeEngine && [2000, 4000, 8000].includes(gpuStartDelay)) {
      await host.adapter.request("browserRollback", { action: "pause" });
      try {
        const applied = await host.adapter.request("browserRollback", {
          action: "gpuStartDelay",
          cycles: gpuStartDelay,
        });
        if (applied.cycles !== gpuStartDelay)
          throw Error("GPU service batching was not applied");
      } finally {
        await host.adapter.request("start", {});
      }
    }
    // Retained CPU optimizations must also apply to cosmetic QA/acceptance
    // runs; setting a query parameter alone does not configure the native core.
    if(!nativeEngine && params.get('matrixfast')==='1'){
      const {browserCodegenConfig}=await import('./browser-benchmark.js');
      await host.adapter.request('browserRollback',{action:'pause'});
      try{
        const config={...browserCodegenConfig(host),matrixfast:true};
        const applied=await host.adapter.request('browserRollback',{action:'codegen',...config});
        if(applied.matrixfast!==true)throw Error('Retained Melee matrix specialization was not applied');
        host.matrixFast=true;
      }finally{await host.adapter.request('start',{});}
    }
    if(!nativeEngine && params.get('animstatefast')==='1'){
      const {browserCodegenConfig}=await import('./browser-benchmark.js');
      await host.adapter.request('browserRollback',{action:'pause'});
      try{
        const config={...browserCodegenConfig(host),animstatefast:true};
        const applied=await host.adapter.request('browserRollback',{action:'codegen',...config});
        if(applied.animstatefast!==true)throw Error('Melee animation-state specialization was not applied');
        host.meleeAnimStateFast=true;
      }finally{await host.adapter.request('start',{});}
    }
    if(!nativeEngine && params.get('animcallbackfast')==='1'){
      const {browserCodegenConfig}=await import('./browser-benchmark.js');
      await host.adapter.request('browserRollback',{action:'pause'});
      try{
        const config={...browserCodegenConfig(host),animcallbackfast:true};
        const applied=await host.adapter.request('browserRollback',{action:'codegen',...config});
        if(applied.animcallbackfast!==true)throw Error('Melee animation callback continuation was not applied');
        host.meleeAnimCallbackFast=true;
      }finally{await host.adapter.request('start',{});}
    }
    if(!nativeEngine && params.get('animfusion')==='1'){
      const {browserCodegenConfig}=await import('./browser-benchmark.js');
      await host.adapter.request('browserRollback',{action:'pause'});
      try{
        const config={...browserCodegenConfig(host),animfusion:true};
        const applied=await host.adapter.request('browserRollback',{action:'codegen',...config});
        if(applied.animfusion!==true)throw Error('Melee animation fusion was not applied');
        host.meleeAnimFusion=true;
      }finally{await host.adapter.request('start',{});}
    }
    if(!nativeEngine && params.get('hotfusion')==='1'){
      const {browserCodegenConfig}=await import('./browser-benchmark.js');
      await host.adapter.request('browserRollback',{action:'pause'});
      try{
        const config={...browserCodegenConfig(host),hotfusion:true};
        const applied=await host.adapter.request('browserRollback',{action:'codegen',...config});
        if(applied.hotfusion!==true)throw Error('Melee hot-function fusion was not applied');
        host.meleeHotFusion=true;
      }finally{await host.adapter.request('start',{});}
    }
    if(!nativeEngine && params.get('displaylistfast')==='1'){
      const {browserCodegenConfig}=await import('./browser-benchmark.js');
      await host.adapter.request('browserRollback',{action:'pause'});
      try{
        const config={...browserCodegenConfig(host),displaylistfast:true};
        const applied=await host.adapter.request('browserRollback',{action:'codegen',...config});
        if(applied.displaylistfast!==true)throw Error('Melee display-list specialization was not applied');
        host.displayListFast=true;
      }finally{await host.adapter.request('start',{});}
    }
    if(!nativeEngine && params.get('gxmatrixfast')==='1'){
      const {browserCodegenConfig}=await import('./browser-benchmark.js');
      await host.adapter.request('browserRollback',{action:'pause'});
      try{
        const config={...browserCodegenConfig(host),gxmatrixfast:true};
        const applied=await host.adapter.request('browserRollback',{action:'codegen',...config});
        if(applied.gxmatrixfast!==true)throw Error('Melee GX matrix specialization was not applied');
        host.gxMatrixFast=true;
      }finally{await host.adapter.request('start',{});}
    }
    // Release play does not need atomic diagnostic-counter publications from
    // the compiled PPC dispatcher or the Melee-specific hot callbacks. The
    // lean mode keeps execution, timing, exceptions and frame stepping intact.
    // It remains query-selectable so the benchmark can restore its control.
    if(!nativeEngine && params.get('leandispatch')==='1'){
      const {browserCodegenConfig}=await import('./browser-benchmark.js');
      await host.adapter.request('browserRollback',{action:'pause'});
      try{
        const config={...browserCodegenConfig(host),leandispatch:true};
        const applied=await host.adapter.request('browserRollback',{action:'codegen',...config});
        if(applied.leandispatch!==true)throw Error('Lean release dispatcher was not applied');
        host.leanDispatch=true;
      }finally{await host.adapter.request('start',{});}
    }
    if(!nativeEngine && params.get('retainedfpuguard')==='1'){
      const {browserCodegenConfig}=await import('./browser-benchmark.js');
      await host.adapter.request('browserRollback',{action:'pause'});
      try{
        const config={...browserCodegenConfig(host),fpuguard:true};
        const applied=await host.adapter.request('browserRollback',{action:'codegen',...config});
        if(applied.fpuguard!==true)throw Error('Retained FPU guard was not applied');
        host.fpuGuardHoist=true;
      }finally{await host.adapter.request('start',{});}
    }
    if(!nativeEngine && params.get("efbscale")==="150"){
      await host.adapter.request("browserRollback",{action:"pause"});
      try{await host.adapter.request("browserRollback",{action:"renderScale",percent:150});}
      finally{await host.adapter.request("start",{});}
    }
    if(!nativeEngine && params.get("compactgpr")==="1"){
      const {browserCodegenConfig}=await import('./browser-benchmark.js');
      await host.adapter.request("browserRollback",{action:"pause"});
      try{await host.adapter.request("browserRollback",{action:"codegen",...browserCodegenConfig(host),compactgpr:true});host.compactGprLocals=true;}
      finally{await host.adapter.request("start",{});}
    }
    if(!nativeEngine && params.get("pssimd")==="1"){
      const {browserCodegenConfig}=await import("./browser-benchmark.js");
      await host.adapter.request("browserRollback",{action:"pause"});
      try{await host.adapter.request("browserRollback",{action:"codegen",...browserCodegenConfig(host),pssimd:true});host.pairedSimd=true;}
      finally{await host.adapter.request("start",{});}
    }
    if(!nativeEngine && params.get("frsqrtefast")==="1"){
      const {browserCodegenConfig}=await import("./browser-benchmark.js");
      await host.adapter.request("browserRollback",{action:"pause"});
      try{await host.adapter.request("browserRollback",{action:"codegen",...browserCodegenConfig(host),frsqrtefast:true});host.frsqrteFast=true;}
      finally{await host.adapter.request("start",{});}
    }
    if(!nativeEngine && params.get("fifobatch")==="1"){
      const {browserCodegenConfig}=await import("./browser-benchmark.js");
      await host.adapter.request("browserRollback",{action:"pause"});
      try{await host.adapter.request("browserRollback",{action:"codegen",...browserCodegenConfig(host),fifobatch:true});host.fifoBatch=true;}
      finally{await host.adapter.request("start",{});}
    }
    if(!nativeEngine && params.get("fifocopy")==="1"){
      const {browserCodegenConfig}=await import("./browser-benchmark.js");
      await host.adapter.request("browserRollback",{action:"pause"});
      try{await host.adapter.request("browserRollback",{action:"codegen",...browserCodegenConfig(host),fifocopy:true});host.fifoCopy=true;}
      finally{await host.adapter.request("start",{});}
    }
    if(!nativeEngine && params.get("msrcache")==="1"){
      const {browserCodegenConfig}=await import("./browser-benchmark.js");
      await host.adapter.request("browserRollback",{action:"pause"});
      try{await host.adapter.request("browserRollback",{action:"codegen",...browserCodegenConfig(host),msrcache:true});host.blockMsrCache=true;}
      finally{await host.adapter.request("start",{});}
    }
    if(!nativeEngine && params.get("stateconst")==="1"){
      const {browserCodegenConfig}=await import("./browser-benchmark.js");
      await host.adapter.request("browserRollback",{action:"pause"});
      try{await host.adapter.request("browserRollback",{action:"codegen",...browserCodegenConfig(host),stateconst:true});host.constantStateBase=true;}
      finally{await host.adapter.request("start",{});}
    }
    if(!nativeEngine && params.get("widemap")==="1"){
      const {browserCodegenConfig}=await import("./browser-benchmark.js");
      await host.adapter.request("browserRollback",{action:"pause"});
      try{await host.adapter.request("browserRollback",{action:"codegen",...browserCodegenConfig(host),widemap:true});host.wideBlockMap=true;}
      finally{await host.adapter.request("start",{});}
    }
    if (!nativeEngine && params.get("qstatefull") === "1") {
      const {browserCodegenConfig}=await import('./browser-benchmark.js');
      await host.adapter.request("browserRollback",{action:"pause"});
      try{await host.adapter.request("browserRollback",{action:"codegen",...browserCodegenConfig(host),qstatefull:true});host.qStateFull=true;}
      finally{await host.adapter.request("start",{});}
    }
    if (!nativeEngine && params.get("qstatecache") === "1") {
      const {browserCodegenConfig}=await import('./browser-benchmark.js');
      await host.adapter.request("browserRollback",{action:"pause"});
      try{await host.adapter.request("browserRollback",{action:"codegen",...browserCodegenConfig(host),qstatecache:true});host.qStateCache=true;}
      finally{await host.adapter.request("start",{});}
    }
    if(!nativeEngine && params.get("psqhoist")==="1"){
      const {browserCodegenConfig}=await import("./browser-benchmark.js");
      await host.adapter.request("browserRollback",{action:"pause"});
      try{await host.adapter.request("browserRollback",{action:"codegen",...browserCodegenConfig(host),psqhoist:true});host.pairedMemoryHoist=true;}
      finally{await host.adapter.request("start",{});}
    }
    if(!nativeEngine && params.get("vectorfpr")==="1"){
      const {browserCodegenConfig}=await import("./browser-benchmark.js");
      await host.adapter.request("browserRollback",{action:"pause"});
      try{await host.adapter.request("browserRollback",{action:"codegen",...browserCodegenConfig(host),vectorfpr:true});host.vectorFprCache=true;}
      finally{await host.adapter.request("start",{});}
    }
    if(!nativeEngine && params.get("psmemsimd")==="1"){
      const {browserCodegenConfig}=await import("./browser-benchmark.js");
      await host.adapter.request("browserRollback",{action:"pause"});
      try{await host.adapter.request("browserRollback",{action:"codegen",...browserCodegenConfig(host),psmemsimd:true});host.pairedMemorySimd=true;}
      finally{await host.adapter.request("start",{});}
    }
    await confirmTestStage();
  }
  async function confirmTestStage() {
    await host.adapter.request("meleeControl", { action: "selectStage", stage: Number(stageSelector.value) });
    // Stage-specific compilation can outlast a short wall-clock pulse on a
    // cold browser core. Hold native A until Melee acknowledges gameplay.
    clearTimeout(pulseTimer);
    pulseUntil = performance.now() + 90000;
    host.setInputState({ ...sample(), mask: sample().mask | 1 });
    try {
      await waitForGame(s => s.major === 2 && s.minor === 2 && s.sceneKind === 2);
    } finally {
      pulseUntil = 0;
      host.setInputState(sample());
    }
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
        const modelDetail=params.get('models')==='low' ? await host.adapter.request('meleeControl',{action:'modelDetail',enabled:false}) : null;
        if(modelDetail && modelDetail.objects.length < 2)throw Error('Native low-detail tables were not verified for both fighters');
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
          modelDetail: modelDetail?.objects,
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

  if(!nativeEngine){

    const stadiumToggle=document.createElement('button');stadiumToggle.textContent='Toggle Stadium video board';
    stadiumToggle.onclick=async()=>{try{const enabled=params.get('stadiumscreen')==='off';params.set('stadiumscreen',enabled?'on':'off');output.textContent=JSON.stringify(await host.adapter.request('meleeControl',{action:'stadiumScreen',enabled}),null,2);}catch(error){output.textContent=error.message;}};
    const stadiumReplay=document.createElement('button');stadiumReplay.textContent='Verify Stadium video board gameplay';
    stadiumReplay.onclick=async()=>{stadiumReplay.disabled=true;const saved=params.get('stadiumscreen');params.delete('stadiumscreen');try{
      const state=await waitForGame(s=>s.major===2);if(state.minor===2)await quitMatch();await waitForCss();stageSelector.value='3';
      testForms=selectors.map(select=>Number(select.value)===19);
      await host.adapter.request('meleeControl',{action:'select',player:Number(selectors[0].value),cpu:Number(selectors[1].value)});await delay(800);await waitForCss();
      await startTestMatch({online:false});await waitForGame(s=>s.minor===2&&s.sceneKind===2&&s.sceneFrame>360);
      const {verifyFountainReflectionState}=await import('./browser-reflection-replay.js');
      const result=await verifyFountainReflectionState(host,{feature:'stadiumscreen',frames:Number(params.get('cosmeticframes')||600),onProgress:text=>{progress.textContent=text;}});
      output.textContent=JSON.stringify(result,null,2);progress.textContent=result.passed?'PASS: Stadium replay matched gameplay, RNG, stage transforms and native camera.':'FAILED: Stadium screen changed a gameplay probe.';
    }catch(error){progress.textContent='FAILED: '+error.message;}finally{if(saved===null)params.delete('stadiumscreen');else params.set('stadiumscreen',saved);host.setInputState(neutral());stadiumReplay.disabled=false;}};
    panel.append(stadiumToggle,stadiumReplay);
    const stadiumDecorationReplay=document.createElement('button');stadiumDecorationReplay.textContent='Verify frozen Stadium decoration';
    stadiumDecorationReplay.onclick=async()=>{stadiumDecorationReplay.disabled=true;try{
      const state=await waitForGame(s=>s.major===2);if(state.minor===2)await quitMatch();await waitForCss();stageSelector.value='3';
      testForms=selectors.map(select=>Number(select.value)===19);
      await host.adapter.request('meleeControl',{action:'select',player:Number(selectors[0].value),cpu:Number(selectors[1].value)});await delay(800);await waitForCss();
      await startTestMatch({online:false});await waitForGame(s=>s.minor===2&&s.sceneKind===2&&s.sceneFrame>360);
      await host.adapter.request('meleeControl',{action:'stadiumTransformations',enabled:false});
      const {verifyFountainReflectionState}=await import('./browser-reflection-replay.js');
      const result=await verifyFountainReflectionState(host,{feature:'stadiumdecoration',frames:Number(params.get('cosmeticframes')||600),onProgress:text=>{progress.textContent=text;}});
      output.textContent=JSON.stringify(result,null,2);progress.textContent=result.passed?'PASS: Frozen Stadium decoration replay matched gameplay, RNG, stage transforms and native camera.':'FAILED: Frozen Stadium decoration changed a gameplay probe.';
    }catch(error){progress.textContent='FAILED: '+error.message;}finally{if(params.get('stadiumfreeze')==='1')await host.adapter.request('meleeControl',{action:'stadiumDecoration',enabled:false});host.setInputState(neutral());stadiumDecorationReplay.disabled=false;}};
    panel.append(stadiumDecorationReplay);
    const particleToggle=document.createElement('button');particleToggle.textContent='Toggle Fountain particles';
    particleToggle.onclick=async()=>{try{const enabled=params.get('particles')==='off';params.set('particles',enabled?'on':'off');output.textContent=JSON.stringify(await host.adapter.request('meleeControl',{action:'fountainParticles',enabled}),null,2);}catch(error){output.textContent=error.message;}};
    const particleReplay=document.createElement('button');particleReplay.textContent='Verify Fountain particles gameplay';
    particleReplay.onclick=async()=>{particleReplay.disabled=true;const saved=params.get('particles');params.delete('particles');try{
      const state=await waitForGame(s=>s.major===2);if(state.minor===2)await quitMatch();await waitForCss();stageSelector.value='2';
      await startTestMatch({online:false});await waitForGame(s=>s.minor===2&&s.sceneKind===2&&s.sceneFrame>360);
      const {verifyFountainReflectionState}=await import('./browser-reflection-replay.js');
      const result=await verifyFountainReflectionState(host,{feature:'particles',onProgress:text=>{progress.textContent=text;}});
      output.textContent=JSON.stringify(result,null,2);progress.textContent=result.passed?'PASS: 600 particle frames matched gameplay, RNG, platforms and native camera.':'FAILED: particles changed a gameplay probe.';
    }catch(error){progress.textContent='FAILED: '+error.message;}finally{if(saved===null)params.delete('particles');else params.set('particles',saved);host.setInputState(neutral());particleReplay.disabled=false;}};
    panel.append(particleToggle,particleReplay);
    const decorationToggle=document.createElement('button');decorationToggle.textContent='Toggle Fountain decorations';
    decorationToggle.onclick=async()=>{try{const enabled=params.get('decorations')==='off';params.set('decorations',enabled?'on':'off');output.textContent=JSON.stringify(await host.adapter.request('meleeControl',{action:'fountainDecorations',enabled}),null,2);}catch(error){output.textContent=error.message;}};
    const decorationReplay=document.createElement('button');decorationReplay.textContent='Verify Fountain decorations gameplay';
    decorationReplay.onclick=async()=>{decorationReplay.disabled=true;const saved=params.get('decorations');params.delete('decorations');try{
      const state=await waitForGame(s=>s.major===2);if(state.minor===2)await quitMatch();await waitForCss();stageSelector.value='2';
      await startTestMatch({online:false});await waitForGame(s=>s.minor===2&&s.sceneKind===2&&s.sceneFrame>360);
      const {verifyFountainReflectionState}=await import('./browser-reflection-replay.js');
      const result=await verifyFountainReflectionState(host,{feature:'decorations',onProgress:text=>{progress.textContent=text;}});
      output.textContent=JSON.stringify(result,null,2);progress.textContent=result.passed?'PASS: 600 decoration frames matched gameplay, RNG, platforms and native camera.':'FAILED: decorations changed a gameplay probe.';
    }catch(error){progress.textContent='FAILED: '+error.message;}finally{if(saved===null)params.delete('decorations');else params.set('decorations',saved);host.setInputState(neutral());decorationReplay.disabled=false;}};
    panel.append(decorationToggle,decorationReplay);
    const geometryInspect=document.createElement('button');geometryInspect.textContent='Inspect Fountain main geometry';
    geometryInspect.onclick=async()=>{try{output.textContent=JSON.stringify(await host.adapter.request('meleeControl',{action:'fountainGeometryInspect'}),null,2);}catch(error){output.textContent=error.message;}};
    const geometrySelection=document.createElement('input');geometrySelection.type='number';geometrySelection.value='-1';geometrySelection.min='-2';geometrySelection.setAttribute('aria-label','Fountain diagnostic joint');
    const geometryView=document.createElement('button');geometryView.textContent='Show diagnostic joint';
    geometryView.onclick=async()=>{try{output.textContent=JSON.stringify(await host.adapter.request('meleeControl',{action:'fountainGeometryView',selection:Number(geometrySelection.value)}),null,2);}catch(error){output.textContent=error.message;}};
    const geometryStart=document.createElement('button');geometryStart.textContent='Prepare Fountain geometry';
    geometryStart.onclick=async()=>{geometryStart.disabled=true;try{
      progress.textContent='Preparing native Fountain geometry…';
      const state=await waitForGame(s=>s.major===2);if(state.minor===2)await quitMatch();await waitForCss();stageSelector.value='2';
      await startTestMatch({online:true});await waitForGame(s=>s.minor===2&&s.sceneKind===2&&s.sceneFrame>360);
      output.textContent=JSON.stringify(await host.adapter.request('meleeControl',{action:'fountainGeometryInspect'}),null,2);progress.textContent='Geometry diagnostic ready; visibility changes are diagnostic only.';
    }catch(error){progress.textContent='FAILED: '+error.message;}finally{geometryStart.disabled=false;}};
    panel.append(geometryStart,geometryInspect,geometrySelection,geometryView);
    const reflectionButton=document.createElement('button');reflectionButton.textContent='Toggle Fountain reflection';
    reflectionButton.onclick=async()=>{try{const enabled=params.get('reflection')==='off';params.set('reflection',enabled?'on':'off');output.textContent=JSON.stringify(await host.adapter.request('meleeControl',{action:'fountainReflection',enabled}),null,2);}catch(error){output.textContent=error.message;}};
    panel.append(reflectionButton);
  }
  if(!nativeEngine){
    const reflectionReplay=document.createElement('button');reflectionReplay.textContent='Verify Fountain reflection gameplay';
    reflectionReplay.onclick=async()=>{
      reflectionReplay.disabled=true;
      const savedCosmetic=params.get('reflection');params.delete('reflection');
      try{
        const state=await waitForGame(s=>s.major===2);
        if(state.minor===2)await quitMatch();await waitForCss();stageSelector.value='2';
        await startTestMatch({online:false});await waitForGame(s=>s.minor===2&&s.sceneKind===2&&s.sceneFrame>360);
        const {verifyFountainReflectionState}=await import('./browser-reflection-replay.js');
        const result=await verifyFountainReflectionState(host,{onProgress:text=>{progress.textContent=text;}});
        output.textContent=JSON.stringify(result,null,2);progress.textContent=result.passed?'PASS: 600 frames matched gameplay, RNG, platform and camera probes.':'FAILED: reflection changed a gameplay probe.';
      }catch(error){progress.textContent='FAILED: '+error.message;}finally{if(savedCosmetic===null)params.delete('reflection');else params.set('reflection',savedCosmetic);host.setInputState(neutral());reflectionReplay.disabled=false;}
    };
    panel.append(reflectionReplay);
  }
  if(!nativeEngine){
    const sceneryReplay=document.createElement('button');sceneryReplay.textContent='Verify Fountain scenery gameplay';
    sceneryReplay.onclick=async()=>{
      sceneryReplay.disabled=true;
      const savedCosmetic=params.get('scenery');params.delete('scenery');
      try{
        const state=await waitForGame(s=>s.major===2);
        if(state.minor===2)await quitMatch();await waitForCss();stageSelector.value='2';
        await startTestMatch({online:false});await waitForGame(s=>s.minor===2&&s.sceneKind===2&&s.sceneFrame>360);
        const {verifyFountainReflectionState}=await import('./browser-reflection-replay.js');
        const result=await verifyFountainReflectionState(host,{feature:"scenery",onProgress:text=>{progress.textContent=text;}});
        output.textContent=JSON.stringify(result,null,2);progress.textContent=result.passed?'PASS: 600 scenery frames matched gameplay, RNG, platform and camera probes.':'FAILED: scenery changed a gameplay probe.';
      }catch(error){progress.textContent='FAILED: '+error.message;}finally{if(savedCosmetic===null)params.delete('scenery');else params.set('scenery',savedCosmetic);host.setInputState(neutral());sceneryReplay.disabled=false;}
    };
    panel.append(sceneryReplay);
  }
  if(!nativeEngine){
    const sceneryButton=document.createElement('button');sceneryButton.textContent='Toggle Fountain scenery';
    sceneryButton.onclick=async()=>{try{const enabled=params.get('scenery')==='off';params.set('scenery',enabled?'on':'off');output.textContent=JSON.stringify(await host.adapter.request('meleeControl',{action:'fountainScenery',enabled}),null,2);}catch(error){output.textContent=error.message;}};
    panel.append(sceneryButton);
    const modelButton=document.createElement('button');modelButton.textContent='Toggle model detail';
    modelButton.onclick=async()=>{try{const enabled=params.get('models')==='low';params.set('models',enabled?'normal':'low');output.textContent=JSON.stringify(await host.adapter.request('meleeControl',{action:'modelDetail',enabled}),null,2);}catch(error){output.textContent=error.message;}};
    panel.append(modelButton);
    const modelReplay=document.createElement('button');modelReplay.textContent='Verify model detail gameplay';
    modelReplay.onclick=async()=>{
      modelReplay.disabled=true;const saved=params.get('models');params.delete('models');
      try{
        const state=await waitForGame(s=>s.major===2);if(state.minor===2)await quitMatch();await waitForCss();stageSelector.value='2';
        await startTestMatch({online:false});await waitForGame(s=>s.minor===2&&s.sceneKind===2&&s.sceneFrame>360);
        const {verifyFountainReflectionState}=await import('./browser-reflection-replay.js');
        const result=await verifyFountainReflectionState(host,{feature:'modeldetail',onProgress:text=>{progress.textContent=text;}});
        output.textContent=JSON.stringify(result,null,2);progress.textContent=result.passed?'PASS: 600 model-detail frames matched gameplay and camera probes.':'FAILED: model detail changed a gameplay probe.';
      }catch(error){progress.textContent='FAILED: '+error.message;}finally{if(saved===null)params.delete('models');else params.set('models',saved);host.setInputState(neutral());modelReplay.disabled=false;}
    };
    panel.append(modelReplay);
    const animationReplay=document.createElement('button');animationReplay.textContent='Verify hidden scenery animation';
    animationReplay.onclick=async()=>{
      animationReplay.disabled=true;progress.textContent='Preparing scenery animation replay…';
      const saved=params.get('sceneryanimation');params.delete('sceneryanimation');
      try{
        if(params.get('scenery')!=='off')throw Error('Hidden scenery is required');
        const state=await waitForGame(s=>s.major===2);if(state.minor===2)await quitMatch();await waitForCss();stageSelector.value='2';
        await startTestMatch({online:false});await waitForGame(s=>s.minor===2&&s.sceneKind===2&&s.sceneFrame>360);
        await host.adapter.request('meleeControl',{action:'fountainScenery',enabled:false});
        const {verifyFountainReflectionState}=await import('./browser-reflection-replay.js');
        const result=await verifyFountainReflectionState(host,{feature:'animation',onProgress:text=>{progress.textContent=text;}});
        output.textContent=JSON.stringify(result,null,2);progress.textContent=result.passed?'PASS: 600 hidden-animation frames matched gameplay and camera probes.':'FAILED: hidden animation changed gameplay.';
      }catch(error){progress.textContent='FAILED: '+error.message;}finally{if(saved===null)params.delete('sceneryanimation');else params.set('sceneryanimation',saved);host.setInputState(neutral());animationReplay.disabled=false;}
    };
    panel.append(animationReplay);

  }
  let queueSelector,queueCompare,queueCandidate;
  if(!nativeEngine && params.get('pace')==='raf'){
    queueSelector=document.createElement('select');queueSelector.setAttribute('aria-label','Presentation queue capacity');
    for(const n of[2,3,4])queueSelector.add(new Option(n+' images',String(n)));
    queueSelector.value=['2','3','4'].includes(params.get('queuecapacity'))?params.get('queuecapacity'):'2';
    queueCompare=document.createElement('input');queueCompare.type='checkbox';queueCompare.setAttribute('aria-label','Compare presentation queues');queueCompare.checked=params.get('benchmarkqueuecapacitycompare')==='1';
    const label=document.createElement('label');label.append(queueCompare,' Compare presentation queues');
    queueCandidate=document.createElement('select');queueCandidate.setAttribute('aria-label','Comparison queue capacity');
    for(const n of[3,4])queueCandidate.add(new Option(n+' images',String(n)));
    queueCandidate.value=params.get('benchmarkqueuecapacity')==='4'?'4':'3';
    panel.append(queueSelector,label,queueCandidate);
  }
  const yoshiAnimationReplay=document.createElement('button');yoshiAnimationReplay.textContent='Verify Yoshi background animation';
  yoshiAnimationReplay.onclick=async()=>{
    yoshiAnimationReplay.disabled=true;progress.textContent='Preparing Yoshi background replay…';
    try{
      if(params.get('background')!=='black')throw Error('Black background is required');
      const state=await waitForGame(s=>s.major===2);if(state.minor===2)await quitMatch();await waitForCss();stageSelector.value='8';
      await host.adapter.request('meleeControl',{action:'select',player:Number(selectors[0].value),cpu:Number(selectors[1].value)});
      await delay(800);await waitForCss();await startTestMatch({online:false});await waitForGame(s=>s.minor===2&&s.sceneKind===2&&s.sceneFrame>360);
      await host.adapter.request('meleeControl',{action:'stageBackground',enabled:false});
      const {verifyFountainReflectionState}=await import('./browser-reflection-replay.js');
      const result=await verifyFountainReflectionState(host,{feature:'yoshianimation',frames:Number(params.get('cosmeticframes')||600),onProgress:text=>{progress.textContent=text;}});
      output.textContent=JSON.stringify(result,null,2);progress.textContent=result.passed?'PASS: Yoshi gameplay, items, RNG, stage and camera probes matched.':'FAILED: Yoshi gameplay probe changed.';
    }catch(error){progress.textContent='FAILED: '+error.message;}finally{host.setInputState(neutral());yoshiAnimationReplay.disabled=false;}
  };panel.append(yoshiAnimationReplay);
  const cpuCompare=document.createElement('input');cpuCompare.type='checkbox';cpuCompare.checked=true;cpuCompare.setAttribute('aria-label','Compare CPU optimization');
  const cpuCompareLabel=document.createElement('label');cpuCompareLabel.append(cpuCompare,' Compare CPU optimization');panel.append(cpuCompareLabel);
  const animationInventoryButton=document.createElement('button');animationInventoryButton.textContent='Inspect stage animation';
  animationInventoryButton.onclick=async()=>{try{output.textContent=JSON.stringify(await host.adapter.request('meleeControl',{action:'stageAnimationInventory'}),null,2);}catch(error){output.textContent=error.message;}};panel.append(animationInventoryButton);
  const renderLinkInventoryButton=document.createElement('button');renderLinkInventoryButton.textContent='Inspect render links';
  renderLinkInventoryButton.onclick=async()=>{try{output.textContent=JSON.stringify(await host.adapter.request('meleeControl',{action:'renderLinkInventory'}),null,2);}catch(error){output.textContent=error.message;}};panel.append(renderLinkInventoryButton);
  const staticReplay=document.createElement('button');staticReplay.textContent='Verify Battlefield background animation';
  staticReplay.onclick=async()=>{staticReplay.disabled=true;try{
    const state=await waitForGame(s=>s.major===2);if(state.minor===2)await quitMatch();await waitForCss();stageSelector.value='31';
    await startTestMatch({online:false});await waitForGame(s=>s.minor===2&&s.sceneKind===2&&s.sceneFrame>360);
    await host.adapter.request('meleeControl',{action:'stageBackground',enabled:false});
    const {verifyFountainReflectionState}=await import('./browser-reflection-replay.js');
    const result=await verifyFountainReflectionState(host,{feature:'staticbackground',onProgress:text=>{progress.textContent=text;}});
    output.textContent=JSON.stringify(result,null,2);progress.textContent=result.passed?'PASS: Battlefield map-1 animation does not change gameplay, RNG, actors, or native camera.':'FAILED: Battlefield map-1 animation changed a gameplay probe.';
  }catch(error){progress.textContent='FAILED: '+error.message;}finally{host.setInputState(neutral());staticReplay.disabled=false;}};panel.append(staticReplay);
  const headroomCheck=document.createElement('input');headroomCheck.type='checkbox';headroomCheck.setAttribute('aria-label','Measure uncapped execution');
  const headroomLabel=document.createElement('label');headroomLabel.append(headroomCheck,' Measure uncapped execution (diagnostic)');panel.append(headroomLabel);
  const renderCostCheck=document.createElement('input');renderCostCheck.type='checkbox';renderCostCheck.setAttribute('aria-label','Measure render dispatch cost');
  const renderCostLabel=document.createElement('label');renderCostLabel.append(renderCostCheck,' Compare scene draws bypassed (blank-output diagnostic)');panel.append(renderCostLabel);
  const renderCostScope=document.createElement('select');renderCostScope.setAttribute('aria-label','Render diagnostic scope');
  for(const[value,label]of[['scene','Scene draw callbacks'],['link-stage','Stage GX link 3'],['link-fighters','Fighter GX link 5'],['link-effects','Effects GX links 7–8'],['link-hud','HUD GX link 11'],['link-shadows','Shadow GX link 4'],['link-environment','Fog/light GX links 0,10'],['drawable','Materials and meshes'],['mesh','Mesh skinning and submission'],['texture','Texture setup and loading'],['tev','Material combiner setup']])renderCostScope.add(new Option(label,value));
  renderCostScope.value=[...renderCostScope.options].some(o=>o.value===params.get('rendercostscope'))?params.get('rendercostscope'):'scene';panel.append(renderCostScope);
  const timingDriftCompare=document.createElement('input');timingDriftCompare.type='checkbox';timingDriftCompare.setAttribute('aria-label','Compare time-drift correction');
  const timingDriftLabel=document.createElement('label');timingDriftLabel.append(timingDriftCompare,' Compare time-drift correction');panel.append(timingDriftLabel);
  const gpuScheduleCompare=document.createElement('input');gpuScheduleCompare.type='checkbox';gpuScheduleCompare.setAttribute('aria-label','Compare GPU command scheduling');
  const gpuScheduleLabel=document.createElement('label');gpuScheduleLabel.append(gpuScheduleCompare,' Compare GPU command scheduling');panel.append(gpuScheduleLabel);
  const rushCompare=document.createElement('input');rushCompare.type='checkbox';rushCompare.setAttribute('aria-label','Compare rush presentation');
  const rushLabel=document.createElement('label');rushLabel.append(rushCompare,' Compare rush presentation');panel.append(rushLabel);
  const frameLogCompare=document.createElement('input');frameLogCompare.type='checkbox';frameLogCompare.setAttribute('aria-label','Compare frame logging');
  const frameLogLabel=document.createElement('label');frameLogLabel.append(frameLogCompare,' Compare frame logging');panel.append(frameLogLabel);
  const logStatus=document.createElement('button');logStatus.textContent='Inspect frame logging';logStatus.onclick=async()=>{output.textContent=JSON.stringify(await host.adapter.request('frameRingLogging',{}));};panel.append(logStatus);
  const checkpointControl=document.createElement('input');checkpointControl.type='checkbox';checkpointControl.setAttribute('aria-label','Repeat identical checkpoint');
  const checkpointLabel=document.createElement('label');checkpointLabel.append(checkpointControl,' Repeat identical checkpoint');panel.append(checkpointLabel);
  const manualCheckpoint=document.createElement('input');manualCheckpoint.type='checkbox';manualCheckpoint.setAttribute('aria-label','Pause between checkpoint runs');
  const manualLabel=document.createElement('label');manualLabel.append(manualCheckpoint,' Pause between checkpoint runs (diagnostic only)');panel.append(manualLabel);
  const continueCheckpoint=document.createElement('button');continueCheckpoint.textContent='Continue checkpoint measurement';continueCheckpoint.disabled=true;panel.append(continueCheckpoint);
  const dispatchProfileCheck=document.createElement('input');dispatchProfileCheck.type='checkbox';dispatchProfileCheck.setAttribute('aria-label','Profile compiled blocks');
  const dispatchProfileLabel=document.createElement('label');dispatchProfileLabel.append(dispatchProfileCheck,' Profile compiled blocks (diagnostic)');panel.append(dispatchProfileLabel);
  const durationInput=document.createElement('input');durationInput.type='number';durationInput.min='30';durationInput.max='120';durationInput.value=String(Math.max(30,Math.min(120,Number(params.get('benchmarkSeconds'))||30)));durationInput.setAttribute('aria-label','Benchmark seconds');panel.append(durationInput);
  const bench = document.createElement("button");
  bench.textContent = "Benchmark 720p60";
  bench.onclick = async () => {
    bench.disabled = true;
    progress.textContent = "Preparing a fresh match for measurement…";
    output.textContent = "";
    try {
      if(queueSelector){
        if(!host.adapter.presentationQueue)throw Error('Presentation queue is not ready');
        host.adapter.presentationQueue.setCapacity(Number(queueSelector.value));
        params.set('benchmarkqueuecapacitycompare',queueCompare.checked?'1':'0');
        params.set('benchmarkqueuecapacity',queueCandidate.value);
      }
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
      testForms=selectors.map(select=>Number(select.value)===19);
      await host.adapter.request('meleeControl',{action:'select',player:Number(selectors[0].value),cpu:Number(selectors[1].value)});
          // Selection reloads CSS and its fighter archives. Let native preload finish.
          await delay(800);
          await waitForCss();
      const cpuWorkload = !["two","frame"].includes(params.get("benchmarkinput")) && (params.get("benchmarkcpu") === "1" || params.get("inputprobe") !== "1");
      await startTestMatch({online: !cpuWorkload});
      const matchStart=await waitForGame(
        (s) =>
          isLoadedMeleeMatch(s) && s.match?.timeRemaining >= 474 && s.match.timeRemaining <= 480,
      );
      const matchPrewarmFrames = Number(params.get("matchprewarm") || 0);
      if (!nativeEngine && matchPrewarmFrames > 0) {
        const { prewarmBrowserMatch } = await import("./browser-match-prewarm.js");
        await prewarmBrowserMatch(host, matchPrewarmFrames, {
          onProgress: (text) => { progress.textContent = text; },
        });
      }
      await waitForGame(
        (s) =>
          s.major === 2 &&
          s.minor === 2 &&
          s.sceneKind === 2 &&
          s.match?.timeRemaining <= 474 &&
          s.match?.timeRemaining >= 460,
      );
      const {verifyBenchmarkSelection}=await import('./browser-benchmark.js');
      const verifiedSelection=verifyBenchmarkSelection(matchStart,{stage:Number(stageSelector.value),characters:selectors.map(select=>Number(select.value))});
      if (!nativeEngine) {
        if (params.get("ogltestclear") === "1") throw Error("Disable the test pattern before benchmarking gameplay");
        const { measureBrowserGameplay, measureBrowserDelivery, measureBrowserRepeated, compareBrowserCodegen, summarizeCoreProfile, sampleBrowserCpuLocations, measureBrowserNativeInput, compareBrowserQueueCapacity, compareBrowserQueueClock, compareBrowserRenderScale, compareBrowserProbe, measureBrowserGameplayAsync, compareBrowserPacing, compareFountainReflection } = await import("./browser-benchmark.js");
        const capacityProbe = params.get("probe") === "capacity";
        const duration = capacityProbe ? 10 : Math.max(30, Math.min(120, Number(durationInput.value) || 30));
        progress.textContent = `Measuring ${duration} seconds of visible browser gameplay…`;
        const profileBefore = (await host.adapter.request("rendererDiagnostics", {})).coreProfile;
        const imageMeasure = params.get("probe") === "async" ? (h,s,i,o={})=>measureBrowserGameplayAsync(h,s,i,{...o,harvestInTask:params.get("imageharvest")==="task",workerProbe:params.get("imageharvest")==="worker"}) : params.get("probe") === "delivery" ? measureBrowserDelivery : measureBrowserGameplay;
        const {measureWithJitCounters}=await import('./browser-jit-measurement.js');
        const baseMeasure=(...args)=>measureWithJitCounters(host,()=>imageMeasure(...args));
        const frameStress=params.get("benchmarkinput")==="frame";
        const twoPlayerStress=params.get("benchmarkinput")==="two" || frameStress;
        const stress = params.get("benchmarkinput") === "stress" || twoPlayerStress;
        const {withBenchmarkInput,withTwoPlayerBenchmarkInput} = stress ? await import("./browser-benchmark-input.js") : {};
        const measure = frameStress ? baseMeasure : twoPlayerStress ? (...args)=>withTwoPlayerBenchmarkInput(host,()=>gameState,()=>baseMeasure(...args)) : stress ? (...args) => withBenchmarkInput(()=>gameState,pad=>host.setInputState(pad),()=>baseMeasure(...args)) : baseMeasure;
        const repeats = Number(params.get("benchmarkrepeats")) || 1;
        const codegenAB = cpuCompare.checked && (params.get("benchmarkgxmatrixfastcompare") === "1" || params.get("benchmarkdisplaylistfastcompare") === "1" || params.get("benchmarkanimstatefastcompare") === "1" || params.get("benchmarkanimcallbackfastcompare") === "1" || params.get("benchmarkanimfusioncompare") === "1" || params.get("benchmarkhotfusioncompare") === "1" || params.get("benchmarkmatrixfastcompare") === "1" || params.get("benchmarkconstantaddrcompare") === "1" || params.get("benchmarkcallfusioncompare") === "1" || params.get("benchmarkchainfusioncompare") === "1" || params.get("benchmarkbswaprotatecompare") === "1" || params.get("benchmarkqstatefullcompare") === "1" || params.get("benchmarkqstatecachecompare") === "1" || params.get("benchmarkcpformatcompare") === "1" || params.get("benchmarkleandispatchcompare") === "1" || params.get("benchmarkcounterbatchcompare") === "1" || params.get("benchmarkfusionredispatchcompare") === "1" || params.get("benchmarkreadbranchfastcompare") === "1" || params.get("benchmarkreadbranchcompare") === "1" || params.get("benchmarkreadfusioncompare") === "1" || params.get("benchmarkstepcheckcompare") === "1" || params.get("benchmarkfpuguardwidecompare") === "1" || params.get("benchmarkidlecheckscompare") === "1" || params.get("benchmarkbranchfusioncompare") === "1" || params.get("benchmarkfpuguardcompare") === "1" || params.get("benchmarkblockmergecompare") === "1" || params.get("benchmarkfrsqrtefastcompare") === "1" || params.get("benchmarkfifobatchcompare") === "1" || params.get("benchmarkfifocopycompare") === "1" || params.get("benchmarkmsrcachecompare") === "1" || params.get("benchmarkstateconstcompare") === "1" || params.get("benchmarkwidemapcompare") === "1" || params.get("benchmarkpsqhoistcompare") === "1" || params.get("benchmarkvectorfpronlycompare") === "1" || params.get("benchmarkvectorfprarithcompare") === "1" || params.get("benchmarkvectorfprcompare") === "1" || params.get("benchmarkfifocompare") === "1" || params.get("benchmarkprefixcompare") === "1" || params.get("benchmarkfprcompare") === "1" || params.get("benchmarkregcachecompare") === "1" || params.get("benchmarkcompactgprcompare") === "1" || params.get("benchmarkpssimdcompare") === "1" || params.get("benchmarkpsmemsimdcompare") === "1");
        const scaleAB = params.get("benchmarkscalecompare") === "1";
        const probeAB = params.get("benchmarkworkerprobecompare") === "1" || params.get("benchmarkharvestcompare") === "1" || params.get("benchmarkprobecompare") === "1" || params.get("benchmarkasynccompare") === "1" || params.get("benchmarkasynccontrol") === "1" || params.get("benchmarkprobecontext") === "1";
        const pacingAB=params.get("benchmarkpacingcompare")==="1";
        const fixedWorkAB=params.get("benchmarkfixedwork")==="1";
        if(fixedWorkAB&&!frameStress)throw Error("Fixed work requires native-frame inputs");
        const queueCapacityAB=params.get("benchmarkqueuecapacitycompare")==="1";
        if(queueCapacityAB&&!frameStress)throw Error("Queue-capacity comparison requires native-frame inputs");
        const queueClockAB=params.get("benchmarkqueueclockcompare")==="1";
        if(queueClockAB&&!frameStress)throw Error("Queue-clock comparison requires native-frame inputs");
        const stadiumAB=params.get("benchmarkstadiumscreencompare")==="1";
        const particlesAB=params.get("benchmarkparticlescompare")==="1";
        const decorationsAB=params.get("benchmarkdecorationscompare")==="1";
        const sceneryAB=params.get("benchmarkscenerycompare")==="1";
        const modelAB=params.get("benchmarkmodelcompare")==="1";
        const animationAB=params.get("benchmarkanimationcompare")==="1";
        const shadowAB=params.get("benchmarkshadowcompare")==="1";
        const yoshiAnimationAB=params.get('benchmarkyoshianimationcompare')==='1';
        const staticBackgroundAB=params.get('benchmarkstaticbackgroundcompare')==='1';
        const reverbAB=params.get('benchmarkreverbcompare')==='1';
        if(yoshiAnimationAB&&params.get('background')!=='black')throw Error('Yoshi animation comparison requires a black background');
        if(staticBackgroundAB&&params.get('background')!=='black')throw Error('Static background comparison requires a black background');
        const reflectionAB=reverbAB||staticBackgroundAB||yoshiAnimationAB||stadiumAB||params.get("benchmarkreflectioncompare")==="1"||sceneryAB||modelAB||animationAB||shadowAB||decorationsAB||particlesAB;
        if(frameStress&&(scaleAB||pacingAB||repeats>1))throw Error("Native-frame input supports single runs, codegen and cosmetic comparisons");
        if(animationAB&&(params.get("scenery")!=="off"||params.get("sceneryanimation")==="off"))throw Error("Animation comparison requires scenery off and animation initially on");
        if(modelAB&&params.get("models")==="low")throw Error("Start model comparison at normal detail");
        if(params.get("benchmarkreflectioncompare")==="1"&&params.get("reflection")==="off")throw Error("Start reflection comparison with reflections enabled");
        if(stadiumAB&&params.get("stadiumscreen")==="off")throw Error("Start Stadium screen comparison with screen enabled");
        if(particlesAB&&params.get("particles")==="off")throw Error("Start particle comparison with particles enabled");
        if(decorationsAB&&params.get("decorations")==="off")throw Error("Start decoration comparison with decorations enabled");
        if(sceneryAB&&params.get("scenery")==="off")throw Error("Start scenery comparison with scenery enabled");
        if(stress && ((!frameStress && probeAB) || pacingAB))throw Error("Use a standard or codegen benchmark for controller stress");
        const pcSampling = params.get("pcsample") === "1";
        if(pcSampling && ((gpuScheduleCompare.checked || rushCompare.checked || frameLogCompare.checked || checkpointControl.checked || dispatchProfileCheck.checked) || timingDriftCompare.checked || headroomCheck.checked || codegenAB || scaleAB || probeAB || pacingAB || fixedWorkAB || queueCapacityAB || queueClockAB || reflectionAB || repeats>1))throw Error("PC sampling requires a single diagnostic run");
        const pcSamples = pcSampling ? sampleBrowserCpuLocations(host, duration) : null;
        if(checkpointControl.checked&&(!frameStress||headroomCheck.checked||frameLogCompare.checked||rushCompare.checked||gpuScheduleCompare.checked||timingDriftCompare.checked||codegenAB||scaleAB||probeAB||pacingAB||fixedWorkAB||queueCapacityAB||queueClockAB||reflectionAB||repeats>1))throw Error('Unchanged checkpoint control requires native inputs and no other comparison');
        if(dispatchProfileCheck.checked&&(checkpointControl.checked||headroomCheck.checked||frameLogCompare.checked||rushCompare.checked||gpuScheduleCompare.checked||timingDriftCompare.checked||codegenAB||scaleAB||probeAB||pacingAB||fixedWorkAB||queueCapacityAB||queueClockAB||reflectionAB||repeats>1||!frameStress))throw Error('Dispatch profiling requires a single native-input diagnostic');
        if(headroomCheck.checked && (frameLogCompare.checked||rushCompare.checked||gpuScheduleCompare.checked||timingDriftCompare.checked||scaleAB||probeAB||pacingAB||fixedWorkAB||queueCapacityAB||queueClockAB||reflectionAB||repeats>1||!frameStress))throw Error('Uncapped comparison requires native input and no unrelated comparison');
        if(renderCostCheck.checked&&(!headroomCheck.checked||cpuCompare.checked))throw Error('Render-cost diagnostic requires uncapped execution and CPU comparison unchecked');
        const result = dispatchProfileCheck.checked
          ? await (await import('./browser-dispatch-profile.js')).profileDirectBlocks(host,duration,()=>host.adapter.request('meleeInspect',{}),{measure:baseMeasure})
          : checkpointControl.checked
          ? await (await import('./browser-checkpoint-control.js')).measureCheckpointControl(host,duration,()=>host.adapter.request('meleeInspect',{}),{measure:baseMeasure,beforeRun:manualCheckpoint.checked?async(index)=>{progress.textContent='PAUSED: checkpoint '+(index+1)+'/4 ready for diagnostic measurement';await new Promise(resolve=>{continueCheckpoint.disabled=false;continueCheckpoint.onclick=()=>{continueCheckpoint.disabled=true;continueCheckpoint.onclick=null;resolve();};});}:undefined,onProgress:text=>{progress.textContent=text;},onResult:result=>{output.textContent=JSON.stringify(result,null,2);}})
          : headroomCheck.checked && renderCostCheck.checked
          ? await (await import('./browser-render-cost.js')).measureBrowserRenderCost(host,()=>host.adapter.request('meleeInspect',{}),{scope:renderCostScope.value,frames:Number(params.get('workframes')||1200),onProgress:text=>{progress.textContent=text;},onResult:result=>{output.textContent=JSON.stringify(result,null,2);}})
          : headroomCheck.checked && cpuCompare.checked
          ? await (await import('./browser-headroom-comparison.js')).compareBrowserHeadroomCodegen(host,()=>host.adapter.request('meleeInspect',{}),{feature:params.get('benchmarkmatrixfastcompare')==='1'?'matrixfast':params.get('benchmarkconstantaddrcompare')==='1'?'constantaddr':params.get('benchmarkcallfusioncompare')==='1'?'callfusion':params.get('benchmarkbswaprotatecompare')==='1'?'bswaprotate':'chainfusion',frames:Number(params.get('workframes')||1200),onProgress:text=>{progress.textContent=text;},onResult:result=>{output.textContent=JSON.stringify(result,null,2);}})
          : headroomCheck.checked
          ? await measureWithJitCounters(host,()=>(import('./browser-headroom.js?qa='+Date.now()).then(({measureBrowserHeadroom})=>measureBrowserHeadroom(host,()=>host.adapter.request('meleeInspect',{}),{onProgress:text=>{progress.textContent=text;}}))))
          : frameLogCompare.checked
          ? await (await import('./browser-frame-ring-logging.js')).compareBrowserFrameRingLogging(host,duration,()=>host.adapter.request('meleeInspect',{}),{measure:baseMeasure,onProgress:text=>{progress.textContent=text;},onResult:result=>{output.textContent=JSON.stringify(result,null,2);}})
          : rushCompare.checked
          ? await (await import('./browser-rush-presentation.js')).compareBrowserRushPresentation(host,duration,()=>host.adapter.request('meleeInspect',{}),{measure:baseMeasure,onProgress:text=>{progress.textContent=text;},onResult:result=>{output.textContent=JSON.stringify(result,null,2);}})
          : gpuScheduleCompare.checked
          ? await (await import('./browser-gpu-start-delay.js')).compareBrowserGpuStartDelay(host,duration,()=>host.adapter.request('meleeInspect',{}),{measure:baseMeasure,onProgress:text=>{progress.textContent=text;},onResult:result=>{output.textContent=JSON.stringify(result,null,2);}})
          : timingDriftCompare.checked
          ? await (await import('./browser-timing-drift.js')).compareBrowserTimingDrift(host,duration,()=>host.adapter.request('meleeInspect',{}),{measure:baseMeasure,onProgress:text=>{progress.textContent=text;},onResult:result=>{output.textContent=JSON.stringify(result,null,2);}})
          : fixedWorkAB
          ? await (await import("./browser-fixed-work.js")).compareFixedNativeWork(host,Number(params.get("workframes")||1800),()=>host.adapter.request("meleeInspect",{}),{feature:params.get("benchmarkgxmatrixfastcompare")==="1"?"gxmatrixfast":params.get("benchmarkdisplaylistfastcompare")==="1"?"displaylistfast":params.get("benchmarkanimstatefastcompare")==="1"?"animstatefast":params.get("benchmarkanimcallbackfastcompare")==="1"?"animcallbackfast":params.get("benchmarkanimfusioncompare")==="1"?"animfusion":params.get("benchmarkhotfusioncompare")==="1"?"hotfusion":params.get("benchmarkmatrixfastcompare")==="1"?"matrixfast":"counterbatch",retainedFpuGuard:params.get("retainedfpuguard")==="1",retainedBranchFusion:params.get("retainedbranchfusion")==="1",retainedReadFusion:params.get("retainedreadfusion")==="1",onProgress:text=>{progress.textContent=text;},onResult:result=>{output.textContent=JSON.stringify(result,null,2);}})
          : queueCapacityAB
          ? await compareBrowserQueueCapacity(host,duration,()=>host.adapter.request("meleeInspect",{}),{candidateCapacity:Number(params.get("benchmarkqueuecapacity")||3),measure,onProgress:text=>{progress.textContent=text;},onResult:result=>{output.textContent=JSON.stringify(result,null,2);}})
          : queueClockAB
          ? await compareBrowserQueueClock(host,duration,()=>host.adapter.request("meleeInspect",{}),{measure,onProgress:text=>{progress.textContent=text;},onResult:result=>{output.textContent=JSON.stringify(result,null,2);}})
          : reflectionAB
          ? await compareFountainReflection(host,duration,()=>host.adapter.request("meleeInspect",{}),{measure,frameInput:frameStress,feature:reverbAB?'reverb':staticBackgroundAB?'staticbackground':yoshiAnimationAB?'yoshianimation':stadiumAB?"stadiumscreen":particlesAB?"particles":decorationsAB?"decorations":shadowAB?"shadowdiag":animationAB?"animation":modelAB?"modeldetail":sceneryAB?"scenery":"reflection",onProgress:text=>{progress.textContent=text;},onResult:result=>{output.textContent=JSON.stringify(result,null,2);}})
          : pacingAB
          ? await compareBrowserPacing(host,duration,()=>host.adapter.request("meleeInspect",{}),{onProgress:text=>{progress.textContent=text;},onResult:result=>{output.textContent=JSON.stringify(result,null,2);}})
          : probeAB
          ? await compareBrowserProbe(host,duration,()=>host.adapter.request("meleeInspect",{}),{frameInput:frameStress,mode:params.get("benchmarkworkerprobecompare")==="1"?"worker":params.get("benchmarkharvestcompare")==="1"?"harvest":params.get("benchmarkprobecontext")==="1"?"context":params.get("benchmarkasynccontrol")==="1"?"async-overhead":params.get("benchmarkasynccompare")==="1"?"async":"overhead",onProgress:text=>{progress.textContent=text;},onResult:result=>{output.textContent=JSON.stringify(result,null,2);}})
          : scaleAB
          ? await compareBrowserRenderScale(host,duration,()=>host.adapter.request("meleeInspect",{}),{measure,
              onProgress:text=>{progress.textContent=text;},onResult:result=>{output.textContent=JSON.stringify(result,null,2);},
            })
          : codegenAB
          ? await compareBrowserCodegen(host, duration, () => host.adapter.request("meleeInspect", {}), {measure,frameInput:frameStress,retainedFpuGuard:params.get("retainedfpuguard")==="1",retainedBranchFusion:params.get("retainedbranchfusion")==="1",retainedReadFusion:params.get("retainedreadfusion")==="1",
              onProgress: text => { progress.textContent = text; },
              onResult: result => { output.textContent = JSON.stringify(result, null, 2); },
              feature: params.get("benchmarkgxmatrixfastcompare") === "1" ? "gxmatrixfast" : params.get("benchmarkdisplaylistfastcompare") === "1" ? "displaylistfast" : params.get("benchmarkanimstatefastcompare") === "1" ? "animstatefast" : params.get("benchmarkanimcallbackfastcompare") === "1" ? "animcallbackfast" : params.get("benchmarkanimfusioncompare") === "1" ? "animfusion" : params.get("benchmarkhotfusioncompare") === "1" ? "hotfusion" : params.get("benchmarkmatrixfastcompare") === "1" ? "matrixfast" : params.get("benchmarkconstantaddrcompare") === "1" ? "constantaddr" : params.get("benchmarkcallfusioncompare") === "1" ? "callfusion" : params.get("benchmarkchainfusioncompare") === "1" ? "chainfusion" : params.get("benchmarkbswaprotatecompare") === "1" ? "bswaprotate" : params.get("benchmarkqstatefullcompare") === "1" ? "qstatefull" : params.get("benchmarkqstatecachecompare") === "1" ? "qstatecache" : params.get("benchmarkcpformatcompare") === "1" ? "cpformat" : params.get("benchmarkleandispatchcompare") === "1" ? "leandispatch" : params.get("benchmarkcounterbatchcompare") === "1" ? "counterbatch" : params.get("benchmarkfusionredispatchcompare") === "1" ? "fusionredispatch" : params.get("benchmarkreadbranchfastcompare") === "1" ? "readbranchfusionfast" : params.get("benchmarkreadbranchcompare") === "1" ? "readbranchfusion" : params.get("benchmarkreadfusioncompare") === "1" ? "readfusion" : params.get("benchmarkstepcheckcompare") === "1" ? "stepcheck" : params.get("benchmarkfpuguardwidecompare") === "1" ? "fpuguardwide" : params.get("benchmarkidlecheckscompare") === "1" ? "idlechecks" : params.get("benchmarkbranchfusioncompare") === "1" ? "branchfusion" : params.get("benchmarkfpuguardcompare") === "1" ? "fpuguard" : params.get("benchmarkblockmergecompare") === "1" ? "blockmerge" : params.get("benchmarkfrsqrtefastcompare") === "1" ? "frsqrtefast" : params.get("benchmarkfifobatchcompare") === "1" ? "fifobatch" : params.get("benchmarkfifocopycompare") === "1" ? "fifocopy" : params.get("benchmarkmsrcachecompare") === "1" ? "msrcache" : params.get("benchmarkstateconstcompare") === "1" ? "stateconst" : params.get("benchmarkwidemapcompare") === "1" ? "widemap" : params.get("benchmarkpsqhoistcompare") === "1" ? "psqhoist" : params.get("benchmarkvectorfpronlycompare") === "1" ? "vectorfpronly" : params.get("benchmarkvectorfprarithcompare") === "1" ? "vectorfprarith" : params.get("benchmarkvectorfprcompare") === "1" ? "vectorfpr" : params.get("benchmarkpsmemsimdcompare") === "1" ? "psmemsimd" : params.get("benchmarkpssimdcompare") === "1" ? "pssimd" : params.get("benchmarkcompactgprcompare") === "1" ? "compactgpr" : params.get("benchmarkregcachecompare") === "1" ? "regcache" : params.get("benchmarkfprcompare") === "1" ? "fprcache" : params.get("benchmarkprefixcompare") === "1" ? "singleprefix" : "integerfifo",
            })
          : repeats > 1
          ? await measureBrowserRepeated(host, duration, () => host.adapter.request("meleeInspect", {}), {
              runs: repeats, measure, onProgress: text => { progress.textContent = text; },
            })
          : frameStress
          ? await measureBrowserNativeInput(host,duration,()=>host.adapter.request("meleeInspect",{}),{measure})
          : await measure(host, duration, () => host.adapter.request("meleeInspect", {}));
        if(result.dispatchProfile){
          const response=await fetch('./qa-function-symbols.json');if(!response.ok)throw Error('QA function symbols unavailable');
          const {aggregateTimedBlocks}=await import('./browser-dispatch-profile.js');result.timedFunctions=aggregateTimedBlocks(result.dispatchProfile,await response.json());
        }
        if(pcSamples) {
          result.cpuLocations=await pcSamples;result.diagnosticOnly=true;result.passed=false;
          const {aggregateGuestFunctions}=await import('./browser-cpu-profile.js');
          const response=await fetch('./qa-function-symbols.json');if(!response.ok)throw Error('QA function symbols unavailable');
          result.cpuFunctions=aggregateGuestFunctions(result.cpuLocations.locations,await response.json(),result.cpuLocations.samples);
        }
        if (repeats === 1 && !(gpuScheduleCompare.checked || rushCompare.checked || frameLogCompare.checked) && !timingDriftCompare.checked && !headroomCheck.checked && !codegenAB && !scaleAB && !probeAB && !pacingAB && !fixedWorkAB && !queueCapacityAB && !queueClockAB && !reflectionAB) {
          const profileAfter = (await host.adapter.request("rendererDiagnostics", {})).coreProfile;
          result.coreProfile = summarizeCoreProfile(profileBefore, profileAfter, result.seconds);
        }
        if (capacityProbe) { result.diagnosticOnly = true; result.passed = false; }
        result.verifiedSelection=verifiedSelection;
        result.stage = stageSelector.selectedOptions[0].textContent;
        result.workload = frameStress ? "two scripted human controller tracks at native logic frames; partner AI retained (not human play)" : twoPlayerStress ? "two active scripted human controllers; native partner AI retained (not human play)" : stress ? "scripted normal P1 controls versus level 9 CPU (not human play)" : cpuWorkload ? "idle human versus level 9 CPU" : "two human controller ports (idle)";
        result.fighters = selectors.map(select=>select.selectedOptions[0].textContent);
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
          compactGprLocals: host.compactGprLocals === true,
          pairedSimd: host.pairedSimd === true,
          pairedMemorySimd: host.pairedMemorySimd === true,
          vectorFprCache: host.vectorFprCache === true,
          pairedMemoryHoist: host.pairedMemoryHoist === true,
          qStateCache: host.qStateCache === true,
          qStateFull: host.qStateFull === true,
          wideBlockMap: host.wideBlockMap === true,
          constantStateBase: host.constantStateBase === true,
          blockMsrCache: host.blockMsrCache === true,
          fifoCopy: host.fifoCopy === true,
          fifoBatch: host.fifoBatch === true,
          frsqrteFast: host.frsqrteFast === true,
          profiler: host.ppcProfile,
          metrics: host.collectMetrics,
          emulationSpeed: host.emulationSpeed,
          cpuOverclock: host.cpuOverclock,
          cpuThread: host.cpuThread,
          initialInternalResolution: profileBefore ? [profileBefore.efbWidth,profileBefore.efbHeight] : null,
          capabilities,
        };
        output.textContent = JSON.stringify(result, null, 2);
        progress.textContent = result.kind === "uncapped-native-work-headroom"
          ? `Diagnostic complete: ${result.nativeWorkFps.toFixed(2)} native FPS without host pacing. Normal image-cadence acceptance remains separate.`
          : result.diagnosticOnly
          ? capacityProbe ? "Diagnostic capacity run; normal-speed acceptance was not tested." : (result.cpuLocations ? "CPU residency diagnostic complete; not a performance acceptance run." : "Diagnostic run; acceptance is disabled. See image cadence and timing results.")
          : result.passed
          ? "PASS: this workload met the 720p60 measurement gate."
          : result.invalidReason ? "INVALID: "+result.invalidReason : "Below target; see actual image cadence, source resolution, and simulation speed.";
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
    const delivery = document.createElement('button');
    delivery.textContent = 'Measure frame delivery';
    delivery.onclick = async () => {
      if (bench.disabled) return;
      delivery.disabled = true;
      const previousProbe = params.get('probe');
      params.set('probe', 'delivery');
      try { await bench.onclick(); }
      finally {
        if (previousProbe === null) params.delete('probe'); else params.set('probe', previousProbe);
        delivery.disabled = false;
      }
    };
    panel.append(delivery);
  }
  if (!nativeEngine) {
    const rollbackCheck = document.createElement("button");
    rollbackCheck.textContent = "Verify browser state replay";
    const replayControlCheck=document.createElement('input');replayControlCheck.type='checkbox';replayControlCheck.setAttribute('aria-label','Compare unchanged codegen in replay');
    const replayControlLabel=document.createElement('label');replayControlLabel.append(replayControlCheck,' Compare unchanged codegen in replay');panel.append(replayControlLabel);
    const replayEventsCheck=document.createElement('input');replayEventsCheck.type='checkbox';replayEventsCheck.setAttribute('aria-label','Inspect scheduler in replay');
    const replayEventsLabel=document.createElement('label');replayEventsLabel.append(replayEventsCheck,' Inspect scheduler in replay');panel.append(replayEventsLabel);
    const runningCheck = document.createElement("button");
    runningCheck.textContent = "Verify normal-running state";
    const timingDriftCheck=document.createElement('button');timingDriftCheck.textContent='Verify time-drift gameplay';
    const gpuScheduleCheck=document.createElement('button');gpuScheduleCheck.textContent='Verify GPU scheduling gameplay';
    const rushCheck=document.createElement('button');rushCheck.textContent='Verify rush presentation gameplay';
    const runBrowserReplay = async (running = params.get("runningcodegen") === "1", timingDrift = false, gpuScheduling = false, rushPresentation = false) => {
      if (bench.disabled || rollbackCheck.disabled) return;
      runningCheck.disabled = true;
      timingDriftCheck.disabled = true;
      gpuScheduleCheck.disabled = true;
      rushCheck.disabled = true;
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
        let current = await waitForGame(s=>s.major!==2 || (s.minor===0&&s.sceneKind===8) || (s.minor===1&&s.sceneKind===9) || isLoadedMeleeMatch(s));
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
          testForms=selectors.map(select=>Number(select.value)===19);
          await host.adapter.request('meleeControl',{action:'select',player:Number(selectors[0].value),cpu:Number(selectors[1].value)});
          // Selection reloads CSS and its fighter archives. Let native preload finish.
          await delay(800);
          await waitForCss();
          await startTestMatch({online: running || params.get("inputprobe") === "1"});
        } else if (current.major === 2 && current.minor === 1) {
          await confirmTestStage();
        }
        await waitForGame(s => s.major === 2 && s.minor === 2 && s.sceneFrame > 300);
        progress.textContent = "Checking complete-machine capture and replay…";
        await command("pause");
        // Align with the existing Dolphin frame-step boundary before capture.
        await command("step");
        const initial = await host.adapter.request("meleeInspect", {});
        const {verifyBenchmarkSelection}=await import('./browser-benchmark.js');
        const verifiedSelection=verifyBenchmarkSelection(initial,{stage:Number(stageSelector.value),characters:selectors.map(select=>Number(select.value))});
        if (params.get("timelineprobe") === "1" || running) {
          const {verifyBrowserRollbackTimeline} = await import("./browser-rollback-probe.js");
          const {browserCodegenConfig}=await import("./browser-benchmark.js");
          const dispatchBefore = params.get("wasmdispatchcompare") === "1" || params.get("idlecheckcompare") === "1"
            ? (await host.adapter.request("rendererDiagnostics", {})).cpuDetails : "";
          const verify = rushPresentation
            ? async(_send,inspect,options)=>(await import('./browser-rush-presentation.js')).verifyBrowserRushPresentation(host,inspect,{onProgress:options.onProgress})
            : gpuScheduling
            ? async(_send,inspect,options)=>(await import('./browser-gpu-start-delay.js')).verifyBrowserGpuStartDelay(host,inspect,{onProgress:options.onProgress,candidateCycles:Number(params.get('gpureplaycycles')||4000),frames:options.frames})
            : timingDrift
            ? async(_send,inspect,options)=>(await import('./browser-timing-drift.js')).verifyBrowserTimingDrift(host,inspect,{onProgress:options.onProgress})
            : running
            ? (await import('./browser-running-replay.js')).verifyBrowserRunningCodegen : verifyBrowserRollbackTimeline;
          const result = await verify(command,
            () => host.adapter.request("meleeInspect", {}),
            {unchangedControl:replayControlCheck.checked,inspectSavedEvents:replayEventsCheck.checked,resume:()=>host.adapter.request("start",{}),diagnostics:()=>host.adapter.request("rendererDiagnostics",{}),originalCodegen:browserCodegenConfig(host),
              frames:Number(params.get(running?"runningframes":"timelineframes") || (running?600:40)),
              delay:Number(params.get("timelinedelay") || 3),
              prewarmFrames:Number(params.get("replayprewarm") || 0),
              checkpointPolicy:params.get("checkpoints") || "periodic",
              batchAdvance:params.get("batchadvance") === "1",
              cacheFastPathComparison:params.get("cachecompare") === "1",
              cacheLoopComparison:params.get("batchcompare") === "1",
              inlineDispatchComparison:params.get("dispatchcompare") === "1",
              wasmDispatchComparison:params.get("wasmdispatchcompare") === "1",
              idleChecksComparison:params.get("idlecheckcompare") === "1",
              codegenReference:params.get("codegenreference")==="retained" ? {...browserCodegenConfig(host),gxmatrixfast:params.get("retainedgxmatrixfast")==="1",displaylistfast:params.get("retaineddisplaylistfast")==="1",animstatefast:params.get("retainedanimstatefast")==="1",animcallbackfast:params.get("retainedanimcallbackfast")==="1",animfusion:params.get("retainedanimfusion")==="1",hotfusion:params.get("retainedhotfusion")==="1",matrixfast:params.get("matrixfast") === "1",constantaddr:false,callfusion:params.get("callfusion") === "1",chainfusion:false,bswaprotate:false,qstatefull:false,qstatecache:false,cpformat:false,leandispatch:params.get("retainedleandispatch")==="1",counterbatch:false,fusionredispatch:false,readfusion:params.get("retainedreadfusion")==="1",stepcheck:false,fpuguardwide:false,branchfusion:params.get("retainedbranchfusion")==="1",fpuguard:params.get("retainedfpuguard")==="1",blockmerge:params.get("retainedblockmerge")==="1",fprcache:false,pssimd:false,psmemsimd:false,vectorfpr:false,psqhoist:false,widemap:params.get("retainedwidemap")==="1",stateconst:false,msrcache:false,fifocopy:false,fifobatch:false,frsqrtefast:false} : null,
              codegenComparison:params.get("codegencompare") === "1" ? {gxmatrixfast:params.get("gxmatrixfast") === "1",displaylistfast:params.get("displaylistfast") === "1",animstatefast:params.get("animstatefast") === "1",animcallbackfast:params.get("animcallbackfast") === "1",animfusion:params.get("animfusion") === "1",hotfusion:params.get("hotfusion") === "1",matrixfast:params.get("matrixfast") === "1",constantaddr:params.get("constantaddr") === "1",callfusion:params.get("callfusion") === "1",chainfusion:params.get("chainfusion") === "1",bswaprotate:params.get("bswaprotate") === "1",qstatefull:params.get("qstatefull") === "1",qstatecache:params.get("qstatecache") === "1",cpformat:params.get("cpformat") === "1",leandispatch:params.get("leandispatch") === "1",counterbatch:params.get("counterbatch") === "1",fusionredispatch:params.get("fusionredispatch") === "1",readfusion:params.get("readfusion") === "1",stepcheck:params.get("stepcheck") === "1",fpuguardwide:params.get("fpuguardwide") === "1",branchfusion:params.get("branchfusion") === "1",fpuguard:params.get("fpuguard") === "1",blockmerge:params.get("blockmerge") === "1",regcache:params.get("regalloc") === "1",fastmem:params.get("fastmemhoist") === "1",integerfifo:params.get("integerfifo") === "1",singleprefix:params.get("singleprefix") === "1",fprcache:params.get("fprcache") === "1",compactgpr:params.get("compactgpr") === "1",pssimd:params.get("pssimd") === "1",psmemsimd:params.get("psmemsimd") === "1",vectorfpr:params.get("vectorfpr") === "1",psqhoist:params.get("psqhoist") === "1",widemap:params.get("widemap") === "1",stateconst:params.get("stateconst") === "1",msrcache:params.get("msrcache") === "1",fifocopy:params.get("fifocopy") === "1",fifobatch:params.get("fifobatch") === "1",frsqrtefast:params.get("frsqrtefast") === "1"} : null,
              onProgress: context => { progress.textContent = "Replay: " + context; }});
          const diagnostics = await host.adapter.request("rendererDiagnostics", {});
          if (params.get("wasmdispatchcompare") === "1") {
            const before = /wasm-dispatch:(\d+)\/(\d+)calls/.exec(dispatchBefore || "");
            const after = /wasm-dispatch:(\d+)\/(\d+)calls/.exec(diagnostics.cpuDetails || "");
            const calls = Number(after?.[2] || 0) - Number(before?.[2] || 0);
            result.optimizationExecution = {dispatcherHandle:Number(after?.[1] || 0), calls};
            result.passed = result.passed && result.optimizationExecution.dispatcherHandle > 0 && calls > 0;
          }
          if (params.get("idlecheckcompare") === "1") {
            const before = /hoisted:(\d+)/.exec(dispatchBefore || "");
            const after = /hoisted:(\d+)/.exec(diagnostics.cpuDetails || "");
            const iterations = Number(after?.[1] || 0) - Number(before?.[1] || 0);
            result.optimizationExecution = {hoistedIterations:iterations};
            result.passed = result.passed && iterations > 0;
          }
          result.verifiedSelection=verifiedSelection;
          result.engine = {coreSha256:host.adapter.expectedCoreSha256,
            profileEnabled:diagnostics.coreProfile?.enabled,
            sourceResolution:host.oglSabEnabled ? [host.oglSabWidth,host.oglSabHeight] :
              [host.adapter.presentedWidth,host.adapter.presentedHeight]};
          output.textContent = JSON.stringify(result, null, 2);
          progress.textContent = result.passed ? (running ? "PASS: normal-running configurations produced identical full state." : "PASS: late inputs corrected to identical full state.") :
            running && result.executionStateEqual && result.idleAccountingOnlyDifference && !result.optimizationExecution
              ? "Execution state matches; raw snapshot differs only in unused idle accounting."
              : "Replay or optimization execution check failed; see diagnostics.";
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
        if (params.get("idlecheckcompare") === "1") {
          try { await host.adapter.request("browserRollback", {action:"idleBatchChecks", value:!!(Number(params.get("disable")) & 0x80000000)}); } catch {}
        }
        if (params.get("codegencompare") === "1") {
          try { const {browserCodegenConfig}=await import("./browser-benchmark.js"); await host.adapter.request("browserRollback", {action:"codegen", ...browserCodegenConfig(host)}); } catch {}
        }
        try { await host.adapter.request("start", {}); } catch {}
        rollbackCheck.disabled = false;
        runningCheck.disabled = false;
        timingDriftCheck.disabled = false;
        rushCheck.disabled = false;
        gpuScheduleCheck.disabled = false;
      }
    };
    rollbackCheck.onclick = () => runBrowserReplay();
    runningCheck.onclick = () => runBrowserReplay(true);
    timingDriftCheck.onclick = () => runBrowserReplay(true,true);
    gpuScheduleCheck.onclick = () => runBrowserReplay(true,false,true);
    rushCheck.onclick=()=>runBrowserReplay(true,false,false,true);panel.append(rushCheck);
    panel.append(gpuScheduleCheck);
    panel.append(timingDriftCheck);
    panel.append(runningCheck);
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
        camera: s.camera,
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
