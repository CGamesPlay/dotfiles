#!/bin/bash

cat >/etc/initramfs-tools/scripts/init-premount/hbv-mdadm <<EOF
# Hetzner Bootable Volume mdadm preparation script
pre_mount() {
	mdadm --build /dev/md0 --level=1 --force --raid-devices=1 --write-mostly /dev/disk/by-partuuid/$(findmnt -no partuuid /)
}

case "$1" in
    prereqs)
        exit 0
        ;;
    *)
        pre_mount
        ;;
esac
EOF
chmod +x /etc/initramfs-tools/scripts/init-premount/hbv-mdadm

update-initramfs -u

sed -i -e 's@\(root=\)[^ ]*@\1/dev/md0@g' /boot/hbv-kexec

cat >/usr/local/sbin/hbv-ephemeral-drive <<'EOF'
#!/bin/bash
# Hetzner Bootable Volume ephemeral drive formatter (RAID1)
set -eux

if [ ! -b /dev/sda2 ]; then
	RAID_SIZE=$(lsblk -bno size /dev/md0)
	RAID_SECTORS=$((RAID_SIZE / 512))

	sgdisk /dev/sda -e
	sgdisk /dev/sda -n 0:0:+4G -t 0:8200 -c 0:swap -n 0:0:+$RAID_SECTORS -t 0:fd00 -c 0:mirror -n 0:0:0 -t 0:8300 -c 0:ephemeral
	udevadm settle

	mkswap /dev/disk/by-partlabel/swap
	mkfs.ext4 /dev/disk/by-partlabel/ephemeral
fi

swapon /dev/disk/by-partlabel/swap

mkdir -p /mnt/media/ephemeral
chmod 01777 /mnt/media/ephemeral
mount /dev/disk/by-partlabel/ephemeral /mnt/media/ephemeral

mdadm --grow /dev/md0 --raid-devices=2 --add /dev/disk/by-partlabel/mirror
EOF
chmod +x /usr/local/sbin/hbv-ephemeral-drive
