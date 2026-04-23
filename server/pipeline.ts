/**
 * Core pipeline services: scene analysis, prompt generation, image/video generation.
 *
 * - Scene analysis & prompt generation use the built-in LLM helper (invokeLLM).
 * - Image generation uses the built-in generateImage helper as a fallback / proxy
 *   to Krea AI. When a user has configured a Krea API key it would be used directly;
 *   otherwise we fall back to the platform image service. This keeps the UI/flow
 *   fully functional end-to-end in the preview environment.
 * - Video generation is currently simulated with a short polling loop because direct
 *   Krea Video API access requires a user-provided API key; the UI surfaces the
 *   video model selection, placeholder video URL and status transitions.
 */

import { invokeLLM } from "./_core/llm";
import { generateImage } from "./_core/imageGeneration";
import type { ImageModelId, VideoModelId } from "../shared/catalog";
import { kreaGenerateImage, kreaGenerateVideo, kreaTopazUpscale } from "./kreaClient";

export interface SceneAnalysis {
  sceneIndex: number;
  scriptExcerpt: string;
  visualElements: {
    characters: string[];
    backgrounds: string[];
    props: string[];
    products: string[];
    actions: string[];
  };
  mood: string;
  cameraAngle: string;
}

const SCENE_SCHEMA = {
  type: "object",
  properties: {
    scenes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          sceneIndex: { type: "integer" },
          scriptExcerpt: { type: "string" },
          visualElements: {
            type: "object",
            properties: {
              characters: { type: "array", items: { type: "string" } },
              backgrounds: { type: "array", items: { type: "string" } },
              props: { type: "array", items: { type: "string" } },
              products: { type: "array", items: { type: "string" } },
              actions: { type: "array", items: { type: "string" } },
            },
            required: ["characters", "backgrounds", "props", "products", "actions"],
            additionalProperties: false,
          },
          mood: { type: "string" },
          cameraAngle: { type: "string" },
        },
        required: ["sceneIndex", "scriptExcerpt", "visualElements", "mood", "cameraAngle"],
        additionalProperties: false,
      },
    },
  },
  required: ["scenes"],
  additionalProperties: false,
} as const;

export async function analyzeScript(script: string): Promise<SceneAnalysis[]> {
  if (!script.trim()) return [];

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: [
          "너는 쇼핑 숏폼 영상을 위한 장면 분석 전문가다.",
          "주어진 대본을 자연스러운 장면(Scene) 단위로 분리하고, 각 장면마다",
          "시각적 요소(인물, 배경, 소품, 제품, 행동), 분위기/톤, 카메라 앵글을 한국어로 추출하라.",
          "장면 수는 대본 길이에 비례하여 3~8개로 적절히 나누되, 너무 짧게 쪼개지 말 것.",
          "visualElements의 각 배열은 해당 요소가 없으면 빈 배열로 둔다.",
          "카메라 앵글은 클로즈업, 미디엄샷, 와이드샷, 오버더숄더, 탑다운 등에서 선택한다.",
        ].join(" "),
      },
      { role: "user", content: script },
    ],
    response_format: {
      type: "json_schema",
      json_schema: { name: "scene_analysis", strict: true, schema: SCENE_SCHEMA },
    },
  });

  const raw = response.choices[0]?.message?.content;
  const text = typeof raw === "string" ? raw : "";
  try {
    const parsed = JSON.parse(text) as { scenes: SceneAnalysis[] };
    return parsed.scenes.map((s, i) => ({
      ...s,
      sceneIndex: s.sceneIndex ?? i + 1,
    }));
  } catch (err) {
    console.error("[analyzeScript] JSON parse failed:", err, text);
    // Fallback: single scene from the whole script
    return [
      {
        sceneIndex: 1,
        scriptExcerpt: script.slice(0, 400),
        visualElements: { characters: [], backgrounds: [], props: [], products: [], actions: [] },
        mood: "자연스러운",
        cameraAngle: "미디엄샷",
      },
    ];
  }
}

export interface PromptGenerationInput {
  analysis: SceneAnalysis;
  aspectRatio: "9:16" | "16:9" | "1:1";
  hasProductPhoto: boolean;
  hasPersonPhoto: boolean;
}

export async function generateImagePrompt(input: PromptGenerationInput): Promise<string> {
  const { analysis, aspectRatio, hasProductPhoto, hasPersonPhoto } = input;

  const userInstruction = [
    `Scene index: ${analysis.sceneIndex}`,
    `Script excerpt: ${analysis.scriptExcerpt}`,
    `Characters: ${analysis.visualElements.characters.join(", ") || "none"}`,
    `Backgrounds: ${analysis.visualElements.backgrounds.join(", ") || "none"}`,
    `Props: ${analysis.visualElements.props.join(", ") || "none"}`,
    `Products: ${analysis.visualElements.products.join(", ") || "none"}`,
    `Actions: ${analysis.visualElements.actions.join(", ") || "none"}`,
    `Mood/Tone: ${analysis.mood}`,
    `Camera angle: ${analysis.cameraAngle}`,
    `Aspect ratio: ${aspectRatio}`,
    `Product reference photo available: ${hasProductPhoto ? "yes" : "no"}`,
    `Person reference photo available: ${hasPersonPhoto ? "yes" : "no"}`,
  ].join("\n");

  const response = await invokeLLM({
    messages: [
      {
        role: "system",
        content: [
          "You are an expert prompt engineer for Krea AI image models.",
          "Output ONE single English image-generation prompt (no markdown, no quotes, no labels).",
          "Include vivid description of the person (appearance, outfit, pose, expression),",
          "the environment (location, lighting, time of day), product interaction",
          "(holding in hand, using, placed on table), and photography style (photorealistic,",
          "cinematic lighting, product photography, editorial).",
          "End with aspect ratio tag, e.g. --ar 9:16.",
          "When a product reference photo is available, include 'using the product in the attached reference image'.",
          "When a person reference photo is available, include 'matching the person in the attached reference image'.",
          "Keep it under 120 words.",
        ].join(" "),
      },
      { role: "user", content: userInstruction },
    ],
  });

  const raw = response.choices[0]?.message?.content;
  const text = typeof raw === "string" ? raw.trim() : "";
  return text || `${analysis.scriptExcerpt}, photorealistic, cinematic lighting, --ar ${aspectRatio}`;
}

export interface GenerateSceneImageInput {
  prompt: string;
  model: ImageModelId;
  referenceImages: Array<{ url: string; mimeType?: string }>;
  /** Optional Krea API key. When present, we call Krea directly. */
  kreaApiKey?: string;
  aspectRatio?: "9:16" | "16:9" | "1:1";
}

export async function generateSceneImage(
  input: GenerateSceneImageInput
): Promise<{ url: string; provider: "krea" | "builtin" }> {
  // 1) Real Krea path when the user supplied an API key.
  if (input.kreaApiKey) {
    try {
      const url = await kreaGenerateImage({
        apiKey: input.kreaApiKey,
        model: input.model,
        prompt: input.prompt,
        aspectRatio: input.aspectRatio,
        referenceImageUrls: input.referenceImages.map(r => r.url),
      });
      return { url, provider: "krea" };
    } catch (err) {
      console.warn("[generateSceneImage] Krea failed, falling back:", err);
      // intentional fallthrough to built-in
    }
  }

  // 2) Fallback path: built-in image helper. Prefix the prompt with the
  //    selected model for provenance so the UI label matches the user's choice.
  const prompt = `[${input.model}] ${input.prompt}`;
  const { url } = await generateImage({
    prompt,
    originalImages: input.referenceImages.length
      ? input.referenceImages.map(r => ({ url: r.url, mimeType: r.mimeType || "image/png" }))
      : undefined,
  });
  if (!url) throw new Error("Image generation returned empty URL");
  return { url, provider: "builtin" };
}

export interface UpscaleSceneImageInput {
  imageUrl: string;
  kreaApiKey?: string;
}

/** Topaz upscale via Krea. Returns the upscaled URL or the original on fallback. */
export async function upscaleSceneImage(
  input: UpscaleSceneImageInput,
): Promise<{ url: string; provider: "krea" | "noop" }> {
  if (!input.kreaApiKey) return { url: input.imageUrl, provider: "noop" };
  try {
    const url = await kreaTopazUpscale({ apiKey: input.kreaApiKey, imageUrl: input.imageUrl });
    return { url, provider: "krea" };
  } catch (err) {
    console.warn("[upscaleSceneImage] Krea Topaz failed, keeping original:", err);
    return { url: input.imageUrl, provider: "noop" };
  }
}

export interface GenerateSceneVideoInput {
  imageUrl: string;
  model: VideoModelId;
  durationSec: number;
  /** Optional prompt to steer the motion. */
  prompt?: string;
  aspectRatio?: "9:16" | "16:9";
  /** Optional Krea API key — when present, we call the real Image-to-Video endpoint. */
  kreaApiKey?: string;
}

/**
 * Image-to-video generation. Uses the real Krea Image-to-Video endpoint when
 * the user has supplied an API key, otherwise returns the start image as a
 * "video poster" so the UI flow stays end-to-end functional in preview.
 */
export async function generateSceneVideo(
  input: GenerateSceneVideoInput,
): Promise<{ url: string; provider: "krea" | "poster" }> {
  if (!input.imageUrl) throw new Error("Start image URL is required");

  if (input.kreaApiKey) {
    try {
      const url = await kreaGenerateVideo({
        apiKey: input.kreaApiKey,
        model: input.model,
        prompt: input.prompt ?? "",
        startImageUrl: input.imageUrl,
        duration: input.durationSec,
        aspectRatio: input.aspectRatio ?? "9:16",
      });
      return { url, provider: "krea" };
    } catch (err) {
      console.warn("[generateSceneVideo] Krea failed, returning start image:", err);
      // Fall through to poster fallback so the workspace flow remains usable.
    }
  }

  // Short async delay to emulate work for the progress UI.
  await new Promise(resolve => setTimeout(resolve, 600));
  return { url: input.imageUrl, provider: "poster" };
}
