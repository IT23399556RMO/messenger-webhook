require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');

const app = express();
const messageLogs = []; // Stores live traffic in memory
app.use(bodyParser.json());

// 1. TOKENS & CREDENTIALS
const VERIFY_TOKEN = process.env.VERIFY_TOKEN; 
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN; 
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN; 
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID; 
const VIBER_TOKEN = process.env.VIBER_TOKEN; 
const INFOBIP_BASE_URL = process.env.INFOBIP_BASE_URL; 

// 2. WEBHOOK VERIFICATION (GET)
app.get('/webhook', (req, res) => {
    let mode = req.query['hub.mode'];
    let token = req.query['hub.verify_token'];
    let challenge = req.query['hub.challenge'];

    if (mode && token) {
        if (mode === 'subscribe' && token === VERIFY_TOKEN) {
            res.status(200).send(challenge);
        } else {
            res.sendStatus(403);
        }
    }
});

// 3. INCOMING MESSAGES (POST)
app.post('/webhook', (req, res) => {
    let body = req.body;

    // --- WHATSAPP LOGIC ---
    if (body.object === 'whatsapp_business_account') {
        res.status(200).send('EVENT_RECEIVED'); 
        
        if (body.entry && body.entry[0].changes && body.entry[0].changes[0].value.messages) {
            let msg = body.entry[0].changes[0].value.messages[0];
            if (msg.type === 'text') {
                let replyText = `Received on WhatsApp: "${msg.text.body}"`;
                sendWhatsAppReply(msg.from, replyText);

                // Log Received
                messageLogs.unshift({ platform: 'WhatsApp', type: 'received', message: msg.text.body, time: new Date().toLocaleTimeString() });
                // Log Sent
                messageLogs.unshift({ platform: 'WhatsApp', type: 'sent', message: replyText, time: new Date().toLocaleTimeString() });                
            }
        }
    } 
    // --- FACEBOOK AND INSTAGRAM LOGIC ---
    else if (body.object === 'page' || body.object === 'instagram') {
        res.status(200).send('EVENT_RECEIVED'); 

        body.entry.forEach(function(entry) {
            if (entry.messaging) {
                let webhook_event = entry.messaging[0];
                if (webhook_event.message && webhook_event.message.is_echo) return;

                if (webhook_event.message && webhook_event.message.text) {
                    let platformName = body.object === 'page' ? 'Facebook' : 'Instagram';
                    let replyText = `Received on ${platformName}: "${webhook_event.message.text}"`;
                    
                    sendFbIgReply(webhook_event.sender.id, webhook_event.recipient.id, replyText);

                    messageLogs.unshift({ platform: platformName, type: 'received', message: webhook_event.message.text, time: new Date().toLocaleTimeString() });   
                    messageLogs.unshift({ platform: platformName, type: 'sent', message: replyText, time: new Date().toLocaleTimeString() });   
                }
            }
        });
    }
    // --- VIBER LOGIC (Infobip Sandbox) ---
    else if (body.results && body.results[0].integrationType === 'VIBER') {
        res.status(200).send('EVENT_RECEIVED'); 
        let msgData = body.results[0];
        
        if (msgData.message && msgData.message.type === 'TEXT') {
            let replyText = `Received on Viber: "${msgData.message.text}"`;
            sendViberReply(msgData.from, replyText);

            messageLogs.unshift({ platform: 'Viber', type: 'received', message: msgData.message.text, time: new Date().toLocaleTimeString() });               
            messageLogs.unshift({ platform: 'Viber', type: 'sent', message: replyText, time: new Date().toLocaleTimeString() });               
        }
    } else {
        res.sendStatus(404);
    }
});

// 4. HELPER FUNCTIONS
function sendFbIgReply(sender_psid, bot_id, responseText) {
    axios.post(`https://graph.facebook.com/v20.0/${bot_id}/messages`, {
        "recipient": { "id": sender_psid }, "messaging_type": "RESPONSE", "message": { "text": responseText }
    }, { headers: { "Authorization": `Bearer ${PAGE_ACCESS_TOKEN}` } }).catch(err => console.error('FB/IG Error:', err.message));
}
function sendWhatsAppReply(sender_phone, responseText) {
    axios.post(`https://graph.facebook.com/v20.0/${WHATSAPP_PHONE_ID}/messages`, {
        "messaging_product": "whatsapp", "to": sender_phone, "type": "text", "text": { "body": responseText }
    }, { headers: { "Authorization": `Bearer ${WHATSAPP_TOKEN}` } }).catch(err => console.error('WhatsApp Error:', err.message));
}
function sendViberReply(sender_phone, responseText) {
    axios.post(`https://${INFOBIP_BASE_URL}/viber/2/messages`, {
        "messages": [{ "sender": "IBSelfServe", "destinations": [{"to": sender_phone}], "content": { "type": "TEXT", "text": responseText } }]
    }, { headers: { "Authorization": `App ${VIBER_TOKEN}`, "Content-Type": "application/json", "Accept": "application/json" } }).catch(err => console.error('Viber Error:', err.message));
}

// 5. SERVER ROUTES
app.get('/api/logs', (req, res) => res.json(messageLogs.slice(0, 50)));
app.get('/dashboard', (req, res) => res.sendFile(__dirname + '/dashboard.html'));
app.get('/style.css', (req, res) => res.sendFile(__dirname + '/style.css'));

app.post('/api/logs/clear', (req, res) => {
    messageLogs.length = 0; // Instantly empties the array
    res.sendStatus(200);
});

app.listen(3001, () => console.log('Webhook listening on port 3001... \nOpen: http://localhost:3001/dashboard'));
