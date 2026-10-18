import {
  Box3,
  CanvasTexture,
  DoubleSide,
  GLTFLoader,
  Group,
  MeshBasicMaterial,
  NearestFilter,
  PerspectiveCamera,
  SRGBColorSpace,
  Scene,
  Vector3,
  WebGLRenderer,
} from "./vendor/three.js";

const FOV = 34;
const RESOLUTION = 3;
const SPIN_IDLE = 0.24;
const SPIN_ACTIVE = 2;
const FILL = 1.25;
const FLIP_SECONDS = 0.62;
const FLIP_HOP = 0.2;

export function startBanana(canvas, options) {
  const settings = options || {};
  if (!canvas) return null;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    canvas.remove();
    return null;
  }

  let renderer;
  try {
    renderer = new WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: "low-power" });
  } catch {
    canvas.remove();
    return null;
  }

  renderer.setPixelRatio(1);
  renderer.setClearAlpha(0);
  renderer.outputColorSpace = SRGBColorSpace;

  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 0.1, 100);
  const pivot = new Group();
  scene.add(pivot);

  let last = performance.now();
  let metrics = null;
  let spin = SPIN_IDLE;
  let targetSpin = SPIN_IDLE;
  let flipStarted = 0;
  let flipping = false;

  function frame() {
    const width = Math.max(2, canvas.clientWidth);
    const height = Math.max(2, canvas.clientHeight);
    renderer.setSize(Math.max(2, Math.round(width / RESOLUTION)), Math.max(2, Math.round(height / RESOLUTION)), false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    if (metrics) {
      const vertical = Math.tan((FOV * Math.PI) / 360);
      const distance = Math.max(
        metrics.sweep / (camera.aspect * vertical),
        metrics.halfY / vertical
      ) * FILL;
      camera.position.set(0, 0, distance);
      camera.lookAt(0, 0, 0);
    }
  }

  function punchUp(map) {
    const image = map && map.image;
    if (!image || !image.width || !image.height) return map;
    try {
      const surface = document.createElement("canvas");
      surface.width = image.width;
      surface.height = image.height;
      const ctx = surface.getContext("2d");
      if (!ctx) return map;
      ctx.filter = "contrast(1.55) saturate(1.4) brightness(1.14)";
      ctx.drawImage(image, 0, 0);

      const boosted = new CanvasTexture(surface);
      boosted.colorSpace = SRGBColorSpace;
      boosted.magFilter = NearestFilter;
      boosted.minFilter = NearestFilter;
      boosted.generateMipmaps = false;
      boosted.flipY = map.flipY;
      boosted.wrapS = map.wrapS;
      boosted.wrapT = map.wrapT;
      boosted.repeat.copy(map.repeat);
      boosted.offset.copy(map.offset);
      boosted.center.copy(map.center);
      boosted.rotation = map.rotation;
      return boosted;
    } catch {
      return map;
    }
  }

  function prepare(root) {
    root.traverse((child) => {
      if (!child.isMesh) return;
      const source = child.material;
      const map = source && source.map ? punchUp(source.map) : null;
      if (map && map === source.map) {
        map.colorSpace = SRGBColorSpace;
        map.magFilter = NearestFilter;
        map.minFilter = NearestFilter;
        map.generateMipmaps = false;
      }
      child.material = new MeshBasicMaterial({ map, side: DoubleSide });
    });

    const box = new Box3().setFromObject(root);
    const size = box.getSize(new Vector3());
    const center = box.getCenter(new Vector3());
    root.position.copy(center).multiplyScalar(-1);

    metrics = {
      sweep: Math.max(Math.hypot(size.x, size.z) * 0.5, 0.001),
      halfY: Math.max(size.y * 0.5, 0.001),
    };

    pivot.add(root);
  }

  function step() {
    const now = performance.now();
    const delta = Math.min((now - last) / 1000, 0.05);
    last = now;

    spin += (targetSpin - spin) * Math.min(1, delta * 2.5);
    pivot.rotation.y += spin * delta;

    if (flipping) {
      const progress = Math.min(1, (now - flipStarted) / 1000 / FLIP_SECONDS);
      const eased = 1 - (1 - progress) ** 3;
      pivot.rotation.x = eased * Math.PI * 2;
      pivot.position.y = Math.sin(progress * Math.PI) * (metrics ? metrics.halfY * FLIP_HOP : 0);
      if (progress >= 1) {
        flipping = false;
        pivot.rotation.x = 0;
        pivot.position.y = 0;
        if (typeof settings.onLanded === "function") settings.onLanded();
      }
    }

    renderer.render(scene, camera);
    requestAnimationFrame(step);
  }

  function kickflip() {
    if (flipping) return false;
    flipStarted = performance.now();
    flipping = true;
    return true;
  }

  async function load() {
    try {
      const gltf = await new GLTFLoader().loadAsync("banana/banana-bunch.glb");
      prepare(gltf.scene);
      frame();
      last = performance.now();
      step();
    } catch {
      canvas.remove();
    }
  }

  frame();
  if (typeof ResizeObserver === "function") new ResizeObserver(frame).observe(canvas);
  else window.addEventListener("resize", frame);

  load();

  return {
    setActive(active) {
      targetSpin = active ? SPIN_ACTIVE : SPIN_IDLE;
    },
    kickflip,
    isFlipping() {
      return flipping;
    },
    destroy() {
      renderer.dispose();
    },
  };
}
