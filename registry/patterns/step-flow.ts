"use client"

import * as React from "react"

// Flow Design Step Flow（Patterns / Forms & Workflows）
// 複数のステップに分けた作業の、現在地、到達したステップ、完了したステップを持つ hook。
// 定義と判断基準は docs/web/patterns/multi-step-workflow.md を参照。入力の値は持たない（製品の useFormState などが持つ）。
//
// 移動の規則
//   次へ（next）         … 現在のステップが完了している（isComplete）場合だけ進む
//   戻る（back）         … 入力の妥当性に関係なく戻る。入力は製品が保持している
//   直接の移動（goTo）   … 前のステップへはいつでも移る。後ろのステップへは、到達したことがあり、
//                          その手前のステップがすべて完了している場合だけ移る（検証と前提条件を飛ばせない）
//   最終の送信           … firstIncomplete() で、すべてのステップを確かめ直す
//
// ステップの状態（items の status）
//   complete      … 次へで先に進んだことがあり、今も完了している
//   current       … 表示中
//   needs-review  … 完了していたが、前のステップの変更などで完了していない（後続のステップを完了として扱わない）
//   upcoming      … まだ完了していない。reachable が true なら、到達したことがあり直接移れる
//
// 条件による分岐：steps には、現在の条件で必要なステップだけを渡す。
// - 総数が決まっていない場合（後のステップが選んだ内容で変わる）は stepsKnown={false}。total は null になり、
//   架空の総数や進捗率を示さない。
// - 表示中のステップが不要になった場合は、同じ位置のステップへ移る。手前に完了していないステップがあれば、そこへ戻る。

export type StepStatus = "complete" | "current" | "needs-review" | "upcoming"

export type StepDefinition<Id extends string = string> = { id: Id; label: string }

export type StepItem<Id extends string = string> = StepDefinition<Id> & {
  index: number
  status: StepStatus
  /** 直接移動できる */
  reachable: boolean
}

export type StepFlowSnapshot<Id extends string = string> = { current: Id; reached: Id[]; completed: Id[] }

export function useStepFlow<Id extends string>({
  steps,
  isComplete,
  stepsKnown = true,
  initial,
}: {
  /** 現在の条件で必要なステップ（順序どおり） */
  steps: readonly StepDefinition<Id>[]
  /** ステップの入力が完了しているか（必須の項目と検証）。描画のたびに現在の値で判断する */
  isComplete: (id: Id) => boolean
  /** false：後のステップが、まだ決まっていない */
  stepsKnown?: boolean
  /** 下書きからの再開 */
  initial?: Partial<StepFlowSnapshot<Id>>
}) {
  const first = steps[0]?.id
  const [current, setCurrent] = React.useState<Id | undefined>(() =>
    initial?.current && steps.some((s) => s.id === initial.current) ? initial.current : first
  )
  const [reached, setReached] = React.useState<ReadonlySet<Id>>(() => new Set([...(initial?.reached ?? []), ...(current ? [current] : [])]))
  const [completed, setCompleted] = React.useState<ReadonlySet<Id>>(() => new Set(initial?.completed ?? []))
  const lastIndex = React.useRef(0)
  const focusPending = React.useRef(false)
  const headingRef = React.useRef<HTMLElement | null>(null)

  // 表示中のステップが条件で不要になった場合の移動先
  let index = steps.findIndex((s) => s.id === current)
  if (index === -1 && steps.length) {
    index = Math.min(lastIndex.current, steps.length - 1)
    const blocked = steps.slice(0, index).findIndex((s) => !isComplete(s.id))
    if (blocked !== -1) index = blocked
  }
  const resolved = steps[index]?.id
  React.useEffect(() => {
    if (resolved !== undefined && resolved !== current) {
      setCurrent(resolved)
      setReached((r) => (r.has(resolved) ? r : new Set([...r, resolved])))
    }
  }, [resolved, current])
  lastIndex.current = Math.max(0, index)

  const canGoTo = (id: Id) => {
    const target = steps.findIndex((s) => s.id === id)
    if (target === -1 || target === index) return false
    if (target < index) return true
    return reached.has(id) && steps.slice(index, target).every((s) => isComplete(s.id))
  }

  const move = (id: Id) => {
    focusPending.current = true
    setCurrent(id)
    setReached((r) => (r.has(id) ? r : new Set([...r, id])))
  }

  /** 現在のステップが完了していれば、次のステップへ進む。進んだら true */
  const next = () => {
    if (resolved === undefined || !isComplete(resolved) || index >= steps.length - 1) return false
    setCompleted((c) => (c.has(resolved) ? c : new Set([...c, resolved])))
    move(steps[index + 1].id)
    return true
  }

  const back = () => {
    if (index <= 0) return false
    move(steps[index - 1].id)
    return true
  }

  const goTo = (id: Id) => {
    if (!canGoTo(id)) return false
    // 後ろのステップへ直接移る場合は、通過したステップを完了として記録する（canGoTo で完了を確かめている）
    const target = steps.findIndex((s) => s.id === id)
    if (target > index) setCompleted((c) => new Set([...c, ...steps.slice(index, target).map((s) => s.id)]))
    move(id)
    return true
  }

  // 移動の後に、ステップの見出しにフォーカスを移す（最初の表示では移さない）
  React.useEffect(() => {
    if (!focusPending.current) return
    focusPending.current = false
    const heading = headingRef.current
    if (!heading) return
    if (!heading.hasAttribute("tabindex")) heading.setAttribute("tabindex", "-1")
    heading.focus()
  }, [resolved])

  const items: StepItem<Id>[] = steps.map((s, i) => {
    let status: StepStatus
    if (i === index) status = "current"
    else if (completed.has(s.id) || i < index) status = isComplete(s.id) ? "complete" : "needs-review"
    else status = "upcoming"
    return { ...s, index: i, status, reachable: i !== index && canGoTo(s.id) }
  })

  return {
    current: resolved,
    index,
    /** 総数。決まっていない場合は null */
    total: stepsKnown ? steps.length : null,
    items,
    isFirst: index <= 0,
    isLast: stepsKnown && index === steps.length - 1,
    canNext: resolved !== undefined && isComplete(resolved),
    next,
    back,
    goTo,
    canGoTo,
    /** 最初の完了していないステップ。すべて完了していれば undefined（最終の送信の前に確かめる） */
    firstIncomplete: () => steps.find((s) => !isComplete(s.id))?.id,
    /** ステップの見出しに付ける。移動の後にフォーカスを移す */
    headingRef: (el: HTMLElement | null) => {
      headingRef.current = el
    },
    /** 下書きに保存する値 */
    snapshot: (): StepFlowSnapshot<Id> => ({
      current: resolved ?? (first as Id),
      reached: [...reached].filter((id) => steps.some((s) => s.id === id)),
      completed: [...completed].filter((id) => steps.some((s) => s.id === id)),
    }),
    /** 状態を置き換える（下書きの再開、最初からやり直す） */
    restore: (snapshot: Partial<StepFlowSnapshot<Id>>) => {
      setCurrent(snapshot.current ?? first)
      setReached(new Set([...(snapshot.reached ?? []), ...(snapshot.current ? [snapshot.current] : first ? [first] : [])]))
      setCompleted(new Set(snapshot.completed ?? []))
    },
  }
}

export type StepFlow<Id extends string = string> = ReturnType<typeof useStepFlow<Id>>
