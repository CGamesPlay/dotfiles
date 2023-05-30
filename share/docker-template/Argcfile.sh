#!/usr/bin/env bash

set -eu

# @cmd Start all services
#
# Modify this function so that it does the appropriate thing for this project.
start() {
    _compose up -d
}

# @cmd Run docker-compose for the workspace
# @arg command+ Arguments to docker-compose
compose() {
    _compose "${argc_command[@]}"
}

_compose() {
    project=$(basename "$(pwd)")
    docker-compose -p "$project" -f local/docker-compose.yml "$@"
}

eval "$(argc --argc-eval "$0" "$@")"
