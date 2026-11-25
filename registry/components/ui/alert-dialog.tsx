import * as React from "react"
import { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// Flow Design Alert Dialog
// shadcn/ui（Base UI 版）の Alert Dialog と同じ名前と構造。見た目は Dialog と共通にしている。
// shadcn/ui との違い：
// - AlertDialogMedia（大きなアイコン）は互換のためだけに提供する。Flow Design の標準では使わず、
//   意味はタイトル、説明、ボタンで伝える。置いた場合は、見出しの上に左寄せで表示する。
// - AlertDialogCancel の既定を Secondary にする。
// - 開いたとき、AlertDialogCancel に初期フォーカスを当てる。
// 外側のクリックでは閉じない（Base UI の Alert Dialog の動作）。Escape はキャンセルとして閉じる。
// 定義は docs/web/components/alert-dialog.md を参照。

const AlertDialog = AlertDialogPrimitive.Root

function AlertDialogTrigger(props: AlertDialogPrimitive.Trigger.Props) {
  return <AlertDialogPrimitive.Trigger data-slot="alert-dialog-trigger" {...props} />
}

function AlertDialogPortal(props: AlertDialogPrimitive.Portal.Props) {
  return <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal" {...props} />
}

// Dialog と同じ背景。黒 40%、ぼかしなし。
function AlertDialogOverlay({ className, ...props }: AlertDialogPrimitive.Backdrop.Props) {
  return (
    <AlertDialogPrimitive.Backdrop
      data-slot="alert-dialog-overlay"
      className={cn(
        "fixed inset-0 z-40 min-h-dvh bg-black/40 supports-[-webkit-touch-callout:none]:absolute",
        "transition-opacity duration-(--duration-slow) ease-standard",
        "data-starting-style:opacity-0 data-ending-style:opacity-0",
        className
      )}
      {...props}
    />
  )
}

function AlertDialogContent({
  className,
  size = "default",
  initialFocus,
  ref,
  ...props
}: AlertDialogPrimitive.Popup.Props & { size?: "sm" | "default" }) {
  const popupRef = React.useRef<HTMLDivElement | null>(null)
  // 製品が渡した ref と、初期フォーカスを探すための ref を両方に設定する。
  const setRef = React.useCallback(
    (node: HTMLDivElement | null) => {
      popupRef.current = node
      if (typeof ref === "function") ref(node)
      else if (ref) (ref as React.RefObject<HTMLDivElement | null>).current = node
    },
    [ref]
  )
  // 安全な選択肢（AlertDialogCancel）に初期フォーカスを当てる。
  // AlertDialogCancel がない場合は、Base UI の既定（最初の操作できる要素）に従う。
  const focusCancel = React.useCallback(
    () => popupRef.current?.querySelector<HTMLElement>("[data-slot=alert-dialog-cancel]") ?? true,
    []
  )
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Viewport
        data-slot="alert-dialog-viewport"
        className="fixed inset-0 z-40 flex items-center justify-center p-4 sm:p-6"
      >
        <AlertDialogPrimitive.Popup
          data-slot="alert-dialog-content"
          data-size={size}
          ref={setRef}
          initialFocus={initialFocus ?? focusCancel}
          className={cn(
            "group/alert-dialog-content relative flex max-h-full w-full min-w-0 flex-col gap-6 overflow-y-auto p-6",
            "rounded-xl bg-popover text-body text-popover-foreground shadow-dialog outline-none",
            "data-[size=default]:max-w-[30rem] data-[size=sm]:max-w-[22.5rem]",
            "transition-[opacity,scale] duration-(--duration-slow) ease-enter data-ending-style:ease-exit",
            "data-starting-style:opacity-0 data-ending-style:opacity-0",
            "motion-safe:data-starting-style:scale-95 motion-safe:data-ending-style:scale-95",
            className
          )}
          {...props}
        />
      </AlertDialogPrimitive.Viewport>
    </AlertDialogPortal>
  )
}

function AlertDialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="alert-dialog-header" className={cn("flex flex-col gap-2", className)} {...props} />
}

// Dialog と同じ配置。右寄せで、キャンセルを左、実行する操作を右に置く。
// shadcn/ui との互換のための部品。標準では使わない（docs/web/components/alert-dialog.md）。
function AlertDialogMedia({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-media"
      className={cn(
        "mb-2 inline-flex size-10 shrink-0 items-center justify-center self-start rounded-md bg-muted text-foreground",
        "[&_svg:not([class*='size-'])]:size-6",
        className
      )}
      {...props}
    />
  )
}

function AlertDialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="alert-dialog-footer"
      className={cn("flex flex-wrap gap-2 *:flex-1 sm:justify-end sm:*:flex-none", className)}
      {...props}
    />
  )
}

function AlertDialogTitle({ className, ...props }: AlertDialogPrimitive.Title.Props) {
  return (
    <AlertDialogPrimitive.Title
      data-slot="alert-dialog-title"
      className={cn("text-heading text-foreground [word-break:auto-phrase]", className)}
      {...props}
    />
  )
}

function AlertDialogDescription({ className, ...props }: AlertDialogPrimitive.Description.Props) {
  return (
    <AlertDialogPrimitive.Description
      data-slot="alert-dialog-description"
      className={cn("text-ui text-muted-foreground [word-break:auto-phrase]", className)}
      {...props}
    />
  )
}

// 実行する操作。閉じる動作は持たない。処理が終わったら、製品が open を false にする。
// 処理中は loading を指定する。Button が二重の実行を防ぐ。
function AlertDialogAction(props: React.ComponentProps<typeof Button>) {
  return <Button data-slot="alert-dialog-action" {...props} />
}

function AlertDialogCancel({
  variant = "secondary",
  size = "default",
  ...props
}: AlertDialogPrimitive.Close.Props &
  Pick<React.ComponentProps<typeof Button>, "variant"> & { size?: "xs" | "sm" | "default" | "lg" }) {
  return (
    <AlertDialogPrimitive.Close
      data-slot="alert-dialog-cancel"
      render={<Button variant={variant} size={size} />}
      {...props}
    />
  )
}

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
}
