let adminToken = null;
let pendingBlockUsername = null;

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('login-btn').addEventListener('click', loginAdmin);
    document.getElementById('admin-password').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') loginAdmin();
    });
    document.getElementById('logout-btn').addEventListener('click', logoutAdmin);
    document.getElementById('confirm-ban').addEventListener('click', confirmBlockUser);
    document.getElementById('cancel-ban').addEventListener('click', cancelBlockUser);
});

async function loginAdmin() {
    const password = document.getElementById('admin-password').value;
    const errorEl = document.getElementById('login-error');
    
    if (!password) {
        errorEl.textContent = 'Please enter a password';
        return;
    }
    
    try {
        const response = await fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });
        
        if (response.ok) {
            const data = await response.json();
            adminToken = data.token;
            showAdminPanel();
            loadUsers();
        } else {
            errorEl.textContent = 'Invalid password';
            document.getElementById('admin-password').value = '';
        }
    } catch (error) {
        errorEl.textContent = 'Error logging in: ' + error.message;
    }
}

function logoutAdmin() {
    adminToken = null;
    document.getElementById('login-section').style.display = 'block';
    document.getElementById('admin-section').style.display = 'none';
    document.getElementById('admin-password').value = '';
    document.getElementById('login-error').textContent = '';
}

function showAdminPanel() {
    document.getElementById('login-section').style.display = 'none';
    document.getElementById('admin-section').style.display = 'block';
}

async function loadUsers() {
    if (!adminToken) return;
    
    try {
        const response = await fetch('/api/admin/users', {
            headers: { 'X-Admin-Token': adminToken }
        });
        
        if (!response.ok) {
            if (response.status === 401) {
                logoutAdmin();
            }
            return;
        }
        
        const users = await response.json();
        displayUsers(users);
    } catch (error) {
        console.error('Error loading users:', error);
    }
}

function displayUsers(users) {
    const usersList = document.getElementById('users-list');
    usersList.innerHTML = '';
    document.getElementById('user-count').textContent = users.length;
    
    if (users.length === 0) {
        usersList.innerHTML = '<tr><td colspan="7" style="text-align: center; color: #999;">No registered users yet</td></tr>';
        return;
    }
    
    users.forEach(user => {
        const row = document.createElement('tr');
        
        const statusText = user.blocked ? 'BLOCKED' : 'Active';
        const statusClass = user.blocked ? 'status-blocked' : 'status-active';
        
        const buttonClass = user.blocked ? 'unblock-btn' : 'block-btn';
        const buttonText = user.blocked ? 'Unblock' : 'Block';
        
        const firstSeen = new Date(user.firstSeen).toLocaleString();
        const lastSeen = new Date(user.lastSeen).toLocaleString();
        const banReason = user.banReason || '-';
        
        row.innerHTML = `
            <td><strong>${escapeHtml(user.username)}</strong></td>
            <td style="font-size: 12px; max-width: 200px; overflow: hidden; text-overflow: ellipsis;">
                ${escapeHtml(user.userAgent.substring(0, 50))}...
            </td>
            <td style="font-size: 12px;">${firstSeen}</td>
            <td style="font-size: 12px;">${lastSeen}</td>
            <td><span class="${statusClass}">${statusText}</span></td>
            <td style="font-size: 12px; max-width: 150px; overflow: hidden; text-overflow: ellipsis;">
                ${escapeHtml(banReason)}
            </td>
            <td>
                <button class="${buttonClass}" onclick="openBlockModal('${escapeHtml(user.username)}', ${user.blocked})">
                    ${buttonText}
                </button>
            </td>
        `;
        
        usersList.appendChild(row);
    });
}

function openBlockModal(username, isCurrentlyBlocked) {
    if (isCurrentlyBlocked) {
        // If already blocked, just unblock directly
        toggleBlockUser(username, true);
    } else {
        // Show modal for blocking
        pendingBlockUsername = username;
        document.getElementById('ban-username-display').textContent = `Username: ${username}`;
        document.getElementById('ban-reason').value = '';
        document.getElementById('ban-modal').style.display = 'flex';
    }
}

function cancelBlockUser() {
    pendingBlockUsername = null;
    document.getElementById('ban-modal').style.display = 'none';
}

async function confirmBlockUser() {
    if (!pendingBlockUsername) return;
    
    const reason = document.getElementById('ban-reason').value.trim();
    await toggleBlockUser(pendingBlockUsername, false, reason);
    cancelBlockUser();
}

async function toggleBlockUser(username, isCurrentlyBlocked, reason = '') {
    if (!adminToken) return;
    
    const endpoint = isCurrentlyBlocked ? '/api/admin/unblock' : '/api/admin/block';
    const body = { username };
    if (!isCurrentlyBlocked) {
        body.reason = reason;
    }
    
    try {
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Admin-Token': adminToken
            },
            body: JSON.stringify(body)
        });
        
        if (response.ok) {
            loadUsers(); // Refresh the user list
        } else {
            const data = await response.json();
            alert('Error: ' + (data.error || 'Failed to update user'));
        }
    } catch (error) {
        alert('Error: ' + error.message);
    }
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Refresh user list every 10 seconds if admin is logged in
setInterval(() => {
    if (adminToken) {
        loadUsers();
    }
}, 10000);
