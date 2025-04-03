#!/usr/bin/env python3

import os
import shlex
import subprocess
import sys
import traceback

import iterm2

COMMAND = "neovide"


# printf "\033]1337;Custom=id=%s:env=%s:dir=%s\a" "neovide" "env-name" "/path/to/dir"
# printf "\033]1337;Custom=id=%s:env=%s:dir=%s:filename=%s\a" "neovide" "env-name" "/path/to/dir" README.md
async def main(connection):
    async with iterm2.CustomControlSequenceMonitor(connection, COMMAND, r"^.*$") as mon:
        while True:
            match = await mon.async_get()
            try:
                env = None
                directory = None
                filename = None
                tmux = None

                for part in match.string.split(":"):
                    if part.startswith("env="):
                        env = part[4:]
                    elif part.startswith("dir="):
                        directory = part[4:]
                    elif part.startswith("filename="):
                        filename = part[9:]
                    elif part.startswith("tmux="):
                        tmux = part[5:]

                if env is None:
                    print("No env name given; skipping")
                    continue

                env_cmd = ["@env", "nvim"]
                if tmux:
                    env_cmd.append(f"--tmux={tmux}")
                if directory is not None:
                    env_cmd.append(f"--chdir={directory}")
                env_cmd.append(env)
                cmd = [
                    "open",
                    "-na",
                    "Neovide",
                    "--args",
                    "--neovim-bin=neovide",
                ]
                if filename:
                    cmd.append(filename)
                cmd += [
                    "--",
                    f"--prefix={shlex.join(env_cmd)}",
                ]
                print(cmd)
                subprocess.run(cmd, check=True, env={"NEOVIDE_LAUNCHER": "1"})
            except Exception:
                traceback.print_tb(sys.exc_info()[2])


# This instructs the script to run the "main" coroutine and to keep running even after it returns.
iterm2.run_forever(main)
