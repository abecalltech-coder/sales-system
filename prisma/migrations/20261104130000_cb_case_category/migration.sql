-- CB管理に区分を追加(要望: 社販 / エネパル違約金 / 既契約違約金 / クレーム から選ぶ。既存の案件は未設定のまま)
ALTER TABLE "CbCase" ADD COLUMN "category" TEXT;
