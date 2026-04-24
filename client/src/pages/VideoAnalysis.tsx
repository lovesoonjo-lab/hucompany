import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { ExternalLink, Loader2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const COUNTRY_OPTIONS = [
  { code: "KR", label: "한국" },
  { code: "US", label: "미국" },
  { code: "AU", label: "호주" },
  { code: "CA", label: "캐나다" },
  { code: "NZ", label: "뉴질랜드" },
  { code: "MX", label: "멕시코" },
  { code: "CN", label: "중국" },
  { code: "JP", label: "일본" },
  { code: "IN", label: "인도" },
  { code: "ID", label: "인도네시아" },
  { code: "VN", label: "베트남" },
] as const;

const CHANNEL_CATEGORIES = [
  { id: "shopping", label: "쇼핑채널" },
  { id: "news", label: "뉴스채널" },
  { id: "info", label: "정보채널" },
  { id: "psychology", label: "심리학채널" },
  { id: "economics", label: "경제학채널" },
  { id: "beauty", label: "뷰티채널" },
  { id: "cooking", label: "요리채널" },
  { id: "tech", label: "테크채널" },
  { id: "music", label: "음악채널" },
  { id: "vlog", label: "브이로그채널" },
  { id: "animation", label: "애니메이션채널" },
  { id: "kids", label: "키즈채널" },
] as const;

function formatCompact(n: number): string {
  return new Intl.NumberFormat("ko-KR", { notation: "compact" }).format(n);
}

export default function VideoAnalysis() {
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const [draftRegionCode, setDraftRegionCode] = useState<(typeof COUNTRY_OPTIONS)[number]["code"]>("KR");
  const [draftCategory, setDraftCategory] = useState<(typeof CHANNEL_CATEGORIES)[number]["id"]>("shopping");
  const [draftSubscriberSort, setDraftSubscriberSort] = useState<"desc" | "asc">("desc");
  const [appliedRegionCode, setAppliedRegionCode] = useState<(typeof COUNTRY_OPTIONS)[number]["code"]>("KR");
  const [appliedCategory, setAppliedCategory] = useState<(typeof CHANNEL_CATEGORIES)[number]["id"]>("shopping");
  const [appliedSubscriberSort, setAppliedSubscriberSort] = useState<"desc" | "asc">("desc");
  const channelsQuery = trpc.videoAnalysis.channelsByCountry.useInfiniteQuery(
    {
      regionCode: appliedRegionCode,
      category: appliedCategory,
      maxResults: 12,
      sort: appliedSubscriberSort === "desc" ? "subscribers_desc" : "subscribers_asc",
    },
    {
      retry: false,
      refetchOnWindowFocus: false,
      getNextPageParam: lastPage => lastPage.nextCursor ?? undefined,
    },
  );
  const selectedCountry = useMemo(
    () => COUNTRY_OPTIONS.find(c => c.code === appliedRegionCode)?.label ?? appliedRegionCode,
    [appliedRegionCode],
  );
  const sortedChannels = useMemo(() => {
    const merged = channelsQuery.data?.pages.flatMap(p => p.channels) ?? [];
    const deduped = Array.from(
      new Map(
        merged
          .filter(ch => !!ch.id)
          .map(ch => [ch.id, ch]),
      ).values(),
    );
    return [...deduped].sort((a, b) =>
      appliedSubscriberSort === "desc" ? b.subscriberCount - a.subscriberCount : a.subscriberCount - b.subscriberCount,
    );
  }, [channelsQuery.data?.pages, appliedSubscriberSort]);

  const handleSearch = () => {
    if (
      draftRegionCode === appliedRegionCode &&
      draftCategory === appliedCategory &&
      draftSubscriberSort === appliedSubscriberSort
    ) {
      void channelsQuery.refetch();
      return;
    }
    setAppliedRegionCode(draftRegionCode);
    setAppliedCategory(draftCategory);
    setAppliedSubscriberSort(draftSubscriberSort);
  };

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target) return;
    const observer = new IntersectionObserver(
      entries => {
        const entry = entries[0];
        if (!entry?.isIntersecting) return;
        if (!channelsQuery.hasNextPage || channelsQuery.isFetchingNextPage) return;
        void channelsQuery.fetchNextPage();
      },
      { root: null, rootMargin: "200px 0px", threshold: 0.1 },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, [channelsQuery.hasNextPage, channelsQuery.isFetchingNextPage, channelsQuery.fetchNextPage, sortedChannels.length]);

  return (
    <DashboardLayout>
      <div className="mx-auto max-w-7xl space-y-8 py-2">
        <Tabs defaultValue="channel-group" className="space-y-6">
          <TabsList className="grid w-full max-w-xl grid-cols-3">
            <TabsTrigger value="channel-group">채널그룹</TabsTrigger>
            <TabsTrigger value="video-group">영상그룹</TabsTrigger>
            <TabsTrigger value="trending">트렌딩</TabsTrigger>
          </TabsList>
          <div className="gold-divider w-full opacity-40" />

          <TabsContent value="channel-group">
            <Card className="border hairline">
              <CardContent className="py-6 space-y-5">
                <div className="space-y-2">
                  <p className="font-serif text-xl">채널그룹</p>
                  <p className="text-sm text-muted-foreground">국가/카테고리별로 수집된 채널 DB를 조회합니다.</p>
                </div>

                <div className="flex flex-wrap gap-2">
                  {COUNTRY_OPTIONS.map(country => {
                    const active = country.code === draftRegionCode;
                    return (
                      <Button
                        key={country.code}
                        type="button"
                        size="sm"
                        variant={active ? "default" : "outline"}
                        onClick={() => setDraftRegionCode(country.code)}
                      >
                        {country.label}
                      </Button>
                    );
                  })}
                </div>
                <div className="flex flex-wrap gap-2">
                  {CHANNEL_CATEGORIES.map(item => {
                    const active = item.id === draftCategory;
                    return (
                      <Button
                        key={item.id}
                        type="button"
                        size="sm"
                        variant={active ? "default" : "outline"}
                        onClick={() => setDraftCategory(item.id)}
                      >
                        {item.label}
                      </Button>
                    );
                  })}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={draftSubscriberSort === "desc" ? "default" : "outline"}
                    onClick={() => setDraftSubscriberSort("desc")}
                  >
                    구독자 높은순
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={draftSubscriberSort === "asc" ? "default" : "outline"}
                    onClick={() => setDraftSubscriberSort("asc")}
                  >
                    구독자 낮은순
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleSearch}
                    disabled={channelsQuery.isLoading || channelsQuery.isFetching}
                  >
                    검색
                  </Button>
                </div>

                {channelsQuery.isLoading ? (
                  <div className="py-10 flex items-center justify-center text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin mr-2" /> {selectedCountry} 채널 불러오는 중…
                  </div>
                ) : channelsQuery.isError ? (
                  <div className="py-8 text-center space-y-3">
                    <p className="text-sm text-destructive">{channelsQuery.error.message}</p>
                    <Button variant="outline" onClick={() => channelsQuery.refetch()}>
                      다시 시도
                    </Button>
                  </div>
                ) : sortedChannels.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    아직 채널 데이터가 준비되지 않았습니다. 관리자 동기화를 실행한 뒤 다시 시도해주세요.
                  </p>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                      {sortedChannels.map(channel => (
                        <a
                          key={channel.id}
                          href={channel.channelUrl}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="border hairline rounded-lg p-3 space-y-2 hover:bg-muted/30 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            {channel.thumbnailUrl ? (
                              <img src={channel.thumbnailUrl} alt={channel.title} className="h-12 w-12 rounded-full object-cover" />
                            ) : (
                              <div className="h-12 w-12 rounded-full bg-muted" />
                            )}
                            <div className="min-w-0">
                              <p className="text-sm font-medium truncate">{channel.title}</p>
                              <p className="text-[11px] text-muted-foreground truncate">
                                구독자 {formatCompact(channel.subscriberCount)} · 영상 {formatCompact(channel.videoCount)}
                              </p>
                            </div>
                          </div>
                          <p className="text-xs text-muted-foreground line-clamp-2">
                            {channel.description || "채널 설명이 없습니다."}
                          </p>
                          <p className="text-[11px] inline-flex items-center gap-1 text-muted-foreground">
                            채널 열기 <ExternalLink className="h-3 w-3" />
                          </p>
                        </a>
                      ))}
                    </div>
                    <div ref={loadMoreRef} className="h-8 flex items-center justify-center text-xs text-muted-foreground">
                      {channelsQuery.isFetchingNextPage ? (
                        <span className="inline-flex items-center gap-1">
                          <Loader2 className="h-3 w-3 animate-spin" /> 추가 채널 불러오는 중…
                        </span>
                      ) : channelsQuery.hasNextPage ? (
                        "아래로 스크롤하면 더 불러옵니다."
                      ) : (
                        "모든 채널을 불러왔습니다."
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="video-group">
            <Card className="border hairline">
              <CardContent className="py-14 text-center space-y-2">
                <p className="font-serif text-xl">영상그룹</p>
                <p className="text-sm text-muted-foreground">
                  영상 유형별로 묶어 조회수, 반응률을 분석하는 영역입니다.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="trending">
            <Card className="border hairline">
              <CardContent className="py-14 text-center space-y-2">
                <p className="font-serif text-xl">트렌딩</p>
                <p className="text-sm text-muted-foreground">
                  현재 상승 중인 주제/포맷을 추적하는 영역입니다.
                </p>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
