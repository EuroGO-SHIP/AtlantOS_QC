// //////////////////////////////////////////////////////////////////////
//  License, authors, contributors and copyright information at:       //
//  AUTHORS and LICENSE files at the root folder of this application   //
// //////////////////////////////////////////////////////////////////////

/**
 * Check if the log file has exceeded the line limit, then find the latest file
 * to determine the next file name sequentially (e.g., debug_js_0.log, debug_js_1.log).
 * Rename the file once we have the new name.
 */


const fs = require('fs').promises;
const path = require('path');
const loc = require('locations');


async function count_lines(filename) {
    try {
        const data = await fs.readFile(filename, 'utf8');
        const lines = data.split('\n');
        return lines.length;
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.error('The file does not exist:', filename);
        } else {
            console.error('Error counting file lines:', error);
        }
        return 0;
    }
}

async function check_last_file_number(file_path) {
    const fileNameWithoutExt = path.basename(file_path, path.extname(file_path));
    var seq = 0
    while (seq < 10000) {
        try {
            var new_path = path.join(loc.logs_folder, `${fileNameWithoutExt}_${seq}.log`)
            console.log('NEW PATH: ' + new_path);
            await fs.access(new_path)
        } catch (error) {
            if (error.code === 'ENOENT') {
                return new_path;
            } else {
                return error;
            }
        }
        console.log('SEQ' + seq);
        seq++;
    }
    return '';
}

async function split_log_file(log_file_path) {
    console.log('>> SPLIT LOG FILE: ' + log_file_path)
    try {
        console.log('00')
        await fs.access(log_file_path);
        console.log('01')
        var line_count = await count_lines(log_file_path);
        console.log('LINE COUNT: ' + line_count)
        console.log('03')
        if (line_count > 10) {
            var new_file_name = await check_last_file_number(log_file_path);
            console.log('04')
            if (new_file_name !== '') {
                console.log('05')
                await fs.rename(log_file_path, new_file_name);
            }
            console.log('06')
        }
        console.log('07')
    } catch (error) {
        if (error.code === 'ENOENT') {
            return error;
        } else {
            console.error('Error renaming the file: ', error);
            return;
        }
    }
}

module.exports = { split_log_file };