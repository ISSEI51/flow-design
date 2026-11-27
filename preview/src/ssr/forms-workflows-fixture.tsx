import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { ToastProvider } from "@/components/ui/toast"
import { ConfirmActionDialog } from "@/patterns/confirm-action"
import { FormActions, FormRow, SaveBlockerNotice } from "@/patterns/form-layout"
import { useFormState } from "@/patterns/form-state"
import { createImportColumns, useColumnMapping } from "@/patterns/import-mapping"
import { ColumnMappingList, ImportResultSummary, ImportValidationSummary, type ImportFilter } from "@/patterns/import-review"
import { useStepFlow } from "@/patterns/step-flow"
import { Stepper } from "@/patterns/stepper"
import { UnsavedChangesProvider, useUnsavedChanges } from "@/patterns/unsaved-changes"

// Forms & Workflows の Patterns の SSR と Hydration の検品用の画面。
// サーバーで描画するときは window と document がない。描画の結果は、サーバーとブラウザで同じでなければならない。

type Values = { lastName: string; firstName: string; email: string }

const fields = [
  { id: "code", label: "顧客コード", required: true },
  { id: "company", label: "会社名", required: true },
  { id: "phone", label: "電話番号", aliases: ["TEL"] },
]
const columns = createImportColumns(["顧客コード", "会社名", "TEL", "電話番号"], [["C-1001", "株式会社サンプル", "03-0000-0000", "090-0000-0000"]])

function Inner() {
  const form = useFormState<Values>({
    initialValues: { lastName: "", firstName: "", email: "" },
    fields: {
      lastName: { label: "姓", required: true },
      firstName: { label: "名", required: true },
      email: { label: "メールアドレス", required: true, validate: (v) => (v.includes("@") ? null : "メールアドレスの形式が正しくありません") },
    },
  })
  useUnsavedChanges({ dirty: form.isDirty, label: "SSR の例" })
  const flow = useStepFlow({
    steps: [
      { id: "a", label: "顧客" },
      { id: "b", label: "契約の内容" },
      { id: "c", label: "確認" },
    ],
    isComplete: (id) => id !== "a" || form.canSubmit,
  })
  const mapping = useColumnMapping({ sourceKey: "ssr", columns, fields })
  const [filter, setFilter] = useState<ImportFilter>("all")
  const [open, setOpen] = useState(false)
  return (
    <div className="flex flex-col gap-12 p-6">
      <Stepper items={flow.items} total={flow.total} onSelect={flow.goTo} layout="horizontal" aria-label="SSR の手順" />
      <p data-testid="ssr-step">{flow.current}</p>
      <form noValidate onSubmit={(e) => (e.preventDefault(), flow.next())} className="flex max-w-[40rem] flex-col gap-6">
        <FieldGroup>
          <FormRow>
            <Field invalid={!!form.error("lastName")}>
              <FieldLabel>姓</FieldLabel>
              <Input {...form.inputProps("lastName")} id="ssr-last" />
            </Field>
            <Field invalid={!!form.error("firstName")}>
              <FieldLabel>名</FieldLabel>
              <Input {...form.inputProps("firstName")} id="ssr-first" />
            </Field>
          </FormRow>
          <Field invalid={!!form.error("email")}>
            <FieldLabel>メールアドレス</FieldLabel>
            <Input {...form.inputProps("email")} id="ssr-email" />
            {form.error("email") && <FieldError>{form.error("email")}</FieldError>}
          </Field>
        </FieldGroup>
        <FormActions notice={<SaveBlockerNotice id="ssr-notice" blockers={form.blockers} />}>
          <Button type="submit" disabled={!flow.canNext} focusableWhenDisabled aria-describedby="ssr-notice" data-testid="ssr-next">
            次へ
          </Button>
        </FormActions>
      </form>
      <ColumnMappingList columns={columns} fields={fields} mapping={mapping.mapping} issues={mapping.issues} ambiguous={mapping.ambiguous} isAuto={mapping.isAuto} onChange={mapping.setColumn} />
      <ImportValidationSummary counts={{ valid: 10, review: 2, error: 1 }} filter={filter} onFilterChange={setFilter} />
      <ImportResultSummary result={{ created: 9, updated: 1, skipped: 2, failed: 1, unknown: 0, total: 13 }} onRetryFailed={() => undefined} />
      <Button variant="secondary" onClick={() => setOpen(true)}>
        削除
      </Button>
      <ConfirmActionDialog open={open} onOpenChange={setOpen} variant="destructive" title="1件を削除しますか？" confirmLabel="1件を削除" onConfirm={() => undefined} />
    </div>
  )
}

export function FormsWorkflowsSsrFixture() {
  return (
    <ToastProvider>
      <UnsavedChangesProvider>
        <Inner />
      </UnsavedChangesProvider>
    </ToastProvider>
  )
}
