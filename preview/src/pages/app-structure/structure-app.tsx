import { useCallback, useEffect, useState, type MouseEvent, type ReactNode } from "react"

import { SidebarTrigger } from "@/components/ui/sidebar"
import { useToast } from "@/components/ui/toast"
import { AppShell, AppShellBody, AppShellHeader, AppShellMain, MinimalShell } from "@/patterns/app-shell"

import {
  structureHref,
  structureLabels,
  structureNav,
  structureSettingsItem,
  structureUser,
} from "../../data/app-structure"
import { ProductMark, StructureSidebar } from "./structure-sidebar"
import {
  CustomerNewScreen,
  CustomerScreen,
  CustomersScreen,
  DashboardScreen,
  LoginScreen,
  PlaceholderScreen,
  SettingsScreen,
} from "./structure-screens"

// App Structure の 5 つの Pattern を組み合わせた、業務アプリケーション（営業管理）の検証用の画面。
// 正式な Pages の実装ではない。
//
// 製品（この画面）の責務
// - ルーティング：URL のハッシュ（#/structure-app?page=...&id=...）。Registry の部品はルーティングを知らない。
// - 現在地の判定：ページから Sidebar の項目の id を求めて SidebarNav に渡す（顧客の詳細と登録は「顧客」）。
// - Sidebar の開閉の状態の保存：localStorage。
// - 移動の後のフォーカスとスクロール：AppShellMain の pageKey に、ページを表す値を渡す。

const STORAGE_KEY = "flow-design-preview:structure-sidebar-open"

function readRoute() {
  const params = new URLSearchParams(window.location.hash.split("?")[1] ?? "")
  return { page: params.get("page") ?? "home", id: params.get("id"), long: params.get("long") === "1" }
}

function readOpen() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== "false"
  } catch {
    return true
  }
}

// ページの id から、Sidebar の現在地（項目の id）を求める。
const navIdFor = (page: string) => (page === "customer" || page === "customer-new" ? "customers" : page)

export function StructureApp() {
  const [route, setRoute] = useState(readRoute)
  const [open, setOpenState] = useState(readOpen)
  const { toast } = useToast()

  useEffect(() => {
    const onHash = () => setRoute(readRoute())
    window.addEventListener("hashchange", onHash)
    return () => window.removeEventListener("hashchange", onHash)
  }, [])

  const setOpen = useCallback((next: boolean) => {
    setOpenState(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, String(next))
    } catch {
      // 保存できない環境では、この画面を開いている間だけ状態を保つ。
    }
  }, [])

  const extra = route.long ? { long: "1" } : undefined
  const href = (page: string, more?: Record<string, string>) => structureHref(page, { ...extra, ...more })
  const navigateTo = (page: string, more?: Record<string, string>) => {
    window.location.hash = href(page, more)
  }
  // リンクの既定の移動（ハッシュの変更）を止めてから移動する。修飾キー付きのクリックは新しいタブに任せる。
  const go = (page: string, more?: Record<string, string>) => (e: MouseEvent) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    navigateTo(page, more)
  }

  const labels = structureLabels(route.long)
  const title = (page: string) => labels[page] ?? "ページ"

  if (route.page === "login") {
    return (
      <MinimalShell
        header={
          <span className="flex items-center gap-3 text-ui font-semibold">
            <ProductMark />
            Flow 営業管理
          </span>
        }
      >
        <LoginScreen onSignIn={() => navigateTo("home")} />
      </MinimalShell>
    )
  }

  let body: ReactNode
  switch (route.page) {
    case "home":
      body = <DashboardScreen href={href} go={go} title={title("home")} />
      break
    case "customers":
      body = <CustomersScreen href={href} go={go} title={title("customers")} />
      break
    case "customer":
      body = <CustomerScreen id={route.id} href={href} go={go} long={route.long} />
      break
    case "customer-new":
      body = (
        <CustomerNewScreen
          href={href}
          go={go}
          onCreated={(company) => {
            navigateTo("customers")
            toast({ variant: "success", title: `${company}を登録しました` })
          }}
        />
      )
      break
    case "settings":
      body = <SettingsScreen title={title("settings")} />
      break
    default:
      body = <PlaceholderScreen title={title(route.page)} />
  }

  const pageKey = `${route.page}:${route.id ?? ""}`

  return (
    <AppShell sidebarOpen={open} onSidebarOpenChange={setOpen}>
      <StructureSidebar
        groups={structureNav(route.long, extra)}
        settingsItem={structureSettingsItem(route.long, extra)}
        currentId={navIdFor(route.page)}
        homeHref={href("home")}
        onNavigate={(id, e) => {
          e.preventDefault()
          navigateTo(id)
        }}
        user={structureUser}
        onSignOut={() => navigateTo("login")}
      />
      <AppShellBody>
        {/* デスクトップでは全画面に共通の操作がないため、グローバルヘッダーを置かない。モバイルだけ、メニューを開くボタンを置く */}
        <AppShellHeader className="md:hidden" data-testid="structure-mobile-header">
          <SidebarTrigger className="-ml-2" />
          <span className="flex min-w-0 items-center gap-3 text-ui font-semibold">
            <ProductMark />
            <span className="truncate">Flow 営業管理</span>
          </span>
        </AppShellHeader>
        <AppShellMain pageKey={pageKey} data-testid="structure-main">
          {body}
        </AppShellMain>
      </AppShellBody>
    </AppShell>
  )
}
