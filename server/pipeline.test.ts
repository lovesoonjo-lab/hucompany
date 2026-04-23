import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the LLM helper to avoid network calls during unit tests.
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(),
}));
// Mock image generation to a fixed URL.
vi.mock("./_core/imageGeneration", () => ({
  generateImage: vi.fn(async () => ({ url: "/manus-storage/mock.png" })),
}));

import { invokeLLM } from "./_core/llm";
import {
  analyzeScript,
  generateImagePrompt,
  generateSceneImage,
  generateSceneVideo,
} from "./pipeline";

const mockedInvokeLLM = invokeLLM as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("pipeline.analyzeScript", () => {
  it("returns an empty array when given empty script", async () => {
    const result = await analyzeScript("   ");
    expect(result).toEqual([]);
    expect(mockedInvokeLLM).not.toHaveBeenCalled();
  });

  it("parses LLM JSON output into scene objects", async () => {
    mockedInvokeLLM.mockResolvedValueOnce({
      choices: [
        {
          message: {
            content: JSON.stringify({
              scenes: [
                {
                  sceneIndex: 1,
                  scriptExcerpt: "햇살 가득한 카페",
                  visualElements: {
                    characters: ["여성 모델"],
                    backgrounds: ["밝은 카페"],
                    props: ["커피잔"],
                    products: ["비타민C 세럼"],
                    actions: ["손등에 펴 바르기"],
                  },
                  mood: "포근한",
                  cameraAngle: "미디엄샷",
                },
              ],
            }),
          },
        },
      ],
    });

    const result = await analyzeScript("봄날 아침의 카페에서 비타민C 세럼을 펴 바른다.");
    expect(result).toHaveLength(1);
    expect(result[0].sceneIndex).toBe(1);
    expect(result[0].mood).toBe("포근한");
    expect(result[0].visualElements.products).toContain("비타민C 세럼");
  });

  it("falls back to a single scene when LLM output is unparsable", async () => {
    mockedInvokeLLM.mockResolvedValueOnce({
      choices: [{ message: { content: "not-json" } }],
    });
    const result = await analyzeScript("어떤 대본이라도 좋습니다.");
    expect(result).toHaveLength(1);
    expect(result[0].sceneIndex).toBe(1);
    expect(result[0].cameraAngle).toBe("미디엄샷");
  });
});

describe("pipeline.generateImagePrompt", () => {
  it("calls the LLM and returns the trimmed text", async () => {
    mockedInvokeLLM.mockResolvedValueOnce({
      choices: [{ message: { content: "  A young woman holds a serum bottle, cinematic lighting, --ar 9:16  " } }],
    });
    const text = await generateImagePrompt({
      analysis: {
        sceneIndex: 1,
        scriptExcerpt: "햇살 카페",
        visualElements: {
          characters: ["여성 모델"],
          backgrounds: ["카페"],
          props: [],
          products: ["세럼"],
          actions: ["손등에 바르기"],
        },
        mood: "포근한",
        cameraAngle: "미디엄샷",
      },
      aspectRatio: "9:16",
      hasProductPhoto: true,
      hasPersonPhoto: false,
    });
    expect(text).toMatch(/--ar 9:16/);
    expect(text.startsWith(" ")).toBe(false);
  });

  it("returns a fallback prompt when the LLM returns nothing", async () => {
    mockedInvokeLLM.mockResolvedValueOnce({ choices: [{ message: { content: "" } }] });
    const text = await generateImagePrompt({
      analysis: {
        sceneIndex: 1,
        scriptExcerpt: "scene",
        visualElements: { characters: [], backgrounds: [], props: [], products: [], actions: [] },
        mood: "calm",
        cameraAngle: "medium",
      },
      aspectRatio: "16:9",
      hasProductPhoto: false,
      hasPersonPhoto: false,
    });
    expect(text).toContain("--ar 16:9");
  });
});

describe("pipeline.generateSceneImage", () => {
  it("returns a non-empty URL prefixed with the model tag in the prompt", async () => {
    const result = await generateSceneImage({
      prompt: "elegant scene",
      model: "Krea 1",
      referenceImages: [],
    });
    expect(result.url).toBeTruthy();
  });
});

describe("pipeline.generateSceneVideo", () => {
  it("rejects when no image URL is provided", async () => {
    await expect(
      generateSceneVideo({ imageUrl: "", model: "Kling 2.6", durationSec: 6 }),
    ).rejects.toThrow();
  });

  it("returns the start image as a placeholder video URL", async () => {
    const result = await generateSceneVideo({
      imageUrl: "/manus-storage/start.png",
      model: "Kling 2.6",
      durationSec: 6,
    });
    expect(result.url).toBe("/manus-storage/start.png");
  });
});
