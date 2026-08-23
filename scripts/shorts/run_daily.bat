@echo off
cd /d C:\Users\leesc\Documents\allthatai-real\scripts\shorts
set PYTHONIOENCODING=utf-8
python daily_auto.py --gpu-max 40 >> daily_auto.log 2>&1
