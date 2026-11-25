import { useRef } from "react"

import { Button } from "@/components/ui/button"
import { TOAST_TIMEOUT, useToast } from "@/components/ui/toast"

import { Compare, Row, Section } from "../../layout/section"
import { PageHeader } from "../../layout/page-header"

export function ToastPage() {
  const { toast } = useToast()
  const failures = useRef(0)
  return (
    <article>
      <PageHeader
        name="Toast"
        lead="操作の結果を一時的に知らせる。デスクトップは右下、モバイルは下中央に表示する。ポインターを重ねている間とフォーカス中は消えない。"
      />

      <Section title="種類と表示時間" lead="失敗は自動では消さない。重要な情報を Toast だけに頼らない。">
        <Row label="Success" note={`${TOAST_TIMEOUT.success / 1000} 秒`}>
          <Button
            data-testid="toast-success"
            variant="secondary"
            onClick={() => toast({ variant: "success", title: "請求書を送信しました", description: "山田商事 宛て（INV-1001）" })}
          >
            成功を通知
          </Button>
        </Row>
        <Row label="Info" note={`${TOAST_TIMEOUT.info / 1000} 秒`}>
          <Button
            data-testid="toast-info"
            variant="secondary"
            onClick={() => toast({ variant: "info", title: "書き出しを始めました", description: "完了するとメールで知らせます" })}
          >
            情報を通知
          </Button>
        </Row>
        <Row label="Warning" note={`${TOAST_TIMEOUT.warning / 1000} 秒`}>
          <Button
            data-testid="toast-warning"
            variant="secondary"
            onClick={() => toast({ variant: "warning", title: "送付先が未設定の顧客を除いて送信しました", description: "3 件は送信していません" })}
          >
            注意を通知
          </Button>
        </Row>
        <Row label="Destructive" note="手動で閉じるまで表示する">
          <Button
            data-testid="toast-destructive"
            variant="secondary"
            onClick={() =>
              toast({ variant: "destructive", title: "請求書を送信できませんでした", description: "メールサーバーに接続できません" })
            }
          >
            失敗を通知
          </Button>
        </Row>
        <Row label="操作つき" note="自動では消さない">
          <Button
            data-testid="toast-action"
            variant="secondary"
            onClick={() =>
              toast({
                variant: "neutral",
                title: "請求書をアーカイブしました",
                action: { label: "元に戻す", onClick: () => toast({ variant: "success", title: "アーカイブを取り消しました" }) },
              })
            }
          >
            操作つきで通知
          </Button>
        </Row>
      </Section>

      <Section title="重複と集約" lead="同じ内容は増やさず、1 つの通知を更新する。">
        <Row label="同じ通知" note="何度押しても 1 つだけ表示する">
          <Button
            data-testid="toast-duplicate"
            variant="secondary"
            onClick={() => toast({ id: "draft-saved", variant: "success", title: "下書きを保存しました" })}
          >
            下書きを保存
          </Button>
        </Row>
        <Row label="まとめる" note="同じ処理の失敗を 1 つの通知に集約する">
          <Button
            data-testid="toast-aggregate"
            variant="secondary"
            onClick={() => {
              failures.current += 1
              toast({
                id: "bulk-send-failed",
                variant: "destructive",
                title: `${failures.current} 件の請求書を送信できませんでした`,
                description: "送信履歴で失敗した請求書を確認できます",
              })
            }}
          >
            1 件の失敗を発生させる
          </Button>
        </Row>
      </Section>

      <Section title="長い文字">
        <Row label="英語">
          <Button
            variant="secondary"
            onClick={() =>
              toast({
                variant: "info",
                title: "The export has started and may take several minutes for large customer lists",
                description: "We will email you a download link when it is ready.",
              })
            }
          >
            長い通知
          </Button>
        </Row>
      </Section>

      <Section title="良い例と悪い例">
        <Compare
          bad={<p className="text-ui">「保存しました」を、画面の表示が変わる操作のたびに出す。</p>}
          badNote="画面の変化で結果がわかるのに通知を重ね、注意を奪う。"
          good={<p className="text-ui">結果が画面に表れない操作（バックグラウンドの送信など）だけに出す。</p>}
          goodNote="通知は必要な場合に限る。"
        />
      </Section>
    </article>
  )
}
