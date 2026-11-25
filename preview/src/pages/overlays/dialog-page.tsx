import { useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

import { Compare, Row, Section } from "../../layout/section"
import { PageHeader } from "../../layout/page-header"
import { DiscardAlert } from "./discard-alert"

const sizes = [
  { size: "sm", name: "Small", width: "360px", title: "メモを追加", body: "short" },
  { size: "default", name: "Default", width: "480px", title: "担当者を変更", body: "form" },
  { size: "lg", name: "Large", width: "640px", title: "請求先を編集", body: "wide" },
  { size: "xl", name: "Extra Large", width: "800px", title: "取り込む内容を確認", body: "table" },
] as const

const departments = [
  { value: "sales1", label: "営業第一部" },
  { value: "sales2", label: "営業第二部" },
  { value: "support", label: "カスタマーサポート" },
  { value: "billing", label: "請求管理" },
]

function SizeBody({ kind }: { kind: (typeof sizes)[number]["body"] }) {
  if (kind === "short")
    return (
      <Field>
        <FieldLabel>メモ</FieldLabel>
        <Textarea rows={3} />
      </Field>
    )
  if (kind === "form")
    return (
      <Field>
        <FieldLabel>新しい担当者</FieldLabel>
        <Input defaultValue="佐藤 花子" />
      </Field>
    )
  if (kind === "wide")
    return (
      <FieldGroup className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel>請求先の会社名</FieldLabel>
          <Input defaultValue="山田商事" />
        </Field>
        <Field>
          <FieldLabel>部署</FieldLabel>
          <Input defaultValue="経理部" />
        </Field>
      </FieldGroup>
    )
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[32rem] text-left text-ui">
        <thead className="text-muted-foreground">
          <tr className="border-b border-border">
            <th className="py-2 pr-4 font-medium">会社名</th>
            <th className="py-2 pr-4 font-medium">担当者</th>
            <th className="py-2 pr-4 font-medium">メールアドレス</th>
            <th className="py-2 font-medium">結果</th>
          </tr>
        </thead>
        <tbody>
          {[
            ["山田商事", "山田 太郎", "yamada@example.com", "追加"],
            ["佐藤製作所", "佐藤 花子", "sato@example.com", "更新"],
            ["高橋建設", "高橋 次郎", "takahashi@example.com", "追加"],
          ].map((r) => (
            <tr key={r[0]} className="border-b border-border">
              {r.map((c, i) => (
                <td key={i} className="py-2 pr-4">
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// 未保存の変更を持つ Dialog。未保存かどうかの判断は、この画面が行う。
function EditCompanyDialog() {
  const saved = { name: "山田商事", phone: "03-1234-5678" }
  const [open, setOpen] = useState(false)
  const [values, setValues] = useState(saved)
  const [current, setCurrent] = useState(saved)
  const [confirm, setConfirm] = useState(false)
  const [status, setStatus] = useState("")
  const dirty = values.name !== current.name || values.phone !== current.phone

  return (
    <div className="flex flex-col items-start gap-2">
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (next) setValues(current)
        }}
        unsavedChanges={dirty}
        onDiscardRequest={() => setConfirm(true)}
      >
        <DialogTrigger render={<Button variant="secondary" data-testid="dialog-dirty-trigger" />}>会社情報を編集</DialogTrigger>
        <DialogContent data-testid="dialog-dirty">
          <form
            className="contents"
            onSubmit={(e) => {
              e.preventDefault()
              setCurrent(values)
              setOpen(false)
              setStatus("会社情報を保存しました")
            }}
          >
            <DialogHeader>
              <DialogTitle>会社情報を編集</DialogTitle>
              <DialogDescription>変更は保存するまで反映されません。</DialogDescription>
            </DialogHeader>
            <DialogBody>
              <FieldGroup>
                <Field>
                  <FieldLabel>会社名</FieldLabel>
                  <Input
                    data-testid="dialog-dirty-name"
                    value={values.name}
                    onChange={(e) => setValues({ ...values, name: e.target.value })}
                  />
                </Field>
                <Field>
                  <FieldLabel>電話番号</FieldLabel>
                  <Input
                    type="tel"
                    value={values.phone}
                    onChange={(e) => setValues({ ...values, phone: e.target.value })}
                  />
                </Field>
              </FieldGroup>
            </DialogBody>
            <DialogFooter>
              <DialogClose render={<Button variant="secondary" />}>キャンセル</DialogClose>
              <Button type="submit">変更を保存</Button>
            </DialogFooter>
          </form>
          <DiscardAlert
            testId="dialog-discard"
            open={confirm}
            onOpenChange={setConfirm}
            onDiscard={() => {
              setConfirm(false)
              setValues(current)
              setOpen(false)
            }}
          />
        </DialogContent>
      </Dialog>
      <p role="status" data-testid="dialog-dirty-status" className="text-ui text-muted-foreground">
        {status || `現在の会社名：${current.name}`}
      </p>
    </div>
  )
}

function SelectInDialog() {
  const [dept, setDept] = useState<string | null>(null)
  return (
    <Dialog>
      <DialogTrigger render={<Button variant="secondary" data-testid="dialog-select-trigger" />}>担当部署を割り当てる</DialogTrigger>
      <DialogContent data-testid="dialog-select">
        <DialogHeader>
          <DialogTitle>担当部署を割り当てる</DialogTitle>
          <DialogDescription>山田商事の問い合わせを受ける部署を選びます。</DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel>担当部署</FieldLabel>
          <Select items={departments} value={dept} onValueChange={(v) => setDept(v as string | null)}>
            <SelectTrigger data-testid="dialog-select-field">
              <SelectValue placeholder="選択してください" />
            </SelectTrigger>
            <SelectContent>
              {departments.map((d) => (
                <SelectItem key={d.value} value={d.value}>
                  {d.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription>Escape を押すと、開いている選択肢だけが閉じる。</FieldDescription>
        </Field>
        <DialogFooter>
          <DialogClose render={<Button variant="secondary" />}>キャンセル</DialogClose>
          <DialogClose render={<Button />}>割り当てる</DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const terms = Array.from({ length: 14 }, (_, i) => i + 1)

export function DialogPage() {
  return (
    <article>
      <PageHeader
        name="Dialog"
        lead="今の画面から移動せずに、短い入力や編集を終えるために使う。背景の操作を止め、終わったら元の場所に戻る。"
      />

      <Section
        title="大きさ"
        lead="内容に合わせて 4 段階から選ぶ。画面の幅が足りないときは、画面の端に 16px を残して縮む。"
      >
        {sizes.map((s) => (
          <Row key={s.size} label={s.name} note={`最大幅 ${s.width}`}>
            <Dialog>
              <DialogTrigger render={<Button variant="secondary" data-testid={`dialog-trigger-${s.size}`} />}>
                {s.title}
              </DialogTrigger>
              <DialogContent size={s.size} data-testid={`dialog-${s.size}`}>
                <DialogHeader>
                  <DialogTitle>{s.title}</DialogTitle>
                  <DialogDescription>{`${s.name} の Dialog。最大幅は ${s.width}。`}</DialogDescription>
                </DialogHeader>
                <SizeBody kind={s.body} />
                <DialogFooter>
                  <DialogClose render={<Button variant="secondary" />}>キャンセル</DialogClose>
                  <DialogClose render={<Button />}>{s.size === "xl" ? "3 件を取り込む" : "変更を保存"}</DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </Row>
        ))}
      </Section>

      <Section
        title="未保存の変更"
        lead="内容を変えると、外側のクリックでは閉じなくなる。Escape、閉じるボタン、キャンセルでは、変更を破棄するかを確かめる。変更がなければ、どの操作でもすぐに閉じる。"
      >
        <Row label="編集" note="未保存かどうかは画面が判断し、unsavedChanges で渡す">
          <EditCompanyDialog />
        </Row>
      </Section>

      <Section title="入れ子" lead="Dialog の中で Select を開ける。Escape は最前面の Select だけを閉じ、フォーカスを Select の欄に戻す。">
        <Row label="Select">
          <SelectInDialog />
        </Row>
      </Section>

      <Section title="長い内容" lead="画面の高さを超えると、ヘッダーと操作ボタンを残して内容だけがスクロールする。">
        <Row label="日本語">
          <Dialog>
            <DialogTrigger render={<Button variant="secondary" data-testid="dialog-long-trigger" />}>利用規約の変更点を確認</DialogTrigger>
            <DialogContent size="lg" data-testid="dialog-long">
              <DialogHeader>
                <DialogTitle>2027 年 1 月 1 日から適用される利用規約の変更点を確認してください</DialogTitle>
                <DialogDescription>変更に同意すると、新しい規約が次回の請求から適用されます。</DialogDescription>
              </DialogHeader>
              <DialogBody data-testid="dialog-long-body">
                <ol className="flex list-decimal flex-col gap-4 pl-6 text-body">
                  {terms.map((n) => (
                    <li key={n}>
                      第 {n} 条：データの保管期間、請求書の発行日、問い合わせの受付時間などの記載を、現在の運用に合わせて改めます。
                    </li>
                  ))}
                </ol>
              </DialogBody>
              <DialogFooter>
                <DialogClose render={<Button variant="secondary" />}>あとで確認する</DialogClose>
                <DialogClose render={<Button />}>変更に同意する</DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </Row>
        <Row label="English">
          <Dialog>
            <DialogTrigger render={<Button variant="secondary" data-testid="dialog-english-trigger" />}>Rename workspace</DialogTrigger>
            <DialogContent size="sm" closeLabel="Close" data-testid="dialog-english">
              <DialogHeader>
                <DialogTitle>Rename the Northwind Trading customer workspace</DialogTitle>
                <DialogDescription>Members will see the new name the next time they sign in.</DialogDescription>
              </DialogHeader>
              <Field>
                <FieldLabel>Workspace name</FieldLabel>
                <Input defaultValue="Northwind Trading" />
              </Field>
              <DialogFooter>
                <DialogClose render={<Button variant="secondary" />}>Cancel</DialogClose>
                <DialogClose render={<Button />}>Rename workspace</DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </Row>
      </Section>

      <Section title="良い例と悪い例">
        <Compare
          bad={
            <Dialog>
              <DialogTrigger render={<Button variant="secondary" />}>担当者を変更</DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>確認</DialogTitle>
                </DialogHeader>
                <p>よろしいですか？</p>
                <DialogFooter>
                  <DialogClose render={<Button variant="secondary" />}>いいえ</DialogClose>
                  <DialogClose render={<Button />}>はい</DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          }
          badNote="タイトルとボタンから、何が起きるかがわからない。"
          good={
            <Dialog>
              <DialogTrigger render={<Button variant="secondary" />}>担当者を変更</DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>担当者を変更</DialogTitle>
                  <DialogDescription>山田商事の担当者を、佐藤 花子に変更します。</DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose render={<Button variant="secondary" />}>キャンセル</DialogClose>
                  <DialogClose render={<Button />}>担当者を変更</DialogClose>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          }
          goodNote="タイトルで目的を、ボタンで押した結果を示す。"
        />
        <Compare
          bad={<p className="text-ui">顧客の登録（20 項目、3 段階）を Dialog の中で行う。</p>}
          badNote="長い作業は、閉じたときに失うものが大きく、URL で戻ることもできない。"
          good={<p className="text-ui">顧客の登録は専用のページで行い、Dialog は担当者の変更などの短い編集に使う。</p>}
          goodNote="Dialog には、数項目で終わる入力と確認だけを置く。"
        />
      </Section>
    </article>
  )
}
