const glyphs = new Map();
function glyph(c) {
  if (c === " ") return Promise.resolve(null);
  if (!glyphs.has(c))
    glyphs.set(
      c,
      new Promise((resolve) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = () => resolve(null);
        i.src = `/play/assets/glyph-${c.charCodeAt(0)}.png`;
      }),
    );
  return glyphs.get(c);
}
export async function text(canvas, value) {
  if (canvas.dataset.text === value) return;
  canvas.setAttribute("aria-label", value);
  const version = (canvas.dataset.text = value);
  const images = await Promise.all([...value].map(glyph));
  if (canvas.dataset.text !== version) return;
  canvas.width = images.reduce((w, i) => w + (i ? i.width : 12), 0) || 1;
  canvas.height = 32;
  const ctx = canvas.getContext("2d");
  let x = 0;
  for (const i of images) {
    if (i) ctx.drawImage(i, x, 0);
    x += i ? i.width : 12;
  }
  return images.every((i, index) => i || value[index] === " ");
}
export function createRoomUI(host) {
  const panel = document.createElement("section");
  panel.id = "roomPanel";
  panel.setAttribute("aria-label", "Online room");
  panel.hidden = true;
  panel.innerHTML = `<canvas id="roomStatus" role="status"></canvas>
 <div class="room-code"><img src="/play/assets/room-code.png" alt="Your code"><button id="copyRoom" aria-label="Copy room code"><canvas id="ownCode"></canvas></button></div>
 <form id="joinRoom"><label for="joinCode"><img src="/play/assets/room-join.png" alt="Join room"></label><div class="code-entry"><input id="joinCode" aria-label="Room code" maxlength="6" autocomplete="off" spellcheck="false"><canvas id="typedCode" aria-hidden="true"></canvas></div><button id="joinSubmit" aria-label="Join room"><span aria-hidden="true">▶</span></button></form>
 <button id="readyRoom" class="room-action"><canvas></canvas></button>
 <button id="kickRoom" class="room-action"><img src="/play/assets/room-kick.png" alt="Kick player"></button>
 <button id="leaveRoom" class="room-action"><img src="/play/assets/room-leave.png" alt="Leave room"></button>`;
  document.getElementById("gameViewport").append(panel);
  const $ = (id) => document.getElementById(id);
  const peerKeyboard = $("keyboardButton").cloneNode(true);
  const keyboardArtwork = peerKeyboard.innerHTML;
  peerKeyboard.id = "peerKeyboard";
  peerKeyboard.hidden = true;
  peerKeyboard.setAttribute("aria-label", "Other player keyboard");
  $("gameViewport").append(peerKeyboard);
  let busy = false,
    error = "";
  const matchKick = document.createElement("button");
  matchKick.id = "kickMatch";
  matchKick.hidden = true;
  matchKick.innerHTML = '<img src="/play/assets/room-kick.png" alt="Kick player">';
  document.getElementById("toolbar").append(matchKick);
  const announce = (message) => {
    error = message;
    text($("roomStatus"), message.replace(/[^A-Za-z0-9 ]/g, ""));
  };
  window.addEventListener("melee-room-error", (e) => announce(e.detail));
  window.addEventListener("melee-room", ({ detail: r }) => {
    document.body.dataset.seat = r.seat;
    $("controls").setAttribute("aria-label", `Player ${r.seat + 1} keyboard controls`);
    peerKeyboard.hidden = !["selecting", "disconnected", "error"].includes(r.phase);
    peerKeyboard.classList.toggle("cpu", r.cpu);
    if (peerKeyboard.dataset.cpu !== String(r.cpu)) {
      peerKeyboard.dataset.cpu = String(r.cpu);
      peerKeyboard.innerHTML = r.cpu ? '<span aria-hidden="true">CPU</span>' : keyboardArtwork;
      peerKeyboard.setAttribute("aria-label", r.cpu ? "CPU level 9" : "Other player keyboard");
    }
    $("keyboardButton")?.setAttribute("aria-label", `Player ${r.seat + 1} keyboard controls`);
    panel.hidden =
      !["selecting", "disconnected", "error"].includes(r.phase) &&
      !(r.phase === "loading" && !panel.hidden);
    peerKeyboard.hidden = panel.hidden;
    if (r.code !== $("ownCode").dataset.text) text($("ownCode"), r.code);
    $("copyRoom").setAttribute("aria-label", `Copy room code ${r.code}`);
    const connected = r.connected.every(Boolean);
    $("joinRoom").hidden = connected;
    $("leaveRoom").hidden = !connected && r.seat === 0 && r.phase !== "disconnected";
    $("readyRoom").hidden = !connected && !r.cpu;
    $("kickRoom").hidden = r.seat !== 0 || !r.hasGuest;
    matchKick.hidden = r.seat !== 0 || !r.hasGuest || !["match", "stage"].includes(r.phase);
    for (const b of panel.querySelectorAll("button")) b.disabled = busy || r.phase === "loading";
    $("readyRoom").disabled = busy || r.phase !== "selecting";
    $("readyRoom").classList.toggle("selected", r.ready[r.seat]);
    $("readyRoom").setAttribute("aria-label", r.ready[r.seat] ? "Cancel start" : "Start");
    text($("readyRoom").querySelector("canvas"), r.ready[r.seat] ? "Cancel" : "Start");
    if (!error)
      text(
        $("roomStatus"),
        r.error ||
          (r.cpu
            ? "CPU Level 9"
            : !connected
              ? "Waiting for player"
              : r.ready.every(Boolean)
                ? "Starting"
                : r.ready[r.seat]
                  ? "Waiting for other player"
                  : "Press Start"),
      );
  });
  async function action(fn) {
    if (busy) return;
    busy = true;
    error = "";
    try {
      await fn();
    } catch (e) {
      announce(e.message);
    } finally {
      busy = false;
      $("readyRoom").disabled = host.room?.phase !== "selecting";
    }
  }
  $("copyRoom").onclick = () =>
    action(async () => {
      await navigator.clipboard.writeText(host.room.code);
      announce("Copied");
      setTimeout(() => (error = ""), 1500);
    });
  $("joinCode").addEventListener("input", (e) => {
    e.target.value = e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, "");
    text($("typedCode"), e.target.value);
    error = "";
  });
  $("joinCode").addEventListener("focus", () => host.setInputState({ mask: 0 }));
  $("joinRoom").onsubmit = (e) => {
    e.preventDefault();
    void action(async () => {
      await host.request("roomJoin", { code: $("joinCode").value });
      $("joinCode").value = "";
      text($("typedCode"), "");
      $("screen").focus();
    });
  };
  $("readyRoom").onclick = () => action(() => host.request("meleeControl", { action: "start" }));
  $("leaveRoom").onclick = () => action(() => host.request("roomLeave"));
  $("kickRoom").onclick = matchKick.onclick = () => action(() => host.request("roomKick"));
  if (new URLSearchParams(location.search).has("qa")) {
    const probe = document.createElement("aside");
    probe.id = "roomProbe";
    probe.innerHTML =
      '<button id="roomBenchmark">Measure room performance</button><button id="roomStress">Stress room inputs</button><button id="roomTelemetry">Rollback telemetry</button><pre id="roomReport" role="status" aria-label="Room test results"></pre>';
    document.body.append(probe);
    let stressTimer;
    const stopStress = () => {
      clearInterval(stressTimer);
      stressTimer = undefined;
      host.setInputState({ mask: 0 });
      $("roomStress").textContent = "Stress room inputs";
    };
    $("roomStress").onclick = () => {
      if (stressTimer) return stopStress();
      if (host.room?.phase !== "match") return;
      // Real controller changes travel through this client's socket and its
      // configured packet delay. Stay in place so a stock loss cannot end a run.
      const pads = [
        { mask: 4 },
        { mask: 0 },
        { mask: 1, analogA: 255 },
        { mask: 0 },
        { mask: 32, triggerLeft: 255 },
        { mask: 0 },
      ];
      let step = host.room.seat * 3;
      const end = performance.now() + 90000;
      stressTimer = setInterval(() => {
        if (host.room?.phase !== "match" || performance.now() >= end) return stopStress();
        host.setInputState(pads[step++ % pads.length]);
      }, 180);
      $("roomStress").textContent = "Stop stress inputs";
    };
    $("roomTelemetry").onclick = () => {
      $("roomReport").textContent = JSON.stringify(host.room, null, 2);
    };
    $("roomBenchmark").onclick = async () => {
      $("roomBenchmark").disabled = true;
      try {
        if (host.room?.phase !== "match") throw Error("Start a room match first");
        const before = await host.request("meleeInspect"),
          metrics = { ...host.metrics },
          rollback = { ...host.room.rollback },
          epoch = host.room.epoch,
          at = performance.now();
        host.metrics.maxPresentationQueueMs = 0;
        const duration = Math.max(
          20,
          Math.min(120, Number(new URLSearchParams(location.search).get("benchmarkSeconds")) || 20),
        );
        $("roomReport").textContent = `Measuring ${duration} seconds of room play`;
        await new Promise((r) => setTimeout(r, duration * 1000));
        const after = await host.request("meleeInspect"),
          seconds = (performance.now() - at) / 1000;
        if (
          host.room.phase !== "match" ||
          host.room.epoch !== epoch ||
          after.sceneFrame < before.sceneFrame
        )
          throw Error("Match changed during measurement");
        $("roomReport").textContent = JSON.stringify(
          {
            seconds,
            resolution: [1280, 720],
            simulationFps: (after.sceneFrame - before.sceneFrame) / seconds,
            presentedFps: (host.metrics.presented - metrics.presented) / seconds,
            decodedFps: (host.metrics.decoded - metrics.decoded) / seconds,
            droppedFrames: (host.metrics.dropped || 0) - (metrics.dropped || 0),
            decodeErrors: host.metrics.decodeErrors - metrics.decodeErrors,
            meanPresentationQueueMs:
              (host.metrics.presentationQueueMs - metrics.presentationQueueMs) /
              (host.metrics.presented - metrics.presented),
            maxPresentationQueueMs: host.metrics.maxPresentationQueueMs,
            inputDelayMs: host.inputDelayMs,
            rollbacks: (host.room.rollback?.rollbacks ?? 0) - (rollback.rollbacks ?? 0),
            resimulatedFrames: (host.room.rollback?.resimulatedFrames ?? 0) - (rollback.resimulatedFrames ?? 0),
            rollback: host.room.rollback,
            pacing: host.room.pacing,
          },
          null,
          2,
        );
      } catch (e) {
        $("roomReport").textContent = e.message;
      } finally {
        $("roomBenchmark").disabled = false;
      }
    };
  }
}
