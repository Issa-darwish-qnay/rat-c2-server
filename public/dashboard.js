// Global variables
let devices = [];
let commands = [];
let logs = [];

// DOM Elements
const devicesList = document.getElementById('devices-list');
const commandsList = document.getElementById('commands-list');
const logContent = document.getElementById('log-content');
const totalDevices = document.getElementById('total-devices');
const activeDevices = document.getElementById('active-devices');
const totalFiles = document.getElementById('total-files');
const commandDeviceSelect = document.getElementById('command-device');

// Initialize the dashboard
document.addEventListener('DOMContentLoaded', function() {
 loadDevices();
 loadCommands();
 loadLogs();
 setInterval(loadDevices, 10000); // Refresh every 10 seconds
});

// Tab switching
function openTab(tabName) {
 const tabContents = document.querySelectorAll('.tab-content');
 tabContents.forEach(content => {
 content.style.display = 'none';
 });

 const tabButtons = document.querySelectorAll('.tab-button');
 tabButtons.forEach(button => {
 button.classList.remove('active');
 });

 document.getElementById(tabName).style.display = 'block';
 event.currentTarget.classList.add('active');
}

// Load devices from server
async function loadDevices() {
 try {
 const response = await fetch('/api/devices');
 devices = await response.json();

 // Update stats
 totalDevices.textContent = devices.length;
 activeDevices.textContent = devices.filter(d => d.status === 'active').length;

 // Update devices list
 renderDevices();

 // Update command device select
 updateCommandDeviceSelect();
 } catch (error) {
 console.error('Error loading devices:', error);
 }
}

// Render devices table
function renderDevices() {
 devicesList.innerHTML = '';

 devices.forEach(device => {
 const row = document.createElement('tr');

 const lastSeen = new Date(device.last_seen);
 const now = new Date();
 const diffMinutes = Math.floor((now - lastSeen) / (1000 * 60));

 let statusClass = 'status-active';
 let statusText = 'Active';

 if (diffMinutes > 5) {
 statusClass = 'status-inactive';
 statusText = 'Inactive';
 }

 row.innerHTML = `
 <td>${device.uuid}</td>
 <td>${device.ip}</td>
 <td>${device.os}</td>
 <td>${lastSeen.toLocaleString()}</td>
 <td><span class="${statusClass}">${statusText}</span></td>
 <td class="actions">
 <button class="view-btn" onclick="viewDevice('${device.uuid}')">View</button>
 <button class="files-btn" onclick="viewFiles('${device.uuid}')">Files</button>
 <button class="logs-btn" onclick="viewLogs('${device.uuid}')">Logs</button>
 </td>
 `;

 devicesList.appendChild(row);
 });
}

// Update command device select
function updateCommandDeviceSelect() {
 commandDeviceSelect.innerHTML = '<option value="">Select Device</option>';

 devices.forEach(device => {
 const option = document.createElement('option');
 option.value = device.uuid;
 option.textContent = `${device.uuid} (${device.os})`;
 commandDeviceSelect.appendChild(option);
 });
}

// Search devices
function searchDevices() {
 const searchTerm = document.getElementById('device-search').value.toLowerCase();
 const filteredDevices = devices.filter(device =>
 device.uuid.toLowerCase().includes(searchTerm) ||
 device.ip.toLowerCase().includes(searchTerm) ||
 device.os.toLowerCase().includes(searchTerm)
 );

 // Simple implementation - in a real app you'd want to render only filtered devices
 console.log('Search term:', searchTerm);
 console.log('Filtered devices:', filteredDevices);
}

// Load commands from server
async function loadCommands() {
 try {
 const response = await fetch('/api/commands');
 commands = await response.json();
 renderCommands();
 } catch (error) {
 console.error('Error loading commands:', error);
 }
}

// Render commands table
function renderCommands() {
 commandsList.innerHTML = '';

 commands.forEach(command => {
 const row = document.createElement('tr');

 let statusClass = '';
 if (command.status === 'completed') statusClass = 'status-active';
 if (command.status === 'failed') statusClass = 'status-inactive';

 row.innerHTML = `
 <td>${command.device_uuid}</td>
 <td>${command.command}</td>
 <td><span class="${statusClass}">${command.status}</span></td>
 <td>${command.result ? command.result.substring(0, 50) + '...': 'N/A'}</td>
 <td>${new Date(command.timestamp).toLocaleString()}</td>
 `;

 commandsList.appendChild(row);
 });
}

// Send command to device
async function sendCommand() {
 const deviceUUID = document.getElementById('command-device').value;
 const commandType = document.getElementById('command-type').value;
 const commandInput = document.getElementById('command-input').value;

 if (!deviceUUID || !commandType || !commandInput) {
 alert('Please fill all fields');
 return;
 }

 try {
 const response = await fetch('/api/commands', {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json'
 },
 body: JSON.stringify({
 device_uuid: deviceUUID,
 command: commandInput,
 type: commandType
 })
 });

 if (response.ok) {
 alert('Command sent successfully');
 document.getElementById('command-input').value = '';
 loadCommands();
 } else {
 alert('Failed to send command');
 }
 } catch (error) {
 console.error('Error sending command:', error);
 alert('Error sending command');
 }
}

// View device details
function viewDevice(uuid) {
 window.location.href = `/devices/${uuid}`;
}

// View device files
function viewFiles(uuid) {
 window.location.href = `/files/${uuid}`;
}

// View device logs
function viewLogs(uuid) {
 window.location.href = `/logs/${uuid}`;
}

// Load logs from server
async function loadLogs() {
 try {
 const response = await fetch('/api/logs');
 logs = await response.json();
 renderLogs();
 } catch (error) {
 console.error('Error loading logs:', error);
 logContent.textContent = 'Error loading logs';
 }
}

// Render logs
function renderLogs() {
 if (logs.length === 0) {
 logContent.textContent = 'No logs available';
 return;
 }

 let logText = '';
 logs.forEach(log => {
 const timestamp = new Date(log.timestamp).toLocaleString();
 logText += `[${timestamp}] [${log.level.toUpperCase()}] ${log.message}\n`;
 });

 logContent.textContent = logText;
}

// Search logs
function searchLogs() {
 const searchTerm = document.getElementById('log-search').value.toLowerCase();
 const logLevel = document.getElementById('log-level').value;

 let filteredLogs = logs;

 if (logLevel !== 'all') {
 filteredLogs = filteredLogs.filter(log => log.level === logLevel);
 }

 if (searchTerm) {
 filteredLogs = filteredLogs.filter(log =>
 log.message.toLowerCase().includes(searchTerm)
 );
 }

 // Simple implementation - in a real app you'd want to render only filtered logs
 console.log('Search term:', searchTerm);
 console.log('Log level:', logLevel);
 console.log('Filtered logs:', filteredLogs);
}

// Save settings
async function saveSettings() {
 const telegramToken = document.getElementById('telegram-token').value;
 const telegramChat = document.getElementById('telegram-chat').value;
 const adminUsername = document.getElementById('admin-username').value;
 const adminPassword = document.getElementById('admin-password').value;

 try {
 const response = await fetch('/api/settings', {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json'
 },
 body: JSON.stringify({
 telegram_token: telegramToken,
 telegram_chat: telegramChat,
 admin_username: adminUsername,
 admin_password: adminPassword
 })
 });

 if (response.ok) {
 alert('Settings saved successfully');
 } else {
 alert('Failed to save settings');
 }
 } catch (error) {
 console.error('Error saving settings:', error);
 alert('Error saving settings');
 }
 }
