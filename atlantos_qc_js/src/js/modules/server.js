// //////////////////////////////////////////////////////////////////////
//  License, authors, contributors and copyright information at:       //
//  AUTHORS and LICENSE files at the root folder of this application   //
// //////////////////////////////////////////////////////////////////////

'use strict';

const path = require('path');
const fs = require('fs');
const { PythonShell } = require('python-shell');
const port_scanner = require('portscanner');
const url = require('url');

const {dialog} = require('electron');
const {app} = require('electron');
const {shell} = require('electron');

const loc = require('locations');
const lg = require('logging');
const data = require('data');
const tools = require('../renderer_modules/tools');

module.exports = {
    init: function(menu) {
        var self = this;
        self.menu = menu;
        self.shell = null;
        self.ts_shell = null;
        self.python_options = {};
        self.script_env_path = ''
        self.python_path = '';
        self.atlantos_qc_path = '';
        self.dom_ready = false;
    },

    uncaught_exception_dialog: function(error) {
        var self = this;

        // TODO: if some error happens before the renderer process is created,
        //       then this is not going to work

        if (self.dom_ready) {
            self.web_contents.send('uncaught-exception', {error: error });
        } else {
            self.web_contents.on('dom-ready', () => {
                self.web_contents.send('uncaught-exception', {error: error });
            });
        }
    },

    check_files_folder: function() {
        lg.info('-- CHECK FILES FOLDER')
        return new Promise((resolve, reject) => {
            fs.access(loc.files, fs.constants.F_OK, (err) => {
                if (err) {
                    fs.mkdir(loc.files, { recursive: true }, (err) => {
                        if (err) reject(err);
                        else resolve(true);
                    });
                } else {
                    resolve(true);
                }
            });
        });
    },

    check_log_folder: function() {
        lg.info('-- CHECK LOG FOLDER')
        return new Promise((resolve, reject) => {
            fs.access(loc.logs_folder, fs.constants.F_OK, (err) => {
                if (err) {
                    fs.mkdir(loc.logs_folder, { recursive: true }, (err) => {
                        if (err) reject(err);
                        else resolve(true);
                    });
                } else {
                    resolve(true);
                }
            });
        });
    },

    /** In previous versions there used to be a default_settings.json
     *  in the appdata folder. Now it is just a template in the app folder.
     *  So this method removes the file if it exists in the appdata folder
     *
     *  TODO: check just when installing this app
    */
    check_json_old_default_settings: function() {
        lg.info('-- CHECK JSON OLD DEFAULT SETTINGS');
        return new Promise((resolve, reject) => {
            fs.access(loc.default_settings_old, fs.constants.F_OK, (err) => {
                if (err) {
                    resolve(true);
                } else {
                    fs.unlink(loc.default_settings_old, (err) => {
                        if (err) reject(err);
                        else resolve(true);
                    });
                }
            });
        });
    },

    /** Checks if the shared data file exists to copy or replace it
     */
    check_json_shared_data: function() {
        lg.info('-- CHECK SHARED DATA FILE')
        var self = this;

        return new Promise((resolve, reject) => {
            fs.access(loc.shared_data, fs.constants.F_OK, (err) => {
                if (err) {
                    var a = fs.createReadStream(loc.shared_data_src);
                    var c = fs.createWriteStream(loc.shared_data);

                    a.on('error', (err) => {
                        tools.showModal('ERROR', 'The shared data file could not be read');
                        reject(err);
                    });
                    c.on('error', (err) => {
                        tools.showModal('ERROR', 'Some error copying the shared data file');
                        reject(err);
                    });
                    var p = a.pipe(c);

                    p.on('close', function(){
                        resolve(true);
                    });

                } else {
                    self.check_json_shared_data_version().then((res) => {
                        if (res == true) {
                            resolve(true);
                        } else {
                            reject(res);
                        }
                    });
                }
            });
        });
    },

    /** Overwrites shared_data file json_version is older
     *  This can happen only when the app is updated
     *
     *  TODO: this is checked every time the app is executed,
     *        it should be only run in case it is updated
     */
    check_json_shared_data_version: function() {
        lg.info('-- CHECK JSON SHARED DATA');
        var self = this;
        return new Promise((resolve, reject) => {
            var v_shared_data_src = data.get('json_version', loc.shared_data_src);  // TODO: check app version instead?
            var v_shared_data = data.get('json_version', loc.shared_data);

            var comp_res = tools.compare_versions(v_shared_data_src, v_shared_data)
            lg.warn('>> COMPARISON (shared data src version vs share_data version) : ' + comp_res)
            if (comp_res !== false && comp_res > 0) {   // TODO: what happens if: v < 1.3.0, it does not have json_version attr
                self.overwrite_json_file(loc.shared_data_src, loc.shared_data).then((result) => {
                    resolve(true);
                }).catch((msg) => {reject(msg)});
            } else {
                resolve(true);
            }
        });
    },

    /** Checks if the default template json file that is in the src/files folder
     *  has the same version than the one in the app data to replace it
     *
     *  Show a message if the custom.json has a different version and replace it
     */
    check_json_custom_settings: function() {
        lg.info('-- CHECK JSON CUSTOM SETTINGS')
        var self = this;

        return new Promise((resolve, reject) => {
            fs.access(loc.custom_settings, fs.constants.F_OK, (err) => {
                if (err) {
                    var a = fs.createReadStream(loc.default_settings);
                    var c = fs.createWriteStream(loc.custom_settings);

                    a.on('error', (err) => {
                        tools.showModal('ERROR', 'The default settings file could not be read');
                        reject(err);
                    });
                    c.on('error', (err) => {
                        tools.showModal('ERROR', 'Some error copying the custom settings file');
                        reject(err);
                    });
                    var p = a.pipe(c);

                    p.on('close', function(){
                        try {
                            if (self.dom_ready) {
                                self.web_contents.send('show-custom-settings-replace', {'result': 'sync' });
                            } else {
                                self.web_contents.on('dom-ready', () => {
                                    self.web_contents.send('show-custom-settings-replace', {'result': 'sync' });
                                });
                            }
                        } catch(err) {
                            lg.error(err);
                        }
                        resolve(true);
                    });

                } else {
                    self.check_json_custom_settings_version().then((res) => {
                        if (res == true) {
                            resolve(true);
                        } else {
                            reject(res);
                        }
                    });
                }
            });
        });
    },

    check_json_custom_settings_version: function() {
        var self = this;
        lg.info('-- CHECK JSON CUSTOM SETTINGS VERSION');
        return new Promise((resolve, reject) => {
            // if the default.json are differents versions, replace it
            var v_src = data.get('json_version', loc.default_settings);  // new version if the app is updated
            var v_appdata = data.get('json_version', loc.custom_settings);
            if (v_src != v_appdata || v_appdata === false) {  // if v_appdata = false, then: v < 1.3.0
                if (self.dom_ready) {
                    self.web_contents.send('show-custom-settings-replace', {'result': 'should_update' });
                } else {
                    self.web_contents.on('dom-ready', () => {
                        self.web_contents.send('show-custom-settings-replace', {'result': 'should_update' });
                    });
                }
                resolve(true);
            } else {
                self.json_templates_compare_custom_default().then((result) => {
                    if (result == true) {
                        try {
                            if (self.dom_ready) {
                                self.web_contents.send('show-custom-settings-replace', {'result': 'sync' });
                            } else {
                                self.web_contents.on('dom-ready', () => {
                                    self.web_contents.send('show-custom-settings-replace', {'result': 'sync' });
                                });
                            }
                        } catch(err) {
                            lg.error(err);
                        }
                    } else {
                        try {
                            if (self.dom_ready) {
                                self.web_contents.send('show-custom-settings-replace', {'result': 'should_restore' });
                            } else {
                                self.web_contents.on('dom-ready', () => {
                                    self.web_contents.send('show-custom-settings-replace', {'result': 'should_restore' });
                                });
                            }
                        } catch(err) {
                            lg.error(err);
                        }
                    }
                    resolve(true);
                }).catch((msg) => {
                    reject(msg);
                });
            }
            resolve(true);
        });
    },

    overwrite_json_file: function(src, dst) {
        // TODO: move this to data.js ??
        lg.info('-- OVERWRITE JSON FILE WITH SRC: ' + src);
        return new Promise((resolve, reject) => {
            var a = fs.createReadStream(src);
            var c = fs.createWriteStream(dst);
            a.on('error', (err) => {
                reject('The file you have opened could not be read (override_json_file method)');
            });
            c.on('error', (err) => {
                reject('The file you have opened could not be read (override_json_file method)');
            });
            var p = a.pipe(c);
            p.on('close', function(){
                resolve(true);
            });
        });
    },

    json_template_restore_to_default: function() {
        var self = this;
        lg.info('-- JSON TEMPLATE RESTORE TO DEFAULT')
        self.overwrite_json_file(loc.default_settings, loc.custom_settings);

        self.overwrite_json_file(loc.default_settings, loc.custom_settings).then((result) => {
            self.web_contents.send('show-custom-settings-replace', {'result': 'restored'});
        }).catch((error) => {
            self.web_contents.send('show-modal', {
                'type': 'ERROR',
                'msg': 'JSON file could not be overwritten: <br />' + error
            });
        });
    },

    json_templates_compare_custom_default: function() {
        lg.info('-- JSON TEMPLATES COMPARE CUSTOM DEFAULT');
        return new Promise((resolve, reject) => {
            fs.readFile(loc.custom_settings, (err, data1) => {
                if (err) reject(err);
                fs.readFile(loc.default_settings, (err, data2) => {
                    if (err) reject(err);
                    if (data1.equals(data2)) {
                        resolve(true);  // nothing happens >> show sync message, replace is not needed
                    } else {
                        resolve(false);  // offer to the user the chance to restore to default
                    }
                });
            });
        });
    },

    /**
     * Launches bokeh server application.
     * Checks if the developer mode is enabled before.
     */
    launch_bokeh: function() {
        lg.info('-- LAUNCHING BOKEH');
        var self = this;
        self.bokeh_port = data.get('bokeh_port', loc.shared_data);
        tools.set_python_path(self, 'server');
    },

    show_python_path_dg_err: function(error='') {
        var self = this;
        dialog.showMessageBox({
            type: 'error',
            buttons: ['Ok'],
            title: 'Critical Error',
            message: 'Python path or version error. Is the python path correct?'
                     + `\n\nPython path: "${self.python_path}"`
                     + `\nScrip env path: "${self.script_env_path}"`
                     + `\nError description: "${error}"`
        }).then(() => {
            self.close_app();
        });
    },

    set_atlantos_qc_path: function() {
        var self = this;
        var py_options = {
            mode: 'text',
            pythonPath: self.python_path,
            scriptPath: loc.scripts
        };
        PythonShell.run('get_module_path.py', py_options).then(results => {
            if (results && results.length > 0) {
                // TODO: what is the returned value if it is not found without any error?

                var p = results[0].replace(/[\n\r]+/g, '');
                self.atlantos_qc_path = tools.file_to_path(p);
                self.set_python_shell_options();
                self.run_bokeh();
            } else {
                lg.error('get_module_path.py did not return a path. Trying development path as fallback.');
                // NOTE: If an ImportError (or any other error) is got >>
                //       atlantos_module is posibly not installed.
                //       Then look for the sibling folder of atlantos_qc_js
                //       to make this work the environment should exists
                //       its dependencies should be installed as well
                if (fs.existsSync(loc.atlantos_qc_dev)) {
                    self.atlantos_qc_path = loc.atlantos_qc_dev;
                    self.set_python_shell_options();
                    self.run_bokeh();
                }
            }
        }).catch(err => {
            lg.error(
                'Error running get_module_path.py. ' +
                'Make sure you have installed the atlantosqc package: ' + err
            );

            // NOTE: If an ImportError (or any other error) is got >>
            //       atlantos_module is posibly not installed.
            //       Then look for the sibling folder of atlantos_qc_js
            //       to make this work the environment should exists
            //       its dependencies should be installed as well

            if (fs.existsSync(loc.atlantos_qc_dev)) {
                self.atlantos_qc_path = loc.atlantos_qc_dev;
                self.set_python_shell_options();
                self.run_bokeh();
            }
        });
    },

    set_python_shell_options: function() {
        lg.info('-- SET PYTHON SHELL OPTIONS')
        var self = this;

        var dev_mode = data.get('dev_mode', loc.shared_data);
        var user_options = [
            '-m', 'bokeh', 'serve',
            '--port', self.bokeh_port
        ]
        var dev_options = [
            '--log-format', '"%(asctime)s %(levelname)s %(message)s"',  // not working?
            '--log-file', loc.log_python
        ]
        lg.info('>> PYTHON PATH: ' + self.python_path)
        var aux_options = user_options;
        if (dev_mode) {
            aux_options = user_options.concat(dev_options);
        }
        self.python_options = {
            mode: 'text',
            pythonPath: self.python_path,
            pythonOptions: aux_options
        };
    },

    /**
     * Runs bokeh server application.
     * The bokeh process is bound to the node process.
     */
    run_bokeh: function() {
        var self = this;
        lg.info('-- RUN BOKEH')
        // lg.warn('>> PYTHON SHELL OPTIONS: ' + JSON.stringify(self.python_options, null, 4));
        if (self.atlantos_qc_path != '') {
            self.shell = PythonShell.run(self.atlantos_qc_path, self.python_options);
            self.shell.catch((err) => {
                lg.error(`>> BOKEH SERVER COULD NOT BE LAUNCHED OR CRASHED: ${err}`);
                if (self.dom_ready) {
                    self.web_contents.send('bokeh-error-loading');
                } else {
                    self.web_contents.on('dom-ready', () => {
                        self.web_contents.send('bokeh-error-loading');
                    });
                }
            });
        }
    },

    /**
     * Kills the bokeh process and launches it again
     */
    relaunch_bokeh: function() {
        lg.info('-- RELAUNCH BOKEH');
        var self = this;
        self.web_contents.send('show-loader');
        self.shell.childProcess.kill();
        if (self.ts_shell != null) {
            self.ts_shell.childProcess.kill();
        }
        self.launch_bokeh();
        self.load_bokeh_on_iframe();
        self.web_contents.send('relaunch-bokeh');
    },

    load_bokeh_on_iframe: function() {
        var self = this;
        var ensure_one = false;
        var _checkBokehPort = setInterval(function() {
            port_scanner.checkPortStatus(self.bokeh_port, function(error, status) {
                if (status == 'open') {
                    clearInterval(_checkBokehPort);
                    if (ensure_one === false) {
                        ensure_one = true;
                        lg.info('-- BOKEH PORT OPEN, SENDING SIGNAL TO LOAD THE IFRAME');
                        self.web_contents.send('load-bokeh-on-iframe')
                    }
                }
                if (error) {
                    self.web_contents.send('show-modal', {
                        'type': 'ERROR',
                        'msg': 'Bokeh could not be loaded on the iframe: <br />' + error
                    });
                }
            });
        }, 500);
    },

    /**
     * Loads the main menu and the main window
     * This is useful if the app is loaded for the first time
     */
    go_to_welcome_window: function() {
        var self = this;
        self.menu.set_main_menu();
        self.web_contents.loadURL(url.format({
            pathname: path.join(loc.html, 'main.html'),
            protocol: 'file:',
            slashes: true
        }));
    },

    close_app: function () {
        var self = this;
        lg.info('-- CLOSE APP')
        if (self.shell != null) {  // TODO not tested
            self.shell.childProcess.kill();  // mac needs to kill children explicitly
            if (self.ts_shell != null) {
                self.ts_shell.childProcess.kill();
            }
        }
        app.quit();  // this waits until the children (self.shell.childProcess) are killed
    },

    close_with_exit_prompt_dialog: function(e) {
        var self = this;
        lg.info('-- CLOSE APP DIALOG');
        if (fs.existsSync(loc.proj_files)) {
            if (app.showExitPrompt) {
                if (typeof(e) !== 'undefined' && typeof(e.preventDefault) !== 'undefined') {
                    e.preventDefault();
                }
                dialog.showMessageBox({
                    type: 'question',
                    buttons: ['Yes', 'No' ],
                    title: 'Confirm',
                    message: 'Unsaved data will be lost. Are you sure you want to quit?'
                }).then((results) => {
                    self.close_with_exit_prompt(results);
                })
            }
        } else {
            self.close_app();
        }
    },

    close_with_exit_prompt: async function(results) {
        var self = this;
        lg.info(JSON.stringify(results))
        if (results['response'] === 0) { // The following is run if 'Yes' is clicked
            try {
                await fs.promises.rm(loc.proj_files, { recursive: true, force: true });
                lg.warn('Temp folder removed if it existed.');  // check it exists first?
                app.showExitPrompt = false
                self.close_app();
            } catch (error) {
                self.web_contents.send('show-modal', {
                    'type': 'ERROR',
                    'msg': 'Error removing temporal folder.' +
                           ' Make sure the files are not being used by another application: ' + error
                });
            }
        }
    },

    set_file_to_open: function() {
        lg.info('-- SET FILE TO OPEN')
        if (!app.isPackaged) {
            var file_to_open = process.argv[2];  // the process.argv[1] is the atlantos_qc_js folder
        } else {
            var file_to_open = process.argv[1];
        }
        if (typeof(file_to_open) !== 'undefined') {
            // TODO: Is file_to_open a relative path when it is open with the mouse??
            data.set({'file_to_open': file_to_open }, loc.shared_data);
        } else {
            // NOTE: Just in case the previous session was closed by force
            data.set({'file_to_open': false }, loc.shared_data);

            // TODO: Show the main loader here
        }
    },

    set_link_opener: function() {
        var self = this;
        var handleRedirect = (e, url) => {
            if(url != self.web_contents.getURL()) {
                e.preventDefault()
                shell.openExternal(url)
            }
        }
        self.web_contents.on('will-navigate', handleRedirect)
        self.web_contents.on('new-window', handleRedirect)
    },

    load_bokeh: function() {
        var self = this;
        var bokeh_port = data.get('bokeh_port', loc.shared_data);
        port_scanner.checkPortStatus(bokeh_port, function(error, status) {
            if (status == 'open') {
                if (self.dom_ready) {
                    self.web_contents.send('bokeh-error-loading');
                } else {
                    self.web_contents.on('dom-ready', () => {
                        self.web_contents.send('bokeh-error-loading');
                    });
                }
            } else {
                self.launch_bokeh();  // bokeh initialization on the background
                self.load_bokeh_on_iframe();
            }
        });
    }
}