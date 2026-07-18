#!/usr/bin/env python3
"""
国土数値情報「土砂災害警戒区域データ」(A33) の GML/Shapefile を
prototype/doshasai-prototype.html の sampleGeoJSON と同じ構造の
GeoJSON に変換するツール。

使い方（まずは中身を確認するだけ）:
    python3 convert_ksj_a33.py --input A33-20_13_GML.zip --inspect

実際に変換する:
    python3 convert_ksj_a33.py --input A33-20_13_GML.zip \
        --output ../prototype/data/tokyo_sabo_zones.geojson \
        --tolerance 0.00002

23区（区部）のみに絞り込む場合は --ward-column / --ward-codes を指定する。
--inspect の出力で実際の属性列名を確認してから指定すること
（KSJのバージョンによって列名が異なる場合があるため、決め打ちしない）。
"""
import argparse
import json
import sys
import zipfile
import tempfile
from pathlib import Path

import geopandas as gpd

# 東京都23区の市区町村コード（JIS X0402、13101〜13123）
TOKYO_23_WARD_CODES = [str(c) for c in range(13101, 13124)]

# KSJ A33 で一般的に使われる属性名の候補（実データ確認後に調整すること）
CANDIDATE_PHENOMENON_COLUMNS = ["A33_005", "現象の種類", "phenomenon"]
CANDIDATE_ZONE_TYPE_COLUMNS = ["A33_004", "区域区分", "zone_type"]
CANDIDATE_ZONE_NAME_COLUMNS = ["A33_006", "区域名", "zone_name"]
CANDIDATE_ADDRESS_COLUMNS = ["A33_002", "所在地", "address"]
CANDIDATE_NOTICE_DATE_COLUMNS = ["A33_007", "告示日", "notice_date"]


def find_first_existing(columns, candidates):
    for c in candidates:
        if c in columns:
            return c
    return None


def load_source(input_path: Path) -> gpd.GeoDataFrame:
    if input_path.suffix.lower() == ".zip":
        with tempfile.TemporaryDirectory() as tmp:
            with zipfile.ZipFile(input_path) as zf:
                zf.extractall(tmp)
            tmp_dir = Path(tmp)
            gml_files = list(tmp_dir.rglob("*.gml")) + list(tmp_dir.rglob("*.xml"))
            shp_files = list(tmp_dir.rglob("*.shp"))
            target = gml_files[0] if gml_files else (shp_files[0] if shp_files else None)
            if target is None:
                raise SystemExit(f"zip内にGML/Shapefileが見つかりません: {list(tmp_dir.rglob('*'))}")
            return gpd.read_file(target)
    return gpd.read_file(input_path)


def inspect(gdf: gpd.GeoDataFrame):
    print(f"件数: {len(gdf)}")
    print(f"CRS: {gdf.crs}")
    print(f"列名: {list(gdf.columns)}")
    print("先頭3件の属性値:")
    print(gdf.drop(columns="geometry").head(3).to_string())
    bounds = gdf.total_bounds
    print(f"範囲 (minx, miny, maxx, maxy): {bounds}")


def convert(
    gdf: gpd.GeoDataFrame,
    tolerance: float,
    ward_column: str | None,
    ward_codes: list[str] | None,
) -> dict:
    # JGD2011(EPSG:6668)等 → Leaflet前提のWGS84(EPSG:4326)へ変換
    # 日本付近ではJGD2011とWGS84の差はcm〜m単位で、この用途の地図表示には
    # 実質的な影響はないが、正確を期して明示的に再投影する。
    if gdf.crs is not None and gdf.crs.to_epsg() != 4326:
        gdf = gdf.to_crs(epsg=4326)

    if ward_column and ward_codes:
        if ward_column not in gdf.columns:
            raise SystemExit(
                f"--ward-column '{ward_column}' が見つかりません。--inspect で列名を確認してください。"
            )
        gdf = gdf[gdf[ward_column].astype(str).isin(ward_codes)]
        print(f"23区絞り込み後の件数: {len(gdf)}")

    if tolerance > 0:
        gdf["geometry"] = gdf["geometry"].simplify(tolerance, preserve_topology=True)

    columns = gdf.columns
    phenomenon_col = find_first_existing(columns, CANDIDATE_PHENOMENON_COLUMNS)
    zone_type_col = find_first_existing(columns, CANDIDATE_ZONE_TYPE_COLUMNS)
    zone_name_col = find_first_existing(columns, CANDIDATE_ZONE_NAME_COLUMNS)
    address_col = find_first_existing(columns, CANDIDATE_ADDRESS_COLUMNS)
    notice_date_col = find_first_existing(columns, CANDIDATE_NOTICE_DATE_COLUMNS)

    missing = [
        name
        for name, col in [
            ("現象の種類", phenomenon_col),
            ("区域区分", zone_type_col),
            ("区域名", zone_name_col),
            ("所在地", address_col),
            ("告示日", notice_date_col),
        ]
        if col is None
    ]
    if missing:
        print(
            f"警告: 以下の属性列が見つからず空欄になります: {missing}\n"
            f"       --inspect の出力を見て CANDIDATE_* リストに実際の列名を追加してください。",
            file=sys.stderr,
        )

    features = []
    for _, row in gdf.iterrows():
        geom = row["geometry"]
        if geom is None:
            continue
        features.append(
            {
                "type": "Feature",
                "properties": {
                    "現象の種類": row.get(phenomenon_col, "") if phenomenon_col else "",
                    "区域区分": row.get(zone_type_col, "") if zone_type_col else "",
                    "区域名": row.get(zone_name_col, "") if zone_name_col else "",
                    "所在地": row.get(address_col, "") if address_col else "",
                    "告示日": str(row.get(notice_date_col, "")) if notice_date_col else "",
                },
                "geometry": json.loads(gpd.GeoSeries([geom]).to_json())["features"][0]["geometry"],
            }
        )

    return {"type": "FeatureCollection", "features": features}


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--input", required=True, type=Path, help="A33-20_13_GML.zip 等の入力ファイル")
    parser.add_argument("--output", type=Path, help="出力GeoJSONパス（--inspect指定時は不要）")
    parser.add_argument("--inspect", action="store_true", help="変換せず、列名・件数・CRS等を表示するだけ")
    parser.add_argument("--tolerance", type=float, default=0.0, help="simplify許容誤差（度単位。例: 0.00002 ≒ 約2m）")
    parser.add_argument("--ward-column", default=None, help="市区町村コード列名（23区絞り込み用、--inspectで確認）")
    parser.add_argument(
        "--ward-codes",
        action="store_true",
        help="東京都23区のJISコード(13101-13123)で絞り込む（--ward-columnと併用）",
    )
    args = parser.parse_args()

    if not args.input.exists():
        raise SystemExit(f"入力ファイルが見つかりません: {args.input}")

    gdf = load_source(args.input)

    if args.inspect:
        inspect(gdf)
        return

    if not args.output:
        raise SystemExit("--output を指定してください（--inspect で先に列名を確認することを推奨）")

    geojson = convert(
        gdf,
        tolerance=args.tolerance,
        ward_column=args.ward_column,
        ward_codes=TOKYO_23_WARD_CODES if args.ward_codes else None,
    )

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(geojson, f, ensure_ascii=False)

    size_kb = args.output.stat().st_size / 1024
    print(f"出力完了: {args.output}（{size_kb:.1f} KB、{len(geojson['features'])}件）")


if __name__ == "__main__":
    main()
