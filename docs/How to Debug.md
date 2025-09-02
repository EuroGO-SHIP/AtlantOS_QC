# How to Debug

Electron and the Python app (Bokeh Server) are interconnected. The best way to debug the python code is to write messages on the loggers. If you are reading the logger files from WSL with Debian you can use this script to make the logger more readable with colors:

    #!/bin/bash

    LOG_NODE="/mnt/c/Users/[user_name]/AppData/Roaming/atlantos-qc/logs/debug_js.log"
    LOG_PYTHON="/mnt/c/Users/[user_name]/AppData/Roaming/atlantos-qc/logs/debug_py.log"

    log='s/INFO/\o033[1;34m&\o033[0m/g'
    warn='s/WARN/\o033[1;33m&\o033[0m/g'
    error='s/ERROR/\o033[1;91m&\o033[0m/g'
    debug='s/DEBUG/\o033[1;33m&\o033[0m/g'
    node='s/NODE/\o033[1;36m&\o033[0m/g'

    colorization="$log;$warn;$error;$debug;$node"
    tail -n 100 -f "$LOG_NODE" "$LOG_PYTHON" ---disable-inotify | sed -e "$colorization"


# VSCode

`launch.json` file:

    {
        "version": "0.2.0",
        "configurations": [
            {
                "name": "Electron: Main",
                "type": "node",
                "request": "launch",
                "runtimeExecutable": "${workspaceFolder}/atlantos_qc_js/node_modules/.bin/electron",
                "program": "${workspaceFolder}/atlantos_qc_js/main.js"
            },
            {
                "name": "Electron: Renderer",
                "type": "chrome",
                "request": "attach",
                "port": 9223,
                "webRoot": "${workspaceFolder}/atlantos_qc_js",
                "timeout": 30000
            }
        ],
        "compounds": [
            {
                "name": "Electron: All",
                "configurations": ["Electron: Main", "Electron: Renderer"]
            }
        ]
    }

Set some breakpoint on the server side of electron and select "Electron: Main" on the debug menu.

To debug something on the renderer process run the app with `yarn start:debug`, set some breakpoints and select "Electron: Renderer" on the debug section of VSCode to run the debugger.