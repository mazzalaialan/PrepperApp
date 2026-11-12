@echo off
title Herramientas de supervivencia por VikArg
rem Abre Herramientas de supervivencia por VikArg sin internet: levanta un servidor local y abre el navegador.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0servidor.ps1"
