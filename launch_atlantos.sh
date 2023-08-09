#!/bin/bash

source /Users/avelo/miniconda3/etc/profile.d/conda.sh
cd ~/Projects/AtlantOS/atlantosqc_github
conda activate ~/Projects/AtlantOS/atlantosqc_github/env
git pull origin
python setup.py develop
cd ocean_data_qc_js
yarn install
yarn start