#!/usr/bin/env -S uv run
# /// script
# requires-python = ">=3.11"
# dependencies = [
#   "httpx",
# ]
# ///
"""Print key details about forked repositories."""

import argparse
import asyncio
import os
import re
import sys
from datetime import datetime

import httpx

GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN")


async def get_json(client, url):
    response = await client.get(url)
    response.raise_for_status()
    return response.json()


async def get_latest_commit(client, repo, branch):
    data = await get_json(client, f"https://api.github.com/repos/{repo}/commits/{branch}")
    sha = data["sha"][:7]
    date_str = data["commit"]["committer"]["date"]
    date = datetime.fromisoformat(date_str.replace("Z", "+00:00")).strftime("%Y-%m-%d")
    return sha, date


async def get_ci_status(client, repo, branch):
    data = await get_json(client, f"https://api.github.com/repos/{repo}/actions/runs?branch={branch}&per_page=1")
    runs = data.get("workflow_runs", [])

    if not runs:
        return "N/A"

    run = runs[0]
    conclusion = run.get("conclusion") or "pending"
    url = run["html_url"]
    return "\033]8;;{}\033\\{}\033]8;;\033\\".format(url, conclusion)


async def get_divergence(client, repo, repo_data):
    parent = repo_data.get("parent")
    if not parent:
        return None

    parent_owner = parent["owner"]["login"]
    parent_branch = parent["default_branch"]
    fork_owner, fork_repo = repo.split("/")
    fork_branch = repo_data["default_branch"]

    compare = await get_json(
        client,
        f"https://api.github.com/repos/{fork_owner}/{fork_repo}/compare/{parent_owner}:{parent_branch}...{fork_branch}",
    )
    return "+{} -{}".format(compare["ahead_by"], compare["behind_by"])


async def get_repo_row(client, repo):
    repo_data = await get_json(client, f"https://api.github.com/repos/{repo}")
    branch = repo_data["default_branch"]

    (sha, date), ci, divergence = await asyncio.gather(
        get_latest_commit(client, repo, branch),
        get_ci_status(client, repo, branch),
        get_divergence(client, repo, repo_data),
    )
    return [repo, sha, date, ci, divergence]


def strip_ansi(text):
    text = str(text)
    # Remove OSC 8 hyperlink sequences: ESC]8;;URL ESC\ and ESC]8;; ESC\
    text = re.sub(r'\x1b\]8;;[^\x1b]*\x1b\\', '', text)
    text = re.sub(r'\x1b\[[0-9;]*m', '', text)
    return text


def print_table(table, headers):
    col_widths = [len(h) for h in headers]
    for row in table:
        for i, cell in enumerate(row):
            col_widths[i] = max(col_widths[i], len(strip_ansi(str(cell))))

    print(" | ".join(h.ljust(col_widths[i]) for i, h in enumerate(headers)))
    print("-+-".join("-" * w for w in col_widths))

    for row in table:
        cells = []
        for i, cell in enumerate(row):
            cell_str = str(cell)
            cells.append(cell_str + " " * (col_widths[i] - len(strip_ansi(cell_str))))
        print(" | ".join(cells))


async def main():
    parser = argparse.ArgumentParser(description="Print key details about forked repositories.")
    parser.add_argument("repos", nargs="+", metavar="OWNER/REPO")
    args = parser.parse_args()

    if not GITHUB_TOKEN:
        print("Error: GITHUB_TOKEN environment variable not set", file=sys.stderr)
        sys.exit(1)

    headers_map = {
        "Authorization": f"token {GITHUB_TOKEN}",
        "Accept": "application/vnd.github.v3+json",
    }

    async with httpx.AsyncClient(headers=headers_map) as client:
        results = await asyncio.gather(
            *[get_repo_row(client, repo) for repo in args.repos],
            return_exceptions=True,
        )

    table = []
    for repo, result in zip(args.repos, results):
        if isinstance(result, Exception):
            print(f"Error processing {repo}: {result}", file=sys.stderr)
            table.append([repo, "ERROR", "ERROR", "ERROR", "ERROR"])
        else:
            table.append(result)

    print_table(table, ["Repo", "SHA", "Date", "CI", "Upstream"])


if __name__ == "__main__":
    asyncio.run(main())
