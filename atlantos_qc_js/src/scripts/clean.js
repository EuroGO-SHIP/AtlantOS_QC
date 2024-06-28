// //////////////////////////////////////////////////////////////////////
//  License, authors, contributors and copyright information at:       //
//  AUTHORS and LICENSE files at the root folder of this application   //
// //////////////////////////////////////////////////////////////////////

"use strict";

const chalk = require("chalk")
const fs = require('fs').promises;

async function clean(folder_path) {
    try {
        await fs.rm(folder_path, { recursive: true, force: true });
        console.log(`${chalk.yellow("WARNING")}: dist folder removed if it existed.`);
    } catch (error) {
        console.error(`${chalk.red("ERROR")}: the dist folder could not be removed: `, error);
    }
}
clean('dist');