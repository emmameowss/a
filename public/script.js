const socket = io();
let currentUsername = '';
let isBanned = false;
let banReason = '';

// Load username and chat history on page load
document.addEventListener('DOMContentLoaded', () => {
    fetch('/api/username')
        .then(res => {
            if (res.status === 403) {
                return res.json().then(data => {
                    const reason = data.reason || 'No reason provided';
                    showBanNotice(reason);
                    isBanned = true;
                    banReason = reason;
                    throw new Error('Banned');
                });
            }
            return res.json();
        })
        .then(data => {
            if (!isBanned) {
                currentUsername = data.username;
                document.getElementById('username-display').textContent = `You are: ${currentUsername}`;
                document.getElementById('message-input').disabled = false;
                document.getElementById('send-btn').disabled = false;
            }
        })
        .catch(err => {
            if (err.message !== 'Banned') {
                console.error('Error loading username:', err);
            }
        });
    
    fetch('/api/messages')
        .then(res => res.json())
        .then(messages => {
            messages.forEach(msg => displayMessage(msg));
            scrollToBottom();
        });
});

// Socket.IO listeners
socket.on('new-message', (data) => {
    displayMessage(data);
    scrollToBottom();
});

socket.on('user-joined', (data) => {
    displaySystemMessage(data);
    scrollToBottom();
});

socket.on('user-left', (data) => {
    displaySystemMessage(data);
    scrollToBottom();
});

socket.on('blocked', (data) => {
    const reason = data.reason || 'No reason provided';
    showBanNotice(reason);
    isBanned = true;
    banReason = reason;
});

function showBanNotice(reason) {
    console.log('showBanNotice called with reason:', reason);
    
    const noticeEl = document.getElementById('ban-notice');
    const reasonEl = document.getElementById('ban-reason-text');
    const closeBtn = document.getElementById('close-notice');
    
    if (!noticeEl || !reasonEl || !closeBtn) {
        console.error('Ban notice elements not found');
        return;
    }
    
    // Set the reason text
    reasonEl.textContent = `Reason: ${reason}`;
    
    // Show the popup
    noticeEl.style.display = 'flex';
    
    // Disable input
    document.getElementById('message-input').disabled = true;
    document.getElementById('send-btn').disabled = true;
    
    // Handle close button
    closeBtn.addEventListener('click', function handleClose() {
        console.log('Close button clicked');
        // Convert popup to minimized header
        noticeEl.classList.add('minimized');
        // Remove the listener to prevent duplicates
        closeBtn.removeEventListener('click', handleClose);
    }, { once: true });
}

// Display message in chat
function displayMessage(data) {
    const messagesDiv = document.getElementById('messages');
    const messageEl = document.createElement('div');
    messageEl.className = 'message';
    
    // Determine if it's our message
    if (data.username === currentUsername) {
        messageEl.classList.add('user-message');
    } else {
        messageEl.classList.add('other-message');
    }
    
    messageEl.innerHTML = `
        <div class="message-username">${data.username}</div>
        <div class="message-text">${escapeHtml(data.message)}</div>
        <div class="message-time">${data.timestamp}</div>
    `;
    
    messagesDiv.appendChild(messageEl);
}

// Display system message
function displaySystemMessage(data) {
    const messagesDiv = document.getElementById('messages');
    const messageEl = document.createElement('div');
    messageEl.className = 'message system-message';
    messageEl.innerHTML = `${data.message} - ${data.timestamp}`;
    messagesDiv.appendChild(messageEl);
}

// Scroll to bottom of chat
function scrollToBottom() {
    const messagesDiv = document.getElementById('messages');
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Send message
function sendMessage() {
    if (isBanned) {
        alert('You are banned from sending messages');
        return;
    }
    
    const input = document.getElementById('message-input');
    const message = input.value.trim();
    
    if (message === '') return;
    
    socket.emit('send-message', { message: message });
    input.value = '';
    input.focus();
}

// Event listeners
document.getElementById('send-btn').addEventListener('click', sendMessage);

document.getElementById('message-input').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        sendMessage();
    }
});

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
