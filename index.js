require('dotenv').config();
const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());
app.use(express.static('public')); // Serves the dashboard UI

// --- CREDENTIALS ---
const LLM_KB = process.env.KB;
const LLM_ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID;
const VIBER_TOKEN = process.env.VIBER_TOKEN;
const INFOBIP_BASE_URL = process.env.INFOBIP_BASE_URL;

// Memory storage for the dashboard
let chatLogs = []; 

// ==========================================
// DASHBOARD API ENDPOINTS
// ==========================================
app.get('/api/logs', (req, res) => res.json(chatLogs));
app.post('/api/logs/clear', (req, res) => {
    chatLogs = [];
    res.sendStatus(200);
});

// ==========================================
// THE LLM "CHEF" INTEGRATION
// ==========================================
async function askCompanyLLM(user_message) {
    try {
        const url = `https://whatsappai.siyothsoft.com/echo-secure?kb=${encodeURIComponent(LLM_KB)}&message=${encodeURIComponent(user_message)}`;
        const response = await axios.get(url, {
            headers: { "Authorization": `Bearer ${LLM_ACCESS_TOKEN}` }
        });
        return String(response.data).replace(/^data:\s*/i, ''); 
    } catch (error) {
        console.error('LLM API Error:', error.message);
        return "I'm having trouble connecting to the knowledge base."; 
    }
}

// ==========================================
// OUTBOUND MESSAGE DELIVERIES
// ==========================================
async function sendFbIgReply(sender_psid, bot_id, text, platform) {
    chatLogs.push({ userId: sender_psid, platform: platform, type: 'sent', message: text, time: new Date().toLocaleTimeString() });
    try {
        await axios.post(`https://graph.facebook.com/v20.0/${bot_id}/messages`, {
            recipient: { id: sender_psid },
            messaging_type: "RESPONSE",
            message: { text: text }
        }, { headers: { "Authorization": `Bearer ${PAGE_ACCESS_TOKEN}` } });
    } catch (err) { console.error(`${platform} Error:`, err.message); }
}

async function sendWhatsAppReply(sender_phone, text) {
    chatLogs.push({ userId: sender_phone, platform: 'WhatsApp', type: 'sent', message: text, time: new Date().toLocaleTimeString() });
    try {
        await axios.post(`https://graph.facebook.com/v20.0/${WHATSAPP_PHONE_ID}/messages`, {
            messaging_product: "whatsapp",
            to: sender_phone,
            type: "text",
            text: { body: text }
        }, { headers: { "Authorization": `Bearer ${WHATSAPP_TOKEN}` } });
    } catch (err) { console.error('WhatsApp Error:', err.message); }
}

async function sendViberReply(sender_phone, text) {
    chatLogs.push({ userId: sender_phone, platform: 'Viber', type: 'sent', message: text, time: new Date().toLocaleTimeString() });
    try {
        await axios.post(`https://${INFOBIP_BASE_URL}/viber/2/messages`, {
            messages: [{
                sender: "IBSelfServe", 
                destinations: [{ to: sender_phone }],
                content: { type: "TEXT", text: text }
            }]
        }, {
            headers: { "Authorization": `App ${VIBER_TOKEN}`, "Content-Type": "application/json", "Accept": "application/json" }
        });
    } catch (err) { console.error('Viber Error:', err.message); }
}

// ==========================================
// INBOUND WEBHOOK ROUTER
// ==========================================
app.get('/webhook', (req, res) => {
    let mode = req.query['hub.mode'];
    let token = req.query['hub.verify_token'];
    let challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        res.status(200).send(challenge);
    } else {
        res.sendStatus(403);
    }
});

app.post('/webhook', async (req, res) => {
    let body = req.body;
    
    // 1. WhatsApp Logic
    if (body.object === 'whatsapp_business_account') {
        res.status(200).send('EVENT_RECEIVED');
        if (body.entry && body.entry[0].changes && body.entry[0].changes[0].value.messages) {
            let msg = body.entry[0].changes[0].value.messages[0];
            let sender_phone = msg.from;
            
            if (msg.type === 'text') {
                let incoming_text = msg.text.body;
                chatLogs.push({ userId: sender_phone, platform: 'WhatsApp', type: 'received', message: incoming_text, time: new Date().toLocaleTimeString() });
                let ai_response = await askCompanyLLM(incoming_text);
                await sendWhatsAppReply(sender_phone, ai_response);
            }
        }
    } 
    // 2. Facebook and Instagram Logic
    else if (body.object === 'page' || body.object === 'instagram') {
        res.status(200).send('EVENT_RECEIVED'); 
        body.entry.forEach(async function(entry) {
            if (entry.messaging) {
                let webhook_event = entry.messaging[0];
                let sender_psid = webhook_event.sender.id;
                let bot_id = webhook_event.recipient.id;
                
                if (webhook_event.message && webhook_event.message.is_echo) return;

                if (webhook_event.message && webhook_event.message.text) {
                    let platform = body.object === 'page' ? 'Facebook' : 'Instagram';
                    let incoming_text = webhook_event.message.text;
                    
                    chatLogs.push({ userId: sender_psid, platform: platform, type: 'received', message: incoming_text, time: new Date().toLocaleTimeString() });
                    let ai_response = await askCompanyLLM(incoming_text);
                    await sendFbIgReply(sender_psid, bot_id, ai_response, platform);
                }
            }
        });
    }
    // 3. Viber (Infobip Sandbox) Logic
    else if (body.results && body.results[0].integrationType === 'VIBER') {
        res.status(200).send('EVENT_RECEIVED'); 
        let msgData = body.results[0];
        let sender_phone = msgData.from; 
        
        if (msgData.message && msgData.message.type === 'TEXT') {
            let incoming_text = msgData.message.text;
            chatLogs.push({ userId: sender_phone, platform: 'Viber', type: 'received', message: incoming_text, time: new Date().toLocaleTimeString() });
            let ai_response = await askCompanyLLM(incoming_text);
            await sendViberReply(sender_phone, ai_response);
        }
    }
    // Unknown Traffic
    else {
        res.sendStatus(404);
    }
});

app.listen(3001, () => console.log('Webhook & Dashboard listening on port 3001...'));