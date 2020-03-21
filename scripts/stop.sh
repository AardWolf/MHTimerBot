#!/bin/bash
if [ -f MHTimer.pid ]; then
  OLDPID=$( cat MHTimer.pid )
  rm -f MHTimer.pid
  ps -p $OLDPID 1>/dev/null
  RC=$?
  if [ $RC -eq 0 ]; then
    echo "Killing the old process: PID $OLDPID"
    kill $OLDPID
    exit $?
  fi
fi
pkill -f "node src/MHTimer.js"
