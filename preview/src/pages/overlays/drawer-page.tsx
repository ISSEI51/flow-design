import { useState } from "react"
import { Download, Link, Mail } from "lucide-react"

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
import { Button } from "@/components/ui/button"
import {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"

import { customers } from "../../data/customers"
import { Compare, Row, Section } from "../../layout/section"
import { PageHeader } from "../../layout/page-header"
import { DiscardAlert } from "./discard-alert"

const shareActions = [
  { icon: Link, label: "リンクをコピー", done: "リンクをコピーしました" },
  { icon: Mail, label: "メールで送る", done: "メールの作成画面を開きました" },
  { icon: Download, label: "PDF で書き出す", done: "PDF を書き出しました" },
]

// 短い補助操作。項目を選ぶと閉じる。
function ShareDrawer() {
  const [status, setStatus] = useState("")
  return (
    <div className="flex flex-col items-start gap-2">
      <Drawer>
        <DrawerTrigger render={<Button variant="secondary" data-testid="drawer-share-trigger" />}>請求書を共有</DrawerTrigger>
        <DrawerContent data-testid="drawer-share">
          <DrawerHeader>
            <DrawerTitle>請求書を共有</DrawerTitle>
            <DrawerDescription>2026 年 11 月分（山田商事）</DrawerDescription>
          </DrawerHeader>
          <DrawerBody>
            <ul className="-mx-3 flex flex-col">
              {shareActions.map((a) => (
                <li key={a.label}>
                  <DrawerClose
                    render={<Button variant="ghost" className="w-full justify-start px-3" />}
                    onClick={() => setStatus(a.done)}
                  >
                    <a.icon />
                    {a.label}
                  </DrawerClose>
                </li>
              ))}
            </ul>
          </DrawerBody>
        </DrawerContent>
      </Drawer>
      <p role="status" data-testid="drawer-share-status" className="text-ui text-muted-foreground">
        {status}
      </p>
    </div>
  )
}

// 長い内容。内容がスクロールできる間はスクロールし、上端に達してから下へスワイプすると閉じる。
function LongDrawer() {
  return (
    <Drawer>
      <DrawerTrigger render={<Button variant="secondary" data-testid="drawer-long-trigger" />}>担当する顧客を見る</DrawerTrigger>
      <DrawerContent data-testid="drawer-long">
        <DrawerHeader>
          <DrawerTitle>担当する顧客</DrawerTitle>
          <DrawerDescription>{`${customers.length * 5} 件`}</DrawerDescription>
        </DrawerHeader>
        <DrawerBody data-testid="drawer-long-body">
          <ul className="flex flex-col text-ui">
            {Array.from({ length: 5 }).flatMap((_, round) =>
              customers.map((c) => (
                <li key={`${round}-${c.id}`} className="flex justify-between gap-4 border-t border-border py-3 first:border-t-0">
                  <span className="min-w-0 [word-break:auto-phrase]">{c.name}</span>
                  <span className="shrink-0 text-muted-foreground">{c.contact}</span>
                </li>
              ))
            )}
          </ul>
        </DrawerBody>
        <DrawerFooter>
          <DrawerClose render={<Button variant="secondary" />}>閉じる</DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  )
}

// 入力と未保存の変更。入力があると、外側のクリックでは閉じず、スワイプ、Escape、閉じるボタンでは破棄を確かめる。
function NoteDrawer() {
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState("")
  const [confirm, setConfirm] = useState(false)
  const [status, setStatus] = useState("")
  return (
    <div className="flex flex-col items-start gap-2">
      <Drawer
        open={open}
        onOpenChange={setOpen}
        unsavedChanges={note.trim() !== ""}
        onDiscardRequest={() => setConfirm(true)}
      >
        <DrawerTrigger render={<Button variant="secondary" data-testid="drawer-note-trigger" />}>メモを追加</DrawerTrigger>
        <DrawerContent data-testid="drawer-note">
          <form
            className="contents"
            onSubmit={(e) => {
              e.preventDefault()
              setStatus(`メモを追加しました：${note}`)
              setNote("")
              setOpen(false)
            }}
          >
            <DrawerHeader>
              <DrawerTitle>メモを追加</DrawerTitle>
              <DrawerDescription>山田商事</DrawerDescription>
            </DrawerHeader>
            <DrawerBody>
              <Field>
                <FieldLabel>メモ</FieldLabel>
                <Textarea data-testid="drawer-note-field" rows={4} value={note} onChange={(e) => setNote(e.target.value)} />
                <FieldDescription>担当者だけが見られます。</FieldDescription>
              </Field>
            </DrawerBody>
            <DrawerFooter>
              <DrawerClose render={<Button variant="secondary" />}>キャンセル</DrawerClose>
              <Button type="submit" disabled={note.trim() === ""}>
                メモを追加
              </Button>
            </DrawerFooter>
          </form>
          <DiscardAlert
            testId="drawer-discard"
            open={confirm}
            onOpenChange={setConfirm}
            onDiscard={() => {
              setConfirm(false)
              setNote("")
              setOpen(false)
            }}
          />
        </DrawerContent>
      </Drawer>
      <p role="status" data-testid="drawer-note-status" className="text-ui text-muted-foreground">
        {status}
      </p>
    </div>
  )
}

function DeleteConfirm() {
  const [open, setOpen] = useState(false)
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={<Button variant="destructive" />}>山田商事を削除</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>山田商事を削除しますか？</AlertDialogTitle>
          <AlertDialogDescription>この操作は取り消せません。</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>キャンセル</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => setOpen(false)}>
            削除する
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export function DrawerPage() {
  return (
    <article>
      <PageHeader
        name="Drawer"
        lead="主にモバイルで、短い補助操作や選択を画面の下から表示する。スワイプのほか、閉じるボタンと Escape でも閉じられる。"
      />

      <Section title="補助操作" lead="選ぶとすぐに閉じる操作を並べる。下へスワイプしても閉じられる。">
        <Row label="共有">
          <ShareDrawer />
        </Row>
      </Section>

      <Section
        title="長い内容"
        lead="高さは画面の 90% まで。内容がスクロールできる間はスクロールし、上端に達してから下へスワイプすると閉じる。"
      >
        <Row label="一覧">
          <LongDrawer />
        </Row>
      </Section>

      <Section
        title="入力と未保存の変更"
        lead="ソフトウェアキーボードが開いても、入力欄が隠れないように表示を保つ。入力があるときは、意図しない操作で閉じない。"
      >
        <Row label="メモ">
          <NoteDrawer />
        </Row>
      </Section>

      <Section title="良い例と悪い例">
        <Compare
          bad={
            <Drawer>
              <DrawerTrigger render={<Button variant="destructive" />}>山田商事を削除</DrawerTrigger>
              <DrawerContent>
                <DrawerHeader>
                  <DrawerTitle>山田商事を削除しますか？</DrawerTitle>
                </DrawerHeader>
                <DrawerFooter>
                  <DrawerClose render={<Button variant="secondary" />}>キャンセル</DrawerClose>
                  <DrawerClose render={<Button variant="destructive" />}>削除する</DrawerClose>
                </DrawerFooter>
              </DrawerContent>
            </Drawer>
          }
          badNote="取り消せない操作の確認を、モバイルだからという理由で Drawer にする。スワイプで閉じられ、確認の重さが伝わらない。"
          good={<DeleteConfirm />}
          goodNote="短い確認は、モバイルでも中央の Alert Dialog にする。Drawer は補助操作に使う。"
        />
      </Section>
    </article>
  )
}
