import { useMemo, useRef, useState } from "react"
import {
  Bell,
  CreditCard,
  FilePlus,
  FileText,
  LayoutDashboard,
  Search,
  Settings,
  Trash2,
  User,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { useComboboxSearch } from "@/components/ui/combobox"
import {
  CommandCollection,
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
  CommandStatus,
  useCommandShortcut,
  useCommandShortcutLabel,
} from "@/components/ui/command"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/components/ui/toast"

import { searchPeople, type Person } from "../../data/advanced"
import { Row, Section } from "../../layout/section"
import { PageHeader } from "../../layout/page-header"

type Item = {
  value: string
  label: string
  keywords?: string[]
  icon: LucideIcon
  kind: "page" | "action" | "danger" | "setting" | "person"
  shortcut?: string
}
type Group = { value: string; label: string; items: Item[] }

const baseGroups: Group[] = [
  {
    value: "pages",
    label: "ページ",
    items: [
      { value: "dashboard", label: "ダッシュボード", keywords: ["ホーム", "home"], icon: LayoutDashboard, kind: "page" },
      { value: "customers", label: "顧客一覧", keywords: ["取引先", "クライアント", "customer"], icon: Users, kind: "page" },
      { value: "invoices", label: "請求書", keywords: ["インボイス", "invoice", "せいきゅう"], icon: FileText, kind: "page" },
    ],
  },
  {
    value: "actions",
    label: "操作",
    items: [
      { value: "new-invoice", label: "請求書を作成", keywords: ["新規", "追加"], icon: FilePlus, kind: "action" },
      { value: "new-customer", label: "顧客を登録", keywords: ["新規", "追加"], icon: UserPlus, kind: "action" },
      { value: "delete-customer", label: "選択中の顧客を削除", keywords: ["消す", "delete"], icon: Trash2, kind: "danger" },
    ],
  },
  {
    value: "settings",
    label: "設定",
    items: [
      { value: "profile", label: "プロフィールの設定", keywords: ["アカウント", "名前"], icon: User, kind: "setting" },
      { value: "notifications", label: "通知の設定", keywords: ["メール", "お知らせ"], icon: Bell, kind: "setting" },
      { value: "billing", label: "支払い方法の設定", keywords: ["クレジットカード", "請求先"], icon: CreditCard, kind: "setting" },
      { value: "general", label: "全般の設定", keywords: ["言語", "タイムゾーン"], icon: Settings, kind: "setting" },
    ],
  },
]

function CommandItems({ onRun }: { onRun: (item: Item) => void }) {
  return (
    <CommandList>
      {(group: Group) => (
        <CommandGroup key={group.value} items={group.items} heading={group.label}>
          <CommandCollection>
            {(item: Item) => (
              <CommandItem key={item.value} value={item} onSelect={() => onRun(item)}>
                <item.icon />
                <span className="min-w-0 flex-1 [word-break:auto-phrase]">{item.label}</span>
                {item.shortcut && <CommandShortcut>{item.shortcut}</CommandShortcut>}
              </CommandItem>
            )}
          </CommandCollection>
        </CommandGroup>
      )}
    </CommandList>
  )
}

const shortcutKeys = [
  { value: "k", label: "K" },
  { value: "j", label: "J" },
]

// 2 つ目の Command。表示している間は、後から登録されたこちらだけがショートカットに反応する。
function SecondCommand({ shortcutKey }: { shortcutKey: string }) {
  const [open, setOpen] = useState(false)
  useCommandShortcut(() => setOpen((o) => !o), { key: shortcutKey })
  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="ヘルプの検索">
      <Command items={[{ value: "help", label: "ヘルプ", items: [{ value: "guide", label: "使い方の案内", icon: FileText, kind: "page" }] }]}>
        <CommandInput placeholder="ヘルプを検索" aria-label="ヘルプを検索" />
        <CommandItems onRun={() => setOpen(false)} />
      </Command>
    </CommandDialog>
  )
}

export function CommandPage() {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [shortcutEnabled, setShortcutEnabled] = useState(true)
  const [shortcutKey, setShortcutKey] = useState("k")
  const [second, setSecond] = useState(false)
  const label = useCommandShortcutLabel(shortcutKey)
  // Command を開く前にフォーカスがあった要素。確認の Alert Dialog を閉じた後に、フォーカスを戻す。
  const returnFocus = useRef<HTMLElement | null>(null)
  const [page, setPage] = useState("ダッシュボード")
  const [log, setLog] = useState<string[]>([])
  const [confirm, setConfirm] = useState(false)
  const search = useComboboxSearch<Person>({ search: searchPeople, minLength: 2 })

  useCommandShortcut(() => changeOpen(!open), { enabled: shortcutEnabled, key: shortcutKey })

  // 担当者はサーバー側の検索の結果を、検索文字列が 2 文字以上のときだけ「担当者」のグループに加える。
  const groups = useMemo<Group[]>(() => {
    if (search.items.length === 0) return baseGroups
    return [
      ...baseGroups,
      {
        value: "people",
        label: "担当者",
        items: search.items.map((p) => ({ value: p.value, label: p.label, keywords: [p.email, p.team], icon: User, kind: "person" as const })),
      },
    ]
  }, [search.items])

  // 実行の処理は製品が行う。ここではページの移動と操作を、画面の状態の変化で模擬する。
  const changeOpen = (o: boolean) => {
    if (o && !open) returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setOpen(o)
    if (!o) search.onQueryChange("")
  }
  const run = (item: Item) => {
    changeOpen(false)
    if (item.kind === "danger") {
      // 危険な操作は直接実行せず、Alert Dialog で確かめる。
      setConfirm(true)
      return
    }
    if (item.kind === "page" || item.kind === "setting") setPage(item.label)
    else if (item.kind === "person") setPage(`担当者：${item.label}`)
    else toast({ variant: "success", title: `「${item.label}」を開きました` })
    setLog((l) => [item.label, ...l].slice(0, 5))
  }

  return (
    <article>
      <PageHeader
        name="Command"
        lead="機能、ページ、情報へ素早く移動する。通常のナビゲーションを補助するものであり、置き換えない。"
      />

      <Section
        title="起動"
        lead="ショートカット（macOS は Cmd + K、それ以外は Ctrl + K）と、明示的な検索ボタンの両方で開く。ショートカットを知らない人も、ボタンから使える。"
      >
        <Row label="検索ボタン" note="ボタンにショートカットを併記する">
          <Button variant="outline" onClick={() => changeOpen(true)} data-testid="command-open" className="min-w-64 justify-start text-muted-foreground">
            <Search />
            <span className="flex-1 text-left">ページや操作を検索</span>
            {/* ショートカットの表示は Hydration の後に決まる（サーバーでは表示しない） */}
            {label && shortcutEnabled && (
              <kbd aria-hidden="true" className="font-sans text-caption" data-testid="command-shortcut-label">
                {label}
              </kbd>
            )}
          </Button>
        </Row>
        <Row label="ショートカット" note="製品が設定・解除できる">
          <label className="flex min-h-control items-center gap-3 text-ui">
            <Switch checked={shortcutEnabled} onCheckedChange={setShortcutEnabled} data-testid="command-shortcut-toggle" />
            {label ?? "ショートカット"} で開く
          </label>
          <div className="flex items-center gap-3 text-ui">
            <span id="command-key-label">キー</span>
            <Select items={shortcutKeys} value={shortcutKey} onValueChange={(v) => v && setShortcutKey(v as string)}>
              <SelectTrigger size="sm" aria-labelledby="command-key-label" className="w-24" data-testid="command-key">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {shortcutKeys.map((k) => (
                  <SelectItem key={k.value} value={k.value}>
                    {k.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </Row>
        <Row label="複数の Command" note="後から表示した Command だけが反応する。通常はアプリケーションに 1 つだけ置く">
          <label className="flex min-h-control items-center gap-3 text-ui">
            <Switch checked={second} onCheckedChange={setSecond} data-testid="command-second-toggle" />
            ヘルプの検索を表示する
          </label>
          {second && <SecondCommand shortcutKey={shortcutKey} />}
        </Row>
        <Row label="別の Overlay" note="Dialog が開いている間は、ショートカットで Command を開かない">
          <Dialog>
            <DialogTrigger render={<Button variant="secondary" data-testid="command-other-dialog-open" />}>Dialog を開く</DialogTrigger>
            <DialogContent size="sm" data-testid="command-other-dialog">
              <DialogHeader>
                <DialogTitle>顧客の詳細</DialogTitle>
                <DialogDescription>この Dialog を開いている間は、ショートカットで Command が開かない。</DialogDescription>
              </DialogHeader>
            </DialogContent>
          </Dialog>
        </Row>
        <Row label="実行の結果" note="ページの移動と操作の実行を模擬する">
          <div className="flex flex-col gap-1 text-ui">
            <p data-testid="command-page">現在のページ：{page}</p>
            <p data-testid="command-log" className="text-muted-foreground">
              最近の実行：{log.join("、") || "なし"}
            </p>
          </div>
        </Row>
        <Row label="ほかの入力との競合" note="入力欄で IME の変換中は反応しない">
          <input
            aria-label="メモ"
            placeholder="ここで文字を入力しても、変換中は開かない"
            data-testid="command-other-input"
            className="h-control w-full max-w-sm rounded-md border border-input px-4 text-body outline-none focus-visible:focus-ring"
          />
        </Row>
        <Row label="リッチテキストの編集" note="contenteditable の中では、リンクの挿入などに使われるため反応しない">
          <div
            contentEditable
            suppressContentEditableWarning
            role="textbox"
            aria-label="議事録"
            aria-multiline="true"
            data-testid="command-editable"
            className="min-h-24 w-full max-w-sm rounded-md border border-input p-4 text-body outline-none focus-visible:focus-ring"
          >
            議事録を入力する
          </div>
        </Row>
      </Section>

      <Section
        title="埋め込み"
        lead="Command は Dialog の外にも置ける。↑↓ で移動し、Enter で実行する。ページの中では、通常は Combobox を使う。"
      >
        <Row label="グループ化された候補">
          <div className="w-full max-w-[40rem] rounded-xl border border-border" data-testid="command-inline">
            <Command items={baseGroups} className="max-h-96 rounded-xl">
              <CommandInput placeholder="ページや操作を検索" aria-label="ページや操作を検索" />
              <CommandEmpty>一致する項目がありません</CommandEmpty>
              <CommandItems onRun={run} />
            </Command>
          </div>
        </Row>
      </Section>

      <CommandDialog open={open} onOpenChange={changeOpen}>
        <Command items={groups} onValueChange={search.onQueryChange} data-testid="command-dialog">
          <CommandInput placeholder="ページ、操作、設定、担当者を検索" aria-label="ページ、操作、設定、担当者を検索" />
          {search.status === "loading" || search.status === "error" ? (
            <CommandStatus status={search.status} loadingMessage="担当者を検索しています" errorMessage="担当者を検索できませんでした。" onRetry={search.retry} />
          ) : null}
          <CommandEmpty>一致する項目がありません。別の言葉で検索してください。</CommandEmpty>
          <CommandItems onRun={run} />
        </Command>
      </CommandDialog>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent size="sm" data-testid="command-confirm" finalFocus={returnFocus}>
          <AlertDialogHeader>
            <AlertDialogTitle>選択中の顧客を削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>削除した顧客は元に戻せません。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                setConfirm(false)
                setLog((l) => ["選択中の顧客を削除", ...l].slice(0, 5))
                toast({ variant: "success", title: "顧客を削除しました" })
              }}
            >
              削除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </article>
  )
}
