# アーキテクチャ設計書

## 1. システム概要

営業部向け「案件・営業進捗・訪問営業管理システム」。
内勤営業(トス/アポ)・訪問営業・管理者が同一システム(同一認証・同一DB・同一API)を使用する。
PC画面とスマートフォン画面は同一SPAコード内でレイアウト分岐する(別システムにしない)。

## 2. 全体構成図(論理)

```
[Google Form] --Webhook(HMAC)--> [API]
[Google Calendar/Meet] <--OAuth2--> [API/Worker]

[Browser PC]  ---HTTPS/WSS---\
[Browser Mobile/PWA] ---HTTPS/WSS---+--> [Web(静的配信 or SSRなし SPA)]
                                    |
                                    +--> [API (NestJS)] <---> [PostgreSQL]
                                                |  \
                                                |   +--> [Redis(Socket.IO Adapter / Cache / Queue)]
                                                +--> [Worker (BullMQ)] --> Google API / 集計バッチ
```

## 3. Railwayサービス構成

初期段階(Phase 2〜7): Webは静的ビルドをAPIサービスから配信可能にしておくが、
将来分離を前提に `apps/web` と `apps/api` は別ビルド・別プロセスとして最初から分離する。

| サービス | 内容 | 初期 | 将来 |
|---|---|---|---|
| web | React(Vite)ビルド成果物を配信 (Nginx or Node静的配信) | 必須 | そのまま/CDN化 |
| api | NestJS REST + Socket.IO | 必須 | 水平分割(スケール) |
| postgres | Railway PostgreSQL Plugin | 必須 | Read Replica検討 |
| redis | Railway Redis Plugin | Phase7から | Socket.IO Adapter/Queue/Cache |
| worker | BullMQ Worker (Google連携・集計再構築・通知) | Phase5から | 複数インスタンス化 |

Railway固有機能(Cron, Volumesなど)は補助的に使うが、コアロジックはDockerさえあれば
別クラウド/VPSへ移行できるように、Railway APIへの直接依存コードを書かない。

- `railway.json` でサービスごとのDockerfile/startCommand/healthcheckPathを定義
- 環境変数はRailway側のVariablesで注入(コードへ埋め込まない)

## 4. 技術スタック(確定)

- フロントエンド: React18 + TypeScript + Vite + Tailwind + shadcn/ui + TanStack Query + React Hook Form + Zod + socket.io-client + Recharts + vite-plugin-pwa
- バックエンド: Node.js20 + TypeScript + NestJS + Prisma + PostgreSQL16 + Socket.IO + Swagger
- 認証: JWT(Access15分/Refresh14日, HttpOnly Cookie, ローテーション)
- キュー/ジョブ: BullMQ(Redis) — Google連携・集計再構築・通知配信
- テスト: Vitest + Supertest(API) / Playwright(E2E) / k6(負荷)
- monorepo: pnpm workspace + Turborepo(ビルドキャッシュ・並列実行)

## 5. モバイル/PC 判定方式

`apps/web` は単一SPA。ログイン後、以下の優先順で表示モードを決定し `localStorage`ではなく
サーバー側のUser設定(`preferredViewMode`)に保存する(セクション14要件: 端末非依存で保持):

1. ユーザーが手動選択した `preferredViewMode`(AUTO/MOBILE/PC) — 最優先
2. AUTOの場合: `matchMedia('(pointer: coarse)')` + `window.innerWidth` + UA Client Hints を組み合わせて判定
3. 判定結果に応じて `MobileShell` / `DesktopShell` を出し分け(ルーティングは共通)

## 6. リアルタイム方針(概要、詳細はrealtime-and-offline.md)

Socket.IOはRedis Adapterで水平スケール対応。ルーム単位で最小限の差分イベントのみ配信。
WebSocket切断時もREST操作は継続可能(Socket.IOは表示更新の補助であり、業務トランザクションの必須経路にしない)。

## 7. 非機能目標

登録ユーザー100+、同時ログイン30+、同時操作15+、案件10万件以上を想定した設計目標値。
詳細はperformance-and-scaling.md参照。
