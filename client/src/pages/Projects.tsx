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
import { Loader2, Plus, Trash2 } from "lucide-react";
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
            <p className="uppercase tracking-[0.28em] text-[11px] text-muted-foreground">Library</p>
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {projects.map(p => (
              <Card key={p.id} className="border hairline overflow-hidden flex flex-col">
                <CardContent className="py-5 space-y-3 flex-1">
                  <div className="flex items-center justify-between">
                    <Badge variant="secondary" className="font-mono text-[10px]">
                      {p.aspectRatio}
                    </Badge>
                    <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
                      {STATUS_LABEL[p.status] ?? p.status}
                    </span>
                  </div>
                  <button
                    className="text-left w-full"
                    onClick={() => setLocation(`/projects/${p.id}`)}
                  >
                    <p className="font-serif text-xl leading-tight line-clamp-2 hover:underline">
                      {p.title}
                    </p>
                  </button>
                  <p className="text-xs text-muted-foreground line-clamp-3 min-h-[2.4rem]">
                    {p.description || "설명 없음"}
                  </p>
                  <div className="gold-divider w-12 opacity-50" />
                  <p className="text-[11px] text-muted-foreground">
                    업데이트: {new Date(p.updatedAt).toLocaleString()}
                  </p>
                </CardContent>
                <div className="px-5 pb-4 flex justify-between items-center border-t hairline pt-3">
                  <Button variant="link" size="sm" onClick={() => setLocation(`/projects/${p.id}`)}>
                    열기
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon-sm" className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
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
              </Card>
            ))}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
