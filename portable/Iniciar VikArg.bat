@echo off
title VikArg Prepping Tools
rem Abre VikArg Prepping Tools sin internet: levanta un servidor local y abre el navegador.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0servidor.ps1"
