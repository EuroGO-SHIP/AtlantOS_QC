# How to Debug

Electron and the Python app (Bokeh Server) are interconnected. The best way to debug the python code is to write messages on the loggers. If you are reading the logger files from WSL with Debian you can use this script to make the logger more readable with colors:

    #!/bin/bash

    LOG_NODE="/mnt/c/Users/Chesu/AppData/Roaming/ocean-data-qc/logs/debug_js.log"
    LOG_PYTHON="/mnt/c/Users/Chesu/AppData/Roaming/ocean-data-qc/logs/debug_py.log"

    log='s/INFO/\o033[1;34m&\o033[0m/g'
    warn='s/WARN/\o033[1;33m&\o033[0m/g'
    error='s/ERROR/\o033[1;91m&\o033[0m/g'
    debug='s/DEBUG/\o033[1;33m&\o033[0m/g'
    node='s/NODE/\o033[1;36m&\o033[0m/g'

    colorization=$log';'$statement';'$warn';'$error';'$debug';'$node

    # https://github.com/microsoft/WSL/issues/3942#issuecomment-523148487
    tail -n 100 -f $LOG_NODE $LOG_PYTHON ---disable-inotify | sed -e "$colorization"

# VSCode

Add this to your workspace settings to prevent [similar errors](https://stackoverflow.com/questions/74660176/using-visualstudio-python-how-to-handle-overriding-stdlib-module-pylancer) to `env\Lib\glob.py" is overriding the stdlib "glob" modulePylance(reportShadowedImports)`:

    {
        "folders": [
            {
                "path": "AtlantOS_QC"
            }
        ],
        "settings": {
            "python.analysis.diagnosticSeverityOverrides": {
                "reportShadowedImports": "none"
            }
        }
    }

This is just a workaround: "Disabling all override warnings has the unwanted side-effect of removing useful warnings."