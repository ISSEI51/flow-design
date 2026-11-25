import type * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"
import { X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// Flow Design Dialog
// shadcn/ui（Base UI 版）の Dialog と同じ名前と構造。Flow Design では次を追加している。
// - size（sm / default / lg / xl）
// - DialogBody：内容が画面の高さを超えるとき、ヘッダーとフッターを残してスクロールする部分
// - unsavedChanges と onDiscardRequest：未保存の変更があるときの閉じる操作の制御
// 開閉は Base UI の data-starting-style / data-ending-style による CSS の transition で行う。
// 定義は docs/web/components/dialog.md を参照。

type DialogCloseGuardProps = {
  /**
   * 未保存の変更がある。判断は製品が行う。
   * true のとき、外側のクリックでは閉じない。Escape、閉じるボタン、DialogClose では閉じずに
   * onDiscardRequest を呼ぶ。保存の後などに製品が open を false にした場合は閉じる。
   */
  unsavedChanges?: boolean
  /** unsavedChanges のときに閉じる操作が行われた。変更を破棄するかを確かめる Alert Dialog を開く。 */
  onDiscardRequest?: () => void
}

function Dialog({
  unsavedChanges = false,
  onDiscardRequest,
  onOpenChange,
  disablePointerDismissal,
  ...props
}: DialogPrimitive.Root.Props & DialogCloseGuardProps) {
  return (
    <DialogPrimitive.Root
      disablePointerDismissal={disablePointerDismissal ?? unsavedChanges}
      onOpenChange={(open, details) => {
        if (!open && unsavedChanges && details.reason !== "imperative-action" && details.reason !== "none") {
          details.cancel()
          // 取り消せない閉じる要求（ブラウザの戻る操作が続いた場合など）は、そのまま閉じる。
          if (details.isCanceled) {
            if (details.reason !== "outside-press" && details.reason !== "focus-out") onDiscardRequest?.()
            return
          }
        }
        onOpenChange?.(open, details)
      }}
      {...props}
    />
  )
}

function DialogTrigger(props: DialogPrimitive.Trigger.Props) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal(props: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose(props: DialogPrimitive.Close.Props) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

// 背景。黒 40%、ぼかしなし。Alert Dialog、Sheet（編集）、Drawer も同じ値を使う。
// iOS の Safari では、アドレスバーの伸縮で fixed の背景が欠けるため absolute にする（Base UI の推奨）。
function DialogOverlay({ className, ...props }: DialogPrimitive.Backdrop.Props) {
  return (
    <DialogPrimitive.Backdrop
      data-slot="dialog-overlay"
      className={cn(
        "fixed inset-0 z-50 min-h-dvh bg-black/40 supports-[-webkit-touch-callout:none]:absolute",
        "transition-opacity duration-(--duration-slow) ease-standard",
        "data-starting-style:opacity-0 data-ending-style:opacity-0",
        className
      )}
      {...props}
    />
  )
}

const dialogSizes = {
  sm: "max-w-[22.5rem]", // 360px
  default: "max-w-[30rem]", // 480px
  lg: "max-w-[40rem]", // 640px
  xl: "max-w-[50rem]", // 800px
} as const

function DialogContent({
  className,
  children,
  size = "default",
  showCloseButton = true,
  closeLabel = "閉じる",
  ...props
}: DialogPrimitive.Popup.Props & {
  size?: keyof typeof dialogSizes
  showCloseButton?: boolean
  /** 閉じるボタンのアクセシブルな名前 */
  closeLabel?: string
}) {
  return (
    <DialogPortal>
      <DialogOverlay />
      {/* 画面の端との間に、モバイルで 16px、それ以外で 24px を確保する。高さが足りないときは DialogBody がスクロールする。 */}
      <DialogPrimitive.Viewport
        data-slot="dialog-viewport"
        className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6"
      >
        <DialogPrimitive.Popup
          data-slot="dialog-content"
          data-size={size}
          data-close-button={showCloseButton || undefined}
          className={cn(
            "group/dialog-content relative flex max-h-full w-full min-w-0 flex-col gap-6 overflow-y-auto p-6",
            "rounded-xl bg-popover text-body text-popover-foreground shadow-dialog outline-none",
            "transition-[opacity,scale] duration-(--duration-slow) ease-enter data-ending-style:ease-exit",
            "data-starting-style:opacity-0 data-ending-style:opacity-0",
            "motion-safe:data-starting-style:scale-95 motion-safe:data-ending-style:scale-95",
            // 入れ子の Dialog（変更の破棄の確認など）が開いている間は、背後のこの面を少し暗くし、最前面を区別する。
            "after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:bg-black/0",
            "after:transition-[background-color] after:duration-(--duration-slow) data-nested-dialog-open:after:bg-black/10",
            dialogSizes[size],
            className
          )}
          {...props}
        >
          {children}
          {showCloseButton && (
            <DialogPrimitive.Close
              data-slot="dialog-close-button"
              render={<Button variant="ghost" size="icon-sm" aria-label={closeLabel} className="absolute top-4 right-4" />}
            >
              <X />
            </DialogPrimitive.Close>
          )}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Viewport>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn(
        "flex shrink-0 flex-col gap-2 group-data-[close-button]/dialog-content:pr-10",
        className
      )}
      {...props}
    />
  )
}

// 内容が画面の高さを超えるとき、この部分だけをスクロールする。ヘッダーとフッターは残る。
// 左右の余白を Popup の端まで広げ、スクロールバーを端に置く。上下の 4px はフォーカスの枠が欠けないための余白。
function DialogBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-body"
      className={cn("-mx-6 -my-1 min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-1", className)}
      {...props}
    />
  )
}

// 操作ボタン。右寄せで、キャンセルを左、主要な操作を右に置く。ボタンの間隔は 8px。
// 640px 未満の幅では、ボタンを均等の幅に広げる。
function DialogFooter({
  className,
  showCloseButton = false,
  closeLabel = "閉じる",
  children,
  ...props
}: React.ComponentProps<"div"> & { showCloseButton?: boolean; closeLabel?: string }) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn("flex shrink-0 flex-wrap gap-2 *:flex-1 sm:justify-end sm:*:flex-none", className)}
      {...props}
    >
      {showCloseButton && <DialogPrimitive.Close render={<Button variant="secondary" />}>{closeLabel}</DialogPrimitive.Close>}
      {children}
    </div>
  )
}

function DialogTitle({ className, ...props }: DialogPrimitive.Title.Props) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("text-heading text-foreground [word-break:auto-phrase]", className)}
      {...props}
    />
  )
}

function DialogDescription({ className, ...props }: DialogPrimitive.Description.Props) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-ui text-muted-foreground [word-break:auto-phrase]", className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
export type { DialogCloseGuardProps }
