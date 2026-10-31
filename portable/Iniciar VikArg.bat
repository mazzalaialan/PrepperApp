@echo off
title VikArg Survival
rem Abre VikArg Survival sin internet: levanta un servidor local y abre el navegador.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0servidor.ps1"
