import { StrictMode, useEffect, useState } from "react"
import { createRoot } from "react-dom/client"

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
import { Button } from "@/components/ui/button"
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList, ComboboxTrigger, ComboboxValue } from "@/components/ui/combobox"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { MultiSelect } from "@/components/ui/multi-select"
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Toaster, ToastProvider, useToast } from "@/components/ui/toast"

// 複数の Overlay の重なり順の検品用の画面（preview/tests/overlays.spec.ts の「stacking: combobox and multi select」と
// 「toast above overlay footers」）。画面には置かない。?view=sheet で、Sheet の Footer と Toast の重なりの画面を開く。
// preview/ssr.html の client のスクリプトを、このファイルに置き換えて開く。StrictMode で描画する。
// Dialog の中の Combobox と Multi Select の一覧を開いたまま、検品が window.__ovl.openAlert() で Alert Dialog を開く
// （時間切れの通知など、利用者の操作によらずに後から開くモーダルの再現。一覧の外を押さないため、一覧は閉じない）。

type Option = { value: string; label: string }
const accounts: Option[] = [
  { value: "a-1", label: "株式会社サンプル" },
  { value: "a-2", label: "東京商事株式会社" },
  { value: "a-3", label: "大阪物産株式会社" },
]
const regions = [
  { value: "tokyo", label: "東京都" },
  { value: "osaka", label: "大阪府" },
  { value: "aichi", label: "愛知県" },
]

declare global {
  interface Window {
    __ovl: { openAlert: () => void; openSheet: (side: "right" | "left" | "bottom" | "top") => void; closeSheet: () => void; toast: () => void }
    __ovlReady: boolean
  }
}

function Harness() {
  const [alert, setAlert] = useState(false)
  useEffect(() => {
    window.__ovl = { ...window.__ovl, openAlert: () => setAlert(true) }
    window.__ovlReady = true
  }, [])
  return (
    <Dialog open>
      <DialogContent data-testid="ovl-dialog" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>担当の取引先</DialogTitle>
          <DialogDescription>一覧を開いたまま、確認の Alert Dialog を開きます（検品用）。</DialogDescription>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-4">
          <Combobox items={accounts}>
            <ComboboxTrigger data-testid="ovl-combo">
              <ComboboxValue placeholder="取引先を選択" />
            </ComboboxTrigger>
            <ComboboxContent data-testid="ovl-combo-content">
              <ComboboxInput placeholder="取引先名で検索" aria-label="取引先を検索" />
              <ComboboxEmpty>一致する取引先がありません</ComboboxEmpty>
              <ComboboxList>
                {(item: Option) => (
                  <ComboboxItem key={item.value} value={item}>
                    {item.label}
                  </ComboboxItem>
                )}
              </ComboboxList>
            </ComboboxContent>
          </Combobox>
          <MultiSelect options={regions} id="ovl-multi" placeholder="地域を選択" />
        </DialogBody>
        {/* Dialog の中から開く（入れ子の Overlay） */}
        <AlertDialog open={alert} onOpenChange={setAlert}>
          <AlertDialogContent size="sm" data-testid="ovl-alert">
            <AlertDialogHeader>
              <AlertDialogTitle>セッションの有効期限が近づいています</AlertDialogTitle>
              <AlertDialogDescription>続けるには、ログインを延長してください。</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>キャンセル</AlertDialogCancel>
              <AlertDialogAction onClick={() => setAlert(false)}>延長する</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  )
}

// Sheet の Footer の表示中に、操作つきの Toast を出す（Toast が Footer の保存の操作に重ならないことの検品）
function SheetFooterHarness() {
  const [side, setSide] = useState<"right" | "left" | "bottom" | "top" | null>(null)
  const { toast } = useToast()
  useEffect(() => {
    window.__ovl = {
      ...window.__ovl,
      openSheet: (s) => setSide(s),
      closeSheet: () => setSide(null),
      toast: () => toast({ variant: "info", title: "下書きを保存しました", action: { label: "元に戻す", onClick: () => undefined } }),
    }
    window.__ovlReady = true
  }, [toast])
  return (
    <Sheet open={side !== null} onOpenChange={(o) => !o && setSide(null)}>
      <SheetContent side={side ?? "right"} data-testid="ovl-sheet">
        <SheetHeader>
          <SheetTitle>顧客を編集</SheetTitle>
          <SheetDescription>保存するまで、一覧には反映されません。</SheetDescription>
        </SheetHeader>
        <SheetBody>
          <p className="text-ui">内容（検品用）</p>
        </SheetBody>
        <SheetFooter data-testid="ovl-sheet-footer">
          <Button variant="secondary">キャンセル</Button>
          <Button data-testid="ovl-sheet-save">保存する</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

const view = new URLSearchParams(window.location.search).get("view")
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ToastProvider>
      {view === "sheet" ? <SheetFooterHarness /> : <Harness />}
      <Toaster />
    </ToastProvider>
  </StrictMode>
)
