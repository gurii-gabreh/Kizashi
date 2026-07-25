-- 前兆現象報告に、危機感を伝えるUX（企画整理.md セクション4 項目6「〇〇さんの
-- 近くで報告がありました」という呼びかけ形式の通知）のための報告者名を追加する。
-- 匿名での報告も許可するため NULL 許容。
ALTER TABLE precursor_signs ADD COLUMN reporter_name TEXT;
