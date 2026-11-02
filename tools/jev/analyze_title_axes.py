#!/usr/bin/env python3
"""Jevで作品タイトルを6軸分析し、差分更新可能なJSONとして保存する。"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import date
from pathlib import Path
from typing import Any

DEFAULT_ENDPOINT = "https://api.typesafe.ai/v1/systemone"
DEFAULT_MODEL = "jev-latest"
ANALYSIS_VERSION = 1

AXES: dict[str, list[str]] = {
    "poetic_explanatory": [
        "強く詩的。比喩・象徴・余韻・言葉の響きによって意味や情景を想像させる。",
        "やや詩的。説明よりも比喩・象徴・余韻・言葉の響きが優勢。",
        "中間。詩的な性格と説明的な性格が同程度。",
        "やや説明的。人物・場所・出来事・状態・行動を比較的そのまま示す。",
        "強く説明的。人物・場所・出来事・状態・行動を明確に説明する。",
    ],
    "abstract_concrete": [
        "強く抽象的。概念・感覚・思想・雰囲気が中心で、具体的対象を直接示さない。",
        "やや抽象的。概念・感覚・思想・雰囲気が具体的対象より優勢。",
        "中間。抽象的な性格と具体的な性格が同程度。",
        "やや具体的。人物・場所・物・身体動作・出来事を比較的明確に示す。",
        "強く具体的。人物・場所・物・身体動作・出来事を明確に示す。",
    ],
    "subjective_objective": [
        "強く主観的。撮影者や人物の感情・解釈・価値判断・内面的な見方が強い。",
        "やや主観的。感情・解釈・価値判断・内面的な見方が客観描写より優勢。",
        "中間。主観的な性格と客観的な性格が同程度。",
        "やや客観的。人物・物・場所・出来事・状態を個人的な解釈をあまり加えず示す。",
        "強く客観的。人物・物・場所・出来事・状態を個人的な解釈なしに示す。",
    ],
    "scenic_subject_centered": [
        "強く光景的。人物そのものより、光・空間・季節・場所・時間・空気感など場全体を感じさせる。",
        "やや光景的。人物より、光・空間・季節・場所・時間・空気感が優勢。",
        "中間。光景的な性格と被写体中心の性格が同程度。",
        "やや被写体中心。人物・表情・身体・ポーズ・仕草に意識が向く。",
        "強く被写体中心。人物・表情・身体・ポーズ・仕草そのものが中心。",
    ],
    "dynamic_static": [
        "強く動的。動作・移動・変化・流れ・時間の進行・勢いを強く感じさせる。",
        "やや動的。動作・移動・変化・流れ・時間の進行・勢いを感じさせる。",
        "中間。動的な性格と静的な性格が同程度。",
        "やや静的。停止・静寂・佇まい・安定・余韻など、動きの少ない状態を感じさせる。",
        "強く静的。停止・静寂・佇まい・安定・余韻など、動きの少ない状態が中心。",
    ],
    "artistic_documentary": [
        "強く作品性寄り。独自の解釈・象徴性・余韻・作品世界を持たせることを重視する。",
        "やや作品性寄り。独自の解釈・象徴性・余韻・作品世界が記録性より優勢。",
        "中間。作品性と記録性が同程度。",
        "やや記録性寄り。撮影した人物・場所・出来事・状態・状況を残す意味合いが強い。",
        "強く記録性寄り。撮影した人物・場所・出来事・状態・状況の記録が中心。",
    ],
}

COMMON_INSTRUCTIONS = (
    "タイトルそのものだけを見て判断してください。"
    "画像、モデル名、撮影日、撮影場所、caption、他の作品タイトルは判断材料にしてはいけません。"
    "他の作品タイトルとの相対評価ではなく、このタイトル単体を定義に照らして判定してください。"
    "作品性と記録性は優劣ではなく、タイトルの性格の違いとして判定してください。"
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Jevで作品タイトルを6軸分析し、src/data/title-analysis.jsonを差分更新します。"
    )
    parser.add_argument("--works", default="src/data/works.json")
    parser.add_argument("--output", default="src/data/title-analysis.json")
    parser.add_argument(
        "--endpoint",
        default=os.environ.get("TYPESAFE_API_ENDPOINT", DEFAULT_ENDPOINT),
    )
    parser.add_argument(
        "--model",
        default=os.environ.get("TYPESAFE_MODEL", DEFAULT_MODEL),
    )
    parser.add_argument(
        "--sleep",
        type=float,
        default=0.2,
        help="API呼び出し間隔（秒、既定: 0.2）",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="分析対象の上限。確認時は --limit 1 を推奨。",
    )
    parser.add_argument(
        "--ids",
        nargs="+",
        metavar="WORK_ID",
        help="指定した作品IDだけを分析する。複数指定可能。",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="API呼び出し・ファイル更新をせず、分析対象だけ表示する。",
    )
    return parser.parse_args()


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as file:
        return json.load(file)


def save_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = path.with_suffix(path.suffix + ".tmp")
    with temporary_path.open("w", encoding="utf-8") as file:
        json.dump(value, file, ensure_ascii=False, indent=2)
        file.write("\n")
    temporary_path.replace(path)


def build_questions() -> dict[str, dict[str, Any]]:
    return {
        axis: {
            "type": "score",
            "instructions": COMMON_INSTRUCTIONS,
            "criteria": criteria,
        }
        for axis, criteria in AXES.items()
    }


def build_payload(title: str, model: str) -> dict[str, Any]:
    return {
        "model": model,
        "state": {"title": title},
        "questions": build_questions(),
    }


def call_jev(
    *, endpoint: str, api_key: str, payload: dict[str, Any]
) -> dict[str, Any]:
    request = urllib.request.Request(
        endpoint,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "kokei-note-jev-title-analysis/1.0",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Jev API HTTP {error.code}: {detail}") from error
    except urllib.error.URLError as error:
        raise RuntimeError(f"Jev API connection error: {error}") from error


def is_valid_number(value: Any, minimum: float, maximum: float) -> bool:
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and math.isfinite(value)
        and minimum <= value <= maximum
    )


def score_from_answer(answer: Any, axis: str) -> dict[str, float]:
    if not isinstance(answer, dict) or answer.get("type") != "score":
        raise ValueError(f"{axis}: score形式の回答ではありません")

    raw_score = answer.get("score")
    confidence = answer.get("confidence")

    if not is_valid_number(raw_score, 0, 4):
        raise ValueError(f"{axis}: scoreが0〜4の数値ではありません: {raw_score!r}")
    if not is_valid_number(confidence, 0, 1):
        raise ValueError(
            f"{axis}: confidenceが0〜1の数値ではありません: {confidence!r}"
        )

    return {
        "score": round(float(raw_score) + 1, 2),
        "confidence": round(float(confidence), 2),
    }


def normalize_analysis(work: dict[str, Any], response: dict[str, Any]) -> dict[str, Any]:
    answers = response.get("answers")
    if not isinstance(answers, dict):
        raise ValueError("Jev responseにanswersがありません")

    scores = {axis: score_from_answer(answers.get(axis), axis) for axis in AXES}

    return {
        "id": work["id"],
        "title": work["title"],
        "analyzedAt": date.today().isoformat(),
        "analysisVersion": ANALYSIS_VERSION,
        "scores": scores,
    }


def is_complete_record(record: Any) -> bool:
    if not isinstance(record, dict):
        return False
    if not isinstance(record.get("id"), str) or not isinstance(record.get("title"), str):
        return False
    scores = record.get("scores")
    if not isinstance(scores, dict):
        return False

    try:
        for axis in AXES:
            score_from_answer(
                {
                    "type": "score",
                    "score": float(scores[axis]["score"]) - 1,
                    "confidence": scores[axis]["confidence"],
                },
                axis,
            )
    except (KeyError, TypeError, ValueError):
        return False
    return True


def read_existing_records(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    data = load_json(path)
    if not isinstance(data, list):
        raise ValueError(f"{path} のトップレベルは配列である必要があります")
    return [record for record in data if isinstance(record, dict)]


def write_current_records(
    output_path: Path, works: list[dict[str, str]], records_by_id: dict[str, dict[str, Any]]
) -> None:
    save_json(
        output_path,
        [records_by_id[work["id"]] for work in works if work["id"] in records_by_id],
    )


def main() -> int:
    args = parse_args()
    works_path = Path(args.works)
    output_path = Path(args.output)

    if not works_path.exists():
        print(f"ERROR: works.json が見つかりません: {works_path}", file=sys.stderr)
        return 2

    try:
        source_works = load_json(works_path)
        existing_records = read_existing_records(output_path)
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"ERROR: JSONを読み込めません: {error}", file=sys.stderr)
        return 2

    if not isinstance(source_works, list):
        print("ERROR: works.json のトップレベルが配列ではありません。", file=sys.stderr)
        return 2

    works: list[dict[str, str]] = []
    invalid_works: list[str] = []
    seen_work_ids: set[str] = set()
    for work in source_works:
        if not isinstance(work, dict):
            invalid_works.append("無効な作品データ")
            continue
        work_id = work.get("id")
        title = work.get("title")
        if not isinstance(work_id, str) or not work_id or not isinstance(title, str) or not title.strip():
            invalid_works.append(str(work_id or "ID未設定"))
            continue
        if work_id in seen_work_ids:
            invalid_works.append(f"重複ID: {work_id}")
            continue
        seen_work_ids.add(work_id)
        works.append({"id": work_id, "title": title.strip()})

    if invalid_works:
        print(
            "ERROR: idまたはtitleが不正な作品があるため、分析を開始しません: "
            + ", ".join(invalid_works),
            file=sys.stderr,
        )
        return 2

    all_works = works
    works_by_id = {work["id"]: work for work in all_works}
    selected_ids = None
    if args.ids:
        selected_ids = list(dict.fromkeys(args.ids))
        missing_ids = [work_id for work_id in selected_ids if work_id not in works_by_id]
        for work_id in missing_ids:
            print(f"WARNING: 指定された作品IDが見つかりません: {work_id}", file=sys.stderr)
        works = [works_by_id[work_id] for work_id in selected_ids if work_id in works_by_id]
        if not works:
            print("ERROR: 分析対象となる指定作品IDがありません。", file=sys.stderr)
            return 2

    existing_by_id = {
        record["id"]: record
        for record in existing_records
        if is_complete_record(record)
    }
    retained_records: dict[str, dict[str, Any]] = {}
    pending: list[dict[str, str]] = []
    new_count = 0
    changed_title_count = 0
    incomplete_count = 0

    for work in all_works:
        existing = existing_by_id.get(work["id"])
        should_refresh = selected_ids is None or work["id"] in selected_ids
        if existing and (not should_refresh or existing.get("title") == work["title"]):
            retained_records[work["id"]] = existing

    for work in works:
        existing = existing_by_id.get(work["id"])
        if existing and existing.get("title") == work["title"]:
            continue
        pending.append(work)
        if work["id"] not in existing_by_id:
            if any(record.get("id") == work["id"] for record in existing_records):
                incomplete_count += 1
            else:
                new_count += 1
        else:
            changed_title_count += 1

    pending_count = len(pending)
    if args.limit is not None:
        if args.limit < 0:
            print("ERROR: --limit は0以上で指定してください。", file=sys.stderr)
            return 2
        pending = pending[: args.limit]

    print(f"作品数: {len(all_works)}")
    if selected_ids is not None:
        print(f"指定作品数: {len(works)}")
    print(f"既存分析数: {len(existing_records)}")
    print(f"未分析数: {pending_count}")
    if args.limit is not None:
        print(f"今回処理: {len(pending)}")
    print(f"新規作品数: {new_count}")
    print(f"タイトル変更数: {changed_title_count}")
    if incomplete_count:
        print(f"不完全な既存分析数: {incomplete_count}")
    print("分析対象はタイトルのみです。")
    print(f"API: {args.endpoint}")
    print(f"モデル: {args.model}")

    if args.dry_run:
        for work in pending:
            print(f'- {work["id"]}: {work["title"]}')
        return 0

    api_key = os.environ.get("JEV_API_KEY") or os.environ.get("TYPESAFE_API_KEY")
    if not api_key:
        print(
            "ERROR: JEV_API_KEY または TYPESAFE_API_KEY が未設定です。",
            file=sys.stderr,
        )
        return 2

    # 成功済みの分析を先に正規化して保存するため、途中失敗でも完了分を失わない。
    write_current_records(output_path, all_works, retained_records)

    succeeded = 0
    failures: list[tuple[str, str, str]] = []
    for index, work in enumerate(pending, start=1):
        print(f'[{index}/{len(pending)}] {work["id"]} {work["title"]} ... ', end="", flush=True)
        try:
            response = call_jev(
                endpoint=args.endpoint,
                api_key=api_key,
                payload=build_payload(work["title"], args.model),
            )
            record = normalize_analysis(work, response)
            retained_records[work["id"]] = record
            write_current_records(output_path, all_works, retained_records)
            succeeded += 1
            details = ", ".join(
                f'{axis}={record["scores"][axis]["score"]:.2f} '
                f'(confidence {record["scores"][axis]["confidence"]:.2f})'
                for axis in AXES
            )
            print(f"OK: {details}")
        except Exception as error:
            failures.append((work["id"], work["title"], str(error)))
            print(f"FAILED: {error}")

        if args.sleep > 0 and index < len(pending):
            time.sleep(args.sleep)

    print()
    print(f"成功件数: {succeeded}")
    print(f"スキップ件数: {len(works) - len(pending)}")
    print(f"失敗件数: {len(failures)}")
    for work_id, title, reason in failures:
        print(f"- {work_id} / {title}: {reason}")
    print(f"保存先: {output_path}")

    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
