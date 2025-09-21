document.addEventListener('DOMContentLoaded', function() {
    const chatMessages = document.getElementById('chat-messages');
    const messageInput = document.getElementById('message-input');
    const sendBtn = document.getElementById('send-btn');
    const usersList = document.getElementById('users-list');
    const searchUsers = document.getElementById('search-users');
    const currentChatUser = document.getElementById('current-chat-user');
    const usernameSpan = document.getElementById('username');
    const profilePic = document.getElementById('profile-pic');
    const logoutBtn = document.getElementById('logout-btn');
    
    let currentUser = null;
    let selectedUser = null;
    let chatInterval = null;

    // Check authentication
    checkAuth();

    // Event listeners
    sendBtn.addEventListener('click', sendMessage);
    messageInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });
    
    searchUsers.addEventListener('input', searchUsersList);
    logoutBtn.addEventListener('click', logout);

    // Check if user is authenticated
    function checkAuth() {
        fetch('/check-auth')
            .then(response => response.json())
            .then(data => {
                if (data.loggedIn) {
                    currentUser = {
                        id: data.userId,
                        username: data.username
                    };
                    loadUserInfo();
                    loadUsers();
                    
                    // Check if we have a selected user from userlist.html
                    const savedUser = sessionStorage.getItem('selectedUser');
                    if (savedUser) {
                        selectedUser = JSON.parse(savedUser);
                        sessionStorage.removeItem('selectedUser');
                        selectUserFromStorage(selectedUser);
                    }
                } else {
                    window.location.href = '/login.html';
                }
            })
            .catch(error => {
                console.error('Error checking auth:', error);
                window.location.href = '/login.html';
            });
    }

    // Load user info
    function loadUserInfo() {
        fetch('/api/user-info')
            .then(response => response.json())
            .then(user => {
                usernameSpan.textContent = user.username;
                if (user.profileImage) {
                    profilePic.src = `/uploads/profiles/${user.profileImage}`;
                }
            })
            .catch(error => {
                console.error('Error loading user info:', error);
            });
    }

    // Load all users (except current user)
    function loadUsers() {
        fetch('/api/users')
            .then(response => response.json())
            .then(users => {
                displayUsers(users);
            })
            .catch(error => {
                console.error('Error loading users:', error);
            });
    }

    // Display users list
    function displayUsers(users) {
        usersList.innerHTML = '';
        
        // Add link to user list page
        const userListLink = document.createElement('li');
        userListLink.className = 'user-item';
        userListLink.innerHTML = `
            <div style="text-align: center; padding: 15px;">
                <a href="userlist.html" style="color: #1877f2; text-decoration: none; font-weight: bold;">
                    ↔️ Eeg Dhammaan Isticmaalayaasha
                </a>
            </div>
        `;
        usersList.appendChild(userListLink);
        
        if (users.length === 0) {
            usersList.innerHTML += '<div class="no-users">Ma jiro isticmaalayaal kale</div>';
            return;
        }
        
        users.forEach(user => {
            const li = document.createElement('li');
            li.className = 'user-item';
            li.dataset.userId = user.id;
            
            li.innerHTML = `
                <img src="${user.profileImage ? `/uploads/profiles/${user.profileImage}` : '/images/default-profile.png'}" alt="${user.username}">
                <div class="user-info-details">
                    <div class="user-name">${user.username}</div>
                    <div class="user-status">Online</div>
                </div>
            `;
            
            li.addEventListener('click', () => selectUser(user));
            usersList.appendChild(li);
        });
    }

    // Select user from storage (from userlist.html)
    function selectUserFromStorage(user) {
        selectedUser = user;
        currentChatUser.innerHTML = `
            <img src="${user.profileImage ? `/uploads/profiles/${user.profileImage}` : '/images/default-profile.png'}" alt="${user.username}" style="width: 30px; height: 30px; border-radius: 50%; margin-right: 10px;">
            <span>${user.username}</span>
        `;
        
        // Enable message input
        messageInput.disabled = false;
        sendBtn.disabled = false;
        messageInput.focus();
        
        // Load chat history
        loadChatHistory();
        
        // Start polling for new messages
        if (chatInterval) {
            clearInterval(chatInterval);
        }
        chatInterval = setInterval(loadChatHistory, 3000);
        
        // Highlight the selected user in the list
        document.querySelectorAll('.user-item').forEach(item => {
            item.classList.remove('active');
            if (item.dataset.userId === user.id) {
                item.classList.add('active');
            }
        });
    }

    // Search users
    function searchUsersList() {
        const searchTerm = searchUsers.value.toLowerCase();
        const userItems = document.querySelectorAll('.user-item');
        
        userItems.forEach(item => {
            const userNameElement = item.querySelector('.user-name');
            if (userNameElement) {
                const userName = userNameElement.textContent.toLowerCase();
                if (userName.includes(searchTerm)) {
                    item.style.display = 'flex';
                } else {
                    item.style.display = 'none';
                }
            }
        });
    }

    // Select a user to chat with
    function selectUser(user) {
        // Remove active class from all users
        document.querySelectorAll('.user-item').forEach(item => {
            item.classList.remove('active');
        });
        
        // Add active class to selected user
        const selectedItem = document.querySelector(`.user-item[data-user-id="${user.id}"]`);
        if (selectedItem) {
            selectedItem.classList.add('active');
        }
        
        selectedUser = user;
        currentChatUser.innerHTML = `
            <img src="${user.profileImage ? `/uploads/profiles/${user.profileImage}` : '/images/default-profile.png'}" alt="${user.username}" style="width: 30px; height: 30px; border-radius: 50%; margin-right: 10px;">
            <span>${user.username}</span>
        `;
        
        // Enable message input
        messageInput.disabled = false;
        sendBtn.disabled = false;
        messageInput.focus();
        
        // Load chat history
        loadChatHistory();
        
        // Start polling for new messages
        if (chatInterval) {
            clearInterval(chatInterval);
        }
        chatInterval = setInterval(loadChatHistory, 3000);
    }

    // Load chat history
    function loadChatHistory() {
        if (!selectedUser) return;
        
        const chatId = generateChatId(currentUser.id, selectedUser.id);
        
        fetch(`/api/chat/${chatId}`)
            .then(response => response.json())
            .then(messages => {
                displayMessages(messages);
            })
            .catch(error => {
                console.error('Error loading chat history:', error);
            });
    }

    // Display messages
    function displayMessages(messages) {
        chatMessages.innerHTML = '';
        
        messages.forEach(message => {
            const messageDiv = document.createElement('div');
            messageDiv.className = `message ${message.senderId === currentUser.id ? 'sent' : 'received'}`;
            
            const time = new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            
            messageDiv.innerHTML = `
                <div class="message-text">${message.text}</div>
                <div class="message-time">${time}</div>
            `;
            
            chatMessages.appendChild(messageDiv);
        });
        
        // Scroll to bottom
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    // Send message
    function sendMessage() {
        if (!selectedUser || !messageInput.value.trim()) return;
        
        const chatId = generateChatId(currentUser.id, selectedUser.id);
        const message = {
            text: messageInput.value.trim(),
            timestamp: new Date().toISOString(),
            senderId: currentUser.id,
            receiverId: selectedUser.id
        };
        
        fetch('/api/chat/send', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                chatId: chatId,
                message: message
            })
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                messageInput.value = '';
                loadChatHistory();
            } else {
                console.error('Error sending message:', data.error);
            }
        })
        .catch(error => {
            console.error('Error sending message:', error);
        });
    }

    // Generate chat ID (alphabetical order to ensure same chat for both users)
    function generateChatId(userId1, userId2) {
        return [userId1, userId2].sort().join('-');
    }

    // Logout
    function logout() {
        fetch('/logout', {
            method: 'POST'
        })
        .then(response => response.json())
        .then(data => {
            if (data.success) {
                if (chatInterval) {
                    clearInterval(chatInterval);
                }
                window.location.href = '/login.html';
            }
        })
        .catch(error => {
            console.error('Error logging out:', error);
        });
    }
});