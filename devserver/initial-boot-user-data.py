#!/usr/bin/env python3

import gzip
import os
import subprocess
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import yaml


def file(path):
    with open(path, "r") as f:
        return f.read()


def write_file(path, content, permissions):
    compressed = gzip.compress(content.encode("utf-8"))
    encoding = None
    if len(compressed) < len(content):
        content = compressed
        encoding = "gzip"
    return {
        "path": path,
        "content": content,
        "permissions": permissions,
        "encoding": encoding,
    }


ssh_keys = (
    subprocess.run(["ssh-add", "-L"], capture_output=True, check=True)
    .stdout.decode("utf-8")
    .splitlines()
)

user_data = {
    "disable_root": True,
    "ssh_pwauth": False,
    "chpasswd": {
        "expire": False,
        "list": [],
    },
    "user": {
        "name": "ubuntu",
        "groups": ["adm", "docker"],
        "ssh_authorized_keys": ssh_keys,
        # Consider switching to https://lorier.net/docs/ssh-agent-sudo.html
        "sudo": "ALL=(ALL) NOPASSWD:ALL",
    },
    "users": {
        "root": {
            "lock_passwd": True,
        },
    },
    "ntp": {
        "enabled": True,
    },
    "timezone": "UTC",
    "package_update": True,
    "packages": [
        "direnv",
        "docker.io",
        "docker-compose-v2",
        "hcloud-cli",
        "jq",
        "net-tools",
        "python3",
        "python3-pip",
        "python3-venv",
        "restic",
        "unzip",
    ],
    "write_files": [
        write_file(
            "/etc/hbv-self-destruct.env",
            f"HCLOUD_TOKEN={os.environ['HCLOUD_TOKEN']}",
            "0600",
        ),
    ],
}

msg = MIMEMultipart()
msg.attach(MIMEText(yaml.dump(user_data), "cloud-config"))
msg.attach(MIMEText(file("scripts/install-ansible.sh"), "x-shellscript"))
msg.attach(MIMEText(file("scripts/enable-raid1.sh"), "x-shellscript"))
print(msg.as_string())
