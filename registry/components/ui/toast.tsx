"use client"

import type * as React from "react"
import { createContext, useContext } from "react"
import { Toast as ToastPrimitive } from "@base-ui/react/toast"
import { CircleAlert, CircleCheck, Info, TriangleAlert, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// Flow Design Toast
// shadcn/ui は Sonner（sonner、next-themes）を推奨しているが、Flow Design は Base UI の Toast を使う。
// 追加の依存パッケージがなく、ホバーとフォーカスでのタイマー停止、F6 による移動、
// 読み上げの優先度、id による重複の統合を Base UI が提供するため。
// 定義は docs/web/components/toast.md を参照。

type ToastVariant = "neutral" | "success" | "info" | "warning" | "destructive"

// 種類ごとの表示時間（ms）。0 は自動で消さない。
const TOAST_TIMEOUT: Record<ToastVariant, number> = {
  neutral: 5000,
  success: 4000,
  info: 5000,
  warning: 6000,
  destructive: 0,
}

const icons = {
  neutral: { Icon: Info, className: "text-muted-foreground" },
  success: { Icon: CircleCheck, className: "text-success" },
  info: { Icon: Info, className: "text-info" },
  warning: { Icon: TriangleAlert, className: "text-warning" },
  destructive: { Icon: CircleAlert, className: "text-destructive" },
} as const

const TOAST_LIMIT = 3
const LimitContext = createContext(TOAST_LIMIT)

// アプリ全体を囲む。同時に表示する通知は limit 件まで。
// Base UI は limit を超えた古い通知を隠す（data-limited、inert）。隠れた通知は、表示中の通知が閉じると再び表示される。
function ToastProvider({ limit = TOAST_LIMIT, ...props }: ToastPrimitive.Provider.Props) {
  return (
    <LimitContext.Provider value={limit}>
      <ToastPrimitive.Provider limit={limit} {...props} />
    </LimitContext.Provider>
  )
}

// 通知を表示する場所。デスクトップは右下、モバイルは下中央。
// 画面下に固定の操作がある場合は、--toast-offset-bottom でその高さだけ上げる。
// 下から開く Drawer と、下・左右の Sheet の Footer の表示中は、Footer が --toast-offset-overlay を設定する（大きい方を使う）。
// 優先度 high（失敗）の通知は、Base UI が読み上げ用の領域で知らせ、F6 で通知の領域へ移動するまで
// 見た目の通知を支援技術から隠す。重複して読み上げないため。
function Toaster({ className, "aria-label": label = "通知", ...props }: ToastPrimitive.Viewport.Props) {
  const { toasts } = ToastPrimitive.useToastManager()
  return (
    <ToastPrimitive.Portal>
      <ToastPrimitive.Viewport
        data-slot="toaster"
        aria-label={label}
        className={cn(
          "fixed inset-x-4 z-50 mx-auto outline-none sm:inset-x-auto sm:right-6 sm:w-90",
          "bottom-[calc(1rem+env(safe-area-inset-bottom)+max(var(--toast-offset-bottom,0px),var(--toast-offset-overlay,0px)))]",
          "sm:bottom-[calc(1.5rem+env(safe-area-inset-bottom)+max(var(--toast-offset-bottom,0px),var(--toast-offset-overlay,0px)))]",
          className
        )}
        {...props}
      >
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} />
        ))}
      </ToastPrimitive.Viewport>
    </ToastPrimitive.Portal>
  )
}

// ポインターで押しても、通知（本体、閉じるボタン、操作のボタン）にフォーカスを移さない。
// モーダル（Dialog、Alert Dialog など）の表示中に通知を押すと、フォーカスがモーダルの外の通知に移り、
// 通知が消えると <body> に落ちる。次の Tab で、背後の支援技術から隠れた要素（入れ子の Dialog など）へ移っていた。
// mousedown の既定の動作（フォーカスの移動）だけを止めるため、click、Base UI のスワイプ（pointer イベント）、
// キーボードでの操作（F6 で通知の領域へ移り、Tab と Enter で押す）は変わらない。
// 説明（description）に置いた入力欄などは、押してフォーカスを移せるように除く。
const keepFocus = (event: React.MouseEvent) => {
  if (event.target instanceof Element && event.target.closest("input, textarea, select, [contenteditable]:not([contenteditable=false])")) return
  event.preventDefault()
}

function ToastItem({ toast }: { toast: ToastPrimitive.Root.ToastObject }) {
  const variant = (toast.type as ToastVariant) ?? "neutral"
  const { Icon, className } = icons[variant] ?? icons.neutral
  return (
    <ToastPrimitive.Root
      toast={toast}
      data-slot="toast"
      data-variant={variant}
      onMouseDown={keepFocus}
      className={cn(
        "absolute inset-x-0 bottom-0 rounded-md border border-border bg-background text-ui text-foreground shadow-popover select-none",
        // 通知を縦に重ねずに並べる。新しい通知が下に来る。
        "[transform:translateY(calc(var(--toast-offset-y)*-1-var(--toast-index)*0.5rem))]",
        "transition-opacity duration-(--duration-normal) ease-standard motion-safe:transition-[opacity,transform]",
        "data-starting-style:opacity-0 data-ending-style:opacity-0 data-ending-style:ease-exit",
        "data-limited:pointer-events-none data-limited:opacity-0",
        "focus-visible:focus-ring"
      )}
    >
      <ToastPrimitive.Content className="flex items-start gap-3 p-4">
        <Icon aria-hidden="true" className={cn("mt-px size-5 shrink-0", className)} />
        <div className="flex min-w-0 flex-1 flex-col gap-1 [word-break:auto-phrase]">
          <ToastPrimitive.Title data-slot="toast-title" className="font-medium" />
          <ToastPrimitive.Description data-slot="toast-description" className="text-muted-foreground" />
          {toast.actionProps && (
            <div className="mt-2">
              <ToastPrimitive.Action render={<Button size="sm" variant="secondary" />} />
            </div>
          )}
        </div>
        <ToastPrimitive.Close
          data-slot="toast-close"
          aria-label="通知を閉じる"
          render={<Button size="icon-xs" variant="ghost" aria-label="通知を閉じる" />}
        >
          <X />
        </ToastPrimitive.Close>
      </ToastPrimitive.Content>
    </ToastPrimitive.Root>
  )
}

type ToastOptions = {
  variant?: ToastVariant
  title: React.ReactNode
  description?: React.ReactNode
  /** 同じ id の通知は、新しく増やさずに内容を更新する。重複と大量の通知をまとめるのに使う。 */
  id?: string
  /** 表示時間（ms）。省略すると種類ごとの既定値。操作がある場合は自動で消さない。 */
  timeout?: number
  action?: { label: string; onClick: () => void }
}

// 自動で消えない通知（失敗、操作つき）。表示上限によって隠さないように扱う。
const isPersistent = (t: ToastPrimitive.Root.ToastObject) => t.timeout === 0

let sequence = 0

// 通知を出す。shadcn/ui の toast() に相当する。
// 表示上限（3 件）に達しているときは、次の順で扱う。
// - 自動で消える通知（成功など）があれば、そのうち最も古いものを閉じて、新しい通知を表示する。
// - すべてが自動で消えない通知で、新しい通知が自動で消える通知なら、新しい通知は表示しない（undefined を返す）。
//   失敗や操作つきの通知を、成功の通知で隠さないため。結果は画面にも示す（docs/web/components/toast.md）。
// - 新しい通知も自動で消えない通知なら、Base UI が最も古い通知を一時的に隠す。表示中の通知が閉じると再び表示される。
function useToast() {
  const manager = ToastPrimitive.useToastManager()
  const limit = useContext(LimitContext)
  const toast = ({ variant = "neutral", title, description, id, timeout, action }: ToastOptions) => {
    const effectiveTimeout = timeout ?? (action ? 0 : TOAST_TIMEOUT[variant])
    const visible = manager.toasts.filter((t) => t.transitionStatus !== "ending" && !t.limited)
    const updating = id !== undefined && visible.some((t) => t.id === id)
    if (!updating && visible.length >= limit) {
      // toasts は新しい順。最も古い自動で消える通知を探す
      const oldestTransient = [...visible].reverse().find((t) => !isPersistent(t))
      if (oldestTransient) manager.close(oldestTransient.id)
      else if (effectiveTimeout !== 0) return undefined
    }
    const toastId = id ?? `flow-toast-${++sequence}`
    return manager.add({
      id: toastId,
      title,
      description,
      type: variant,
      timeout: effectiveTimeout,
      // 失敗は即時に読み上げ、それ以外は他の読み上げを妨げない。
      priority: variant === "destructive" ? "high" : "low",
      // 操作をしたら、その通知を閉じる。
      actionProps: action
        ? {
            children: action.label,
            onClick: () => {
              action.onClick()
              manager.close(toastId)
            },
          }
        : undefined,
    })
  }
  return { toast, dismiss: manager.close, toasts: manager.toasts }
}

export { TOAST_LIMIT, TOAST_TIMEOUT, ToastProvider, Toaster, useToast }
export type { ToastOptions, ToastVariant }
