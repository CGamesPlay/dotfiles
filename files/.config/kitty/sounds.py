from os.path import expanduser
import glob
import subprocess
from kitty.boss import Boss
from kittens.tui.handler import result_handler

LIBRARIES = [
    expanduser("~/Seafile/General/Sounds/Nintendo/"),
    expanduser("~/Seafile/General/Sounds/"),
    "/System/Library/Sounds",
]

# printf '\eP@kitty-cmd{"cmd":"kitten","version":[0, 14, 2],"no_response":true,"payload":{"kitten":"sounds.py","args":["OOT_Fanfare_SmallItem"]}}\e\\'


def main(args: list[str]):
    pass


@result_handler(no_ui=True)
def handle_result(
    args: list[str], answer: str, target_window_id: int, boss: Boss
) -> None:
    filename = locate_sound(args[1])
    subprocess.Popen(["afplay", "-v", "0.5", filename])


def is_cmd_allowed(pcmd, window, from_socket, extra_data):
    return pcmd["cmd"] == "kitten" and pcmd["payload"]["kitten"] == "sounds.py"


def locate_sound(name):
    for d in LIBRARIES:
        for m in glob.iglob("%s/%s.*" % (d, glob.escape(name))):
            return m
        for m in glob.iglob("%s/%s" % (d, glob.escape(name))):
            return m
    raise ValueError("no matching sound found")
