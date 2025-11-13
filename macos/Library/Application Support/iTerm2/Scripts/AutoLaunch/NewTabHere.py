#!/usr/bin/env python3

import iterm2
import os
import subprocess
import re


def get_user_shell():
    result = subprocess.run(
        ["dscl", ".", "-read", os.path.expanduser("~"), "UserShell"],
        check=True,
        capture_output=True,
    )
    shell_path = result.stdout.decode().strip().split(": ")[1]
    return shell_path


def shellquote(s: str) -> str:
    # Fish would give a syntax error on shlex.quote("\\'")
    # Instead, translate `'` -> `'\''` and `\` -> `'\\'`.
    if re.search(r"[^-a-zA-Z0-9_]", s) is None:
        return s
    return (
        "'"
        + s.replace("\0", "\0\0")
        .replace("'", "\0'")
        .replace("\\", "\0\\")
        .replace("\0\\", "'\\\\'")
        .replace("\0'", "'\\''")
        .replace("\0\0", "\0")
        + "'"
    )


def shelljoin(args: list[str]) -> str:
    return " ".join(shellquote(a) for a in args)


user_shell = get_user_shell()


async def main(connection: iterm2.connection.Connection):
    app = await iterm2.async_get_app(connection)

    @iterm2.RPC
    async def new_tab_here(session_id=iterm2.Reference("id?")):
        if not session_id:
            # No active session -> create a new window
            await iterm2.Window.async_create(connection)
            return

        session = app.get_session_by_id(session_id)
        if not session:
            return
        window = session.window
        assert window is not None

        # What tab should we create?
        directory = await session.async_get_variable("path")

        if atrium := await session.async_get_variable("user.atrium"):
            is_machine = atrium.startswith("machine:")
            if is_machine:
                atrium = atrium[8:]
            await run_with_atrium(window, is_machine, atrium, directory)
        elif atenv := await session.async_get_variable("user.atEnv"):
            await run_with_atenv(window, atenv, directory)
        else:
            # Not a remote environment, so we use iTerm's default behavior
            await window.async_create_tab()

    await new_tab_here.async_register(connection)


async def run_with_atrium(window, is_machine, name, directory):
    args = ["exec", "atrium"]
    if is_machine:
        args += ["machine", "shell", name]
    else:
        args += ["shell", name]
    if directory is not None:
        args += ["--chdir", directory]
    await open_tab_with(window, args)


async def run_with_atenv(window, atenv, directory):
    args = ["exec", "@env", "shell", atenv]
    if directory is not None:
        args += ["--chdir", directory]
    await open_tab_with(window, args)


async def open_tab_with(window, args):
    command = shelljoin([user_shell, "-c", shelljoin(args)])

    profile = iterm2.profile.LocalWriteOnlyProfile()
    profile.set_use_custom_command("Yes")
    profile.set_command(command)
    profile.set_initial_directory_mode(
        iterm2.profile.InitialWorkingDirectory.INITIAL_WORKING_DIRECTORY_HOME
    )
    await window.async_create_tab(profile_customizations=profile)


iterm2.run_forever(main)
