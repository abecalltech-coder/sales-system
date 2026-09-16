# 権限マトリクス

RoleはDB(`Role`/`Permission`)で管理し、コードにハードコードしすぎない。
`Permission`は `resource`(例: toss_case, appointment, visit, contract, deal, user, master, system)
`action`(view/create/edit/delete/export/import)、`scope`(OWN/TEAM/DEPT/ALL) の組で表現する。

## 初期ロールと想定スコープ

| ロール | 主な用途 | 案件閲覧 | 案件編集 | ユーザー管理 | マスタ管理 | 削除 |
|---|---|---|---|---|---|---|
| SUPER_ADMIN | システム管理者 | ALL | ALL | ○ | ○ | ○ |
| ADMIN | 業務管理者 | ALL | ALL | ○ | ○ | ○(論理削除) |
| MANAGER | 部署責任者 | DEPT | DEPT | 部署内のみ | 一部(ステータス表示名等) | × |
| LEADER | チームリーダー | TEAM | TEAM | × | × | × |
| INSIDE_SALES | トス/アポ担当 | OWN+TEAM | OWN | × | × | × |
| FIELD_SALES | 訪問営業 | OWN(担当訪問) | OWN(訪問関連項目) | × | × | × |
| ENTRY_OPERATOR | エントリー担当 | 成約/エントリーのみALL | エントリー関連 | × | × | × |
| USER | 一般(閲覧中心) | OWN+TEAM | 一部 | × | × | × |
| VIEWER | 閲覧専用 | 権限に応じたscope | × | × | × | × |
| AP | 役職: AP | OWN+TEAM(INSIDE_SALES相当) | OWN | × | × | × |
| AP_LEADER | 役職: APリーダー | TEAM(LEADER相当) | TEAM | × | × | × |
| CL | 役職: CL | TEAM(アポ)+ALL(エントリー) | TEAM/ALL | × | × | × |
| RESPONSIBLE | 役職: 責任者 | DEPT(MANAGER相当) | DEPT | 部署内のみ | 一部 | × |

具体的な許可/禁止は`Permission`テーブルのシードデータ(`prisma/seed.ts`)で初期投入し、
管理画面(セクション「ユーザー管理」)からロールごとに増減できるようにする。

各アカウントには上記の役職ロール(AP/AP_LEADER/CL/RESPONSIBLE)を最低1つ付与する運用とする
(要望。既存アカウントは後付けで可。ユーザー管理画面が未設定を警告表示する)。

## メニュー表示制御

PC版メインメニュー16項目は、`resource`に対する`view`権限の有無でメニュー自体を出し分ける
(サーバー側でも同一チェックを行い、フロントの非表示はUXのみの役割とする=権限はAPI側が真実)。

加えて、`Role.visibleTabs`(nullなら制限なし)でロールごとにサイドナビのタブ自体を
表示/非表示にできる(要望。ユーザー管理画面「役職ごとのタブ表示設定」から編集)。
これは表示制御のみで、実際のページ・API権限は引き続き`Permission`が真実。
SUPER_ADMINは締め出し防止のため常に全タブ表示(対象外)。
