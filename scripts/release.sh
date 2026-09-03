#!/bin/sh
# Railwayのコンテナ起動時に実行されるリリースコマンド。
# 本番DBへ未適用のマイグレーションを流してからAPIを起動する。
# migrate deployはPostgresのアドバイザリロックを取るため複数レプリカでも安全。
# マイグレーションが失敗した場合はここで終了し(APIは起動しない)、ヘルスチェック失敗で
# Railwayが直前のデプロイを維持する。
set -e

echo "[release] prisma migrate deploy を実行します"
node_modules/.bin/prisma migrate deploy --schema prisma/schema.prisma

# RUN_SEED_ON_BOOT=true のときだけシードを流す(seed.tsは全てupsertで冪等)。
# 通常はマスタ更新時のみ手動で有効化し、普段はfalse/未設定にしておく。
if [ "$RUN_SEED_ON_BOOT" = "true" ]; then
  echo "[release] RUN_SEED_ON_BOOT=true のため seed.ts を実行します"
  node_modules/.bin/tsx prisma/seed.ts
fi

echo "[release] APIを起動します"
exec node apps/api/dist/main.js
