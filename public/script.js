let currentPlatform = 'All';
let selectedUserId = null;
let rawLogs = [];

async function fetchLogs() {
    try {
        const response = await fetch('/api/logs');
        rawLogs = await response.json();
        renderUserList();
        renderChatHistory();
    } catch (e) {
        console.error("Failed to fetch logs", e);
    }
}

function setPlatformFilter(platform) {
    currentPlatform = platform;
    selectedUserId = null; // Clear active chat when switching platforms
    
    // Update active tab styling
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.remove('active');
        if(tab.innerText.includes(platform)) tab.classList.add('active');
    });
    
    // Update 2nd Column Header
    document.getElementById('feed-title').innerText = `${platform} Chats`;
    
    // Clear 3rd Column Header
    document.getElementById('chat-header').innerText = `Select a chat to view history`;
    
    renderUserList();
    renderChatHistory(); // This will clear the chat view since selectedUserId is null
}

function renderUserList() {
    let filteredLogs = rawLogs.filter(log => currentPlatform === 'All' || log.platform === currentPlatform);
    
    const groupedUsers = {};
    filteredLogs.forEach(log => {
        let uid = log.userId; 
        if (!groupedUsers[uid]) {
            groupedUsers[uid] = { id: uid, platform: log.platform, lastMessage: log.message, time: log.time };
        } else {
            groupedUsers[uid].lastMessage = log.message;
            groupedUsers[uid].time = log.time;
        }
    });

    const userListDiv = document.getElementById('user-list');
    const userArray = Object.values(groupedUsers);

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

function selectUser(userId) {
    selectedUserId = userId;
    
    // Update 3rd Column Header
    document.getElementById('chat-header').innerText = `Chat with ${userId}`;
    
    renderUserList(); 
    renderChatHistory();
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
        
        const mainContent = document.querySelector('.main-content');
        mainContent.scrollTop = mainContent.scrollHeight;
    } else {
        logsDiv.innerHTML = '<div style="color:#888;">No messages yet.</div>';
    }
}

async function clearLogs() {
    await fetch('/api/logs/clear', { method: 'POST' });
    selectedUserId = null;
    fetchLogs();
}

setInterval(fetchLogs, 2000);
fetchLogs();