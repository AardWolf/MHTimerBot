#!/bin/bash
if [ -f MHTimer.pid ]; then
  OLDPID=$( cat MHTimer.pid )
  echo "It looks like MHTimer is running already as $OLDPID"
  echo "Try killing it manually, using stop.sh, or remove MHTimer.pid"
  exit
fi
nohup node MHTimer.js > MHTimer.log 2>&1 &
echo $! >MHTimer.pid
