#!/usr/bin/env python3

import asyncio
import iterm2

def set_color_preset(change, preset):
    """
    iTerm2's API lacks this functionality.
    """
    for value in preset.values:
        change._color_set(
            value.key,
            iterm2.color.Color(
                value.red,
                value.green,
                value.blue,
                value.alpha,
                value.color_space))

async def async_set_color_preset(connection, preset):
    """
    This updates the color scheme of all profiles and of all active sessions.
    """
    # Update the list of all profiles and iterate over them.
    profiles = await iterm2.PartialProfile.async_query(connection)
    for partial in profiles:
        # Fetch the full profile and then set the color preset in it.
        profile = await partial.async_get_full_profile()
        await profile.async_set_color_preset(preset)

    # Update all currently running sessions with the new preference.
    app = await iterm2.async_get_app(connection)
    for window in app.terminal_windows:
        for tab in window.tabs:
            for session in tab.sessions:
                profile = await session.async_get_profile()
                change = iterm2.LocalWriteOnlyProfile()
                set_color_preset(change, preset)
                await session.async_set_profile_properties(change)

async def async_handle_theme(connection, theme):
    if "dark" in theme:
        preset = await iterm2.ColorPreset.async_get(connection, "Solarized Dark")
    else:
        preset = await iterm2.ColorPreset.async_get(connection, "Solarized Light")

    await async_set_color_preset(connection, preset)

async def main(connection):
    app = await iterm2.async_get_app(connection)
    theme = await app.async_get_theme()
    await async_handle_theme(connection, theme)

    async with iterm2.VariableMonitor(connection, iterm2.VariableScopes.APP, "effectiveTheme", None) as mon:
        while True:
            # Block until theme changes
            joined_theme = await mon.async_get()
            theme = joined_theme.split(" ")
            await async_handle_theme(connection, theme)

iterm2.run_forever(main)
