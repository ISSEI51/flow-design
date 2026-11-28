"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import type { FormBlocker, FormValues } from "@/patterns/form-state"

// Flow Design Form Layout（Patterns / Forms & Workflows）
// フォームの列、操作ボタン、保存できない理由の表示。定義と判断基準は docs/web/patterns/form-layout.md を参照。
//
// 既存の部品をそのまま使う：Field、FieldLabel、FieldGroup（項目の間 16px）、FieldSet、FieldLegend、FieldDescription、
// FieldError、FieldRequiredMark、FieldOptionalMark（Components）と、Section、SectionStack（App Structure）。
// フォームの幅は PageLayout の width="focused"（40rem、640px）を基本とする。
// この部品が加えるのは、Components と App Structure にない次の 3 つだけである。
// - FormRow：関係の強い項目（姓と名、開始日と終了日、数値と単位）を横に並べる。領域が狭いと 1 列になる。
// - FormActions：フォームの末尾の操作ボタン。長いフォームでは画面の下に固定できる（sticky）。
// - SaveBlockerNotice：保存ボタンが押せない理由と、該当する項目へ移動するボタン。

const rowTemplates = {
  // 同じ重みの 2 項目（姓と名、開始日と終了日、最小値と最大値）
  equal: "@md/form-row:grid-cols-2",
  // 数値と単位、郵便番号と住所の検索のように、片方が短い項目
  "value-unit": "@md/form-row:grid-cols-[minmax(0,1fr)_minmax(0,10rem)]",
} as const

/**
 * 関係の強い項目を横に並べる。並べる理由がない項目（空いた場所を埋めるため）には使わない。
 * 列の切り替えは、画面の幅ではなく、置かれた領域の幅（Container Query、28rem）で判断する。
 * 視覚の順序は DOM の順序と同じ（左から右、狭い領域では上から下）。order などで入れ替えない。
 */
function FormRow({
  columns = "equal",
  className,
  ...props
}: React.ComponentProps<"div"> & { columns?: keyof typeof rowTemplates }) {
  return (
    <div data-slot="form-row" data-columns={columns} className="@container/form-row min-w-0">
      <div className={cn("grid min-w-0 grid-cols-1 items-start gap-4", rowTemplates[columns], className)} {...props} />
    </div>
  )
}

// スクロールの領域（AppShellMain の main など）。overflow-y が auto か scroll の、最も近い祖先。
function scrollContainerOf(el: HTMLElement) {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY
    if (o === "auto" || o === "scroll") return p
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement
}

/** 操作ボタンを固定する画面の幅（Tailwind の sm） */
const STICKY_QUERY = "(min-width: 40rem)"

const isTextEntry = (el: Element | null) =>
  el instanceof HTMLTextAreaElement ||
  (el instanceof HTMLElement && el.isContentEditable) ||
  (el instanceof HTMLInputElement &&
    !["button", "checkbox", "radio", "range", "color", "file", "submit", "reset", "image", "hidden"].includes(el.type))

/**
 * フォームの末尾の操作ボタン。キャンセル（Secondary）を左、保存（Primary）を右に置く。
 * notice には SaveBlockerNotice などを渡し、ボタンの左（狭い領域ではボタンの上）に表示する。
 *
 * sticky：長いフォームや Sheet で、画面の下に固定する。
 * - 固定するのは画面の幅が 640px 以上のときだけ。狭い画面では、理由の文と折り返したボタンが画面の多くを覆うため、
 *   フォームの末尾に置く。
 * - スクロールの領域の scroll-padding-bottom に、この要素の高さを設定する。フォーカスした入力欄、エラー、
 *   エラーの概要からの移動先が、固定した操作ボタンの下に隠れない。1 つのスクロールの領域に 1 つまで置く。
 * - 下の余白に Safe Area（--app-safe-bottom）を含める。
 * - タッチ操作の端末（タブレットなど）で文字の入力欄にフォーカスがある間は、固定を解除する（ソフトウェアキーボードの上に残り、
 *   入力の領域を狭くしないため）。固定を解除しても、フォームの末尾の位置は変わらない。
 * - 狭い領域では、ボタンの文字を折り返さず、収まらないボタンを次の行に送る。
 */
function FormActions({
  sticky = false,
  notice,
  className,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  sticky?: boolean
  /** 保存できない理由など、ボタンの近くに示す文 */
  notice?: React.ReactNode
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  const [typing, setTyping] = React.useState(false)

  React.useEffect(() => {
    const el = ref.current
    if (!sticky || !el) return
    const container = scrollContainerOf(el)
    const previous = container.style.scrollPaddingBottom
    const wide = window.matchMedia(STICKY_QUERY)
    const apply = () => {
      container.style.scrollPaddingBottom = wide.matches ? `${Math.ceil(el.getBoundingClientRect().height) + 16}px` : previous
    }
    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(el)
    wide.addEventListener("change", apply)
    return () => {
      observer.disconnect()
      wide.removeEventListener("change", apply)
      container.style.scrollPaddingBottom = previous
    }
  }, [sticky])

  React.useEffect(() => {
    if (!sticky) return
    const coarse = window.matchMedia("(pointer: coarse)")
    const update = () => setTyping(coarse.matches && isTextEntry(document.activeElement) && !(document.activeElement as HTMLInputElement).readOnly)
    document.addEventListener("focusin", update)
    document.addEventListener("focusout", update)
    return () => {
      document.removeEventListener("focusin", update)
      document.removeEventListener("focusout", update)
    }
  }, [sticky])

  return (
    <div
      ref={ref}
      data-slot="form-actions"
      data-sticky={sticky || undefined}
      data-typing={typing || undefined}
      className={cn(
        "@container/form-actions flex min-w-0 flex-col gap-3",
        sticky &&
          "sm:sticky sm:bottom-0 sm:z-10 sm:border-t sm:border-border sm:bg-background sm:pt-4 sm:pb-[max(1rem,var(--app-safe-bottom,0px))] sm:data-typing:static",
        className
      )}
      {...props}
    >
      <div className="flex min-w-0 flex-col gap-3 @lg/form-actions:flex-row @lg/form-actions:items-center @lg/form-actions:justify-between">
        <div data-slot="form-actions-notice" className="min-w-0 empty:hidden @lg/form-actions:flex-1">
          {notice}
        </div>
        <div data-slot="form-actions-buttons" className="flex flex-wrap justify-end gap-2 max-sm:*:grow max-sm:*:whitespace-nowrap @lg/form-actions:ml-auto">
          {children}
        </div>
      </div>
    </div>
  )
}

/**
 * Field の中の操作部品にフォーカスを移す。エラーの概要や、保存できない理由のボタンから使う。
 * Checkbox と Switch の id は Base UI が隠れた input に付けるため、同じ Field の操作部品を探す。
 */
function focusFormControl(id: string) {
  const el = document.getElementById(id)
  if (!el) return false
  const target =
    el instanceof HTMLInputElement && el.getAttribute("aria-hidden") === "true"
      ? el.closest("[data-slot=field], [data-slot=field-item]")?.querySelector<HTMLElement>("[role=checkbox],[role=switch],[role=radio]")
      : el
  if (!target) return false
  target.focus({ preventScroll: true })
  target.scrollIntoView({ block: "center" })
  return true
}

const kindLabel = { missing: "未入力", incomplete: "入力の途中", invalid: "修正が必要", checking: "確認中", "check-failed": "確認できなかった" } as const

/**
 * 保存ボタンが押せない理由。保存ボタンの aria-describedby に id を渡す。
 * - 未入力の項目と、入力の途中の項目（エラーをまだ表示していない）は「あと N 項目」と数える。
 * - エラーを表示している項目は「修正が必要」と数える。
 * - 非同期の検証の結果を待っている間は「確認しています」と示す。検証できなかった（check-failed）場合は、保存できない理由として示す。
 * detail を指定すると、該当する項目へ移動するボタンを置く（長いフォーム）。項目が detailLimit 以下なら項目ごとに並べ、
 * 超える場合は最初の項目へのボタンだけを置く。
 * reason：項目以外の、保存できない理由。指定すると、項目の理由の代わりに示す（Focusable Disabled の保存ボタンの
 * aria-describedby の参照先を空にしない）。unknown は画面に示し、submitting と composing は支援技術にだけ伝える。
 * 理由がないときは、何も表示しない（要素は残し、aria-describedby の参照先を保つ）。
 */
function SaveBlockerNotice<V extends FormValues>({
  blockers,
  hidden = false,
  detail = false,
  detailLimit = 3,
  goal = "保存できます",
  unchanged = false,
  reason,
  onFocusField,
  className,
  ...props
}: Omit<React.ComponentProps<"div">, "children"> & {
  blockers: readonly FormBlocker<V>[]
  /** 理由を示さない（保存中、変換中、変更がない場合など） */
  hidden?: boolean
  /** 該当する項目へ移動するボタンを置く */
  detail?: boolean
  /** 項目ごとのボタンを並べる上限。超える場合は「最初の項目へ移動」だけを置く（入力を始めたばかりのフォームで、一覧が長くならない） */
  detailLimit?: number
  /** 理由がなくなったときにできること（「保存できます」「次へ進めます」） */
  goal?: string
  /**
   * 変更がないため保存ボタンを押せない（編集のフォーム）。見た目では示さず、支援技術にだけ伝える
   * （変更していないフォームの保存ボタンが押せないことは見ればわかるため。原則 04）
   */
  unchanged?: boolean
  /**
   * 項目以外の、保存できない理由（useFormState の状態）。
   * unknown：保存の結果が不明（status が "unknown"）。「保存されたかを確かめると{goal}」を示す。
   * submitting：保存中。composing：IME の変換中。どちらも見た目では示さず（Loading と入力中の表示でわかるため）、支援技術にだけ伝える。
   */
  reason?: "unknown" | "submitting" | "composing"
  onFocusField?: (name: FormBlocker<V>["name"]) => void
}) {
  const list = hidden || reason ? [] : blockers
  const toFill = list.filter((b) => b.kind === "missing" || b.kind === "incomplete")
  const invalid = list.filter((b) => b.kind === "invalid")
  const checking = list.filter((b) => b.kind === "checking")
  const checkFailed = list.filter((b) => b.kind === "check-failed")
  // 修正が必要な項目と確認できなかった項目を先に、その後は画面の順序
  const ordered = [...invalid, ...checkFailed, ...toFill]
  // 理由が 1 種類だけなら、何をすれば goal になるかを示す。複数の種類があれば、種類ごとの件数を並べる
  const failedLabels = checkFailed.map((b) => b.label).join("、")
  const parts: string[] = []
  if (toFill.length && invalid.length) parts.push(`未入力の項目が ${toFill.length} つ、修正が必要な項目が ${invalid.length} つあります`)
  else if (toFill.length) parts.push(checkFailed.length ? `未入力の項目が ${toFill.length} つあります` : `あと ${toFill.length} 項目を入力すると${goal}`)
  else if (invalid.length) parts.push(`${invalid.length} 項目に修正が必要です`)
  if (checkFailed.length) parts.push(parts.length ? `${failedLabels}を確かめられませんでした` : `${failedLabels}を確かめられませんでした。確かめ直すと${goal}`)
  if (!parts.length && checking.length) parts.push(`${checking.map((b) => b.label).join("、")}を確認しています`)
  const summary = parts.join("。")
  return (
    <div data-slot="save-blocker-notice" className={cn("flex min-w-0 flex-col gap-2 text-ui", className)} {...props}>
      {summary && <p className="text-muted-foreground [word-break:auto-phrase]">{summary}</p>}
      {reason === "unknown" && <p className="text-muted-foreground [word-break:auto-phrase]">保存されたかを確かめると{goal}</p>}
      {reason === "submitting" && <p className="sr-only">保存しています</p>}
      {reason === "composing" && <p className="sr-only">文字を変換しています。確定すると、入力した値を確かめます</p>}
      {!summary && !reason && unchanged && !hidden && <p className="sr-only">変更がありません。変更すると{goal}</p>}
      {detail && onFocusField && ordered.length > detailLimit && (
        <button
          type="button"
          data-blocker={ordered[0].name}
          onClick={() => onFocusField(ordered[0].name)}
          className="inline-flex min-h-10 w-fit items-center rounded-xs text-left text-foreground underline underline-offset-4 outline-none focus-visible:focus-ring"
        >
          最初の項目（{ordered[0].label}）へ移動
        </button>
      )}
      {detail && onFocusField && ordered.length > 0 && ordered.length <= detailLimit && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          {ordered.map((b) => (
            <li key={b.name}>
              <button
                type="button"
                data-blocker={b.name}
                onClick={() => onFocusField(b.name)}
                className="inline-flex min-h-10 items-center rounded-xs text-left text-foreground outline-none focus-visible:focus-ring"
              >
                <span className="underline underline-offset-4">{b.label}</span>
                <span className="ml-1 text-muted-foreground">（{kindLabel[b.kind]}）</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export { FormActions, FormRow, SaveBlockerNotice, focusFormControl }
