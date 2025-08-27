const { execSync } = require('child_process');
const { existsSync, mkdirSync, writeFileSync } = require('fs');
const path = require('path');

const browserDir = path.join(__dirname, '..', '..', 'src', 'browser');
const chromeMarker = path.join(browserDir, '.chrome_installed');
const chromedriverMarker = path.join(browserDir, '.chromedriver_installed');

if (!existsSync(browserDir)) {
    mkdirSync(browserDir, { recursive: true });
}

if (!existsSync(chromeMarker)) {
    console.log('Installing Chrome into src/browser...');
    execSync(`yarn dlx @puppeteer/browsers install chrome@stable --path=${browserDir}`, {
        stdio: 'inherit'
    });
    writeFileSync(chromeMarker, 'done');
    console.log('Chrome installed successfully.');
} else {
    console.log('Chrome already installed. Skipping.');
}

if (!existsSync(chromedriverMarker)) {
    console.log('Installing Chromedriver into src/browser...');
    execSync(`yarn dlx @puppeteer/browsers install chromedriver@stable --path=${browserDir}`, {
        stdio: 'inherit'
    });
    writeFileSync(chromedriverMarker, 'done');
    console.log('Chromedriver installed successfully.');
} else {
    console.log('Chromedriver already installed. Skipping.');
}
