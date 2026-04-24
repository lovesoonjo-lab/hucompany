// Shared catalog of Krea AI image/video models and SNS platforms.
// Keep model names EXACTLY as specified by the product brief.

export type ImageModelId =
  | "Krea 1"
  | "Nano Banana Pro"
  | "Nano Banana 2"
  | "Flux"
  | "ChatGPT Image"
  | "Seedream 4"
  | "Imagen 4"
  | "Ideogram 3.0"
  | "Flux Kontext";

export interface ImageModelSpec {
  id: ImageModelId;
  label: string;
  description: string;
  pricing: string;
  speed: string;
  bestFor: string;
}

export const IMAGE_MODELS: ImageModelSpec[] = [
  {
    id: "Krea 1",
    label: "Krea 1",
    description: "4장 생성, 4K 해상도, 가장 빠름(6초)",
    pricing: "8 compute units",
    speed: "매우 빠름",
    bestFor: "빠른 반복 작업",
  },
  {
    id: "Nano Banana Pro",
    label: "Nano Banana Pro",
    description: "복잡한 프롬프트 이해력 최고, 추론 모델",
    pricing: "$0.15/장",
    speed: "보통",
    bestFor: "제품 + 인물 합성",
  },
  {
    id: "Nano Banana 2",
    label: "Nano Banana 2",
    description: "최신 나노 바나나 이미지 모델",
    pricing: "프리미엄",
    speed: "보통",
    bestFor: "고품질 이미지 생성",
  },
  {
    id: "Flux",
    label: "Flux",
    description: "4장 생성, 빠름(4초), 비용 효율적",
    pricing: "$0.04/장",
    speed: "빠름",
    bestFor: "일반 배경/풍경",
  },
  {
    id: "ChatGPT Image",
    label: "ChatGPT Image",
    description: "이미지 참조 가능한 추론 모델",
    pricing: "$0.03~/장",
    speed: "보통",
    bestFor: "이미지 참조 합성",
  },
  {
    id: "Seedream 4",
    label: "Seedream 4",
    description: "ByteDance 모델, 4K 지원",
    pricing: "프리미엄",
    speed: "보통",
    bestFor: "제품 클로즈업",
  },
  {
    id: "Imagen 4",
    label: "Imagen 4",
    description: "Google 모델, 높은 완성도",
    pricing: "$0.04/장",
    speed: "빠름",
    bestFor: "제품 클로즈업, 일반 용도",
  },
  {
    id: "Ideogram 3.0",
    label: "Ideogram 3.0",
    description: "그래픽 디자인 및 타이포그래피",
    pricing: "표준",
    speed: "보통",
    bestFor: "그래픽/포스터",
  },
  {
    id: "Flux Kontext",
    label: "Flux Kontext",
    description: "이미지 편집/변형 특화",
    pricing: "$0.04/장",
    speed: "빠름",
    bestFor: "이미지 편집",
  },
];

export type VideoModelId =
  | "Veo 3.1"
  | "Kling 2.6"
  | "Hailuo 2.3"
  | "Seedance 2.0"
  | "Wan 2.5"
  | "Hailuo 2.3 Fast";

export interface VideoModelSpec {
  id: VideoModelId;
  label: string;
  description: string;
  pricing: string;
  maxDuration: string;
}

export const VIDEO_MODELS: VideoModelSpec[] = [
  { id: "Veo 3.1", label: "Veo 3.1", description: "최고 품질, 오디오 포함", pricing: "$0.20/초", maxDuration: "4분" },
  { id: "Kling 2.6", label: "Kling 2.6", description: "고품질, 오디오 포함, 가성비", pricing: "$0.07/초", maxDuration: "3분" },
  { id: "Hailuo 2.3", label: "Hailuo 2.3", description: "역동적 모션, 캐릭터 유지력 최고", pricing: "~200 credits", maxDuration: "2분" },
  { id: "Seedance 2.0", label: "Seedance 2.0", description: "ByteDance, 시네마틱, 오디오", pricing: "~300 credits", maxDuration: "2분" },
  { id: "Wan 2.5", label: "Wan 2.5", description: "가성비 좋음", pricing: "$0.05~/초", maxDuration: "3분" },
  { id: "Hailuo 2.3 Fast", label: "Hailuo 2.3 Fast", description: "빠르고 저렴", pricing: "~150 credits", maxDuration: "빠름" },
];

export type PlatformId = "TikTok" | "Instagram" | "YouTube" | "Facebook";
export interface PlatformSpec {
  id: PlatformId;
  label: string;
  description: string;
  recommendedAspect: "9:16" | "16:9" | "1:1";
}
export const PLATFORMS: PlatformSpec[] = [
  { id: "TikTok", label: "TikTok", description: "세로 숏폼, 트렌드 중심", recommendedAspect: "9:16" },
  { id: "Instagram", label: "Instagram", description: "Reels·피드, 감각적 비주얼", recommendedAspect: "9:16" },
  { id: "YouTube", label: "YouTube", description: "Shorts·롱폼, 광범위한 리치", recommendedAspect: "9:16" },
  { id: "Facebook", label: "Facebook", description: "Reels·뉴스피드, 폭넓은 연령대", recommendedAspect: "9:16" },
];

/**
 * Normalises legacy PlatformId values previously persisted in the database
 * (e.g. "Instagram Reels", "YouTube Shorts") into the current canonical ids.
 * UI components MUST run user-facing platform strings through this helper
 * before rendering or comparing against the catalog.
 */
export function normalizePlatformId(raw: string): PlatformId | null {
  switch (raw) {
    case "TikTok":
    case "Instagram":
    case "YouTube":
    case "Facebook":
      return raw;
    case "Instagram Reels":
      return "Instagram";
    case "YouTube Shorts":
      return "YouTube";
    default:
      return null;
  }
}

export const PIPELINE_STEPS = [
  { id: 1, key: "script", title: "대본 입력 & 장면 분리", description: "" },
  { id: 2, key: "image", title: "이미지 생성", description: "" },
  { id: 3, key: "video", title: "영상 변환", description: "" },
  { id: 4, key: "subtitle", title: "오디오 / 자막 생성", description: "" },
  { id: 5, key: "upload", title: "SNS 멀티 플랫폼 일괄 업로드", description: "" },
] as const;

/**
 * Recommends an image model based on scene hints (per product brief).
 *
 * - 제품 + 인물 합성 장면     -> Nano Banana Pro (대안: ChatGPT Image)
 * - 제품 클로즈업이나 디테일 -> Seedream 4 (대안: Imagen 4)
 * - 그래픽/타이포그래피     -> Ideogram 3.0
 * - 이미지 편집/변형         -> Flux Kontext
 * - 일반 배경/풍경            -> Krea 1 (메인) · Flux (저술 대안)
 */
export function recommendImageModel(hints: {
  hasProduct: boolean;
  hasPerson: boolean;
  closeUp: boolean;
  graphic?: boolean;
  edit?: boolean;
}): ImageModelId {
  if (hints.edit) return "Flux Kontext";
  if (hints.graphic) return "Ideogram 3.0";
  if (hints.hasProduct && hints.hasPerson) return "Nano Banana Pro";
  if (hints.closeUp && hints.hasProduct) return "Seedream 4";
  if (hints.closeUp) return "Imagen 4";
  return "Krea 1";
}

/**
 * Returns up to N alternative image models in priority order. Useful for the UI to
 * surface secondary suggestions next to the primary recommendation.
 */
export function recommendImageModelAlternatives(hints: {
  hasProduct: boolean;
  hasPerson: boolean;
  closeUp: boolean;
  graphic?: boolean;
  edit?: boolean;
}, n = 2): ImageModelId[] {
  const primary = recommendImageModel(hints);
  const ranked: ImageModelId[] = [];
  if (hints.hasProduct && hints.hasPerson) ranked.push("Nano Banana Pro", "ChatGPT Image", "Flux Kontext");
  else if (hints.closeUp && hints.hasProduct) ranked.push("Seedream 4", "Imagen 4", "Krea 1");
  else if (hints.closeUp) ranked.push("Imagen 4", "Seedream 4", "Krea 1");
  else if (hints.graphic) ranked.push("Ideogram 3.0", "Flux", "Krea 1");
  else if (hints.edit) ranked.push("Flux Kontext", "Nano Banana Pro");
  else ranked.push("Krea 1", "Flux", "Imagen 4");
  return ranked.filter(m => m !== primary).slice(0, n);
}
