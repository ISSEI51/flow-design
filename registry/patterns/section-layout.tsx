"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

// Flow Design Section Layout（Patterns / App Structure）
// ページの中の情報のまとまり（セクション）の見出し、間隔、区切り方。定義と判断基準は docs/web/patterns/section-layout.md を参照。
//
// - 見出しの階層は HTML の見出し（h2〜h6）で表す。Section を入れ子にすると、見出しの階層が 1 つずつ下がる。
//   ページのタイトル（h1）の直下の Section は h2（24px / 600）、その中の Section は h3（20px / 600）になる。
//   文字の大きさは階層から決まり、大きさだけで見出しを表さない。
// - 見出しと内容の間：セクションは 24px、サブセクションは 16px。補足の説明（14px）は見出しの下 8px。
// - セクションの中の操作は SectionActions で見出しの右に置き、収まらない場合は見出しの下へ移す。Secondary か Ghost を基本とする。
// - 区切りは、余白 → 文字の強弱 → 細い境界線（divider）→ 背景色 → Card の順に検討する。
//   この部品は余白、文字の強弱、細い境界線までを持つ。背景色と Card は、必要な場合だけ製品が Card などで加える。
// - 見出しは常に HTML の見出しの要素で、支援技術の見出しの一覧から移動できる。region のランドマークにするのは
//   landmark を付けた Section だけ（小さなまとまりまでランドマークにすると、ランドマークで移動する候補が増えすぎる）。
// - セクションの間（SectionStack）：セクションは 48px、情報のグループは 32px、大きな章は 64px（md 以上で 96px）。

const SectionLevelContext = React.createContext(1)
const SectionTitleIdContext = React.createContext<string | undefined>(undefined)

/** 現在の見出しの階層（ページのタイトルは 1） */
function useSectionLevel() {
  return React.useContext(SectionLevelContext)
}

function Section({
  level: levelProp,
  divider = false,
  landmark = false,
  className,
  "aria-labelledby": labelledBy,
  ...props
}: React.ComponentProps<"section"> & {
  /** 見出しの階層（2〜6）。省略すると、外側の Section の 1 つ下（最上位は 2） */
  level?: number
  /** 前の内容との間に細い境界線を引く。余白と文字の強弱で区切りが伝わる場合は使わない */
  divider?: boolean
  /**
   * 見出しを名前にして、region のランドマークにする。ランドマークで移動する候補が増えすぎないよう、
   * ページの主要なまとまり（ランドマークで直接移動したい領域）だけに付ける。付ける場合は SectionTitle を必ず置く
   */
  landmark?: boolean
}) {
  const parent = useSectionLevel()
  const level = Math.min(6, Math.max(2, levelProp ?? parent + 1))
  const titleId = `section-title-${React.useId().replace(/[^a-zA-Z0-9_-]/g, "")}`
  return (
    <SectionLevelContext.Provider value={level}>
      <SectionTitleIdContext.Provider value={titleId}>
        <section
          data-slot="section"
          data-level={level}
          data-divider={divider || undefined}
          aria-labelledby={labelledBy ?? (landmark ? titleId : undefined)}
          className={cn(
            "flex min-w-0 flex-col",
            level === 2 ? "gap-6" : "gap-4",
            divider && "border-t border-border pt-8",
            className
          )}
          {...props}
        />
      </SectionTitleIdContext.Provider>
    </SectionLevelContext.Provider>
  )
}

// 見出し（と補足の説明）と、セクションの中の操作の行。
function SectionHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="section-header"
      className={cn("flex min-w-0 flex-wrap items-start justify-between gap-x-6 gap-y-3", className)}
      {...props}
    />
  )
}

function SectionHeading({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="section-heading" className={cn("flex min-w-0 flex-[1_1_16rem] flex-col gap-2", className)} {...props} />
}

const headingTags = ["h2", "h3", "h4", "h5", "h6"] as const

function SectionTitle({ className, id, ...props }: React.ComponentProps<"h2">) {
  const level = useSectionLevel()
  const titleId = React.useContext(SectionTitleIdContext)
  const Comp = headingTags[Math.min(6, Math.max(2, level)) - 2]
  return (
    <Comp
      data-slot="section-title"
      id={id ?? titleId}
      className={cn(level <= 2 ? "text-section" : "text-heading", "min-w-0 [overflow-wrap:anywhere] [word-break:auto-phrase]", className)}
      {...props}
    />
  )
}

function SectionDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <p
      data-slot="section-description"
      className={cn("max-w-[40rem] text-ui text-muted-foreground [word-break:auto-phrase]", className)}
      {...props}
    />
  )
}

function SectionActions({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div data-slot="section-actions" className={cn("flex max-w-full min-w-0 flex-wrap items-center gap-2", className)} {...props} />
  )
}

const stackSpacing = {
  group: "gap-8",
  section: "gap-12",
  chapter: "gap-16 md:gap-24",
} as const

// 同じ関係の要素を、同じ間隔で縦に並べる。間隔は情報の関係で選ぶ。
function SectionStack({
  spacing = "section",
  className,
  ...props
}: React.ComponentProps<"div"> & {
  /** group：情報のグループの間（32px）。section：セクションの間（48px）。chapter：大きな章の間（64px、md 以上で 96px） */
  spacing?: keyof typeof stackSpacing
}) {
  return <div data-slot="section-stack" data-spacing={spacing} className={cn("flex min-w-0 flex-col", stackSpacing[spacing], className)} {...props} />
}

export {
  Section,
  SectionActions,
  SectionDescription,
  SectionHeader,
  SectionHeading,
  SectionStack,
  SectionTitle,
  useSectionLevel,
}
