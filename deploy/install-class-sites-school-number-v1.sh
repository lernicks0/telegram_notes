#!/usr/bin/env bash
set -euo pipefail

PACKAGE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_ROOT="/root/class-sites-backup-school-number-v1"

if [ -e "$BACKUP_ROOT" ]; then
  echo "备份目录已存在：$BACKUP_ROOT"
  echo "为防止覆盖旧备份，安装已经停止。"
  exit 1
fi

mkdir -p /root/class-auth /root/pk /root/sco /root/cla /root/goal "$BACKUP_ROOT"

for process_name in class-auth pk-server sco-server cla-server goal-server; do
  if pm2 describe "$process_name" >/dev/null 2>&1; then
    pm2 stop "$process_name" >/dev/null
  fi
done

for data_file in \
  /root/class-auth/accounts.json \
  /root/class-auth/sessions.json \
  /root/class-auth/roster.json \
  "/root/pk/803班擂台赛数据.json" \
  /root/pk/pk-analysis.json \
  /root/pk/lock-state.json \
  /root/sco/sco-data.json \
  /root/goal/goal-data.json
do
  if [ -e "$data_file" ]; then
    cp -a -- "$data_file" "$BACKUP_ROOT/"
  fi
done

cp -a "$PACKAGE_ROOT"/class-auth/*.js /root/class-auth/
cp -a "$PACKAGE_ROOT"/pk/pk.html "$PACKAGE_ROOT"/pk/server.js "$PACKAGE_ROOT"/pk/logo-803-pk-tech-v3.png /root/pk/
cp -a "$PACKAGE_ROOT"/sco/index.html "$PACKAGE_ROOT"/sco/server.js /root/sco/
cp -a "$PACKAGE_ROOT"/cla/index.html "$PACKAGE_ROOT"/cla/server.js /root/cla/
cp -a "$PACKAGE_ROOT"/goal/index.html "$PACKAGE_ROOT"/goal/server.js /root/goal/

printf '14\n22\n' | node /root/class-auth/init-private-roster.js
chmod 600 /root/class-auth/accounts.json /root/class-auth/roster.json

read -r -s -p "请设置老师账号 ls 的新密码: " CLASS_TEACHER_PASS
echo
printf '%s' "$CLASS_TEACHER_PASS" | node /root/class-auth/manage.js set-password ls
unset CLASS_TEACHER_PASS

if pm2 describe class-auth >/dev/null 2>&1; then
  pm2 restart class-auth >/dev/null
else
  pm2 start /root/class-auth/server.js --name class-auth --cwd /root/class-auth >/dev/null
fi

if pm2 describe pk-server >/dev/null 2>&1; then
  pm2 restart pk-server >/dev/null
else
  pm2 start /root/pk/server.js --name pk-server --cwd /root/pk >/dev/null
fi

if pm2 describe sco-server >/dev/null 2>&1; then
  pm2 restart sco-server >/dev/null
else
  pm2 start /root/sco/server.js --name sco-server --cwd /root/sco >/dev/null
fi

if pm2 describe cla-server >/dev/null 2>&1; then
  pm2 restart cla-server >/dev/null
else
  pm2 start /root/cla/server.js --name cla-server --cwd /root/cla >/dev/null
fi

if pm2 describe goal-server >/dev/null 2>&1; then
  pm2 restart goal-server >/dev/null
else
  pm2 start /root/goal/server.js --name goal-server --cwd /root/goal >/dev/null
fi

pm2 save >/dev/null

echo "部署完成。学生使用学号 1～52 登录，老师使用 ls。"
echo "备份目录：$BACKUP_ROOT"
pm2 status
