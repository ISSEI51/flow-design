import { MoreHorizontal } from "lucide-react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Field, FieldItem, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover"
import { Progress, ProgressLabel, ProgressValue } from "@/components/ui/progress"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { Toaster, ToastProvider } from "@/components/ui/toast"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

// Forms、Feedback、Overlays の部品の SSR と Hydration の検品用の画面。サーバーとブラウザで同じ HTML になることを確かめる。
// 値は固定する。重なりの部品（Dialog など）は閉じた状態で描画し、Hydration の後に開けることを確かめる。
const plans = [
  { value: "monthly", label: "月払い" },
  { value: "yearly", label: "年払い" },
]

export function CoreSsrFixture() {
  return (
    <ToastProvider>
      <TooltipProvider>
        <main className="flex max-w-xl flex-col gap-8 p-6">
          <h1 className="text-page-title">顧客の登録</h1>
          <form className="flex flex-col gap-6" onSubmit={(e) => e.preventDefault()}>
            <Field>
              <FieldLabel>会社名</FieldLabel>
              <Input defaultValue="北星物流株式会社" data-testid="ssr-core-company" />
            </Field>
            <Field>
              <FieldLabel>契約プラン</FieldLabel>
              <Select items={plans} defaultValue="yearly">
                <SelectTrigger data-testid="ssr-core-plan">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {plans.map((p) => (
                    <SelectItem key={p.value} value={p.value}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field>
              <FieldLabel>備考</FieldLabel>
              <Textarea defaultValue="請求書は月末締め" />
            </Field>
            <Field>
              <FieldSet>
                <FieldLegend variant="label">請求書の送付</FieldLegend>
                <RadioGroup defaultValue="mail">
                  <FieldItem>
                    <RadioGroupItem value="mail" id="ssr-core-mail" />
                    <Label htmlFor="ssr-core-mail">郵送</Label>
                  </FieldItem>
                  <FieldItem>
                    <RadioGroupItem value="email" id="ssr-core-email" />
                    <Label htmlFor="ssr-core-email">メール</Label>
                  </FieldItem>
                </RadioGroup>
              </FieldSet>
            </Field>
            <Field orientation="horizontal">
              <Checkbox defaultChecked data-testid="ssr-core-terms" />
              <FieldLabel>利用規約に同意する</FieldLabel>
            </Field>
            <Field orientation="horizontal">
              <Switch defaultChecked data-testid="ssr-core-notify" />
              <FieldLabel>更新日の前に通知する</FieldLabel>
            </Field>
            <Button type="submit">登録する</Button>
          </form>

          <Alert variant="warning">
            <AlertTitle>契約の更新日が近づいています</AlertTitle>
            <AlertDescription>2026年12月15日までに更新してください。</AlertDescription>
          </Alert>
          <div className="flex items-center gap-3">
            <Avatar>
              <AvatarImage src="/avatars/landscape.png" alt="" />
              <AvatarFallback>山</AvatarFallback>
            </Avatar>
            <Badge variant="success">契約中</Badge>
            <Skeleton className="h-4 w-24" />
          </div>
          <Progress value={40} data-testid="ssr-core-progress">
            <ProgressLabel>請求書を送信しています</ProgressLabel>
            <ProgressValue />
          </Progress>

          <div className="flex flex-wrap gap-3">
            <Dialog>
              <DialogTrigger render={<Button variant="outline" data-testid="ssr-core-dialog-open" />}>担当者を変更</DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>担当者を変更</DialogTitle>
                  <DialogDescription>新しい担当者を選んでください。</DialogDescription>
                </DialogHeader>
                <DialogBody>
                  <Input aria-label="担当者" />
                </DialogBody>
                <DialogFooter>
                  <Button>変更する</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <AlertDialog>
              <AlertDialogTrigger render={<Button variant="destructive" />}>契約を解約</AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>契約を解約しますか？</AlertDialogTitle>
                  <AlertDialogDescription>解約すると、元に戻せません。</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>キャンセル</AlertDialogCancel>
                  <AlertDialogAction variant="destructive">解約する</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <Sheet>
              <SheetTrigger render={<Button variant="outline" />}>詳細</SheetTrigger>
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>北星物流株式会社</SheetTitle>
                </SheetHeader>
              </SheetContent>
            </Sheet>
            <Drawer>
              <DrawerTrigger render={<Button variant="outline" />}>メモ</DrawerTrigger>
              <DrawerContent>
                <DrawerHeader>
                  <DrawerTitle>メモ</DrawerTitle>
                </DrawerHeader>
              </DrawerContent>
            </Drawer>
            <Popover>
              <PopoverTrigger render={<Button variant="outline" />}>絞り込み</PopoverTrigger>
              <PopoverContent>
                <PopoverTitle>絞り込み</PopoverTitle>
              </PopoverContent>
            </Popover>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="その他の操作" data-testid="ssr-core-menu" />}>
                <MoreHorizontal />
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem>複製</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Tooltip>
              <TooltipTrigger render={<Button variant="ghost">ヘルプ</Button>} />
              <TooltipContent>操作の説明を表示します</TooltipContent>
            </Tooltip>
          </div>
        </main>
        <Toaster />
      </TooltipProvider>
    </ToastProvider>
  )
}
