#!/usr/bin/env python3

import subprocess
import sys
import traceback
import shlex

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

                for part in match.string.split(":"):
                    if part.startswith("env="):
                        env = part[4:]
                    elif part.startswith("dir="):
                        directory = part[4:]
                    elif part.startswith("filename="):
                        filename = part[9:]

                if env is None:
                    print("No env name given; skipping")

                nvim_cmd = (
                    f"@env nvim --chdir={shlex.quote(directory)} {shlex.quote(env)}"
                )
                neovide_cmd = [
                    "open",
                    "-na",
                    "Neovide",
                    "--args",
                    f"--neovim-bin={nvim_cmd}",
                ]
                if filename:
                    neovide_cmd.append(filename)
                print(neovide_cmd)
                subprocess.run(neovide_cmd, check=True)
            except Exception:
                traceback.print_tb(sys.exc_info()[2])


# This instructs the script to run the "main" coroutine and to keep running even after it returns.
iterm2.run_forever(main)
