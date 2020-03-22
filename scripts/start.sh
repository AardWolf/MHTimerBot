#!/bin/bash
SILENT=0
while getopts 'q' opt ; do
  case $opt in
    q) SILENT=1
       ;;
  esac
done

if [ -f MHTimer.pid ]; then
  OLDPID=$( cat MHTimer.pid )
  ps -p $OLDPID >/dev/null 2>&1
  rc=$?
  if [[ $rc -eq 1 ]]; then
    echo "Old process was not running, starting up"
    rm -f MHTimer.pid
  else
    if [[ $SILENT -eq 0 ]]; then
      echo "It looks like MHTimer is running already as $OLDPID"
      echo "Try killing it manually, using stop.sh, or remove MHTimer.pid"
    fi
    exit 1
  fi
fi
if [ ! -d logs ]; then
  mkdir logs
fi
if [ -f logs/MHTimer.log ]; then
  NUM=4
  while [ $NUM -ge 0 ]; do
    NEXTNUM=$(( $NUM + 1 ))
    if [ -f logs/MHTimer.$NUM.log ]; then
      mv logs/MHTimer.$NUM.log logs/MHTimer.$NEXTNUM.log
    fi
    NUM=$(( $NUM - 1 ))
  done
  mv logs/MHTimer.log logs/MHTimer.0.log
fi
nohup node src/MHTimer.js > logs/MHTimer.log 2>&1 &
PID=$!
echo $PID >MHTimer.pid
sleep 1
ps $PID | grep -q "\b${PID}\b"
RC=$?
if [ $RC -eq 0 ]; then
  echo "Bot started with PID $PID"
else
  echo "Bot did not start. I thought it was PID ${PID}. Check MHTimer.log and remove MHTimer.pid"
  exit 1
fi
