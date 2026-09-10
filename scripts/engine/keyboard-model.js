import * as THREE from "./vendor/three.module.js";
import { gameCubePart } from "./gamecube-buttons.js";

// A local, procedural keyboard. Callouts project from the same 3D key anchors,
// following OpenSmash's model/leader-line approach without an external embed.
export function createKeyboardModel(container) {
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-9, 9, 6, -6, 0.1, 100);
  camera.position.set(0, 15, 13);
  camera.lookAt(0, 0, 0);
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.append(renderer.domElement);
  scene.add(new THREE.HemisphereLight(0xe1e9ff, 0x252334, 2.4));
  const light = new THREE.DirectionalLight(0xffefd3, 3.2);
  light.position.set(-4, 12, 7);
  scene.add(light);
  const fill = new THREE.DirectionalLight(0x7c8cff, 1.4);
  fill.position.set(7, 5, -4);
  scene.add(fill);
  const keyboard = new THREE.Group();
  scene.add(keyboard);
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.classList.add("keyboard-labels");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML =
    '<defs><marker id="keyArrow" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L8 4L0 8Z" fill="#ece1b5"/></marker><linearGradient id="buttonShine" x2="0" y2="1"><stop stop-color="#fff" stop-opacity=".35"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".32"/></linearGradient></defs>';
  container.append(svg);
  const keys = new Map();
  const bindings = {
    Escape: ["START", "#9e9fa5"],
    KeyW: ["↑", "#a7abb7"],
    KeyA: ["←", "#a7abb7"],
    KeyS: ["↓", "#a7abb7"],
    KeyD: ["→", "#a7abb7"],
    KeyU: ["Z", "#7663c5"],
    KeyI: ["L", "#b5b8c3"],
    KeyO: ["B", "#df3444"],
    KeyP: ["A", "#25bc8d"],
    KeyL: ["R", "#b5b8c3"],
    Space: ["X", "#b5b8c3"],
    KeyK: ["C ↑", "#e5b83a"],
    KeyM: ["C ←", "#e5b83a"],
    Comma: ["C ↓", "#e5b83a"],
    Period: ["C →", "#e5b83a"],
    Enter: ["START", "#9e9fa5"],
    ShiftLeft: ["½ ◉", "#a7abb7"],
  };
  const material = (color, extra = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.38, metalness: 0.15, ...extra });
  function bevelBox(w, d, h, color, bevel = 0.08) {
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2, -d / 2);
    shape.lineTo(w / 2, -d / 2);
    shape.lineTo(w / 2, d / 2);
    shape.lineTo(-w / 2, d / 2);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: h,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: bevel,
      bevelThickness: bevel,
    });
    geo.rotateX(-Math.PI / 2);
    return new THREE.Mesh(geo, material(color));
  }
  const base = bevelBox(15.4, 6.5, 0.38, "#272536", 0.16);
  base.position.y = -0.43;
  keyboard.add(base);
  const plate = bevelBox(15.2, 6.3, 0.06, "#414351", 0.07);
  plate.position.y = -0.01;
  keyboard.add(plate);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(14.9, 0.07, 0.03), material("#b94055"));
  stripe.position.set(0, -0.15, 3.39);
  keyboard.add(stripe);

  function addKey(code, label, x, z, width = 1) {
    const binding = bindings[code];
    const group = new THREE.Group();
    group.position.set(x, 0.09, z);
    const cap = bevelBox(width - 0.22, 0.74, 0.22, binding ? "#cbcbd0" : "#555563", 0.055);
    group.add(cap);
    const textureCanvas = document.createElement("canvas");
    textureCanvas.width = Math.round((width - 0.16) * 128);
    textureCanvas.height = 82;
    const ctx = textureCanvas.getContext("2d");
    ctx.fillStyle = binding ? "#151521" : "#c4c4ce";
    ctx.font = `bold ${label.length > 3 ? 25 : 35}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, textureCanvas.width / 2, 41);
    const texture = new THREE.CanvasTexture(textureCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const legend = new THREE.Mesh(
      new THREE.PlaneGeometry(width - 0.16, 0.64),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
    );
    legend.rotation.x = -Math.PI / 2;
    legend.position.y = 0.282;
    group.add(legend);
    keyboard.add(group);
    let callout;
    if (binding) {
      callout = document.createElementNS(ns, "g");
      callout.innerHTML =
        '<path class="leader" fill="none" stroke="#e0d9bf" stroke-width="1.25" marker-end="url(#keyArrow)"/>';
      svg.append(callout);
    }
    let part;
    if (binding) {
      part = gameCubePart(code);
      part.position.set(x, 1.8, z);
      keyboard.add(part);
    }
    keys.set(code, { group, cap, callout, part, down: false });
  }
  function row(z, entries) {
    let x = -7.35;
    for (const entry of entries) {
      const [code, label, width = 1] = typeof entry === "string" ? [`Key${entry}`, entry] : entry;
      addKey(code, label, x + width / 2, z, width);
      x += width;
    }
  }
  row(-2.65, [
    ["Escape", "Esc", 1.5],
    ...Array.from({ length: 12 }, (_, i) => [`F${i + 1}`, `F${i + 1}`]),
    ["Delete", "Del", 1.2],
  ]);
  row(-1.5, [
    ["Backquote", "`"],
    ..."1234567890".split("").map((n) => [`Digit${n}`, n]),
    ["Minus", "−"],
    ["Equal", "="],
    ["Backspace", "Back", 1.7],
  ]);
  row(-0.45, [
    ["Tab", "Tab", 1.5],
    ..."QWERTYUIOP",
    ["BracketLeft", "["],
    ["BracketRight", "]"],
    ["Backslash", "\\", 1.2],
  ]);
  row(0.6, [
    ["CapsLock", "Caps", 1.75],
    ..."ASDFGHJKL",
    ["Semicolon", ";"],
    ["Quote", "'"],
    ["Enter", "Enter", 1.95],
  ]);
  row(1.65, [
    ["ShiftLeft", "Shift", 2.25],
    ..."ZXCVBNM",
    ["Comma", ","],
    ["Period", "."],
    ["Slash", "/"],
    ["ShiftRight", "Shift", 2.45],
  ]);
  row(2.7, [
    ["ControlLeft", "Ctrl", 1.25],
    ["MetaLeft", "◆", 1.25],
    ["AltLeft", "Alt", 1.25],
    ["Space", "Space", 6.25],
    ["AltRight", "Alt", 1.25],
    ["MetaRight", "◆", 1.25],
    ["ControlRight", "Ctrl", 2.2],
  ]);

  let visible = false;
  function render() {
    if (!visible) return;
    const { width, height } = container.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    const halfWidth = Math.max(8.5, (4.2 * width) / height);
    camera.left = -halfWidth;
    camera.right = halfWidth;
    camera.top = (halfWidth * height) / width;
    camera.bottom = -camera.top;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    keyboard.updateMatrixWorld(true);
    renderer.render(scene, camera);
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    const project = (x, y, z) => {
      const point = keyboard.localToWorld(new THREE.Vector3(x, y, z)).project(camera);
      return [((point.x + 1) * width) / 2, ((1 - point.y) * height) / 2];
    };
    const scale = Math.max(0.55, Math.min(1.35, width / 880));
    for (const { group, callout, down } of keys.values()) {
      if (!callout) continue;
      const [x, y] = project(group.position.x, 0.5, group.position.z);
      const [bx, by] = project(group.position.x, 1.85, group.position.z);

      callout
        .querySelector(".leader")
        .setAttribute("d", `M${bx},${by + 16 * scale} L${x},${y - 4}`);
      callout.style.filter = down ? "drop-shadow(0 0 5px #ffe19c)" : "";
    }
  }
  function key(code, down) {
    const item = keys.get(code);
    if (!item || item.down === down) return;
    item.down = down;
    item.group.position.y = down ? -0.01 : 0.09;
    item.cap.material.emissive.set(down ? "#916622" : "#000000");
    if (item.part) item.part.position.y = down ? 1.69 : 1.8;
    render();
  }
  window.addEventListener("keydown", (e) => {
    if (visible) key(e.code, true);
  });
  window.addEventListener("keyup", (e) => {
    if (visible) key(e.code, false);
  });
  window.addEventListener("blur", () => {
    for (const code of keys.keys()) key(code, false);
  });
  new ResizeObserver(render).observe(container);
  return {
    setVisible(value) {
      visible = value;
      for (const code of keys.keys()) key(code, false);
      render();
    },
  };
}
