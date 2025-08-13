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
                atenv_name = None
                directory = None
                filename = None

                for part in match.string.split(":"):
                    if part.startswith("env="):
                        atenv_name = part[4:]
                    elif part.startswith("dir="):
                        directory = part[4:]
                    elif part.startswith("filename="):
                        filename = part[9:]

                if atenv_name is None:
                    print("No env name given; skipping")
                    continue

                atenv_cmd = ["@env", "nvim"]
                if directory is not None:
                    atenv_cmd.append(f"--chdir={directory}")
                atenv_cmd.append(atenv_name)
                cmd = [
                    "open",
                    "-na",
                    "Neovide",
                    "--args",
                    "--wsl",
                    "--neovim-bin=neovide",
                ]
                if filename:
                    cmd.append(filename)
                cmd += [
                    "--",
                    f"--prefix={shlex.join(atenv_cmd)}",
                ]
                print(cmd)
                subprocess.run(cmd, check=True, env={"NEOVIDE_LAUNCHER": "1"})
            except Exception:
                traceback.print_tb(sys.exc_info()[2])


# This instructs the script to run the "main" coroutine and to keep running even after it returns.
iterm2.run_forever(main)
