import type { Image } from "canvas";
import { loadCanvas } from "../nativeRuntime";
import type { FaceDetectionResult, Point2D } from "../faceDetection";

/**
 * FACE ALIGNMENT
 * --------------
 * Embedding models are trained on faces warped to a canonical pose —
 * eyes on a fixed horizontal line, a fixed inter-eye distance, nose
 * roughly centered — so the network only has to learn identity, not
 * identity-entangled-with-head-tilt. Skipping alignment and feeding a
 * raw crop measurably hurts accuracy for both the dlib-style and
 * ArcFace-style embedding backends this pipeline supports.
 *
 * This computes a similarity transform (uniform scale + rotation +
 * translation — no shear/perspective, which is deliberately simpler than
 * a full affine fit and standard for this use case) that maps the
 * detected eye centers onto fixed target positions in the output canvas,
 * then draws the source image through that transform via node-canvas's
 * 2D context (a genuine affine warp, not a crop-and-resize).
 */

export interface AlignmentTarget {
  outputSize: number;
  /** Target eye positions as a fraction of outputSize — ArcFace's own
   * standard 112x112 template positions eyes at roughly this. */
  leftEyeTarget: Point2D;
  rightEyeTarget: Point2D;
}

/** ArcFace/insightface's published canonical template, scaled to
 * whatever outputSize is requested. Reused as-is by both backends since
 * both were trained on this convention (dlib's own alignment is close
 * enough to this that the small difference doesn't matter in practice
 * for a keep/reject-threshold system like this one). */
export function arcfaceTemplate(outputSize: number): AlignmentTarget {
  const scale = outputSize / 112;
  return {
    outputSize,
    leftEyeTarget: { x: 38.2946 * scale, y: 51.6963 * scale },
    rightEyeTarget: { x: 73.5318 * scale, y: 51.5014 * scale },
  };
}

function similarityTransform(from: [Point2D, Point2D], to: [Point2D, Point2D]): { scale: number; rotation: number; tx: number; ty: number } {
  const [f0, f1] = from;
  const [t0, t1] = to;

  const fromDx = f1.x - f0.x;
  const fromDy = f1.y - f0.y;
  const toDx = t1.x - t0.x;
  const toDy = t1.y - t0.y;

  const fromDist = Math.hypot(fromDx, fromDy) || 1;
  const toDist = Math.hypot(toDx, toDy) || 1;

  const scale = toDist / fromDist;
  const fromAngle = Math.atan2(fromDy, fromDx);
  const toAngle = Math.atan2(toDy, toDx);
  const rotation = toAngle - fromAngle;

  // Where the "from" midpoint lands after scale+rotate; translation is
  // whatever's needed to then land it on the "to" midpoint.
  const fromMid = { x: (f0.x + f1.x) / 2, y: (f0.y + f1.y) / 2 };
  const toMid = { x: (t0.x + t1.x) / 2, y: (t0.y + t1.y) / 2 };

  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  const rotatedMidX = fromMid.x * cos * scale - fromMid.y * sin * scale;
  const rotatedMidY = fromMid.x * sin * scale + fromMid.y * cos * scale;

  return { scale, rotation, tx: toMid.x - rotatedMidX, ty: toMid.y - rotatedMidY };
}

/**
 * Aligns the face in `sourceBuffer` using its detected eye landmarks,
 * returning a PNG buffer of size `target.outputSize` x `outputSize`
 * ready to feed directly into an embedding backend.
 */
export async function alignFace(sourceBuffer: Buffer, detection: FaceDetectionResult, target: AlignmentTarget = arcfaceTemplate(112)): Promise<Buffer> {
  const { createCanvas, loadImage } = await loadCanvas();
  const image = (await loadImage(sourceBuffer)) as Image;

  const { scale, rotation, tx, ty } = similarityTransform([detection.landmarks5.leftEye, detection.landmarks5.rightEye], [target.leftEyeTarget, target.rightEyeTarget]);

  const canvas = createCanvas(target.outputSize, target.outputSize);
  const ctx = canvas.getContext("2d");

  // node-canvas's 2D context matrix is [a b c d e f] applied as:
  //   x' = a*x + c*y + e
  //   y' = b*x + d*y + f
  // which is exactly scale*rotate + translate.
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  ctx.transform(scale * cos, scale * sin, -scale * sin, scale * cos, tx, ty);
  ctx.drawImage(image, 0, 0);

  return canvas.toBuffer("image/png");
}
