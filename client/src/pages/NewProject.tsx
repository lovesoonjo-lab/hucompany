import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { PLATFORMS, type PlatformId } from "@shared/catalog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Sparkles } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

export default function NewProject() {
  const [, setLocation] = useLocation();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [aspectRatio, setAspectRatio] = useState<"9:16" | "16:9" | "1:1">("9:16");
  const [platforms, setPlatforms] = useState<PlatformId[]>(["TikTok", "Instagram", "YouTube"]);

  const togglePlatform = (id: PlatformId) =>
    setPlatforms(prev => (prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]));

  const createMutation = trpc.projects.create.useMutation({
    onSuccess: project => {
      toast.success("프로젝트가 생성되었습니다");
      setLocation(`/projects/${project.id}`);
    },
    onError: e => toast.error(e.message),
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("제목을 입력해 주세요");
      return;
    }
    if (platforms.length === 0) {
      toast.error("하나 이상의 타깃 플랫폼을 선택해 주세요");
      return;
    }
    createMutation.mutate({
      title: title.trim(),
      description: description.trim() || undefined,
      aspectRatio,
      targetPlatforms: platforms,
    });
  };

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-3xl space-y-8 py-2">
        <button
          onClick={() => setLocation("/projects")}
          className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-2"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> 프로젝트로 돌아가기
        </button>
        <header>
          <p className="uppercase tracking-[0.28em] text-[11px] text-muted-foreground">New Project</p>
          <h1 className="font-serif text-3xl md:text-4xl mt-1">새 프로젝트</h1>
          <div className="gold-divider w-20 mt-3" />
          <p className="text-sm text-muted-foreground mt-3">
            영상 제작의 첫 걸음입니다. 제목과 화면 비율을 정한 뒤, 다음 단계에서 대본을 입력하고
            장면을 자동 분리할 수 있습니다.
          </p>
        </header>

        <Card className="border hairline">
          <CardContent className="py-7">
            <form onSubmit={onSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="title">프로젝트 제목</Label>
                <Input
                  id="title"
                  placeholder="예: 올봄 비타민C 세럼 신제품 런칭"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  maxLength={120}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="desc">설명 (선택)</Label>
                <Textarea
                  id="desc"
                  placeholder="제품, 타깃 고객, 브랜드 톤 등 간단한 메모"
                  rows={3}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>화면 비율</Label>
                <Select value={aspectRatio} onValueChange={v => setAspectRatio(v as "9:16" | "16:9" | "1:1")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="9:16">9:16 — 쇼츠 / 릴스 / 틱톡</SelectItem>
                    <SelectItem value="16:9">16:9 — 일반 가로 영상</SelectItem>
                    <SelectItem value="1:1">1:1 — 정사각형</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>타깃 플랫폼</Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                  {PLATFORMS.map(p => {
                    const checked = platforms.includes(p.id);
                    return (
                      <label
                        key={p.id}
                        className={`flex items-start gap-3 p-3 rounded-md border hairline cursor-pointer transition-colors ${
                          checked ? "bg-accent/40 border-foreground/30" : "hover:bg-muted/40"
                        }`}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => togglePlatform(p.id)}
                          className="mt-0.5"
                        />
                        <div className="min-w-0">
                          <div className="text-sm font-medium">{p.label}</div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">{p.description}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  선택된 플랫폼은 5단계 SNS 멀티 플랫폼 일괄 업로드 단계에서 기본 대상이 됩니다.
                </p>
              </div>

              <div className="pt-2 flex justify-end">
                <Button type="submit" size="lg" disabled={createMutation.isPending}>
                  <Sparkles className="h-4 w-4" />
                  {createMutation.isPending ? "생성 중…" : "프로젝트 만들기"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
