"use client"

import * as React from "react"
import { Dialog as SheetPrimitive } from "@base-ui/react/dialog"
import { X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// Flow Design Sheet
// shadcn/ui（Base UI 版）の Sheet と同じ名前と構造（side、showCloseButton）。Flow Design では次を追加している。
// - mode：閲覧（view）と編集（edit）。コンポーネントは推測せず、製品が指定する。
//     view … 非モーダル。背景を暗くせず、元の画面を操作できる。外側のクリックでは閉じない。
//     edit … モーダル（既定）。Dialog と同じ背景で、背景の操作を止め、フォーカスを Sheet の中に閉じ込める。
//   modal を指定した場合は、modal が mode より優先する。背景の表示も含め、すべて実際のモーダル性に従う。
// - size（sm / default / lg）：左右に開くときの幅
// - SheetBody：ヘッダーとフッターを固定し、この部分だけをスクロールする
// - unsavedChanges と onDiscardRequest：Dialog と同じ、未保存の変更があるときの閉じる操作の制御
// 定義は docs/web/components/sheet.md を参照。

type SheetMode = "view" | "edit"

type SheetModal = NonNullable<SheetPrimitive.Root.Props["modal"]>

// mode と、実際のモーダル性。背景の表示は、実際のモーダル性に合わせる。
const SheetModeContext = React.createContext<{ mode: SheetMode; modal: SheetModal }>({ mode: "edit", modal: true })

// 未保存の変更の保護。unsavedChanges を渡す場合は、onDiscardRequest も必ず指定する（型で検出する）。
// 確認を出さず、外側のクリックだけを止める場合は onDiscardRequest={null} と明示する。
type SheetCloseGuardProps =
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

function Sheet({
  mode = "edit",
  modal,
  unsavedChanges = false,
  onDiscardRequest,
  onOpenChange,
  disablePointerDismissal,
  ...props
}: SheetPrimitive.Root.Props &
  SheetCloseGuardProps & {
    /**
     * 閲覧（view）か編集（edit）か。既定は edit。モーダル性の既定値を決める（edit は true、view は false）。
     * modal を指定した場合は、modal を優先する（shadcn/ui、Base UI との互換）。
     */
    mode?: SheetMode
  }) {
  // 優先順位：modal（指定した場合）→ mode。背景の表示、背景の操作、スクロール、フォーカスの閉じ込めは、
  // すべてこの値に従う（背景を暗くするのは true のときだけ。"trap-focus" はフォーカスだけを閉じ込める）。
  useMissingDiscardRequestWarning("Sheet", unsavedChanges, onDiscardRequest)
  const resolvedModal: SheetModal = modal ?? mode === "edit"
  const value = React.useMemo(() => ({ mode, modal: resolvedModal }), [mode, resolvedModal])
  return (
    <SheetModeContext.Provider value={value}>
      <SheetPrimitive.Root
        modal={resolvedModal}
        // 背景を操作できる間（モーダルでないとき）は、一覧の別の行を選んでも閉じずに内容を切り替えられるよう、
        // 外側のクリックとフォーカスの移動では閉じない。
        disablePointerDismissal={disablePointerDismissal ?? (resolvedModal !== true || unsavedChanges)}
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
    </SheetModeContext.Provider>
  )
}

function SheetTrigger(props: SheetPrimitive.Trigger.Props) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose(props: SheetPrimitive.Close.Props) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal(props: SheetPrimitive.Portal.Props) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

// Dialog と同じ背景。黒 40%、ぼかしなし。モーダル（modal が true）のときだけ表示する。
function SheetOverlay({ className, ...props }: SheetPrimitive.Backdrop.Props) {
  return (
    <SheetPrimitive.Backdrop
      data-slot="sheet-overlay"
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

function SheetContent({
  className,
  children,
  side = "right",
  size = "default",
  showCloseButton = true,
  closeLabel = "閉じる",
  ...props
}: SheetPrimitive.Popup.Props & {
  side?: "top" | "right" | "bottom" | "left"
  /** 左右に開くときの幅。sm 360px、default 480px、lg 640px。画面が狭いときは画面の幅になる */
  size?: "sm" | "default" | "lg"
  showCloseButton?: boolean
  /** 閉じるボタンのアクセシブルな名前 */
  closeLabel?: string
}) {
  const { mode, modal } = React.useContext(SheetModeContext)
  return (
    <SheetPortal>
      {modal === true && <SheetOverlay />}
      <SheetPrimitive.Popup
        data-slot="sheet-content"
        data-side={side}
        data-size={size}
        data-mode={mode}
        data-modal={String(modal)}
        data-close-button={showCloseButton || undefined}
        className={cn(
          "group/sheet-content fixed z-40 flex flex-col bg-background text-body text-foreground outline-none",
          "transition-[translate,opacity] duration-(--duration-slow) ease-enter data-ending-style:ease-exit",
          // 左右：画面の高さ全体。元の画面と接する側だけに線を引き、角は丸めない。
          "data-[side=left]:inset-y-0 data-[side=left]:left-0 data-[side=left]:border-r",
          "data-[side=right]:inset-y-0 data-[side=right]:right-0 data-[side=right]:border-l",
          "data-[side=left]:w-full data-[side=right]:w-full",
          "data-[side=left]:data-[size=sm]:max-w-[22.5rem] data-[side=right]:data-[size=sm]:max-w-[22.5rem]",
          "data-[side=left]:data-[size=default]:max-w-[30rem] data-[side=right]:data-[size=default]:max-w-[30rem]",
          "data-[side=left]:data-[size=lg]:max-w-[40rem] data-[side=right]:data-[size=lg]:max-w-[40rem]",
          // 上下：内容に合わせた高さ。画面の 90% までにする。
          "data-[side=top]:inset-x-0 data-[side=top]:top-0 data-[side=top]:max-h-[90dvh] data-[side=top]:border-b",
          "data-[side=bottom]:inset-x-0 data-[side=bottom]:bottom-0 data-[side=bottom]:max-h-[90dvh] data-[side=bottom]:border-t",
          // 位置の動き。動きを減らす設定では移動しない。
          "motion-safe:data-[side=right]:data-starting-style:translate-x-full motion-safe:data-[side=right]:data-ending-style:translate-x-full",
          "motion-safe:data-[side=left]:data-starting-style:-translate-x-full motion-safe:data-[side=left]:data-ending-style:-translate-x-full",
          "motion-safe:data-[side=top]:data-starting-style:-translate-y-full motion-safe:data-[side=top]:data-ending-style:-translate-y-full",
          "motion-safe:data-[side=bottom]:data-starting-style:translate-y-full motion-safe:data-[side=bottom]:data-ending-style:translate-y-full",
          // 入れ子の Dialog（変更の破棄の確認など）が開いている間は、背後のこの面を少し暗くし、最前面を区別する。
          "after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:bg-black/0",
          "after:transition-[background-color] after:duration-(--duration-slow) data-nested-dialog-open:after:bg-black/10",
          className
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close
            data-slot="sheet-close-button"
            render={
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={closeLabel}
                className="absolute top-[max(1rem,env(safe-area-inset-top))] right-4 group-data-[side=bottom]/sheet-content:top-4"
              />
            }
          >
            <X />
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Popup>
    </SheetPortal>
  )
}

// 固定のヘッダー。画面の上端に接するとき（下から開く場合以外）は、Safe Area の分だけ下げる。
function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn(
        "flex shrink-0 flex-col gap-2 px-6 pt-[max(1.5rem,env(safe-area-inset-top))] pb-4 group-data-[side=bottom]/sheet-content:pt-6",
        "group-data-[close-button]/sheet-content:pr-16",
        className
      )}
      {...props}
    />
  )
}

// スクロールする内容。フッターがないときは、下端の Safe Area の分だけ余白を足す。
function SheetBody({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-body"
      className={cn(
        "min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 pt-1 pb-6 last:pb-[calc(1.5rem+env(safe-area-inset-bottom))]",
        className
      )}
      {...props}
    />
  )
}

// 固定のフッター。編集の完了、キャンセル、変更の破棄を置く。Dialog と同じく右寄せで、主要な操作を右に置く。
const sheetSideOf = (el: HTMLElement) => el.closest("[data-slot=sheet-content]")?.getAttribute("data-side") ?? "right"

function SheetFooter({ className, ref, ...props }: React.ComponentProps<"div">) {
  // 下と左右の Sheet の下部の操作に、Toast が重ならないようにする（Toast を Footer の上に表示する）
  const footerRef = React.useRef<HTMLDivElement>(null)
  useToastOverlayOffset(footerRef, sheetSideOf)
  return (
    <div
      ref={mergeRefs(footerRef, ref)}
      data-slot="sheet-footer"
      className={cn(
        "mt-auto flex shrink-0 flex-wrap gap-2 border-t border-border px-6 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom))]",
        "*:flex-1 sm:justify-end sm:*:flex-none",
        className
      )}
      {...props}
    />
  )
}

// ---------------------------------------------------------------- Toast との重なり
// 画面の下に接する Footer（下から開く Drawer、下・左右の Sheet）の表示中は、Toast を Footer の上に表示する。
// Footer の高さを --toast-offset-overlay に設定する（toast.tsx が --toast-offset-bottom と大きい方を使う）。
// 画面の下に固定の操作を置く製品のコードが使う --toast-offset-bottom とは別の変数にし、互いに上書きしない。
// 対象は、表示中の Footer のうち、Toast の表示の範囲（狭い画面では下の全幅、sm 以上では右下の 22.5rem）と横に重なるもの。
// 複数の Footer が開いている場合は、最も高い Footer に合わせる（Drawer と Sheet で同じ属性を使い、DOM から集める）。
const TOAST_OFFSET_ATTR = "data-toast-offset-side"

function updateToastOverlayOffset() {
  if (typeof document === "undefined") return
  const root = document.documentElement
  const vw = window.innerWidth
  const rem = parseFloat(getComputedStyle(root).fontSize) || 16
  const wide = window.matchMedia("(min-width: 40rem)").matches
  // Toast の表示の範囲（toast.tsx の Toaster と同じ値）
  const toastLeft = wide ? vw - 24 * rem : rem
  const toastRight = wide ? vw - 1.5 * rem : vw - rem
  let offset = 0
  for (const el of document.querySelectorAll<HTMLElement>(`[${TOAST_OFFSET_ATTR}]`)) {
    const side = el.getAttribute(TOAST_OFFSET_ATTR)
    if (side === "top" || !el.isConnected) continue
    // 開閉の動き（translate）の途中でも判断できるよう、左右の Overlay は端からの幅で横の範囲を求める
    const width = el.offsetWidth
    const rect = el.getBoundingClientRect()
    const left = side === "left" ? 0 : side === "right" ? vw - width : rect.left
    const right = side === "left" ? width : side === "right" ? vw : rect.right
    if (right <= toastLeft || left >= toastRight) continue
    // 下から開く Drawer の Footer は、drawer.tsx の同じ処理が Drawer の面全体の高さで扱う（同じ属性の要素を両方が集める）
    const surface = side === "bottom" ? el.closest<HTMLElement>("[data-slot=drawer-popup]") : null
    if (surface) {
      const toaster = document.querySelector<HTMLElement>("[data-slot=toaster]")
      const toastSpace = Math.max(9 * rem, (toaster?.getBoundingClientRect().height ?? 0) + 3 * rem)
      offset = Math.max(offset, Math.min(surface.offsetHeight, Math.max(el.offsetHeight, window.innerHeight - toastSpace)))
    } else offset = Math.max(offset, el.offsetHeight)
  }
  if (offset > 0) root.style.setProperty("--toast-offset-overlay", `${offset}px`)
  else root.style.removeProperty("--toast-offset-overlay")
}

/** Footer の表示中だけ、Toast を Footer の上に表示する。side は Overlay の開く側（top は対象にしない） */
function useToastOverlayOffset(ref: React.RefObject<HTMLElement | null>, sideOf: (el: HTMLElement) => string) {
  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.setAttribute(TOAST_OFFSET_ATTR, sideOf(el))
    updateToastOverlayOffset()
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(updateToastOverlayOffset)
    ro?.observe(el)
    window.addEventListener("resize", updateToastOverlayOffset)
    return () => {
      ro?.disconnect()
      window.removeEventListener("resize", updateToastOverlayOffset)
      el.removeAttribute(TOAST_OFFSET_ATTR)
      updateToastOverlayOffset()
    }
  }, [ref, sideOf])
}

function mergeRefs<T>(...refs: (React.Ref<T> | undefined)[]) {
  return (value: T | null) => {
    for (const r of refs) {
      if (typeof r === "function") r(value)
      else if (r) (r as React.RefObject<T | null>).current = value
    }
  }
}

function SheetTitle({ className, ...props }: SheetPrimitive.Title.Props) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("text-heading text-foreground [word-break:auto-phrase]", className)}
      {...props}
    />
  )
}

function SheetDescription({ className, ...props }: SheetPrimitive.Description.Props) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-ui text-muted-foreground [word-break:auto-phrase]", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetBody,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetOverlay,
  SheetPortal,
  SheetTitle,
  SheetTrigger,
}
export type { SheetMode, SheetModal }
