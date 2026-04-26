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
  type ImageModelId,
  type VideoModelId,
} from "@shared/catalog";
import { parseSceneFields, stripVideoActionLines } from "@shared/scriptSceneParse";
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
  ChevronLeft,
  ChevronRight,
  Square,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useRoute } from "wouter";
import { toast } from "sonner";

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

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

/* -------------------------------------------------------------------------- */
/* Constants                                                                   */
/* -------------------------------------------------------------------------- */

const SUBTITLE_FONT_OPTIONS = [
  { label: "Pretendard", value: "Pretendard" },
  { label: "Noto Sans KR", value: "Noto Sans KR" },
  { label: "Nanum Gothic", value: "Nanum Gothic" },
  { label: "Nanum Myeongjo", value: "Nanum Myeongjo" },
  { label: "Black Han Sans", value: "Black Han Sans" },
  { label: "Do Hyeon", value: "Do Hyeon" },
  { label: "Jua", value: "Jua" },
  { label: "Gothic A1", value: "Gothic A1" },
  { label: "IBM Plex Sans KR", value: "IBM Plex Sans KR" },
  { label: "Gowun Dodum", value: "Gowun Dodum" },
];

const SUBTITLE_FONT_STACKS: Record<string, string> = {
  Pretendard: "Pretendard, sans-serif",
  "Noto Sans KR": '"Noto Sans KR", sans-serif',
  "Nanum Gothic": '"Nanum Gothic", sans-serif',
  "Nanum Myeongjo": '"Nanum Myeongjo", serif',
  "Black Han Sans": '"Black Han Sans", sans-serif',
  "Do Hyeon": '"Do Hyeon", sans-serif',
  Jua: '"Jua", sans-serif',
  "Gothic A1": '"Gothic A1", sans-serif',
  "IBM Plex Sans KR": '"IBM Plex Sans KR", sans-serif',
  "Gowun Dodum": '"Gowun Dodum", sans-serif',
};

const SUBTITLE_SIZE_OPTIONS = [32, 36, 40, 44, 48, 52, 56, 60, 64, 68, 72, 76, 80, 90, 100, 110, 120, 130, 140];

const SUBTITLE_LINE_OPTIONS = [
  { label: "1줄", value: 1 },
  { label: "2줄", value: 2 },
  { label: "3줄", value: 3 },
];

const SUBTITLE_POSITION_OPTIONS = [
  { label: "하단 70%", value: "70" },
  { label: "하단 75%", value: "75" },
  { label: "하단 80%", value: "80" },
  { label: "하단 85%", value: "85" },
  { label: "하단 90%", value: "90" },
  { label: "하단 95%", value: "95" },
];

const TEXT_COLOR_OPTIONS = [
  { label: "흰색",   value: "#ffffff" },
  { label: "노랑",   value: "#FFD700" },
  { label: "청록",   value: "#00CED1" },
  { label: "보라",   value: "#9370DB" },
  { label: "핑크",   value: "#FF69B4" },
  { label: "주황",   value: "#FF8C00" },
  { label: "검정",   value: "#1a1a1a" },
];

// rgb components only — opacity applied separately via slider
const BG_COLOR_PRESETS = [
  { label: "투명",       rgb: null,        defaultOpacity: 0  },
  { label: "반투명 검정", rgb: "0,0,0",     defaultOpacity: 50 },
  { label: "반투명 토색", rgb: "100,80,50", defaultOpacity: 60 },
  { label: "진한 검정",  rgb: "0,0,0",     defaultOpacity: 90 },
  { label: "반투명 파랑", rgb: "0,80,200",  defaultOpacity: 50 },
];

/* -------------------------------------------------------------------------- */
/* Helpers                                                                     */
/* -------------------------------------------------------------------------- */

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

function getSubtitlePositionStyle(positionPct: string): React.CSSProperties {
  // positionPct is "70"~"95" → subtitle bottom is at (100-N)% from bottom
  const pct = parseInt(positionPct);
  if (!isNaN(pct)) {
    return {
      bottom: `${100 - pct}%`,
      left: "50%",
      transform: "translateX(-50%)",
      textAlign: "center",
      whiteSpace: "pre-line",
    };
  }
  return { bottom: "8%", left: "50%", transform: "translateX(-50%)", textAlign: "center" };
}

/* -------------------------------------------------------------------------- */
/* Main Page                                                                   */
/* -------------------------------------------------------------------------- */

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
  const [analyzeProgress, setAnalyzeProgress] = useState(0);

  // Global model selectors
  const [globalImageModel, setGlobalImageModel] = useState<ImageModelId>("Krea 1");
  const [globalVideoModel, setGlobalVideoModel] = useState<VideoModelId>("Kling 2.6");

  // Subtitle tab state
  const [subtitleFont, setSubtitleFont] = useState("Pretendard");
  const [subtitleSize, setSubtitleSize] = useState(48);
  const [subtitleLineCount, setSubtitleLineCount] = useState(2);
  const [subtitlePosition, setSubtitlePosition] = useState("90");
  const [subtitleTextColor, setSubtitleTextColor] = useState("#ffffff");
  const [subtitleBgRgb, setSubtitleBgRgb] = useState<string | null>("0,0,0");
  const [subtitleBgOpacity, setSubtitleBgOpacity] = useState(50);
  const [subtitleEditorSceneId, setSubtitleEditorSceneId] = useState<number | null>(null);
  const [subtitleDraftByScene, setSubtitleDraftByScene] = useState<Record<number, string>>({});
  const [subtitlePreviewSceneIdx, setSubtitlePreviewSceneIdx] = useState(0);

  const subtitleBgCss =
    subtitleBgRgb === null
      ? "transparent"
      : `rgba(${subtitleBgRgb},${subtitleBgOpacity / 100})`;
  const subtitleFontFamily =
    SUBTITLE_FONT_STACKS[subtitleFont] ?? `"${subtitleFont}", "Noto Sans KR", "Pretendard", sans-serif`;

  useMemo(() => {
    if (project?.script && !script) setScript(project.script);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project?.id]);

  useEffect(() => {
    if (typeof document === "undefined" || !subtitleFontFamily) return;

    // Ensure selected webfont is loaded before rendering preview text.
    void (document as Document & { fonts?: FontFaceSet }).fonts?.load(`16px ${subtitleFontFamily}`);
  }, [subtitleFontFamily]);

  const refresh = () => utils.projects.get.invalidate({ projectId });

  const analyzeMutation = trpc.scenes.analyze.useMutation({
    onSuccess: () => {
      toast.success("장면 분리가 완료되었습니다");
      refresh();
      setTab("image");
    },
    onError: e => {
      toast.error(e.message);
      setAnalyzeProgress(0);
    },
  });

  const cancelAnalyzeMutation = trpc.scenes.cancelAnalyze.useMutation({
    onSuccess: r => toast.info(r.message),
    onError: e => toast.error(e.message),
  });

  useEffect(() => {
    if (!analyzeMutation.isPending) {
      if (analyzeMutation.isSuccess) setAnalyzeProgress(100);
      return;
    }
    setAnalyzeProgress(5);
    const interval = setInterval(() => {
      setAnalyzeProgress(p => (p < 90 ? p + (90 - p) * 0.06 : p));
    }, 500);
    return () => clearInterval(interval);
  }, [analyzeMutation.isPending, analyzeMutation.isSuccess]);

  const uploadAssetMutation = trpc.assets.upload.useMutation({
    onSuccess: () => {
      toast.success("사진이 업로드되었습니다");
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

  const generateProgress =
    scenes.length === 0
      ? 0
      : (scenes.filter(s => s.imageStatus === "ready").length / scenes.length) * 100;
  const videoProgress =
    scenes.length === 0
      ? 0
      : (scenes.filter(s => s.videoStatus === "ready").length / scenes.length) * 100;

  const completed: Record<PipelineStage, boolean> = {
    script: !!project?.script && scenes.length > 0,
    subtitle: false,
    image: scenes.length > 0 && scenes.every(s => s.imageStatus === "ready"),
    video: scenes.length > 0 && scenes.every(s => s.videoStatus === "ready"),
    upload: uploads.length > 0 && uploads.every(u => u.status === "success"),
  };

  // Subtitle editor navigation
  const subtitleEditorIdx = scenes.findIndex(s => s.id === subtitleEditorSceneId);
  const canGoPrev = subtitleEditorIdx > 0;
  const canGoNext = subtitleEditorIdx >= 0 && subtitleEditorIdx < scenes.length - 1;

  const getSubtitleText = (scene: SceneRow) =>
    subtitleDraftByScene[scene.id] ||
    parseSceneFields(script || project?.script || "", scene.sceneIndex).subtitle ||
    scene.scriptExcerpt ||
    "";

  const previewScene = scenes[subtitlePreviewSceneIdx] ?? scenes[0];

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
              <span>사진 {assets.length}개</span>
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
            <TabsTrigger value="image">2. 이미지</TabsTrigger>
            <TabsTrigger value="video">3. 영상변환</TabsTrigger>
            <TabsTrigger value="subtitle">4. 오디오 / 자막생성</TabsTrigger>
            <TabsTrigger value="upload">5. 업로드</TabsTrigger>
          </TabsList>

          {/* ─── Step 1: 대본 ─────────────────────────────────────────── */}
          <TabsContent value="script" className="space-y-6 mt-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card className="border hairline lg:col-span-2">
                <CardContent className="py-6 space-y-4">
                  <div>
                    <p className="font-serif text-xl">대본 입력 &amp; 장면 분리</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      자연스러운 한국어 대본을 입력하면 장면(Scene) 단위로 자동 분리됩니다.
                    </p>
                  </div>
                  <Textarea
                    rows={14}
                    placeholder="예시: 봄날 아침, 햇살이 쏟아지는 카페. 한 여성이 비타민C 세럼을 들고 손등에 펴 바른다..."
                    value={script}
                    onChange={e => setScript(e.target.value)}
                  />
                  <div className="flex justify-between items-center gap-3">
                    {analyzeMutation.isPending ? (
                      <div className="flex items-center gap-3">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => cancelAnalyzeMutation.mutate({ projectId })}
                          disabled={cancelAnalyzeMutation.isPending}
                        >
                          <Square className="h-3 w-3" /> 중지
                        </Button>
                        <span className="text-xs text-muted-foreground">
                          {script.length} 자 · 진행률 {Math.round(analyzeProgress)}%
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">{script.length} 자</span>
                    )}
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
                  {analyzeMutation.isPending && (
                    <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all duration-500"
                        style={{ width: `${analyzeProgress}%` }}
                      />
                    </div>
                  )}
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
                      업로드된 사진
                    </p>
                    {assets.length === 0 ? (
                      <p className="text-xs text-muted-foreground">아직 업로드된 사진이 없습니다.</p>
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

          {/* ─── Step 2: 이미지 ───────────────────────────────────────── */}
          <TabsContent value="image" className="space-y-4 mt-6">
            <Card className="border hairline">
              <CardContent className="py-4 flex flex-wrap items-center gap-4">
                <Layers className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm">
                  이미지 생성 진행률: <strong>{Math.round(generateProgress)}%</strong> · 준비{" "}
                  {scenes.filter(s => s.imageStatus === "ready").length}/{scenes.length}
                </p>
                <div className="ml-auto flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground whitespace-nowrap">이미지 모델</Label>
                  <Select value={globalImageModel} onValueChange={v => setGlobalImageModel(v as ImageModelId)}>
                    <SelectTrigger className="h-8 w-[180px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {IMAGE_MODELS.map(m => (
                        <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
            {scenes.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-14 text-center text-sm text-muted-foreground space-y-2">
                  <p className="font-serif text-lg">장면이 아직 없습니다</p>
                  <p>먼저 1단계에서 대본을 입력하고 장면을 분리해 주세요.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {scenes.map(s => (
                  <ImageSceneCard
                    key={s.id}
                    scene={s}
                    projectAspect={project.aspectRatio}
                    projectScript={script || project.script || ""}
                    globalModel={globalImageModel}
                    onAfterChange={refresh}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* ─── Step 3: 영상변환 ─────────────────────────────────────── */}
          <TabsContent value="video" className="space-y-4 mt-6">
            <Card className="border hairline">
              <CardContent className="py-4 flex flex-wrap items-center gap-4">
                <Film className="h-4 w-4 text-muted-foreground" />
                <p className="text-sm">
                  영상 생성 진행률: <strong>{Math.round(videoProgress)}%</strong> · 준비{" "}
                  {scenes.filter(s => s.videoStatus === "ready").length}/{scenes.length}
                </p>
                <div className="ml-auto flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground whitespace-nowrap">동영상 모델</Label>
                  <Select value={globalVideoModel} onValueChange={v => setGlobalVideoModel(v as VideoModelId)}>
                    <SelectTrigger className="h-8 w-[180px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {VIDEO_MODELS.map(m => (
                        <SelectItem key={m.id} value={m.id}>{m.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
            {scenes.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-14 text-center text-sm text-muted-foreground space-y-2">
                  <p className="font-serif text-lg">장면이 아직 없습니다</p>
                  <p>먼저 1단계에서 대본을 입력하고 장면을 분리해 주세요.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {scenes.map(s => (
                  <VideoSceneCard
                    key={s.id}
                    scene={s}
                    projectScript={script || project.script || ""}
                    globalModel={globalVideoModel}
                    onAfterChange={refresh}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* ─── Step 4: 오디오 / 자막생성 ───────────────────────────── */}
          <TabsContent value="subtitle" className="space-y-4 mt-6">

            <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
              {/* 미리보기 카드 (쇼츠) */}
              <Card className="border hairline">
                <CardContent className="py-5">
                  <p className="text-sm font-semibold text-foreground mb-3">미리보기</p>
                  <div className="shrink-0 flex flex-col gap-2">
                    <div className="relative bg-white rounded-lg overflow-hidden border hairline w-[260px] h-[462px] mx-auto">
                      {previewScene?.imageUrl ? (
                        <img src={previewScene.imageUrl} alt="" className="w-full h-full object-cover opacity-70" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground/30 text-xs">
                          쇼츠 미리보기
                        </div>
                      )}
                      <div
                        className="absolute px-2 py-0.5 rounded pointer-events-none text-center"
                        style={{
                          ...getSubtitlePositionStyle(subtitlePosition),
                          position: "absolute",
                          fontFamily: subtitleFontFamily,
                          fontSize: `${Math.round(subtitleSize * 0.28)}px`,
                          color: subtitleTextColor,
                          backgroundColor: subtitleBgCss,
                          lineHeight: 1.4,
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                          display: "-webkit-box",
                          WebkitBoxOrient: "vertical",
                          WebkitLineClamp: subtitleLineCount,
                          overflow: "hidden",
                          maxWidth: "90%",
                        }}
                      >
                        {previewScene ? getSubtitleText(previewScene) || "자막 미리보기" : "자막 미리보기"}
                      </div>
                    </div>
                    {scenes.length > 1 && (
                      <div className="flex justify-center gap-1.5">
                        {scenes.map((s, idx) => (
                          <button
                            key={s.id}
                            onClick={() => setSubtitlePreviewSceneIdx(idx)}
                            className={[
                              "h-1.5 w-1.5 rounded-full transition-all",
                              idx === subtitlePreviewSceneIdx ? "bg-primary" : "bg-muted-foreground/30",
                            ].join(" ")}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* 글씨 설정 카드 */}
              <Card className="border hairline">
                <CardContent className="py-5">
                  <p className="text-sm font-semibold text-foreground mb-3">글씨 설정</p>
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">글씨폰트</Label>
                        <Select value={subtitleFont} onValueChange={setSubtitleFont}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {SUBTITLE_FONT_OPTIONS.map(f => (
                              <SelectItem key={f.value} value={f.value} style={{ fontFamily: `"${f.value}", "Noto Sans KR", "Pretendard", sans-serif` }}>
                                {f.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">글씨크기</Label>
                        <Select value={String(subtitleSize)} onValueChange={v => setSubtitleSize(Number(v))}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {SUBTITLE_SIZE_OPTIONS.map(s => (
                              <SelectItem key={s} value={String(s)}>{s}px</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>


                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">줄 수</Label>
                        <Select value={String(subtitleLineCount)} onValueChange={v => setSubtitleLineCount(Number(v))}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {SUBTITLE_LINE_OPTIONS.map(o => (
                              <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">위치</Label>
                        <Select value={subtitlePosition} onValueChange={setSubtitlePosition}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {SUBTITLE_POSITION_OPTIONS.map(p => (
                              <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {/* 글자색 (한 줄) */}
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">글자색</Label>
                      <div className="flex flex-wrap items-center gap-2">
                        {TEXT_COLOR_OPTIONS.map(c => (
                          <button
                            key={c.value}
                            title={c.label}
                            onClick={() => setSubtitleTextColor(c.value)}
                            className={[
                              "h-6 w-6 rounded-full border-2 transition-all",
                              subtitleTextColor === c.value ? "border-primary scale-110" : "border-border/40",
                            ].join(" ")}
                            style={{ backgroundColor: c.value }}
                          />
                        ))}
                      </div>
                    </div>

                    {/* 배경색 (한 줄) */}
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5">
                        <Label className="text-xs text-muted-foreground">배경색</Label>
                        {subtitleBgRgb !== null && (
                          <span className="text-[11px] text-muted-foreground border border-border/50 rounded px-1">{subtitleBgOpacity}%</span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {BG_COLOR_PRESETS.map(p => {
                          const isActive = p.rgb === null ? subtitleBgRgb === null : subtitleBgRgb === p.rgb;
                          return (
                            <button
                              key={p.label}
                              onClick={() => { setSubtitleBgRgb(p.rgb); setSubtitleBgOpacity(p.defaultOpacity); }}
                              className={[
                                "px-2 py-0.5 rounded text-[11px] border transition-all",
                                isActive ? "border-primary bg-primary/15 font-semibold" : "border-border/50",
                              ].join(" ")}
                            >
                              {p.label}
                            </button>
                          );
                        })}
                      </div>
                      {subtitleBgRgb !== null && (
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={subtitleBgOpacity}
                          onChange={e => setSubtitleBgOpacity(Number(e.target.value))}
                          className="w-1/2 h-1.5 accent-primary mt-1"
                        />
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* 장면별 오디오/자막 생성 */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-medium">
                <span>♪</span> 장면별 오디오/자막 생성
              </div>
              <span className="text-xs text-muted-foreground">총 {scenes.length}개 장면</span>
            </div>

            {/* Scene cards */}
            {scenes.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-14 text-center text-sm text-muted-foreground space-y-2">
                  <p className="font-serif text-lg">장면이 아직 없습니다</p>
                  <p>먼저 1단계에서 대본을 입력하고 장면을 분리해 주세요.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {scenes.map(s => (
                  <button
                    key={s.id}
                    className={[
                      "text-left rounded-lg border hairline p-3 space-y-1.5 transition hover:bg-muted/40",
                      subtitleEditorSceneId === s.id ? "border-primary bg-muted/30" : "",
                    ].join(" ")}
                    onClick={() => setSubtitleEditorSceneId(subtitleEditorSceneId === s.id ? null : s.id)}
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                        장면 {s.sceneIndex}
                      </p>
                      <span className="text-[10px] text-muted-foreground/60 border border-border/40 rounded px-1">
                        미생성
                      </span>
                    </div>
                    <p className="text-xs leading-snug line-clamp-3 text-foreground">
                      {getSubtitleText(s) || <span className="text-muted-foreground">(자막 없음)</span>}
                    </p>
                  </button>
                ))}
              </div>
            )}

            {/* Subtitle Editor */}
            {subtitleEditorSceneId !== null && scenes[subtitleEditorIdx] && (
              <Card className="border hairline mt-2">
                <CardContent className="py-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="icon-sm"
                        disabled={!canGoPrev}
                        onClick={() => setSubtitleEditorSceneId(scenes[subtitleEditorIdx - 1].id)}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-sm font-medium">
                        Scene {scenes[subtitleEditorIdx].sceneIndex} 자막 편집
                      </span>
                      <Button
                        variant="outline"
                        size="icon-sm"
                        disabled={!canGoNext}
                        onClick={() => setSubtitleEditorSceneId(scenes[subtitleEditorIdx + 1].id)}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setSubtitleEditorSceneId(null)}
                    >
                      ✕
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Preview */}
                    <div className="relative w-full aspect-[9/16] bg-white rounded-lg overflow-hidden border hairline max-w-[200px]">
                      {scenes[subtitleEditorIdx].imageUrl ? (
                        <img
                          src={scenes[subtitleEditorIdx].imageUrl!}
                          alt=""
                          className="w-full h-full object-cover opacity-80"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <ImageIcon className="h-6 w-6 text-muted-foreground/40" />
                        </div>
                      )}
                      <div
                        className="absolute px-2 py-0.5 rounded text-center pointer-events-none max-w-[90%]"
                        style={{
                          ...getSubtitlePositionStyle(subtitlePosition),
                          position: "absolute",
                          fontFamily: subtitleFontFamily,
                          fontSize: Math.max(subtitleSize * 0.6, 10),
                          color: subtitleTextColor,
                          backgroundColor: subtitleBgCss,
                          lineHeight: 1.4,
                          whiteSpace: "pre-wrap",
                          wordBreak: "break-word",
                          display: "-webkit-box",
                          WebkitBoxOrient: "vertical",
                          WebkitLineClamp: subtitleLineCount,
                          overflow: "hidden",
                        }}
                      >
                        {getSubtitleText(scenes[subtitleEditorIdx]) || "자막"}
                      </div>
                    </div>

                    {/* Text editor */}
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">자막 텍스트</Label>
                      <Textarea
                        rows={5}
                        value={
                          subtitleDraftByScene[scenes[subtitleEditorIdx].id] ||
                          parseSceneFields(script || project.script || "", scenes[subtitleEditorIdx].sceneIndex).subtitle ||
                          scenes[subtitleEditorIdx].scriptExcerpt ||
                          ""
                        }
                        onChange={e =>
                          setSubtitleDraftByScene(prev => ({
                            ...prev,
                            [scenes[subtitleEditorIdx].id]: e.target.value,
                          }))
                        }
                        placeholder="자막 텍스트를 입력하세요"
                        className="resize-none"
                        style={{ fontFamily: subtitleFontFamily }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* ─── Step 5: 업로드 ───────────────────────────────────────── */}
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
/* Image Scene Card                                                            */
/* -------------------------------------------------------------------------- */

function ImageSceneCard({
  scene,
  projectAspect,
  projectScript,
  globalModel,
  onAfterChange,
}: {
  scene: SceneRow;
  projectAspect: string;
  projectScript: string;
  globalModel: ImageModelId;
  onAfterChange: () => void;
}) {
  const generateImageM = trpc.scenes.generateImage.useMutation({
    onSuccess: () => { toast.success("이미지 생성 완료"); onAfterChange(); },
    onError: e => toast.error(e.message),
  });
  const updatePromptM = trpc.scenes.updatePrompt.useMutation({
    onSuccess: () => { toast.success("프롬프트 저장"); onAfterChange(); },
    onError: e => toast.error(e.message),
  });

  // 대본에서 Image Prompt 우선 추출, 없으면 DB 값 fallback
  const parsed = useMemo(
    () => parseSceneFields(projectScript, scene.sceneIndex),
    [projectScript, scene.sceneIndex]
  );
  const sourcePrompt = parsed.imagePrompt || stripVideoActionLines(scene.imagePrompt ?? "");
  const [prompt, setPrompt] = useState(sourcePrompt);

  // 대본 재분석 후 프롬프트 동기화
  useEffect(() => {
    setPrompt(parsed.imagePrompt || stripVideoActionLines(scene.imagePrompt ?? ""));
  }, [parsed.imagePrompt, scene.imagePrompt]);

  return (
    <Card className="border hairline">
      <CardContent className="py-4 space-y-3">
        <header className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              Scene {scene.sceneIndex}
            </p>
            <div className="mt-1 rounded-md border hairline bg-muted/20 px-2 py-1">
              <p className="font-serif text-sm leading-snug line-clamp-2">
                {scene.scriptExcerpt || "(빈 장면)"}
              </p>
            </div>
          </div>
        </header>

        {/* Preview */}
        <div className="rounded-md border hairline overflow-hidden bg-white aspect-[9/16] max-w-[180px] mx-auto flex items-center justify-center">
          {scene.imageStatus === "generating" ? (
            <div className="text-muted-foreground text-sm flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> 이미지 생성 중…
            </div>
          ) : scene.imageUrl ? (
            <img src={scene.imageUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="text-muted-foreground text-sm flex flex-col items-center gap-2">
              <ImageIcon className="h-5 w-5" />
              <span>미리보기 이미지가 아직 없습니다</span>
            </div>
          )}
        </div>

        {/* Image Prompt */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Image Prompt
            </Label>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-xs px-2"
              onClick={() =>
                updatePromptM.mutate({
                  sceneId: scene.id,
                  imagePrompt: stripVideoActionLines(prompt),
                })
              }
              disabled={updatePromptM.isPending}
            >
              저장
            </Button>
          </div>
          <Textarea
            rows={5}
            value={prompt}
            onChange={e => setPrompt(stripVideoActionLines(e.target.value))}
            placeholder="이미지 프롬프트가 여기에 표시됩니다."
            className="font-mono text-xs h-32 resize-none whitespace-pre-wrap break-all overflow-y-scroll"
          />
        </div>

        {/* Generate button */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            className="flex-1"
            onClick={() => generateImageM.mutate({ sceneId: scene.id, model: globalModel })}
            disabled={!scene.imagePrompt || generateImageM.isPending}
          >
            {generateImageM.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : scene.imageUrl ? (
              <RefreshCw className="h-3 w-3" />
            ) : (
              <Sparkles className="h-3 w-3" />
            )}
            {scene.imageUrl ? "재생성" : "이미지 생성"}
          </Button>
          <span className="text-[10px] text-muted-foreground whitespace-nowrap">
            {projectAspect}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Video Scene Card                                                            */
/* -------------------------------------------------------------------------- */

function VideoSceneCard({
  scene,
  projectScript,
  globalModel,
  onAfterChange,
}: {
  scene: SceneRow;
  projectScript: string;
  globalModel: VideoModelId;
  onAfterChange: () => void;
}) {
  const generateVideoM = trpc.scenes.generateVideo.useMutation({
    onSuccess: () => { toast.success("영상 생성 완료"); onAfterChange(); },
    onError: e => toast.error(e.message),
  });

  const [duration, setDuration] = useState<number>(scene.videoDuration ?? 6);

  // 통합 파서로 대본에서 Video Action 직접 추출
  const parsed = useMemo(
    () => parseSceneFields(projectScript, scene.sceneIndex),
    [projectScript, scene.sceneIndex]
  );
  const videoAction = parsed.videoAction;

  return (
    <Card className="border hairline">
      <CardContent className="py-4 space-y-3">
        <header className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
              Scene {scene.sceneIndex}
            </p>
            <div className="mt-1 rounded-md border hairline bg-muted/20 px-2 py-1">
              <p className="font-serif text-sm leading-snug line-clamp-2">
                {scene.scriptExcerpt || "(빈 장면)"}
              </p>
            </div>
          </div>
        </header>

        {/* Preview */}
        <div className="rounded-md border hairline overflow-hidden bg-white aspect-[9/16] max-w-[180px] mx-auto flex items-center justify-center">
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
              <div className="relative w-full h-full">
                <img src={scene.videoUrl} alt="" className="w-full h-full object-cover" />
                <div className="absolute bottom-2 right-2 text-[10px] uppercase tracking-widest bg-black/60 text-white px-2 py-1 rounded">
                  poster preview
                </div>
              </div>
            )
          ) : scene.imageUrl ? (
            <div className="relative w-full h-full">
              <img src={scene.imageUrl} alt="" className="w-full h-full object-cover opacity-60" />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xs text-white/80 bg-black/50 px-3 py-1.5 rounded">
                  미리보기 이미지가 아직 없습니다
                </span>
              </div>
            </div>
          ) : (
            <div className="text-muted-foreground text-sm flex flex-col items-center gap-2">
              <Film className="h-5 w-5" />
              <span>먼저 이미지를 생성하세요</span>
            </div>
          )}
        </div>

        {/* Video Action */}
        <div className="space-y-1">
          <Label className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
            Video Action
          </Label>
          <Textarea
            rows={2}
            value={videoAction}
            readOnly
            placeholder="대본에서 Video Action 내용이 표시됩니다."
            className="text-xs resize-none bg-muted/30"
          />
        </div>

        {/* Generate row */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            className="flex-1"
            disabled={!scene.imageUrl || generateVideoM.isPending}
            onClick={() =>
              generateVideoM.mutate({
                sceneId: scene.id,
                model: globalModel,
                durationSec: duration,
                videoAction: videoAction.trim() || undefined,
              })
            }
          >
            {generateVideoM.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Film className="h-3 w-3" />
            )}
            {scene.videoUrl ? "영상 재생성" : "영상 생성"}
          </Button>
          <Select value={String(duration)} onValueChange={v => setDuration(Number(v))}>
            <SelectTrigger className="h-8 w-[70px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[5, 6, 8, 10, 12].map(d => (
                <SelectItem key={d} value={String(d)}>{d}초</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}

/* -------------------------------------------------------------------------- */
/* Upload Panel                                                                */
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
            <Textarea id="caption" rows={2} value={caption} onChange={e => setCaption(e.target.value)} />
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
              {createUploadsM.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
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






