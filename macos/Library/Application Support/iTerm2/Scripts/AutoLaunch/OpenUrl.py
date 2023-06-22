#!/usr/bin/env python3

"""
Custom control sequence to open a URL on the host computer. Usable to open URLs
over SSH. Example:

```bash
printf "\033]1337;Custom=id=%s:%s\a" "open-url" "https://localhost:8008/"
```
"""

import subprocess
import sys
import traceback

import iterm2

COMMAND = "open-url"
ALLOWED_URLS = r"^([a-zA-Z][-+.a-zA-Z]*):[!-~]+$"
SAFE_SCHEMES = set(["http", "https"])

async def main(connection):
    async with iterm2.CustomControlSequenceMonitor(connection, COMMAND, ALLOWED_URLS) as mon:
        while True:
            match = await mon.async_get()
            try:
                url = match.group(0)
                if match.group(1) not in SAFE_SCHEMES:
                    alert = iterm2.Alert("Open URL?", url)
                    alert.add_button("Open")
                    alert.add_button("Cancel")
                    btn = await alert.async_run(connection)
                    if btn != 1000:
                        print("User canceled open-url", url)
                        continue
                subprocess.run(["open", "-u", url])
            except:
                traceback.print_tb(sys.exc_info()[2])


iterm2.run_forever(main)
