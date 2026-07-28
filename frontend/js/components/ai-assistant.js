document.addEventListener("DOMContentLoaded", () => {
    let studentId = null;
    
    // Inject the widget HTML into the body
    const widgetHTML = `
        <style>
            /* Stunning AI Chat Widget Styles */
            #ai-chat-widget {
                position: fixed !important;
                bottom: 100px !important;
                right: 30px !important;
                width: 380px !important;
                background: rgba(255, 255, 255, 0.95) !important;
                backdrop-filter: blur(16px) !important;
                -webkit-backdrop-filter: blur(16px) !important;
                border-radius: 24px !important;
                box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(0,0,0,0.05) !important;
                display: flex !important;
                flex-direction: column !important;
                z-index: 9999 !important;
                overflow: hidden !important;
                opacity: 0;
                transform: translateY(20px) scale(0.95);
                pointer-events: none;
                transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) !important;
                border: none !important;
            }

            #ai-chat-widget.open {
                opacity: 1 !important;
                transform: translateY(0) scale(1) !important;
                pointer-events: all !important;
            }

            #ai-chat-widget .chat-header {
                background: linear-gradient(135deg, #0f766e, #042f2e) !important;
                color: #ffffff !important;
                padding: 20px !important;
                display: flex !important;
                justify-content: space-between !important;
                align-items: center !important;
                border-top-left-radius: 24px !important;
                border-top-right-radius: 24px !important;
                box-shadow: 0 4px 15px rgba(0,0,0,0.1) !important;
            }

            #ai-chat-widget .close-chat {
                background: rgba(255,255,255,0.2) !important;
                border: none !important;
                color: #fff !important;
                font-size: 16px !important;
                width: 32px !important;
                height: 32px !important;
                border-radius: 50% !important;
                cursor: pointer !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                transition: all 0.2s ease !important;
            }

            #ai-chat-widget .close-chat:hover {
                background: rgba(255,255,255,0.4) !important;
                transform: rotate(90deg) !important;
            }

            #ai-chat-widget .chat-body {
                height: 400px !important;
                padding: 20px !important;
                overflow-y: auto !important;
                background: transparent !important;
                display: flex !important;
                flex-direction: column !important;
                gap: 16px !important;
                scroll-behavior: smooth !important;
            }

            #ai-chat-widget .chat-body::-webkit-scrollbar {
                width: 6px !important;
            }
            #ai-chat-widget .chat-body::-webkit-scrollbar-thumb {
                background: #cbd5e1 !important;
                border-radius: 10px !important;
            }

            #ai-chat-widget .chat-message {
                display: flex !important;
                gap: 12px !important;
                max-width: 88% !important;
                animation: aiFadeIn 0.3s ease forwards !important;
            }

            @keyframes aiFadeIn {
                from { opacity: 0; transform: translateY(10px); }
                to { opacity: 1; transform: translateY(0); }
            }

            #ai-chat-widget .bot-message {
                align-self: flex-start !important;
            }

            #ai-chat-widget .user-message {
                align-self: flex-end !important;
                flex-direction: row-reverse !important;
            }

            #ai-chat-widget .msg-avatar {
                width: 34px !important;
                height: 34px !important;
                background: linear-gradient(135deg, #14b8a6, #0f766e) !important;
                color: white !important;
                border-radius: 50% !important;
                display: flex !important;
                justify-content: center !important;
                align-items: center !important;
                font-size: 16px !important;
                flex-shrink: 0 !important;
                box-shadow: 0 4px 10px rgba(20, 184, 166, 0.3) !important;
                border: none !important;
            }

            #ai-chat-widget .msg-bubble {
                padding: 14px 18px !important;
                border-radius: 18px !important;
                font-size: 14px !important;
                line-height: 1.5 !important;
                position: relative !important;
                box-shadow: 0 2px 8px rgba(0,0,0,0.04) !important;
            }

            #ai-chat-widget .bot-message .msg-bubble {
                background: #ffffff !important;
                border: 1px solid #e2e8f0 !important;
                color: #334155 !important;
                border-top-left-radius: 4px !important;
            }

            #ai-chat-widget .user-message .msg-bubble {
                background: linear-gradient(135deg, #10b981, #059669) !important;
                color: #ffffff !important;
                border-top-right-radius: 4px !important;
                box-shadow: 0 4px 15px rgba(16, 185, 129, 0.2) !important;
                border: none !important;
            }

            #ai-chat-widget .msg-time {
                display: block !important;
                font-size: 11px !important;
                color: rgba(255,255,255,0.8) !important;
                margin-top: 6px !important;
                text-align: right !important;
            }

            #ai-chat-widget .bot-message .msg-time {
                color: #94a3b8 !important;
            }

            #ai-chat-widget .chat-input-area {
                padding: 18px 20px !important;
                background: #ffffff !important;
                border-top: 1px solid #f1f5f9 !important;
                display: flex !important;
                gap: 12px !important;
                align-items: center !important;
            }

            #ai-chat-widget .chat-input-area input {
                flex: 1 !important;
                padding: 14px 20px !important;
                background: #f8fafc !important;
                border: 1px solid #e2e8f0 !important;
                border-radius: 24px !important;
                font-size: 14px !important;
                outline: none !important;
                transition: all 0.3s ease !important;
                color: #1e293b !important;
            }

            #ai-chat-widget .chat-input-area input:focus {
                background: #ffffff !important;
                border-color: #0f766e !important;
                box-shadow: 0 0 0 4px rgba(15, 118, 110, 0.1) !important;
            }

            #ai-chat-widget .send-btn {
                background: linear-gradient(135deg, #0f766e, #042f2e) !important;
                color: white !important;
                border: none !important;
                width: 44px !important;
                height: 44px !important;
                border-radius: 50% !important;
                font-size: 18px !important;
                cursor: pointer !important;
                display: flex !important;
                justify-content: center !important;
                align-items: center !important;
                transition: all 0.3s ease !important;
                box-shadow: 0 4px 12px rgba(15, 118, 110, 0.3) !important;
            }

            #ai-chat-widget .send-btn:hover {
                transform: translateY(-2px) scale(1.05) !important;
                box-shadow: 0 6px 16px rgba(15, 118, 110, 0.4) !important;
            }

            #ai-chat-widget .send-btn:active {
                transform: translateY(0) scale(0.95) !important;
            }

            /* Stunning Floating Button */
            #open-ai-chat {
                position: fixed !important;
                bottom: 30px !important;
                right: 30px !important;
                background: linear-gradient(135deg, #0f766e, #042f2e) !important;
                color: #ffffff !important;
                border: none !important;
                padding: 16px 28px !important;
                border-radius: 30px !important;
                font-size: 16px !important;
                font-weight: 600 !important;
                cursor: pointer !important;
                box-shadow: 0 8px 25px rgba(15, 118, 110, 0.4) !important;
                display: flex !important;
                align-items: center !important;
                gap: 10px !important;
                z-index: 9998 !important;
                transition: all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275) !important;
                animation: aiFloat 3s ease-in-out infinite !important;
            }

            #open-ai-chat:hover {
                transform: translateY(-5px) scale(1.05) !important;
                box-shadow: 0 12px 30px rgba(15, 118, 110, 0.5) !important;
                animation-play-state: paused !important;
            }

            @keyframes aiFloat {
                0% { transform: translateY(0px); }
                50% { transform: translateY(-8px); }
                100% { transform: translateY(0px); }
            }

            #open-ai-chat .status-dot {
                width: 12px !important;
                height: 12px !important;
                background: #10b981 !important;
                border-radius: 50% !important;
                position: absolute !important;
                top: -2px !important;
                right: -2px !important;
                border: 3px solid #ffffff !important;
                box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.2) !important;
                animation: aiPulse 2s infinite !important;
                transform: none !important;
            }

            @keyframes aiPulse {
                0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
                70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
                100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
            }

            /* Responsive rules for mobile devices */
            @media (max-width: 768px) {
                #ai-chat-widget {
                    width: calc(100% - 30px) !important;
                    right: 15px !important;
                    bottom: 90px !important;
                }
                
                /* Transform to circle icon on mobile */
                #open-ai-chat {
                    width: 60px !important;
                    height: 60px !important;
                    padding: 0 !important;
                    border-radius: 50% !important;
                    justify-content: center !important;
                    bottom: 15px !important;
                    right: 15px !important;
                }
                
                #open-ai-chat .btn-text {
                    display: none !important;
                }
                
                #open-ai-chat i {
                    font-size: 24px !important;
                    margin: 0 !important;
                }
                
                #open-ai-chat .status-dot {
                    top: 2px !important;
                    right: 4px !important;
                }
            }
        </style>
        <div class="chat-widget" id="ai-chat-widget">
            <div class="chat-header">
                <div style="display:flex; align-items:center; gap:10px;">
                    <div style="background:#fff; width:30px; height:30px; border-radius:50%; display:flex; justify-content:center; align-items:center; font-size:18px; color:var(--text-main);">
                        <i class="fa-solid fa-robot"></i>
                    </div>
                    <div>
                        <strong style="display:block; font-size:14px;">AI Assistant</strong>
                        <span style="font-size:11px; opacity:0.8;">Your scholarship helper</span>
                    </div>
                </div>
                <button class="close-chat" id="close-ai-chat"><i class="fa-solid fa-xmark"></i></button>
            </div>
            <div class="chat-body" id="ai-chat-body">
                <!-- Messages will be injected here -->
            </div>
            <div class="chat-input-area">
                <input type="text" id="ai-chat-input" placeholder="Type your message..." autocomplete="off">
                <button class="send-btn" id="ai-chat-send-btn"><i class="fa-solid fa-paper-plane"></i></button>
            </div>
        </div>

        <button class="floating-chat-btn" id="open-ai-chat">
            <i class="fa-solid fa-robot"></i> <span class="btn-text">AI Assistant</span>
            <span class="status-dot"></span>
        </button>
    `;

    document.body.insertAdjacentHTML('beforeend', widgetHTML);

    const widget = document.getElementById('ai-chat-widget');
    const openBtn = document.getElementById('open-ai-chat');
    const closeBtn = document.getElementById('close-ai-chat');
    const chatBody = document.getElementById('ai-chat-body');
    const chatInput = document.getElementById('ai-chat-input');
    const sendBtn = document.getElementById('ai-chat-send-btn');

    // Load Chat History from Session Storage
    let chatHistory = JSON.parse(sessionStorage.getItem('ai_chat_history')) || [
        {
            role: 'bot',
            content: "Hi there! 👋 I'm your AI assistant. I can help you with scholarships, requirements, application status, announcements, and more.",
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        }
    ];

    // Load Open State from Session Storage
    let isChatOpen = sessionStorage.getItem('ai_chat_open') === 'true';

    function renderMessages() {
        chatBody.innerHTML = '';
        chatHistory.forEach(msg => {
            if (msg.role === 'bot') {
                chatBody.insertAdjacentHTML('beforeend', `
                    <div class="chat-message bot-message">
                        <div class="msg-avatar"><i class="fa-solid fa-robot"></i></div>
                        <div class="msg-bubble">
                            ${msg.content}
                            <span class="msg-time">${msg.time}</span>
                        </div>
                    </div>
                `);
            } else {
                chatBody.insertAdjacentHTML('beforeend', `
                    <div class="chat-message user-message">
                        <div class="msg-bubble">
                            ${msg.content}
                            <span class="msg-time">${msg.time}</span>
                        </div>
                    </div>
                `);
            }
        });
        chatBody.scrollTop = chatBody.scrollHeight;
    }

    function toggleChat(forceOpen = null) {
        if (forceOpen !== null) {
            isChatOpen = forceOpen;
        } else {
            isChatOpen = !isChatOpen;
        }
        
        sessionStorage.setItem('ai_chat_open', isChatOpen);

        if (isChatOpen) {
            widget.classList.add('open');
            chatBody.scrollTop = chatBody.scrollHeight;
        } else {
            widget.classList.remove('open');
        }
    }

    openBtn.addEventListener('click', () => toggleChat());
    closeBtn.addEventListener('click', () => toggleChat(false));

    // Expose toggleChat globally in case other buttons use it (e.g. `onclick="toggleChat()"`)
    window.toggleChat = () => toggleChat();

    // Initial render
    renderMessages();
    if (isChatOpen) {
        widget.classList.add('open');
    }

    let isWaitingForReply = false;
    
    function parseSimpleMarkdown(text) {
        let html = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
        html = html.replace(/\n\n/g, '<br><br>');
        html = html.replace(/\n/g, '<br>');
        return html;
    }

    async function sendMessage() {
        if (isWaitingForReply) return;
        const text = chatInput.value.trim();
        if (!text) return;

        isWaitingForReply = true;
        chatInput.disabled = true;
        sendBtn.disabled = true;

        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        // Add user message
        chatHistory.push({ role: 'user', content: text, time });
        sessionStorage.setItem('ai_chat_history', JSON.stringify(chatHistory));
        chatInput.value = '';
        renderMessages();

        // Add loading bubble
        const typingId = 'typing-' + Date.now();
        chatBody.insertAdjacentHTML('beforeend', `
            <div class="chat-message bot-message" id="${typingId}">
                <div class="msg-avatar"><i class="fa-solid fa-robot"></i></div>
                <div class="msg-bubble" style="opacity: 0.7;">
                    <em>Typing...</em>
                </div>
            </div>
        `);
        chatBody.scrollTop = chatBody.scrollHeight;

        try {
            // Fetch session id dynamically
            const { data: { session } } = await window.supabaseClient.auth.getSession();
            if (session && session.user) {
                studentId = session.user.id;
            } else {
                throw new Error("User session not found.");
            }

            // Prepare messages for backend
            const backendMessages = chatHistory
                .filter(m => !m.content.includes("<em>Typing...</em>")) // exclude loading indicators if any
                .map(m => ({
                    role: m.role === 'bot' ? 'model' : 'user',
                    content: m.content
                }));

            const response = await fetch('http://localhost:3000/api/student/ai-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    studentId: studentId,
                    messages: backendMessages
                })
            });

            const data = await response.json();
            
            // Remove typing indicator
            const typingEl = document.getElementById(typingId);
            if (typingEl) typingEl.remove();

            if (response.ok) {
                chatHistory.push({ 
                    role: 'bot', 
                    content: parseSimpleMarkdown(data.reply), 
                    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) 
                });
            } else {
                chatHistory.push({ role: 'bot', content: "Sorry, I'm having trouble connecting right now.", time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });
            }
        } catch (e) {
            console.error("AI Assistant Error:", e);
            const typingEl = document.getElementById(typingId);
            if (typingEl) typingEl.remove();
            chatHistory.push({ role: 'bot', content: "Sorry, a network error occurred.", time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) });
        }

        sessionStorage.setItem('ai_chat_history', JSON.stringify(chatHistory));
        renderMessages();
        
        isWaitingForReply = false;
        chatInput.disabled = false;
        sendBtn.disabled = false;
        chatInput.focus();
    }

    sendBtn.addEventListener('click', sendMessage);
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            sendMessage();
        }
    });
});