import { useState } from "react"
import { CalendarDays, House, UserRound } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Sidebar, SidebarContent, SidebarTrigger } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { AppShell, AppShellBody, AppShellHeader, AppShellMain } from "@/patterns/app-shell"
import { BottomNav, BottomNavItem } from "@/patterns/bottom-nav"
import { PageColumns, PageLayout } from "@/patterns/page-layout"
import { PageHeader, PageHeaderActions, PageHeaderContent, PageHeaderDescription, PageHeaderTitle } from "@/patterns/page-header"
import { Section, SectionHeader, SectionStack, SectionTitle } from "@/patterns/section-layout"
import { SidebarNav } from "@/patterns/sidebar-nav"

import { structureNav } from "../data/app-structure"

// App Structure の 5 つの Pattern の SSR と Hydration の検品用の画面。
// サーバーで描画するときは window と document がない。描画の結果は、サーバーとブラウザで同じでなければならない。
export function AppStructureSsrFixture() {
  const [currentId, setCurrentId] = useState("renewals")
  return (
    <TooltipProvider>
      <AppShell mainId="ssr-main">
        <Sidebar>
          <SidebarContent>
            <SidebarNav
              groups={structureNav(false)}
              currentId={currentId}
              onNavigate={(id, e) => {
                e.preventDefault()
                setCurrentId(id)
              }}
            />
          </SidebarContent>
        </Sidebar>
        <AppShellBody>
          <AppShellHeader className="md:hidden">
            <SidebarTrigger />
            Flow 営業管理
          </AppShellHeader>
          <AppShellMain pageKey={currentId} data-testid="ssr-main">
            <PageLayout width="standard">
              <PageHeader sticky>
                <PageHeaderContent>
                  <PageHeaderTitle>契約の更新</PageHeaderTitle>
                  <PageHeaderDescription>30 日以内に更新を迎える契約</PageHeaderDescription>
                </PageHeaderContent>
                <PageHeaderActions>
                  <Button>書き出す</Button>
                </PageHeaderActions>
              </PageHeader>
              <PageColumns layout="main-aside">
                <SectionStack>
                  <Section>
                    <SectionHeader>
                      <SectionTitle>北海物産株式会社</SectionTitle>
                    </SectionHeader>
                    <Section>
                      <SectionHeader>
                        <SectionTitle>契約の内容</SectionTitle>
                      </SectionHeader>
                      <p>スタンダードプラン・2026/12/15 に更新</p>
                    </Section>
                  </Section>
                </SectionStack>
                <aside aria-label="補足の情報">担当 鈴木 一郎</aside>
              </PageColumns>
              {/* Sticky の Page Header の検品のため、main がスクロールする長さの内容を置く */}
              <ul>
                {Array.from({ length: 30 }, (_, i) => (
                  <li key={i} className="py-3">
                    <a href={`#contract-${i + 1}`}>契約 {i + 1}</a>
                  </li>
                ))}
              </ul>
            </PageLayout>
          </AppShellMain>
          {/* 検品のために Sidebar と同時に置く。名前を分け、同じ名前の nav を 2 つにしない（製品ではどちらか一方） */}
          <BottomNav aria-label="主要な機能">
            <BottomNavItem icon={House} label="ホーム" href="#home" isActive />
            <BottomNavItem icon={CalendarDays} label="予約" href="#bookings" />
            <BottomNavItem icon={UserRound} label="マイページ" href="#account" />
          </BottomNav>
        </AppShellBody>
      </AppShell>
    </TooltipProvider>
  )
}
