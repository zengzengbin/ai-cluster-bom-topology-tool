@echo off
chcp 65001 >nul
setlocal

cd /d "%~dp0"

set "PORT=8765"
if not "%~1"=="" set "PORT=%~1"

if not exist "index.html" (
  echo [错误] 当前目录没有 index.html。
  echo 请先运行 pnpm build，然后把本文件复制到 dist 目录内再双击运行。
  pause
  exit /b 1
)

where python >nul 2>nul
if %errorlevel%==0 (
  set "PYTHON_CMD=python"
) else (
  where py >nul 2>nul
  if %errorlevel%==0 (
    set "PYTHON_CMD=py -3"
  ) else (
    echo [错误] 未检测到 Python。
    echo 请先安装 Python 3，或让工具提供者改用其他本地静态服务方式。
    pause
    exit /b 1
  )
)

echo 正在启动智算清单和拓扑生成工具...
echo 访问地址：http://127.0.0.1:%PORT%/
echo 如提示端口被占用，请关闭窗口后在命令行中使用：start-local.bat 8766

start "" "http://127.0.0.1:%PORT%/"
%PYTHON_CMD% -m http.server %PORT% --bind 127.0.0.1

pause
