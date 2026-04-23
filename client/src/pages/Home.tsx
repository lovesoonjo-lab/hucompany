import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { ArrowRight, Film, Loader2, Plus, Sparkles } from "lucide-react";
import { useLocation } from "wouter";
import { PIPELINE_STEPS } from "@shared/catalog";

const STATUS_LABEL: Record<string, string> = {
  draft: "준비",
  analyzing: "장면 분리 중",
  prompting: "프롬프트 생성",
  imaging: "이미지 생성",
  video: "영상 변환",
  uploading: "업로드 중",
  done: "완료",
};

export default function Home() {
  const [, setLocation] = useLocation();
  const projectsQuery = trpc.projects.list.useQuery();

  const projects = projectsQuery.data ?? [];

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-7xl space-y-12 py-2">
        {/* Hero */}
        <section className="bg-linen rounded-2xl border hairline px-8 py-12 md:px-14 md:py-16 relative overflow-hidden">
          <div className="absolute inset-y-0 right-0 w-1/3 hidden md:block opacity-60">
            <div className="h-full w-full bg-gradient-to-l from-accent/30 via-accent/10 to-transparent" />
          </div>
          <div className="relative max-w-2xl space-y-6">
            <p className="uppercase tracking-[0.32em] text-xs text-muted-foreground">
              Shopping Shorts Auto Creator
            </p>
            <h1 className="font-serif text-4xl md:text-5xl leading-tight tracking-tight">
              대본 한 줄에서<br />완성된 쇼핑 영상까지.
            </h1>
            <div className="gold-divider w-24" />
            <p className="text-base text-muted-foreground leading-relaxed max-w-xl">
              스크립트를 입력하면 AI가 장면을 자동으로 분리하고, Krea AI 모델 군으로 이미지·영상을
              제작한 뒤 TikTok, Instagram, YouTube, Facebook에 일괄 업로드합니다.
            </p>
            <div className="flex flex-wrap gap-3 pt-2">
              <Button size="lg" onClick={() => setLocation("/projects/new")}>
                <Sparkles className="h-4 w-4" />
                새 프로젝트 시작하기
              </Button>
              <Button size="lg" variant="outline" onClick={() => setLocation("/projects")}>
                프로젝트 보기
              </Button>
            </div>
          </div>
        </section>

        {/* Pipeline overview */}
        <section className="space-y-5">
          <div className="flex items-end justify-between">
            <div>
              <p className="uppercase tracking-[0.28em] text-[11px] text-muted-foreground">Pipeline</p>
              <h2 className="font-serif text-2xl md:text-3xl mt-1">5단계 자동화 파이프라인</h2>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            {PIPELINE_STEPS.map(step => (
              <Card key={step.id} className="border hairline shadow-none">
                <CardContent className="pt-6 pb-5">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-full bg-secondary flex items-center justify-center font-serif">
                      {step.id}
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                        Step {step.id}
                      </p>
                      <p className="font-serif text-base leading-tight">{step.title}</p>
                    </div>
                  </div>
                  <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                    {step.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* Recent projects */}
        <section className="space-y-5">
          <div className="flex items-end justify-between">
            <div>
              <p className="uppercase tracking-[0.28em] text-[11px] text-muted-foreground">Library</p>
              <h2 className="font-serif text-2xl md:text-3xl mt-1">최근 프로젝트</h2>
            </div>
            <Button variant="ghost" onClick={() => setLocation("/projects")}>
              전체 보기 <ArrowRight className="h-4 w-4" />
            </Button>
          </div>

          {projectsQuery.isLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" /> 불러오는 중…
            </div>
          ) : projects.length === 0 ? (
            <Card className="border-dashed">
              <CardContent className="py-14 text-center space-y-4">
                <div className="mx-auto h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                  <Film className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="font-serif text-xl">아직 프로젝트가 없습니다</p>
                <p className="text-sm text-muted-foreground">
                  대본을 입력하고 첫 번째 쇼핑 숏폼을 만들어 보세요.
                </p>
                <Button onClick={() => setLocation("/projects/new")}>
                  <Plus className="h-4 w-4" /> 새 프로젝트
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.slice(0, 6).map(p => (
                <button
                  key={p.id}
                  onClick={() => setLocation(`/projects/${p.id}`)}
                  className="text-left group"
                >
                  <Card className="border hairline transition-all group-hover:shadow-md group-hover:border-accent/50">
                    <CardContent className="py-5 space-y-3">
                      <div className="flex items-center justify-between">
                        <Badge variant="secondary" className="font-mono text-[10px]">
                          {p.aspectRatio}
                        </Badge>
                        <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                          {STATUS_LABEL[p.status] ?? p.status}
                        </span>
                      </div>
                      <p className="font-serif text-xl leading-tight line-clamp-2">{p.title}</p>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {p.description || "설명 없음"}
                      </p>
                      <div className="gold-divider w-12 opacity-50" />
                      <p className="text-[11px] text-muted-foreground">
                        {new Date(p.updatedAt).toLocaleString()}
                      </p>
                    </CardContent>
                  </Card>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </DashboardLayout>
  );
}
