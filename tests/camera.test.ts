import { describe, expect, it } from "vitest";
import { CameraError, calculateContainSize } from "../src/camera";

describe("calculateContainSize", () => {
  it("keeps a smaller image at its original dimensions", () => {
    expect(calculateContainSize(1200, 900)).toEqual({ width: 1200, height: 900 });
  });

  it("reduces landscape and portrait photos to a 1600px long edge", () => {
    expect(calculateContainSize(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(calculateContainSize(3000, 4000)).toEqual({ width: 1200, height: 1600 });
  });

  it("rejects invalid camera dimensions", () => {
    expect(() => calculateContainSize(0, 100)).toThrowError(CameraError);
  });
});
