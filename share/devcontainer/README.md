# Devcontainer Template

This is a template providing a workspace root accessible via a devcontainer. To install, use `.argc create devcontainer TARGET`.

To get started, ensure that the devcontainer CLI is installed:

```
npm install -g @devcontainers/cli
ln -s $(npm -g config get prefix)/bin/devcontainer ~/.local/bin/devcontainer
```

Then use `argc devcontainer up` to build and start the container. Finally, use `argc devcontainer shell` to open a shell in the container.

Once inside the container, docker is available using docker-in-docker, and git is configured with SSH agent forwarding.

## Modifying the devcontainer setup

- Add [prebuilt features](https://containers.dev/features) that provide the necessary behavior.
- Write a script in `postCreateCommand`. The disadvantage of this method is that all `postCreateCommands` run in parallel, which can lead to `apt` locking issues.
- [Write a feature](https://containers.dev/implementors/features/) that provides the necessary behavior. The code can be stored inside the `.devcontainer` folder. This allows depending on other features, and allows providing a custom `install.sh`.
- Build from a custom Dockerfile.

## Connecting with VSCodium

Use the [Remote (OSS)](https://open-vsx.org/extension/xaberus/remote-oss) extension and the `vscodium-server` helper script included in my dotfiles to start a listening server. For example:

```bash
VSCODIUM_VERSION=$(vscodium-server version)
argc devcontainer shell vscodium-server start $VSCODIUM_VERSION
vscodum-server listen "argc devcontainer shell /home/vscode/.local/bin/vscodium-server connect $VSCODIUM_VERSION"
```

