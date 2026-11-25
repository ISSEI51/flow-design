import type * as React from "react"
import { Field as FieldPrimitive } from "@base-ui/react/field"
import { Fieldset as FieldsetPrimitive } from "@base-ui/react/fieldset"
import { cva, type VariantProps } from "class-variance-authority"
import { CircleAlert } from "lucide-react"

import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

// Flow Design Field
// shadcn/ui の Field と同じ名前と構造（Field、FieldLabel、FieldDescription、FieldError、
// FieldGroup、FieldSet、FieldLegend、FieldContent）。
// shadcn/ui は div で組み立てるが、Flow Design は Base UI の Field と Fieldset を使い、
// ラベルの関連付け、aria-describedby、aria-invalid を自動で設定する。
// 検証の規則は持たない。エラーの有無は invalid と FieldError で製品が渡す。
// 定義は docs/web/components/field.md を参照。

function FieldSet({ className, ...props }: FieldsetPrimitive.Root.Props) {
  return (
    <FieldsetPrimitive.Root
      data-slot="field-set"
      className={cn(
        "flex min-w-0 flex-col gap-4 has-[>[data-slot=field-legend][data-variant=label]]:gap-2",
        className
      )}
      {...props}
    />
  )
}

function FieldLegend({
  className,
  variant = "legend",
  ...props
}: FieldsetPrimitive.Legend.Props & { variant?: "legend" | "label" }) {
  return (
    <FieldsetPrimitive.Legend
      data-slot="field-legend"
      data-variant={variant}
      className={cn(
        "text-foreground data-[variant=label]:text-ui data-[variant=label]:font-medium data-[variant=legend]:text-heading",
        className
      )}
      {...props}
    />
  )
}

function FieldGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-group"
      className={cn("group/field-group flex w-full flex-col gap-4", className)}
      {...props}
    />
  )
}

const fieldVariants = cva("group/field flex w-full min-w-0", {
  variants: {
    orientation: {
      // ラベル、入力欄、説明、エラーを上から並べる。ラベルと入力欄の間隔は 8px。
      vertical: "flex-col gap-2",
      // Checkbox、Radio、Switch とラベルを横に並べる。行の高さは 48px 以上。
      // ラベルに説明を添えるとき（FieldContent）は上端でそろえ、操作部品を 1 行目の中央に合わせる。
      // 行全体を押せる範囲にする。ラベルの after 疑似要素で行を覆い、隣の行と重ならない。
      horizontal: cn(
        "relative min-h-control flex-row items-center gap-2",
        "[&_[data-slot=field-label]]:after:absolute [&_[data-slot=field-label]]:after:inset-0",
        "*:data-[slot=field-label]:min-h-control *:data-[slot=field-label]:flex-auto",
        "has-[>[data-slot=field-content]]:items-start has-[>[data-slot=field-content]]:py-3",
        "*:data-[slot=field-content]:pt-1 has-[>[data-slot=field-content]]:[&>[role=checkbox]]:mt-1"
      ),
    },
  },
  defaultVariants: { orientation: "vertical" },
})

function Field({
  className,
  orientation = "vertical",
  ...props
}: FieldPrimitive.Root.Props & VariantProps<typeof fieldVariants>) {
  return (
    <FieldPrimitive.Root
      data-slot="field"
      data-orientation={orientation}
      className={cn(fieldVariants({ orientation }), className)}
      {...props}
    />
  )
}

function FieldContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-content"
      className={cn("flex min-w-0 flex-1 flex-col gap-1", className)}
      {...props}
    />
  )
}

// Checkbox Group や Radio Group の選択肢を 1 つずつ囲む。選択肢ごとにラベルを関連付ける。
// 行の高さは 48px 以上。
function FieldItem({ className, ...props }: FieldPrimitive.Item.Props) {
  return (
    <FieldPrimitive.Item
      data-slot="field-item"
      className={cn(
        "relative flex min-h-control items-center gap-2 *:data-[slot=field-label]:min-h-control *:data-[slot=field-label]:flex-auto",
        // 行全体を押せる範囲にする。隣の選択肢の行と重ならない。
        "*:data-[slot=field-label]:after:absolute *:data-[slot=field-label]:after:inset-0",
        className
      )}
      {...props}
    />
  )
}

function FieldLabel({ className, ...props }: FieldPrimitive.Label.Props) {
  return (
    <FieldPrimitive.Label
      data-slot="field-label"
      render={<Label />}
      className={cn("w-fit", className)}
      {...props}
    />
  )
}

// shadcn/ui との互換のために提供する。ラベルではない見出し（ラベルで囲んだ選択肢の題名など）。
// Flow Design の標準のフォームでは FieldLabel を使う。
function FieldTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-label"
      className={cn(
        "flex w-fit items-center gap-2 text-ui leading-snug font-medium group-data-[disabled]/field:opacity-50",
        className
      )}
      {...props}
    />
  )
}

// shadcn/ui との互換のために提供する。区切りは余白を優先し（美的基準 03）、線は必要な場合だけ使う。
function FieldSeparator({ children, className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="field-separator"
      data-content={!!children}
      className={cn("relative flex h-5 items-center text-ui text-muted-foreground", className)}
      {...props}
    >
      <div role="separator" aria-hidden="true" className="h-px flex-1 bg-border" />
      {children && (
        <>
          <span data-slot="field-separator-content" className="px-2">
            {children}
          </span>
          <div aria-hidden="true" className="h-px flex-1 bg-border" />
        </>
      )}
    </div>
  )
}

function FieldDescription({ className, ...props }: FieldPrimitive.Description.Props) {
  return (
    <FieldPrimitive.Description
      data-slot="field-description"
      className={cn("text-ui text-muted-foreground", className)}
      {...props}
    />
  )
}

// エラーの原因と解決方法を文字で示す。アイコンを添え、色だけで伝えない。
// children を渡したときは、製品の判断で常に表示する（match={true}）。
function FieldError({ className, children, match, ...props }: FieldPrimitive.Error.Props) {
  return (
    <FieldPrimitive.Error
      data-slot="field-error"
      match={match ?? (children ? true : undefined)}
      className={cn("flex items-start gap-2 text-ui text-destructive", className)}
      {...props}
    >
      <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </FieldPrimitive.Error>
  )
}

// 必須・任意の表示。どちらを使うかはフォーム全体で決める（docs/web/components/forms.md）。
// 必須は required 属性で支援技術に伝わるため、記号は読み上げない。
function FieldRequiredMark({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span aria-hidden="true" data-slot="field-required" className={cn("text-destructive", className)} {...props}>
      *
    </span>
  )
}

function FieldOptionalMark({ className, children = "任意", ...props }: React.ComponentProps<"span">) {
  return (
    <span data-slot="field-optional" className={cn("font-normal text-muted-foreground", className)} {...props}>
      {children}
    </span>
  )
}

export {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldItem,
  FieldLabel,
  FieldLegend,
  FieldOptionalMark,
  FieldRequiredMark,
  FieldSeparator,
  FieldSet,
  FieldTitle,
}
