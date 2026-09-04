# Railwayデプロイ手順

このシステムは現在、**WebフロントエンドとAPIを同一のRailwayサービスから配信する構成**です
(Cookie認証がクロスオリジンで壊れるのを避けるため)。将来的にサービスを分離する場合は
`docs/architecture.md`のRailwayサービス構成を参照してください。

## 0. 前提: ローカルでの最終確認(必須)

`prisma/migrations/` 配下のマイグレーションファイルは生成済み・pushされています。
デプロイ前に、実際にローカルでビルド・起動できることを確認してください。

```bash
pnpm --filter @sales-system/api build
pnpm --filter @sales-system/web build
pnpm exec tsx prisma/seed.ts
pnpm dev:api
# 別ターミナルで
pnpm dev:web
```

`http://localhost:5173` でログイン画面が表示され、`admin@example.com` /
`.env`の`ADMIN_INITIAL_PASSWORD`でログインできればOKです。

## 1. GitHubリポジトリの準備

1. GitHubで新しい空リポジトリを作成する(例: `sales-system`)
2. ローカルのリポジトリにリモートを追加してpushする

```bash
git remote add origin https://github.com/<あなたのアカウント>/sales-system.git
git branch -M main
git push -u origin main
```

## 2. Railwayプロジェクトの作成

1. https://railway.app にログインし、右上の **New Project** をクリック
2. **Deploy from GitHub repo** を選択し、先ほど作成したリポジトリを選択
3. Railwayが自動でリポジトリを検出するが、ビルド方法は`railway.json`(Dockerfile.api使用)に
   従うため、追加設定は不要

## 3. PostgreSQLの追加

1. プロジェクト画面で **New** → **Database** → **Add PostgreSQL** をクリック
2. 作成されたPostgreSQLサービスをクリックし、**Variables** タブを開く
3. `DATABASE_URL` の値をコピーしておく(次の手順で使用)

## 4. 環境変数の設定

1. APIサービス(GitHubリポジトリから作成したサービス)をクリックし、**Variables** タブを開く
2. `.env.example` を参考に、以下を最低限設定する

| 変数名 | 値の例 |
|---|---|
| `DATABASE_URL` | 手順3でコピーした値、または `${{Postgres.DATABASE_URL}}` |
| `JWT_ACCESS_SECRET` | ランダムな長い文字列(`openssl rand -hex 32`等で生成) |
| `JWT_REFRESH_SECRET` | 同上、別の値 |
| `COOKIE_SECRET` | 同上、別の値 |
| `ENCRYPTION_KEY` | 同上、32バイト相当の値 |
| `FRONTEND_URL` | このAPIサービス自身のURL(後述、手順6で確定) |
| `ADMIN_EMAIL` | 初期管理者のメールアドレス |
| `ADMIN_INITIAL_PASSWORD` | 初期管理者の一時パスワード |
| `NODE_ENV` | `production` |
| `TZ` | `Asia/Tokyo` |

Google連携用の変数(`GOOGLE_CLIENT_ID`等)は、Phase5着手時に別途設定します。今は空欄で構いません。

### プッシュ通知(商談リマインド・実施報告のデスクトップ/スマホ通知)

以下を設定すると Web Push が有効になります。未設定でもアプリ内のベル通知は動きます。

| 変数名 | 値 |
|---|---|
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | ローカルで `cd apps/api && node -e "console.log(require('web-push').generateVAPIDKeys())"` を実行して得た値 |
| `VAPID_SUBJECT` | `mailto:<管理者メール>` |

設定後、各ユーザーがアプリのサイドバー「通知を有効にする」を押し、ブラウザの通知許可を出すと、
その端末にリマインド・実施報告が通知されます(PWAとしてスマホに追加すればスマホにも届きます)。

## 5. デプロイの実行

1. Variablesを保存すると、Railwayが自動的にビルド・デプロイを開始する
2. **Deployments** タブでビルドログを確認する。`prisma generate` → `nest build` →
   `vite build` の順に進む
3. 初回デプロイが完了したら、サービス画面上部に表示される公開URL(例:
   `https://sales-system-production-xxxx.up.railway.app`)を確認する

## 6. FRONTEND_URLの確定

1. 手順5で確認した公開URLを、手順4の `FRONTEND_URL` 変数に設定し直す
   (Web/APIが同一サービスなので、このURL自身を指定する)
2. 保存すると再デプロイが走る

## 7. マイグレーションの適用と初期データ投入

### マイグレーション: 自動(コンテナ起動時)

コンテナの起動コマンドは `sh scripts/release.sh`(`railway.json` の `startCommand`)で、
API起動前に `prisma migrate deploy` が自動実行される。**デプロイのたびに未適用の
マイグレーションが本番DBへ適用される**ため、通常は手動作業は不要。
マイグレーションが失敗した場合はAPIが起動せず、ヘルスチェック失敗でRailwayが
直前の正常なデプロイを維持する。

### 初期データ(seed): 原則手動

`scripts/release.sh` は環境変数 `RUN_SEED_ON_BOOT=true` のときのみ `prisma/seed.ts` も
実行する(seedは全てupsertで冪等・管理者パスワードは上書きしない)。
初回構築時やステータスマスタ／ロール定義を更新したときだけ一時的に `true` にして
1回デプロイし、その後 `false`(または削除)に戻す運用。

手動で流したい場合は従来どおり Railway の **Shell** タブか CLI から実行できる。

```bash
railway link   # プロジェクトを選択
railway run pnpm exec prisma migrate deploy --schema prisma/schema.prisma
railway run pnpm exec tsx prisma/seed.ts
```

## 8. 動作確認

1. 公開URLへアクセスし、ログイン画面が表示されることを確認する
2. `ADMIN_EMAIL` / `ADMIN_INITIAL_PASSWORD` でそのままログインできることを確認する
   (強制パスワード変更フローは廃止済み。パスワード変更は管理者のみが実行する)
3. `<公開URL>/health` にアクセスし、`{"status":"ok"}` が返ることを確認する
5. `<公開URL>/api/docs` でSwagger UIが表示されることを確認する

## 9. 今後の自動デプロイ

`.github/workflows/deploy.yml` を使う場合、GitHubリポジトリの **Settings → Secrets and
variables → Actions** で以下を設定しておくと、mainブランチへのマージで自動デプロイされる。

| Secret名 | 値 |
|---|---|
| `RAILWAY_TOKEN` | RailwayのProject Settings → Tokens から発行 |
| `API_HEALTHCHECK_URL` | `<公開URL>/health` |

## トラブルシューティング

- **ビルドが`prisma generate`で失敗する**: `prisma/schema.prisma`の構文エラー、または
  `DATABASE_URL`未設定が原因のことが多い。ビルドログを確認する。
- **起動はするがAPIが500を返す**: マイグレーション未適用の可能性がある。デプロイログで
  `[release] prisma migrate deploy を実行します` 以降の出力を確認する。engineバイナリ不足や
  `DATABASE_URL` 未設定だとここで失敗する。
- **ログインできるがステータス変更が反映されない**: `prisma/seed.ts`のステータスマスタ投入が
  実行されていない可能性がある。`RUN_SEED_ON_BOOT=true` で1回デプロイするか、手順7の
  `seed.ts`を手動実行する。
