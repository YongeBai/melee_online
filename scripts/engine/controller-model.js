import * as THREE from "./vendor/three.module.js";
import { gameCubePart } from "./gamecube-buttons.js";

// A procedural controller companion to the 3D keyboard. For a browser gamepad
// (standard mapping) each physical control carries the GameCube part it drives,
// joined by a leader line; a GameCube controller on the USB adapter shows its
// own parts in place. Parts follow the live normalized sample.
const standardControls = [
  { at: [4.4, -1.0], kind: "face", legend: "A", part: "KeyP", bit: 0x100 },
  { at: [5.75, 0.3], kind: "face", legend: "B", part: "Space", bit: 0x400 },
  { at: [3.05, 0.3], kind: "face", legend: "X", part: "KeyO", bit: 0x200 },
  { at: [4.4, 1.6], kind: "face", legend: "Y", part: "GamepadY", bit: 0x800 },
  { at: [-4.4, 0.6], kind: "stick", part: "Stick", axes: [1, 2] },
  { at: [1.9, -2.0], kind: "stick", part: "CStick", axes: [3, 4] },
  { at: [-1.9, -2.0], kind: "dpad", part: "DPad", bit: 0xf },
  { at: [1.2, 0.9], kind: "small", legend: "MENU", part: "Enter", bit: 0x1000 },
  { at: [-1.2, 0.9], kind: "small", legend: "VIEW" },
  { at: [0, 2.2], kind: "small" },
  { at: [3.7, 3.7], kind: "bumper", legend: "RB", part: "KeyU", bit: 0x10 },
  { at: [-3.7, 3.7], kind: "bumper", legend: "LB" },
  { at: [6.2, 4.1], kind: "trigger", legend: "RT", part: "KeyL", analog: 6, bit: 0x20 },
  { at: [-6.2, 4.1], kind: "trigger", legend: "LT", part: "KeyI", analog: 5, bit: 0x40 },
];
const gameCubeControls = [
  { at: [4.1, 0.3], part: "KeyP", bit: 0x100, scale: 1.7 },
  { at: [2.8, -0.9], part: "KeyO", bit: 0x200, scale: 1.7 },
  { at: [5.6, 1.0], part: "Space", bit: 0x400, scale: 1.7, turn: -1.2 },
  { at: [3.9, 1.9], part: "GamepadY", bit: 0x800, scale: 1.7 },
  { at: [-4.3, 0.7], part: "Stick", axes: [1, 2], scale: 2 },
  { at: [2.1, -2.2], part: "CStick", axes: [3, 4], scale: 1.8 },
  { at: [-2.1, -2.2], part: "DPad", bit: 0xf, scale: 1.6 },
  { at: [0, 0.9], part: "Enter", bit: 0x1000, scale: 1.7 },
  { at: [4.6, 3.3], part: "KeyU", bit: 0x10, scale: 1.7 },
  { at: [5.1, 4.2], part: "KeyL", analog: 6, bit: 0x20, scale: 2 },
  { at: [-5.1, 4.2], part: "KeyI", analog: 5, bit: 0x40, scale: 2 },
];
const half = [
  [0, 3.1],
  [2.6, 3.2],
  [4.6, 3.45],
  [6.0, 3.0],
  [6.9, 1.9],
  [7.35, 0],
  [7.65, -2.3],
  [7.5, -4.1],
  [6.8, -5.2],
  [5.6, -5.3],
  [4.6, -4.5],
  [3.6, -3.1],
  [2.4, -2.5],
];

export function createControllerModel(container) {
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
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.classList.add("keyboard-labels");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML =
    '<defs><marker id="padArrow" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L8 4L0 8Z" fill="#ece1b5"/></marker></defs>';
  container.append(svg);
  const material = (color, extra = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.38, metalness: 0.15, ...extra });
  const flat = (points, height, color, bevel = 0.08) => {
    const shape = new THREE.Shape();
    shape.moveTo(...points[0]);
    for (const p of points.slice(1)) shape.lineTo(...p);
    shape.closePath();
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: height,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: bevel,
      bevelThickness: bevel,
    });
    geo.rotateX(-Math.PI / 2);
    return new THREE.Mesh(geo, material(color));
  };
  const rect = (w, d) => [
    [-w / 2, -d / 2],
    [w / 2, -d / 2],
    [w / 2, d / 2],
    [-w / 2, d / 2],
  ];
  function legend(text, color, width, depth, y) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * 128);
    canvas.height = Math.round(depth * 128);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = color;
    ctx.font = `bold ${Math.min(canvas.height * 0.62, (canvas.width * 1.5) / text.length)}px Arial`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 2);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(width, depth),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.y = y;
    return m;
  }
  function physical(control) {
    const group = new THREE.Group();
    const mapped = !!control.part,
      text = mapped ? "#e7e5ef" : "#6d6c7c";
    let cap;
    if (control.kind === "face") {
      cap = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.5, 0.26, 40), material("#1d1c27"));
      cap.position.y = 0.13;
      group.add(cap, legend(control.legend, text, 0.6, 0.6, 0.27));
    } else if (control.kind === "stick") {
      const well = new THREE.Mesh(new THREE.CylinderGeometry(0.86, 0.9, 0.08, 48), material("#121119"));
      well.position.y = 0.04;
      cap = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.55, 0.42, 40), material("#2c2b38"));
      cap.position.y = 0.3;
      group.add(well, cap);
    } else if (control.kind === "dpad") {
      cap = flat(
        [
          [-0.25, -0.75],
          [0.25, -0.75],
          [0.25, -0.25],
          [0.75, -0.25],
          [0.75, 0.25],
          [0.25, 0.25],
          [0.25, 0.75],
          [-0.25, 0.75],
          [-0.25, 0.25],
          [-0.75, 0.25],
          [-0.75, -0.25],
          [-0.25, -0.25],
        ],
        0.16,
        "#1d1c27",
        0.05,
      );
      group.add(cap);
    } else if (control.kind === "small") {
      cap = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.26, 0.16, 32), material("#1d1c27"));
      cap.position.y = 0.08;
      group.add(cap);
      if (control.legend) {
        const label = legend(control.legend, text, 0.9, 0.3, 0.02);
        label.position.z = 0.48;
        group.add(label);
      }
    } else {
      const trigger = control.kind === "trigger";
      cap = flat(rect(trigger ? 1.4 : 2.2, trigger ? 0.9 : 0.5), trigger ? 0.34 : 0.2, "#2c2b38", 0.1);
      cap.position.y = trigger ? 0.3 : 0.02;
      group.add(cap, legend(control.legend, text, 1, 0.42, cap.position.y + (trigger ? 0.48 : 0.34)));
    }
    return { group, cap };
  }

  const pad = new THREE.Group();
  scene.add(pad);
  let items = [];
  let layout = null;
  function build(kind) {
    layout = kind;
    pad.clear();
    for (const item of items) item.callout?.remove();
    items = [];
    const gameCube = kind === "gamecube";
    const outline = new THREE.Shape();
    const points = [...half, ...half.slice(1).reverse().map(([x, y]) => [-x, y])];
    outline.moveTo(...half[0]);
    outline.splineThru([...points.slice(1), half[0]].map(([x, y]) => new THREE.Vector2(x, y)));
    const bodyGeometry = new THREE.ExtrudeGeometry(outline, {
      depth: 0.5,
      bevelEnabled: true,
      bevelSegments: 4,
      steps: 1,
      bevelSize: 0.2,
      bevelThickness: 0.2,
      curveSegments: 6,
    });
    bodyGeometry.rotateX(-Math.PI / 2);
    const body = new THREE.Mesh(bodyGeometry, material(gameCube ? "#453c83" : "#272536"));
    body.position.y = -0.72;
    pad.add(body);
    const face = new THREE.Mesh(
      new THREE.ShapeGeometry(outline, 6),
      material(gameCube ? "#554a9c" : "#343344"),
    );
    face.geometry.rotateX(-Math.PI / 2);
    face.scale.setScalar(0.95);
    face.position.set(0, 0.0, 0.05);
    pad.add(face);
    for (const control of gameCube ? gameCubeControls : standardControls) {
      const [x, y] = control.at,
        z = -y;
      const item = { control, down: false };
      if (!gameCube) {
        const { group, cap } = physical(control);
        group.position.set(x, 0, z);
        pad.add(group);
        Object.assign(item, { group, cap, rest: group.position.y });
      }
      if (control.part) {
        const part = gameCubePart(control.part);
        part.scale.setScalar(control.scale ?? 1.35);
        if (control.turn) part.rotation.y = control.turn;
        part.position.set(x, gameCube ? 0.12 : 1.7, z);
        pad.add(part);
        item.part = part;
        item.partRest = part.position.y;
        if (!gameCube) {
          item.callout = document.createElementNS(ns, "path");
          item.callout.setAttribute("class", "leader");
          item.callout.setAttribute("fill", "none");
          item.callout.setAttribute("stroke", "#e0d9bf");
          item.callout.setAttribute("stroke-width", "1.25");
          item.callout.setAttribute("marker-end", "url(#padArrow)");
          svg.append(item.callout);
        }
      }
      items.push(item);
    }
    render();
  }

  let visible = false;
  function render() {
    if (!visible) return;
    const { width, height } = container.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    const halfWidth = Math.max(10.4, (5.6 * width) / height);
    camera.left = -halfWidth;
    camera.right = halfWidth;
    camera.top = (halfWidth * height) / width;
    camera.bottom = -camera.top;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    pad.position.set(0, 0, 1.1);
    pad.updateMatrixWorld(true);
    renderer.render(scene, camera);
    svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
    const project = (x, y, z) => {
      const point = pad.localToWorld(new THREE.Vector3(x, y, z)).project(camera);
      return [((point.x + 1) * width) / 2, ((1 - point.y) * height) / 2];
    };
    const scale = Math.max(0.55, Math.min(1.35, width / 880));
    for (const { group, part, callout, down } of items) {
      if (!callout) continue;
      const [x, y] = project(group.position.x, 0.6, group.position.z);
      const [bx, by] = project(part.position.x, part.position.y, part.position.z);
      callout.setAttribute("d", `M${bx},${by + 14 * scale} L${x},${y - 4}`);
      callout.style.filter = down ? "drop-shadow(0 0 5px #ffe19c)" : "";
    }
  }
  function update(sample) {
    let changed = false;
    for (const item of items) {
      const { control, part, cap } = item;
      const value = control.analog ? sample?.[control.analog] ?? 0 : 0;
      const down = !!(sample && ((control.bit && sample[0] & control.bit) || value > 0.3));
      const tilt = control.axes && sample ? [sample[control.axes[0]], sample[control.axes[1]]] : [0, 0];
      const key = `${down}|${value.toFixed(2)}|${tilt.map((v) => v.toFixed(2))}`;
      if (item.key === key) continue;
      item.key = key;
      item.down = down || Math.hypot(...tilt) > 0.3;
      changed = true;
      if (part) {
        part.position.y = item.partRest - (control.analog ? value * 0.18 : down ? 0.11 : 0);
        part.rotation.z = -tilt[0] * 0.4;
        part.rotation.x = -tilt[1] * 0.4;
        const glow = item.down || value > 0.05 ? "#5a3d10" : "#000000";
        part.traverse((mesh) => mesh.material?.emissive?.set(glow));
      }
      if (cap) cap.material.emissive.set(item.down || value > 0.05 ? "#916622" : "#000000");
      if (item.group) item.group.position.y = item.rest - (down ? 0.08 : 0);
    }
    if (changed) render();
  }
  new ResizeObserver(render).observe(container);
  return {
    // "standard" (browser gamepad) or "gamecube" (USB adapter controller).
    setLayout(kind) {
      if (kind !== layout) build(kind);
    },
    setVisible(value) {
      visible = value;
      update(null);
      render();
    },
    update,
  };
}
