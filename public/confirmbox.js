function showConfirmBox(title, message, onConfirmCallback) {
    let overlay = document.getElementById('custom-confirm-overlay');
    
    // Inject HTML if it doesn't exist yet
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'custom-confirm-overlay';
        overlay.className = 'confirm-overlay';
        overlay.innerHTML = `
            <div class="confirm-box">
                <h3 id="confirm-title"></h3>
                <p id="confirm-message"></p>
                <div class="confirm-buttons">
                    <button class="btn-cancel" onclick="closeConfirmBox()">Cancel</button>
                    <button class="btn-confirm" id="confirm-yes-btn">Confirm</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
    }

    document.getElementById('confirm-title').innerText = title;
    document.getElementById('confirm-message').innerText = message;
    
    const yesBtn = document.getElementById('confirm-yes-btn');
    yesBtn.onclick = () => {
        onConfirmCallback();
        closeConfirmBox();
    };
    
    overlay.classList.add('active');
}

function closeConfirmBox() {
    document.getElementById('custom-confirm-overlay').classList.remove('active');
}