import DashboardLayout from "@/components/DashboardLayout";
import { PipelineStepper, PipelineStage } from "@/components/PipelineStepper";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import {
  IMAGE_MODELS,
  PLATFORMS,
  PlatformId,
  VIDEO_MODELS,
  normalizePlatformId,
  recommendImageModel,
  type ImageModelId,
  type VideoModelId,
} from "@shared/catalog";
import {
  ArrowLeft,
  Image as ImageIcon,
  Loader2,
  Send,
  Sparkles,
  Trash2,
  Upload,
  Wand2,
  Film,
  Layers,
  RefreshCw,
} from "lucide-react";
import { useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { toast } from "sonner";

type SceneRow = {
  id: number;
  projectId: number;
  sceneIndex: number;
  scriptExcerpt: string | null;
  visualElements: unknown;
  mood: string | null;
  cameraAngle: string | null;
  imagePrompt: string | null;
  imageModel: string | null;
  imageUrl: string | null;
  imageStatus: "pending" | "generating" | "ready" | "failed";
  upscaled: boolean;
  videoModel: string | null;
  videoDuration: number;
  videoUrl: string | null;
  videoStatus: "pending" | "generating" | "ready" | "failed";
};

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1] ?? "";
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function ProjectWorkspace() {
  const [, params] = useRoute("/projects/:id");
  const [, setLocation] = useLocation();
  const projectId = Number(params?.id);

  const utils = trpc.useUtils();
  const projectQuery = trpc.projects.get.useQuery(
    { projectId },
    { enabled: !Number.isNaN(projectId) }
  );

  const project = projectQuery.data?.project;
  const scenes = (projectQuery.data?.scenes ?? []) as SceneRow[];
  const assets = projectQuery.data?.assets ?? [];
  const uploads = projectQuery.data?.uploads ?? [];

  const [script, setScript] = useState("");
  const [tab, setTab] = useState<PipelineStage>("script");

  // Sync script field once project loads
  useMemo(() => {
    if (project?.script && !script) setScript(project.script);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id]);

  const refresh = () => utils.projects.get.invalidate({ projectId });

  const analyzeMutation = trpc.scenes.analyze.useMutation({
    onSuccess: () => {
      toast.success("장면 분리가 완료되었습니다");
      refresh();
      setTab("prompt");
    },
    onError: e => toast.error(e.message),
  });

  const uploadAssetMutation = trpc.assets.upload.useMutation({
    onSuccess: () => {
      toast.success("자산이 업로드되었습니다");
      refresh();
    },
    onError: e => toast.error(e.message),
  });

  const removeAssetMutation = trpc.assets.remove.useMutation({
    onSuccess: refresh,
  });

  const handleAssetUpload = async (kind: "product" | "person", file: File | null) => {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      toast.error("8MB 이하 파일만 업로드할 수 있습니다");
      return;
    }
    const base64 = await fileToBase64(file);
    uploadAssetMutation.mutate({
      projectId,
      kind,
      filename: file.name,
      mimeType: file.type || "application/octet-stream",
      dataBase64: base64,
    });
  };

  const generateProgress = scenes.length === 0
    ? 0
    : (scenes.filter(s => s.imageStatus === "ready").length / scenes.length) * 100;
  const videoProgress = scenes.length === 0
    ? 0
    : (scenes.filter(s => s.videoStatus === "ready").length / scenes.length) * 100;

  const completed: Record<PipelineStage, boolean> = {
    script: !!project?.script && scenes.length > 0,
    prompt: scenes.length > 0 && scenes.every(s => !!s.imagePrompt),
    image: scenes.length > 0 && scenes.every(s => s.imageStatus === "ready"),
    video: scenes.length > 0 && scenes.every(s => s.videoStatus === "ready"),
    upload: uploads.length > 0 && uploads.every(u => u.status === "success"),
  };

  if (Number.isNaN(projectId)) {
    return (
      <DashboardLayout>
        <p className="text-sm text-muted-foreground">잘못된 프로젝트 ID입니다.</p>
      </DashboardLayout>
    );
  }

  if (projectQuery.isLoading || !project) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center py-20 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> 프로젝트를 불러오는 중…
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-7xl space-y-8 py-2">
        <button
          onClick={() => setLocation("/projects")}
          className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-2"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> 프로젝트 목록
        </button>

        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="uppercase tracking-[0.28em] text-[11px] text-muted-foreground">Project</p>
            <h1 className="font-serif text-3xl md:text-4xl mt-1">{project.title}</h1>
            <div className="gold-divider w-20 mt-3" />
            <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
              <Badge variant="secondary" className="font-mono">{project.aspectRatio}</Badge>
              <span>장면 {scenes.length}개</span>
              <span>· 자산 {assets.length}개</span>
              <span>· 업로드 {uploads.length}건</span>
            </div>
          </div>
          <Button variant="ghost" onClick={refresh}>
            <RefreshCw className="h-4 w-4" /> 새로고침
          </Button>
        </header>

        <PipelineStepper current={tab} completed={completed} />

        <Tabs value={tab} onValueChange={v => setTab(v as PipelineStage)}>
          <TabsList className="grid grid-cols-5 w-full max-w-3xl">
            <TabsTrigger value="script">1. 대본</TabsTrigger>
            <TabsTrigger value="prompt">2. 프롬프트</TabsTrigger>
            <TabsTrigger value="image">3. 이미지</TabsTrigger>
            <TabsTrigger value="video">4. 영상</TabsTrigger>
            <TabsTrigger value="upload">5. 업로드</TabsTrigger>
          </TabsList>

          {/* Step 1: Script + assets + scene split */}
          <TabsContent value="script" className="space-y-6 mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="border hairline lg:col-span-2">
                <CardContent className="py-6 space-y-4">
                  <div>
                    <p className="font-serif text-xl">대본 입력 & 장면 분리</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      자연스러운 한국어 대본을 입력하면 장면(Scene) 단위로 자동 분리됩니다.
                    </p>
                  </div>
                  <Textarea
                    rows={14}
                    placeholder={`예시: 봄날 아침, 햇살이 쏟아지는 카페. 한 여성이 비타민C 세럼을 들고 손등에 펴 바른다...`}
                    value={script}
                    onChange={e => setScript(e.target.value)}
                  />
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-muted-foreground">{script.length} 자</span>
                    <Button
                      onClick={() => analyzeMutation.mutate({ projectId, script })}
                      disabled={analyzeMutation.isPending || script.trim().length < 10}
                    >
                      {analyzeMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Wand2 className="h-4 w-4" />
                      )}
                      장면 분리 실행
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="border hairline">
                <CardContent className="py-6 space-y-5">
                  <div>
                    <p className="font-serif text-xl">참고 자산</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      판매할 제품 사진과 참고용 인물 사진을 업로드하세요.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label>제품 사진</Label>
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={e => handleAssetUpload("product", e.target.files?.[0] ?? null)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>참고 인물 사진</Label>
                    <Input
                      type="file"
                      accept="image/*"
                      onChange={e => handleAssetUpload("person", e.target.files?.[0] ?? null)}
                    />
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                      업로드된 자산
                    </p>
                    {assets.length === 0 ? (
                      <p className="text-xs text-muted-foreground">아직 업로드된 자산이 없습니다.</p>
                    ) : (
                      <ul className="space-y-2">
                        {assets.map(a => (
                          <li key={a.id} className="flex items-center gap-3 border hairline rounded-md p-2">
                            <img src={a.url} alt={a.filename ?? ""} className="h-10 w-10 object-cover rounded" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium truncate">{a.filename}</p>
                              <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                                {a.kind === "product" ? "제품" : "인물"}
                              </p>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              onClick={() => removeAssetMutation.mutate({ assetId: a.id })}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Step 2 + 3: Prompt + Image generation per scene */}
          <TabsContent value="prompt" className="space-y-4 mt-6">
            <SceneList
              scenes={scenes}
              projectAspect={project.aspectRatio}
              variant="prompt"
              onAfterChange={refresh}
            />
          </TabsContent>

          <TabsContent value="image" className="space-y-4 mt-6">
            <Card className="border hairline">
              <CardContent className="py-4 flex items-center gap-4">
                <Layers className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm">
                  이미지 생성 진행률: <strong>{Math.round(generateProgress)}%</strong> · 준비 {scenes.filter(s => s.imageStatus === "ready").length}/{scenes.length}
                </p>
              </CardContent>
            </Card>
            <SceneList
              scenes={scenes}
              projectAspect={project.aspectRatio}
              variant="image"
              onAfterChange={refresh}
            />
          </TabsContent>

          {/* Step 4: Video generation */}
          <TabsContent value="video" className="space-y-4 mt-6">
            <Card className="border hairline">
              <CardContent className="py-4 flex items-center gap-4">
                <Film className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm">
                  영상 생성 진행률: <strong>{Math.round(videoProgress)}%</strong> · 준비 {scenes.filter(s => s.videoStatus === "ready").length}/{scenes.length}
                </p>
              </CardContent>
            </Card>
            <SceneList
              scenes={scenes}
              projectAspect={project.aspectRatio}
              variant="video"
              onAfterChange={refresh}
            />
          </TabsContent>

          {/* Step 5: Upload */}
          <TabsContent value="upload" className="space-y-4 mt-6">
            <UploadPanel
              projectId={projectId}
              uploads={uploads}
              defaultPlatforms={(project.targetPlatforms as PlatformId[] | null) ?? undefined}
              onAfterChange={refresh}
            />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

/* -------------------------------------------------------------------------- */
/* Scene list                                                                 */
/* -------------------------------------------------------------------------- */

function SceneList({
  scenes,
  projectAspect,
  variant,
  onAfterChange,
}: {
  scenes: SceneRow[];
  projectAspect: string;
  variant: "prompt" | "image" | "video";
  onAfterChange: () => void;
}) {
  if (scenes.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-14 text-center text-sm text-muted-foreground space-y-2">
          <p className="font-serif text-lg">장면이 아직 없습니다</p>
          <p>먼저 1단계에서 대본을 입력하고 장면을 분리해 주세요.</p>
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {scenes.map(s => (
        <SceneCard
          key={s.id}
          scene={s}
          projectAspect={projectAspect}
          variant={variant}
          onAfterChange={onAfterChange}
        />
      ))}
    </div>
  );
}

function SceneCard({
  scene,
  projectAspect,
  variant,
  onAfterChange,
}: {
  scene: SceneRow;
  projectAspect: string;
  variant: "prompt" | "image" | "video";
  onAfterChange: () => void;
}) {
  const generatePromptM = trpc.scenes.generatePrompt.useMutation({
    onSuccess: () => { toast.success("프롬프트 생성"); onAfterChange(); },
    onError: e => toast.error(e.message),
  });
  const updatePromptM = trpc.scenes.updatePrompt.useMutation({
    onSuccess: () => { toast.success("프롬프트 저장"); onAfterChange(); },
    onError: e => toast.error(e.message),
  });
  const generateImageM = trpc.scenes.generateImage.useMutation({
    onSuccess: () => { toast.success("이미지 생성 완료"); onAfterChange(); },
    onError: e => toast.error(e.message),
  });
  const upscaleM = trpc.scenes.upscaleImage.useMutation({
    onSuccess: () => { toast.success("Topaz 업스케일 적용"); onAfterChange(); },
    onError: e => toast.error(e.message),
  });
  const generateVideoM = trpc.scenes.generateVideo.useMutation({
    onSuccess: () => { toast.success("영상 생성 완료"); onAfterChange(); },
    onError: e => toast.error(e.message),
  });

  const [prompt, setPrompt] = useState(scene.imagePrompt ?? "");
  const recommended: ImageModelId = recommendImageModel({
    hasProduct: !!(scene.visualElements as { products?: string[] })?.products?.length,
    hasPerson: !!(scene.visualElements as { characters?: string[] })?.characters?.length,
    closeUp: (scene.cameraAngle ?? "").includes("클로즈업"),
  });
  const [imageModel, setImageModel] = useState<ImageModelId>(
    (scene.imageModel as ImageModelId | null) ?? recommended
  );
  const [videoModel, setVideoModel] = useState<VideoModelId>(
    (scene.videoModel as VideoModelId | null) ?? "Kling 2.6"
  );
  const [duration, setDuration] = useState<number>(scene.videoDuration ?? 6);

  const ve = (scene.visualElements as {
    characters?: string[];
    backgrounds?: string[];
    props?: string[];
    products?: string[];
    actions?: string[];
  } | null) ?? null;

  return (
    <Card className="border hairline">
      <CardContent className="py-5 space-y-4">
        <header className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              Scene {scene.sceneIndex}
            </p>
            <p className="font-serif text-lg leading-tight mt-0.5 line-clamp-2">
              {scene.scriptExcerpt || "(빈 장면)"}
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            {scene.mood && <Badge variant="secondary" className="text-[10px]">{scene.mood}</Badge>}
            {scene.cameraAngle && (
              <Badge variant="outline" className="text-[10px]">{scene.cameraAngle}</Badge>
            )}
          </div>
        </header>

        {ve && variant === "prompt" && (
          <div className="grid grid-cols-2 gap-2 text-[11px]">
            <KV label="인물" value={ve.characters} />
            <KV label="배경" value={ve.backgrounds} />
            <KV label="소품" value={ve.props} />
            <KV label="제품" value={ve.products} />
            <KV label="행동" value={ve.actions} />
          </div>
        )}

        {variant === "prompt" && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                Krea AI 영어 프롬프트
              </Label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => generatePromptM.mutate({ sceneId: scene.id })}
                disabled={generatePromptM.isPending}
              >
                {generatePromptM.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Sparkles className="h-3 w-3" />
                )}
                자동 생성
              </Button>
            </div>
            <Textarea
              rows={5}
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              placeholder="자동 생성을 누르면 영어 프롬프트가 채워집니다."
              className="font-mono text-xs"
            />
            <div className="flex justify-between items-center">
              <span className="text-[10px] text-muted-foreground">화면 비율 {projectAspect}</span>
              <Button
                size="sm"
                onClick={() =>
                  updatePromptM.mutate({ sceneId: scene.id, imagePrompt: prompt })
                }
                disabled={updatePromptM.isPending}
              >
                저장
              </Button>
            </div>
          </div>
        )}

        {variant === "image" && (
          <div className="space-y-3">
            <div className="rounded-md border hairline overflow-hidden bg-muted/40 aspect-square flex items-center justify-center">
              {scene.imageStatus === "generating" ? (
                <div className="text-muted-foreground text-sm flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> 이미지 생성 중…
                </div>
              ) : scene.imageUrl ? (
                <img src={scene.imageUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="text-muted-foreground text-sm flex flex-col items-center gap-2">
                  <ImageIcon className="h-5 w-5" />
                  <span>아직 이미지가 없습니다</span>
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Select value={imageModel} onValueChange={v => setImageModel(v as ImageModelId)}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {IMAGE_MODELS.map(m => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="flex-1"
                  onClick={() => generateImageM.mutate({ sceneId: scene.id, model: imageModel })}
                  disabled={!scene.imagePrompt || generateImageM.isPending}
                >
                  {generateImageM.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : scene.imageUrl ? (
                    <RefreshCw className="h-3 w-3" />
                  ) : (
                    <Sparkles className="h-3 w-3" />
                  )}
                  {scene.imageUrl ? "재생성" : "생성"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => upscaleM.mutate({ sceneId: scene.id })}
                  disabled={!scene.imageUrl || upscaleM.isPending}
                >
                  {scene.upscaled ? "업스케일됨" : "Topaz 업스케일"}
                </Button>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              추천 모델: <span className="font-medium">{recommended}</span>
              {scene.imageModel && ` · 사용: ${scene.imageModel}`}
            </p>
          </div>
        )}

        {variant === "video" && (
          <div className="space-y-3">
            <div className="rounded-md border hairline overflow-hidden bg-muted/40 aspect-video flex items-center justify-center">
              {scene.videoStatus === "generating" ? (
                <div className="text-muted-foreground text-sm flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> 영상 생성 중…
                </div>
              ) : scene.videoUrl ? (
                /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(scene.videoUrl) ? (
                  <video
                    src={scene.videoUrl}
                    poster={scene.imageUrl ?? undefined}
                    controls
                    playsInline
                    className="w-full h-full object-cover bg-black"
                  />
                ) : (
                  // Krea Image-to-Video API key가 미설정된 경우 시작 이미지를 포스터로 사용한다.
                  <div className="relative w-full h-full">
                    <img src={scene.videoUrl} alt="" className="w-full h-full object-cover" />
                    <div className="absolute bottom-2 right-2 text-[10px] uppercase tracking-widest bg-black/60 text-white px-2 py-1 rounded">
                      poster preview
                    </div>
                  </div>
                )
              ) : scene.imageUrl ? (
                <img src={scene.imageUrl} alt="" className="w-full h-full object-cover opacity-50" />
              ) : (
                <div className="text-muted-foreground text-sm flex flex-col items-center gap-2">
                  <Film className="h-5 w-5" />
                  <span>먼저 이미지를 생성하세요</span>
                </div>
              )}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Select value={videoModel} onValueChange={v => setVideoModel(v as VideoModelId)}>
                <SelectTrigger className="h-9 col-span-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VIDEO_MODELS.map(m => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={String(duration)} onValueChange={v => setDuration(Number(v))}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[5, 6, 8, 10, 12].map(d => (
                    <SelectItem key={d} value={String(d)}>
                      {d}초
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              size="sm"
              className="w-full"
              disabled={!scene.imageUrl || generateVideoM.isPending}
              onClick={() => generateVideoM.mutate({ sceneId: scene.id, model: videoModel, durationSec: duration })}
            >
              {generateVideoM.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Film className="h-3 w-3" />
              )}
              {scene.videoUrl ? "영상 재생성" : "영상 생성"}
            </Button>
            <p className="text-[11px] text-muted-foreground">
              {scene.videoModel ? `사용 모델: ${scene.videoModel}` : "선택한 모델로 영상이 생성됩니다."}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function KV({ label, value }: { label: string; value?: string[] }) {
  if (!value || value.length === 0) return null;
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className="text-[11px]">{value.join(", ")}</p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Upload panel                                                               */
/* -------------------------------------------------------------------------- */

function UploadPanel({
  projectId,
  uploads,
  onAfterChange,
  defaultPlatforms,
}: {
  projectId: number;
  uploads: Array<{
    id: number;
    platform: string;
    status: "pending" | "uploading" | "success" | "failed";
    caption: string | null;
    hashtags: string | null;
    externalUrl: string | null;
    createdAt: Date;
  }>;
  onAfterChange: () => void;
  defaultPlatforms?: PlatformId[];
}) {
  const [selected, setSelected] = useState<PlatformId[]>(
    defaultPlatforms && defaultPlatforms.length > 0
      ? defaultPlatforms
      : ["TikTok", "Instagram", "YouTube"],
  );
  const [caption, setCaption] = useState("");
  const [hashtags, setHashtags] = useState("");
  const [uploadPostUser, setUploadPostUser] = useState("");

  const createUploadsM = trpc.uploads.create.useMutation({
    onSuccess: rows => {
      toast.success("업로드 작업이 생성되었습니다");
      onAfterChange();
      // Auto-run the new uploads, passing Upload-Post user when provided.
      rows.forEach(r =>
        runUploadM.mutate({
          uploadId: r.id,
          uploadPostUser: uploadPostUser.trim() || undefined,
        }),
      );
    },
    onError: e => toast.error(e.message),
  });

  const runUploadM = trpc.uploads.run.useMutation({
    onSuccess: () => onAfterChange(),
    onError: e => toast.error(e.message),
  });

  const togglePlatform = (id: PlatformId) => {
    setSelected(prev => (prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]));
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <Card className="border hairline lg:col-span-2">
        <CardContent className="py-6 space-y-5">
          <div>
            <p className="font-serif text-xl">SNS 멀티 플랫폼 일괄 업로드</p>
            <p className="text-xs text-muted-foreground mt-1">
              업로드할 플랫폼을 선택하고 캡션과 해시태그를 입력하세요.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {PLATFORMS.map(p => {
              const checked = selected.includes(p.id);
              return (
                <label
                  key={p.id}
                  className={[
                    "flex items-start gap-3 rounded-lg border p-4 cursor-pointer transition",
                    checked ? "border-primary bg-secondary/40" : "hairline hover:bg-muted/40",
                  ].join(" ")}
                >
                  <Checkbox checked={checked} onCheckedChange={() => togglePlatform(p.id)} />
                  <div>
                    <p className="font-serif text-base leading-tight">{p.label}</p>
                    <p className="text-[11px] text-muted-foreground">{p.description}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">권장 비율: {p.recommendedAspect}</p>
                  </div>
                </label>
              );
            })}
          </div>

          <div className="space-y-2">
            <Label htmlFor="caption">캡션</Label>
            <Textarea id="caption" rows={3} value={caption} onChange={e => setCaption(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="hashtags">해시태그</Label>
            <Input
              id="hashtags"
              value={hashtags}
              onChange={e => setHashtags(e.target.value)}
              placeholder="#비타민C #스킨케어 #shorts"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="uploadPostUser">Upload-Post 사용자 ID (선택)</Label>
            <Input
              id="uploadPostUser"
              value={uploadPostUser}
              onChange={e => setUploadPostUser(e.target.value)}
              placeholder="upload-post.com에서 연결한 사용자닉네임"
            />
            <p className="text-[11px] text-muted-foreground">
              비워두면 시뮬레이션으로 완료됩니다. API 설정에서 Upload-Post API 키와 함께 설정하면 실제 디스패치됩니다.
            </p>
          </div>
          <div className="pt-2 flex justify-end">
            <Button
              size="lg"
              onClick={() =>
                createUploadsM.mutate({
                  projectId,
                  platforms: selected,
                  caption: caption || undefined,
                  hashtags: hashtags || undefined,
                })
              }
              disabled={selected.length === 0 || createUploadsM.isPending}
            >
              {createUploadsM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              일괄 업로드 시작
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border hairline">
        <CardContent className="py-6 space-y-4">
          <p className="font-serif text-xl">업로드 상태 표시</p>
          {uploads.length === 0 ? (
            <p className="text-xs text-muted-foreground">아직 업로드 기록이 없습니다.</p>
          ) : (
            <ul className="space-y-3">
              {uploads.map(u => (
                <li key={u.id} className="border hairline rounded-md p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{normalizePlatformId(u.platform) ?? u.platform}</span>
                    <StatusBadge status={u.status} />
                  </div>
                  <p className="text-[10px] text-muted-foreground">{new Date(u.createdAt).toLocaleString()}</p>
                  {u.externalUrl && (
                    <a
                      href={u.externalUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="text-[11px] underline underline-offset-2 inline-flex items-center gap-1"
                    >
                      <Send className="h-3 w-3" /> 작업 보기
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatusBadge({ status }: { status: "pending" | "uploading" | "success" | "failed" }) {
  const map = {
    pending: { label: "대기", cls: "bg-muted text-muted-foreground" },
    uploading: { label: "업로드 중", cls: "bg-accent/30 text-accent-foreground" },
    success: { label: "완료", cls: "bg-emerald-100 text-emerald-800" },
    failed: { label: "실패", cls: "bg-destructive/15 text-destructive" },
  } as const;
  const m = map[status];
  return (
    <span className={`text-[10px] uppercase tracking-[0.2em] px-2 py-0.5 rounded-full ${m.cls}`}>
      {m.label}
    </span>
  );
}
