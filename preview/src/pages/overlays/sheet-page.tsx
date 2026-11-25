import { useEffect, useRef, useState, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Sheet,
  SheetBody,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  type SheetMode,
} from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"

import { customers as initialCustomers, statusLabel, type Customer } from "../../data/customers"
import { industries } from "../../data/industries"
import { Compare, Row, Section } from "../../layout/section"
import { PageHeader } from "../../layout/page-header"
import { DiscardAlert } from "./discard-alert"
import { CustomerActions } from "./dropdown-menu-page"

type Draft = Pick<Customer, "name" | "industry" | "email" | "phone" | "note">
const pick = (c: Customer): Draft => ({ name: c.name, industry: c.industry, email: c.email, phone: c.phone, note: c.note })
const same = (a: Draft, b: Draft) => (Object.keys(a) as (keyof Draft)[]).every((k) => a[k] === b[k])
const industryLabel = (v: string) => industries.find((i) => i.value === v)?.label ?? v

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-1 border-t border-border py-4 first:border-t-0 first:pt-0">
      <dt className="text-ui text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-body [word-break:auto-phrase] break-words">{children}</dd>
    </div>
  )
}

// 顧客一覧と Sheet。
// - 一覧の会社名を押すと、閲覧（非モーダル）の Sheet を開く。開いたまま別の行を押すと、表示が切り替わる。
// - 「編集」で編集（モーダル）に切り替える。未保存の変更があるときは、閉じる前に破棄を確かめる。
// モードの切り替えは、この画面が mode で指定する。Sheet は推測しない。
function CustomerList() {
  const [list, setList] = useState(initialCustomers)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [mode, setMode] = useState<SheetMode>("view")
  const [draft, setDraft] = useState<Draft | null>(null)
  // 破棄を確かめた後の行き先。閉じる操作なら Sheet を閉じ、キャンセルなら閲覧に戻る。
  const [confirm, setConfirm] = useState<null | "close" | "view">(null)
  const [status, setStatus] = useState("")
  const firstFieldRef = useRef<HTMLInputElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)

  const selected = list.find((c) => c.id === selectedId) ?? null
  const dirty = mode === "edit" && selected !== null && draft !== null && !same(draft, pick(selected))

  const startEdit = () => {
    if (!selected) return
    setDraft(pick(selected))
    setMode("edit")
  }
  const backToView = () => {
    setMode("view")
    setDraft(null)
  }

  // 編集に切り替えたら、最初の入力欄にフォーカスを移す。
  // タッチ操作の端末では、意図せずキーボードが開かないよう、見出しにフォーカスを移す。
  useEffect(() => {
    if (mode !== "edit") return
    const fine = window.matchMedia("(pointer: fine)").matches
    ;(fine ? firstFieldRef.current : titleRef.current)?.focus()
  }, [mode])

  return (
    <div className="flex w-full flex-col gap-4">
      <table className="w-full table-fixed text-left text-ui" data-testid="sheet-list">
        <thead className="text-muted-foreground">
          <tr className="border-b border-border">
            <th className="py-3 pr-4 font-medium">会社名</th>
            <th className="hidden w-32 py-3 pr-4 font-medium sm:table-cell">担当者</th>
            <th className="w-20 py-3 pr-4 font-medium">状態</th>
            <th className="w-12 py-3">
              <span className="sr-only">操作</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {list.map((c) => (
            <tr
              key={c.id}
              aria-current={c.id === selectedId ? "true" : undefined}
              className="border-b border-border aria-[current=true]:bg-accent"
            >
              <td className="py-1 pr-4">
                <Button
                  variant="link"
                  className="min-h-10 text-left"
                  data-testid={`sheet-row-${c.id}`}
                  onClick={() => {
                    setSelectedId(c.id)
                    setMode("view")
                  }}
                >
                  {c.name}
                </Button>
              </td>
              <td className="hidden py-1 pr-4 sm:table-cell">{c.contact}</td>
              <td className="py-1 pr-4">{statusLabel[c.status]}</td>
              <td className="py-1">
                <CustomerActions name={c.name} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p role="status" data-testid="sheet-status" className="text-ui text-muted-foreground">
        {status}
      </p>

      <Sheet
        mode={mode}
        open={selected !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedId(null)
            backToView()
          }
        }}
        unsavedChanges={dirty}
        onDiscardRequest={() => setConfirm("close")}
      >
        <SheetContent data-testid="sheet-customer">
          {selected && mode === "view" && (
            <>
              <SheetHeader>
                <SheetTitle>{selected.name}</SheetTitle>
                <SheetDescription>{`顧客 ID ${selected.id}`}</SheetDescription>
                <div className="mt-2 flex items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={startEdit} data-testid="sheet-edit">
                    編集
                  </Button>
                  <CustomerActions name={selected.name} testId="sheet-actions" align="start" onSelect={(a) => setStatus(`「${a}」を選びました`)} />
                </div>
              </SheetHeader>
              <SheetBody>
                <dl>
                  <Detail label="担当者">{selected.contact}</Detail>
                  <Detail label="業種">{industryLabel(selected.industry)}</Detail>
                  <Detail label="状態">{statusLabel[selected.status]}</Detail>
                  <Detail label="メールアドレス">{selected.email}</Detail>
                  <Detail label="電話番号">{selected.phone}</Detail>
                  <Detail label="住所">{selected.address}</Detail>
                  <Detail label="契約プラン">{selected.plan}</Detail>
                  <Detail label="最終更新">{selected.updated}</Detail>
                  <Detail label="メモ">{selected.note}</Detail>
                </dl>
              </SheetBody>
            </>
          )}
          {selected && mode === "edit" && draft && (
            <form
              className="contents"
              onSubmit={(e) => {
                e.preventDefault()
                setList((l) => l.map((c) => (c.id === selected.id ? { ...c, ...draft } : c)))
                setStatus(`${draft.name}の変更を保存しました`)
                backToView()
              }}
            >
              <SheetHeader>
                <SheetTitle ref={titleRef} tabIndex={-1} className="outline-none">
                  {`${selected.name}を編集`}
                </SheetTitle>
                <SheetDescription>保存するまで、一覧には反映されません。</SheetDescription>
              </SheetHeader>
              <SheetBody>
                <FieldGroup>
                  <Field>
                    <FieldLabel>会社名</FieldLabel>
                    <Input
                      ref={firstFieldRef}
                      data-testid="sheet-field-name"
                      value={draft.name}
                      onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    />
                  </Field>
                  <Field>
                    <FieldLabel>業種</FieldLabel>
                    <Select items={industries} value={draft.industry} onValueChange={(v) => setDraft({ ...draft, industry: v as string })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {industries.map((i) => (
                          <SelectItem key={i.value} value={i.value}>
                            {i.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field>
                    <FieldLabel>メールアドレス</FieldLabel>
                    <Input type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} />
                  </Field>
                  <Field>
                    <FieldLabel>電話番号</FieldLabel>
                    <Input type="tel" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
                  </Field>
                  <Field>
                    <FieldLabel>メモ</FieldLabel>
                    <Textarea rows={5} value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
                  </Field>
                </FieldGroup>
              </SheetBody>
              <SheetFooter>
                <Button
                  type="button"
                  variant="secondary"
                  data-testid="sheet-cancel"
                  onClick={() => (dirty ? setConfirm("view") : backToView())}
                >
                  キャンセル
                </Button>
                <Button type="submit" data-testid="sheet-save">
                  変更を保存
                </Button>
              </SheetFooter>
            </form>
          )}
          <DiscardAlert
            testId="sheet-discard"
            open={confirm !== null}
            onOpenChange={(open) => !open && setConfirm(null)}
            onDiscard={() => {
              if (confirm === "close") setSelectedId(null)
              setConfirm(null)
              backToView()
            }}
          />
        </SheetContent>
      </Sheet>
    </div>
  )
}

const sizes = [
  { size: "sm", name: "Small", width: "360px" },
  { size: "default", name: "Default", width: "480px" },
  { size: "lg", name: "Large", width: "640px" },
] as const

export function SheetPage() {
  return (
    <article>
      <PageHeader
        name="Sheet"
        lead="一覧などの元の画面との関係を保ったまま、詳細の確認や編集を行う。閲覧と編集でモーダルかどうかを切り替え、その指定は画面が行う。"
      />

      <Section
        title="顧客一覧"
        lead="会社名を押すと、閲覧の Sheet が開く。背景は暗くならず、開いたまま別の顧客を選ぶと表示が切り替わる。「編集」を押すと、背景の操作を止める編集に切り替わる。"
      >
        <CustomerList />
      </Section>

      <Section title="幅" lead="左右に開くときは 3 段階から選ぶ。画面の幅が足りないときは、画面の幅全体に広がる。">
        {sizes.map((s) => (
          <Row key={s.size} label={s.name} note={`幅 ${s.width}`}>
            <Sheet mode="view">
              <SheetTrigger render={<Button variant="secondary" data-testid={`sheet-trigger-${s.size}`} />}>
                {`${s.name} の Sheet を開く`}
              </SheetTrigger>
              <SheetContent size={s.size} data-testid={`sheet-${s.size}`}>
                <SheetHeader>
                  <SheetTitle>{`${s.name}（${s.width}）`}</SheetTitle>
                  <SheetDescription>閲覧の Sheet。閉じるボタンか Escape で閉じる。</SheetDescription>
                </SheetHeader>
                <SheetBody>
                  <p>{initialCustomers[2].note}</p>
                </SheetBody>
                <SheetFooter>
                  <SheetClose render={<Button variant="secondary" />}>閉じる</SheetClose>
                </SheetFooter>
              </SheetContent>
            </Sheet>
          </Row>
        ))}
        <Row label="左から開く" note='side="left"'>
          <Sheet mode="view">
            <SheetTrigger render={<Button variant="secondary" />}>左の Sheet を開く</SheetTrigger>
            <SheetContent side="left" size="sm">
              <SheetHeader>
                <SheetTitle>絞り込みの条件</SheetTitle>
              </SheetHeader>
              <SheetBody>
                <p className="text-ui text-muted-foreground">表示方向は shadcn/ui と同じく side で指定する。</p>
              </SheetBody>
            </SheetContent>
          </Sheet>
        </Row>
      </Section>

      <Section title="良い例と悪い例">
        <Compare
          bad={<p className="text-ui">一覧から顧客の詳細を、中央の Dialog で開く。</p>}
          badNote="一覧が隠れ、別の顧客を見るたびに閉じて開き直す必要がある。"
          good={<p className="text-ui">一覧から顧客の詳細を、閲覧の Sheet で開く。</p>}
          goodNote="一覧を見ながら、別の顧客へ表示を切り替えられる。"
        />
        <Compare
          bad={<p className="text-ui">編集中の Sheet を、外側のクリックで閉じられるようにする。</p>}
          badNote="一覧を押したつもりで、入力した内容が失われる。"
          good={<p className="text-ui">編集は mode="edit" にし、未保存の変更があるときは破棄を確かめる。</p>}
          goodNote="背景の操作を止め、編集の完了、キャンセル、変更の破棄をはっきり分ける。"
        />
      </Section>
    </article>
  )
}
