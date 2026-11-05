# sales-system — 作業の決まりごと

営業管理システム(トス → アポ詳細 → エントリー → 案件管理)。利用者は日本語、返答・UI文言・コメントはすべて日本語。

## 構成
- pnpm モノレポ: `apps/api`(NestJS + Prisma/PostgreSQL)、`apps/web`(React + Vite + TanStack Query)、`apps/worker`
- Prisma スキーマ/マイグレーション: リポジトリ直下の `prisma/`(`prisma/schema.prisma`、`prisma/migrations/<日時>_<名前>/migration.sql`)
- 型チェック: `cd apps/api && npx tsc --noEmit -p .` / `cd apps/web && npx tsc --noEmit -p .`
- テスト: `cd apps/api && npx jest <パス>`(ESLint は未導入)

## デプロイ(依頼されたら確認なしで最後まで進めてよい)
- 実装 → コミット → `main` へ push → 本番反映まで進めてよい(main 運用)。push できない環境ならブランチ+PRを作り、main へのマージが必要なことをユーザーに伝える。
- 本番は Railway。`main` への push で自動ビルド・デプロイ(`railway.json` → `Dockerfile.api`、web も同梱配信)。
- DB マイグレーションは起動時に `scripts/release.sh` が `prisma migrate deploy` で自動適用。スキーマ変更時はマイグレーション SQL を手書きで追加する。
- 反映確認: `https://chpartners.up.railway.app/health` の `commit` が push した SHA と一致すれば反映済み(`status: ok` = DB接続OK)。
- 起動前(onModuleInit 等)に重い処理を await しない(ヘルスチェック 300 秒に間に合わずデプロイ失敗した前例あり)。
- 本番データの削除など不可逆で影響の大きい操作は事前にユーザーへ確認する。
- 本番の TZ は Asia/Tokyo。期間計算は `apps/api/src/common/utils/period.util.ts`(JST)。

## UI の方針
- 高密度: 文字小さめ・余白を詰め、1画面に多くの情報を出す(基準 `body` 13px、一覧は `DataTable` のセル 12px)。大きな見出しや広い padding を足さない。ただしユーザーが特定の画面で「余白を増やして」と言った場合はそれに従う。
- 色・影・ボタン・モーダルは `apps/web/src/styles/global.css` のトークン/クラスを使う(`--color-*`、`.btn-primary`、`.modal-backdrop` + `.modal`、`.popover`)。色の直書きはしない。
- サイドバーのアイコンは `components/NavIcon.tsx` の SVG。
- 新しいタブは `apps/web/src/lib/navTabs.ts`(役職ごとのタブ表示設定の唯一の正)と `components/AppLayout.tsx` の両方に追加する。
  さらに、タブを絞っている役職(`Role.visibleTabs` が配列)には新しいタブが出ないため、既存の配列へタブを足すマイグレーションも追加する(例: `20261027090000_close_reports_tab`)。

## 用語・仕様
- **アポ詳細** = `Appointment` レコード(UI・会話ではこの呼び方で統一)。本文 = `Appointment.memo`。
  - トス進捗を「前確OK」にすると自動生成。本文はマスタ管理「アポ詳細FMT」(system-settings `tossAppointmentMemoTemplate`=HPZOOM/オンライン用、`...Visit`=訪問用)から作る。差し込み項目は `{{店舗名}}` のような日本語名(API `TEMPLATE_FIELD_ALIASES` と web `MastersAdminPage` の `TEMPLATE_FIELDS` を揃える)。
  - フック = 商談形式(マスタ `MEETING_FORMAT`)。HPZOOM ならオンライン扱い、Google 連携済みなら Meet URL を自動発行。
  - CLカレンダーの題名は「部署 CL名字 都道府県頭文字 【フック】店舗名」を自動組み立て(api `toss-appointment-automation.util.ts` と web `lib/calendarTitle.ts` の規則を揃える)。提案場所が自宅なら【の前に★。
- **アポ登録**(`/appointments/new`): トスを通さずアポ詳細を単品作成。項目は `TossFormField`(`form='APPOINTMENT'`)、管理画面「アポフォーム設定」。使える役職はユーザー管理の「役職ごとのタブ表示」で制御(サーバーも visibleTabs で判定)。作成分は `idempotencyKey` が `apo-form:` で始まり、部署別サマリーの前確OKにも数える。
- **トス登録**(`/toss/new`): 同じ `TossFormField`(`form='TOSS'`)、管理画面「トスフォーム設定」。
- **マスタ**: `StatusMaster`(category + internalCode)が全プルダウンの選択肢。部署 `DEPARTMENT_BRANCH`、前確 `TOSS_PRE_CONFIRM`、CL `APPOINTMENT_CLOSER` など。共通 ON/OFF があり、OFF だとアポ側は `<カテゴリ>@APPOINTMENT` を使う。
- **組織**: 会社 CH partners > 部署(CH東 / CH西 / CT東 / モバイル / クオリティ / バックヤード の順)> チーム。部署は「組織管理」(`Department`)が唯一の正で、マスタの部署 `DEPARTMENT_BRANCH`(トス/アポ詳細の部署・カレンダー題名・色・月次サマリー)は `Department.branchStatusId` で紐づけ `OrganizationsService.syncBranch` が名前・並び・有効を同期する。マスタ管理側は色だけ編集可。
- **稼働ルール**(`/work-rules`): グループ別のルール一覧(`WorkRuleGroup`/`WorkRule`、`apps/api/src/work-rules/`)。閲覧は全員(管理者以外もナビの「管理」/スマホの「設定」に出す)、編集は `Role.canEditWorkRules`(ユーザー管理の役職ごとの設定)、管理者は常に可。
- **クローズ報告**(`/close-reports`): 商談後のクローズ結果を入力し、決まった書式の報告テキストをコピー(`lib/closeReport.ts` の `buildText`。ユーザー指定の書式を厳守)。項目の並び・種類は `FIELD_DEFS`、項目名・必須・選択肢・管理費の範囲などはマスタ管理「クローズ報告」(system-settings `closeReportConfig`)。報告は本人分だけ `CloseReport` に保存。スマホ中心(少ない選択肢はボタン、作成ボタンは画面下に固定)。
- **個人別数値**(`/personal-stats`): すべての入力は誰でもできる(シート・週目標・部署ストーリー)。月初予算は月末まで入力。実績は今日までの日だけ入力(過去の月も可、未来日はシステム実績も手入力も画面に出さない)。自動の数字もその場で直せる(消すと0、手入力を消すと自動の数字に戻る)。着地見込みは今日までは実績と同じ、明日以降は手入力(未入力は0)。
- **個人別数値 › 部署ストーリー**(下のタブ「部署ストーリー」、`pages/personal-stats/DepartmentStory.tsx`): 部署×月のカレンダー形式(月曜始まりの週)。行はトスアップ/アポイント/商談実施/成約法人/重説OK/ET、数字はすべて手入力(`DepartmentStoryValue`、cell は `d:日付:項目`=日別の実績で今日までだけ入力 / `w:週番号:項目`=週目標 / `m:項目`=月目標)。週計・週達成・累計・累計目標(週目標の積み上げ)・累計達成と月間(月目標が空なら週目標の合計)。全部署を誰でも見て入力できる。
- **CB管理**(`/cb-cases`): CB案件の一覧(`CbCase`、`apps/api/src/cb-cases/`)。案件名・申込番号・区分(社販/エネパル違約金/既契約違約金/クレーム)・成約日・MC日・CB金額・ステータス(MC待ち/MC済み/情報回収中/申請済み)・備考(金額内訳)、すべて任意。全員で共有、使える役職はタブ表示で制御(API も判定)。PC は一覧でその場編集、携帯はカードを押して編集。
- **トークスクリプト**(`/talk-scripts`、`apps/api/src/talk-scripts/`): APランク(ブロンズ/シルバー/ゴールド。ユーザー管理の `User.talkRank`、最初に開くランク)ごとのベーストーク(`TalkStep`)とアウト返し(`TalkOut`)。全ランク閲覧可。トークの中でアウトを押すとその場に開き、「アウト返し集」タブで単体でも見られる。アウトは `ranks` で使うランクを選び、複数選ぶと同じ内容を共有。編集は `Role.canEditTalkScripts`(ユーザー管理の役職ごとの設定)、管理者は常に可。
- **月単位運用**: トス/アポ/エントリーは `periodMonth`("YYYY-MM"、JST)で月ごとに管理。画面の対象月(`lib/usePeriodMonth.ts`)は開いたとき(再読み込みを含む)必ず当月で、切り替えた月は開いている間だけ他画面へ引き継ぐ(保存しない)。
- **サマリー**(`/summary`): 部署別の実績表(`apps/api/src/department-summary/`)。名前照合は NFKC + 空白除去。
- **申込情報/明細**(`/application-sheets`): 作成したアカウント本人だけが見られる(管理者も他の人の分は見られない。API も `createdBy` で判定)。全体コピーの書式は `lib/applicationSheet.ts` の `sheetText`(ユーザー指定の書式を厳守)。明細写真の OCR はブラウザ内 Tesseract(完全無料方針、有料 API は使わない)。作成画面は背景を押しても閉じず、入力中の内容は端末の下書き(`applicationSheet.draft:<ユーザーID>`)に残して、画面を開くと復元する。
- **案件管理**の一括投入は、手打ちの値を絶対に上書きしない(`Deal.importedKeys`、`apps/api/src/deals/import-merge.ts`)。
- 一覧表は共通の `components/DataTable.tsx`(範囲選択・コピー/貼り付け・手動並び替え・行の非表示)。セル選択中の Enter は 入力 → 確定 → 下へ の順(押して開いたセルも同じ)。移るのは常に1行だけ。入力できないセルは `data-cell-readonly` を付けると、そのセルでの Enter は1回で下へ移る。
- 通知は Web Push(VAPID)。開くたびに購読をサーバーへ登録し直す(`usePushNotifications`)、SW の `pushsubscriptionchange` でも登録し直す。タスク通知は取りこぼしても後から必ず送る(起点は system-settings `taskNotifyCatchupFrom`、それより前の回は送らない)。
- ログインはリフレッシュトークン(ローテーション式)で 1 年保持。端末ごとの系列 `RefreshToken.familyId` で管理し、交換直後(5分以内)の古いトークンは出し直し、それ以外の異常もその端末の系列だけ失効(他の端末はログインしたまま)。更新はタブ間で Web Locks により順番待ち。

## コード
- 周りのコードに合わせる。コメントは日本語で「なぜそうしたか(要望)」を短く書く既存の書き方に倣う。
- リアルタイム反映は Socket(`RealtimeService.emitCaseUpdated` など)。作成・更新時は emit を忘れない。
- 操作ログ(監査)・案件履歴(`CaseHistoryService`)の記録も既存処理に倣う。
