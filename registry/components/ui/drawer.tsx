import * as React from "react"
import { Drawer as DrawerPrimitive } from "@base-ui/react/drawer"
import { X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// Flow Design Drawer
// shadcn/ui（Base UI 版）の Drawer と同じ名前と構造。shadcn/ui と同じく Base UI の Drawer を使い、
// 追加の依存パッケージ（vaul など）を使わない。Flow Design では次を追加している。
// - DrawerBody：ヘッダーとフッターを残して、この部分だけをスクロールする
// - 閉じるボタン（showCloseButton）。スワイプだけに閉じる操作を頼らない
// - unsavedChanges と onDiscardRequest：Dialog と同じ。スワイプで閉じようとしたときも onDiscardRequest を呼ぶ
// - ソフトウェアキーボード：Base UI の VirtualKeyboardProvider で、フォーカスした入力欄を表示範囲に保つ
// スワイプと内部のスクロールの競合は Base UI が処理する。内容がスクロールできる間はスクロールし、
// 端まで達してからスワイプで閉じる。
// 定義は docs/web/components/drawer.md を参照。

type DrawerContextValue = {
  modal: DrawerPrimitive.Root.Props["modal"]
}

const DrawerContext = React.createContext<DrawerContextValue>({ modal: true })

// 未保存の変更の保護。unsavedChanges を渡す場合は、onDiscardRequest も必ず指定する（型で検出する）。
// 確認を出さず、外側のクリックだけを止める場合は onDiscardRequest={null} と明示する。
type DrawerCloseGuardProps =
  | { unsavedChanges?: undefined; onDiscardRequest?: undefined }
  | {
      /**
       * 未保存の変更がある。判断は製品が行う。
       * true のとき、外側のクリックでは閉じない。Escape、閉じるボタン、Close の部品（Drawer はスワイプも）では
       * 閉じずに onDiscardRequest を呼ぶ。保存の後などに製品が open を false にした場合は閉じる。
       */
      unsavedChanges: boolean
      /**
       * unsavedChanges のときに閉じる操作が行われた。変更を破棄するかを確かめる Alert Dialog を開く。
       * null を指定すると確認を出さず、外側のクリックだけを止める（明示的な閉じる操作では閉じる）。
       */
      onDiscardRequest: (() => void) | null
    }

// 型を通らずに（JavaScript など）onDiscardRequest を指定し忘れた場合に、開発時に 1 回だけ知らせる。
// 実行時の動作は変えない（外側のクリックだけを止め、明示的な閉じる操作では閉じる）。
function useMissingDiscardRequestWarning(name: string, unsavedChanges: boolean, onDiscardRequest: unknown) {
  const warned = React.useRef(false)
  React.useEffect(() => {
    if (process.env.NODE_ENV === "production" || warned.current) return
    if (unsavedChanges && onDiscardRequest === undefined) {
      warned.current = true
      console.warn(
        `[Flow Design] ${name}: unsavedChanges が true ですが、onDiscardRequest が指定されていません。` +
          "Escape や閉じるボタンでは、確認せずに閉じます。確認を出さない場合は onDiscardRequest={null} を指定してください。"
      )
    }
  }, [name, unsavedChanges, onDiscardRequest])
}

function Drawer({
  modal = true,
  swipeDirection = "down",
  unsavedChanges = false,
  onDiscardRequest,
  onOpenChange,
  disablePointerDismissal,
  ...props
}: DrawerPrimitive.Root.Props & DrawerCloseGuardProps) {
  useMissingDiscardRequestWarning("Drawer", unsavedChanges, onDiscardRequest)
  const value = React.useMemo(() => ({ modal }), [modal])
  return (
    <DrawerContext.Provider value={value}>
      <DrawerPrimitive.Root
        modal={modal}
        swipeDirection={swipeDirection}
        disablePointerDismissal={disablePointerDismissal ?? unsavedChanges}
        onOpenChange={(open, details) => {
          if (!open && unsavedChanges && details.reason !== "imperative-action" && details.reason !== "none") {
            const pointer = details.reason === "outside-press" || details.reason === "focus-out"
            // onDiscardRequest がない場合は、閉じる手段がなくならないよう、明示的な閉じる操作は止めない。
            if (pointer || onDiscardRequest) {
              details.cancel()
              // 取り消せない閉じる要求（Android で戻る操作が続いた場合など）は、そのまま閉じる。
              if (details.isCanceled) {
                if (!pointer) onDiscardRequest?.()
                return
              }
            }
          }
          onOpenChange?.(open, details)
        }}
        {...props}
      />
    </DrawerContext.Provider>
  )
}

function DrawerTrigger(props: DrawerPrimitive.Trigger.Props) {
  return <DrawerPrimitive.Trigger data-slot="drawer-trigger" {...props} />
}

function DrawerPortal(props: DrawerPrimitive.Portal.Props) {
  return <DrawerPrimitive.Portal data-slot="drawer-portal" {...props} />
}

function DrawerClose(props: DrawerPrimitive.Close.Props) {
  return <DrawerPrimitive.Close data-slot="drawer-close" {...props} />
}

// Dialog と同じ背景。黒 40%、ぼかしなし。スワイプの量に合わせて薄くする。
function DrawerOverlay({ className, ...props }: DrawerPrimitive.Backdrop.Props) {
  return (
    <DrawerPrimitive.Backdrop
      data-slot="drawer-overlay"
      className={cn(
        "fixed inset-0 z-40 min-h-dvh bg-black/40 supports-[-webkit-touch-callout:none]:absolute",
        "opacity-[calc(1-var(--drawer-swipe-progress,0))]",
        "transition-opacity duration-(--duration-slow) ease-standard data-swiping:duration-0",
        "data-starting-style:opacity-0 data-ending-style:opacity-0",
        className
      )}
      {...props}
    />
  )
}

// 上部のハンドル。32 × 4px、完全な角丸。スワイプできることを示す飾りであり、支援技術には読ませない。
function DrawerHandle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-handle"
      aria-hidden="true"
      className={cn("absolute top-2 left-1/2 h-1 w-8 -translate-x-1/2 rounded-full bg-border-strong", className)}
      {...props}
    />
  )
}

function DrawerContent({
  className,
  children,
  showCloseButton = true,
  showHandle = true,
  closeLabel = "閉じる",
  ...props
}: DrawerPrimitive.Popup.Props & {
  showCloseButton?: boolean
  /** 上部のハンドル。下から開くときだけ表示する */
  showHandle?: boolean
  /** 閉じるボタンのアクセシブルな名前 */
  closeLabel?: string
}) {
  const { modal } = React.useContext(DrawerContext)
  return (
    <DrawerPrimitive.VirtualKeyboardProvider>
      <DrawerPortal>
        {modal === true && <DrawerOverlay />}
        <DrawerPrimitive.Viewport
          data-slot="drawer-viewport"
          data-modal={modal === true || undefined}
          className="pointer-events-none fixed inset-0 z-40 flex items-end justify-center data-modal:pointer-events-auto"
        >
          <DrawerPrimitive.Popup
            data-slot="drawer-popup"
            data-close-button={showCloseButton || undefined}
            className={cn(
              "group/drawer-popup pointer-events-auto relative flex w-full flex-col bg-background text-body text-foreground outline-none",
              "transition-transform duration-(--duration-slow) ease-enter data-ending-style:ease-exit",
              "data-swiping:duration-0 data-swiping:select-none",
              "data-ending-style:duration-[calc(var(--drawer-swipe-strength,1)*var(--duration-slow))]",
              // 開閉の移動は motion-safe にする。動きを減らす設定では、--duration-slow も 0ms になる。
            // 下から開く（標準）。上の角だけを 20px で丸め、高さは利用できる高さの 90% までにする。
              "data-[swipe-direction=down]:max-h-[90dvh] data-[swipe-direction=down]:rounded-t-xl sm:data-[swipe-direction=down]:max-w-[40rem]",
              "data-[swipe-direction=down]:transform-[translateY(var(--drawer-swipe-movement-y,0px))]",
              "motion-safe:data-[swipe-direction=down]:data-starting-style:transform-[translateY(100%)] motion-safe:data-[swipe-direction=down]:data-ending-style:transform-[translateY(100%)]",
              // 上から開く
              "data-[swipe-direction=up]:fixed data-[swipe-direction=up]:top-0 data-[swipe-direction=up]:max-h-[90dvh] data-[swipe-direction=up]:rounded-b-xl",
              "data-[swipe-direction=up]:transform-[translateY(var(--drawer-swipe-movement-y,0px))]",
              "motion-safe:data-[swipe-direction=up]:data-starting-style:transform-[translateY(-100%)] motion-safe:data-[swipe-direction=up]:data-ending-style:transform-[translateY(-100%)]",
              // 左右から開く
              "data-[swipe-direction=left]:fixed data-[swipe-direction=left]:inset-y-0 data-[swipe-direction=left]:left-0 data-[swipe-direction=left]:max-w-[22.5rem] data-[swipe-direction=left]:rounded-r-xl",
              "data-[swipe-direction=right]:fixed data-[swipe-direction=right]:inset-y-0 data-[swipe-direction=right]:right-0 data-[swipe-direction=right]:max-w-[22.5rem] data-[swipe-direction=right]:rounded-l-xl",
              "data-[swipe-direction=left]:transform-[translateX(var(--drawer-swipe-movement-x,0px))] data-[swipe-direction=right]:transform-[translateX(var(--drawer-swipe-movement-x,0px))]",
              "motion-safe:data-[swipe-direction=left]:data-starting-style:transform-[translateX(-100%)] motion-safe:data-[swipe-direction=left]:data-ending-style:transform-[translateX(-100%)]",
              "motion-safe:data-[swipe-direction=right]:data-starting-style:transform-[translateX(100%)] motion-safe:data-[swipe-direction=right]:data-ending-style:transform-[translateX(100%)]",
              className
            )}
            {...props}
          >
            {showHandle && <DrawerHandle className="hidden group-data-[swipe-direction=down]/drawer-popup:block" />}
            <DrawerPrimitive.Content data-slot="drawer-content" className="flex min-h-0 flex-1 flex-col">
              {children}
            </DrawerPrimitive.Content>
            {showCloseButton && (
              <DrawerPrimitive.Close
                data-slot="drawer-close-button"
                render={<Button variant="ghost" size="icon-sm" aria-label={closeLabel} className="absolute top-4 right-4" />}
              >
                <X />
              </DrawerPrimitive.Close>
            )}
          </DrawerPrimitive.Popup>
        </DrawerPrimitive.Viewport>
      </DrawerPortal>
    </DrawerPrimitive.VirtualKeyboardProvider>
  )
}

function DrawerHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-header"
      className={cn("flex shrink-0 flex-col gap-2 px-6 pt-6 pb-4 group-data-[close-button]/drawer-popup:pr-16", className)}
      {...props}
    />
  )
}

// スクロールする内容。フッターがないときは、下端の Safe Area の分だけ余白を足す。
function DrawerBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-body"
      className={cn(
        "min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pt-1 pb-6 last:pb-[calc(1.5rem+env(safe-area-inset-bottom))]",
        className
      )}
      {...props}
    />
  )
}

// 操作ボタン。Dialog と同じく、キャンセルを左、主要な操作を右に置き、640px 未満の幅では均等の幅に広げる。
// 下端の Safe Area の分だけ余白を足す。
function DrawerFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="drawer-footer"
      className={cn(
        "flex shrink-0 flex-wrap gap-2 px-6 pt-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] *:flex-1 sm:justify-end sm:*:flex-none",
        className
      )}
      {...props}
    />
  )
}

function DrawerTitle({ className, ...props }: DrawerPrimitive.Title.Props) {
  return (
    <DrawerPrimitive.Title
      data-slot="drawer-title"
      className={cn("text-heading text-foreground [word-break:auto-phrase]", className)}
      {...props}
    />
  )
}

function DrawerDescription({ className, ...props }: DrawerPrimitive.Description.Props) {
  return (
    <DrawerPrimitive.Description
      data-slot="drawer-description"
      className={cn("text-ui text-muted-foreground [word-break:auto-phrase]", className)}
      {...props}
    />
  )
}

export {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHandle,
  DrawerHeader,
  DrawerOverlay,
  DrawerPortal,
  DrawerTitle,
  DrawerTrigger,
}
