#!/usr/bin/env python3

import asyncio
import iterm2
import subprocess
from os.path import expanduser
import glob
import sys
import traceback

COMMAND = "play-sound"
LIBRARIES = [
    expanduser("~/Seafile/General/Sounds/Nintendo/"),
    expanduser("~/Seafile/General/Sounds/"),
    "/System/Library/Sounds",
]

def locate_sound(name):
    for d in LIBRARIES:
        for m in glob.iglob("%s/%s.*" % (d, glob.escape(name))):
            return m
        for m in glob.iglob("%s/%s" % (d, glob.escape(name))):
            return m
    raise ValueError("no matching sound found")


# printf "\033]1337;Custom=id=%s:%s\a" "play-sound" "ding"
async def main(connection):
    async with iterm2.CustomControlSequenceMonitor(connection, COMMAND, r'^.*$') as mon:
        while True:
            match = await mon.async_get()
            try:
                filename = locate_sound(match.group(0))
                subprocess.run(["afplay", filename])
            except:
                traceback.print_tb(sys.exc_info()[2])


# This instructs the script to run the "main" coroutine and to keep running even after it returns.
iterm2.run_forever(main)
