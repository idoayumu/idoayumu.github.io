#!/usr/bin/env python3
"""
光景ノオト works.json のタイトル＋撮影日だけを使い、
TypeSafe公式 Jev API で「主分類」「副分類」「表現・記録タイプ」を自動分類するスクリプト。

使い方:
  export TYPESAFE_API_KEY="..."
  python3 tools/jev/classify_work_titles.py --limit 10

全件:
  python3 tools/jev/classify_work_titles.py

結果:
  tools/jev/output/title_classification_YYYYMMDD_HHMMSS.json
  tools/jev/output/title_classification_YYYYMMDD_HHMMSS.csv

仕様:
- 入力は title と date のみ。
- 1作品につき1回 TypeSafe Jev API を呼び出す。
- 主分類・副分類はそれぞれ8候補の Choice。
- 表現・記録タイプは「表現型」「中間」「記録型」の3候補の Choice。
- 主分類 confidence / 副分類 confidence / 表現・記録 confidence をそれぞれ独立して保存。
- 副分類 confidence が 0.45 未満の場合、採用副分類を「分類保留」とする。
- 表現・記録 confidence が 0.45 未満の場合、採用タイプを「判定保留」とする。
- Jev が選んだ元の副分類・表現記録タイプも raw 値として保存する。
- 途中で止まっても、既存 JSON があれば完了済み作品をスキップして再開可能。
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path
from typing import Any

DEFAULT_ENDPOINT = "https://api.typesafe.ai/v1/systemone"
DEFAULT_MODEL = "jev-latest"
SUB_CATEGORY_HOLD_THRESHOLD = 0.45
EXPRESSION_RECORD_HOLD_THRESHOLD = 0.45

MAIN_LABELS = {
    "season_time": "季節・時間",
    "light_color": "光・色",
    "emotion_mind": "感情・心象",
    "person_action": "人物・動作",
    "place_scene": "場所・情景",
    "object_motif": "物・モチーフ",
    "abstract_concept": "抽象・概念",
    "language_expression": "言葉・表現",
}

SUB_LABELS = {
    "lyrical": "叙情",
    "fantastical": "幻想",
    "nostalgic": "郷愁",
    "quiet": "静謐",
    "dynamic": "躍動",
    "intimate": "親密",
    "tense": "緊張",
    "playful": "遊戯",
}

EXPRESSION_RECORD_LABELS = {
    "expressive": "表現型",
    "middle": "中間",
    "documentary": "記録型",
}

QUESTIONS = {
    "main_category": {
        "type": "choice",
        "instructions": (
            "写真そのものは見ず、写真タイトルを主な根拠として主分類してください。"
            "撮影日は季節や時期を判断する補助情報としてのみ使用してください。"
            "タイトルが何を主に示しているかを判断し、最も適切なものを1つ選んでください。"
        ),
        "criteria": {
            "season_time": "季節、時間帯、年月、時期、移ろいなどが中心。",
            "light_color": "光、影、色、明暗、透明感などが中心。",
            "emotion_mind": "感情、心情、想い、呼びかけ、記憶、余韻、人との心理的距離などが中心。",
            "person_action": "人物、表情、視線、仕草、身体表現、動作などが中心。",
            "place_scene": "場所、街、風景、空間、情景などが中心。",
            "object_motif": "花、葉、月、くま、傘など、具体的な物・生物・象徴的モチーフが中心。",
            "abstract_concept": "境界、存在、生活、関係など、抽象的な概念や思想が中心。",
            "language_expression": "言葉、名前、物語、文章、表現行為、伝えることそのものを主題としている。単に「声」などの語が含まれるだけでは選ばず、言語や表現そのものが中心の場合に選ぶ。",
        },
    },
    "sub_category": {
        "type": "choice",
        "instructions": (
            "写真そのものは見ず、写真タイトルを主な根拠として、"
            "そのタイトルがどのような表現的な空気や性質を帯びているかを副分類してください。"
            "撮影日は季節や時期の補助情報としてのみ使用してください。"
            "最も適切なものを1つ選んでください。"
        ),
        "criteria": {
            "lyrical": "叙情。切なさ、喪失、恋慕、内面的な感情の揺れ、余韻など、明確な情感が中心にある。単に詩的、美しい、季節感がある、雰囲気がある、抽象的というだけでは選ばない。",
            "fantastical": "幻想。夢、非現実、不可思議、夢幻的な印象を感じさせる。",
            "nostalgic": "郷愁。過去、記憶、失われた時間、戻れなさ、懐かしさが明確に感じられる。季節語だけでは選ばない。",
            "quiet": "静謐。静けさそのものが作品の中心にあり、沈黙、静止、落ち着いた佇まい、張りつめすぎない静かな空気を明確に感じさせる。単に動きが少ない、場所を示す、説明的、穏やかというだけでは選ばない。",
            "dynamic": "躍動。動き、勢い、瞬間性、生命力を感じさせる。",
            "intimate": "親密。呼びかけ、笑顔、近さ、人との関係、私的な距離感や親しさを感じさせる。",
            "tense": "緊張。鋭さ、不安、対立、張り詰めた感覚を感じさせる。",
            "playful": "遊戯。ピース、ウィンク、ポーズ、ふざけ、遊び、可愛らしい仕草、軽快なノリなど、撮影者や被写体の遊び心が明確に感じられる。",
        },
    },
    "expression_record_type": {
        "type": "choice",
        "instructions": (
            "写真そのものは見ず、写真タイトルを主な根拠として、"
            "そのタイトルが表現として意味や解釈を持たせる方向か、"
            "出来事・場所・人物・状況を記録または説明する方向かを判定してください。"
            "撮影日は補助情報としてのみ使用してください。"
            "どちらにも明確に寄らない場合は中間を選んでください。"
        ),
        "criteria": {
            "expressive": "表現型。タイトルによって意味づけ、解釈、象徴、詩性、感情、物語性などを与え、単なる記録や説明を超えて作品として受け取らせる方向が強い。",
            "middle": "中間。表現的な意味づけと、場所・人物・状況などを示す記録的・説明的な性質の両方があり、どちらか一方に明確には寄らない。",
            "documentary": "記録型。場所、出来事、人物、状況、ポーズ、対象などを比較的そのまま示し、意味づけや解釈よりも記録・説明・識別の性質が強い。",
        },
    },
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--works",
        default="src/data/works.json",
        help="works.json のパス (default: src/data/works.json)",
    )
    parser.add_argument(
        "--output-dir",
        default="tools/jev/output",
        help="出力先ディレクトリ (default: tools/jev/output)",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="先頭から処理する最大件数。テスト時は --limit 10 推奨。",
    )
    parser.add_argument(
        "--endpoint",
        default=os.environ.get("TYPESAFE_API_ENDPOINT", DEFAULT_ENDPOINT),
        help="TypeSafe Jev API endpoint",
    )
    parser.add_argument(
        "--model",
        default=os.environ.get("TYPESAFE_MODEL", DEFAULT_MODEL),
        help="TypeSafe Jev model id",
    )
    parser.add_argument(
        "--sleep",
        type=float,
        default=0.2,
        help="API 呼び出し間隔（秒）",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="互換用オプション。タイムスタンプ出力では毎回新規分類します。",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="APIを呼ばず、対象作品と送信内容だけ確認する",
    )
    return parser.parse_args()


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def save_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(value, f, ensure_ascii=False, indent=2)
        f.write("\n")
    tmp.replace(path)


def confidence_label(value: float) -> str:
    if value >= 0.75:
        return "高"
    if value >= 0.45:
        return "中"
    return "低"


def call_jev(
    *,
    endpoint: str,
    api_key: str,
    model: str,
    title: str,
    date: str,
) -> dict[str, Any]:
    payload = {
        "model": model,
        "state": {
            "title": title,
            "shoot_date": date,
        },
        "questions": QUESTIONS,
    }

    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        endpoint,
        data=body,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "kokei-note-jev-title-classifier/1.0",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"TypeSafe API HTTP {e.code}: {detail}") from e
    except urllib.error.URLError as e:
        raise RuntimeError(f"TypeSafe API connection error: {e}") from e


def normalize_result(work: dict[str, Any], response: dict[str, Any]) -> dict[str, Any]:
    answers = response.get("answers", {})
    main = answers.get("main_category", {})
    sub = answers.get("sub_category", {})
    expression_record = answers.get("expression_record_type", {})

    main_key = main.get("choice")
    sub_key = sub.get("choice")
    expression_record_key = expression_record.get("choice")
    main_conf = float(main.get("confidence", 0.0))
    sub_conf = float(sub.get("confidence", 0.0))
    expression_record_conf = float(expression_record.get("confidence", 0.0))

    raw_sub_category = SUB_LABELS.get(sub_key, sub_key)
    sub_is_held = sub_conf < SUB_CATEGORY_HOLD_THRESHOLD
    adopted_sub_category = "分類保留" if sub_is_held else raw_sub_category

    raw_expression_record_type = EXPRESSION_RECORD_LABELS.get(
        expression_record_key, expression_record_key
    )
    expression_record_is_held = (
        expression_record_conf < EXPRESSION_RECORD_HOLD_THRESHOLD
    )
    adopted_expression_record_type = (
        "判定保留" if expression_record_is_held else raw_expression_record_type
    )

    return {
        "id": work.get("id"),
        "title": work.get("title", ""),
        "date": work.get("date", ""),
        "main_category": MAIN_LABELS.get(main_key, main_key),
        "main_category_key": main_key,
        "sub_category": adopted_sub_category,
        "sub_category_key": None if sub_is_held else sub_key,
        "sub_category_raw": raw_sub_category,
        "sub_category_key_raw": sub_key,
        "sub_category_held": sub_is_held,
        "main_confidence": main_conf,
        "main_confidence_label": confidence_label(main_conf),
        "sub_confidence": sub_conf,
        "sub_confidence_label": confidence_label(sub_conf),
        "expression_record_type": adopted_expression_record_type,
        "expression_record_type_key": (
            None if expression_record_is_held else expression_record_key
        ),
        "expression_record_type_raw": raw_expression_record_type,
        "expression_record_type_key_raw": expression_record_key,
        "expression_record_held": expression_record_is_held,
        "expression_record_confidence": expression_record_conf,
        "expression_record_confidence_label": confidence_label(expression_record_conf),
        "main_probabilities": main.get("probabilities", {}),
        "sub_probabilities": sub.get("probabilities", {}),
        "expression_record_probabilities": expression_record.get("probabilities", {}),
        "model": response.get("model"),
        "usage": response.get("usage"),
    }


def write_csv(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fields = [
        "id",
        "title",
        "date",
        "main_category",
        "main_confidence_label",
        "main_confidence",
        "sub_category",
        "sub_category_raw",
        "sub_category_held",
        "sub_confidence_label",
        "sub_confidence",
        "expression_record_type",
        "expression_record_type_raw",
        "expression_record_held",
        "expression_record_confidence_label",
        "expression_record_confidence",
        "model",
    ]
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fields)
        writer.writeheader()
        for row in rows:
            writer.writerow({k: row.get(k) for k in fields})


def main() -> int:
    args = parse_args()

    works_path = Path(args.works)
    output_dir = Path(args.output_dir)

    # 実行開始時刻をファイル名へ付与する。
    # JSON / CSV は同じタイムスタンプを共有する。
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    json_path = output_dir / f"title_classification_{timestamp}.json"
    csv_path = output_dir / f"title_classification_{timestamp}.csv"

    if not works_path.exists():
        print(f"ERROR: works.json が見つかりません: {works_path}", file=sys.stderr)
        return 2

    works = load_json(works_path)
    if not isinstance(works, list):
        print("ERROR: works.json のトップレベルが配列ではありません。", file=sys.stderr)
        return 2

    targets = [
        w for w in works
        if isinstance(w, dict)
        and str(w.get("title", "")).strip()
        and str(w.get("date", "")).strip()
    ]
    if args.limit is not None:
        targets = targets[: args.limit]

    # タイムスタンプ付きで毎回新しい出力ファイルを作るため、
    # この実行では全対象を新規分類する。
    results: list[dict[str, Any]] = []
    pending = list(targets)

    print(f"対象: {len(targets)}作品")
    print("完了済み: 0作品（今回の実行は新規タイムスタンプ出力）")
    print(f"今回処理: {len(pending)}作品")
    print("入力に使うのは title と date のみです。")
    print(f"API: {args.endpoint}")
    print(f"Model: {args.model}")

    if args.dry_run:
        for w in pending:
            print(json.dumps(
                {"id": w.get("id"), "title": w.get("title"), "date": w.get("date")},
                ensure_ascii=False
            ))
        return 0

    api_key = os.environ.get("TYPESAFE_API_KEY") or os.environ.get("JEV_API_KEY")
    if not api_key:
        print(
            'ERROR: TYPESAFE_API_KEY が未設定です。\n'
            '例: export TYPESAFE_API_KEY="あなたのAPIキー"',
            file=sys.stderr,
        )
        return 2

    for index, work in enumerate(pending, start=1):
        work_id = str(work.get("id", ""))
        title = str(work.get("title", "")).strip()
        date = str(work.get("date", "")).strip()

        print(f"[{index}/{len(pending)}] {title} ({date}) ... ", end="", flush=True)

        try:
            response = call_jev(
                endpoint=args.endpoint,
                api_key=api_key,
                model=args.model,
                title=title,
                date=date,
            )
            row = normalize_result(work, response)
            results = [r for r in results if str(r.get("id")) != work_id]
            results.append(row)

            save_json(json_path, results)
            write_csv(csv_path, results)

            if row["sub_category_held"]:
                sub_display = (
                    f'分類保留（Jev候補: {row["sub_category_raw"]}） '
                    f'[副:{row["sub_confidence_label"]} {row["sub_confidence"]:.3f}]'
                )
            else:
                sub_display = (
                    f'{row["sub_category"]} '
                    f'[副:{row["sub_confidence_label"]} {row["sub_confidence"]:.3f}]'
                )

            if row["expression_record_held"]:
                expression_record_display = (
                    f'判定保留（Jev候補: {row["expression_record_type_raw"]}） '
                    f'[表記:{row["expression_record_confidence_label"]} '
                    f'{row["expression_record_confidence"]:.3f}]'
                )
            else:
                expression_record_display = (
                    f'{row["expression_record_type"]} '
                    f'[表記:{row["expression_record_confidence_label"]} '
                    f'{row["expression_record_confidence"]:.3f}]'
                )

            print(
                f'{row["main_category"]} '
                f'[主:{row["main_confidence_label"]} {row["main_confidence"]:.3f}] / '
                f'{sub_display} / '
                f'{expression_record_display}'
            )

        except Exception as e:
            print("FAILED")
            print(f"  {e}", file=sys.stderr)
            print(f"途中結果は {json_path} / {csv_path} に保存済みです。")
            return 1

        if args.sleep > 0:
            time.sleep(args.sleep)

    order = {str(w.get("id")): i for i, w in enumerate(works)}
    results.sort(key=lambda r: order.get(str(r.get("id")), 10**9))
    save_json(json_path, results)
    write_csv(csv_path, results)

    print()
    print("完了！")
    print(f"JSON: {json_path}")
    print(f"CSV : {csv_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
