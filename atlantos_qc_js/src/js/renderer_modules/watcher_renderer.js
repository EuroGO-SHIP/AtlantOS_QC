// //////////////////////////////////////////////////////////////////////
//  License, authors, contributors and copyright information at:       //
//  AUTHORS and LICENSE files at the root folder of this application   //
// //////////////////////////////////////////////////////////////////////

"use strict";

const path = require('path');
const app_module_path = require('app-module-path');
app_module_path.addPath(__dirname);

const watch = require('node-watch');
const fs = require('fs');

const lg = require('logging');
const loc = require('locations');
const data = require('data');


module.exports = {
    enable_watcher: function (mark=false) {
        // when the watcher is enable the changes should be already saved
        // * mark: 'saved' or 'modified'
        var self = this;
        lg.info('-- WATCHER ENABLED');
        lg.info('>> MARK: ' + mark);
        var bullet = '• '
        if (typeof(mark) === 'undefined' || mark == 'saved' || mark === false) {
            bullet = '';
        }
        var project_name = data.get('project_name', loc.proj_settings);
        document.title = bullet + project_name + ' - AtlantosQC!'
        data.set({'project_state': mark}, loc.shared_data);

        if (typeof(self.watcher) !== 'undefined' && !self.watcher.isClosed()) {
            self.watcher.close();  // async???
        }

        self.watcher = watch(loc.proj_files, function(event, name) {  // event = 'update', name = 'modified path file'
            lg.info('-- WATCHER CALLBACK >> EVENT: ' + event + ' | FILE: ' + name);
            if (path.join(loc.proj_upd, 'original.csv') != name) {     // avoid mark as modified when the new csv file is created
                                                                       // TODO: fin a better way to do this
                if (typeof(self.watcher) != 'undefined' && !self.watcher.isClosed()) {
                    self.watcher.close();
                }
                if (fs.existsSync(loc.proj_settings)) {  // if the window is closed maybe the projec file was already deleted
                    var project_name = data.get('project_name', loc.proj_settings);
                    document.title = '• ' + project_name + ' - AtlantosQC!';
                    data.set({'project_state': 'modified' }, loc.shared_data);
                } else {
                    document.title = 'AtlantosQC!';
                    data.set({'project_state': 'saved' }, loc.shared_data);
                }
            }
        });

        self.watcher.on('error', function(err) {
            webContents.send('show-modal', {
                'type': 'ERROR',
                'msg': 'Watcher did not work well<br />' + err
            });
        });
    },

    disable_watcher: function() {
        var self = this;
        lg.info('-- DISABLE WATCHER');
        if (typeof self.watcher != 'undefined' && !self.watcher.isClosed()) {
            self.watcher.close();
            delete self.watcher;
        }
    },
}