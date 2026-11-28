import { useRef, useState } from "react"
import { Trash } from "lucide-react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"

import { Compare, Row, Section } from "../../layout/section"
import { PageHeader } from "../../layout/page-header"

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

// 取り消せない削除。処理中は「削除する」を loading にし、キャンセルと Escape も受け付けない。
function DeleteCustomer() {
  const [open, setOpen] = useState(false)
  const [pending, setPending] = useState(false)
  const [status, setStatus] = useState("")
  // 製品が AlertDialogContent に ref を渡しても、キャンセルへの初期フォーカスは保たれる。
  const contentRef = useRef<HTMLDivElement>(null)
  const [refTag, setRefTag] = useState("")
  return (
    <div className="flex flex-col items-start gap-2">
      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          if (pending) return
          setOpen(next)
        }}
        onOpenChangeComplete={(next) => setRefTag(next ? (contentRef.current?.getAttribute("data-slot") ?? "") : "")}
      >
        <AlertDialogTrigger render={<Button variant="destructive" data-testid="alert-delete-trigger" />}>
          山田商事を削除
        </AlertDialogTrigger>
        <AlertDialogContent ref={contentRef} data-testid="alert-delete">
          <AlertDialogHeader>
            <AlertDialogTitle>山田商事を削除しますか？</AlertDialogTitle>
            <AlertDialogDescription>
              取引の履歴 24 件と請求書 3 件も削除されます。この操作は取り消せません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={pending}>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              loading={pending}
              data-testid="alert-delete-action"
              onClick={async () => {
                setPending(true)
                setStatus("山田商事を削除しています")
                await wait(800)
                setPending(false)
                setOpen(false)
                setStatus("山田商事を削除しました")
              }}
            >
              削除する
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <p role="status" data-testid="alert-delete-status" className="text-ui text-muted-foreground">
        {status}
      </p>
      <span hidden data-testid="alert-delete-ref">
        {refTag}
      </span>
    </div>
  )
}

// 大量のデータの完全な削除。対象の名前の入力を追加の確認にする（必要かどうかは製品が判断する）。
function DeleteWorkspace() {
  const [open, setOpen] = useState(false)
  const [typed, setTyped] = useState("")
  const name = "山田商事"
  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setTyped("")
      }}
    >
      <AlertDialogTrigger render={<Button variant="destructive" data-testid="alert-bulk-trigger" />}>
        顧客データをすべて削除
      </AlertDialogTrigger>
      <AlertDialogContent data-testid="alert-bulk">
        <AlertDialogHeader>
          <AlertDialogTitle>山田商事のデータをすべて削除しますか？</AlertDialogTitle>
          <AlertDialogDescription>
            顧客情報、取引の履歴 1,284 件、請求書 312 件、添付ファイル 96 件を完全に削除します。復元はできません。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Field>
          <FieldLabel>確認のため、顧客名を入力してください</FieldLabel>
          <Input data-testid="alert-bulk-input" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          <FieldDescription>{`「${name}」と入力すると、削除できるようになります。`}</FieldDescription>
        </Field>
        <AlertDialogFooter>
          <AlertDialogCancel>キャンセル</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            data-testid="alert-bulk-action"
            disabled={typed !== name}
            onClick={() => setOpen(false)}
          >
            すべて削除する
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// 元に戻せる軽微な操作。確認せずに実行し、取り消しの手段を示す。
function ArchiveWithUndo() {
  const [archived, setArchived] = useState(false)
  return (
    <div className="flex flex-wrap items-center gap-4">
      {archived ? (
        <>
          <p role="status" className="text-ui">
            佐藤製作所をアーカイブしました
          </p>
          <Button variant="link" onClick={() => setArchived(false)}>
            元に戻す
          </Button>
        </>
      ) : (
        <Button variant="secondary" onClick={() => setArchived(true)}>
          佐藤製作所をアーカイブ
        </Button>
      )}
    </div>
  )
}

function SaveWithoutConfirm() {
  const [saved, setSaved] = useState(false)
  return (
    <div className="flex flex-wrap items-center gap-4">
      <Button onClick={() => setSaved(true)}>保存する</Button>
      <p role="status" className="text-ui text-muted-foreground">
        {saved ? "保存しました" : ""}
      </p>
    </div>
  )
}

export function AlertDialogPage() {
  return (
    <article>
      <PageHeader
        name="Alert Dialog"
        lead="取り消せない操作や重要な判断を、実行する前に確かめる。外側のクリックでは閉じず、初期フォーカスは安全な選択肢に当たる。"
      />

      <Section
        title="削除の確認"
        lead="キャンセルに初期フォーカスが当たる。Escape はキャンセルとして閉じる。削除の処理中は、ボタンを処理中にして二重の実行を防ぐ。"
      >
        <Row label="取り消せない削除" note="結果を文章で示し、ボタンに操作の名前を書く">
          <DeleteCustomer />
        </Row>
        <Row label="追加の確認" note="大量のデータの完全な削除など。必要かどうかは製品が判断する">
          <DeleteWorkspace />
        </Row>
      </Section>

      <Section title="確認の強さ" lead="すべての削除や保存に確認を求めない。取り消せるかどうかで決める。">
        <Row label="通常の保存" note="確認しない">
          <SaveWithoutConfirm />
        </Row>
        <Row label="元に戻せる軽微な操作" note="すぐに実行し、取り消しの手段を示す">
          <ArchiveWithUndo />
        </Row>
        <Row label="取り消せない削除" note="Alert Dialog">
          <p className="text-ui text-muted-foreground">上の「削除の確認」を参照</p>
        </Row>
        <Row label="大量のデータの完全な削除" note="Alert Dialog と、必要な追加の確認">
          <p className="text-ui text-muted-foreground">上の「追加の確認」を参照</p>
        </Row>
      </Section>

      <Section
        title="shadcn/ui との互換"
        lead="AlertDialogMedia は、shadcn/ui から移行するコードのために提供する。Flow Design の標準では使わず、意味はタイトル、説明、ボタンで伝える。"
      >
        <Row label="AlertDialogMedia" note="互換のためだけに使う">
          <MediaExample />
        </Row>
      </Section>

      <Section title="長い文字">
        <Row label="English">
          <ConfirmExample
            testId="alert-english"
            trigger="Delete workspace"
            title="Delete the Northwind Trading Co., Ltd. customer workspace permanently?"
            description="All 1,284 activities, 312 invoices and 96 attachments will be deleted. This action cannot be undone."
            cancel="Cancel"
            action="Delete workspace"
          />
        </Row>
      </Section>

      <Section title="良い例と悪い例">
        <Compare
          bad={
            <ConfirmExample
              trigger="保存する"
              triggerVariant="secondary"
              title="保存しますか？"
              cancel="キャンセル"
              action="OK"
              actionVariant="default"
            />
          }
          badNote="通常の保存に確認を求めると、手順が増え、確認を読まずに押す習慣がつく。"
          good={<SaveWithoutConfirm />}
          goodNote="通常の保存はすぐに実行し、結果を文字で知らせる。"
        />
        <Compare
          bad={
            <ConfirmExample
              trigger="山田商事を削除"
              title="確認"
              description="よろしいですか？"
              cancel="いいえ"
              action="はい"
              actionVariant="default"
            />
          }
          badNote="何が消えるのかがわからず、危険な操作が Primary のため通常の操作と区別できない。"
          good={
            <ConfirmExample
              trigger="山田商事を削除"
              title="山田商事を削除しますか？"
              description="取引の履歴 24 件と請求書 3 件も削除されます。この操作は取り消せません。"
              cancel="キャンセル"
              action="削除する"
            />
          }
          goodNote="消える対象と、取り消せないことを文章で示す。危険な操作は Destructive にする。"
        />
      </Section>
    </article>
  )
}

// shadcn/ui との互換の例。標準では AlertDialogMedia を使わない。
function MediaExample() {
  const [open, setOpen] = useState(false)
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={<Button variant="secondary" data-testid="alert-media-trigger" />}>互換の例を開く</AlertDialogTrigger>
      <AlertDialogContent data-testid="alert-media">
        <AlertDialogHeader>
          <AlertDialogMedia data-testid="alert-media-icon">
            <Trash aria-hidden="true" />
          </AlertDialogMedia>
          <AlertDialogTitle>山田商事を削除しますか？</AlertDialogTitle>
          <AlertDialogDescription>この操作は取り消せません。</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>キャンセル</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => setOpen(false)}>
            削除する
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// 見た目と動きを比べるための例。実行すると閉じるだけで、処理はしない。
function ConfirmExample({
  trigger,
  triggerVariant = "destructive",
  title,
  description,
  cancel,
  action,
  actionVariant = "destructive",
  testId,
}: {
  trigger: string
  triggerVariant?: "destructive" | "secondary"
  title: string
  description?: string
  cancel: string
  action: string
  actionVariant?: "destructive" | "default"
  testId?: string
}) {
  const [open, setOpen] = useState(false)
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={<Button variant={triggerVariant} data-testid={testId && `${testId}-trigger`} />}>
        {trigger}
      </AlertDialogTrigger>
      <AlertDialogContent data-testid={testId}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{cancel}</AlertDialogCancel>
          <AlertDialogAction variant={actionVariant} onClick={() => setOpen(false)}>
            {action}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
