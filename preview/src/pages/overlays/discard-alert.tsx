import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

// 未保存の変更を破棄するかを確かめる。Dialog、Sheet、Drawer の onDiscardRequest から開く。
// 親の Overlay の中に置くと入れ子として扱われ、Escape はこの Alert Dialog だけを閉じる。
// 「編集を続ける」（安全な選択肢）に初期フォーカスが当たる。
export function DiscardAlert({
  open,
  onOpenChange,
  onDiscard,
  testId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onDiscard: () => void
  testId?: string
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent size="sm" data-testid={testId}>
        <AlertDialogHeader>
          <AlertDialogTitle>変更を破棄しますか？</AlertDialogTitle>
          <AlertDialogDescription>入力した内容は保存されません。</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>編集を続ける</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onDiscard}>
            変更を破棄
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
