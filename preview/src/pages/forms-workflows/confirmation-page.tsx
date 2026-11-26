import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/toast"
import { ConfirmActionDialog, useUndoableAction } from "@/patterns/confirm-action"

import { formsServer, wait } from "../../data/forms-workflows/server"
import { PageHeader } from "../../layout/page-header"
import { Compare, Row, Section } from "../../layout/section"
import { Bullets } from "../app-structure/parts"
import { AppLink, Mock, Rules } from "../data-browsing/doc-parts"
import { ServerModes } from "./doc-parts"

const run = async () => {
  await wait(formsServer.latency.action)
  if (formsServer.actionMode === "fail") throw new Error("サーバーに接続できませんでした")
}

// 確かめずに実行する（影響が小さく、すぐに直せる）
function RenameExample() {
  const { toast } = useToast()
  const [name, setName] = useState("4 月の訪問の予定")
  const [saved, setSaved] = useState(name)
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={async (e) => {
        e.preventDefault()
        try {
          await run()
          setSaved(name)
          toast({ variant: "success", title: "名前を変えました" })
        } catch {
          toast({ variant: "destructive", title: "名前を変えられませんでした", description: "時間をおいて、もう一度保存してください" })
        }
      }}
    >
      <Field className="w-64">
        <FieldLabel>一覧の名前</FieldLabel>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Button type="submit" variant="secondary" disabled={name === saved || !name.trim()}>
        名前を変える
      </Button>
    </form>
  )
}

const tasks = ["見積もりの送付", "契約書の確認", "請求先の登録"]

// 安全に取り消せる：確かめずに実行し、期限まで「元に戻す」を示す
function UndoExample() {
  const undo = useUndoableAction({ windowMs: 8000 })
  const [items, setItems] = useState(tasks)
  const [archived, setArchived] = useState<string[]>([])
  // 実行中の項目は、もう一度押せない（同じ項目を二重にアーカイブしない）
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set())
  return (
    <div className="flex w-full max-w-md flex-col gap-3" data-testid="undo-example">
      <ul className="flex flex-col divide-y divide-border">
        {items.map((t) => (
          <li key={t} className="flex items-center justify-between gap-4 py-2 text-ui">
            {t}
            <Button
              size="sm"
              variant="ghost"
              loading={pending.has(t)}
              onClick={() =>
                void undo.run({
                  perform: async () => {
                    setPending((p) => new Set([...p, t]))
                    try {
                      await run()
                    } finally {
                      setPending((p) => new Set([...p].filter((x) => x !== t)))
                    }
                    setItems((l) => l.filter((x) => x !== t))
                    setArchived((a) => [...a, t])
                    return t
                  },
                  undo: async (task) => {
                    await wait(formsServer.latency.action)
                    if (formsServer.undoMode === "fail") throw new Error("サーバーに接続できませんでした。アーカイブ済みの一覧から戻してください")
                    // アーカイブ済みの一覧からすでに戻した場合は、二重に戻さない
                    setArchived((a) => a.filter((x) => x !== task))
                    setItems((l) => (l.includes(task) ? l : [...l, task]))
                  },
                  title: `「${t}」をアーカイブしました`,
                  undoneTitle: `「${t}」を元に戻しました`,
                  expiredDescription: "アーカイブ済みの一覧から戻せます",
                })
              }
            >
              アーカイブ
            </Button>
          </li>
        ))}
      </ul>
      {archived.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-caption text-muted-foreground">アーカイブ済み（Toast が消えた後も、ここから戻せる）</p>
          <ul className="flex flex-col">
            {archived.map((t) => (
              <li key={t} className="flex items-center justify-between gap-4 text-ui">
                {t}
                <Button
                  size="xs"
                  variant="secondary"
                  onClick={() => {
                    setArchived((a) => a.filter((x) => x !== t))
                    setItems((l) => (l.includes(t) ? l : [...l, t]))
                  }}
                >
                  元に戻す
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

const invoices = ["INV-2611 株式会社山田商事", "INV-2612 有限会社佐藤工業", "INV-2613 高橋システム株式会社"]

function SendInvoices() {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)} data-testid="confirm-send-open">
        請求書を送信
      </Button>
      <ConfirmActionDialog
        open={open}
        onOpenChange={setOpen}
        title="3件の請求書を送信しますか？"
        description="各社の請求先のメールアドレスに送ります。送信した請求書は取り消せません（訂正は、訂正の請求書で行います）。"
        confirmLabel="3件を送信"
        retryLabel="もう一度送信"
        data-testid="confirm-send"
        onConfirm={async () => {
          try {
            await run()
          } catch {
            return { error: "送信できませんでした。サーバーに接続できません。まだ送信していないため、もう一度送信できます。" }
          }
          toast({ variant: "success", title: "3件の請求書を送信しました" })
        }}
      >
        <ul className="flex flex-col gap-1 text-ui">
          {invoices.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      </ConfirmActionDialog>
    </>
  )
}

function DeleteContact() {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="secondary" className="text-destructive" onClick={() => setOpen(true)} data-testid="confirm-delete-open">
        担当者を削除
      </Button>
      <ConfirmActionDialog
        open={open}
        onOpenChange={setOpen}
        variant="destructive"
        title="担当者「山田 太郎」を削除しますか？"
        description="この担当者に紐づく 12件の商談は、担当者が未設定になります。削除した担当者は元に戻せません。"
        confirmLabel="担当者を削除"
        data-testid="confirm-delete"
        onConfirm={async () => {
          try {
            await run()
          } catch {
            return { error: "削除できませんでした。サーバーに接続できません。時間をおいて、もう一度実行してください。" }
          }
          toast({ variant: "success", title: "担当者「山田 太郎」を削除しました" })
        }}
      />
    </>
  )
}

function DeleteWorkspace() {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant="secondary" className="text-destructive" onClick={() => setOpen(true)} data-testid="confirm-workspace-open">
        ワークスペースを削除
      </Button>
      <ConfirmActionDialog
        open={open}
        onOpenChange={setOpen}
        variant="destructive"
        title="ワークスペース「九州支店」を削除しますか？"
        description="顧客 128件、契約、請求、取り込みの履歴を含む、すべてのデータを削除します。削除したデータは元に戻せません。"
        confirmationText="九州支店"
        confirmationLabel="確認のため、ワークスペースの名前「九州支店」を入力してください"
        confirmLabel="ワークスペースを削除"
        data-testid="confirm-workspace"
        onConfirm={async () => {
          try {
            await run()
          } catch {
            return { error: "削除できませんでした。サーバーに接続できません。時間をおいて、もう一度実行してください。" }
          }
          toast({ variant: "success", title: "ワークスペースの削除を受け付けました", description: "この例では、データを削除していません" })
        }}
      />
    </>
  )
}

export function ConfirmationPage() {
  return (
    <article>
      <PageHeader
        eyebrow="Patterns / Forms & Workflows"
        name="Confirmation"
        lead="確認の要否は、影響の範囲、危険の大きさ、取り消せるかで決める。安全に取り消せる操作は確かめずに実行し、取り消しを示す。確かめる場合は、対象、件数、内容、影響を具体的に書く。"
      />

      <Section title="操作できる例">
        <div className="mb-8">
          <ServerModes keys={["actionMode", "undoMode"]} name="cf" />
        </div>
        <Row label="確かめない" note="影響が小さく、すぐに直せる">
          <RenameExample />
        </Row>
        <Row label="取り消せる" note="確かめずに実行し、8 秒の間「元に戻す」を示す">
          <UndoExample />
        </Row>
        <Row label="通常の確認" note="影響が大きい。Primary">
          <SendInvoices />
        </Row>
        <Row label="破壊的な操作" note="取り消せない。Destructive">
          <DeleteContact />
        </Row>
        <Row label="追加の確認" note="極めて重大。対象の名前の入力">
          <DeleteWorkspace />
        </Row>
        <div className="pt-6">
          <AppLink href="#/forms-app?page=customers">一括の削除と、確認の表示中の対象の変更を検証画面で試す</AppLink>
        </div>
      </Section>

      <Section title="判断の基準">
        <Rules
          rows={[
            ["影響が小さい", "確かめない。結果を Toast かインラインで知らせる"],
            ["安全に取り消せる", "確かめずに実行し、Toast の「元に戻す」で取り消せるようにする（useUndoableAction）。期限を過ぎたら取り消しを受け付けない"],
            ["影響が大きい", "確認の Dialog で、対象、件数、操作の内容、影響の範囲を示す（ConfirmActionDialog）"],
            ["取り消せない", "Alert Dialog。実行のボタンは Destructive。取り消せないことを書く"],
            ["極めて重大", "対象の名前の入力を求める。入力が一致するまで実行できない。本人確認や権限の確認の代わりにはしない（再認証、承認は製品の責務）"],
          ]}
        />
      </Section>

      <Section title="確認の Dialog">
        <Bullets
          items={[
            "見出しに操作と対象（「3件の請求書を送信しますか？」）。説明に影響と取り消せるか。実行のボタンに操作と件数（「3件を送信」）。「確認」「本当によろしいですか？」だけで済ませない。同じ情報を見出しと説明で繰り返さない。",
            "初期フォーカスはキャンセル。Escape はキャンセル。外側のクリックでは閉じない。開いた直後の Enter で実行されない。",
            "実行中は閉じない（キャンセルを無効にする）。二重の実行を止める。失敗したら閉じずに原因を示し、もう一度実行できる。",
            "確認した対象と、実際に処理する対象を一致させる。表示中に対象が変わったら、そのことを示して確かめ直させる。古い確認の内容で別の対象を実行しない。権限、範囲、整合性の最終の確認はバックエンドが行う。",
            "危険な操作は、Dropdown Menu の末尾に分けるか、設定の画面では独立したセクションに置く。大きな赤い枠や過剰な警告を標準にしない。",
            "実行の前の確認、処理中の表示、実行の後の結果を分ける。結果は Toast かインラインで知らせ、完了の Dialog を出さない。",
          ]}
        />
      </Section>

      <Section title="比較">
        <Compare
          bad={
            <Mock label="「本当によろしいですか？」だけの確認">
              <div className="flex flex-col gap-2 rounded-md border border-border p-3 text-caption">
                <span className="font-medium">確認</span>
                <span className="text-muted-foreground">本当によろしいですか？</span>
                <span className="self-end rounded-md bg-primary px-3 py-1 text-primary-foreground">OK</span>
              </div>
            </Mock>
          }
          badNote="何に、どれだけの影響があるかわからない。確かめずに押す習慣がつく。"
          good={
            <Mock label="対象、件数、影響を示した削除の確認">
              <div className="flex flex-col gap-2 rounded-md border border-border p-3 text-caption">
                <span className="font-medium">3件の顧客を削除しますか？</span>
                <span className="text-muted-foreground">契約と請求の履歴も表示できなくなります。元に戻せません。</span>
                <span className="self-end rounded-md bg-destructive px-3 py-1 text-destructive-foreground">3件を削除</span>
              </div>
            </Mock>
          }
          goodNote="何をすると何が起きるかを書き、ボタンの名前を操作と件数にする。"
        />
      </Section>

      <Section title="Undo の規則">
        <Bullets
          items={[
            "実際に安全に取り消せる場合だけ使う。取り消しの処理（バックエンド）は製品の責務である。",
            "1 回の実行ごとに別の通知と別の取り消しを持つ。続けて実行しても、別の操作を取り消さない。",
            "取り消しの失敗は、失敗の通知で示す。Toast は消えるため、重要な復元の手段は画面にも残す（アーカイブ済みの一覧など）。",
          ]}
        />
        <Field className="mt-6 max-w-md">
          <FieldDescription>例の Toast は 8 秒で閉じ、その後の「元に戻す」は受け付けない。ポインターを重ねて Toast が残っても、期限は延びない。</FieldDescription>
        </Field>
      </Section>
    </article>
  )
}
