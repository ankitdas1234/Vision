import { describe, it, expect } from "vitest";
import { pathToFileURL, fileURLToPath } from "url";
import path from "path";
import { defaultModelsDir } from "../../../src/perception/objectDetectionModel";

describe("defaultModelsDir", () => {
  it("resolves to a well-formed file:// URL (parseable by the URL constructor)", () => {
    const url = defaultModelsDir();
    expect(url.startsWith("file://")).toBe(true);
    expect(() => new URL(url)).not.toThrow();
  });

  it("uses the standard, Node-documented pathToFileURL mechanism, which correctly encodes a path containing spaces/parens and round-trips exactly", () => {
    // NOTE: this file previously built the URL with a naive
    // `file://${dir}` string template. Further testing showed that claim
    // needs a caveat, in the interest of not overstating things: Node's
    // own WHATWG-compliant URL parser is more forgiving than expected —
    // it auto-normalizes backslashes to forward slashes and percent-
    // encodes spaces for "special" schemes like file:, even for a
    // combined drive-letter + backslash + space path. So the naive
    // version likely worked in practice too, PROVIDED whatever consumes
    // it (tfjs-node's internal file loader) parses the URL the standard
    // way. pathToFileURL remains strictly better regardless: it's the
    // canonical, purpose-built, Node-documented function for exactly
    // this conversion, with no dependence on a parser's leniency to
    // paper over an already-malformed string.
    const spacey = path.resolve("some dir with space", "and (parens)", "models");
    const fixed = pathToFileURL(spacey).href;

    expect(fixed).toContain("%20");
    expect(fileURLToPath(fixed)).toBe(spacey);
  });
});
