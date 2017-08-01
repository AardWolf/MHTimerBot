#!/bin/bash
if [ -f MHTimer.pid ]; then
  OLDPID=$( cat MHTimer.pid )
  ps -${OLDPID} >/dev/null 2>&1
  RC=$?
  if [ $RC == 0 ]; then
    echo "Killing the old process: $OLDPID"
    kill $OLDPID
  else
    rm -f MHTimer.pid
    #Process is gone
  fi
else
  pkill -f "node MHTimer.js"
fi
