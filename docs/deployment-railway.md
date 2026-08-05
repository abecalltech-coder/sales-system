# Railwayデプロイ手順

このシステムは現在、**WebフロントエンドとAPIを同一のRailwayサービスから配信する構成**です
(Cookie認証がクロスオリジンで壊れるのを避けるため)。将来的にサービスを分離する場合は
`docs/architecture.md`のRailwayサービス構成を参照してください。

## 0. 前提: ローカルでの最終確認(必須)

このシステムの開発はサンドボックス環境で行われており、**Prismaのマイグレーションファイルが
まだ1つも生成されていません**。あなたのPC(ネットワーク制限のない環境)で、デプロイ前に
必ず以下を実行してください。

```bash
git clone <あなたのリポジトリURL>
cd sales-system
cp .env.example .env
# .envのDATABASE_URLをローカルPostgreSQLに合わせて編集(またはdocker compose up -d postgresを使う)

pnpm install
pnpm exec prisma migrate dev --name init --schema prisma/schema.prisma
```

これにより `prisma/migrations/` 配下にマイグレーションファイルが生成されます。
生成されたファイルは**必ずgit commit & pushしてください**(Railway上での
`prisma migrate deploy`はこのファイルを参照します)。

続けて、実際にローカルでビルド・起動できることを確認してください。

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

Railwayの各サービスには **Shell** タブ(またはRailway CLIの`railway run`)からコマンドを
実行できる。以下を実行する。

```bash
pnpm exec prisma migrate deploy --schema prisma/schema.prisma
pnpm exec tsx prisma/seed.ts
```

Railway CLIを使う場合はローカルから以下でも実行できる。

```bash
railway link   # プロジェクトを選択
railway run pnpm exec prisma migrate deploy --schema prisma/schema.prisma
railway run pnpm exec tsx prisma/seed.ts
```

## 8. 動作確認

1. 公開URLへアクセスし、ログイン画面が表示されることを確認する
2. `ADMIN_EMAIL` / `ADMIN_INITIAL_PASSWORD` でログインする
3. 初回ログイン時にパスワード変更画面が表示されることを確認する
4. `<公開URL>/health` にアクセスし、`{"status":"ok"}` が返ることを確認する
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
- **起動はするがAPIが500を返す**: マイグレーション未適用の可能性が高い。手順7を再確認する。
- **ログインできるがステータス変更が反映されない**: `prisma/seed.ts`のステータスマスタ投入が
  実行されていない可能性がある。手順7の`seed.ts`実行を確認する。
