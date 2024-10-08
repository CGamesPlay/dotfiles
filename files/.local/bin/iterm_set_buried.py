#!/bin/sh
# Buries the session containing the calling process. Only works on the local
# system.
""""exec /Applications/iTerm.app/Contents/Resources/it2run "$(readlink -f "$0")" "$ITERM_SESSION_ID" "$@"
"""

import sys
import iterm2


async def main(connection):
    session_id = sys.argv[1].split(":", 1)[1]
    buried = (int(sys.argv[2]) != 0) if len(sys.argv) >= 3 else None
    app = await iterm2.async_get_app(connection)
    session = app.get_session_by_id(session_id)
    if buried is None:
        buried = session not in app.buried_sessions

    print(f"Set session {session_id} {buried=}")
    await session.async_set_buried(buried)


iterm2.run_until_complete(main)
# vim:ft=python
