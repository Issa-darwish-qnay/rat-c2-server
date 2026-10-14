const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

class Database {
 constructor(dbPath) {
 this.dbPath = dbPath;
 this.db = null;
 }

 init() {
 return new Promise((resolve, reject) => {
 // Create directory if it doesn't exist
 const dir = path.dirname(this.dbPath);
 if (!fs.existsSync(dir)) {
 fs.mkdirSync(dir, { recursive: true });
 }

 this.db = new sqlite3.Database(this.dbPath, (err) => {
 if (err) {
 console.error('Database connection error:', err);
 return reject(err);
 }

 // Create tables
 this.db.serialize(() => {
 this.db.run(`
 CREATE TABLE IF NOT EXISTS devices (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 uuid TEXT UNIQUE NOT NULL,
 ip TEXT,
 os TEXT,
 user_agent TEXT,
 first_seen TEXT,
 last_seen TEXT,
 status TEXT DEFAULT 'active'
 )
 `);

 this.db.run(`
 CREATE TABLE IF NOT EXISTS data (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 device_id INTEGER,
 type TEXT,
 content TEXT,
 timestamp TEXT,
 FOREIGN KEY(device_id) REFERENCES devices(id)
 )
 `);

 this.db.run(`
 CREATE TABLE IF NOT EXISTS files (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 device_id INTEGER,
 filename TEXT,
 path TEXT,
 size INTEGER,
 type TEXT,
 timestamp TEXT,
 FOREIGN KEY(device_id) REFERENCES devices(id)
 )
 `);

 this.db.run(`
 CREATE TABLE IF NOT EXISTS commands (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 device_id INTEGER,
 command TEXT,
 status TEXT DEFAULT 'pending',
 result TEXT,
 timestamp TEXT,
 FOREIGN KEY(device_id) REFERENCES devices(id)
 )
 `);
 });

 console.log('Database initialized successfully');
 resolve();
 });
 });
 }

 addDevice(deviceInfo) {
 return new Promise((resolve, reject) => {
 const now = new Date().toISOString();
 this.db.run(
 `INSERT OR IGNORE INTO devices (uuid, ip, os, user_agent, first_seen, last_seen)
 VALUES (?, ?, ?, ?, ?, ?)`,
 [deviceInfo.uuid, deviceInfo.ip, deviceInfo.os, deviceInfo.userAgent, now, now],
 function(err) {
 if (err) return reject(err);
 resolve(this.lastID);
 }
 );
 });
 }

 updateDeviceLastSeen(uuid) {
 return new Promise((resolve, reject) => {
 const now = new Date().toISOString();
 this.db.run(
 `UPDATE devices SET last_seen = ? WHERE uuid = ?`,
 [now, uuid],
 function(err) {
 if (err) return reject(err);
 resolve(this.changes);
 }
 );
 });
 }

 addData(deviceId, type, content) {
 return new Promise((resolve, reject) => {
 const now = new Date().toISOString();
 this.db.run(
 `INSERT INTO data (device_id, type, content, timestamp)
 VALUES (?, ?, ?, ?)`,
 [deviceId, type, JSON.stringify(content), now],
 function(err) {
 if (err) return reject(err);
 resolve(this.lastID);
 }
 );
 });
 }

 addFile(deviceId, filename, path, size, type) {
 return new Promise((resolve, reject) => {
 const now = new Date().toISOString();
 this.db.run(
 `INSERT INTO files (device_id, filename, path, size, type, timestamp)
 VALUES (?, ?, ?, ?, ?, ?)`,
 [deviceId, filename, path, size, type, now],
 function(err) {
 if (err) return reject(err);
 resolve(this.lastID);
 }
 );
 });
 }

 getDevices() {
 return new Promise((resolve, reject) => {
 this.db.all(
 `SELECT * FROM devices ORDER BY last_seen DESC`,
 [],
 (err, rows) => {
 if (err) return reject(err);
 resolve(rows);
 }
 );
 });
 }

 getDeviceByUUID(uuid) {
 return new Promise((resolve, reject) => {
 this.db.get(
 `SELECT * FROM devices WHERE uuid = ?`,
 [uuid],
 (err, row) => {
 if (err) return reject(err);
 resolve(row);
 }
 );
 });
 }

 getDeviceData(deviceId) {
 return new Promise((resolve, reject) => {
 this.db.all(
 `SELECT * FROM data WHERE device_id = ? ORDER BY timestamp DESC`,
 [deviceId],
 (err, rows) => {
 if (err) return reject(err);
 resolve(rows);
 }
 );
 });
 }

 getDeviceFiles(deviceId) {
 return new Promise((resolve, reject) => {
 this.db.all(
 `SELECT * FROM files WHERE device_id = ? ORDER BY timestamp DESC`,
 [deviceId],
 (err, rows) => {
 if (err) return reject(err);
 resolve(rows);
 }
 );
 });
 }

 addCommand(deviceId, command) {
 return new Promise((resolve, reject) => {
 const now = new Date().toISOString();
 this.db.run(
 `INSERT INTO commands (device_id, command, timestamp)
 VALUES (?, ?, ?)`,
 [deviceId, command, now],
 function(err) {
 if (err) return reject(err);
 resolve(this.lastID);
 }
 );
 });
 }

 getPendingCommands(deviceId) {
 return new Promise((resolve, reject) => {
 this.db.all(
 `SELECT * FROM commands WHERE device_id = ? AND status = 'pending'`,
 [deviceId],
 (err, rows) => {
 if (err) return reject(err);
 resolve(rows);
 }
 );
 });
 }

 updateCommandStatus(commandId, status, result = null) {
 return new Promise((resolve, reject) => {
 this.db.run(
 `UPDATE commands SET status = ?, result = ? WHERE id = ?`,
 [status, result, commandId],
 function(err) {
 if (err) return reject(err);
 resolve(this.changes);
 }
 );
 });
 }
}

module.exports = Database;
