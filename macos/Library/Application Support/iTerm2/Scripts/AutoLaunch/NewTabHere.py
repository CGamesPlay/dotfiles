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


async def main(connection: iterm2.connection.Connection):
    app = await iterm2.async_get_app(connection)

    # Fetch the user's shell. Note that non-fish shells may not support the -C argument.
    user_shell = get_user_shell()

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
        atenv = await session.async_get_variable("user.atEnv")
        if not atenv:
            # Not a remote environment, so we use iTerm's default behavior
            await window.async_create_tab()
            return

        directory = await session.async_get_variable("path")

        # Open the tab
        args = ["exec", "@env", "shell", atenv]
        if directory is not None:
            args += ["--chdir", directory]
        inner_command = " ".join(shellquote(a) for a in args)
        command = " ".join([user_shell, "-c", shellquote(inner_command)])

        profile = iterm2.profile.LocalWriteOnlyProfile()
        profile.set_use_custom_command("Yes")
        profile.set_command(command)
        profile.set_initial_directory_mode(
            iterm2.profile.InitialWorkingDirectory.INITIAL_WORKING_DIRECTORY_HOME
        )
        await window.async_create_tab(profile_customizations=profile)

    await new_tab_here.async_register(connection)


iterm2.run_forever(main)
