// Optional CAD kernel (occt-wasm). The app works without it.
// Each candidate is tried in order; the first that loads wins.
const CANDIDATES = [
  // 1. Self-hosted copy (most reliable on GitHub Pages). See steps below.
  {
    js: new URL("../vendor/occt-wasm/index.js", import.meta.url).href,
    wasm: new URL("../vendor/occt-wasm/occt-wasm.wasm", import.meta.url).href
  },
  // 2. CDN fallback. Pin a real version once you've checked npm.
  {
    js: "https://cdn.jsdelivr.net/npm/occt-wasm@3/+esm",
    wasm: undefined
  }
];

window.cadKernelReady = false;
window.occtKernel = null;

async function tryLoad(c) {
  const mod = await import(c.js);
  return c.wasm ? mod.OcctKernel.init({ wasm: c.wasm }) : mod.OcctKernel.init();
}

for (const c of CANDIDATES) {
  try {
    const kernel = await tryLoad(c);
    // Quick self-test so "ready" means it actually works
    kernel.makeBox(1, 1, 1);
    window.occtKernel = kernel;
    window.cadKernelReady = true;
    window.dispatchEvent(new Event("cadkernelready"));
    console.log("CAD kernel ready:", c.js);
    break;
  } catch (err) {
    console.warn("CAD kernel candidate failed:", c.js, err);
  }
}

if (!window.cadKernelReady) {
  console.warn("CAD kernel unavailable. Using built-in shapes.");
}
