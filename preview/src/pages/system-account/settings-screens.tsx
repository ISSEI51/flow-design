import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { Search } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Command, CommandCollection, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { PageHeader, PageHeaderContent, PageHeaderDescription, PageHeaderTitle } from "@/patterns/page-header"
import { PageLayout } from "@/patterns/page-layout"
import { Section, SectionDescription, SectionHeader, SectionHeading, SectionTitle } from "@/patterns/section-layout"
import { toSettingSearchGroups, type SettingSearchEntry, type SettingSearchItem } from "@/patterns/setting-resolve"
import { SettingsBackLink, SettingsLayout, SettingsNav, type SettingsNavGroup } from "@/patterns/settings-layout"
import { useNavigationGuard } from "@/patterns/unsaved-changes"

import { AppLink } from "../data-browsing/doc-parts"
import { can, userName, workspaceName, type SettingsScope, type SettingsSectionProps } from "./settings-parts"
import { AccountDeletionSection, DisplaySettingsSection, LoginSecuritySection, ProfileSection, QuietHoursSection } from "./settings-personal"
import { MembersScreen, OrgSettingsScreen } from "./settings-org"

// Settings の画面の部品（製品側のコードの例）。統合の検証画面（account-app.tsx）から再利用する。
// 対象（scope：アカウント、ワークスペース、ロールの権限）、模擬のサーバーの関数（api）、コールバックを props で受け取る。
// 通知の種類 × 受け取り方（Matrix）は Notifications の部品が担う。ここでは「通知」のカテゴリの入口と、
// 差し込む場所（notifications）だけを用意する。

export { AccountDeletionSection, DisplaySettingsSection, LoginSecuritySection, MembersScreen, OrgSettingsScreen, ProfileSection, QuietHoursSection }
export type { SettingsScope, SettingsSectionProps }

export type SettingsCategoryId = "profile" | "display" | "notifications" | "security" | "organization" | "members"

/** 権限に応じたカテゴリの一覧。閲覧の権限がないカテゴリは含めない */
export function settingsCategories(scope: SettingsScope, hrefFor: (id: SettingsCategoryId | null) => string): (SettingsNavGroup & { items: (SettingsNavGroup["items"][number] & { id: SettingsCategoryId })[] })[] {
  const item = (id: SettingsCategoryId, label: string, description: string) => ({ id, label, description, href: hrefFor(id) })
  const groups = [
    {
      id: "personal",
      label: `個人の設定（${userName(scope)}）`,
      items: [
        item("profile", "プロフィール", "表示名、役職、アカウントの削除"),
        item("display", "表示と言語", "テーマ、表示言語、タイムゾーン"),
        item("notifications", "通知", "通知を止める時間帯、通知の種類"),
        item("security", "ログインとセキュリティ", "パスワード、2 段階認証、外部アカウント"),
      ],
    },
    {
      id: "organization",
      label: `組織の設定（${workspaceName(scope)}）`,
      items: [
        ...(can(scope, "settings.org.view") ? [item("organization", "組織", "組織の情報、セキュリティのポリシー")] : []),
        ...(can(scope, "members.view") ? [item("members", "メンバー", "メンバーの一覧と招待")] : []),
      ],
    },
  ]
  return groups.filter((g) => g.items.length > 0)
}

/** 設定の検索の対象。閲覧の権限がない項目は visible: false（候補に含めない） */
export function settingsSearchEntries(scope: SettingsScope): SettingSearchEntry[] {
  const orgView = can(scope, "settings.org.view")
  const orgEdit = can(scope, "settings.org.edit")
  const e = (id: string, label: string, categoryId: SettingsCategoryId, category: string, aliases: string[] = [], visible = true): SettingSearchEntry => ({
    id,
    label,
    categoryId,
    category,
    aliases,
    visible,
  })
  return [
    e("profile-name", "表示名", "profile", "プロフィール", ["名前", "氏名"]),
    e("profile-title", "役職", "profile", "プロフィール", ["肩書き"]),
    e("profile-bio", "自己紹介", "profile", "プロフィール"),
    e("account-delete", "アカウントの削除", "profile", "プロフィール", ["退会", "削除"]),
    e("theme", "テーマ", "display", "表示と言語", ["ダークモード", "外観", "色"]),
    e("language", "表示言語", "display", "表示と言語", ["言語", "English", "英語"]),
    e("timezone", "タイムゾーン", "display", "表示と言語", ["時刻", "時差"]),
    e("density", "表の行の高さ（この端末）", "display", "表示と言語", ["密度", "コンパクト"]),
    e("quiet", "通知を止める時間帯", "notifications", "通知", ["おやすみ", "夜間", "ミュート"]),
    e("password", "パスワード", "security", "ログインとセキュリティ", ["パスワードの変更"]),
    e("mfa", "2 段階認証", "security", "ログインとセキュリティ", ["2段階認証", "二段階認証", "MFA", "多要素認証"]),
    e("google", "Google アカウントでのログイン", "security", "ログインとセキュリティ", ["外部アカウント", "連携"]),
    e("org-name", "組織名", "organization", "組織", ["ワークスペースの名前", "会社名"], orgView),
    e("org-language", "組織の標準の表示言語", "organization", "組織", ["言語"], orgView),
    // セキュリティのポリシーとワークスペースの削除は、変更の権限がある利用者にだけ示す（機密の設定）
    e("require-mfa", "多要素認証を必須にする", "organization", "組織", ["MFA", "2段階認証", "セキュリティのポリシー"], orgEdit),
    e("require-sso", "組織の SSO を必須にする", "organization", "組織", ["SSO", "シングルサインオン", "セキュリティのポリシー"], orgEdit),
    e("allow-social", "外部アカウントでのログインを許可する", "organization", "組織", ["Google", "Microsoft", "セキュリティのポリシー"], orgEdit),
    e("workspace-delete", "ワークスペースの削除", "organization", "組織", ["削除"], orgEdit),
    e("members", "メンバーの一覧", "members", "メンバー", ["ユーザー", "ロール"], can(scope, "members.view")),
    e("invite", "メンバーを招待", "members", "メンバー", ["招待", "追加"], can(scope, "members.manage")),
  ]
}

// ---------------------------------------------------------------- 設定の検索（Command を再利用する）
export function SettingsSearchDialog({
  open,
  onOpenChange,
  entries,
  onSelect,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  entries: SettingSearchEntry[]
  /** 候補を選んだ。製品がカテゴリへ移動し、設定の項目にフォーカスを移す */
  onSelect: (item: SettingSearchItem) => void
}) {
  const groups = useMemo(() => toSettingSearchGroups(entries), [entries])
  // 候補を選んで閉じたときは、移動先の項目にフォーカスを移すため、検索のボタンへ戻さない。Escape で閉じたときは戻す
  const selected = useRef(false)
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) selected.current = false
        onOpenChange(o)
      }}
    >
      {/* CommandDialog と同じ見た目。CommandDialog は finalFocus を受け取らないため、Dialog で組み立てる */}
      <DialogContent
        size="lg"
        showCloseButton={false}
        finalFocus={() => !selected.current}
        className="h-[min(30rem,calc(100dvh-2rem))] gap-0 overflow-hidden p-0"
        data-testid="set-search-dialog"
      >
        <DialogTitle className="sr-only">設定を検索</DialogTitle>
        <DialogDescription className="sr-only">設定の名前、カテゴリ、別名で検索します。↑↓ で選び、Enter で設定へ移動します。</DialogDescription>
        <Command items={groups}>
          <CommandInput placeholder="設定の名前やカテゴリで検索" aria-label="設定を検索" data-testid="set-search-input" />
          <CommandEmpty>一致する設定がありません</CommandEmpty>
          <CommandList>
            {(group: (typeof groups)[number]) => (
              <CommandGroup key={group.value} items={group.items} heading={group.label}>
                <CommandCollection>
                  {(item: SettingSearchItem) => (
                    <CommandItem
                      key={item.value}
                      value={item}
                      onSelect={() => {
                        selected.current = true
                        onSelect(item)
                      }}
                    >
                      <span className="min-w-0 flex-1 [word-break:auto-phrase]">{item.label}</span>
                      <span className="text-caption text-muted-foreground">{item.category}</span>
                    </CommandItem>
                  )}
                </CommandCollection>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}

// ---------------------------------------------------------------- 設定の画面全体（ナビゲーション、内容、検索、未保存の変更の確認）
type FocusRequest = { kind: "heading" } | { kind: "setting"; id: string } | { kind: "nav"; id: string }

const focusableSelector = "input:not([type=hidden]):not([disabled]), textarea:not([disabled]), button:not([disabled]), [role=switch], [role=combobox], [tabindex]:not([tabindex='-1'])"
const isShown = (el: Element | null): el is HTMLElement => !!el && (el as HTMLElement).isConnected && (el as HTMLElement).getClientRects().length > 0

export type SettingsAreaProps = {
  scope: SettingsScope
  api: SettingsSectionProps["api"]
  /**
   * 権限の取得の状態（useAccess の戻り値）。渡した場合は、最新の権限を確認していない間（再確認中など）、組織の設定とメンバーの
   * 一覧（保護された情報）を表示せず、保存と削除を始めない。渡さない場合は scope.permissions を確認済みとして扱う
   */
  access?: SettingsSectionProps["access"]
  /** 現在のカテゴリ。null はカテゴリの一覧（狭い領域では一覧だけを示し、広い領域では最初のカテゴリを示す） */
  category: SettingsCategoryId | null
  /** カテゴリの移動。製品のルーターで URL を変える。未保存の変更の確認は、この部品が済ませてから呼ぶ */
  onCategoryChange: (category: SettingsCategoryId | null) => void
  /** カテゴリの URL */
  hrefFor?: (category: SettingsCategoryId | null) => string
  /** 「通知」のカテゴリに差し込む、通知の種類と受け取り方の設定（Notifications の部品） */
  notifications?: ReactNode
  /** 保存が権限不足で拒否された。製品が最新の権限を取り直し、scope を更新する */
  onPermissionDenied?: () => void
  /** カテゴリの見出しの階層。ページのタイトル（h1）の直下なら 2 */
  headingLevel?: 2 | 3
  /** 明示的な保存のフォームのどれかに未保存の変更があるか（設定の外への移動の前に、製品が確認するため） */
  onAnyDirtyChange?: (dirty: boolean) => void
  /** 模擬のサーバーの保存の順序の規則（プレビューの検品用。製品では API の契約に合わせて固定する） */
  saveContract?: SettingsSectionProps["saveContract"]
  testId?: string
}

export function SettingsArea({
  scope,
  api,
  access,
  category,
  onCategoryChange,
  hrefFor = (id) => (id ? `#settings/${id}` : "#settings"),
  notifications,
  onPermissionDenied,
  headingLevel = 2,
  onAnyDirtyChange,
  saveContract,
  testId = "set-area",
}: SettingsAreaProps) {
  const groups = settingsCategories(scope, hrefFor)
  const items = groups.flatMap((g) => g.items)
  // 権限がなくなったカテゴリ（ロールの変更の後など）は表示せず、一覧に戻す
  const known = items.find((i) => i.id === category)
  const current = known ?? items[0]
  const view = known ? "detail" : "list"
  const rootRef = useRef<HTMLDivElement>(null)

  // 明示的な保存のフォームの未保存の変更（保存の単位ごと）
  const [dirty, setDirty] = useState<Record<string, boolean>>({})
  const onDirtyChange = useCallback((unit: string, d: boolean) => setDirty((prev) => (prev[unit] === d ? prev : { ...prev, [unit]: d })), [])
  const anyDirty = Object.values(dirty).some(Boolean)
  const anyDirtyRef = useRef(onAnyDirtyChange)
  anyDirtyRef.current = onAnyDirtyChange
  useEffect(() => anyDirtyRef.current?.(anyDirty), [anyDirty])
  const [focusRequest, setFocusRequest] = useState<{ n: number; focus: FocusRequest } | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)

  // 移動を確定するたびに内容を作り直す（狭い領域で一覧へ戻ったときも、破棄した入力を残さない）
  const [visit, setVisit] = useState(0)
  const commit = (next: SettingsCategoryId | null, focus: FocusRequest, discarded: boolean) => {
    if (discarded) {
      setDirty({})
      setVisit((v) => v + 1)
    }
    if (next !== category) onCategoryChange(next)
    setFocusRequest((r) => ({ n: (r?.n ?? 0) + 1, focus }))
  }
  // カテゴリの移動の前の確認は、Unsaved Changes（UnsavedChangesProvider）に任せる。各フォームは useSettingsFormUnsaved で登録する。
  // 製品のルーターの移動（onCategoryChange）は、確認が済んだ後に呼ぶ（同じ移動で 2 回確認しない）
  const guard = useNavigationGuard()
  const go = (next: SettingsCategoryId | null, focus: FocusRequest) => {
    // 同じカテゴリの中の移動（検索で同じカテゴリの項目を選んだ場合）は、入力中の内容を残す
    if (next === (known?.id ?? null)) return commit(next, focus, false)
    const discarding = anyDirty
    guard.confirmNavigation(() => commit(next, focus, discarding))
  }

  // 移動の後のフォーカス。項目は取得の後に表示されるため、現れるまで待つ（3 秒まで）
  useEffect(() => {
    const root = rootRef.current
    if (!focusRequest || !root) return
    const { focus } = focusRequest
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const tryFocus = () => {
      if (focus.kind === "heading") {
        const active = document.activeElement
        // 押したリンクが見えている（広い領域）場合は、フォーカスを動かさない
        if (active && active !== document.body && isShown(active) && root.contains(active)) return true
        const heading = root.querySelector<HTMLElement>("[data-settings-heading]")
        heading?.focus()
        return !!heading
      }
      if (focus.kind === "nav") {
        const link = root.querySelector(`[data-setting-category="${focus.id}"]`)
        if (!isShown(link)) return false
        link.focus()
        return true
      }
      const row = root.querySelector(`[data-setting-id="${focus.id}"]`)
      if (!isShown(row)) return false
      const target = row.matches(focusableSelector) ? row : row.querySelector<HTMLElement>(focusableSelector)
      ;(target ?? row).focus({ preventScroll: true })
      row.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" })
      return true
    }
    if (tryFocus()) return
    const observer = new MutationObserver(() => tryFocus() && observer.disconnect())
    observer.observe(root, { childList: true, subtree: true, attributes: true })
    const timer = window.setTimeout(() => observer.disconnect(), 3000)
    return () => {
      observer.disconnect()
      window.clearTimeout(timer)
    }
  }, [focusRequest])

  const entries = useMemo(() => settingsSearchEntries(scope), [scope])
  const sectionProps: SettingsSectionProps = { scope, api, access, onPermissionDenied, onDirtyChange, saveContract }
  const scopeText =
    current.id === "organization" || current.id === "members"
      ? `対象：${workspaceName(scope)}（組織の設定。すべてのメンバーに適用されます）`
      : `対象：${userName(scope)}さん（個人の設定。あなたのアカウントだけに適用されます）`

  let body: ReactNode
  switch (current.id) {
    case "profile":
      body = (
        <>
          <ProfileSection {...sectionProps} />
          <AccountDeletionSection {...sectionProps} />
        </>
      )
      break
    case "display":
      body = <DisplaySettingsSection {...sectionProps} />
      break
    case "notifications":
      body = (
        <>
          {/* 通知の設定の部品（notifications）を差し込む場合は、その部品の「通知を控える時間」を使う。
              同じ意味の設定を、別の保存先で 2 つ示さない（統合の検証画面で見つけた重複） */}
          {!notifications && <QuietHoursSection {...sectionProps} />}
          {notifications ?? (
            <Section data-setting-id="notification-types">
              <SectionHeader>
                <SectionHeading>
                  <SectionTitle>通知の種類と受け取り方</SectionTitle>
                  <SectionDescription>通知の種類ごとの受け取り方（アプリ内、メール、プッシュ通知）は、Notifications の部品を組み合わせて置きます。</SectionDescription>
                </SectionHeading>
              </SectionHeader>
              <AppLink href="#/notifications">Notifications の資料で、通知の設定を見る</AppLink>
            </Section>
          )}
        </>
      )
      break
    case "security":
      body = <LoginSecuritySection {...sectionProps} />
      break
    case "organization":
      body = <OrgSettingsScreen {...sectionProps} />
      break
    case "members":
      body = <MembersScreen {...sectionProps} />
      break
  }

  return (
    <div ref={rootRef} data-testid={testId} data-view={view} data-category={current.id}>
      <SettingsLayout
        view={view}
        nav={
          <SettingsNav
            groups={groups}
            currentId={current.id}
            onNavigate={(id) => go(id as SettingsCategoryId, { kind: "heading" })}
            header={
              <Button variant="outline" className="w-full justify-start text-muted-foreground" onClick={() => setSearchOpen(true)} data-testid="set-search-open">
                <Search aria-hidden="true" />
                設定を検索
              </Button>
            }
          />
        }
      >
        {/* アカウントとワークスペースを切り替えたら、カテゴリの内容を作り直す（前の対象の表示と状態を残さない） */}
        <Section level={headingLevel} key={`${current.id}:${scope.userId}:${scope.workspaceId}:${visit}`} className="gap-12" data-testid="set-category">
          <div className="flex flex-col gap-2">
            <SettingsBackLink href={hrefFor(null)} onNavigate={() => go(null, { kind: "nav", id: current.id })}>
              設定
            </SettingsBackLink>
            <SectionHeader>
              <SectionHeading>
                <SectionTitle tabIndex={-1} data-settings-heading="" className="text-section outline-none focus-visible:focus-ring">
                  {current.label}
                </SectionTitle>
                <SectionDescription data-testid="set-category-scope">{scopeText}</SectionDescription>
              </SectionHeading>
            </SectionHeader>
          </div>
          {body}
        </Section>
      </SettingsLayout>
      <SettingsSearchDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        entries={entries}
        onSelect={(item) => {
          setSearchOpen(false)
          go(item.categoryId as SettingsCategoryId, { kind: "setting", id: item.value })
        }}
      />
    </div>
  )
}

/** 製品の画面としての設定のページ（Page Layout の standard と Page Header） */
export function SettingsPageScreen(props: Omit<SettingsAreaProps, "headingLevel">) {
  return (
    <PageLayout width="standard" data-testid="set-page">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>設定</PageHeaderTitle>
          <PageHeaderDescription>
            {userName(props.scope)}・{workspaceName(props.scope)}
          </PageHeaderDescription>
        </PageHeaderContent>
      </PageHeader>
      <SettingsArea {...props} headingLevel={2} />
    </PageLayout>
  )
}
