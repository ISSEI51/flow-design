import { useState } from "react"
import { ArrowUpDown, Copy, Download, Ellipsis, Pencil, Trash, UserPlus } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Field, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

import { customers } from "../../data/customers"
import { industries } from "../../data/industries"
import { Compare, Row, Section } from "../../layout/section"
import { PageHeader } from "../../layout/page-header"

// 行の操作。関連する操作をまとめ、危険な操作は区切り線で分けて最後に置く。
export function CustomerActions({
  name,
  onSelect,
  testId,
  align = "end",
}: {
  name: string
  onSelect?: (action: string) => void
  testId?: string
  align?: "start" | "end"
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="icon-sm" aria-label={`${name}の操作`} data-testid={testId && `${testId}-trigger`} />}
      >
        <Ellipsis />
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} data-testid={testId}>
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => onSelect?.("編集")}>
            <Pencil />
            編集
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onSelect?.("複製")}>
            <Copy />
            複製
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onSelect?.("CSV で書き出す")}>
            <Download />
            CSV で書き出す
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={() => onSelect?.("削除")}>
          <Trash />
          削除
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function ActionsDemo() {
  const [last, setLast] = useState("")
  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex items-center gap-2">
        <span className="text-ui">{customers[0].name}</span>
        <CustomerActions name={customers[0].name} testId="menu-actions" align="start" onSelect={(a) => setLast(a)} />
      </div>
      <p role="status" data-testid="menu-actions-status" className="text-ui text-muted-foreground">
        {last ? `「${last}」を選びました` : ""}
      </p>
    </div>
  )
}

const columns = ["会社名", "担当者", "状態", "最終更新", "電話番号"]

function ViewOptions() {
  const [visible, setVisible] = useState<string[]>(["会社名", "担当者", "状態"])
  const [sort, setSort] = useState("updated")
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" data-testid="menu-view-trigger" />}>
        <ArrowUpDown />
        表示と並べ替え
      </DropdownMenuTrigger>
      <DropdownMenuContent data-testid="menu-view">
        <DropdownMenuGroup>
          <DropdownMenuLabel>並べ替え</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={sort} onValueChange={(v) => setSort(v as string)}>
            <DropdownMenuRadioItem value="updated">更新日の新しい順</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="name">会社名の順</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>表示する列</DropdownMenuLabel>
          {columns.map((c) => (
            <DropdownMenuCheckboxItem
              key={c}
              checked={visible.includes(c)}
              closeOnClick={false}
              onCheckedChange={(on) => setVisible((v) => (on ? [...v, c] : v.filter((x) => x !== c)))}
            >
              {c}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function DropdownMenuPage() {
  return (
    <article>
      <PageHeader
        name="Dropdown Menu"
        lead="いくつかの操作から、実行する操作を 1 つ選ぶ。選ぶと閉じる。フォームで値を選ぶ場合は Select を使う。"
      />

      <Section
        title="操作の選択"
        lead="↑↓ で移動し、Enter か Space で実行する。文字を入力すると、先頭が一致する項目へ移る。Escape で閉じ、フォーカスをトリガーに戻す。"
      >
        <Row label="行の操作" note="危険な操作は区切り線の後に、destructive の色で置く">
          <ActionsDemo />
        </Row>
        <Row label="アイコンのない項目" note="inset で、アイコンのある項目と文字の位置をそろえる">
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="secondary" data-testid="menu-inset-trigger" />}>請求書</DropdownMenuTrigger>
            <DropdownMenuContent data-testid="menu-inset">
              <DropdownMenuItem>
                <Download />
                PDF で書き出す
                <DropdownMenuShortcut>⌘P</DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuItem inset data-testid="menu-inset-item">
                再発行
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger data-testid="menu-sub-trigger">
                  <UserPlus />
                  送付先を変更
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent data-testid="menu-sub">
                  <DropdownMenuItem>経理部</DropdownMenuItem>
                  <DropdownMenuItem>営業部</DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            </DropdownMenuContent>
          </DropdownMenu>
        </Row>
      </Section>

      <Section title="選択の状態" lead="表示の切り替えなど、メニューの中で状態を選ぶ項目。列の表示は、続けて選べるように閉じない。">
        <Row label="並べ替えと列">
          <ViewOptions />
        </Row>
      </Section>

      <Section title="位置と長い文字" lead="画面の端では、はみ出さないように位置を変える。長い項目は省略せずに折り返す。">
        <Row label="右端">
          <div className="flex w-full justify-end">
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="表示の操作" data-testid="menu-edge-trigger" />}>
                <Ellipsis />
              </DropdownMenuTrigger>
              <DropdownMenuContent data-testid="menu-edge" className="max-w-[min(var(--available-width),20rem)]">
                <DropdownMenuItem>
                  <Download />
                  選んだ 128 件の顧客と、その取引の履歴をまとめて CSV で書き出す
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Copy />
                  Copy the shareable link to this filtered customer list
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </Row>
      </Section>

      <Section title="良い例と悪い例">
        <Compare
          bad={
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" />}>業種を選ぶ</DropdownMenuTrigger>
              <DropdownMenuContent>
                {industries.slice(0, 6).map((i) => (
                  <DropdownMenuItem key={i.value}>{i.label}</DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          }
          badNote="フォームの値を Dropdown Menu で選ぶと、選んだ結果が欄に残らず、フォームとして送信もされない。"
          good={
            <Field className="max-w-xs">
              <FieldLabel>業種</FieldLabel>
              <Select items={industries}>
                <SelectTrigger>
                  <SelectValue placeholder="選択してください" />
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
          }
          goodNote="値を選ぶときは Select を使う。Dropdown Menu は操作を選ぶときに使う。"
        />
        <Compare
          bad={
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="山田商事の操作" />}>
                <Ellipsis />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem variant="destructive">
                  <Trash />
                  削除
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Pencil />
                  編集
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Copy />
                  複製
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          }
          badNote="危険な操作が先頭にあり、他の操作と区別されていない。押し間違えやすい。"
          good={<CustomerActions name="山田商事" align="start" />}
          goodNote="関連する操作をまとめ、危険な操作は区切り線の後に置く。"
        />
      </Section>
    </article>
  )
}
