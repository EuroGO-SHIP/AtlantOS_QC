// //////////////////////////////////////////////////////////////////////
//  License, authors, contributors and copyright information at:       //
//  AUTHORS and LICENSE files at the root folder of this application   //
// //////////////////////////////////////////////////////////////////////

"use strict";

const path = require('path');
const electron = require('electron')
const { ipcRenderer } = require('electron');

var app_path = null;
var user_data_path = null;

if (typeof window !== 'undefined') {
    // renderer process
    var main_paths = ipcRenderer.sendSync('get-main-paths');  // TODO: find an asynchronous way to do this
    app_path = main_paths.app_path;
    user_data_path = main_paths.user_data_path;
} else {
    // main process
    app_path = electron.app.getAppPath();
    user_data_path = electron.app.getPath('userData');
}

const __atlantos_qc_js = app_path;
const __user_data = user_data_path;

const locations = {
    // GENERAL FOLDERS
    'atlantos_qc_js': __atlantos_qc_js,
    'atlantos_qc_dev': path.join(__atlantos_qc_js, '../atlantos_qc'),
    'user_data': __user_data,
    'files': path.join(__user_data, 'files'),
    'modals': path.join(__atlantos_qc_js, 'src/html/modals'),
    'html': path.join(__atlantos_qc_js, 'src/html'),
    'img': path.join(__atlantos_qc_js, 'src/img'),
    'scripts': path.join(__atlantos_qc_js, 'src/scripts'),

    // SETTINGS FILES IN SRC FOLDER
    'shared_data_src': path.join(__atlantos_qc_js, 'src/files/shared_data.json'),
    'default_settings': path.join(__atlantos_qc_js, 'src/files/default_settings.json'),

    // LOGGERS
    'logs_folder': path.join(__user_data, 'logs'),
    'log_js': path.join(__user_data, 'logs/debug_js.log'),
    'log_python': path.join(__user_data, 'logs/debug_py.log'),

    // PROJECT FILES
    'proj_settings': path.join(__user_data, 'files/tmp/settings.json'),
    'proj_data': path.join(__user_data, 'files/tmp/data.csv'),
    'proj_moves': path.join(__user_data, 'files/tmp/moves.csv'),
    'proj_files': path.join(__user_data, 'files/tmp'),
    'proj_upd': path.join(__user_data, 'files/tmp/update'),
    'proj_export': path.join(__user_data, 'files/tmp/export'),
    'proj_metadata': path.join(__user_data, 'files/tmp/metadata'),

    // SETTINGS FILES IN APPDATA FOLDER
    'shared_data': path.join(__user_data, 'files/shared_data.json'),
    'custom_settings': path.join(__user_data, 'files/custom_settings.json'),
    'default_settings_old': path.join(__user_data, 'files/default_settings.json'),  // deprecated

    // PYTHON EXECUTABLE
    'python_win': path.join(__atlantos_qc_js, '../env/python.exe'),
    'python_mac': path.join(__atlantos_qc_js, '../env/bin/python'),
    'python_lin': path.join(__atlantos_qc_js, '../env/bin/python'),

    // ENV BINARIES PATH
    'env_bin_win': path.join(__atlantos_qc_js, '../env/Scripts'),
    'env_bin_mac': path.join(__atlantos_qc_js, '../env/bin'),
    'env_bin_lin': path.join(__atlantos_qc_js, '../env/bin'),

    // PATHS TO SOLVE THIS ISSUE IN PYTHON 3.7.3
    // https://stackoverflow.com/questions/54175042/python-3-7-anaconda-environment-import-ssl-dll-load-fail-error
    'env_lib_bin_win': path.join(__atlantos_qc_js, '../env/Library/bin'),
}

module.exports = locations;