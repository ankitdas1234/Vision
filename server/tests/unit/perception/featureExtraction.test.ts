import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { extractFeatures } from "../../../src/perception/featureExtraction";

/** Builds a raw solid-colour PNG buffer for a controlled test image. */
async function solidColourImage(width: number, height: number, r: number, g: number, b: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r, g, b } } }).png().toBuffer();
}

describe("extractFeatures", () => {
  it("derives a real primaryColour from the actual cropped pixels (solid red)", async () => {
    const image = await solidColourImage(200, 200, 200, 30, 30);
    const features = await extractFeatures(image, { boundingBox: { x: 0, y: 0, width: 200, height: 200 } });
    expect(features.primaryColour).toBe("red");
  });

  it("derives a different colour bucket for a solid blue image", async () => {
    const image = await solidColourImage(200, 200, 40, 80, 190);
    const features = await extractFeatures(image, { boundingBox: { x: 0, y: 0, width: 200, height: 200 } });
    expect(features.primaryColour).toBe("blue");
  });

  it("classifies a near-square bounding box as 'square'", async () => {
    const image = await solidColourImage(100, 100, 128, 128, 128);
    const features = await extractFeatures(image, { boundingBox: { x: 0, y: 0, width: 100, height: 100 } });
    expect(features.shape).toBe("square");
  });

  it("classifies a tall bounding box as 'tall' and a wide one as 'wide'", async () => {
    const tallImage = await solidColourImage(50, 200, 128, 128, 128);
    const tall = await extractFeatures(tallImage, { boundingBox: { x: 0, y: 0, width: 50, height: 200 } });
    expect(tall.shape).toBe("tall");

    const wideImage = await solidColourImage(200, 50, 128, 128, 128);
    const wide = await extractFeatures(wideImage, { boundingBox: { x: 0, y: 0, width: 200, height: 50 } });
    expect(wide.shape).toBe("wide");
  });

  it("always returns real aspectRatio/dimensions from the bounding box geometry", async () => {
    const image = await solidColourImage(200, 200, 128, 128, 128);
    const features = await extractFeatures(image, { boundingBox: { x: 10, y: 10, width: 80, height: 40 } });
    expect(features.aspectRatio).toBeCloseTo(2, 5);
    expect(features.dimensions).toEqual({ width: 80, height: 40 });
  });

  it("degrades gracefully (geometry only, no throw) when the bounding box is invalid for cropping", async () => {
    const image = await solidColourImage(50, 50, 128, 128, 128);
    // Bounding box far outside the actual image — sharp's extract() will
    // reject this; extractFeatures must not throw.
    const features = await extractFeatures(image, { boundingBox: { x: 500, y: 500, width: 100, height: 100 } });
    expect(features.aspectRatio).toBe(1);
    expect(features.shape).toBe("square");
    expect(features.primaryColour).toBeUndefined();
  });

  it("two similar real photos of the same coloured object produce features close enough to match conceptually", async () => {
    // Slightly different crops/sizes of "the same red object" — real-world
    // sightings are never pixel-identical.
    const sightingOne = await extractFeatures(await solidColourImage(120, 118, 195, 45, 40), { boundingBox: { x: 0, y: 0, width: 120, height: 118 } });
    const sightingTwo = await extractFeatures(await solidColourImage(112, 124, 205, 35, 35), { boundingBox: { x: 0, y: 0, width: 112, height: 124 } });

    expect(sightingOne.primaryColour).toBe(sightingTwo.primaryColour);
    expect(sightingOne.shape).toBe(sightingTwo.shape);
  });
});
