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

const { dialog } = require('@electron/remote');
const fs = require('fs');
const xlsx = require('xlsx');
const csv_parse = require('csv-parse');  // it is included in "csv" nodejs package

const data_renderer = require('data_renderer');
const lg = require('logging');
const loc = require('locations');
const tools = require('tools');
const data = require('data');


module.exports = {
    export_excel: function(format='xlsx') {
        lg.info('-- EXPORT EXCEL')
        var self = this;
        self.format = format;
        self.wb = xlsx.utils.book_new();

        var data_path = path.join(loc.proj_files, 'export_data.csv');
        fs.readFile(data_path, (err, buffer) => {
            if (err) {
                tools.show_modal({
                    'msg_type': 'text',
                    'type': 'ERROR',
                    'msg': 'The data.csv file could not be read.',
                });
            } else {
                // var s = buffer.toString('utf8');
                var options = {
                    comment: '#',
                    trim: true,
                    skip_empty_lines: true,
                    delimiter: ','
                };
                // All the cells are exported as text
                csv_parse(buffer, options, function(err, records){      // TODO: check if utf8?
                    if (err) {
                        tools.show_modal({
                            'msg_type': 'text',
                            'type': 'ERROR',
                            'msg': 'The data.csv file could not be converted to JSON in order to export it.'
                        });
                    } else {
                        var ws = xlsx.utils.aoa_to_sheet(records);
                        xlsx.utils.book_append_sheet(self.wb, ws, 'Sheet1');
                        self.append_metadata();
                    }
                });
            }
        });
    },

    append_metadata: function() {
        var self = this;
        fs.readFile(loc.proj_metadata, (err, chunk) => {
            if (err) {
                tools.show_modal({
                    'msg_type': 'text',
                    'type': 'ERROR',
                    'msg': 'The metadata file could not be read.',
                });
            } else {
                var s = chunk.toString('utf8');
                s = s.replace('\r', '');
                var arr = s.split('\n')

                //                  col1            col2
                // aoa structure: [['elem1', ...], ['elem2', ...]]
                // alternative, json structure: {'A1': ['elem1', 'elem2', ...]}

                var new_arr = []
                $.each(arr, function(key, line) {
                    line = line.trim();
                    if (line != '') {
                        if (line.substring(0, 2) != '# ') {
                            new_arr.push(['# ' + line]);
                        } else {
                            new_arr.push([line]);
                        }
                    }
                });
                var ws_meta = xlsx.utils.aoa_to_sheet(new_arr);
                xlsx.utils.book_append_sheet(self.wb, ws_meta, 'Sheet2');

                var export_path = path.join(loc.proj_files, 'export_data') + '.' + self.format;
                xlsx.writeFile(self.wb, export_path, {
                    type: 'file',           // >> write in buffer?
                    bookType: self.format
                });
                data_renderer.export_excel_format_dialog(self.format);
            }
        });
    },

    export_pdf_file: function() {
        var self = this;
        lg.info('-- EXPORT PDF FILE (server_renderer.js)');

        $('#bokeh_iframe').fadeOut('slow', function() {
            $('.loader_container').fadeIn('slow', function() {
                var params = {
                    'object': 'bokeh.export',
                    'method': 'export_pdf',
                }
                tools.call_promise(params).then((result) => {
                    if (result != null && typeof(result['success']) !== 'undefined') {
                        lg.info('SUCCESS VALUE: ' + result['success']);
                        self.save_pdf_dialog();
                    }
                });
            });
        });
    },

    export_svg: function() {
        var self = this;
        lg.info('-- EXPORT PDF FILE (server_renderer.js)');

        $('#bokeh_iframe').fadeOut('slow', function() {
            $('.loader_container').fadeIn('slow', function() {
                var params = {
                    'object': 'bokeh.export',
                    'method': 'export_svg_as_zip',
                }
                tools.call_promise(params).then((result) => {
                    if (result != null && typeof(result['success']) !== 'undefined') {
                        lg.info('SUCCESS VALUE: ' + result['success']);
                        self.save_zip_dialog('svg');
                    }
                });
            });
        });
    },

    export_png: function() {
        var self = this;
        lg.info('-- EXPORT PDF FILE (server_renderer.js)');

        $('#bokeh_iframe').fadeOut('slow', function() {
            $('.loader_container').fadeIn('slow', function() {
                var params = {
                    'object': 'bokeh.export',
                    'method': 'export_png_as_zip',
                }
                tools.call_promise(params).then((result) => {
                    if (result != null && typeof(result['success']) !== 'undefined') {
                        lg.info('SUCCESS VALUE: ' + result['success']);
                        self.save_zip_dialog('png');
                    }
                });
            });
        });
    },

    get_tab_images: function() {
        lg.info('-- GET TAB IMAGES');
        var self = this;
        self.tabs_order = []
        self.tabs_images = {}

        var iframe = $("#bokeh_iframe").contents();
        var tabs_title = iframe.find('.bk-tabs-header .bk-tab');
        $.each(tabs_title, function(tab_title_index, tab_title_dom) {
            self.tabs_order.push($(tab_title_dom).html())
        });
        var tabs = iframe.find(".tabs_widget_col>div>div:not('.bk-tabs-header')");

        $.each(tabs, function(tab_index, tab_dom){
            var canvas_dom = $(tab_dom).find('canvas.bk');  // there are two canvas
            var images = []
            $.each(canvas_dom, function(canvas_key, canvas){
                images.push(canvas.toDataURL("image/png", 1.0));
            });
            self.tabs_images[self.tabs_order[tab_index]] = images;
            images = [];
        });
    },

    save_pdf_dialog: function() {
        lg.warn('-- SAVE PDF')
        var self = this;
        var project_name = data.get('project_name', loc.proj_settings);
        var moves_name = '';
        if (project_name === false) {
            moves_name = 'plot_images.pdf';
        } else {
            moves_name = project_name + '_plot_images.pdf';
        }
        dialog.showSaveDialog({
            title: 'Export plots in pdf',
            defaultPath: '~/' + moves_name,
            filters: [{ extensions: ['pdf'] }]
        }).then((results) => {
            if (results['canceled'] === false) {
                self.save_pdf(results);
            } else {
                tools.hide_loader();
            }
        });
    },

    save_zip_dialog: function(img_type='svg') {
        lg.warn('-- SAVE PDF')
        var self = this;
        var project_name = data.get('project_name', loc.proj_settings);
        var moves_name = '';
        if (project_name === false) {
            moves_name = `plot_${img_type}.zip`;
        } else {
            moves_name = project_name + `_plot_${img_type}.zip`;
        }
        dialog.showSaveDialog({
            title: 'Export plots in zip',
            defaultPath: '~/' + moves_name,
            filters: [{ extensions: ['zip'] }]
        }).then((results) => {
            if (results['canceled'] === false) {
                self.save_zip(results, img_type);
            } else {
                tools.hide_loader();
            }
        });
    },

    save_pdf: function (results) {
        var self = this;
        var fileLocation = results['filePath'];
        if (typeof(fileLocation) !== 'undefined') {
            var exported_pdf_path = path.join(loc.proj_export, 'plots.pdf')

            var read = fs.createReadStream(exported_pdf_path);
            read.on("error", function(err) {
                tools.show_modal({
                    'type': 'ERROR',
                    'msg': 'The file could not be saved!'
                });
                tools.hide_loader();
            });

            var write = fs.createWriteStream(fileLocation);
            write.on("error", function(err) {
                tools.show_modal({
                    'type': 'ERROR',
                    'msg': 'The file could not be saved!'
                });
                tools.hide_loader();
            });
            write.on("close", function(ex) {
                tools.show_snackbar('File saved!<br />' + exported_pdf_path);
                tools.hide_loader();
            });
            read.pipe(write);
        }
    },

    save_zip: function (results, img_type='svg') {
        var self = this;
        var fileLocation = results['filePath'];
        if (typeof(fileLocation) !== 'undefined') {
            var exported_zip_path = path.join(loc.proj_export, `plots_${img_type}.zip`)

            var read = fs.createReadStream(exported_zip_path);
            read.on("error", function(err) {
                tools.show_modal({
                    'type': 'ERROR',
                    'msg': 'The file could not be saved!'
                });
                tools.hide_loader();
            });

            var write = fs.createWriteStream(fileLocation);
            write.on("error", function(err) {
                tools.show_modal({
                    'type': 'ERROR',
                    'msg': 'The file could not be saved!'
                });
                tools.hide_loader();
            });
            write.on("close", function(ex) {
                tools.show_snackbar('File saved!<br />' + exported_zip_path);
                tools.hide_loader();
            });
            read.pipe(write);
        }
    }
}