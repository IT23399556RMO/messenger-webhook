let currentPlatform = 'All'; 
let selectedUserId = null; 
let rawLogs = [];
let platformModes = { Facebook: 'llm', Instagram: 'llm', WhatsApp: 'llm', Viber: 'llm' };

// 1. Fetch Backend Data
async function fetchLogs() {
    try {
        const [logsRes, modesRes] = await Promise.all([fetch('/api/logs'), fetch('/api/modes')]);
        rawLogs = await logsRes.json();
        platformModes = await modesRes.json();
        
        syncToggles();
        renderUserList();
        renderChatHistory();
        updateInputState();
    } catch (e) { console.error("Failed to fetch data", e); }
}

// 2. Sync UI Toggles with Server State
function syncToggles() {
    ['Facebook', 'Instagram', 'WhatsApp'].forEach(p => {
        const toggle = document.getElementById(`toggle-${p}`);
        if (toggle) toggle.checked = (platformModes[p] === 'agent');
    });
}

// 3. Handle Toggle Clicks with Confirm Box
function handleToggle(event, platform) {
    event.preventDefault(); 
    const checkbox = event.target;
    const wantAgentMode = checkbox.checked; 
    
    // Visually revert immediately. We only apply if confirmed.
    checkbox.checked = !wantAgentMode;
    
    const targetMode = wantAgentMode ? 'agent' : 'llm';
    const msg = wantAgentMode 
        ? `Switch ${platform} to Agent Mode?` 
        : `Switch ${platform} back to LLM Mode?`;
        
    showConfirmBox(`Change ${platform} Mode`, msg, async () => {
        // Confirmed
        checkbox.checked = wantAgentMode;
        platformModes[platform] = targetMode;
        await fetch('/api/modes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ platform, mode: targetMode })
        });
        updateInputState();
    });
}

// 4. Update Chat Input Box based on Mode
function updateInputState() {
    const input = document.getElementById('agent-input');
    const btn = document.getElementById('send-btn');
    
    if (!selectedUserId) {
        input.disabled = true; btn.disabled = true;
        input.placeholder = "Select a chat to view history";
        return;
    }
    
    const userLog = rawLogs.find(log => log.userId === selectedUserId);
    if (userLog && platformModes[userLog.platform] === 'agent') {
        input.disabled = false; btn.disabled = false;
        input.placeholder = "Type your message as an agent...";
    } else {
        input.disabled = true; btn.disabled = true;
        input.placeholder = "Switch platform to Agent Mode to reply manually";
    }
}

// 5. Send Message as Human Agent
async function sendAgentMessage() {
    const input = document.getElementById('agent-input');
    const message = input.value.trim();
    if (!message || !selectedUserId) return;
    
    const userLog = rawLogs.find(log => log.userId === selectedUserId);
    if (!userLog) return;

    input.value = ''; // Clear box instantly
    input.disabled = true; // Lock until refresh
    
    await fetch('/api/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: selectedUserId, platform: userLog.platform, message })
    });
    fetchLogs(); // Refresh chat immediately
}

function setPlatformFilter(platform) {
    currentPlatform = platform;
    selectedUserId = null; 
    
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.remove('active');
        if(tab.innerText.includes(platform)) tab.classList.add('active');
    });
    
    document.getElementById('feed-title').innerText = `${platform} Chats`;[span_0](start_span)[span_0](end_span)
    document.getElementById('chat-header').innerText = `Select a chat to view history`;[span_1](start_span)[span_1](end_span)
    
    renderUserList(); 
    renderChatHistory(); 
    updateInputState();
}

function selectUser(userId) {
    selectedUserId = userId;
    document.getElementById('chat-header').innerText = `Chat with ${userId}`;
    renderUserList(); 
    renderChatHistory(); 
    updateInputState();
}

function renderUserList() {
    let filteredLogs = rawLogs.filter(log => currentPlatform === 'All' || log.platform === currentPlatform);
    const groupedUsers = {};
    
    filteredLogs.forEach(log => {
        if (!groupedUsers[log.userId]) {
            groupedUsers[log.userId] = { id: log.userId, platform: log.platform, lastMessage: log.message, time: log.time };
        } else {
            groupedUsers[log.userId].lastMessage = log.message;
            groupedUsers[log.userId].time = log.time;
        }
    });

    const userArray = Object.values(groupedUsers);
    const userListDiv = document.getElementById('user-list');
    
    if (userArray.length === 0) {
        userListDiv.innerHTML = '<div style="padding:20px; color:#888;">No users found.</div>';
        return;
    }

    userListDiv.innerHTML = userArray.map(user => `
        <div class="user-card ${selectedUserId === user.id ? 'active' : ''}" onclick="selectUser('${user.id}')">
            <div class="avatar" data-platform="${user.platform}">${user.platform.charAt(0)}</div>
            <div class="user-info">
                <div class="user-name">${user.id}</div>
                <div class="user-preview">${user.lastMessage}</div>
            </div>
        </div>
    `).join('');
}

function renderChatHistory() {
    const logsDiv = document.getElementById('logs');
    if (!selectedUserId) {
        logsDiv.innerHTML = '<div style="color:#888; text-align:center; margin-top:50px;">Select a chat to view history</div>';
        return;
    }
    const userLogs = rawLogs.filter(log => log.userId === selectedUserId);
    if (userLogs.length > 0) {
        logsDiv.innerHTML = userLogs.map(log => `
            <div class="chat-row ${log.type}" data-platform="${log.platform}">
                <div class="bubble">${log.message}</div>
                <div class="meta-data">
                    <span class="platform-tag">${log.platform}</span>
                    <span>${log.time}</span>
                </div>
            </div>
        `).join('');
        logsDiv.scrollTop = logsDiv.scrollHeight;
    } else {
        logsDiv.innerHTML = '<div style="color:#888;">No messages yet.</div>';
    }
}

setInterval(fetchLogs, 2000);
fetchLogs();