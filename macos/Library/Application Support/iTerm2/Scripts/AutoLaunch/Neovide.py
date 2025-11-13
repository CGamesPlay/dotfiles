#!/usr/bin/env python3

import shlex
import subprocess
import sys
import traceback
import asyncio

import iterm2

COMMAND = "neovide"

tasks = {}


# printf "\033]1337;Custom=id=%s:\a" "neovide"
# printf "\033]1337;Custom=id=%s:filename=%s\a" "neovide" README.md
async def main(connection):
    app = await iterm2.async_get_app(connection)
    asyncio.create_task(monitor_termination(connection))
    async with iterm2.EachSessionOnceMonitor(app) as mon:
        while True:
            session_id = await mon.async_get()
            task = asyncio.create_task(monitor(app, connection, session_id))
            tasks[session_id] = task


async def monitor(app, connection, session_id):
    async with iterm2.CustomControlSequenceMonitor(
        connection, COMMAND, r"^.*$", session_id
    ) as mon:
        session = app.get_session_by_id(session_id)
        if not session:
            return

        while True:
            match = await mon.async_get()
            try:
                filename = None

                for part in match.string.split(":"):
                    if part.startswith("filename="):
                        filename = part[9:]

                directory = await session.async_get_variable("path")

                if atrium := await session.async_get_variable("user.atrium"):
                    is_machine = atrium.startswith("machine:")
                    if is_machine:
                        atrium = atrium[8:]
                    run_with_atrium(is_machine, atrium, directory, filename)
                elif atenv := await session.async_get_variable("user.atEnv"):
                    run_with_atenv(atenv, directory, filename)

            except Exception:
                traceback.print_tb(sys.exc_info()[2])


async def monitor_termination(connection):
    global tasks
    async with iterm2.SessionTerminationMonitor(connection) as mon:
        while True:
            session_id = await mon.async_get()
            task = tasks[session_id]
            del tasks[session_id]
            task.cancel()
            await task


def run_with_atrium(is_machine, name, directory, filename):
    args = [f"--atrium-dir={directory}"]
    if is_machine:
        args += [f"--atrium-machine={name}"]
    else:
        args += [f"--atrium-workspace={name}"]
    if filename:
        args += ["--", filename]
    run_neovide("atrium-nvim", args)


def run_with_atenv(atenv_name, directory, filename):
    atenv_cmd = ["@env", "nvim"]
    if directory is not None:
        atenv_cmd.append(f"--chdir={directory}")
    atenv_cmd.append(atenv_name)
    args = [f"--prefix={shlex.join(atenv_cmd)}"]
    if filename:
        args += ["--", filename]
    run_neovide("neovide", args, {"NEOVIDE_LAUNCHER": "1"})


def run_neovide(neovim_bin, args, env={}):
    cmd = [
        "open",
        "-na",
        "Neovide",
        "--args",
        "--wsl",
        f"--neovim-bin={neovim_bin}",
        "--",
    ]
    cmd += args
    print(cmd)
    subprocess.run(cmd, check=True, env=env)


iterm2.run_forever(main)
