// //////////////////////////////////////////////////////////////////////
//  License, authors, contributors and copyright information at:       //
//  AUTHORS and LICENSE files at the root folder of this application   //
// //////////////////////////////////////////////////////////////////////

"use strict";

const path = require('path');
const app_module_path = require('app-module-path')
app_module_path.addPath(path.join(__dirname, '../modules'));
app_module_path.addPath(path.join(__dirname, '../modals_renderer'));
app_module_path.addPath(__dirname);

const { ipcRenderer } = require('electron');
const url_exist = require('url-exist');
const fs = require('fs');
const { spawn } = require('child_process');
const python_shell = require('python-shell');

const lg = require('logging');
const loc = require('locations');
const tools = require('tools');
const data = require('data');


module.exports = {
    init: function() {
        var self = this;
        self.ipc_renderer = ipcRenderer;
        self.python_path = '';
        self.script_env_path = '';
        tools.set_python_path(self, 'server_renderer');
        self.check_previous_session();
    },

    uncaught_exception_dialog: function(error) {
        tools.show_modal({
            type: 'UNCAUGHT EXCEPTION',
            code: error
        });
    },

    bokeh_error_loading: function() {
        var self = this;
        tools.modal_question({
            title: 'Restart app?',
            msg: 'Bokeh Server could not be loaded. Other instance of the app may be open or not correctly closed. ' +
                   'Close it correctly before opening another one. Do you want to restart this instance of the app ' +
                   'to try it again? If you press "No" this instance will close',
            callback_yes: function() {
                ipcRenderer.send('restart-app');
            },
            callback_no: function() {
                ipcRenderer.send('exit-app');   // close without throwing any event
            },
            callback_close: function() {
                ipcRenderer.send('exit-app');
            }
        })

        $('#modal_question .close').on('click', function() {
            no_callback();
        });
    },

    go_to_bokeh: function() {
        lg.info('-- GO TO BOKEH');
        var self = this;
        $('body').css('overflow-y', 'hidden');  // to prevent two scrolls on the right
        tools.show_loader();
        var _checkBokehSate = setInterval(function() {
            if ($('body').data('bokeh_state') == 'ready' && $('body').data('ts_state') != 'checking') {
                clearInterval(_checkBokehSate);
                if ($('body').data('ts_state') == 'offline') {
                    ipcRenderer.send('run-tile-server');
                }
                self.init_bokeh()
            }
        }, 100);
    },

    init_bokeh: function() {
        var self = this;
        var call_params = {
            'object': 'bokeh.loader',
            'method': 'init_bokeh',
            'args': {
                'ts_state': $('body').data('ts_state'),
            }
        }
        tools.call_promise(call_params).then((result) => {
            self.run_on_ready();
        });
    },

    go_to_welcome: function() {
        // the loader is not needed here, very fast transition
        $('#bokeh_iframe').fadeOut('slow', function(){
            $('body').css('overflow-y', 'auto')
            $('.welcome_container').fadeIn('slow');
        });
    },

    reset_bokeh: function() {
        var self = this;
        var call_params = {
            'object': 'bokeh.loader',
            'method': 'reset_bokeh',
        }
        tools.call_promise(call_params).then((result) => {
            lg.info('-- RESETING BOKEH');
            self.go_to_welcome();
            ipcRenderer.send('set-main-menu');
        });
    },

    reset_bokeh_cruise_data: function() {
        var self = this;
        var call_params = {
            'object': 'bokeh.loader',
            'method': 'reset_env_cruise_data',
        }
        tools.call_promise(call_params).then((result) => {
            lg.info('-- RESETING BOKEH AND CRUISE DATA');
            self.go_to_welcome();
            ipcRenderer.send('set-main-menu');
        });
    },

    reload_bokeh: function(callback=null) {
        var self = this;
        tools.show_loader();
        var call_params = {
            'object': 'bokeh.loader',
            'method': 'reload_bokeh',
        }
        tools.call_promise(call_params).then((result) => {
            lg.info('-- RELOADING BOKEH');
            self.run_on_ready();
            tools.hide_loader();
            if (callback != null) {
                callback();
            }
        });
    },

    run_on_ready: function() {
        var self = this;
        lg.info('-- RUN ON READY');
        document.getElementById('bokeh_iframe').contentWindow.postMessage({
            'signal': 'on-ready',
            'message_data': 'continue'
        } , '*');  // to index.html

        // This waits for the back signal 'on-ready' in the main_renderer.js file
    },

    run_on_ready_final_step: function() {
        lg.info('-- ON-READY SIGNAL, FINAL STEP');
        var self = this;
        // TODO: check if it is an aqc (mark watcher as saved file) or a csv file (mark as modified)

        var project_file = data.get('project_file', loc.proj_settings);
        var project_state = data.get('project_state', loc.shared_data);  // modified or saved
        if (project_file === false) {  // csv file, not saved
            data.set({'project_state': 'modified'}, loc.shared_data);
            project_state = 'modified';
        }
        ipcRenderer.send('enable-watcher', {
            'mark': project_state,
            'set_bokeh_menu': true
        });
        tools.show_default_cursor();
        tools.hide_loader();
    },

    come_back_to_welcome: async function(reset_cruise_data=false) {
        lg.info('-- COME BACK TO WELCOME --');
        var self = this;
        document.title = 'AtlantosQC!';
        ipcRenderer.send('disable-watcher');
        try {
            await fs.promises.rm(loc.proj_files, { recursive: true, force: true });
            if (reset_cruise_data) {
                self.reset_bokeh_cruise_data();
            } else {
                self.reset_bokeh();
            }
        } catch (error) {
            tools.show_modal({
                type: 'ERROR',
                msg: 'Error removing temporal folder.' +
                       ' Make sure the files are not being used by another application.',
                code: error.stack
            });
        }
    },

    check_python_version: function() {
        // TODO: repeated method, move to tools.js or somewhere else

        var self = this;
        return new Promise((resolve, reject) => {
            var py_options = {
                mode: 'text',
                pythonPath: self.python_path,
                scriptPath: loc.scripts
            };
            python_shell.run('get_python_version.py', py_options, function (err, results) {
                if (err) {
                    reject('>> Error running script: ' + err);
                } else {
                    if (typeof(results) !== 'undefined') {
                        try {
                            var v = parseInt(results[0].split('.')[0])
                        } catch(err) {
                            reject('Version could not be parsed');
                        }
                        if (v == 3) {
                            resolve(true)
                        } else {
                            reject('Wrong python version: ' + results[0]);
                        }
                    }
                }
            });
        });
    },

    show_python_path_dg_err: function(error='') {
        var self = this;
        tools.show_modal({
            'msg_type': 'html',
            'type': 'ERROR',
            'msg': '<p>Python path or version error. Is the python path correct?:</p>'
                     + `<p>Python path: <code>"${self.python_path}"</code></p>`
                     + `<p>Scrip env path: <code>"${self.script_env_path}"</code></p>`
                     + `<p>Error description: <code>"${error}"</code></p>`,
            'callback': function() {
                ipcRenderer.send('will-quit');
            }
        });
    },

    /* This method is used to add a hash file as a parameter in the links to css files.
    *  The files will be loaded from cache only if there are no new changes.
    *
    *  There is a simpler solution using the timestamp, but in this case the files
    *  would be always reloaded: https://stackoverflow.com/a/8331646/4891717
    */
    get_css_checksums: function() {
        lg.info('-- GET CSS CHECKSUMS');
        var self = this;
        var py_options = {
            mode: 'text',
            pythonPath: self.python_path,
            scriptPath: loc.scripts,
        };
        self.shell = python_shell.run('get_css_checksums.py', py_options, function (err, results) {
            if (err || typeof(results) == 'undefined') {  // The script get_module_path.py did not return the correct path
                lg.error('Error running get_css_checksums.py: ' + err);
            } else {
                results = results[0]
                results = results.replace(/'/g,'"');
                results = results.replace('\r','');
                results = JSON.parse(results);  // try catch ??
                // lg.warn('>> CHECKSUM RESULTS: ' + JSON.stringify(results, null, 4));
                $.each(results, function(key, value) {
                    if (key == 'electron_css_path') {  // TODO: How to run this before the window is shown?
                        $.each(results[key], function(file_name, hash) {
                            var css = $("link[href$='" + file_name + "']");
                            css.attr('href', css.attr('href') + '?v=' + hash);
                        });
                        $('.welcome_container').fadeIn(500);
                    }
                });
            }
        });
    },

    check_tile_server_state: function() {
        lg.info('-- CHECK TILE SERVER STATE')
        // check ArcGIS Tile Server State
        url_exist('https://server.arcgisonline.com/arcgis/rest/services/Ocean/World_Ocean_Base/MapServer/tile/0/0/0').then((exists) => {
            if (exists) {
                lg.info('Tile server online');
                $('body').data('ts_state', 'online');

                $('#argis_tile_server_state').text('Online');
                $('#argis_tile_server_state').css('color', 'green');
            } else {
                lg.warn('Tile server offline, or there is no internet connection');
                $('body').data('ts_state', 'offline');

                $('#argis_tile_server_state').text('Offline');
                $('#argis_tile_server_state').css('color', 'red');
            }
            $('#argis_tile_server_state').css('font-weight', 'bold');
        });
    },

    json_template_restore_to_default: function() {
        var self = this;
        tools.modal_question({
            'title': 'Overwrite Settings?',
            'msg': 'Are you sure that you want to overwrite the Settings File with the default values?' +
                    ' The changes that you may have done will be lost.',
            'callback_yes': self.json_template_send_restore_to_default_signal,
            'self': self
        })
    },

    json_template_send_restore_to_default_signal: function(self=false) {
        lg.warn('JSON TEMPLATE SEND RESTORE TO DEFAULT SIGNAL');
        if (self === false) {
            var self = this;
        }
        self.ipc_renderer.send('json-template-restore-to-default');
    },

    /* If the folder "files" exists then the application was closed by force
        ask to the user if try to open the last file, or discard the open file
    */
    check_previous_session: function() {
        var self = this;
        var file_to_open = data.get('file_to_open', loc.shared_data);
        lg.info('>> FILE TO OPEN: ' + file_to_open);
        if (file_to_open != '--updated') {  // if the app is not being updated
                                            // TODO: check this in a more proper way

            // wait for app detection bokeh >> ready is the only way, but it will take time
            // before bokeh is launched port detection should take place

            if (fs.existsSync(loc.proj_files)) {
                lg.info('-- PENDING PREVIOUS SESSION');
                var proj_name = data.get('project_name', loc.proj_settings);
                if (proj_name == 'default_settings') {  // if the user did not accept al plot the las time
                                                        // and the app was interrupted
                    self.rmv_proj_files();
                } else {
                    self.restore_session(file_to_open);
                }
            } else {
                // check if there is file to open
                if (file_to_open !== false) {
                    data.set({'file_to_open': false}, loc.shared_data);
                    self.ipc_renderer.send('open-file', [file_to_open]);
                }
            }
        }
    },

    rmv_proj_files: async function() {
        var self = this;
        data.set({'file_to_open': false}, loc.shared_data);
        try {
            await fs.promises.rm(loc.proj_files, { recursive: true, force: true });
        } catch (error) {
            tools.show_modal({
                type: 'ERROR',
                msg: 'The temporal folder could not be removed. ' +
                     'Make sure the tmp folder is not being used by another app.',
                code: error.stack
            });
        }
    },

    restore_session: function(file_to_open=false) {
        var self = this;
        var msg = '<p>A previous session was not closed correctly. ' +
                  'Would you like to reopen it? ' +
                  'If you press "No", or you close this dialog the changes will be lost.</p>'

        if (file_to_open !== false) {
            msg += '<p>Also, the file you are actually opening is going to be processed instead: </p>' +
                   '<pre>' + file_to_open + '</pre>';
        }

        var cb_no = function() {
            self.rmv_proj_files();
        }

        tools.modal_question({
            title: 'Restore previous open session?',
            msg: msg,
            callback_yes: function() {
                data.set({'file_to_open': false}, loc.shared_data);
                self.go_to_bokeh();
            },
            callback_no: cb_no,
            callback_close: cb_no,
            self: self
        })
    },

    /** Loads images, I need to do this because when they are in the .asar file
     *  they are not read well
     */
    load_images: function() {
        fs.readFile(path.join(loc.img, 'icon.png'), {encoding: 'base64'}, function(err, data) {
            if (err) {
                lg.error('ERROR LOADING ICON.PNG: ' + err)
            } else {
                // TODO: this is the logo of the app, but maybe it is not so important to show it here on the main screen
                //       Actually it is very similar to the logo of Eurogoship

                // var img = $('<img>', {
                //     id: 'ctd_logo',
                //     src: 'data:image/png;base64,' + data,
                //     style: 'display: none;',
                // });
                // $('#eurogoship_logo_div').append(img);

                fs.readFile(path.join(loc.img, 'eurogoship_logo.svg'), {encoding: 'base64'}, function(err, data) {
                    if (err) {
                        lg.error('ERROR LOADING EUROGOSHIP_LOGO.SVG: ' + err)
                    } else {
                        var img = $('<img>', {
                            id: 'eurogoship_logo',
                            src: 'data:image/svg+xml;base64,' + data,
                            style: 'display: none; height: 140px',
                        });
                        $('#eurogoship_logo_div').append(img);
                        $('#eurogoship_logo_div img').fadeIn(1000);
                    }
                });

                fs.readFile(path.join(loc.img, 'atlantos-logo.png'), {encoding: 'base64'}, function(err, data2) {
                    if (err) {
                        lg.error('ERROR LOADING ATLANTOS-NEW-LOGO.PNG: ' + err)
                    } else {
                        var img2 = $('<img>', {
                            id: 'atlantos_logo',
                            src: 'data:image/png;base64,' + data2,
                            style: 'display: none; height: 30px; text-align:right',
                        });
                        $('#atlantos_logo_div').append(img2);
                        $('#atlantos_logo_div img').fadeIn(1000);
                    }
                });

            }
        });
    }
}