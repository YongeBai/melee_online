import * as THREE from "./vendor/three.module.js";

// Physical GameCube button/joystick parts, modeled independently of the shell.
// Cylinders, lips, concave caps, grooves and shoulder silhouettes replace badges.
export function gameCubePart(code) {
  const root = new THREE.Group();
  const mat = (color, roughness = 0.32) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.06 });
  const mesh = (geometry, color, x = 0, y = 0, z = 0) => {
    const part = new THREE.Mesh(geometry, mat(color));
    part.position.set(x, y, z);
    root.add(part);
    return part;
  };
  const cylinder = (r1, r2, height, color, y = 0, segments = 48) =>
    mesh(new THREE.CylinderGeometry(r1, r2, height, segments), color, 0, y);
  const letter = (text, color, y, width = 0.4, depth = 0.36, z = 0) => {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    ctx.font = "bold 88px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ffffff50";
    ctx.fillText(text, 66, 62);
    ctx.fillStyle = color;
    ctx.fillText(text, 64, 64);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(width, depth),
      new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(0, y, z);
    root.add(m);
  };
  const shape = (points, height, color) => {
    const s = new THREE.Shape();
    s.moveTo(...points[0]);
    for (const p of points.slice(1)) s.lineTo(...p);
    s.closePath();
    const geo = new THREE.ExtrudeGeometry(s, {
      depth: height,
      bevelEnabled: true,
      bevelThickness: 0.045,
      bevelSize: 0.045,
      bevelSegments: 3,
      steps: 1,
    });
    geo.rotateX(-Math.PI / 2);
    return mesh(geo, color);
  };
  const directions = {
    KeyW: [0, -1],
    KeyA: [-1, 0],
    KeyS: [0, 1],
    KeyD: [1, 0],
    KeyK: [0, -1],
    KeyM: [-1, 0],
    Comma: [0, 1],
    Period: [1, 0],
  };
  if (directions[code] || code === "ShiftLeft") {
    const cStick = ["KeyK", "KeyM", "Comma", "Period"].includes(code),
      color = cStick ? "#e5b728" : "#b5b7bc";
    cylinder(0.25, 0.31, 0.12, "#303038", -0.17, 8);
    cylinder(0.11, 0.14, 0.31, cStick ? "#bea019" : "#62636d", -0.01);
    cylinder(0.3, 0.23, 0.16, color, 0.2);
    const cap = mesh(
      new THREE.SphereGeometry(0.3, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2),
      color,
      0,
      0.28,
    );
    cap.scale.y = 0.13;
    if (cStick) letter("C", "#8c6e18", 0.324, 0.25, 0.23);
    else
      for (const r of [0.12, 0.19, 0.255]) {
        const ring = mesh(new THREE.TorusGeometry(r, 0.009, 6, 48), "#777984", 0, 0.323);
        ring.rotation.x = -Math.PI / 2;
      }
    const dir = directions[code];
    if (dir) {
      const arrow = shape(
        [
          [-0.065, -0.1],
          [0.065, -0.1],
          [0.065, 0.02],
          [0.16, 0.02],
          [0, 0.2],
          [-0.16, 0.02],
          [-0.065, 0.02],
        ],
        0.026,
        cStick ? "#ffdb56" : "#e1e4eb",
      );
      arrow.position.set(dir[0] * 0.42, 0.16, dir[1] * 0.42);
      // Shape +Y becomes world -Z after the extrusion is laid flat.
      arrow.rotation.y = Math.atan2(-dir[0], -dir[1]);
    } else root.rotation.z = 0.23;
    return root;
  }
  if (code === "KeyP" || code === "KeyO") {
    const a = code === "KeyP",
      r = a ? 0.36 : 0.27,
      color = a ? "#12b992" : "#d63240";
    cylinder(r * 0.92, r, 0.13, a ? "#066855" : "#6d1722", -0.06);
    cylinder(r, r * 0.98, 0.15, color, 0.05);
    const top = mesh(
      new THREE.SphereGeometry(r, 48, 20, 0, Math.PI * 2, 0, Math.PI / 2),
      color,
      0,
      0.126,
    );
    top.scale.y = 0.15;
    letter(a ? "A" : "B", a ? "#075848" : "#710f22", 0.183, a ? 0.43 : 0.32, a ? 0.4 : 0.32);
    return root;
  }
  if (code === "Escape" || code === "Enter") {
    cylinder(0.18, 0.19, 0.17, "#a9a9ae");
    cylinder(0.165, 0.18, 0.04, "#c3c4c8", 0.1);
    return root;
  }
  if (code === "Space") {
    // The X key is the silver, elongated bean beside the large green A button.
    const points = [
      [-0.34, -0.11],
      [-0.28, -0.21],
      [0.13, -0.19],
      [0.34, -0.08],
      [0.33, 0.07],
      [0.2, 0.15],
      [-0.13, 0.14],
      [-0.31, 0.04],
    ];
    shape(points, 0.16, "#b8b9c0");
    letter("X", "#55555c", 0.215, 0.37, 0.29);
    root.rotation.y = -0.42;
  } else if (code === "KeyU") {
    shape(
      [
        [-0.32, -0.14],
        [0.22, -0.14],
        [0.32, -0.02],
        [0.23, 0.13],
        [-0.3, 0.13],
      ],
      0.12,
      "#675fae",
    );
    letter("Z", "#30275c", 0.175, 0.29, 0.25);
  } else {
    // L and R have a broad front face and tapered, curved outer shoulder.
    const shoulder = shape(
      [
        [-0.37, 0.17],
        [-0.37, -0.04],
        [-0.26, -0.2],
        [0.1, -0.22],
        [0.36, -0.12],
        [0.4, 0.09],
        [0.33, 0.17],
      ],
      0.19,
      "#b8b9c0",
    );
    if (code === "KeyL") shoulder.scale.x = -1;
    letter(code === "KeyI" ? "L" : "R", "#565761", 0.246, 0.32, 0.29);
    for (let i = 0; i < 3; i++)
      mesh(new THREE.BoxGeometry(0.27, 0.008, 0.014), "#777982", 0, 0.241, 0.1 + i * 0.023);
  }
  return root;
}
