#!/bin/bash

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"

cd $DIR
git pull origin
source /Users/avelo/miniconda3/etc/profile.d/conda.sh


# clean environment and packages
#mv env /tmp/
rm -rf build
rm -rf dist
rm -rf env
rm -rf ocean_data_qc_js/node_modules
rm -rf ocean_data_qc_js/dist