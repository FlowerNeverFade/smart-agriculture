"""Command line for the agricultural virtual sensor."""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

from .backfill import backfill
from .config import load_config
from .simulator import SensorSimulator

DEFAULT_CONFIG = Path(__file__).with_name("config.yaml")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="智慧农业虚拟传感器：生成土壤湿度、温度等监测数据",
    )
    parser.add_argument(
        "--config",
        default=str(DEFAULT_CONFIG),
        help="YAML 配置文件路径",
    )
    parser.add_argument(
        "--stdout",
        action="store_true",
        help="不连接 MQTT，把报文打印到终端",
    )
    parser.add_argument(
        "--once",
        action="store_true",
        help="只采集并输出一轮数据后退出",
    )
    parser.add_argument(
        "--backfill",
        type=int,
        metavar="DAYS",
        help="离线生成过去 N 天历史数据（JSONL）",
    )
    parser.add_argument(
        "--step-minutes",
        type=int,
        default=15,
        help="历史数据采样间隔（分钟），默认 15",
    )
    parser.add_argument(
        "--output",
        default="data/history.jsonl",
        help="历史数据输出路径",
    )
    parser.add_argument(
        "-v",
        "--verbose",
        action="store_true",
        help="打印调试日志",
    )
    return parser


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    logging.basicConfig(
        level=logging.DEBUG if args.verbose else logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    config = load_config(args.config)

    if args.backfill:
        path, count = backfill(config, args.backfill, args.step_minutes, args.output)
        print(f"wrote {count} records to {path}")
        return 0

    simulator = SensorSimulator(config, use_mqtt=not args.stdout)
    if args.once:
        for payload in simulator.emit_once(publish=False):
            print(json.dumps(payload, ensure_ascii=False, indent=2))
        return 0

    if not args.stdout:
        try:
            simulator.start_mqtt()
        except (OSError, ConnectionError) as exc:
            logging.warning("MQTT unavailable (%s), falling back to stdout", exc)
            simulator.use_mqtt = False

    try:
        simulator.run_forever()
    except KeyboardInterrupt:
        logging.info("stopped")
    finally:
        simulator.stop_mqtt()
    return 0


if __name__ == "__main__":
    sys.exit(main())
