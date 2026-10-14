const fs = require('fs');
const path = require('path');

class Logger {
 constructor(logDir) {
 this.logDir = logDir;
 if (!fs.existsSync(this.logDir)) {
 fs.mkdirSync(this.logDir, { recursive: true });
 }
 }

 log(message, level = 'info') {
 const timestamp = new Date().toISOString();
 const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}\n`;

 // Console output
 console.log(logMessage.trim());

 // File output
 const logFile = path.join(this.logDir, `${new Date().toISOString().split('T')[0]}.log`);
 fs.appendFileSync(logFile, logMessage);
 }

 error(message) {
 this.log(message, 'error');
 }

 warn(message) {
 this.log(message, 'warn');
 }

 debug(message) {
 this.log(message, 'debug');
 }

 deviceLog(uuid, message, level = 'info') {
 const deviceLogDir = path.join(this.logDir, 'devices');
 if (!fs.existsSync(deviceLogDir)) {
 fs.mkdirSync(deviceLogDir, { recursive: true });
 }

 const logFile = path.join(deviceLogDir, `${uuid}.log`);
 const timestamp = new Date().toISOString();
 const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}\n`;

 fs.appendFileSync(logFile, logMessage);
 }
}

module.exports = Logger;
