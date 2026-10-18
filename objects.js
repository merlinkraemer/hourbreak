import {
  Box3,
  DoubleSide,
  GLTFLoader,
  Group,
  MeshBasicMaterial,
  PerspectiveCamera,
  SRGBColorSpace,
  Scene,
  Vector3,
  WebGLRenderer,
} from "./vendor/three.js";

const FOV = 42;
const CAMERA_Z = 6;
const MAX_ALIVE = 3;
const SPAWN_GAP = [2600, 7600];
const CROSS_SECONDS = [11, 23];
const LOADERS = 6;

export function startObjectLayer(canvas) {
  if (!canvas) return null;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    canvas.remove();
    return null;
  }

  let renderer;
  try {
    renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: "low-power" });
  } catch {
    canvas.remove();
    return null;
  }

  renderer.setClearAlpha(0);
  renderer.outputColorSpace = SRGBColorSpace;

  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 0.1, 60);
  camera.position.z = CAMERA_Z;

  let last = performance.now();
  const prototypes = [];
  const alive = [];
  let halfWidth = 4;
  let halfHeight = 2.6;
  let nextSpawnAt = 0;
  let frame = 0;

  function resize() {
    const width = window.innerWidth;
    const height = window.innerHeight;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    halfHeight = Math.tan((FOV * Math.PI) / 360) * CAMERA_Z;
    halfWidth = halfHeight * camera.aspect;
  }

  function prototype(root) {
    root.traverse((child) => {
      if (!child.isMesh) return;
      const source = child.material;
      const map = source && source.map ? source.map : null;
      if (map) map.colorSpace = SRGBColorSpace;
      child.material = new MeshBasicMaterial({ map, side: DoubleSide });
    });

    const box = new Box3().setFromObject(root);
    const size = box.getSize(new Vector3());
    const center = box.getCenter(new Vector3());

    const inner = new Group();
    inner.position.copy(center).multiplyScalar(-1);
    inner.add(root);

    const outer = new Group();
    outer.add(inner);
    outer.userData.radius = Math.max(size.length() * 0.5, 0.001);
    return outer;
  }

  function spawn() {
    const source = prototypes[Math.floor(Math.random() * prototypes.length)];
    const node = source.clone(true);
    node.scale.setScalar((0.3 + Math.random() * 0.5) / source.userData.radius);

    const fromLeft = Math.random() < 0.5;
    const seconds = CROSS_SECONDS[0] + Math.random() * (CROSS_SECONDS[1] - CROSS_SECONDS[0]);
    const span = halfWidth * 2 + 3.4;

    node.position.set(
      (fromLeft ? -1 : 1) * (halfWidth + 1.7),
      (Math.random() * 1.7 - 0.85) * halfHeight,
      (Math.random() - 0.5) * 1.6
    );
    node.rotation.set(Math.random() * 6.283, Math.random() * 6.283, Math.random() * 6.283);

    node.userData.move = {
      vx: (fromLeft ? 1 : -1) * (span / seconds),
      vy: ((Math.random() - 0.5) * halfHeight * 0.8) / seconds,
      vz: ((Math.random() - 0.5) * 0.6) / seconds,
      spin: new Vector3(
        (Math.random() - 0.5) * 3.4,
        (Math.random() - 0.5) * 3.4,
        (Math.random() - 0.5) * 3.4
      ),
      exitX: (fromLeft ? 1 : -1) * (halfWidth + 2.6),
    };

    scene.add(node);
    alive.push(node);
  }

  function step() {
    const now = performance.now();
    const delta = Math.min((now - last) / 1000, 0.05);
    last = now;

    for (let i = alive.length - 1; i >= 0; i -= 1) {
      const node = alive[i];
      const move = node.userData.move;
      node.position.x += move.vx * delta;
      node.position.y += move.vy * delta;
      node.position.z += move.vz * delta;
      node.rotation.x += move.spin.x * delta;
      node.rotation.y += move.spin.y * delta;
      node.rotation.z += move.spin.z * delta;

      if (move.exitX > 0 ? node.position.x >= move.exitX : node.position.x <= move.exitX) {
        scene.remove(node);
        alive.splice(i, 1);
      }
    }

    if (prototypes.length && alive.length < MAX_ALIVE && now >= nextSpawnAt) {
      spawn();
      nextSpawnAt = now + SPAWN_GAP[0] + Math.random() * (SPAWN_GAP[1] - SPAWN_GAP[0]);
    }

    if (alive.length) renderer.render(scene, camera);
    frame = requestAnimationFrame(step);
  }

  async function load() {
    let list;
    try {
      const response = await fetch("models/manifest.json", { cache: "no-cache" });
      if (!response.ok) return;
      list = await response.json();
    } catch {
      return;
    }

    const loader = new GLTFLoader();
    const queue = list.slice();
    const worker = async () => {
      while (queue.length) {
        const entry = queue.shift();
        try {
          const gltf = await loader.loadAsync("models/" + entry.file);
          prototypes.push(prototype(gltf.scene));
          if (prototypes.length === 3) nextSpawnAt = 0;
        } catch {}
      }
    };
    await Promise.all(Array.from({ length: LOADERS }, worker));
  }

  resize();
  last = performance.now();
  window.addEventListener("resize", resize);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      cancelAnimationFrame(frame);
      frame = 0;
    } else if (!frame) {
      last = performance.now();
      step();
    }
  });

  step();
  load();

  return {
    destroy() {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      renderer.dispose();
    },
  };
}
