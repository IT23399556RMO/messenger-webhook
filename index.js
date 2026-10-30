require('dotenv').config();
const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');

const app = express();
app.use(bodyParser.json());
app.use(express.static('public'));

// --- CREDENTIALS ---
const LLM_KB = process.env.KB;
const LLM_ACCESS_TOKEN = process.env.ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID;
const VIBER_TOKEN = process.env.VIBER_TOKEN;
const INFOBIP_BASE_URL = process.env.INFOBIP_BASE_URL;

// Memory & Modes
let chatLogs = [];
let platformModes = { Facebook: 'llm', Instagram: 'llm', WhatsApp: 'llm', Viber: 'llm' };

// ==========================================
// DASHBOARD & AGENT API ENDPOINTS
// ==========================================
app.get('/api/logs', (req, res) => res.json(chatLogs));
app.post('/api/logs/clear', (req, res) => { chatLogs = []; res.sendStatus(200); });

app.get('/api/modes', (req, res) => res.json(platformModes));
app.post('/api/modes', (req, res) => {
    const { platform, mode } = req.body;
    if (platformModes[platform]) platformModes[platform] = mode;
    res.sendStatus(200);
});

app.post('/api/send', async (req, res) => {
    const { userId, platform, message } = req.body;
    try {
        if (platform === 'WhatsApp') {
            await sendWhatsAppReply(userId, message);
            chatLogs.push({ userId, platform, type: 'sent', message, time: new Date().toLocaleTimeString() });
        }
        else if (platform === 'Viber') {
            await sendViberReply(userId, message);
            chatLogs.push({ userId, platform, type: 'sent', message, time: new Date().toLocaleTimeString() });
        }
        else if (platform === 'Facebook' || platform === 'Instagram') {
            // Retrieve exact botId to reply through correct page
            const log = chatLogs.find(l => l.userId === userId && l.platform === platform && l.botId);
            const botId = log ? log.botId : 'me';
            await sendFbIgReply(userId, botId, message, platform);
            chatLogs.push({ userId, botId, platform, type: 'sent', message, time: new Date().toLocaleTimeString() });
        }
        res.sendStatus(200);
    } catch (err) {
        console.error("Agent Send Error:", err.message);
        res.sendStatus(500);
    }
});

// ==========================================
// LLM INTEGRATION
// ==========================================
async function askCompanyLLM(user_message) {
    try {
        const url = `https://whatsappai.siyothsoft.com/echo-secure?kb=${encodeURIComponent(LLM_KB)}&message=${encodeURIComponent(user_message)}`;
        const response = await axios.get(url, {
            headers: { "Authorization": `Bearer ${LLM_ACCESS_TOKEN}` }
        });
        return response.data;
    } catch (error) {
        console.error('LLM API Error:', error.message);
        return "I'm having trouble thinking right now, please try again in a moment.";
    }
}

// ==========================================
// PLATFORM SEND FUNCTIONS
// ==========================================
async function sendWhatsAppReply(recipient, text) {
    try {
        await axios.post(
            `https://graph.facebook.com/v20.0/${WHATSAPP_PHONE_ID}/messages`,
            { messaging_product: "whatsapp", to: recipient, type: "text", text: { body: text } },
            { headers: { "Authorization": `Bearer ${WHATSAPP_TOKEN}` } }
        );
    } catch (e) { console.error("WA Send Error:", e.response ? e.response.data : e.message); }
}

async function sendFbIgReply(recipient, bot_id, text, platform) {
    try {
        await axios.post(
            `https://graph.facebook.com/v20.0/${bot_id}/messages`,
            { recipient: { id: recipient }, message: { text: text } },
            { headers: { "Authorization": `Bearer ${PAGE_ACCESS_TOKEN}` } }
        );
    } catch (e) { console.error(`${platform} Send Error:`, e.response ? e.response.data : e.message); }
}

async function sendViberReply(recipient, text) {
    try {
        await axios.post(
            `${INFOBIP_BASE_URL}/viber/2/messages`,
            { messages: [{ from: "ServiceBot", to: recipient, content: { type: "TEXT", text: text } }] },
            { headers: { "Authorization": `App ${VIBER_TOKEN}`, "Content-Type": "application/json", "Accept": "application/json" } }
        );
    } catch (e) { console.error("Viber Send Error:", e.response ? e.response.data : e.message); }
}

// ==========================================
// WEBHOOK VERIFICATION (GET)
// ==========================================
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        res.status(200).send(challenge);
    } else {
        res.sendStatus(403);
    }
});

// ==========================================
// WEBHOOK INBOUND (POST)
// ==========================================
app.post('/webhook', async (req, res) => {
    let body = req.body;

    // --- WHATSAPP LOGIC ---
    if (body.object === 'whatsapp_business_account') {
        res.status(200).send('EVENT_RECEIVED');
        if (body.entry && body.entry[0].changes && body.entry[0].changes[0].value.messages) {
            let msg = body.entry[0].changes[0].value.messages[0];
            let sender_phone = msg.from;
            if (msg.type === 'text') {
                let incoming_text = msg.text.body;
                chatLogs.push({ userId: sender_phone, platform: 'WhatsApp', type: 'received', message: incoming_text, time: new Date().toLocaleTimeString() });
                
                if (platformModes['WhatsApp'] === 'llm') {
                    let ai_response = await askCompanyLLM(incoming_text);
                    await sendWhatsAppReply(sender_phone, ai_response);
                    chatLogs.push({ userId: sender_phone, platform: 'WhatsApp', type: 'sent', message: ai_response, time: new Date().toLocaleTimeString() });
                }
            }
        }
    } 
    // --- FACEBOOK AND INSTAGRAM LOGIC ---
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
                    
                    chatLogs.push({ userId: sender_psid, botId: bot_id, platform: platform, type: 'received', message: incoming_text, time: new Date().toLocaleTimeString() });
                    
                    if (platformModes[platform] === 'llm') {
                        let ai_response = await askCompanyLLM(incoming_text);
                        await sendFbIgReply(sender_psid, bot_id, ai_response, platform);
                        chatLogs.push({ userId: sender_psid, botId: bot_id, platform: platform, type: 'sent', message: ai_response, time: new Date().toLocaleTimeString() });
                    }
                }
            }
        });
    }
    // --- INFOBIP VIBER LOGIC ---
    else if (body.results && body.results[0] && body.results[0].integrationType === 'VIBER') {
        res.status(200).send('EVENT_RECEIVED');
        let msg = body.results[0];
        let sender_id = msg.from;
        if (msg.message && msg.message.type === 'TEXT') {
            let incoming_text = msg.message.text;
            chatLogs.push({ userId: sender_id, platform: 'Viber', type: 'received', message: incoming_text, time: new Date().toLocaleTimeString() });
            
            if (platformModes['Viber'] === 'llm') {
                let ai_response = await askCompanyLLM(incoming_text);
                await sendViberReply(sender_id, ai_response);
                chatLogs.push({ userId: sender_id, platform: 'Viber', type: 'sent', message: ai_response, time: new Date().toLocaleTimeString() });
            }
        }
    } else {
        res.sendStatus(404);
    }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));