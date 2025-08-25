// //////////////////////////////////////////////////////////////////////
//  License, authors, contributors and copyright information at:       //
//  AUTHORS and LICENSE files at the root folder of this application   //
// //////////////////////////////////////////////////////////////////////

"use strict";

const loc = require('locations');

const { createLogger, format, transports } = require('winston');
const { combine, printf } = format;

const lg_format = printf(({ level, message, timestamp }) => {
    return `${timestamp} NODE - ${level.toUpperCase()}: ${message}`;
});

const datetime_format = () => new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
}).format(new Date());

const logger = createLogger({
    level: 'info',
    format: combine(format.timestamp({ format: datetime_format }), lg_format),
    transports: [
        // new transports.Console(),                    // Log to the console
        new transports.File({ filename: loc.log_js })   // Log to a file
    ]
});

module.exports = logger


