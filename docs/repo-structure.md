# リポジトリ構成

```
/
├─ apps/
│  ├─ web/                 # React PWA (PC/モバイル共通SPA)
│  ├─ api/                 # NestJS REST + Socket.IO
│  └─ worker/               # BullMQ Worker (Google連携/集計/通知)
├─ packages/
│  ├─ shared/               # 共通ユーティリティ(日付, 案件番号採番ロジック等)
│  ├─ types/                # API DTO / Socket.IOイベント / モデルの型(Zod由来)
│  ├─ validation/            # Zod schema (フロント/バック共有)
│  └─ config/                # eslint/tsconfig/tailwind共通設定
├─ prisma/
│  ├─ schema.prisma
│  ├─ migrations/
│  └─ seed.ts
├─ scripts/
│  ├─ generate-test-data.ts  # 10万件テストデータ生成(セクション42)
│  └─ rebuild-aggregates.ts  # サマリー集計再構築(セクション35)
├─ docs/
├─ tests/
│  ├─ unit/
│  ├─ integration/
│  ├─ e2e/                   # Playwright
│  └─ load/                  # k6
├─ .github/workflows/
│  ├─ ci.yml
│  └─ deploy.yml
├─ docker-compose.yml         # ローカル開発用(api+web+worker+postgres+redis)
├─ Dockerfile.api
├─ Dockerfile.web
├─ Dockerfile.worker
├─ railway.json
├─ README.md
└─ .env.example
```

Prismaスキーマはルート直下の `prisma/` に一本化し、`apps/api` と `apps/worker` の両方から
`@prisma/client` を通じて参照する(packages/typesとしてPrisma生成型を再エクスポート)。
