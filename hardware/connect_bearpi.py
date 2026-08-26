#!/usr/bin/env python3
"""Start the BearPi E53_IA1 -> server live telemetry path in one command.

The board remains connected over its USB serial adapter.  This launcher opens
an SSH local-forward to the server's loopback MQTT broker and then starts the
existing :mod:`bearpi_e53_bridge` process.  SSH keeps its normal stdin/stdout,
so the password (and an optional first-use host-key confirmation) is entered
interactively and is never stored in the repository or the process arguments.

Typical use from the repository root::

    py hardware/connect_bearpi.py --port COM5 --plot-id plot-a01

Press Ctrl+C once to stop the bridge; the launcher then closes the SSH tunnel.
"""

from __future__ import annotations

import argparse
import shutil
import socket
import subprocess
import sys
import time
from pathlib import Path


DEFAULT_SSH_HOST = "connect.westd.seetacloud.com"
DEFAULT_SSH_PORT = 22602
DEFAULT_SSH_USER = "root"
DEFAULT_REMOTE_MQTT_PORT = 1883
DEFAULT_LOCAL_MQTT_PORT = 1884


def _is_port_open(host: str, port: int, timeout: float = 0.5) -> bool:
    """Return whether a TCP listener is accepting connections."""

    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def _wait_for_port(process: subprocess.Popen[bytes] | None, host: str, port: int, timeout: float) -> bool:
    """Wait for the forwarded MQTT port, failing early if SSH exits."""

    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if _is_port_open(host, port):
            return True
        if process is not None and process.poll() is not None:
            return False
        time.sleep(0.25)
    return _is_port_open(host, port)


def _stop_process(process: subprocess.Popen[bytes] | None) -> None:
    """Terminate a child process without hiding a normal shutdown."""

    if process is None or process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=5)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="一条命令启动 BearPi E53_IA1 串口到服务器 MQTT 的实时桥接"
    )
    parser.add_argument("--port", default="COM5", help="板卡串口，例如 COM5 或 /dev/ttyUSB0")
    parser.add_argument("--baud", type=int, default=115200, help="串口波特率，默认 115200")
    parser.add_argument("--serial-timeout", type=float, default=1.0)
    parser.add_argument("--farm-id", default="farm-demo")
    parser.add_argument("--plot-id", default="plot-a01")
    parser.add_argument("--device-id", default="bearpi-e53-ia1-a01")
    parser.add_argument("--ssh-host", default=DEFAULT_SSH_HOST)
    parser.add_argument("--ssh-port", type=int, default=DEFAULT_SSH_PORT)
    parser.add_argument("--ssh-user", default=DEFAULT_SSH_USER)
    parser.add_argument("--remote-mqtt-port", type=int, default=DEFAULT_REMOTE_MQTT_PORT)
    parser.add_argument("--local-mqtt-port", type=int, default=DEFAULT_LOCAL_MQTT_PORT)
    parser.add_argument(
        "--reuse-tunnel",
        action="store_true",
        help="复用已经监听本地 MQTT 端口的 SSH 隧道，不再启动新的隧道",
    )
    parser.add_argument("--wait-timeout", type=float, default=30.0, help="等待隧道建立的秒数")
    parser.add_argument("--once", action="store_true", help="收到至少一个指标后退出（仅用于连通性测试）")
    parser.add_argument("--dry-run", action="store_true", help="只打印将执行的命令，不连接设备")
    return parser


def _ssh_command(args: argparse.Namespace, ssh_executable: str) -> list[str]:
    forward = f"{args.local_mqtt_port}:127.0.0.1:{args.remote_mqtt_port}"
    return [
        ssh_executable,
        "-p",
        str(args.ssh_port),
        "-o",
        "ExitOnForwardFailure=yes",
        "-o",
        "ServerAliveInterval=30",
        "-L",
        forward,
        "-N",
        f"{args.ssh_user}@{args.ssh_host}",
    ]


def _bridge_command(args: argparse.Namespace, root: Path) -> list[str]:
    command = [
        sys.executable,
        str(root / "hardware" / "bearpi_e53_bridge.py"),
        "--port",
        args.port,
        "--baud",
        str(args.baud),
        "--serial-timeout",
        str(args.serial_timeout),
        "--mqtt",
        "--mqtt-host",
        "127.0.0.1",
        "--mqtt-port",
        str(args.local_mqtt_port),
        "--farm-id",
        args.farm_id,
        "--plot-id",
        args.plot_id,
        "--device-id",
        args.device_id,
    ]
    if args.once:
        command.append("--once")
    return command


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    root = Path(__file__).resolve().parents[1]
    bridge_path = root / "hardware" / "bearpi_e53_bridge.py"
    if not bridge_path.is_file():
        print(f"找不到桥接器：{bridge_path}", file=sys.stderr)
        return 2
    if args.local_mqtt_port <= 0 or args.remote_mqtt_port <= 0:
        print("MQTT 端口必须是正数", file=sys.stderr)
        return 2

    ssh_executable = shutil.which("ssh")
    if not ssh_executable:
        print("找不到 ssh；请安装 OpenSSH Client 并确保 ssh 在 PATH 中", file=sys.stderr)
        return 2

    ssh_command = _ssh_command(args, ssh_executable)
    bridge_command = _bridge_command(args, root)
    if args.dry_run:
        print("SSH:", subprocess.list2cmdline(ssh_command) if sys.platform == "win32" else " ".join(ssh_command))
        print("BRIDGE:", subprocess.list2cmdline(bridge_command) if sys.platform == "win32" else " ".join(bridge_command))
        return 0

    local_host = "127.0.0.1"
    existing_tunnel = _is_port_open(local_host, args.local_mqtt_port)
    if existing_tunnel and not args.reuse_tunnel:
        print(
            f"本地端口 {args.local_mqtt_port} 已被占用。若它就是本项目 SSH 隧道，请加 --reuse-tunnel；"
            "否则先关闭占用该端口的程序。",
            file=sys.stderr,
        )
        return 2

    ssh_process: subprocess.Popen[bytes] | None = None
    try:
        if existing_tunnel:
            print(f"复用本地 MQTT 隧道 127.0.0.1:{args.local_mqtt_port}", flush=True)
        else:
            print(
                f"正在建立 SSH 隧道：本机 {args.local_mqtt_port} -> "
                f"{args.ssh_host}:{args.remote_mqtt_port}（请在提示时输入 SSH 密码）",
                flush=True,
            )
            # Inherit the console deliberately: SSH handles password and host
            # key prompts securely without putting credentials in this script.
            ssh_process = subprocess.Popen(ssh_command, cwd=root)
            if not _wait_for_port(ssh_process, local_host, args.local_mqtt_port, args.wait_timeout):
                code = ssh_process.poll()
                print(f"SSH 隧道未建立（退出码 {code}）。请检查地址、端口、密码和服务器 MQTT。", file=sys.stderr)
                return 1

        print(
            f"已连接隧道；开始读取 {args.port} @ {args.baud}，发布到 "
            f"agri/{args.farm_id}/{args.plot_id}/telemetry",
            flush=True,
        )
        return subprocess.call(bridge_command, cwd=root)
    except KeyboardInterrupt:
        print("\n收到 Ctrl+C，正在关闭串口桥接和 SSH 隧道…", file=sys.stderr)
        return 130
    finally:
        _stop_process(ssh_process)
        if ssh_process is not None:
            print("SSH 隧道已关闭。", file=sys.stderr)


if __name__ == "__main__":
    raise SystemExit(main())
