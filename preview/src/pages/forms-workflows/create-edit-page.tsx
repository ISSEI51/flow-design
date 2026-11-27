import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useToast } from "@/components/ui/toast"
import { SaveBlockerNotice, focusFormControl } from "@/patterns/form-layout"
import { useFormState, type FormFields, submitOnEnter } from "@/patterns/form-state"
import { DiscardChangesAlert } from "@/patterns/unsaved-changes"

import { saveSettingsForm } from "../../data/forms-workflows/server"
import { PageHeader } from "../../layout/page-header"
import { Compare, Section } from "../../layout/section"
import { Bullets } from "../app-structure/parts"
import { AppLink, DemoFrame, Mock, Rules } from "../data-browsing/doc-parts"
import { CustomerForm, emptyCustomer } from "./customer-form"
import { ServerModes } from "./doc-parts"
import { AutosaveMemo, InstantSwitch } from "./forms-screens"

type MemberValues = { name: string; email: string }
const memberFields: FormFields<MemberValues> = {
  name: { label: "名前", required: true },
  email: {
    label: "メールアドレス",
    required: true,
    validate: (v) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : "メールアドレスの形式が正しくありません（例：yamada@example.com）"),
  },
}

// 少数の項目で終わる短い操作は Dialog。保存に成功したら確かめずに閉じる
function MemberDialog() {
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const form = useFormState<MemberValues>({ initialValues: { name: "", email: "" }, fields: memberFields })
  const close = () => {
    setOpen(false)
    form.reset({ name: "", email: "" })
  }
  const save = form.handleSubmit((v) => saveSettingsForm<MemberValues>("member", v), {
    onBlocked: (b) => b[0] && focusFormControl(`member-${b[0].name}`),
    onSuccess: (v) => {
      close()
      toast({ variant: "success", title: `${v.name}さんを担当者に追加しました` })
    },
  })
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)} data-testid="member-open">
        担当者を追加
      </Button>
      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : !form.submitting && close())} unsavedChanges={form.isDirty} onDiscardRequest={() => setConfirm(true)}>
        <DialogContent data-testid="member-dialog">
          <DialogHeader>
            <DialogTitle>担当者を追加</DialogTitle>
            <DialogDescription>追加した担当者に、招待のメールを送ります。</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <form id="member-form" noValidate onSubmit={(e) => void save(e)} onKeyDown={(e) => submitOnEnter(e, save)}>
              <FieldGroup>
                <Field invalid={!!form.error("name")}>
                  <FieldLabel>名前</FieldLabel>
                  <Input {...form.inputProps("name")} id="member-name" autoComplete="name" />
                  {form.error("name") && <FieldError>{form.error("name")}</FieldError>}
                </Field>
                <Field invalid={!!form.error("email")}>
                  <FieldLabel>メールアドレス</FieldLabel>
                  <Input {...form.inputProps("email")} id="member-email" type="email" autoComplete="email" />
                  {form.error("email") && <FieldError data-testid="member-email-error">{form.error("email")}</FieldError>}
                </Field>
              </FieldGroup>
            </form>
            {form.formError && (
              <p role="alert" className="mt-4 text-ui text-destructive">
                {form.formError}
              </p>
            )}
          </DialogBody>
          <DialogFooter>
            <SaveBlockerNotice id="member-notice" blockers={form.blockers} hidden={form.submitting} className="w-full sm:w-auto sm:flex-1" />
            <Button variant="secondary" disabled={form.submitting} onClick={() => (form.isDirty ? setConfirm(true) : close())}>
              キャンセル
            </Button>
            <Button type="submit" form="member-form" loading={form.submitting} disabled={!form.canSubmit} focusableWhenDisabled aria-describedby="member-notice" data-testid="member-submit">
              追加する
            </Button>
          </DialogFooter>
          <DiscardChangesAlert
            open={confirm}
            onOpenChange={setConfirm}
            data-testid="member-discard"
            onDiscard={() => {
              setConfirm(false)
              close()
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}

function CustomerExample() {
  const { toast } = useToast()
  const [key, setKey] = useState(0)
  return (
    <CustomerForm
      key={key}
      mode="create"
      initial={emptyCustomer}
      idPrefix="ce"
      testId="ce-form"
      onSaved={(s) => {
        toast({ variant: "success", title: `${s.name}を登録しました`, description: "製品では、作成した顧客の詳細へ移動します" })
        setKey((k) => k + 1)
      }}
      onCancel={() => setKey((k) => k + 1)}
    />
  )
}

export function CreateEditPage() {
  return (
    <article>
      <PageHeader
        eyebrow="Patterns / Forms & Workflows"
        name="Create & Edit"
        lead="登録と編集を、同じ構造のフォームで行う。必須の項目がそろい、すべての検証が成功するまで、保存ボタンは押せない。押せない理由はボタンの近くに示し、入力を終えた場所でエラーを伝える。"
      />

      <Section title="操作できる例" lead="顧客の登録。顧客コードは入力が止まってから重複を確かめる（C-0001〜C-0005 は登録済み）。郵便番号（例：1000001）から住所を補完する。">
        <div className="flex flex-col gap-6">
          <ServerModes keys={["saveMode"]} name="ce" />
          <DemoFrame testId="ce-demo">
            <CustomerExample />
          </DemoFrame>
          <AppLink href="#/forms-app?page=customers">検証画面で、登録の後の移動と一覧からの編集を試す</AppLink>
        </div>
      </Section>

      <Section title="保存ボタンの有効と無効" lead="利用者が決めた方針。保存ボタンを押させてから初めてエラーを示す方式は、標準にしない。">
        <Rules
          rows={[
            ["未操作", "エラーを表示しない。保存ボタンは押せず、近くに「あと N 項目を入力すると保存できます」と示す"],
            ["入力中", "入力の途中の値（「yamada@」など）をエラーにしない。正しい値になった時点で、保存できるようになる"],
            ["入力を終えた（Blur）", "その項目を検証し、問題があればエラーを表示する"],
            ["エラーの表示中", "入力のたびに再検証し、直ったらすぐにエラーを消す"],
            ["IME の変換中", "検証しない。確定した値を検証する。変換中は保存できない"],
            ["非同期の検証中", "保存ボタンは押せない。古い値の応答は、現在の値の結果として使わない"],
            ["すべて成功", "保存ボタンが押せる。最後の項目からフォーカスを外さなくてよい"],
            ["保存", "送信の処理でも条件を確かめる（Enter、requestSubmit、プログラムからの送信）。サーバー側でも検証する"],
          ]}
        />
      </Section>

      <Section title="表示の方法">
        <div className="flex flex-col gap-6">
          <Rules
            rows={[
              ["Dialog", "少数の項目で終わる短い操作（担当者の追加）"],
              ["Sheet", "一覧や詳細からの簡単な登録と編集（連絡先の変更）。閲覧の Sheet と編集の Sheet を分ける（Data Browsing）"],
              ["別のページ", "項目が多い、複雑な判断を伴う操作（顧客の登録）"],
              ["Inline", "頻繁に変える単一の項目（社内のメモ）"],
            ]}
          />
          <div className="flex flex-wrap items-center gap-4">
            <MemberDialog />
            <AppLink href="#/forms-app?page=customer&id=cu-1">Sheet と Inline の編集を検証画面で試す</AppLink>
          </div>
        </div>
      </Section>

      <Section title="保存の方式" lead="通常の業務のフォームは明示的な保存。独立した Switch は即時保存。継続的な入力は自動保存。">
        <div className="flex max-w-[40rem] flex-col gap-8">
          <div className="flex flex-col" data-testid="ce-instant">
            <InstantSwitch kind="ce-notify" label="契約の更新が近づいたら通知する" description="切り替えた時点で保存します" initial />
          </div>
          <AutosaveMemo />
        </div>
      </Section>

      <Section title="保存中、失敗、成功の後">
        <Bullets
          items={[
            "保存中は、保存ボタンを Button の loading にする（大きさを保ち、二重の実行を防ぐ）。送信した時点の値を確定し、保存中に入力した値は保存した値として扱わない。短い保存で、ページ全体を読み込み中の表示にしない。",
            "失敗したら、入力を残す。項目のエラーは項目に、フォーム全体のエラー（通信の失敗）はボタンの近くに示し、原因と次に行うことを伝える。",
            "保存されたかわからない（タイムアウトなど）場合は、無条件に再実行させない。登録されているかを確かめてから、もう一度保存できるようにする。",
            "サーバーだけが判断できるエラー（重複、同時の編集、権限の変更）は、保存の後に該当する項目に示す。",
            "成功の後の移動は、次の作業で決める。新規の登録は作成した詳細、一覧からの編集は元の一覧（状態を復元する）、設定は同じ画面。連続して登録する場合だけ「登録して次へ」を置く。",
            "完了は Toast かインラインの表示で知らせる。保存のたびに完了の Dialog を出さない。",
          ]}
        />
      </Section>

      <Section title="比較">
        <Compare
          bad={
            <Mock label="保存ボタンを押すと、フォームの上にエラーの一覧が出る例">
              <div className="rounded-md border border-destructive p-2 text-caption text-destructive">入力内容を確認してください（3 件）</div>
              <div className="h-8 rounded-md border border-border" />
              <div className="h-8 rounded-md border border-border" />
              <div className="self-end rounded-md bg-primary px-3 py-1 text-caption text-primary-foreground">保存</div>
            </Mock>
          }
          badNote="押してから初めて問題がわかり、長いフォームでは上のエラーまで戻って直す必要がある。"
          good={
            <Mock label="保存ボタンが押せない状態で、ボタンの近くに理由が示されている例">
              <div className="h-8 rounded-md border border-border" />
              <div className="h-8 rounded-md border border-border" />
              <div className="flex items-center justify-between gap-2">
                <span className="text-caption text-muted-foreground">あと 2 項目を入力すると保存できます</span>
                <span className="rounded-md bg-primary px-3 py-1 text-caption text-primary-foreground opacity-50">保存する</span>
              </div>
            </Mock>
          }
          goodNote="入力を終えた場所でエラーを伝え、押せない理由をボタンの近くに示す。正しく入力すれば、そのまま押せる。"
        />
      </Section>
    </article>
  )
}
