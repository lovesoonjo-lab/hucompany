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
import { Loader2, Plus } from "lucide-react";
import { useLocation } from "wouter";
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

export default function Projects() {
  const [, setLocation] = useLocation();
  const utils = trpc.useUtils();
  const projectsQuery = trpc.projects.list.useQuery();
  const updateMutation = trpc.projects.update.useMutation({
    onSuccess: () => {
      toast.success("프로젝트 이름이 수정되었습니다");
      utils.projects.list.invalidate();
    },
    onError: e => toast.error(e.message),
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
      <div className="mx-auto max-w-7xl space-y-8 py-2">
        <header className="flex items-end justify-between">
          <div>
            <p className="uppercase tracking-[0.28em] text-[11px] text-muted-foreground">HUCOMPANY</p>
            <h1 className="font-serif text-3xl md:text-4xl mt-1">프로젝트</h1>
            <p className="text-sm text-muted-foreground mt-2">
              모든 캠페인을 한곳에서 관리하세요. 각 프로젝트는 5단계 파이프라인을 따라 진행됩니다.
            </p>
          </div>
          <Button onClick={() => setLocation("/projects/new")}>
            <Plus className="h-4 w-4" /> 새 프로젝트
          </Button>
        </header>

        <div className="gold-divider w-full opacity-40" />

        {projectsQuery.isLoading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> 불러오는 중…
          </div>
        ) : projects.length === 0 ? (
          <Card className="border-dashed">
            <CardContent className="py-16 text-center space-y-3">
              <p className="font-serif text-2xl">아직 프로젝트가 없습니다</p>
              <p className="text-sm text-muted-foreground">첫 번째 프로젝트를 만들어 보세요.</p>
              <Button onClick={() => setLocation("/projects/new")} className="mt-2">
                <Plus className="h-4 w-4" /> 새 프로젝트 만들기
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 justify-items-start">
            {projects.map(p => (
              <div key={p.id} className="group w-full max-w-[220px]">
                <Card className="border hairline transition-all group-hover:shadow-md group-hover:border-accent/50">
                  <CardContent className="px-4 py-0 min-h-0 flex flex-col h-[68px]">
                    <div className="flex items-start justify-between gap-2 relative">
                      <Badge variant="secondary" className="font-mono text-[10px] -mt-2.5">
                        {p.aspectRatio}
                      </Badge>
                      <div className="flex flex-col items-end gap-1">
                        <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground -mt-2.5">
                          {STATUS_LABEL[p.status] ?? p.status}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-1.5">
                      <button
                        type="button"
                        onClick={() => setLocation(`/projects/${p.id}`)}
                        className="text-left flex-1 min-w-0"
                      >
                        <p className="font-serif text-[14px] leading-none line-clamp-1 hover:underline">{p.title}</p>
                      </button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 px-1.5 text-[10px] shrink-0"
                        onClick={() => {
                          const nextTitle = window.prompt("기존 프로젝트 이름을 수정하세요", p.title)?.trim();
                          if (!nextTitle || nextTitle === p.title) return;
                          updateMutation.mutate({ projectId: p.id, title: nextTitle });
                        }}
                      >
                        수정
                      </Button>
                    </div>
                    <div className="flex-1" />
                    <div className="flex items-center justify-between gap-2 pb-1.5 translate-y-[20px]">
                      <p className="text-[8px] leading-none text-muted-foreground">
                        {new Date(p.updatedAt).toLocaleString()}
                      </p>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-5 px-1.5 text-[9px] leading-none"
                          onClick={() => setLocation(`/projects/${p.id}`)}
                        >
                          열기
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-5 px-1.5 text-[9px] leading-none text-muted-foreground hover:text-destructive"
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
                    </div>
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
