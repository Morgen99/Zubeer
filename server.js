const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const session = require('express-session');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const port = 3000;

// Middleware
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
    secret: 'your-secret-key-change-this-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false, // Set to true if using HTTPS
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
}));

// Ensure directories exist
const directories = [
    './data',
    './data/chats',
    './uploads',
    './uploads/profiles',
    './uploads/posts'
];

directories.forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

// Multer configuration for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        if (file.fieldname === 'profile') {
            cb(null, 'uploads/profiles/');
        } else {
            cb(null, 'uploads/posts/');
        }
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + '-' + file.originalname);
    }
});

const upload = multer({ 
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    fileFilter: function (req, file, cb) {
        // Check file types
        if (file.fieldname === 'profile') {
            if (file.mimetype.startsWith('image/')) {
                cb(null, true);
            } else {
                cb(new Error('Profile must be an image'), false);
            }
        } else {
            if (file.mimetype.startsWith('image/') || file.mimetype.startsWith('video/')) {
                cb(null, true);
            } else {
                cb(new Error('Only images and videos are allowed'), false);
            }
        }
    }
});

// Load data functions
function loadUsers() {
    try {
        const data = fs.readFileSync('./data/users.json', 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return [];
    }
}

function saveUsers(users) {
    fs.writeFileSync('./data/users.json', JSON.stringify(users, null, 2));
}

function loadPosts() {
    try {
        const data = fs.readFileSync('./data/posts.json', 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return [];
    }
}

function savePosts(posts) {
    fs.writeFileSync('./data/posts.json', JSON.stringify(posts, null, 2));
}

// Authentication middleware
function requireAuth(req, res, next) {
    if (req.session && req.session.userId) {
        next();
    } else {
        res.status(401).json({ error: 'Fadlan gal akoonkaaga' });
    }
}

// Routes

// Check if user is authenticated
app.get('/check-auth', (req, res) => {
    res.json({ 
        loggedIn: !!req.session.userId,
        userId: req.session.userId,
        username: req.session.username
    });
});

// Get user info
app.get('/api/user-info', (req, res) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Not logged in' });
    }
    
    const users = loadUsers();
    const user = users.find(u => u.id === req.session.userId);
    
    if (user) {
        res.json({
            id: user.id,
            username: user.username,
            profileImage: user.profileImage
        });
    } else {
        res.status(404).json({ error: 'User not found' });
    }
});

// Get all users (for chat)
app.get('/api/users', requireAuth, (req, res) => {
    try {
        const users = loadUsers();
        // Remove sensitive information
        const usersWithoutSensitiveInfo = users.map(user => {
            return {
                id: user.id,
                username: user.username,
                profileImage: user.profileImage,
                createdAt: user.createdAt
            };
        });
        res.json(usersWithoutSensitiveInfo);
    } catch (error) {
        console.error('Error loading users:', error);
        res.status(500).json({ error: 'Khalad ayaa dhacay soo dejinta isticmaalayaasha' });
    }
});

// Chat endpoints
app.get('/api/chat/:chatId', requireAuth, (req, res) => {
    try {
        const { chatId } = req.params;
        const chatFilePath = `./data/chats/${chatId}.json`;
        
        if (fs.existsSync(chatFilePath)) {
            const chatData = fs.readFileSync(chatFilePath, 'utf8');
            const messages = JSON.parse(chatData);
            res.json(messages);
        } else {
            res.json([]);
        }
    } catch (error) {
        console.error('Error loading chat:', error);
        res.status(500).json({ error: 'Khalad ayaa dhacay soo dejinta majaajillada' });
    }
});

app.post('/api/chat/send', requireAuth, (req, res) => {
    try {
        const { chatId, message } = req.body;
        
        // Ensure chats directory exists
        const chatsDir = './data/chats';
        if (!fs.existsSync(chatsDir)) {
            fs.mkdirSync(chatsDir, { recursive: true });
        }
        
        const chatFilePath = `./data/chats/${chatId}.json`;
        let messages = [];
        
        // Load existing messages if file exists
        if (fs.existsSync(chatFilePath)) {
            const chatData = fs.readFileSync(chatFilePath, 'utf8');
            messages = JSON.parse(chatData);
        }
        
        // Add new message
        messages.push(message);
        
        // Save messages
        fs.writeFileSync(chatFilePath, JSON.stringify(messages, null, 2));
        
        res.json({ success: true, message: 'Fariinta waa la diray' });
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ error: 'Khalad ayaa dhacay dirista fariinta' });
    }
});

// Socket.io for real-time chat
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    
    socket.on('join-chat', (chatId) => {
        socket.join(chatId);
        console.log(`User ${socket.id} joined chat: ${chatId}`);
    });
    
    socket.on('send-message', (data) => {
        // Broadcast message to all users in the chat room
        io.to(data.chatId).emit('receive-message', data);
        
        // Save message to file
        const chatFilePath = `./data/chats/${data.chatId}.json`;
        let messages = [];
        
        // Load existing messages if file exists
        if (fs.existsSync(chatFilePath)) {
            const chatData = fs.readFileSync(chatFilePath, 'utf8');
            messages = JSON.parse(chatData);
        }
        
        // Add new message
        messages.push({
            id: uuidv4(),
            senderId: data.senderId,
            senderUsername: data.senderUsername,
            message: data.message,
            timestamp: new Date().toISOString()
        });
        
        // Save messages
        fs.writeFileSync(chatFilePath, JSON.stringify(messages, null, 2));
    });
    
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

// Check username availability
app.post('/check-username', (req, res) => {
    const { username } = req.body;
    const users = loadUsers();
    
    const exists = users.some(user => user.username === username);
    res.json({ exists });
});

// Register new user
app.post('/register', upload.single('profile'), async (req, res) => {
    try {
        const { username, password } = req.body;
        const users = loadUsers();
        
        // Validate input
        if (!username || !password) {
            return res.status(400).json({ error: 'Username iyo password waa loo baahan yahay' });
        }
        
        if (username.length < 3) {
            return res.status(400).json({ error: 'Username waa inuu ka kooban yahay ugu yaraan 3 xaraf' });
        }
        
        if (password.length < 6) {
            return res.status(400).json({ error: 'Password waa inuu ka kooban yahay ugu yaraan 6 xaraf' });
        }
        
        // Check if username exists
        if (users.find(user => user.username === username)) {
            return res.status(400).json({ error: 'Magacan waa la isticmaalaa' });
        }
        
        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // Save user
        const newUser = {
            id: uuidv4(),
            username,
            password: hashedPassword,
            profileImage: req.file ? req.file.filename : 'default.png',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        users.push(newUser);
        saveUsers(users);
        
        res.json({ 
            success: true, 
            message: 'Akoonkaga waa la sameeyay!',
            userId: newUser.id
        });
        
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Khalad ayaa dhacay diiwaangalinta' });
    }
});

// Login user
app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const users = loadUsers();
        
        // Validate input
        if (!username || !password) {
            return res.status(400).json({ error: 'Username iyo password waa loo baahan yahay' });
        }
        
        const user = users.find(u => u.username === username);
        if (!user) {
            return res.status(400).json({ error: 'Magaca ama password-ka waa khalad' });
        }
        
        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) {
            return res.status(400).json({ error: 'Magaca ama password-ka waa khalad' });
        }
        
        // Set session
        req.session.userId = user.id;
        req.session.username = user.username;
        
        res.json({ 
            success: true, 
            message: 'Si fiican aad u gashay',
            userId: user.id,
            username: user.username
        });
        
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Khalad ayaa dhacay galitaanka' });
    }
});

// Logout user
app.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: 'Khalad ayaa dhacay ka baxista' });
        }
        res.json({ success: true, message: 'Si fiican aad uga baxday' });
    });
});

// Create new post
app.post('/post', upload.single('media'), (req, res) => {
    try {
        const { text } = req.body;
        const users = loadUsers();
        const posts = loadPosts();
        
        if (!req.session.userId) {
            return res.status(401).json({ error: 'Fadlan gal akoonkaaga' });
        }
        
        const user = users.find(u => u.id === req.session.userId);
        if (!user) {
            return res.status(404).json({ error: 'Isticmaale lama helin' });
        }
        
        // Validate that either text or media is provided
        if (!text && !req.file) {
            return res.status(400).json({ error: 'Fadlan geli qoraal ama dooro sawir/muqaal' });
        }
        
        const newPost = {
            id: uuidv4(),
            userId: user.id,
            username: user.username,
            profileImage: user.profileImage,
            text: text || '',
            media: req.file ? req.file.filename : null,
            mediaType: req.file ? req.file.mimetype.split('/')[0] : null,
            createdAt: new Date().toISOString(),
            likes: [],
            comments: []
        };
        
        posts.unshift(newPost);
        savePosts(posts);
        
        res.json({ 
            success: true, 
            message: 'Post-kaga waa la sameeyay!',
            post: newPost
        });
        
    } catch (error) {
        console.error('Post creation error:', error);
        res.status(500).json({ error: 'Khalad ayaa dhacay sameynta post-ka' });
    }
});

// Get all posts
app.get('/api/posts', (req, res) => {
    try {
        const posts = loadPosts();
        res.json(posts);
    } catch (error) {
        console.error('Error loading posts:', error);
        res.status(500).json({ error: 'Khalad ayaa dhacay soo dejinta post-yada' });
    }
});

// Add comment to post
app.post('/api/comment/:postId', requireAuth, (req, res) => {
    try {
        const { comment } = req.body;
        const { postId } = req.params;
        const users = loadUsers();
        const posts = loadPosts();
        
        if (!comment || comment.trim().length === 0) {
            return res.status(400).json({ error: 'Fadlan geli comment' });
        }
        
        const user = users.find(u => u.id === req.session.userId);
        const postIndex = posts.findIndex(p => p.id === postId);
        
        if (postIndex === -1) {
            return res.status(404).json({ error: 'Post-ka lama helin' });
        }
        
        const newComment = {
            id: uuidv4(),
            userId: user.id,
            username: user.username,
            profileImage: user.profileImage,
            comment: comment.trim(),
            createdAt: new Date().toISOString()
        };
        
        posts[postIndex].comments.push(newComment);
        savePosts(posts);
        
        res.json({ 
            success: true, 
            message: 'Comment-kaaga waa la diray',
            comment: newComment
        });
        
    } catch (error) {
        console.error('Comment error:', error);
        res.status(500).json({ error: 'Khalad ayaa dhacay dirista comment-ka' });
    }
});

// Like/unlike post
app.post('/api/like/:postId', requireAuth, (req, res) => {
    try {
        const { postId } = req.params;
        const posts = loadPosts();
        const postIndex = posts.findIndex(p => p.id === postId);
        
        if (postIndex === -1) {
            return res.status(404).json({ error: 'Post-ka lama helin' });
        }
        
        const post = posts[postIndex];
        const likeIndex = post.likes.indexOf(req.session.userId);
        
        if (likeIndex === -1) {
            // Add like
            post.likes.push(req.session.userId);
        } else {
            // Remove like
            post.likes.splice(likeIndex, 1);
        }
        
        savePosts(posts);
        res.json({ 
            success: true, 
            likes: post.likes.length,
            liked: likeIndex === -1
        });
        
    } catch (error) {
        console.error('Like error:', error);
        res.status(500).json({ error: 'Khalad ayaa dhacay taageerida' });
    }
});

// Get user profile
app.get('/api/profile/:username', (req, res) => {
    try {
        const { username } = req.params;
        const users = loadUsers();
        const posts = loadPosts();
        
        const user = users.find(u => u.username === username);
        if (!user) {
            return res.status(404).json({ error: 'Isticmaale lama helin' });
        }
        
        const userPosts = posts.filter(p => p.userId === user.id);
        
        // Remove sensitive information
        const userProfile = { ...user };
        delete userProfile.password;
        
        res.json({
            user: userProfile,
            posts: userPosts,
            postCount: userPosts.length
        });
        
    } catch (error) {
        console.error('Profile error:', error);
        res.status(500).json({ error: 'Khalad ayaa dhacay soo dejinta profile-ka' });
    }
});

// Update user profile
app.post('/api/update-profile', upload.single('profile'), async (req, res) => {
    try {
        const { username, currentPassword, newPassword } = req.body;
        const users = loadUsers();
        
        if (!req.session.userId) {
            return res.status(401).json({ error: 'Fadlan gal akoonkaaga' });
        }
        
        const userIndex = users.findIndex(u => u.id === req.session.userId);
        if (userIndex === -1) {
            return res.status(404).json({ error: 'Isticmaale lama helin' });
        }
        
        const user = users[userIndex];
        const updates = {};
        
        // Update username if provided and different
        if (username && username !== user.username) {
            // Check if new username is available
            if (users.some(u => u.username === username && u.id !== user.id)) {
                return res.status(400).json({ error: 'Magacan waa la isticmaalaa' });
            }
            updates.username = username;
        }
        
        // Update password if provided
        if (currentPassword && newPassword) {
            const passwordMatch = await bcrypt.compare(currentPassword, user.password);
            if (!passwordMatch) {
                return res.status(400).json({ error: 'Password-ga hada jira waa khalad' });
            }
            
            if (newPassword.length < 6) {
                return res.status(400).json({ error: 'Password cusub waa inuu ka kooban yahay ugu yaraan 6 xaraf' });
            }
            
            updates.password = await bcrypt.hash(newPassword, 10);
        }
        
        // Update profile image if provided
        if (req.file) {
            updates.profileImage = req.file.filename;
            
            // Optional: Delete old profile image if it's not default
            if (user.profileImage !== 'default.png') {
                const oldImagePath = path.join(__dirname, 'uploads', 'profiles', user.profileImage);
                if (fs.existsSync(oldImagePath)) {
                    fs.unlinkSync(oldImagePath);
                }
            }
        }
        
        // Apply updates
        if (Object.keys(updates).length > 0) {
            users[userIndex] = {
                ...user,
                ...updates,
                updatedAt: new Date().toISOString()
            };
            
            saveUsers(users);
            
            // Update session if username changed
            if (updates.username) {
                req.session.username = updates.username;
            }
            
            res.json({ 
                success: true, 
                message: 'Profile-kaaga waa la cusboonaysiiyay'
            });
        } else {
            res.json({ 
                success: true, 
                message: 'Waxba ma bedesheen'
            });
        }
        
    } catch (error) {
        console.error('Profile update error:', error);
        res.status(500).json({ error: 'Khalad ayaa dhacay cusboonaysiinta profile-ka' });
    }
});

// Serve uploaded files
app.get('/uploads/:type/:filename', (req, res) => {
    const { type, filename } = req.params;
    const filePath = path.join(__dirname, 'uploads', type, filename);
    
    if (fs.existsSync(filePath)) {
        res.sendFile(filePath);
    } else {
        // Return default image if file doesn't exist
        if (type === 'profiles') {
            res.sendFile(path.join(__dirname, 'public', 'images', 'default-profile.png'));
        } else {
            res.status(404).json({ error: 'Faylka lama helin' });
        }
    }
});

// Error handling middleware
app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'Faylka aad soo rogaysay waa weyn yahay' });
        }
    }
    console.error('Server error:', error);
    res.status(500).json({ error: 'Khalad server ah ayaa dhacay' });
});

// Start server
server.listen(port, () => {
    console.log(`Server-ka wuxuu ka shaqeeyaa http://localhost:${port}`);
    console.log(`📁 Data directory: ${path.join(__dirname, 'data')}`);
    console.log(`📁 Uploads directory: ${path.join(__dirname, 'uploads')}`);
});

// Create default files if they don't exist
if (!fs.existsSync('./data/users.json')) {
    fs.writeFileSync('./data/users.json', '[]');
}

if (!fs.existsSync('./data/posts.json')) {
    fs.writeFileSync('./data/posts.json', '[]');
}