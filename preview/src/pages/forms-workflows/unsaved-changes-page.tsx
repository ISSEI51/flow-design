import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Drawer, DrawerBody, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { FormActions } from "@/patterns/form-layout"
import { useFormState, type FormFields, submitOnEnter } from "@/patterns/form-state"
import { DiscardChangesAlert, UnsavedChangesProvider, useNavigationGuard, useUnsavedChanges } from "@/patterns/unsaved-changes"

import { saveSettingsForm } from "../../data/forms-workflows/server"
import { PageHeader } from "../../layout/page-header"
import { Compare, Section } from "../../layout/section"
import { Bullets } from "../app-structure/parts"
import { AppLink, DemoFrame, Mock, Rules } from "../data-browsing/doc-parts"
import { ServerModes } from "./doc-parts"

type One = { value: string }

// 保存の単位が 1 つの小さなフォーム。保存の単位ごとに useUnsavedChanges で登録する
function SmallForm({ kind, title, initial, testId }: { kind: string; title: string; initial: string; testId: string }) {
  const fields: FormFields<One> = { value: { label: title, required: true } }
  const [f] = useState(() => fields)
  const form = useFormState<One>({ initialValues: { value: initial }, fields: f })
  const save = form.handleSubmit((v) => saveSettingsForm<One>(kind, v))
  useUnsavedChanges({ dirty: form.isDirty, saving: form.submitting, label: title, canSave: form.canSubmit, onSave: () => save(), onDiscard: form.discard })
  return (
    <form noValidate onSubmit={(e) => void save(e)} onKeyDown={(e) => submitOnEnter(e, save)} className="flex flex-col gap-4" data-testid={testId} data-dirty={form.isDirty || undefined}>
      <Field invalid={!!form.error("value")}>
        <FieldLabel>{title}</FieldLabel>
        <Input {...form.inputProps("value")} id={`${testId}-input`} />
        {form.error("value") && <FieldError>{form.error("value")}</FieldError>}
      </Field>
      {form.formError && (
        <p role="alert" className="text-ui text-destructive">
          {form.formError}
        </p>
      )}
      <FormActions notice={form.isDirty ? <p className="text-ui text-muted-foreground">保存していない変更があります</p> : null}>
        <Button type="submit" size="sm" loading={form.submitting} disabled={!form.canSubmit || !form.isDirty} data-testid={`${testId}-save`}>
          {title}を保存
        </Button>
      </FormActions>
    </form>
  )
}

const pages = [
  ["profile", "プロフィール"],
  ["list", "一覧"],
  ["help", "ヘルプ"],
] as const
type PageId = (typeof pages)[number][0]

function MiniApp() {
  const guard = useNavigationGuard()
  const [page, setPage] = useState<PageId>("profile")
  const [log, setLog] = useState<string[]>([])
  const go = (to: PageId) => {
    const label = pages.find((p) => p[0] === to)![1]
    guard.confirmNavigation(
      () => {
        setPage(to)
        setLog((l) => [`「${label}」へ移動しました`, ...l].slice(0, 3))
      },
      { onCancel: () => setLog((l) => [`「${label}」への移動を取りやめました`, ...l].slice(0, 3)) }
    )
  }
  return (
    <div className="flex min-w-0 flex-col gap-6" data-testid="uc-app" data-page={page}>
      <nav aria-label="例のページ" className="flex flex-wrap gap-2">
        {pages.map(([id, label]) => (
          <Button key={id} size="sm" variant={page === id ? "secondary" : "ghost"} aria-current={page === id ? "page" : undefined} onClick={() => page !== id && go(id)}>
            {label}
          </Button>
        ))}
      </nav>
      {page === "profile" ? (
        <div className="flex flex-col gap-8">
          <SmallForm kind="uc-name" title="表示名" initial="佐藤 花子" testId="uc-name" />
          <SmallForm kind="uc-team" title="所属" initial="東日本営業部" testId="uc-team" />
          <Tabs defaultValue="a">
            <TabsList>
              <TabsTrigger value="a">自己紹介</TabsTrigger>
              <TabsTrigger value="b">補足</TabsTrigger>
            </TabsList>
            <TabsContent value="a" className="pt-4">
              <p className="text-ui text-muted-foreground">フォームの中の Tabs、Accordion の切り替えは、入力が残るため確かめない。</p>
            </TabsContent>
            <TabsContent value="b" className="pt-4">
              <Textarea rows={2} aria-label="補足" defaultValue="" />
            </TabsContent>
          </Tabs>
        </div>
      ) : (
        <p className="text-ui text-muted-foreground">「{pages.find((p) => p[0] === page)![1]}」のページ（例のため内容はない）</p>
      )}
      <ul className="flex flex-col gap-1 text-ui text-muted-foreground" aria-label="移動の記録" data-testid="uc-log">
        {log.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
      </ul>
    </div>
  )
}

function DrawerExample() {
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [note, setNote] = useState("")
  const dirty = note.trim() !== ""
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)} data-testid="uc-drawer-open">
        メモを追加
      </Button>
      <Drawer open={open} onOpenChange={setOpen} unsavedChanges={dirty} onDiscardRequest={() => setConfirm(true)}>
        <DrawerContent data-testid="uc-drawer">
          <DrawerHeader>
            <DrawerTitle>メモを追加</DrawerTitle>
            <DrawerDescription>入力中に下へスワイプ、Escape、閉じるボタンで閉じると、破棄を確かめる</DrawerDescription>
          </DrawerHeader>
          <DrawerBody>
            <Field>
              <FieldLabel>メモ</FieldLabel>
              <Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} data-testid="uc-drawer-note" />
            </Field>
          </DrawerBody>
          <DrawerFooter>
            <Button
              disabled={!dirty}
              onClick={() => {
                setNote("")
                setOpen(false)
              }}
            >
              メモを追加
            </Button>
          </DrawerFooter>
          <DiscardChangesAlert
            open={confirm}
            onOpenChange={setConfirm}
            data-testid="uc-drawer-discard"
            onDiscard={() => {
              setConfirm(false)
              setNote("")
              setOpen(false)
            }}
          />
        </DrawerContent>
      </Drawer>
    </>
  )
}

export function UnsavedChangesPage() {
  return (
    <article>
      <PageHeader
        eyebrow="Patterns / Forms & Workflows"
        name="Unsaved Changes"
        lead="入力した内容が失われる場合だけ、破棄を確かめる。未保存かどうかは、最後に保存した値と現在の値で判断する。触れただけ、元の値に戻した場合は確かめない。"
      />

      <Section title="操作できる例" lead="2 つの独立したフォーム（表示名、所属）と、例のページの移動。どちらかを変えてから別のページへ移ると、確認が出る。保存できる場合は「保存して移動」も選べる。">
        <div className="flex flex-col gap-6">
          <ServerModes keys={["saveMode"]} name="uc" />
          <DemoFrame testId="uc-demo">
            <UnsavedChangesProvider>
              <MiniApp />
            </UnsavedChangesProvider>
          </DemoFrame>
          <div className="flex flex-wrap items-center gap-4">
            <DrawerExample />
            <AppLink href="#/forms-app?page=settings">Sidebar、ブラウザの戻る・進む、再読み込みを検証画面で試す</AppLink>
          </div>
        </div>
      </Section>

      <Section title="判定">
        <Rules
          rows={[
            ["比べる値", "最後に保存した値と現在の値。入力欄に触れただけでは未保存にしない。元の値に戻したら解除する"],
            ["比べ方", "保存するデータとしての値で比べる（前後の空白、順序のない配列は normalize でそろえる）。オブジェクトの参照や配列の並びだけで判断しない"],
            ["保存の後", "保存に成功したら、基準値を保存した値に更新する。保存中に入力した値は、保存した値として扱わない"],
            ["複数のフォーム", "保存の単位ごとに判断する。1 つを保存しても、ほかのフォームの未保存の状態は残る。ページを離れるときは、すべてのフォームを対象にする"],
            ["表示", "保存ボタンの状態を基本にする。検証のエラーで保存ボタンが押せないときは、「保存していない変更があります」と文字でも示す"],
          ]}
        />
      </Section>

      <Section title="確認の動作">
        <Rules
          rows={[
            ["選択肢", "「編集を続ける」（初期フォーカス、Escape）と「変更を破棄」。すべての対象が保存できる場合だけ「保存して移動」を加える"],
            ["保存して移動", "保存がすべて成功した場合だけ移動する。失敗したら移動せず、画面と入力を残す"],
            ["保存中の移動", "保存が終わるまで待つ。成功して未保存の変更がなければ移動し、失敗したら確認に切り替える。待っている間も「移動をやめる」で取り消せる"],
            ["続けての移動", "確認中に別の移動を求めた場合は、最後の要求だけを残す"],
            ["確認の繰り返し", "破棄、または保存して移動した後の移動では、もう一度確かめない"],
            ["Overlay", "Dialog、Sheet、Drawer を閉じる操作は、各部品の unsavedChanges と onDiscardRequest で確かめる（外側のクリックでは閉じない）。ページの移動の確認と二重にしない"],
            ["再読み込み・タブを閉じる", "未保存の変更か保存中の処理がある間だけ beforeunload を登録する。ブラウザの標準の確認で、文言は指定できない。ブラウザによっては表示されない（ページを操作していない場合など）"],
          ]}
        />
      </Section>

      <Section title="下書き">
        <Bullets
          items={[
            "長い入力や複雑なフォームでは、下書きを用意する。正式な保存と下書きを区別し、更新の日時、再開、破棄を示す。",
            "パスワードや機密の情報を、下書きに安易に保存しない。アカウント、ワークスペース、レコードの境界を越えて下書きを共有しない。",
            "下書きの保存先と保存の方法（サーバー、ブラウザ）は製品の責務である。",
          ]}
        />
      </Section>

      <Section title="比較">
        <Compare
          bad={
            <Mock label="何も変えていないのに、移動のたびに確認を出す例">
              <div className="rounded-md border border-border p-3 text-caption">このページを離れますか？</div>
            </Mock>
          }
          badNote="確認が習慣になり、本当に失われる場面でも読まずに進むようになる。"
          good={
            <Mock label="変更がある場合だけ、どの変更が失われるかを示して確かめる例">
              <div className="flex flex-col gap-2 rounded-md border border-border p-3 text-caption">
                <span className="font-medium">変更を破棄しますか？</span>
                <span className="text-muted-foreground">「表示名」の変更は保存されていません。</span>
              </div>
            </Mock>
          }
          goodNote="失われる内容がある場合だけ確かめ、対象を示す。"
        />
      </Section>
    </article>
  )
}
