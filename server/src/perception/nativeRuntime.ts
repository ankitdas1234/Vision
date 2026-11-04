/**
 * LAZY NATIVE ML RUNTIME
 * ----------------------
 * `@tensorflow/tfjs-node`, `@vladmandic/face-api`, `@vladmandic/human` and
 * `canvas` are all native modules: they need a compiled addon for the
 * exact Node ABI on the machine, plus (for tfjs) a separately-downloaded
 * libtensorflow. When any of that is missing, *importing* them throws.
 *
 * They used to be imported at the top of four perception modules, which
 * made that failure spread far wider than it should:
 *
 *   commands/CommandRegistry -> ... -> perception/personDetection
 *     -> perception/objectDetectionModel -> import "@tensorflow/tfjs-node" -> THROW
 *
 * so dispatching a gait command, or running a dance, or booting the
 * server at all, would fail on a machine where nobody was ever going to
 * use the camera — and the heuristic fallbacks that exist precisely for
 * "no model available" (HeuristicPersonDetector / HeuristicObjectDetector)
 * could never be reached, because the throw happened at import time,
 * before any try/catch around detection could run.
 *
 * Loading them here, on first actual use, means:
 *  - a missing native build only affects detection, where the existing
 *    fallbacks handle it as the already-handled error it is
 *  - the rest of the system (commands, gait, audio, memory, the brain's
 *    non-visual path) works on any machine
 *  - startup doesn't pay for a few hundred ms of native module init
 *    before anyone's asked for a frame
 *
 * Each loader is memoized, and a FAILED load is deliberately not cached —
 * same convention as the model loaders that call these — so installing
 * the missing binary and retrying works without a process restart.
 */

type FaceApiModule = typeof import("@vladmandic/face-api");
type CanvasModule = typeof import("canvas");
type HumanModule = typeof import("@vladmandic/human");

let canvasPromise: Promise<CanvasModule> | null = null;
let faceApiPromise: Promise<FaceApiModule> | null = null;
let humanPromise: Promise<HumanModule> | null = null;

function memoize<T>(load: () => Promise<T>, clear: () => void): Promise<T> {
  return load().catch((err) => {
    clear();
    throw err;
  });
}

export async function loadCanvas(): Promise<CanvasModule> {
  if (!canvasPromise) {
    canvasPromise = memoize(
      () => import("canvas"),
      () => {
        canvasPromise = null;
      },
    );
  }
  return canvasPromise;
}

/**
 * Loads face-api with the TF backend registered and the canvas
 * monkey-patch applied — face-api is browser-oriented and needs a DOM
 * Canvas/Image/ImageData before any net will run under Node. Doing it
 * here means the patch happens exactly once, instead of being repeated
 * (identically) in every module that touches face-api.
 */
export async function loadFaceApi(): Promise<FaceApiModule> {
  if (!faceApiPromise) {
    faceApiPromise = memoize(
      async () => {
        await import("@tensorflow/tfjs-node"); // side-effecting: registers the compiled backend
        const faceapi = await import("@vladmandic/face-api");
        const { Canvas, Image, ImageData } = await loadCanvas();
        faceapi.env.monkeyPatch({
          Canvas: Canvas as unknown as typeof HTMLCanvasElement,
          Image: Image as unknown as typeof HTMLImageElement,
          ImageData: ImageData as unknown as typeof globalThis.ImageData,
        });
        return faceapi;
      },
      () => {
        faceApiPromise = null;
      },
    );
  }
  return faceApiPromise;
}

/** Loads @vladmandic/human with the TF backend registered — the
 * side-effecting tfjs import is also what gives Human's model loader its
 * `file://` IOHandler, so CenterNet weights load straight off local disk. */
export async function loadHuman(): Promise<HumanModule> {
  if (!humanPromise) {
    humanPromise = memoize(
      async () => {
        await import("@tensorflow/tfjs-node");
        return import("@vladmandic/human");
      },
      () => {
        humanPromise = null;
      },
    );
  }
  return humanPromise;
}

/** Test hook — drops the memoized modules so a failed-then-fixed load can
 * be exercised without a fresh process. */
export function resetNativeRuntimeCache() {
  canvasPromise = null;
  faceApiPromise = null;
  humanPromise = null;
}
