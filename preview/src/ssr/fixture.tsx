import { House } from "lucide-react"

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import {
  Breadcrumb,
  BreadcrumbEllipsis,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import {
  SidebarGroup,
  SidebarInset,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TooltipProvider } from "@/components/ui/tooltip"

import { AppSidebar } from "../pages/navigation/app-sidebar"

// SSR と Hydration の検品用の画面。Navigation & Layout の 6 つのコンポーネントを、サーバーとブラウザの両方で描画する。
// サーバーで描画するときは window と document がない。描画の結果は、サーバーとブラウザで同じでなければならない。
export function SsrFixture() {
  return (
    <TooltipProvider>
      <SidebarProvider>
        <AppSidebar
          current="renewals"
          onNavigate={() => {}}
          hrefFor={(id) => `#/app?page=${id}`}
          user={{ name: "佐藤 花子", email: "hanako.sato@example.com" }}
        />
        <SidebarInset data-testid="ssr-main">
          <header className="flex min-h-16 items-center gap-2 px-4 md:px-6">
            <SidebarTrigger className="-ml-2" />
            <Separator decorative orientation="vertical" className="mr-2 h-6 self-center" />
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink href="#/app" aria-label="ホーム">
                    <House />
                  </BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbEllipsis />
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>更新が近い契約</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </header>
          <div className="max-w-[960px] px-4 pt-6 pb-16 md:px-6">
            <h1 className="text-page-title">更新が近い契約</h1>
            <Tabs defaultValue="list" className="mt-8">
              <TabsList aria-label="表示">
                <TabsTrigger value="list">一覧</TabsTrigger>
                <TabsTrigger value="calendar">予定</TabsTrigger>
              </TabsList>
              <TabsContent value="list">
                <Card size="sm">
                  <CardHeader>
                    <CardTitle>北海物産株式会社</CardTitle>
                  </CardHeader>
                  <CardContent>2026年12月15日に更新</CardContent>
                </Card>
              </TabsContent>
              <TabsContent value="calendar">予定</TabsContent>
            </Tabs>
            <Separator className="my-8" />
            <Accordion>
              <AccordionItem value="memo">
                <AccordionTrigger>社内メモ</AccordionTrigger>
                <AccordionContent>更新の前に担当者へ連絡する</AccordionContent>
              </AccordionItem>
            </Accordion>
            <SidebarGroup className="mt-8 max-w-60 bg-sidebar">
              <SidebarMenu aria-busy="true">
                {Array.from({ length: 3 }, (_, i) => (
                  <SidebarMenuItem key={i}>
                    <SidebarMenuSkeleton showIcon />
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroup>
          </div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}
