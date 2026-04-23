import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Cloud,
  CheckCircle2,
  FileKey,
  KeyRound,
  Loader2,
  Save,
  ShieldCheck,
} from "lucide-react";

export default function Settings() {
  const settingsQuery = trpc.settings.get.useQuery();
  const utils = trpc.useUtils();
  const saveMutation = trpc.settings.save.useMutation({
    onSuccess: () => {
      toast.success("저장되었습니다");
      utils.settings.get.invalidate();
    },
    onError: e => toast.error(e.message),
  });
  const verifyGcs = trpc.settings.verifyGcs.useMutation({
    onSuccess: result => {
      if (result.ok) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
      utils.settings.get.invalidate();
    },
    onError: e => toast.error(e.message),
  });

  const [kreaApiKey, setKreaApiKey] = useState("");
  const [uploadPostApiKey, setUploadPostApiKey] = useState("");

  const [gcsProjectId, setGcsProjectId] = useState("");
  const [gcsBucketName, setGcsBucketName] = useState("");
  const [gcsServiceAccountEmail, setGcsServiceAccountEmail] = useState("");
  const [gcsPrivateKey, setGcsPrivateKey] = useState("");

  useEffect(() => {
    const d = settingsQuery.data;
    if (!d) return;
    setKreaApiKey(d.kreaApiKey ?? "");
    setUploadPostApiKey(d.uploadPostApiKey ?? "");
    setGcsProjectId(d.gcsProjectId ?? "");
    setGcsBucketName(d.gcsBucketName ?? "");
    setGcsServiceAccountEmail(d.gcsServiceAccountEmail ?? "");
    setGcsPrivateKey(d.gcsPrivateKey ?? "");
  }, [settingsQuery.data]);

  const onSaveKeys = () => {
    saveMutation.mutate({ kreaApiKey, uploadPostApiKey });
  };

  const onVerifyGcs = () => {
    if (!gcsProjectId || !gcsBucketName || !gcsServiceAccountEmail || !gcsPrivateKey) {
      toast.error("모든 GCS 항목을 입력해 주세요");
      return;
    }
    verifyGcs.mutate({
      projectId: gcsProjectId,
      bucketName: gcsBucketName,
      serviceAccountEmail: gcsServiceAccountEmail,
      privateKey: gcsPrivateKey,
      persist: true,
    });
  };

  const verifiedAt = settingsQuery.data?.gcsVerifiedAt
    ? new Date(settingsQuery.data.gcsVerifiedAt).toLocaleString()
    : null;

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-3xl space-y-8 py-2">
        <header>
          <p className="uppercase tracking-[0.28em] text-[11px] text-muted-foreground">Settings</p>
          <h1 className="font-serif text-3xl md:text-4xl mt-1">API 설정</h1>
          <div className="gold-divider w-20 mt-3" />
          <p className="text-sm text-muted-foreground mt-3">
            Krea AI · Upload-Post · Google Cloud Storage 연동에 사용할 자격 정보를 설정합니다.
            모든 값은 사용자 계정 단위로 저장됩니다.
          </p>
        </header>

        {/* ----------------------------- API Keys ----------------------------- */}
        <Card className="border hairline">
          <CardContent className="py-7 space-y-6">
            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center">
                <KeyRound className="h-4 w-4" />
              </div>
              <div className="flex-1 space-y-2">
                <Label htmlFor="krea">Krea AI API Key</Label>
                <Input
                  id="krea"
                  type="password"
                  autoComplete="new-password"
                  placeholder="sk-krea-..."
                  value={kreaApiKey}
                  onChange={e => setKreaApiKey(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  키 발급:{" "}
                  <a
                    href="https://www.krea.ai/settings/api-tokens"
                    target="_blank"
                    rel="noreferrer noopener"
                    className="underline underline-offset-2"
                  >
                    krea.ai/settings/api-tokens
                  </a>
                </p>
              </div>
            </div>

            <div className="gold-divider opacity-40" />

            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center">
                <KeyRound className="h-4 w-4" />
              </div>
              <div className="flex-1 space-y-2">
                <Label htmlFor="up">Upload-Post API Key (선택)</Label>
                <Input
                  id="up"
                  type="password"
                  autoComplete="new-password"
                  placeholder="up-..."
                  value={uploadPostApiKey}
                  onChange={e => setUploadPostApiKey(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  TikTok · Instagram · YouTube · Facebook 일괄 업로드에 사용됩니다.
                </p>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <Button onClick={onSaveKeys} size="lg" disabled={saveMutation.isPending}>
                <Save className="h-4 w-4" />
                {saveMutation.isPending ? "저장 중…" : "저장"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* ---------------------------- GCS Section --------------------------- */}
        <Card className="border hairline">
          <CardContent className="py-7 space-y-6">
            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-full bg-secondary flex items-center justify-center">
                <Cloud className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <h2 className="font-serif text-xl">Google Cloud Storage (GCS) 설정</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  생성된 파일을 GCS에 자동 업로드합니다. 폴더 구조: reference/, scripts/, audio/,
                  subtitles/, images/, videos/, final/
                </p>
                {verifiedAt && (
                  <p className="text-xs text-emerald-700 mt-2 inline-flex items-center gap-1">
                    <ShieldCheck className="h-3.5 w-3.5" />
                    검증 완료 · {verifiedAt}
                  </p>
                )}
              </div>
            </div>

            <div className="grid gap-5">
              <div className="space-y-2">
                <Label htmlFor="gcs-project">Project ID</Label>
                <Input
                  id="gcs-project"
                  placeholder="my-gcp-project"
                  value={gcsProjectId}
                  onChange={e => setGcsProjectId(e.target.value)}
                  autoComplete="off"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="gcs-bucket">Bucket Name</Label>
                <Input
                  id="gcs-bucket"
                  placeholder="my-content-bucket"
                  value={gcsBucketName}
                  onChange={e => setGcsBucketName(e.target.value)}
                  autoComplete="off"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="gcs-email">Service Account Email</Label>
                <Input
                  id="gcs-email"
                  type="email"
                  placeholder="my-sa@my-gcp-project.iam.gserviceaccount.com"
                  value={gcsServiceAccountEmail}
                  onChange={e => setGcsServiceAccountEmail(e.target.value)}
                  autoComplete="off"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="gcs-key" className="inline-flex items-center gap-1.5">
                  <FileKey className="h-3.5 w-3.5" />
                  Private Key (JSON)
                </Label>
                <Textarea
                  id="gcs-key"
                  rows={6}
                  placeholder={"-----BEGIN PRIVATE KEY-----\nMIIEv...\n-----END PRIVATE KEY-----\n"}
                  value={gcsPrivateKey}
                  onChange={e => setGcsPrivateKey(e.target.value)}
                  spellCheck={false}
                  autoComplete="off"
                  className="font-mono text-xs"
                />
                <p className="text-[11px] text-muted-foreground">
                  서비스 계정 JSON의 <code>private_key</code> 값을 그대로 붙여넣으세요.
                  내부적으로 줄바꿈(\n)을 자동 변환합니다.
                </p>
              </div>
            </div>

            <Button
              onClick={onVerifyGcs}
              size="lg"
              className="w-full"
              disabled={verifyGcs.isPending}
            >
              {verifyGcs.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  검증 중…
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  저장 및 검증
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
