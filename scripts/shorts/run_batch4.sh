#!/bin/bash
cd "/c/Users/leesc/Documents/allthatai-real/scripts/shorts"
export SP="C:/Users/leesc/AppData/Local/Temp/claude/c--Users-leesc-Documents-ThinkU-AllThatFinder/6eb66474-56a7-4919-ba5a-a018536821d4/scratchpad"
export HF_HOME="D:/hf_cache"
export PYTHONIOENCODING=utf-8
PY="E:/venvs/sd/Scripts/python.exe"
pub(){ export YT_TOKEN_FILE="$3"; echo "=========== PUBLISH $1 ($2) token=$3 ==========="; "$PY" dual_publish.py "$1" "$2" --yt public --ig; echo "--- rc=$? ---"; }
pub bojogeum24.json money yt_token.json
pub runway_router.json tech yt_token2.json
echo "=========== BATCH4 DONE ==========="
