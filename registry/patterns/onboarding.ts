// Flow Design Onboarding（Patterns / System & Account / Onboarding）
// 初回の画面の決定、Getting Started Checklist の導出、Onboarding の状態の判定、同時に出す案内の選択を行う純粋な関数。
// 定義は docs/web/patterns/onboarding.md を参照。React、ブラウザ、永続化の仕組みに依存しない（Node からも読み込める）。
//
// この部品が守ること
// - 認証の後に、歓迎するだけの画面を挟まない。組織の作成、招待の承諾、利用開始の前に必要な設定がない場合は、製品の利用画面へ直接移る。
// - Checklist の完了は、製品が渡す「実際の作業結果」（完了した作業の ID）だけで判定する。作業のボタンを押したこと、
//   Checklist を非表示にしたことは、完了として扱わない。
// - 非表示（visibility）と完了（progress）を別の値として返す。非表示にしても、必須の作業の達成（requirementsMet）は変わらない。
// - アカウント単位の作業はアカウントの結果だけ、組織単位の作業は組織の結果だけで判定する（別の範囲の結果を混ぜない）。
// - 権限のない作業を Checklist に含めない。招待されたメンバーには、組織で完了済みの作業を再び示さない。
// - 初期作業が 1 件以下の場合は、Checklist を使わない（presentation が none）。
//
// この部品が持たないもの（製品の責務）
// - 状態の永続化（表示の状態、スキップ、途中の入力、閉じた案内）。サーバーなどに保存し、再読み込みや別の端末でも同じ状態にする。
// - 実際の作業結果の取得（顧客の件数、招待の件数、支払い方法の有無など）。サンプルデータは実際の作業結果に含めない。
// - 利用開始の要件の強制（必須の設定がない場合に機能を制限するかどうか）、権限の実際の検査（バックエンド）、計測。

// ---------------------------------------------------------------- 初回の画面

type FirstScreen =
  /** 製品の利用画面（最初の価値を体験する画面）へ直接移る */
  | { screen: "product" }
  /** 招待を承諾する（参加する組織と、招待した人を確かめる） */
  | { screen: "accept-invitation" }
  /** 組織を作成する（所属する組織がない） */
  | { screen: "create-workspace" }
  /** 利用開始の前に必要な設定がある */
  | { screen: "required-setup"; missing: string[] }

/**
 * 認証の後に表示する画面を決める。歓迎するだけの画面（Welcome）は返さない。
 * requiredSetup には「利用開始の前に必要な設定」だけを渡す。利用開始の後でもできる設定、特定の機能を使うときに必要な設定は渡さない。
 */
function resolveFirstScreen({
  hasWorkspace,
  pendingInvitation = false,
  requiredSetup = [],
}: {
  /** 利用できる組織（ワークスペース）がある */
  hasWorkspace: boolean
  /** 承諾していない招待から来た */
  pendingInvitation?: boolean
  /** 利用開始の前に必要な設定と、その完了 */
  requiredSetup?: readonly { id: string; done: boolean }[]
}): FirstScreen {
  if (pendingInvitation) return { screen: "accept-invitation" }
  if (!hasWorkspace) return { screen: "create-workspace" }
  const missing = requiredSetup.filter((s) => !s.done).map((s) => s.id)
  if (missing.length > 0) return { screen: "required-setup", missing }
  return { screen: "product" }
}

// ---------------------------------------------------------------- 状態

/** 進捗の状態。表示の状態（ChecklistVisibility）とは別に持つ */
type OnboardingProgress = "not-started" | "in-progress" | "interrupted" | "skipped" | "completed"

/** Checklist の表示の状態。利用者が選ぶ。完了とは関係しない */
type ChecklistVisibility = "expanded" | "collapsed" | "hidden"

/**
 * 初期設定（組織の作成など、複数の手順の操作）の状態を判定する。
 * - completed：完了した
 * - skipped：任意の設定を、利用者が行わないことにした（後から再開できる）
 * - in-progress：保存された途中の入力があり、いま操作している
 * - interrupted：保存された途中の入力があり、操作していない（画面を閉じた、再読み込みした、別の端末に移った）。続きから再開できる
 * - not-started：保存された途中の入力がない（最初の手順を入力中でも、まだ保存していなければ未開始）
 */
function getSetupStatus({
  completed,
  skipped = false,
  hasDraft,
  active,
}: {
  completed: boolean
  skipped?: boolean
  /** 保存された途中の入力（製品が保存したもの）がある */
  hasDraft: boolean
  /** いま、その画面を操作している */
  active: boolean
}): OnboardingProgress {
  if (completed) return "completed"
  if (skipped) return "skipped"
  if (hasDraft) return active ? "in-progress" : "interrupted"
  return "not-started"
}

// ---------------------------------------------------------------- Getting Started Checklist

type OnboardingTaskScope = "account" | "workspace"

type OnboardingTaskDefinition<Id extends string = string, P extends string = string> = {
  id: Id
  title: string
  description?: string
  /** 作業に必要な権限。null または省略は、誰でも行える */
  permission?: P | null
  /** 進捗を数える単位。account はアカウントごと、workspace は組織ごと（メンバーで共有する） */
  scope: OnboardingTaskScope
  /** 利用を続けるための要件。非表示にしても、完了するまで requirementsMet は false */
  required?: boolean
}

/** 実際の作業結果。完了した作業の ID を、範囲ごとに分けて渡す */
type OnboardingTaskResults<Id extends string = string> = {
  /** この利用者（アカウント）が完了した作業 */
  account: readonly Id[]
  /** この組織で完了した作業（誰が行ったかを問わない） */
  workspace: readonly Id[]
}

type ChecklistItem<Id extends string = string> = {
  id: Id
  title: string
  description?: string
  scope: OnboardingTaskScope
  required: boolean
  done: boolean
}

type ChecklistPresentation =
  /** Checklist を使わない（対象の作業が 1 件以下） */
  | "none"
  /** 非表示にした（製品は、再表示の入口を残す） */
  | "hidden"
  /** すべて完了した。完了を短く示し、閉じられるようにする */
  | "completed"
  | "expanded"
  | "collapsed"

type Checklist<Id extends string = string> = {
  /** 表示する作業（権限と利用者の種類で絞り込んだもの） */
  items: ChecklistItem<Id>[]
  doneCount: number
  total: number
  /** 作業の進捗。表示の状態とは別 */
  progress: Extract<OnboardingProgress, "not-started" | "in-progress" | "completed">
  /** 利用者が選んだ表示の状態 */
  visibility: ChecklistVisibility
  /** 実際に表示する形 */
  presentation: ChecklistPresentation
  /** 必須の作業がすべて完了した。非表示にしても true にならない */
  requirementsMet: boolean
  /** 完了していない必須の作業（権限のある作業だけ） */
  outstandingRequired: ChecklistItem<Id>[]
}

/**
 * Checklist の内容と状態を導く。
 * - permissions に含まれない権限が必要な作業は除く。
 * - audience が invited（既存の組織に招待されたメンバー）の場合、組織で完了済みの作業を除く（設定済みの項目を再設定させない）。
 * - 完了は results だけで判定する。アカウント単位の作業は results.account、組織単位の作業は results.workspace だけを見る。
 * - 対象の作業が minTasks（既定 2）より少ない場合、presentation は none。
 */
function deriveChecklist<Id extends string, P extends string>({
  tasks,
  permissions,
  audience,
  results,
  visibility,
  minTasks = 2,
}: {
  tasks: readonly OnboardingTaskDefinition<Id, P>[]
  /** 現在の利用者の、現在の組織での権限 */
  permissions: readonly P[]
  /** creator：組織を作成した利用者、invited：既存の組織に招待された利用者 */
  audience: "creator" | "invited"
  results: OnboardingTaskResults<Id>
  visibility: ChecklistVisibility
  minTasks?: number
}): Checklist<Id> {
  const account = new Set<string>(results.account)
  const workspace = new Set<string>(results.workspace)
  const permitted = tasks.filter((t) => !t.permission || permissions.includes(t.permission))
  const items: ChecklistItem<Id>[] = permitted
    .map((t) => ({
      id: t.id,
      title: t.title,
      description: t.description,
      scope: t.scope,
      required: t.required ?? false,
      done: (t.scope === "account" ? account : workspace).has(t.id),
    }))
    .filter((item) => !(audience === "invited" && item.scope === "workspace" && item.done))
  const doneCount = items.filter((i) => i.done).length
  const total = items.length
  const progress = total > 0 && doneCount === total ? "completed" : doneCount === 0 ? "not-started" : "in-progress"
  const outstandingRequired = items.filter((i) => i.required && !i.done)
  const presentation: ChecklistPresentation =
    total < minTasks ? "none" : visibility === "hidden" ? "hidden" : progress === "completed" ? "completed" : visibility
  return {
    items,
    doneCount,
    total,
    progress,
    visibility,
    presentation,
    requirementsMet: outstandingRequired.length === 0,
    outstandingRequired,
  }
}

// ---------------------------------------------------------------- 案内の選択

/**
 * 同時に表示する案内を 1 つに決める。候補は優先する順に渡す。
 * 表示の条件を満たし（eligible）、利用者が閉じていない（dismissed に含まれない）最初の候補の ID を返す。
 */
function pickGuidance<Id extends string>(
  candidates: readonly { id: Id; eligible: boolean }[],
  dismissed: readonly string[]
): Id | null {
  const closed = new Set(dismissed)
  return candidates.find((c) => c.eligible && !closed.has(c.id))?.id ?? null
}

export { deriveChecklist, getSetupStatus, pickGuidance, resolveFirstScreen }
export type {
  Checklist,
  ChecklistItem,
  ChecklistPresentation,
  ChecklistVisibility,
  FirstScreen,
  OnboardingProgress,
  OnboardingTaskDefinition,
  OnboardingTaskResults,
  OnboardingTaskScope,
}
