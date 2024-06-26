// //////////////////////////////////////////////////////////////////////
//  License, authors, contributors and copyright information at:       //
//  AUTHORS and LICENSE files at the root folder of this application   //
// //////////////////////////////////////////////////////////////////////

"use strict";

const path = require('path');
const util = require('util');
const fs = require('fs');
const fs_promises = require('fs').promises;
const file_url = require('file-url');           // converts file path to file:// protocol,
                                                // use fileToPath() function for the opposite
const {dialog} = require('electron');
const {app} = require('electron');
const db = require('mime-db');
const mime = require('mime-type')(db);
const {URL} = require('url');                   // constructor > fs recognise the file:// url built with this
const cross_zip = require('cross-zip');         // it does not work on Windows 7 by default
const rmdir = require('rimraf')

const loc = require('locations');
const lg = require('logging');
const data = require('data');

const tools = require('../renderer_modules/tools');


module.exports = {
    init: function(web_contents, server) {
        var self = this;
        self.web_contents = web_contents;
        self.server = server;
    },

    update_from_csv: function() {
        var self = this;
        lg.info('-- UPDATE FROM CSV')
        dialog.showOpenDialog({
            title: 'Open the AQC file...',
            filters: [{ name: 'AtlantOS Ocean Data QC file', extensions: ['csv'] }],
            properties: ['openFile'],
        }).then(result => {
            lg.info(result);
            if (result['canceled'] === false) {
                self.update_from_csv_open_file(result['filePaths']);
            }
        });
    },

    update_from_csv_open_file: function(file_paths) {
        var self = this;
        self.web_contents.send('show-wait-cursor');
        if (JSON.stringify(file_paths) == '[]') {
            self.web_contents.send('show-default-cursor');
            return;
        }
        var file_path = file_paths[0];
        if (mime.lookup(file_path) == 'text/csv') {
            lg.info('Importing the CSV file name to the temporal folder...');
            try {
                if (!fs.existsSync(loc.proj_upd)) {  // TODO: remove folder if it is already created
                    fs.mkdirSync(loc.proj_upd);
                }
                data.copy(file_path, path.join(loc.proj_upd, 'original.csv'), function() {
                    lg.info('main.js - the original.csv file in proj_upd folder was created...')
                    self.web_contents.send('compare-data');
                });
            } catch(err) {
                self.web_contents.send('show-default-cursor');
                self.web_contents.send('show-modal', {
                    'type': 'ERROR',
                    'msg': 'Something went wrong importing the new CSV file'
                });
            }
        }else{
            // Actually it is impossible to get to here, because is out of domain ['csv']
            self.web_contents.send('show-default-cursor');
            self.web_contents.send('show-modal', {
                'type': 'ERROR',
                'msg': 'Wrong filetype!! It must be an CSV file.'
            });
        }
    },

    open_dialog: function() {
        var self = this;
        dialog.showOpenDialog({
            title: 'Open the AQC file...',
            filters: [{ name: 'AtlantOS Ocean Data QC file', extensions: ['aqc', 'csv', 'xlsx', 'ods'] }],
            properties: ['openFile'],
        }).then(result => {
            lg.info(result);
            if (result['canceled'] === false) {
                self.open_file(result['filePaths']);
            }
        });
    },

    open_file: function (file_paths) {
        lg.info('-- OPEN FILE');
        var self = this;
        if (JSON.stringify(file_paths) == '[]') return;
        self.web_contents.send('show-wait-cursor');
        fs.access(loc.proj_files, fs.constants.F_OK, (err) => {
            if (err) {  // if the folder does not exist
                self.open_by_mime_type(file_paths[0]);
            } else {
                rmdir(loc.proj_files, function(err) {  // if there was some folder from the previous execution
                    if (err) {
                        self.web_contents.send('show-modal', {
                            type: 'ERROR',
                            msg: 'The project file temp folder could not be removed:',
                            code: err.stack
                        });
                        self.web_contents.send('show-default-cursor');
                    } else {
                        self.open_by_mime_type(file_paths[0]);
                    }
                });
            }
        });

    },

    open_by_mime_type: function(file_path) {
        var self = this;
        mime.define(                        // adding new extension to node mime-types
            'application/aqc', {
                source: 'atlantos',
                compressible: false,
                extensions: ['aqc' ]
            }, mime.dupAppend
        );
        var mime_type = mime.lookup(file_path);
        lg.info('>> MIME TYPE: ' + mime_type);
        lg.info('>> FILE PATH: ' + file_path);

        if (mime_type == 'application/aqc') {
            self.init_aqc(file_path);
        } else if (mime_type == 'text/csv') {  // how to check if it is a CSV file??
            self.web_contents.send('tab-project', {
                'file_path': file_path,
                'file_type': 'csv'
            });
        } else if (mime_type == 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') {
            self.web_contents.send('tab-project', {
                'file_path': file_path,
                'file_type': 'xlsx'
            });
        } else if (mime_type == 'application/vnd.oasis.opendocument.spreadsheet') {
            self.web_contents.send('tab-project', {
                'file_path': file_path,
                'file_type': 'ods'
            });
        } else {
            self.web_contents.send('show-deafult-cursor');
            self.web_contents.send('show-modal', {   // it is impossible to get to here, because is out of domain ['csv', 'aqc']
                'type': 'ERROR',
                'msg': 'Wrong filetype!! It must be an AQC, CSV, ODS or XLSX file'
            });
        }
    },

    init_aqc: function(file_path) {
        var self = this;
        fs.mkdir(loc.proj_files, { recursive: true }, async (err) => {
            if (err) {
                self.web_contents.send('show-modal', {
                    type: 'ERROR',
                    msg: 'The project file temp folder could not be created',
                    code: err.stack
                });
            } else {
                try {
                    await self.open_aqc(file_path);
                } catch (err) {
                    self.web_contents.send('show-modal', {
                        type: 'ERROR',
                        msg: 'Error inside open_apc function',
                        code: err.stack
                    });
                }
            }
        });
    },

    open_aqc: async function(file_path) {
        var self = this;
        var output_path = path.join(loc.proj_files, '..');
        if (process.platform === 'win32') { // check if it is only in windows
            output_path = loc.proj_files;
        }
        lg.info('>> OUTPUT PATH: ' + output_path);
        var unzip = util.promisify(cross_zip.unzip)
        try {
            await unzip(file_path, output_path);
            var project_file = file_url(file_path);
            data.set({'project_file': project_file, }, loc.proj_settings);
            self.check_aqc_version();
        } catch (err) {
            self.web_contents.send('show-modal', {
                type: 'ERROR',
                msg: 'The file could not be opened! Make sure that it is a correct AQC file. ' +
                     'If it is correct, there might be a developer bug.',
                msg_type: 'html',
                code: err.stack
            });
        }
    },

    check_aqc_version: function() {
        var self = this;
        var json_version = data.get('json_version', loc.proj_settings);
        var retrocompatible_version = data.get('retrocompatible_version', loc.shared_data);
        if (retrocompatible_version == false) {
            retrocompatible_version = '1.6.0';  // retrocompatible_version attribute started in v1.6.0
        }
        var wrong_version = false;
        lg.warn('>> JSON VERSION: ' + json_version)
        if (json_version === false) {
            wrong_version = true;
        } else {
            var comp_res = tools.compare_versions(json_version, retrocompatible_version)
            lg.warn('>> COMPARISON: ' + comp_res)
            if (comp_res !== false && comp_res < 0) {
                wrong_version = true;
            }
        }
        if (wrong_version) {
            var msg = '<p>The AQC file was created by an older app version or the version has a wrong format' +
                      ' and it is not compatible.</p>' +
                      '<p>You can rename the file extension <b>aqc</b> to <b>zip</b> and extract the <b>data.csv</b> and ' +
                      '<b>meta</b> files in order to recreate the project again.</p>' +
                      '<p>Alternatively you can downgrade the application and export the project as CSV or WHP files.</p>'
            if (json_version !== false) {
                msg += '<p>The file version is: <b>' + json_version + '</b>';
            }
            rmdir(loc.proj_files, function(err) {  // remove garbage
                if (err) {
                    msg += 'The project file temp folder could not be removed'
                }
                self.web_contents.send('show-modal', {
                    type: 'ERROR',
                    msg_type: 'html',
                    msg: msg
                });
            });
        } else {
            self.web_contents.send('go-to-bokeh');
        }
    },

    save_file: function(arg) {
        var self = this;
        if (typeof(arg) !== 'undefined' && 'save_from' in arg) {
            self.save_from = arg.save_from;
        }
        return new Promise((resolve, reject) => {
            var project_file = data.get('project_file', loc.proj_settings);
            var file_path = false;
            if (project_file !== false) {
                file_path = tools.file_to_path(project_file);
            }
            lg.info('>> URL PROJECT FILE: ' + file_path);
            if (file_path !== false && fs.existsSync(file_path)) {
                try {
                    zip.zipSync(loc.proj_files, file_path);
                    self.web_contents.send('enable-watcher', { 'mark': 'saved' });
                    lg.warn('>> SAVE FROM VALUE: ' + self.save_from);
                    if (typeof(self.save_from) !== 'undefined' && self.save_from == 'closing_process') {
                        self.web_contents.send('show-project-saved-dialog')
                    } else {
                        self.web_contents.send('show-snackbar', {'msg': 'The project was saved correctly' });
                    }
                } catch(err) {
                    self.web_contents.send('show-modal', {
                        'type': 'ERROR',
                        'msg': 'The file could not be saved!'
                    });
                }
                resolve(true);
            } else {
                self.save_file_as();
            }
        });
    },

    save_file_as: function(arg) {
        lg.info('-- SAVE FILE AS');
        var self = this;
        if (typeof(arg) !== 'undefined' && 'save_from' in arg) {
            self.save_from = arg.save_from;
        } else {
            lg.warn('>> NO SAVE FROM save_file')
        }
        return new Promise((resolve, reject) => {
            var settings = data.load(loc.proj_settings);  // use settings only to read
            dialog.showSaveDialog({
                title: 'Save Project',
                defaultPath: '~/examples/' + settings.project_name + '.aqc',    // TODO >> previuos opened folder?? https://github.com/electron/electron/issues/1541
                filters: [{ extensions: ['aqc'] }]
            }).then((results) => {
                if (results['canceled'] === false) {
                    var file_path = results['filePath'];
                    lg.info('Saving project at: ' + file_path);
                    if (typeof(file_path) !== 'undefined') {
                        try {
                            // data.set({'project_state': 'saved', }, loc.proj_settings);
                            self.zip_aqc_file(loc.proj_files, file_path);
                        } catch(err) {
                            self.web_contents.send('show-modal', {
                                'type': 'ERROR',
                                'msg': 'The file could not be saved!<br />' + err,
                                'msg_type': 'html'
                            });
                            reject(new Error('The file could not be saved!'));
                        }
                    }
                }
                resolve(true);
            });
        });
    },

    /**
     * @param src_folder - temp folder where the project is stored
     * @param zip_file_path - where the aqc file will be stored
     */
    zip_aqc_file: async function(src_folder, zip_file_path) {

        // remove the previous aqc file if it exists
        try {
            await fs_promises.access(zip_file_path);
            await fs_promises.unlink(zip_file_path);
            console.log('Archivo existente eliminado.');
        } catch (err) {
            if (err.code !== 'ENOENT') {
                self.web_contents.send('show-modal', {
                    'type': 'ERROR',
                    'msg': 'The file that you want to create already exists and could not be replaced.<br />' + err,
                    'type': 'html'
                });
            }
        }

        var self = this;
        cross_zip.zip(src_folder, zip_file_path, function(err) {
            if (err) {
                self.web_contents.send('show-modal', {
                    'type': 'ERROR',
                    'msg': 'The project could not be zipped in order to save it.<br />' + err,
                    'type': 'html'
                });
            } else {
                fs.access(zip_file_path, fs.constants.F_OK, (err) => {  // to check if the file was correctly created
                    if (err) {
                        self.web_contents.send('show-modal', {
                            'type': 'ERROR',
                            'msg': 'The project could not be created.<br />' + err,
                            'type': 'html'
                        });
                    } else {
                        var file_path = file_url(zip_file_path);
                        self.web_contents.send('disable-watcher');  // I do not why, but this is necessary
                        data.write_promise({'project_file': file_path }).then((value) => {
                            if (value == true) {
                                self.web_contents.send('enable-watcher', {'mark': 'saved'});
                                lg.warn('>> SELF.SAVE_FROM: ' + self.save_from);
                                if (typeof(self.save_from) !== 'undefined' && self.save_from == 'closing_process') {
                                    self.web_contents.send('show-project-saved-dialog')
                                } else {
                                    self.web_contents.send('show-snackbar', {
                                        'msg': 'The project was saved correctly'
                                    });
                                }
                            }
                        });
                    }
                });
            }
        });
    },

    save_file_as_caught: function() {
        var self = this;
        self.save_file_as(self).then(function () {
             return true;
        }).catch(function (e) {
             lg.warn('Save file as Promise Rejected: ' + e);
             return false;
        });
    },

    export_moves_dialog: function() {
        var self = this;
        lg.info('-- EXPORT MOVES --');
        var project_name = data.get('project_name', loc.proj_settings);
        var moves_name = '';
        if (project_name === false) {
            moves_name = 'moves.csv';
        } else {
            moves_name = project_name + '_moves.csv';
        }
        dialog.showSaveDialog({
                title: 'Save Project',
                defaultPath: '~/' + moves_name,
                filters: [{ extensions: ['csv'] }]
            }).then((results) => {
                if (results['canceled'] === false) {
                    self.export_moves(results);
                }
            }
        );
    },

    export_moves: function (results) {
        var self = this;
        var fileLocation = results['filePath'];
        if (typeof(fileLocation) !== 'undefined') {
            lg.info('>> No debe entrar por aquí ??');
            var moves_path = path.join(loc.proj_files, 'moves.csv')

            var read = fs.createReadStream(moves_path);
            read.on("error", function(err) {
                self.web_contents.send('show-modal', {
                    'type': 'ERROR',
                    'msg': 'The file could not be saved!'
                });
            });

            var write = fs.createWriteStream(fileLocation);
            write.on("error", function(err) {
                self.web_contents.send('show-modal', {
                    'type': 'ERROR',
                    'msg': 'The file could not be saved!'
                });
            });
            write.on("close", function(ex) {
                self.web_contents.send('show-snackbar', {'msg': 'File saved!'});
            });
            read.pipe(write);
        }
    },

    close_project: function() {
        var self = this;
        lg.info('-- CLOSE PROJECT');
        var project_state = data.get('project_state', loc.shared_data);
        if(project_state == 'modified'){
            self.web_contents.send('show-modal-close-project-form', {
                'title': 'Changes not saved!',
                'msg': 'Would you like to save the project changes before closing the project?'
            });
        }else{
            self.web_contents.send('disable-watcher');
            rmdir(loc.proj_files, function(err) {
                if (err) {
                    self.web_contents.send('show-modal', {
                        type: 'ERROR',
                        msg: 'The temporal folder could not be removed:',
                        code: err
                    });
                    return false;
                }
                self.web_contents.send('reset-bokeh-cruise-data');
            });
        }
    },
};