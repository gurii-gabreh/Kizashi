-- 企画整理.md セクション7「テーブル例」（incidents / family_intake / floor_plans /
-- precursor_signs）をもとにした、ローカルD1検証用のスキーマ案。
-- 要配慮個人情報（family_intakeの身体的特徴等）を扱うため、
-- セクション9の方針（暗号化保存・事案終了後の自動削除・現場ルームコードに
-- よるアクセス制限）を前提とした設計にしている。
--
-- reports（誰が・どこを・いつ確認したか）は、救助隊側システムとの連携が前提と
-- なり実現性が不確定なため「時間があれば追加」の付け足し案に格下げされた
-- （企画整理.md 6-2直前の【時間があれば追加】参照）。主要機能ではないため、
-- このスキーマからは外している。

-- 現場ルーム。room_codeが「現場ルームコードによるアクセス制限」の単位になる。
CREATE TABLE incidents (
  id TEXT PRIMARY KEY,              -- UUID
  room_code TEXT NOT NULL UNIQUE,   -- 6桁の参加コード（QR配布用）
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  -- 事案終了後の自動削除（30日）の起点。終了操作時にセットする。
  closed_at TEXT,
  expires_at TEXT                   -- closed_at + 30日。この時刻を過ぎたら削除バッチ対象
);

-- 事前問診フォーム。要配慮個人情報（身体的特徴・服薬等）を含むため
-- 値そのものはアプリ層で暗号化してから保存する想定（列はBLOB/暗号文を格納）。
CREATE TABLE family_intake (
  id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES incidents(id),
  encrypted_payload BLOB NOT NULL,  -- 氏名・年齢・身体的特徴・服薬等を暗号化してまとめて格納
  photo_ref TEXT,                   -- 写真の保存先参照（R2オブジェクトキー等）。生バイナリはD1に入れない
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 家の間取り 手書き共有（主機能）。救助隊員に間取りを聞かれてから答えるのではなく、
-- 家族が待機中に先回りして簡易な間取り図を描いて現場ルームに共有しておく。
-- Canvas上でのお絵描き結果をPNG画像として保存する（MVPではD1にBase64文字列で
-- 格納。将来的にファイルサイズが問題になる場合はR2オブジェクトストレージに移す）。
-- 要配慮個人情報ではないため暗号化は不要。
CREATE TABLE floor_plans (
  id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES incidents(id),
  image_data TEXT NOT NULL,         -- "data:image/png;base64,...." 形式
  note TEXT,                        -- 補足メモ（任意）
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 前兆現象の目撃報告（国交省公式チェックリストに基づく）。
CREATE TABLE precursor_signs (
  id TEXT PRIMARY KEY,
  incident_id TEXT NOT NULL REFERENCES incidents(id),
  sign_label TEXT NOT NULL,         -- 例: "がけの割れ目・ひび割れ"
  latitude REAL,
  longitude REAL,
  reported_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_family_intake_incident ON family_intake(incident_id);
CREATE INDEX idx_floor_plans_incident ON floor_plans(incident_id);
CREATE INDEX idx_precursor_signs_incident ON precursor_signs(incident_id);
