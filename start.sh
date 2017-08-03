#!/bin/bash
if [ -f MHTimer.pid ]; then
  OLDPID=$( cat MHTimer.pid )
  echo "It looks like MHTimer is running already as $OLDPID"
  echo "Try killing it manually, using stop.sh, or remove MHTimer.pid"
  exit
fi
if [ -f MHTimer.log ]; then
  NUM=4
  while [ $NUM -ge 0 ]; do
    NEXTNUM=$(( $NUM + 1 ))
    if [ -f MHTimer.log.$NUM ]; then
      mv MHTimer.log.$NUM MHTimer.log.$NEXTNUM
    fi
    NUM=$(( $NUM - 1 ))
  done
  mv MHTimer.log MHTimer.log.0
fi
nohup node MHTimer.js > MHTimer.log 2>&1 &
PID=$!
echo $PID >MHTimer.pid
sleep 1
ps $PID
RC=$?
if [ $RC -eq 0 ]; then
  echo "Bot started as $PID"
else
  echo "Bot did not start. I thought it was ${PID}. Check MHTimer.log and remove MHTimer.pid"
fi
