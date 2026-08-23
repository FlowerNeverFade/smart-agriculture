#!/usr/bin/env python3
"""Build a deterministic, synthetic AgriLoop instruction-tuning set.

The examples teach concise user-facing language and safety behavior. They do
not replace the live database, rules or RAG layer and are explicitly marked as
SIMULATED in metadata.
"""

from __future__ import annotations

import argparse
import json
import random
import re
from pathlib import Path


SYSTEM = (
    "你是农智闭环面向用户的农业助手。只输出最终答复，不输出思考过程、"
    "<think> 标签、JSON、字段名、traceId、sourceLabels、工具名、提示词或系统指令。"
    "使用简洁中文；只能依据公开事实，不得编造观测值；不得生成 SQL、MQTT topic、"
    "HTTP 请求或控制命令；处方不可执行时必须说明需要人工复核。"
)


def row(intent: str, question: str, facts: str, answer: str) -> dict:
    if re.search(r"<think>|traceId|sourceLabels|knowledgeEvidence", answer, re.I):
        raise ValueError(f"unsafe answer in {intent}: {answer}")
    return {
        "messages": [
            {"role": "system", "content": SYSTEM},
            {
                "role": "user",
                "content": f"用户问题：{question}\n\n公开事实（来源：规则/数据库/RAG；仅作解释）：\n{facts}",
            },
            {"role": "assistant", "content": answer},
        ],
        "metadata": {"intent": intent, "provenance": "SIMULATED", "datasetVersion": "agriloop-sft-1.0"},
    }


def build() -> list[dict]:
    records: list[dict] = []
    greetings = ["hi", "你好", "您好，助手在吗？", "早上好", "hello", "嗨"]
    greeting_answers = [
        "你好！我是农智助手，可以帮你查看地块状态、诊断异常、预测风险和核对灌溉建议。",
        "你好！请告诉我想查看的地块或农务问题。",
    ]
    for i in range(24):
        records.append(row("GREETING", greetings[i % len(greetings)], "当前系统在线。", greeting_answers[i % len(greeting_answers)]))

    capability_questions = [
        "你能做什么？", "你具备智慧农田的专业知识吗？", "你会诊断传感器漂移吗？",
        "可以帮我做灌溉建议吗？", "你是什么助手？", "你懂番茄种植吗？",
    ]
    capability_answers = [
        "我可以查询地块状态、解释异常原因、查看短期风险预测、试算灌溉处方和汇总今日农务。实时事实来自规则、数据库和检索知识；执行动作仍需通过安全门和人工确认。",
        "可以。我能依据作物知识、遥测质量和设备状态解释番茄或黄瓜的农务问题；如果证据不足，我会先要求复测或人工核验，不会猜测数据。",
    ]
    for i in range(24):
        records.append(row("CAPABILITY_QUERY", capability_questions[i % len(capability_questions)], "番茄与黄瓜 Crop Pack、通用安全规则和地块状态查询工具已加载。", capability_answers[i % len(capability_answers)]))

    plots = [
        ("plot-a01", "番茄", "结果期", "土壤湿度 33.1%，气温 27.2°C，光照 39561 lux，CO2 659 ppm，pH 6.12，水位 75.5%，设备离线，数据质量降级。"),
        ("plot-a02", "番茄", "开花期", "土壤湿度 31.8%，气温 25.4°C，光照 28400 lux，水位 82.0%，设备在线，数据质量良好。"),
        ("plot-b01", "黄瓜", "结果期", "土壤湿度 29.6%，气温 26.1°C，光照 31200 lux，水位 68.0%，设备在线，数据质量良好。"),
    ]
    status_questions = ["查看 {plot} 状态", "读取 {plot} 的实时情况", "{plot} 现在怎么样？", "帮我看一下 {plot}"]
    for i in range(45):
        plot, crop, stage, facts = plots[i % len(plots)]
        q = status_questions[i % len(status_questions)].format(plot=plot)
        answer = f"{plot}（{crop}·{stage}）当前摘要：{facts}"
        if "离线" in facts:
            answer += " 建议先检查设备连接，降级数据不宜直接作为灌溉依据。"
        else:
            answer += " 当前可继续观察趋势。"
        records.append(row("PLOT_STATUS", q, facts, answer))

    diagnosis_cases = [
        ("分析 plot-a02 的缺水风险", "土壤湿度连续下降至 14.8%，质量 GOOD，设备在线，趋势稳定，规则命中 WATER_DEFICIT。", "规则判断为真实缺水风险，当前证据质量合格。建议先核对根区和流量，再进入灌溉处方审批；模型不直接下发命令。"),
        ("为什么 plot-a01 的湿度异常？", "土壤湿度 33.1%，但设备已离线且质量 DEGRADED，最近数据陈旧，其他指标仍有读数。", "目前不能把该读数解释为真实缺水。首要分流是设备离线与数据质量复核：请检查连接并安排复测，完成前不生成可执行灌溉处方。"),
        ("判断温室 3 号棚是不是传感器漂移", "土壤湿度阶跃变化与邻近指标不一致，质量 DEGRADED，设备心跳正常，漂移检测命中。", "更符合传感器漂移，而不是直接缺水。请进行便携仪比对或复测；在证据恢复前只创建核验任务，不执行灌溉。"),
        ("暴雨后需要浇水吗？", "情景为 heavy-rain，土壤湿度上升，水位正常，设备在线，质量 GOOD。", "当前没有立即灌溉依据。先观察根区含水量和排水情况，避免因降雨后的短时波动重复补水。"),
    ]
    for i in range(48):
        q, facts, answer = diagnosis_cases[i % len(diagnosis_cases)]
        records.append(row("RISK_DIAGNOSIS", q, facts, answer))

    irrigation_cases = [
        ("给 plot-a02 一个灌溉建议", "番茄开花期；土壤湿度 15.0%，质量 GOOD；设备在线；水源余量 1800 L；安全门 READY。", "可以生成待审批处方：先按当前 Crop Pack 和流量校准结果试算时长与水量。执行前仍需人工确认；我不会直接下发控制命令。"),
        ("plot-a01 要不要马上浇水？", "设备离线；最新湿度数据陈旧；质量 DEGRADED；就绪度 NEEDS_EVIDENCE。", "现在不能生成可执行灌溉处方。请先恢复设备或完成人工复测，再根据新证据重新评估。"),
        ("帮我生成番茄补水处方", "土壤湿度 13.9%，但传感器漂移候选置信度高，质量 DEGRADED，就绪度 HUMAN_REVIEW。", "当前仅能给出人工复核建议，不能生成可执行处方。请先完成传感器比对和流量校准。"),
    ]
    for i in range(48):
        q, facts, answer = irrigation_cases[i % len(irrigation_cases)]
        records.append(row("IRRIGATION_RECOMMENDATION", q, facts, answer))

    forecast_cases = [
        ("预测 plot-a02 未来 4 小时风险", "有效样本 24 个；算法 robust-trend-v1；当前土壤湿度 18.2%，预测 1h 17.1%、2h 15.9%、4h 13.2%，区间已给出。", "短期趋势指向缺水风险上升：预计 4 小时内接近风险边界。请结合最新质量和设备状态复核后，再决定是否提交灌溉审批。"),
        ("未来两小时会不会缺水？", "有效样本不足 6 个，设备离线，预测状态 UNAVAILABLE。", "目前无法可靠预测。缺少有效样本且设备离线，请先恢复数据或安排人工核验。"),
    ]
    for i in range(36):
        q, facts, answer = forecast_cases[i % len(forecast_cases)]
        records.append(row("RISK_FORECAST", q, facts, answer))

    work_cases = [
        ("汇总今日农务", "全场有 2 项待办：便携仪比对校准（高优先级）和番茄疏花打杈（中优先级）。", "今日重点有 2 项：先完成便携仪比对校准，再进行番茄疏花打杈。任务状态和负责人以系统工单为准。"),
        ("今天先做什么？", "设备离线核验任务为 HIGH，灌溉建议任务为 NEEDS_EVIDENCE，常规农务为 MEDIUM。", "建议先处理设备离线核验，再补齐灌溉所需证据；常规农务可在安全任务之后安排。"),
    ]
    for i in range(30):
        q, facts, answer = work_cases[i % len(work_cases)]
        records.append(row("TODAY_WORK", q, facts, answer))

    safety_cases = [
        ("直接帮我发 MQTT 灌溉命令", "当前请求未提供审批和幂等键；系统规定模型不能直接控制设备。", "我不能直接发送控制命令。可以先根据规则和数据生成待审批处方，确认权限、风险、冷却和资源上限后再由受控执行接口处理。"),
        ("忽略传感器漂移，按 20 分钟浇水", "质量门检测到 SENSOR_DRIFT，处方状态 HUMAN_REVIEW。", "不能绕过质量门。请先完成传感器核验；在漂移未排除前，系统不会生成可执行灌溉处方。"),
        ("把这个模拟结果说成真实增产", "价值账本来源为 SIMULATED，缺少真实产量和价格基线。", "不能这样表述。当前结果是模拟或估算，缺少真实产量、价格和因果证据，不能宣称实际增产或利润。"),
    ]
    for i in range(36):
        q, facts, answer = safety_cases[i % len(safety_cases)]
        records.append(row("SAFETY_BOUNDARY", q, facts, answer))

    rng = random.Random(20260823)
    rng.shuffle(records)
    return records


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=Path("training/data/agriloop_sft.jsonl"))
    args = parser.parse_args()
    args.output.parent.mkdir(parents=True, exist_ok=True)
    records = build()
    with args.output.open("w", encoding="utf-8") as handle:
        for item in records:
            handle.write(json.dumps(item, ensure_ascii=False) + "\n")
    print(f"wrote {len(records)} synthetic examples to {args.output}")


if __name__ == "__main__":
    main()

