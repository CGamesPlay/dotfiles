# Private development server

This directory contains scripts to create a private development server with automatic shutdown capabilities (a.k.a. scale-to-zero). Basically, we create a persistent cloud volume with Linux installed, which we boot on an ephemeral server which is deleted when not in use.

## Personal usage

If you are me, you probably want to use `argc create-hbv`, which does everything automatically (creates the volume, installs the self-destruct script, and enables RAID1). If not, keep reading.

## Basic usage

The basic process for creating a bootable volume:

```bash
hcloud volume create --size=50 --location=nbg1 --name=my-server
./hetzner-bootable-volume prepare-volume my-server
```

This will create a server with the volume attached, copy the base image's linux onto the drive, and perform some configuration. **Only tested and likely dependent on Ubuntu 22.04 (the default image type).**

Once the volume is created, you can create a server booting from it:

```bash
./hetzner-bootable-volume boot --type cpx51 my-server
```

See `./hetzner-bootable-volume boot --help` for a full list of options.

The basic bootable volume that is created with this command does not include self-destruction capabilities, but it's safe to manually delete the server created when you are done using it, then use the same command to create a new server later on booting from the same volume.

## Self-destruct / Auto-shutdown

The self-destruct capability it tied to my dotfiles, but it's possible to use independently. There are 2 components:

- `hbv-self-destruct` is responsible for deleting the server when a "poweroff" is executed.
- `hbv-auto-shutdown` monitors for activity and issues a "poweroff" after 2 hours of inactivity (SSH and X sessions)

Each of these has a script (in the `scripts` directory) and a systemd unit (in `ansible-site.yml`). To use, install the 4 files (2 scripts, 2 units), enable the units (`sudo systemctl enable hbv-auto-shutdown`, etc.), and configure the Hetzner cloud token:

```bash
echo "HCLOUD_TOKEN=$MY_HETZNER_TOKEN" > /etc/hbv-self-destruct.env
chmod 600 /etc/hbv-self-destruct.env
```

I recommend creating a new project with a new API key in Hetzner Cloud specifically for your dev server. By using a separate project, you prevent a compromised server from being able to affect your other projects.

## Improving performance with RAID1

If you run `scripts/enable-raid1.sh` on a bootable volume, then delete the server and boot on a new one, the image will configure the local drive as a RAID1 mirror of the cloud volume. Benchmarks suggest that cloud volumes can maintain about 300 MiB/s of throughput, while local disks can achieve 700 MiB/s or more. The RAID1 setup allows you to achieve 700 MiB/s read throughput and 300 MiB/s of write throughput. This feature requires that you choose instance types with drives larger than the cloud volume (generally at least 10 GiB larger).

If everything is working, you should see something like the following:

```bash
$ cat /proc/mdstat
Personalities : [linear] [multipath] [raid0] [raid1] [raid6] [raid5] [raid4] [raid10]
md0 : active raid1 sda3[1] sdb1[0](W)
      157285359 blocks super non-persistent [2/1] [U_]
      [===>.................]  recovery = 17.7% (27984768/157285359) finish=10.5min speed=203862K/sec

unused devices: <none>
```

## How does this work?

We create a persistent cloud storage volume and install Linux on it. To boot into it, we create a new server with a standard image and a simple user-data script that kexec's into the kernel installed on the persistent volume.

- **Why not just snapshot the server and restore from snapshot?** Snapshots are not preferred in general because they are immutable. This would require managing rolling snapshots of the volumes and clean dangling snapshots. Also, restoring a snapshot is significantly slower than booting from a stock image with an attached cloud volume.
- **Why not just boot directly from the cloud volume?** This would require a (very small) snapshot that contained just the Grub boot loader. However, Grub is unable to see the Hetzner cloud volume, for unknown reasons.

## Automatic backups with Restic

The Ansible playbook also sets up a service to perform Restic backups for the drive, although it is disabled by default. Only `/home/ubuntu` is backed up; this is set in the systemd unit file.

To enable it, configure the restic options in `/etc/restic/restic.conf`, then follow these steps:

```bash
# Initial setup steps after configuring /etc/restic/restic.conf
sudo su
set -a; . /etc/restic/restic.conf; set +a
restic init
systemctl start restic-backup
systemctl status restic-backup # Verify that it succeeded
restic snapshots # More verification
sudo systemctl enable --now restic-backup.timer
```

## Migrating Hetzner Cloud Volumes

Hetzner does not provide any built-in facility to migrate cloud volumes between datacenters. It is possible to manually clone a volume into a new region.

```bash
# Step 1. Create the destination volume
hcloud volume create --name dst --size $SAME_SIZE_OR_LARGER --location hil
# Step 2. Create a server in each region with the volume attached
hcloud server create --name transfer-src --type cpx21 --location nbg --image ubuntu-22.04 --volume src
hcloud server create --name transfer-dst --type cpx21 --location hil --image ubuntu-22.04 --volume hil
# Step 3. On the source machine, send the file (ideally in screen)
pv /dev/sdb | gzip -c | age --passphrase | socat -u STDIN TCP-LISTEN:32456,reuseaddr
# Step 4. On the destination machine, receive the file (ideally in screen)
socat -u TCP:$SOURCE_IP:32456 STDOUT | age --decrypt | gunzip -c | pv > /dev/sdb
```

When I revisit this, I will probably simplify to just use SSH to do the transfer instead of socat. The bandwidth will be limited by the cloud volume throughput, in any case. It may be worth investigating something that is designed for file transfers and supports resume, as well.
