import { describe, it, expect } from "vitest";
import {
  IMAGE_MODELS,
  PIPELINE_STEPS,
  PLATFORMS,
  VIDEO_MODELS,
  recommendImageModel,
} from "../shared/catalog";

describe("shared/catalog", () => {
  it("contains the exact image model identifiers required by the brief", () => {
    const ids = IMAGE_MODELS.map(m => m.id);
    for (const required of ["Krea 1", "Nano Banana Pro", "Flux", "ChatGPT Image", "Seedream 4"]) {
      expect(ids).toContain(required);
    }
  });

  it("contains the exact video model identifiers required by the brief", () => {
    const ids = VIDEO_MODELS.map(m => m.id);
    for (const required of ["Veo 3.1", "Kling 2.6", "Hailuo 2.3", "Wan 2.5"]) {
      expect(ids).toContain(required);
    }
  });

  it("exposes TikTok, Instagram, YouTube and Facebook platforms with 9:16", () => {
    const ids = PLATFORMS.map(p => p.id);
    expect(ids).toEqual(
      expect.arrayContaining(["TikTok", "Instagram", "YouTube", "Facebook"]),
    );
    for (const p of PLATFORMS) {
      expect(p.recommendedAspect).toBe("9:16");
    }
  });

  it("defines exactly 5 pipeline steps in order", () => {
    expect(PIPELINE_STEPS).toHaveLength(5);
    expect(PIPELINE_STEPS.map(s => s.id)).toEqual([1, 2, 3, 4, 5]);
    expect(PIPELINE_STEPS.map(s => s.key)).toEqual([
      "script",
      "image",
      "video",
      "subtitle",
      "upload",
    ]);
  });

  describe("recommendImageModel", () => {
    it("recommends Nano Banana Pro when both product and person are present", () => {
      expect(
        recommendImageModel({ hasProduct: true, hasPerson: true, closeUp: false }),
      ).toBe("Nano Banana Pro");
    });

    it("recommends Seedream 4 for product close-ups without people", () => {
      expect(
        recommendImageModel({ hasProduct: true, hasPerson: false, closeUp: true }),
      ).toBe("Seedream 4");
    });

    it("falls back to Krea 1 for general scenes", () => {
      expect(
        recommendImageModel({ hasProduct: false, hasPerson: false, closeUp: false }),
      ).toBe("Krea 1");
    });
  });
});
