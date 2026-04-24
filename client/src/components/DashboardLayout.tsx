import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/useMobile";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChartColumnBig, Film, FolderOpen, KeyRound, LayoutDashboard, LogOut, PanelLeft } from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from './DashboardLayoutSkeleton';
import { Button } from "./ui/button";

const menuItems = [
  { icon: LayoutDashboard, label: "대시보드", path: "/" },
  { icon: ChartColumnBig, label: "영상분석", path: "/video-analysis" },
  { icon: FolderOpen, label: "프로젝트", path: "/projects" },
  { icon: Film, label: "새 프로젝트", path: "/projects/new" },
  { icon: KeyRound, label: "API 설정", path: "/settings" },
];

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const LOCAL_LOGIN_KEY = "local-login-approved";
const DEFAULT_WIDTH = 280;
const MIN_WIDTH = 200;
const MAX_WIDTH = 480;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const [localLoginApproved, setLocalLoginApproved] = useState(
    () => localStorage.getItem(LOCAL_LOGIN_KEY) === "1",
  );
  const [isLoginDialogOpen, setIsLoginDialogOpen] = useState(false);
  const [loginId, setLoginId] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const { loading } = useAuth();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) {
    return <DashboardLayoutSkeleton />
  }

  if (!localLoginApproved) {
    const submitLocalLogin = () => {
      if (!loginId.trim() || !loginPassword.trim()) {
        setLoginError("아이디와 비밀번호를 입력해주세요.");
        return;
      }
      localStorage.setItem(LOCAL_LOGIN_KEY, "1");
      setLocalLoginApproved(true);
      setLoginError("");
      setLoginPassword("");
      setIsLoginDialogOpen(false);
    };

    return (
      <div className="flex items-center justify-center min-h-screen bg-linen">
        <div className="flex flex-col items-center gap-10 p-12 max-w-lg w-full">
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="flex flex-col items-center leading-tight gap-4">
              <p className="uppercase tracking-[0.32em] text-3xl text-muted-foreground">
                HUCOMPANY
              </p>
              <p className="font-serif text-[5rem] leading-none tracking-tight whitespace-nowrap">
                Shopping Shorts
              </p>
            </div>
            <div className="gold-divider w-24 my-2" />
            <img
              src="/family-illustration.png"
              alt="HUCOMPANY family illustration"
              className="w-full max-w-md rounded-2xl border hairline"
              draggable={false}
            />
          </div>
          <Button
            onClick={() => {
              setLoginError("");
              setIsLoginDialogOpen(true);
            }}
            size="lg"
            className="w-full bg-black text-white shadow-md hover:bg-black/90 hover:text-white transition-all"
          >
            로그인하고 시작하기
          </Button>
        </div>
        <Dialog
          open={isLoginDialogOpen}
          onOpenChange={open => {
            setIsLoginDialogOpen(open);
            if (!open) setLoginError("");
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>로그인</DialogTitle>
              <DialogDescription>아이디와 비밀번호를 입력해 시작하세요.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="local-login-id">아이디</Label>
                <Input
                  id="local-login-id"
                  value={loginId}
                  onChange={e => setLoginId(e.target.value)}
                  placeholder="아이디 입력"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="local-login-password">비밀번호</Label>
                <Input
                  id="local-login-password"
                  type="password"
                  value={loginPassword}
                  onChange={e => setLoginPassword(e.target.value)}
                  placeholder="비밀번호 입력"
                  onKeyDown={e => {
                    if (e.key === "Enter") {
                      submitLocalLogin();
                    }
                  }}
                />
              </div>
              {loginError ? (
                <p className="text-sm text-destructive">{loginError}</p>
              ) : null}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsLoginDialogOpen(false)}>
                취소
              </Button>
              <Button
                onClick={submitLocalLogin}
                className="bg-black text-white hover:bg-black/90 hover:text-white"
              >
                로그인
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return (
    <SidebarProvider
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
        } as CSSProperties
      }
    >
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

type DashboardLayoutContentProps = {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
};

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: DashboardLayoutContentProps) {
  const { logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const activeMenuItem = menuItems.find(item => item.path === location);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (isCollapsed) {
      setIsResizing(false);
    }
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;

      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar
          collapsible="icon"
          className="border-r-0"
          disableTransition={isResizing}
        >
          <SidebarHeader className="justify-center pt-4 pb-3">
            <div className="flex items-center gap-3 px-2 transition-all w-full">
              <button
                onClick={toggleSidebar}
                className="h-8 w-8 flex items-center justify-center hover:bg-accent rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring shrink-0"
                aria-label="Toggle navigation"
              >
                <PanelLeft className="h-4 w-4 text-muted-foreground" />
              </button>
              {!isCollapsed ? (
                <div className="flex items-center gap-3 min-w-0">
                  <img
                    src="/family-illustration.png"
                    alt="HUCOMPANY"
                    className="h-12 w-auto rounded-md border hairline select-none"
                    draggable={false}
                  />
                  <div className="flex flex-col leading-tight min-w-0">
                    <span className="font-sans text-[10px] font-medium tracking-[0.22em] uppercase text-muted-foreground truncate">
                      HUCOMPANY
                    </span>
                    <span className="font-serif text-lg tracking-tight truncate">
                      Shopping Shorts
                    </span>
                  </div>
                </div>
              ) : null}
            </div>
          </SidebarHeader>

          <SidebarContent className="gap-0">
            <SidebarMenu className="px-2 py-1">
              {menuItems.map(item => {
                const isActive = location === item.path;
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => setLocation(item.path)}
                      tooltip={item.label}
                      className={`h-10 transition-all font-normal`}
                    >
                      <item.icon
                        className={`h-4 w-4 ${isActive ? "text-primary" : ""}`}
                      />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarContent>

          <SidebarFooter className="p-2">
            <button
              onClick={async () => {
                localStorage.removeItem(LOCAL_LOGIN_KEY);
                await logout();
                window.location.href = "/";
              }}
              className="flex items-center gap-2 rounded-lg px-3 py-2 hover:bg-accent/60 transition-colors w-full text-left text-sm text-muted-foreground hover:text-foreground group-data-[collapsible=icon]:justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Sign out"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              <span className="group-data-[collapsible=icon]:hidden">Sign out</span>
            </button>
          </SidebarFooter>
        </Sidebar>
        <div
          className={`absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-primary/20 transition-colors ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => {
            if (isCollapsed) return;
            setIsResizing(true);
          }}
          style={{ zIndex: 50 }}
        />
      </div>

      <SidebarInset>
        {isMobile && (
          <div className="flex border-b h-14 items-center justify-between bg-background/95 px-2 backdrop-blur supports-[backdrop-filter]:backdrop-blur sticky top-0 z-40">
            <div className="flex items-center gap-2">
              <SidebarTrigger className="h-9 w-9 rounded-lg bg-background" />
              <div className="flex items-center gap-3">
                <div className="flex flex-col gap-1">
                  <span className="tracking-tight text-foreground">
                    {activeMenuItem?.label ?? "Menu"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
        <main className="flex-1 p-4">{children}</main>
      </SidebarInset>
    </>
  );
}
