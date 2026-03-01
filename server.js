const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

app.use(express.json());
app.use(express.static('public'));

// File paths for persistent storage
const USERS_FILE = path.join(__dirname, 'data', 'users.json');
const BLOCKED_FILE = path.join(__dirname, 'data', 'blocked.json');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

// Ensure data directory exists
if (!fs.existsSync(path.join(__dirname, 'data'))) {
  fs.mkdirSync(path.join(__dirname, 'data'));
}

// Load persistent data
function loadUsers() {
  if (fs.existsSync(USERS_FILE)) {
    return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
  }
  return {};
}

function loadBlocked() {
  if (fs.existsSync(BLOCKED_FILE)) {
    return JSON.parse(fs.readFileSync(BLOCKED_FILE, 'utf8'));
  }
  return {}; // Changed to object for storing reasons
}

function saveUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function saveBlocked(blocked) {
  fs.writeFileSync(BLOCKED_FILE, JSON.stringify(blocked, null, 2));
}

// Store user info by IP
let registeredUsers = loadUsers(); // { ip: { username, userAgent, firstSeen, lastSeen } }
let blockedIPs = loadBlocked(); // { ip: { reason, blockedAt } }
const messages = []; // Store chat history
const activeSessions = {}; // { ip: { username, socketId } }

// Helper function to get client IP
function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0].trim() ||
         req.connection.remoteAddress ||
         req.socket.remoteAddress ||
         req.connection.socket?.remoteAddress ||
         'unknown';
}

// Hash password for admin authentication
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Helper function to generate random username
function generateUsername() {
  const adjectives = ['Happy', 'Quick', 'Silly', 'Smart', 'Lazy', 'Brave', 'Cool', 'Calm', 'Wild', 'Tiny', 'Giant', 'Sleepy', 'Angry', 'Busy'];
  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let randomStr = '';
  for (let i = 0; i < 8; i++) {
    randomStr += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${adjective}-${randomStr}`;
}

// HTTP endpoint to get username based on IP
app.get('/api/username', (req, res) => {
  const ip = getClientIP(req);
  const userAgent = req.headers['user-agent'] || 'unknown';
  
  if (blockedIPs[ip]) {
    return res.status(403).json({ error: 'Your IP has been blocked', reason: blockedIPs[ip].reason });
  }
  
  if (!registeredUsers[ip]) {
    registeredUsers[ip] = {
      username: generateUsername(),
      userAgent: userAgent,
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString()
    };
    saveUsers(registeredUsers);
  } else {
    registeredUsers[ip].lastSeen = new Date().toISOString();
    saveUsers(registeredUsers);
  }
  
  res.json({ username: registeredUsers[ip].username });
});

// Admin authentication endpoints
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  
  if (!password) {
    return res.status(400).json({ error: 'Password required' });
  }
  
  if (hashPassword(password) === hashPassword(ADMIN_PASSWORD)) {
    const token = crypto.randomBytes(32).toString('hex');
    res.json({ token, success: true });
  } else {
    res.status(401).json({ error: 'Invalid password' });
  }
});

// Middleware to verify admin token
function verifyAdmin(req, res, next) {
  const token = req.headers['x-admin-token'];
  
  if (!token) {
    return res.status(401).json({ error: 'Admin token required' });
  }
  
  // For this simple implementation, we verify against the expected token
  // In production, you'd want proper session management
  if (token.length < 10) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  
  next();
}

// Get all registered users
app.get('/api/admin/users', verifyAdmin, (req, res) => {
  const userList = Object.entries(registeredUsers).map(([ip, data]) => ({
    username: data.username,
    userAgent: data.userAgent,
    firstSeen: data.firstSeen,
    lastSeen: data.lastSeen,
    blocked: blockedIPs.includes(ip),
    ipHash: crypto.createHash('sha256').update(ip).digest('hex').substring(0, 8)
  }));
  
  res.json(userList);
});

// Block an IP
app.post('/api/admin/block', verifyAdmin, (req, res) => {
  const { username } = req.body;
  
  // Find IP by username
  const ipToBlock = Object.entries(registeredUsers).find(
    ([ip, data]) => data.username === username
  )?.[0];
  
  if (!ipToBlock) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  if (!blockedIPs.includes(ipToBlock)) {
    blockedIPs.push(ipToBlock);
    saveBlocked(blockedIPs);
    
    // Disconnect active sessions from this IP
    io.sockets.sockets.forEach(socket => {
      if (getClientIP({
        headers: { 'x-forwarded-for': socket.handshake.address }
      }) === ipToBlock) {
        socket.disconnect(true);
      }
    });
  }
  
  res.json({ success: true, message: `${username} has been blocked` });
});

// Unblock an IP
app.post('/api/admin/unblock', verifyAdmin, (req, res) => {
  const { username } = req.body;
  
  // Find IP by username
  const ipToUnblock = Object.entries(registeredUsers).find(
    ([ip, data]) => data.username === username
  )?.[0];
  
  if (!ipToUnblock) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  blockedIPs = blockedIPs.filter(ip => ip !== ipToUnblock);
  saveBlocked(blockedIPs);
  
  res.json({ success: true, message: `${username} has been unblocked` });
});


// Get message history
app.get('/api/messages', (req, res) => {
  res.json(messages);
});

// Admin authentication endpoints
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  
  if (!password) {
    return res.status(400).json({ error: 'Password required' });
  }
  
  if (hashPassword(password) === hashPassword(ADMIN_PASSWORD)) {
    const token = crypto.randomBytes(32).toString('hex');
    res.json({ token, success: true });
  } else {
    res.status(401).json({ error: 'Invalid password' });
  }
});

// Middleware to verify admin token
function verifyAdmin(req, res, next) {
  const token = req.headers['x-admin-token'];
  
  if (!token) {
    return res.status(401).json({ error: 'Admin token required' });
  }
  
  if (token.length < 10) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  
  next();
}

// Get all registered users
app.get('/api/admin/users', verifyAdmin, (req, res) => {
  const userList = Object.entries(registeredUsers).map(([ip, data]) => ({
    username: data.username,
    userAgent: data.userAgent,
    firstSeen: data.firstSeen,
    lastSeen: data.lastSeen,
    blocked: !!blockedIPs[ip],
    banReason: blockedIPs[ip]?.reason || '',
    ipHash: crypto.createHash('sha256').update(ip).digest('hex').substring(0, 8)
  }));
  
  res.json(userList);
});

// Block an IP
app.post('/api/admin/block', verifyAdmin, (req, res) => {
  const { username, reason } = req.body;
  
  // Find IP by username
  const ipToBlock = Object.entries(registeredUsers).find(
    ([ip, data]) => data.username === username
  )?.[0];
  
  if (!ipToBlock) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  if (!blockedIPs[ipToBlock]) {
    blockedIPs[ipToBlock] = {
      reason: reason || 'No reason provided',
      blockedAt: new Date().toISOString()
    };
    saveBlocked(blockedIPs);
    
    // Disconnect active sessions from this IP
    io.sockets.sockets.forEach(socket => {
      if (socket.handshake.address === ipToBlock) {
        socket.disconnect(true);
      }
    });
  }
  
  res.json({ success: true, message: `${username} has been blocked` });
});

// Unblock an IP
app.post('/api/admin/unblock', verifyAdmin, (req, res) => {
  const { username } = req.body;
  
  // Find IP by username
  const ipToUnblock = Object.entries(registeredUsers).find(
    ([ip, data]) => data.username === username
  )?.[0];
  
  if (!ipToUnblock) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  delete blockedIPs[ipToUnblock];
  saveBlocked(blockedIPs);
  
  res.json({ success: true, message: `${username} has been unblocked` });
});

// Socket.IO connection
io.on('connection', (socket) => {
  const ip = socket.handshake.address;
  
  // Check if IP is blocked
  if (blockedIPs[ip]) {
    socket.emit('blocked', { 
      message: 'You have been blocked from this chatroom',
      reason: blockedIPs[ip].reason
    });
    socket.disconnect(true);
    return;
  }
  
  // Register or retrieve user
  if (!registeredUsers[ip]) {
    const userAgent = socket.handshake.headers['user-agent'] || 'unknown';
    registeredUsers[ip] = {
      username: generateUsername(),
      userAgent: userAgent,
      firstSeen: new Date().toISOString(),
      lastSeen: new Date().toISOString()
    };
    saveUsers(registeredUsers);
  }
  
  const username = registeredUsers[ip].username;
  
  // Notify everyone that user joined
  io.emit('user-joined', {
    username: username,
    message: `${username} joined the chat`,
    timestamp: new Date().toLocaleTimeString()
  });
  
  console.log(`${username} (${ip}) connected`);
  
  // Handle incoming messages
  socket.on('send-message', (data) => {
    const msgObj = {
      username: username,
      message: data.message,
      timestamp: new Date().toLocaleTimeString()
    };
    
    messages.push(msgObj);
    // Keep only last 100 messages
    if (messages.length > 100) {
      messages.shift();
    }
    
    io.emit('new-message', msgObj);
  });
  
  // Handle disconnection
  socket.on('disconnect', () => {
    io.emit('user-left', {
      username: username,
      message: `${username} left the chat`,
      timestamp: new Date().toLocaleTimeString()
    });
    
    console.log(`${username} (${ip}) disconnected`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Chatroom server running on http://localhost:${PORT}`);
});
