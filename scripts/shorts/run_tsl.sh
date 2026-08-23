#!/bin/bash
cd "C:/Users/leesc/Documents/allthatai-real/scripts/shorts"
export SP="C:/Users/leesc/AppData/Local/Temp/claude/c--Users-leesc-Documents-ThinkU-AllThatFinder/6eb66474-56a7-4919-ba5a-a018536821d4/scratchpad"
export HF_HOME="D:/hf_cache"; export PYTHONIOENCODING=utf-8
export YT_TOKEN_FILE=yt_token2.json
PY="E:/venvs/sd/Scripts/python.exe"
run(){ echo "=== $1 ==="; "$PY" dual_publish.py "$1" "$2" --yt public --ig 2>&1 | grep -E "\[yt\]|\[ig\]|OK |실패|rror|quota" | tail -6; echo "--- rc=${PIPESTATUS[0]} ---"; }
run t_cybercab.json money
run t_byd.json money
echo "=========== TSL BATCH DONE ==========="
