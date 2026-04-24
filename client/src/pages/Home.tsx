import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { trpc } from "@/lib/trpc";
import { ArrowRight, Film, Loader2, Plus, Sparkles } from "lucide-react";
import { useLocation } from "wouter";
import { PIPELINE_STEPS } from "@shared/catalog";
import { toast } from "sonner";

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
  const utils = trpc.useUtils();
  const projectsQuery = trpc.projects.list.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: false,
  });
  const removeMutation = trpc.projects.remove.useMutation({
    onSuccess: () => {
      toast.success("프로젝트가 삭제되었습니다");
      utils.projects.list.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const projects = projectsQuery.data ?? [];

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-7xl space-y-12 py-2">
        {/* Hero */}
        <section className="bg-linen rounded-2xl border hairline px-8 py-8 md:px-14 md:py-10 relative overflow-hidden">
          <div className="absolute inset-y-0 right-0 w-1/3 hidden md:block opacity-60">
            <div className="h-full w-full bg-gradient-to-l from-accent/30 via-accent/10 to-transparent" />
          </div>
          <div className="relative max-w-2xl space-y-6">
            <div className="space-y-2">
              <p className="uppercase tracking-[0.32em] text-xl text-muted-foreground">
                HUCOMPANY
              </p>
              <h1 className="font-serif text-4xl md:text-5xl leading-tight tracking-tight">
                Shopping Shorts
              </h1>
            </div>
            <div className="gold-divider w-24" />
            <p className="text-base text-muted-foreground leading-relaxed max-w-xl">
              나는 할수 있다. 나는 할수 있다. 나는 할수 있다. 반드시 100억을 만들자.
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
          <div className="grid grid-cols-5 gap-3">
            {PIPELINE_STEPS.map(step => (
              <Card key={step.id} className="border hairline shadow-none">
                <CardContent className="px-4 py-2.5 min-h-[74px] flex items-center justify-start">
                  <div className="flex w-full items-center gap-3 justify-start">
                    <div className="h-7 w-7 shrink-0 rounded-full bg-secondary flex items-center justify-center font-serif text-xs">
                      {step.id}
                    </div>
                    <div className="min-w-0 w-full text-left">
                      <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground leading-none">
                        Step {step.id}
                      </p>
                      <p className="font-serif text-sm leading-tight whitespace-nowrap overflow-hidden text-ellipsis mt-1">
                        {step.title}
                      </p>
                    </div>
                  </div>
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
          ) : projectsQuery.isError ? (
            <Card className="border-dashed">
              <CardContent className="py-14 text-center space-y-3">
                <p className="font-serif text-xl">최근 프로젝트를 불러오지 못했습니다</p>
                <p className="text-sm text-muted-foreground">
                  DB 연결 상태를 확인한 뒤 다시 시도해주세요.
                </p>
                <Button variant="outline" onClick={() => projectsQuery.refetch()}>
                  다시 시도
                </Button>
              </CardContent>
            </Card>
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 justify-items-start">
              {projects.slice(0, 6).map(p => (
                <div key={p.id} className="relative group w-full max-w-[320px]">
                  <div className="absolute top-2 right-2 z-10">
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-6 px-2 text-[10px] leading-none text-muted-foreground hover:text-destructive"
                          onClick={e => e.stopPropagation()}
                        >
                          삭제
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>프로젝트를 삭제할까요?</AlertDialogTitle>
                          <AlertDialogDescription>
                            삭제하면 장면, 자산, 업로드 기록을 모두 잃게 됩니다. 이 작업은 되돌릴 수 없습니다.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>취소</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => removeMutation.mutate({ projectId: p.id })}
                            className="bg-destructive text-white hover:bg-destructive/90"
                          >
                            삭제
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                  <Card className="border hairline transition-all group-hover:shadow-md group-hover:border-accent/50">
                    <CardContent className="px-4 py-2.5 min-h-[74px] space-y-2">
                      <div className="flex items-start justify-between gap-2 pr-14">
                        <Badge variant="secondary" className="font-mono text-[10px]">
                          {p.aspectRatio}
                        </Badge>
                        <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                          {STATUS_LABEL[p.status] ?? p.status}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setLocation(`/projects/${p.id}`)}
                        className="text-left w-full"
                      >
                        <p className="font-serif text-base leading-tight line-clamp-1 hover:underline">{p.title}</p>
                      </button>
                      <p className="text-xs text-muted-foreground line-clamp-1">
                        {p.description || "설명 없음"}
                      </p>
                      <div className="gold-divider w-12 opacity-50" />
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(p.updatedAt).toLocaleString()}
                      </p>
                    </CardContent>
                  </Card>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </DashboardLayout>
  );
}
