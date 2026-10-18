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
const FILL = 1.4;
const FLIP_DOLLY = 0.8;
const DOLLY_RAMP = 0.14;
const FLIP_BASE_SECONDS = 0.62;
const FLIP_HOP = 0.12;
const SHAKE_MS = 420;

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
  const jitter = new Group();
  pivot.add(jitter);
  scene.add(pivot);

  let last = performance.now();
  let metrics = null;
  let spin = SPIN_IDLE;
  let targetSpin = SPIN_IDLE;
  let flipStarted = 0;
  let flipping = false;
  let flipMs = 620;
  let flipTurns = 1;
  let flipTumble = 0;
  let intensity = 1;
  let popAmount = 0;
  let popStarted = 0;
  let popping = false;
  let shakeUntil = 0;
  let shakeAmount = 0;

  function frame() {
    const width = Math.max(2, canvas.clientWidth);
    const height = Math.max(2, canvas.clientHeight);
    renderer.setSize(Math.max(2, Math.round(width / RESOLUTION)), Math.max(2, Math.round(height / RESOLUTION)), false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();

    if (metrics) {
      const vertical = Math.tan((FOV * Math.PI) / 360);
      metrics.distance = Math.max(
        metrics.sweep / (camera.aspect * vertical),
        metrics.halfY / vertical
      ) * FILL;
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

    jitter.add(root);
  }

  function step() {
    const now = performance.now();
    const delta = Math.min((now - last) / 1000, 0.05);
    last = now;

    spin += (targetSpin * intensity - spin) * Math.min(1, delta * 2.5);
    pivot.rotation.y += spin * delta;

    if (popping) {
      const progress = Math.min(1, (now - popStarted) / 260);
      pivot.scale.setScalar(1 + popAmount * Math.sin(progress * Math.PI));
      if (progress >= 1) {
        popping = false;
        pivot.scale.setScalar(1);
      }
    }

    if (now < shakeUntil) {
      const decay = (shakeUntil - now) / SHAKE_MS;
      const energy = shakeAmount * decay;
      jitter.position.set((Math.random() * 2 - 1) * energy, (Math.random() * 2 - 1) * energy, 0);
      jitter.rotation.z = (Math.random() * 2 - 1) * 0.16 * decay;
      jitter.scale.setScalar(1 - 0.14 * decay);
    } else if (jitter.position.x !== 0 || jitter.position.y !== 0 || jitter.rotation.z !== 0) {
      jitter.position.set(0, 0, 0);
      jitter.rotation.z = 0;
    }

    let dolly = 1;

    if (flipping) {
      const progress = Math.min(1, (now - flipStarted) / flipMs);
      const eased = progress * progress * (3 - 2 * progress);
      pivot.rotation.x = eased * Math.PI * 2 * flipTurns;
      pivot.rotation.z = flipTumble ? eased * Math.PI * 2 * flipTumble : 0;
      pivot.position.y = Math.sin(progress * Math.PI) * (metrics ? metrics.halfY * FLIP_HOP : 0);
      const hold = Math.min(1, Math.max(0, Math.min(progress, 1 - progress) / DOLLY_RAMP));
      dolly = 1 + FLIP_DOLLY * hold;
      if (progress >= 1) {
        flipping = false;
        pivot.rotation.x = 0;
        pivot.rotation.z = 0;
        pivot.position.y = 0;
        if (typeof settings.onLanded === "function") settings.onLanded();
      }
    }

    if (metrics) {
      camera.position.set(0, 0, metrics.distance * dolly);
      camera.lookAt(0, 0, 0);
    }

    renderer.render(scene, camera);
    requestAnimationFrame(step);
  }

  function kickflip(turns, tumble) {
    if (flipping) return 0;
    flipTurns = Math.max(1, Math.round(turns || 1));
    flipTumble = Math.max(0, Math.round(tumble || 0));
    flipMs = FLIP_BASE_SECONDS * (1 + (flipTurns - 1) * 0.4) * 1000;
    flipStarted = performance.now();
    flipping = true;
    return flipMs;
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
    abort() {
      flipping = false;
      pivot.rotation.x = 0;
      pivot.rotation.z = 0;
      pivot.position.y = 0;
    },
    kickflip,
    get flipMs() {
      return flipMs;
    },
    setIntensity(multiplier) {
      intensity = Math.max(1, multiplier);
    },
    shake(strength) {
      const base = metrics ? metrics.halfY : 1;
      shakeAmount = base * (strength || 0.14);
      shakeUntil = performance.now() + SHAKE_MS;
    },
    pop(amount) {
      popAmount = Math.min(Math.max(amount, 0), 0.9);
      popStarted = performance.now();
      popping = true;
    },
    isFlipping() {
      return flipping;
    },
    destroy() {
      renderer.dispose();
    },
  };
}
