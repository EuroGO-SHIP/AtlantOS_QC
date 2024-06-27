// //////////////////////////////////////////////////////////////////////
//  License, authors, contributors and copyright information at:       //
//  AUTHORS and LICENSE files at the root folder of this application   //
// //////////////////////////////////////////////////////////////////////

"use strict";

const { BrowserWindow, dialog } = require('electron');
const path = require('path');
const util = require('util');
const fs = require('fs');
const file_url = require('file-url');           // converts file path to file:// protocol,
                                                // use fileToPath() function for the opposite
const db = require('mime-db');
const mime = require('mime-type')(db);
const {URL} = require('url');                   // constructor > fs recognise the file:// url built with this
const cross_zip = require('cross-zip');         // it does not work on Windows 7 by default

const loc = require('locations');
const lg = require('logging');
const data = require('data');

const tools = require('../renderer_modules/tools');


module.exports = {
    init: function(web_contents, server, main_window) {
        var self = this;
        self.web_contents = web_contents;
        self.server = server;
        self.main_window = main_window;
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

    open_dialog: async function(main_window) {
        lg.info('-- OPEN FILE');
        var self = this;
        try {
            const options = {
                title: 'Open file...',
                filters: [{ name: 'AtlantOS Ocean Data QC file', extensions: ['aqc', 'csv', 'xlsx', 'ods'] }],
                properties: ['openFile'],
                modal: true
            };
            const result = await dialog.showOpenDialog(main_window, options);
            if (!result.canceled) {
                self.open_file(result.filePaths);
            }
        } catch (error) {
            self.web_contents.send('show-modal', {
                type: 'ERROR',
                msg: 'Error opening dialog:',
                code: error.stack
            });
        }
    },

    open_file: async function (file_paths) {
        lg.info('-- OPEN FILE');
        var self = this;
        if (JSON.stringify(file_paths) == '[]') return;
        self.web_contents.send('show-wait-cursor');
        try {
            const folder_exists = await data.f_exists(loc.proj_files);
            if (folder_exists) {
                await fs.promises.rm(loc.proj_files, { recursive: true, force: true });
            }
            self.open_by_mime_type(file_paths[0]);
        } catch (error) {
            self.web_contents.send('show-modal', {
                type: 'ERROR',
                msg: 'The project file temp folder could not be checked or removed:',
                code: error.stack
            });
            self.web_contents.send('show-default-cursor');
        }
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

    check_aqc_version: async function() {
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
            self.web_contents.send('show-modal', {
                type: 'ERROR',
                msg_type: 'html',
                msg: msg
            });

            try {
                await fs.promises.rm(loc.proj_files, { recursive: true, force: true });
            } catch (error) {
                self.web_contents.send('show-modal', {
                    type: 'ERROR',
                    msg: 'Error removing temporal folder.' +
                         ' Make sure the files are not being used by another application: ',
                    code: error.stack
                });
            }
        } else {
            self.web_contents.send('go-to-bokeh');
        }
    },

    save_file: async function(arg) {
        lg.info('-- SAVE FILE');
        var self = this;
        if (typeof(arg) !== 'undefined' && 'save_from' in arg) {
            self.save_from = arg.save_from;
        }
        const project_file = data.get('project_file', loc.proj_settings);
        if (!project_file) {
            self.save_file_as();
            return;
        }
        const file_path = project_file ? tools.file_to_path(project_file) : false;

        lg.info('>> PROJECT FILE PATH: ' + file_path);
        try {
            await self.zip_aqc_file(loc.proj_files, file_path);
        } catch (error) {
            self.web_contents.send('show-modal', {
                type: 'ERROR',
                msg: 'The file could not be saved!',
                code: error.stack
            });
        }

    },

    save_file_as: async function(arg) {
        lg.info('-- SAVE FILE AS');
        var self = this;
        if (typeof(arg) !== 'undefined' && 'save_from' in arg) {
            self.save_from = arg.save_from;
        } else {
            lg.warn('>> NO SAVE FROM save_file')
        }
        var settings = data.load(loc.proj_settings);  // use settings only to read
        const options = {
            title: 'Save Project',
            defaultPath: '~/examples/' + settings.project_name + '.aqc',    // TODO >> previuos opened folder?? https://github.com/electron/electron/issues/1541
            filters: [{ extensions: ['aqc'] }],
            modal: true
        }
        try {
            var results = await dialog.showSaveDialog(self.main_window, options);
            if (results['canceled'] === false) {
                var file_path = results['filePath'];
                lg.info('Saving project at: ' + file_path);
                if (typeof(file_path) !== 'undefined') {
                    await self.zip_aqc_file(loc.proj_files, file_path);
                    // data.set({'project_state': 'saved', }, loc.proj_settings);
                }
            }
        } catch(error) {
            self.web_contents.send('show-modal', {
                type: 'ERROR',
                msg: 'The file could not be saved.',
                code: error.stack
            });
        }
    },

    /**
     * @param src_folder - temp folder where the project is stored
     * @param zip_file_path - where the aqc file will be stored
     */
    zip_aqc_file: async function(src_folder, zip_file_path) {
        var self = this;
        try {
            if(data.f_exists(zip_file_path)) {
                await fs.promises.unlink(zip_file_path);
            }
        } catch (error) {
            if (error.code !== 'ENOENT') {
                self.web_contents.send('show-modal', {
                    type: 'ERROR',
                    msg: 'The file that you want to save already exists and could not be replaced.',
                    code: error.stack
                });
                return;
            }
        }
        var zip = util.promisify(cross_zip.zip);
        await zip(src_folder, zip_file_path);
        // self.web_contents.send('enable-watcher', { 'mark': 'saved' });
        lg.warn('>> SAVE FROM VALUE: ' + self.save_from);
        var f_url = file_url(zip_file_path);
        self.web_contents.send('disable-watcher');  // I do not why, but this is necessary
        try {
            await data.write_async({'project_file': f_url });
        } catch(error) {
            self.web_contents.send('show-modal', {
                type: 'ERROR',
                msg: 'The file could not be zipped!',
                code: error.stack
            });
        }
        self.web_contents.send('enable-watcher', {'mark': 'saved'});
        lg.warn('>> SELF.SAVE_FROM: ' + self.save_from);

        if (typeof(self.save_from) !== 'undefined' && self.save_from == 'closing_process') {
            self.web_contents.send('show-project-saved-dialog')
        } else {
            self.web_contents.send('show-snackbar', {
                msg: 'The project was saved correctly'
            });
        }
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

    close_project: async function() {
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
            try {
                await fs.promises.rm(loc.proj_files, { recursive: true, force: true });
                self.web_contents.send('reset-bokeh-cruise-data');
            } catch (error) {
                self.web_contents.send('show-modal', {
                    type: 'ERROR',
                    msg: 'The temporal folder could not be removed:',
                    code: error.stack
                });
            }
        }
    },
};