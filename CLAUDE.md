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
- **月単位運用**: トス/アポ/エントリーは `periodMonth`("YYYY-MM"、JST)で月ごとに管理。
- **サマリー**(`/summary`): 部署別の実績表(`apps/api/src/department-summary/`)。名前照合は NFKC + 空白除去。
- **申込情報/明細**(`/application-sheets`): 全体コピーの書式は `lib/applicationSheet.ts` の `sheetText`(ユーザー指定の書式を厳守)。明細写真の OCR はブラウザ内 Tesseract(完全無料方針、有料 API は使わない)。
- **案件管理**の一括投入は、手打ちの値を絶対に上書きしない(`Deal.importedKeys`、`apps/api/src/deals/import-merge.ts`)。
- 一覧表は共通の `components/DataTable.tsx`(範囲選択・コピー/貼り付け・手動並び替え・行の非表示)。
- 通知は Web Push(VAPID)+ アプリ内表示。ログインはリフレッシュトークン(ローテーション式)で 1 年保持。更新はタブ間で Web Locks により順番待ちにしている(同時更新すると全セッション失効するため)。

## コード
- 周りのコードに合わせる。コメントは日本語で「なぜそうしたか(要望)」を短く書く既存の書き方に倣う。
- リアルタイム反映は Socket(`RealtimeService.emitCaseUpdated` など)。作成・更新時は emit を忘れない。
- 操作ログ(監査)・案件履歴(`CaseHistoryService`)の記録も既存処理に倣う。
