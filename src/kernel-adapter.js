// Optional CAD kernel. The app works without it.
// Check the package name, version and entry point on npm, then set the URL.
const OCCT_URL = "https://cdn.jsdelivr.net/npm/occt-wasm@x.y.z/+esm";

window.cadKernelReady = false;

try {
  const mod = await import(OCCT_URL);
  window.occtKernel = await mod.OcctKernel.init();
  window.cadKernelReady = true;
  window.dispatchEvent(new Event("cadkernelready"));
  console.log("CAD kernel ready");
} catch (err) {
  console.warn("CAD kernel unavailable, using built-in shapes:", err);
}
