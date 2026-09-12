document.addEventListener("DOMContentLoaded", () => {
    let studentId = null;

    // Inject Rantee AI Assistant Widget and Floating Trigger
    const widgetHTML = `
        <style>
            /* =========================================================
               RANTEEE AI COMPANION STYLING (NATURE PALETTE & DARK MODE)
            ========================================================= */
            :root {
                --rantee-primary: #1F3D2E;
                --rantee-primary-hover: #14281E;
                --rantee-fern: #588157;
                --rantee-moss: #6B7F4E;
                --rantee-light-sage: #A3B18A;
                --rantee-bg: #FFFFFF;
                --rantee-card-bg: #FFFFFF;
                --rantee-card-secondary: #EDF3EB;
                --rantee-text-heading: #14281E;
                --rantee-text-main: #20362B;
                --rantee-text-muted: #586F62;
                --rantee-border: #DFE6DC;
                --rantee-input-bg: #F8FAF6;
                --rantee-bot-bubble: #F4F7F2;
                --rantee-bot-border: #E2EADF;
                --rantee-shadow: 0 20px 45px -10px rgba(31, 61, 46, 0.25), 0 0 0 1px rgba(0, 0, 0, 0.04);
            }

            [data-theme="dark"] {
                --rantee-primary: #1F3D2E;
                --rantee-primary-hover: #2E6B45;
                --rantee-fern: #588157;
                --rantee-moss: #6B7F4E;
                --rantee-light-sage: #A3B18A;
                --rantee-bg: #16271D;
                --rantee-card-bg: #16271D;
                --rantee-card-secondary: #1D3327;
                --rantee-text-heading: #EDF3EE;
                --rantee-text-main: #E2ECE5;
                --rantee-text-muted: #8FA899;
                --rantee-border: #243E2F;
                --rantee-input-bg: #1D3327;
                --rantee-bot-bubble: #1D3327;
                --rantee-bot-border: #2A4736;
                --rantee-shadow: 0 25px 50px -10px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(36, 62, 47, 0.6);
            }

            /* Floating Chat Button ("Ask Rantee!") */
            #open-ai-chat {
                position: fixed !important;
                bottom: 26px;
                right: 26px;
                background: linear-gradient(135deg, #1F3D2E 0%, #3A5A40 55%, #588157 100%) !important;
                color: #FFFFFF !important;
                border: 1px solid rgba(255, 255, 255, 0.25) !important;
                padding: 12px 22px 12px 16px !important;
                border-radius: 30px !important;
                font-size: 14.5px !important;
                font-weight: 700 !important;
                letter-spacing: 0.2px !important;
                cursor: pointer !important;
                user-select: none !important;
                touch-action: manipulation !important;
                box-shadow: 0 10px 25px rgba(31, 61, 46, 0.35), 0 2px 6px rgba(0, 0, 0, 0.1) !important;
                display: flex !important;
                align-items: center !important;
                gap: 10px !important;
                z-index: 99995 !important;
                visibility: visible !important;
                opacity: 1 !important;
                pointer-events: auto !important;
                transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.2s ease !important;
                animation: ranteeFloat 3.5s ease-in-out infinite !important;
            }

            #open-ai-chat * {
                pointer-events: none;
            }

            #open-ai-chat:hover {
                transform: translateY(-3px) scale(1.03) !important;
                box-shadow: 0 14px 30px rgba(31, 61, 46, 0.45) !important;
                animation-play-state: paused !important;
            }

            #open-ai-chat.is-dragging {
                cursor: grabbing !important;
                animation: none !important;
                transition: none !important;
                opacity: 0.95 !important;
                transform: scale(1.05) !important;
            }

            @keyframes ranteeFloat {
                0%, 100% { transform: translateY(0); }
                50% { transform: translateY(-6px); }
            }

            /* Male Profile Avatar Icon for Rantee */
            #open-ai-chat .rantee-btn-icon {
                width: 28px;
                height: 28px;
                background: rgba(255, 255, 255, 0.22);
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 14px;
                color: #FFFFFF;
                flex-shrink: 0;
            }

            #open-ai-chat .status-dot {
                width: 10px;
                height: 10px;
                background: #4ADE80;
                border-radius: 50%;
                position: absolute;
                top: -1px;
                right: -1px;
                border: 2px solid #1F3D2E;
                animation: ranteePulse 2s infinite;
            }

            @keyframes ranteePulse {
                0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(74, 222, 128, 0.7); }
                70% { transform: scale(1.1); box-shadow: 0 0 0 6px rgba(74, 222, 128, 0); }
                100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(74, 222, 128, 0); }
            }

            /* Reset Position Floating Button */
            .reset-rantee-pos-btn {
                position: fixed !important;
                background: var(--rantee-card-bg) !important;
                color: var(--rantee-text-main) !important;
                border: 1px solid var(--rantee-border) !important;
                padding: 6px 12px !important;
                border-radius: 20px !important;
                font-size: 11.5px !important;
                font-weight: 700 !important;
                cursor: pointer !important;
                display: none;
                align-items: center !important;
                gap: 5px !important;
                box-shadow: 0 4px 14px rgba(0, 0, 0, 0.18) !important;
                z-index: 99997 !important;
                transition: all 0.2s ease !important;
                white-space: nowrap !important;
                touch-action: manipulation !important;
            }

            .reset-rantee-pos-btn:hover,
            .reset-rantee-pos-btn:active {
                background: var(--rantee-fern) !important;
                color: #FFFFFF !important;
                border-color: var(--rantee-fern) !important;
                transform: scale(1.05) !important;
            }

            .reset-rantee-pos-btn.show {
                display: flex !important;
                animation: ranteeFadeIn 0.25s ease forwards !important;
            }

            /* Rantee Chat Window Widget */
            #ai-chat-widget {
                position: fixed !important;
                bottom: 85px;
                right: 26px;
                width: 390px;
                max-width: calc(100vw - 24px);
                height: 560px;
                max-height: calc(100vh - 110px);
                background: var(--rantee-card-bg) !important;
                border-radius: 20px !important;
                box-shadow: var(--rantee-shadow) !important;
                border: 1px solid var(--rantee-border) !important;
                display: flex !important;
                flex-direction: column !important;
                z-index: 99998 !important;
                overflow: hidden !important;
                opacity: 0 !important;
                visibility: hidden !important;
                transform: translateY(16px) scale(0.95);
                pointer-events: none !important;
                transition: opacity 0.25s ease, transform 0.25s cubic-bezier(0.16, 1, 0.3, 1), visibility 0.25s ease !important;
            }

            #ai-chat-widget.open {
                opacity: 1 !important;
                visibility: visible !important;
                transform: translateY(0) scale(1) !important;
                pointer-events: auto !important;
            }

            #ai-chat-widget.is-dragging {
                transition: none !important;
                user-select: none !important;
            }

            /* Header (Draggable Handle) */
            #ai-chat-widget .chat-header {
                background: linear-gradient(135deg, #1F3D2E 0%, #2D4C3A 60%, #3A5A40 100%) !important;
                color: #FFFFFF !important;
                padding: 14px 18px !important;
                display: flex !important;
                justify-content: space-between !important;
                align-items: center !important;
                border-top-left-radius: 19px !important;
                border-top-right-radius: 19px !important;
                cursor: grab !important;
                user-select: none !important;
                touch-action: none !important;
                border-bottom: 1px solid rgba(255, 255, 255, 0.1) !important;
            }

            #ai-chat-widget .chat-header:active {
                cursor: grabbing !important;
            }

            .chat-header-profile {
                display: flex;
                align-items: center;
                gap: 10px;
            }

            .chat-header-avatar {
                width: 36px;
                height: 36px;
                background: #FFFFFF;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 18px;
                color: #1F3D2E;
                box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
                flex-shrink: 0;
            }

            .chat-header-info {
                display: flex;
                flex-direction: column;
                text-align: left;
            }

            .chat-header-name {
                font-size: 15px;
                font-weight: 700;
                color: #FFFFFF;
                display: flex;
                align-items: center;
                gap: 6px;
                line-height: 1.2;
            }

            .chat-header-subtitle {
                font-size: 11px;
                color: #A3B18A;
                font-weight: 500;
                margin-top: 2px;
            }

            .header-actions-box {
                display: flex;
                align-items: center;
                gap: 6px;
            }

            .header-action-btn {
                background: rgba(255, 255, 255, 0.15) !important;
                border: none !important;
                color: #FFFFFF !important;
                width: 28px !important;
                height: 28px !important;
                border-radius: 50% !important;
                cursor: pointer !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                transition: background 0.15s ease, transform 0.15s ease !important;
                font-size: 12px !important;
            }

            .header-action-btn:hover {
                background: rgba(255, 255, 255, 0.3) !important;
                transform: scale(1.08) !important;
            }

            .drag-indicator-icon {
                color: rgba(255, 255, 255, 0.4);
                font-size: 12px;
                padding: 4px;
            }

            #ai-chat-widget .close-chat {
                background: rgba(255, 255, 255, 0.15) !important;
                border: none !important;
                color: #FFFFFF !important;
                width: 28px !important;
                height: 28px !important;
                border-radius: 50% !important;
                cursor: pointer !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                transition: background 0.15s ease, transform 0.15s ease !important;
                font-size: 13px !important;
            }

            #ai-chat-widget .close-chat:hover {
                background: rgba(255, 255, 255, 0.3) !important;
                transform: scale(1.08) !important;
            }

            /* Chat Body - Ultra Smooth Touch Scrolling */
            #ai-chat-widget .chat-body {
                flex: 1 !important;
                padding: 16px !important;
                overflow-y: auto !important;
                overflow-x: hidden !important;
                -webkit-overflow-scrolling: touch !important;
                touch-action: pan-y !important;
                overscroll-behavior: contain !important;
                background: var(--rantee-card-bg) !important;
                display: flex !important;
                flex-direction: column !important;
                gap: 14px !important;
                scroll-behavior: smooth !important;
                text-align: left !important;
            }

            #ai-chat-widget .chat-body::-webkit-scrollbar {
                width: 5px !important;
            }

            #ai-chat-widget .chat-body::-webkit-scrollbar-thumb {
                background: var(--rantee-border) !important;
                border-radius: 10px !important;
            }

            /* Suggestion Chips */
            .rantee-chips-container {
                display: flex;
                flex-wrap: wrap;
                gap: 6px;
                margin: 6px 0 4px 0;
                touch-action: pan-y !important;
            }

            .rantee-chip {
                background: var(--rantee-card-secondary);
                color: var(--rantee-text-main);
                border: 1px solid var(--rantee-border);
                border-radius: 16px;
                padding: 6px 12px;
                font-size: 12px;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.15s ease;
                display: inline-flex;
                align-items: center;
                gap: 5px;
                touch-action: manipulation !important;
            }

            .rantee-chip:hover {
                background: var(--rantee-fern);
                color: #FFFFFF;
                border-color: var(--rantee-fern);
                transform: translateY(-1px);
            }

            /* Message Items */
            #ai-chat-widget .chat-message {
                display: flex !important;
                gap: 10px !important;
                max-width: 90% !important;
                animation: ranteeFadeIn 0.25s ease forwards !important;
                text-align: left !important;
                touch-action: pan-y !important;
            }

            @keyframes ranteeFadeIn {
                from { opacity: 0; transform: translateY(8px); }
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
                width: 32px !important;
                height: 32px !important;
                background: linear-gradient(135deg, #1F3D2E, #3A5A40) !important;
                color: #FFFFFF !important;
                border-radius: 50% !important;
                display: flex !important;
                justify-content: center !important;
                align-items: center !important;
                font-size: 15px !important;
                flex-shrink: 0 !important;
                box-shadow: 0 2px 6px rgba(31, 61, 46, 0.25) !important;
            }

            #ai-chat-widget .msg-bubble {
                padding: 11px 15px !important;
                border-radius: 16px !important;
                font-size: 13.5px !important;
                line-height: 1.5 !important;
                position: relative !important;
                word-break: break-word !important;
                user-select: text !important;
            }

            #ai-chat-widget .bot-message .msg-bubble {
                background: var(--rantee-bot-bubble) !important;
                border: 1px solid var(--rantee-bot-border) !important;
                color: var(--rantee-text-main) !important;
                border-top-left-radius: 4px !important;
            }

            #ai-chat-widget .user-message .msg-bubble {
                background: linear-gradient(135deg, #1F3D2E, #2E6B45) !important;
                color: #FFFFFF !important;
                border-top-right-radius: 4px !important;
                box-shadow: 0 4px 12px rgba(31, 61, 46, 0.25) !important;
            }

            #ai-chat-widget .msg-time {
                display: block !important;
                font-size: 10.5px !important;
                color: var(--rantee-text-muted) !important;
                margin-top: 5px !important;
                text-align: right !important;
            }

            #ai-chat-widget .user-message .msg-time {
                color: rgba(255, 255, 255, 0.75) !important;
            }

            /* Typing Dots Animation */
            .typing-dots {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                padding: 4px 0;
            }

            .typing-dots span {
                width: 6px;
                height: 6px;
                background: var(--rantee-fern);
                border-radius: 50%;
                animation: ranteeTyping 1.2s infinite ease-in-out;
            }

            .typing-dots span:nth-child(2) { animation-delay: 0.2s; }
            .typing-dots span:nth-child(3) { animation-delay: 0.4s; }

            @keyframes ranteeTyping {
                0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
                30% { transform: translateY(-5px); opacity: 1; }
            }

            /* Chat Input Area */
            #ai-chat-widget .chat-input-area {
                padding: 12px 14px !important;
                background: var(--rantee-card-bg) !important;
                border-top: 1px solid var(--rantee-border) !important;
                display: flex !important;
                gap: 8px !important;
                align-items: center !important;
            }

            #ai-chat-widget .chat-input-area input {
                flex: 1 !important;
                padding: 10px 16px !important;
                background: var(--rantee-input-bg) !important;
                border: 1px solid var(--rantee-border) !important;
                border-radius: 24px !important;
                font-size: 13.5px !important;
                outline: none !important;
                color: var(--rantee-text-main) !important;
                transition: border-color 0.2s ease, box-shadow 0.2s ease !important;
            }

            #ai-chat-widget .chat-input-area input:focus {
                border-color: var(--rantee-fern) !important;
                box-shadow: 0 0 0 3px rgba(88, 129, 87, 0.15) !important;
            }

            #ai-chat-widget .send-btn {
                background: linear-gradient(135deg, #1F3D2E, #588157) !important;
                color: #FFFFFF !important;
                border: none !important;
                width: 38px !important;
                height: 38px !important;
                border-radius: 50% !important;
                font-size: 14px !important;
                cursor: pointer !important;
                display: flex !important;
                justify-content: center !important;
                align-items: center !important;
                transition: transform 0.15s ease, box-shadow 0.15s ease !important;
                flex-shrink: 0 !important;
                box-shadow: 0 2px 8px rgba(31, 61, 46, 0.3) !important;
            }

            #ai-chat-widget .send-btn:hover {
                transform: scale(1.06) !important;
                box-shadow: 0 4px 12px rgba(31, 61, 46, 0.4) !important;
            }

            #ai-chat-widget .send-btn:disabled {
                opacity: 0.6 !important;
                cursor: not-allowed !important;
            }

            /* =========================================================
               RESPONSIVE MOBILE & TABLET (MINIMIZED BUTTON & MOVABLE CHAT)
            ========================================================= */
            @media (max-width: 768px) {
                /* Minimized circular button on mobile view */
                #open-ai-chat {
                    width: 52px !important;
                    height: 52px !important;
                    min-width: 52px !important;
                    min-height: 52px !important;
                    padding: 0 !important;
                    border-radius: 50% !important;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    bottom: 22px;
                    right: 18px;
                    gap: 0 !important;
                    box-shadow: 0 8px 24px rgba(31, 61, 46, 0.45) !important;
                    cursor: pointer !important;
                    touch-action: none !important;
                    z-index: 99995 !important;
                }

                /* Hide floating trigger when chat is open on mobile */
                body.rantee-open #open-ai-chat {
                    opacity: 0 !important;
                    visibility: hidden !important;
                    pointer-events: none !important;
                    transform: scale(0.8) !important;
                }

                #open-ai-chat .btn-text {
                    display: none !important;
                }

                #open-ai-chat .rantee-btn-icon {
                    width: 100% !important;
                    height: 100% !important;
                    background: transparent !important;
                    font-size: 22px !important;
                    display: flex !important;
                    align-items: center !important;
                    justify-content: center !important;
                    color: #FFFFFF !important;
                }

                #open-ai-chat .status-dot {
                    top: 3px !important;
                    right: 3px !important;
                    width: 11px !important;
                    height: 11px !important;
                    border: 2px solid #1F3D2E !important;
                }

                #ai-chat-widget {
                    width: calc(100vw - 20px) !important;
                    max-width: 420px !important;
                    height: calc(100dvh - 85px) !important;
                    max-height: 580px !important;
                    z-index: 99998 !important;
                    border-radius: 20px !important;
                }

                /* Default docked position on mobile when not manually repositioned */
                #ai-chat-widget:not([data-moved="true"]) {
                    bottom: 10px !important;
                    right: 10px !important;
                    left: 10px !important;
                    margin: 0 auto !important;
                    top: auto !important;
                }

                /* When manually dragged/moved by user on mobile */
                #ai-chat-widget[data-moved="true"] {
                    margin: 0 !important;
                    right: auto !important;
                    bottom: auto !important;
                }

                #ai-chat-widget .chat-header {
                    padding: 12px 14px !important;
                    touch-action: none !important;
                }

                #ai-chat-widget .chat-body {
                    padding: 12px !important;
                    gap: 10px !important;
                    touch-action: pan-y !important;
                    -webkit-overflow-scrolling: touch !important;
                    overscroll-behavior: contain !important;
                }

                #ai-chat-widget .chat-input-area {
                    padding: 10px 12px !important;
                    padding-bottom: max(10px, env(safe-area-inset-bottom)) !important;
                }
            }
        </style>

        <!-- Rantee Chat Window Widget -->
        <div class="chat-widget" id="ai-chat-widget" aria-label="Rantee AI Chat Window">
            <div class="chat-header" id="ai-chat-header" title="Drag to move chat">
                <div class="chat-header-profile">
                    <div class="chat-header-avatar">
                        <i class="fa-solid fa-user-tie"></i>
                    </div>
                    <div class="chat-header-info">
                        <strong class="chat-header-name">Rantee <span style="font-size: 11px; font-weight: 500; background: rgba(255,255,255,0.2); padding: 1px 6px; border-radius: 10px;">AI Helper</span></strong>
                        <span class="chat-header-subtitle">Your scholarship companion 🌱</span>
                    </div>
                </div>
                <div class="header-actions-box">
                    <button class="header-action-btn" id="reset-chat-window-pos" title="Reset chat to default position" aria-label="Reset chat position"><i class="fa-solid fa-rotate-left"></i></button>
                    <span class="drag-indicator-icon" title="Drag to reposition"><i class="fa-solid fa-grip-vertical"></i></span>
                    <button class="close-chat" id="close-ai-chat" aria-label="Close chat" title="Close"><i class="fa-solid fa-xmark"></i></button>
                </div>
            </div>
            
            <div class="chat-body" id="ai-chat-body">
                <!-- Messages & suggestions injected dynamically -->
            </div>

            <div class="chat-input-area">
                <input type="text" id="ai-chat-input" placeholder="Ask Rantee anything about scholarships..." autocomplete="off">
                <button class="send-btn" id="ai-chat-send-btn" aria-label="Send message" title="Send"><i class="fa-solid fa-paper-plane"></i></button>
            </div>
        </div>

        <!-- Floating Reset Position Button -->
        <button class="reset-rantee-pos-btn" id="reset-rantee-pos" title="Reset button to original position" aria-label="Reset position">
            <i class="fa-solid fa-rotate-left"></i>
            <span class="reset-text">Reset</span>
        </button>

        <!-- Draggable Floating "Ask Rantee!" Button (Male Profile Icon, Minimized on Mobile) -->
        <button class="floating-chat-btn" id="open-ai-chat" aria-label="Open Rantee AI Chat" title="Click to chat or drag to reposition">
            <span class="rantee-btn-icon"><i class="fa-solid fa-user-tie"></i></span>
            <span class="btn-text">Ask Rantee!</span>
            <span class="status-dot"></span>
        </button>
    `;

    document.body.insertAdjacentHTML('beforeend', widgetHTML);

    const widget = document.getElementById('ai-chat-widget');
    const widgetHeader = document.getElementById('ai-chat-header');
    const openBtn = document.getElementById('open-ai-chat');
    const closeBtn = document.getElementById('close-ai-chat');
    const resetBtn = document.getElementById('reset-rantee-pos');
    const resetChatHeaderBtn = document.getElementById('reset-chat-window-pos');
    const chatBody = document.getElementById('ai-chat-body');
    const chatInput = document.getElementById('ai-chat-input');
    const sendBtn = document.getElementById('ai-chat-send-btn');

    // Default friendly welcoming message
    const defaultWelcome = {
        role: 'bot',
        content: "Hi! 👋 I'm **Rantee**, your friendly scholarship companion! 🌱 How can I help you today? Feel free to ask about open scholarships, requirements, deadlines, or your application status! ✨",
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        showChips: true
    };

    // Chat History in Session Storage
    let chatHistory = JSON.parse(sessionStorage.getItem('ai_chat_history')) || [defaultWelcome];
    let isChatOpen = sessionStorage.getItem('ai_chat_open') === 'true';
    let lastToggleTime = 0;
    let justFinishedDrag = false;

    function parseSimpleMarkdown(text) {
        if (!text) return '';
        let html = text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/\n\n/g, '<br><br>')
            .replace(/\n/g, '<br>');
        return html;
    }

    function renderMessages() {
        chatBody.innerHTML = '';
        chatHistory.forEach((msg, idx) => {
            if (msg.role === 'bot') {
                const chipsHtml = (idx === 0 || msg.showChips) ? `
                    <div class="rantee-chips-container">
                        <button type="button" class="rantee-chip" onclick="window.sendRanteeQuickQuery('What scholarships or educational assistance are open right now?')">🎓 Open Scholarships</button>
                        <button type="button" class="rantee-chip" onclick="window.sendRanteeQuickQuery('What is my current application status?')">📋 My Application Status</button>
                        <button type="button" class="rantee-chip" onclick="window.sendRanteeQuickQuery('What documents do I need to prepare for scholarship applications?')">📄 Required Documents</button>
                        <button type="button" class="rantee-chip" onclick="window.sendRanteeQuickQuery('Are there any new announcements or deadlines I should know?')">📢 Latest Announcements</button>
                    </div>
                ` : '';

                chatBody.insertAdjacentHTML('beforeend', `
                    <div class="chat-message bot-message">
                        <div class="msg-avatar"><i class="fa-solid fa-user-tie"></i></div>
                        <div class="msg-bubble">
                            <div>${parseSimpleMarkdown(msg.content)}</div>
                            ${chipsHtml}
                            <span class="msg-time">${msg.time || ''}</span>
                        </div>
                    </div>
                `);
            } else {
                chatBody.insertAdjacentHTML('beforeend', `
                    <div class="chat-message user-message">
                        <div class="msg-bubble">
                            <div>${parseSimpleMarkdown(msg.content)}</div>
                            <span class="msg-time">${msg.time || ''}</span>
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

        lastToggleTime = Date.now();
        sessionStorage.setItem('ai_chat_open', isChatOpen);

        if (isChatOpen) {
            document.body.classList.add('rantee-open');
            widget.classList.add('open');
            chatBody.scrollTop = chatBody.scrollHeight;
            setTimeout(() => chatInput?.focus(), 150);
        } else {
            document.body.classList.remove('rantee-open');
            widget.classList.remove('open');
        }
    }

    window.toggleChat = () => toggleChat();

    // Direct click handler for button (works on desktop/mobile and debounces touch duplicates)
    openBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (justFinishedDrag) return;
        if (Date.now() - lastToggleTime < 350) return;
        toggleChat();
    });

    closeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleChat(false);
    });

    // ==========================================
    // RESET POSITION LOGIC
    // ==========================================
    function updateResetButtonVisibility() {
        if (!resetBtn) return;
        const isButtonMoved = openBtn.dataset.moved === 'true' || (openBtn.style.left && openBtn.style.left !== 'auto');
        if (isButtonMoved) {
            const rect = openBtn.getBoundingClientRect();
            resetBtn.classList.add('show');
            if (rect.top > 44) {
                resetBtn.style.top = `${rect.top - 34}px`;
                resetBtn.style.left = `${Math.max(10, Math.min(rect.left, window.innerWidth - 80))}px`;
            } else {
                resetBtn.style.top = `${rect.bottom + 8}px`;
                resetBtn.style.left = `${Math.max(10, Math.min(rect.left, window.innerWidth - 80))}px`;
            }
        } else {
            resetBtn.classList.remove('show');
        }
    }

    function resetAllPositions() {
        openBtn.style.transition = 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
        widget.style.transition = 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)';

        openBtn.style.left = 'auto';
        openBtn.style.top = 'auto';
        openBtn.style.right = window.innerWidth <= 768 ? '18px' : '26px';
        openBtn.style.bottom = window.innerWidth <= 768 ? '22px' : '26px';
        openBtn.dataset.moved = 'false';

        widget.style.left = 'auto';
        widget.style.top = 'auto';
        widget.style.right = window.innerWidth <= 768 ? '10px' : '26px';
        widget.style.bottom = window.innerWidth <= 768 ? '10px' : '85px';
        widget.dataset.moved = 'false';

        sessionStorage.removeItem('rantee_btn_pos');
        sessionStorage.removeItem('rantee_widget_pos');

        if (resetBtn) resetBtn.classList.remove('show');

        setTimeout(() => {
            openBtn.style.transition = '';
            widget.style.transition = '';
        }, 320);
    }

    if (resetBtn) resetBtn.addEventListener('click', resetAllPositions);
    if (resetChatHeaderBtn) resetChatHeaderBtn.addEventListener('click', resetAllPositions);

    // ==========================================
    // DRAGGABLE ENGINE (FLOATING BUTTON & WIDGET)
    // ==========================================
    function makeDraggable(element, handle, onDragEndCallback) {
        let isDragging = false;
        let startX = 0;
        let startY = 0;
        let initialLeft = 0;
        let initialTop = 0;
        let startTouchTime = 0;

        function getCoords(e) {
            if (e.touches && e.touches.length > 0) {
                return { x: e.touches[0].clientX, y: e.touches[0].clientY };
            }
            if (e.changedTouches && e.changedTouches.length > 0) {
                return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
            }
            return { x: e.clientX, y: e.clientY };
        }

        function onStart(e) {
            // Only primary mouse button
            if (e.type === 'mousedown' && e.button !== 0) return;
            // Ignore clicks on header action buttons
            if (e.target.closest('#close-ai-chat, #reset-chat-window-pos, button.close-chat, button.header-action-btn')) return;

            const coords = getCoords(e);
            startX = coords.x;
            startY = coords.y;
            startTouchTime = Date.now();
            isDragging = false;

            const rect = element.getBoundingClientRect();
            initialLeft = rect.left;
            initialTop = rect.top;

            window.addEventListener('mousemove', onMove, { passive: false });
            window.addEventListener('mouseup', onEnd);
            window.addEventListener('touchmove', onMove, { passive: false });
            window.addEventListener('touchend', onEnd);
            window.addEventListener('touchcancel', onEnd);
        }

        function onMove(e) {
            const coords = getCoords(e);
            const deltaX = coords.x - startX;
            const deltaY = coords.y - startY;
            const dist = Math.hypot(deltaX, deltaY);

            // Drag threshold: > 6px movement
            if (dist > 6) {
                if (!isDragging) {
                    isDragging = true;
                    justFinishedDrag = true;
                    element.classList.add('is-dragging');
                }

                if (e.cancelable) e.preventDefault();

                const elWidth = element.offsetWidth || 52;
                const elHeight = element.offsetHeight || 52;
                const maxLeft = window.innerWidth - elWidth - 4;
                const maxTop = window.innerHeight - elHeight - 4;

                let newLeft = Math.max(4, Math.min(initialLeft + deltaX, maxLeft));
                let newTop = Math.max(4, Math.min(initialTop + deltaY, maxTop));

                element.style.left = `${newLeft}px`;
                element.style.top = `${newTop}px`;
                element.style.right = 'auto';
                element.style.bottom = 'auto';
                element.dataset.moved = 'true';

                if (element === openBtn) updateResetButtonVisibility();
            }
        }

        function onEnd(e) {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onEnd);
            window.removeEventListener('touchmove', onMove);
            window.removeEventListener('touchend', onEnd);
            window.removeEventListener('touchcancel', onEnd);

            if (isDragging) {
                element.classList.remove('is-dragging');
                if (onDragEndCallback) onDragEndCallback(element);
                if (element === openBtn) updateResetButtonVisibility();
                setTimeout(() => {
                    justFinishedDrag = false;
                }, 250);
            } else {
                // If it was openBtn and not dragged (a clean tap/click):
                const elapsed = Date.now() - startTouchTime;
                if (element === openBtn && elapsed < 500 && (Date.now() - lastToggleTime > 350)) {
                    toggleChat();
                }
            }
        }

        handle.addEventListener('mousedown', onStart);
        handle.addEventListener('touchstart', onStart, { passive: true });
    }

    // Initialize dragging for floating button and chat widget header
    makeDraggable(openBtn, openBtn, (btn) => {
        sessionStorage.setItem('rantee_btn_pos', JSON.stringify({ left: btn.style.left, top: btn.style.top }));
        updateResetButtonVisibility();
    });

    makeDraggable(widget, widgetHeader, (w) => {
        sessionStorage.setItem('rantee_widget_pos', JSON.stringify({ left: w.style.left, top: w.style.top }));
    });

    // Safely restore saved positions only if within visible viewport
    try {
        const savedBtn = JSON.parse(sessionStorage.getItem('rantee_btn_pos'));
        if (savedBtn && savedBtn.left && savedBtn.top) {
            const numericLeft = parseFloat(savedBtn.left);
            const numericTop = parseFloat(savedBtn.top);
            if (numericLeft < window.innerWidth - 60 && numericTop < window.innerHeight - 60 && numericLeft > 0 && numericTop > 0) {
                openBtn.style.left = savedBtn.left;
                openBtn.style.top = savedBtn.top;
                openBtn.style.right = 'auto';
                openBtn.style.bottom = 'auto';
                openBtn.dataset.moved = 'true';
                setTimeout(updateResetButtonVisibility, 200);
            }
        }
        const savedWidget = JSON.parse(sessionStorage.getItem('rantee_widget_pos'));
        if (savedWidget && savedWidget.left && savedWidget.top) {
            const numericLeft = parseFloat(savedWidget.left);
            const numericTop = parseFloat(savedWidget.top);
            if (numericLeft < window.innerWidth - 100 && numericTop < window.innerHeight - 100 && numericLeft > 0 && numericTop > 0) {
                widget.style.left = savedWidget.left;
                widget.style.top = savedWidget.top;
                widget.style.right = 'auto';
                widget.style.bottom = 'auto';
                widget.dataset.moved = 'true';
            }
        }
    } catch (err) {}

    // Handle screen resize
    window.addEventListener('resize', () => {
        if (openBtn.dataset.moved === 'true') {
            const rect = openBtn.getBoundingClientRect();
            if (rect.right > window.innerWidth || rect.bottom > window.innerHeight) {
                resetAllPositions();
            } else {
                updateResetButtonVisibility();
            }
        }
    });

    // ==========================================
    // CHAT ENGINE & SEND MESSAGE
    // ==========================================
    let isWaitingForReply = false;

    window.sendRanteeQuickQuery = (queryText) => {
        if (chatInput) {
            chatInput.value = queryText;
            sendMessage();
        }
    };

    async function sendMessage() {
        if (isWaitingForReply) return;
        const text = chatInput.value.trim();
        if (!text) return;

        isWaitingForReply = true;
        chatInput.disabled = true;
        sendBtn.disabled = true;

        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        // Push User Message
        chatHistory.push({ role: 'user', content: text, time });
        sessionStorage.setItem('ai_chat_history', JSON.stringify(chatHistory));
        chatInput.value = '';
        renderMessages();

        // Pulsing Typing Dots Indicator
        const typingId = 'typing-' + Date.now();
        chatBody.insertAdjacentHTML('beforeend', `
            <div class="chat-message bot-message" id="${typingId}">
                <div class="msg-avatar"><i class="fa-solid fa-user-tie"></i></div>
                <div class="msg-bubble">
                    <div class="typing-dots">
                        <span></span><span></span><span></span>
                    </div>
                </div>
            </div>
        `);
        chatBody.scrollTop = chatBody.scrollHeight;

        try {
            if (window.supabaseClient && window.supabaseClient.auth) {
                const { data: { session } } = await window.supabaseClient.auth.getSession();
                if (session && session.user) {
                    studentId = session.user.id;
                }
            }

            if (!studentId) {
                const cachedProfile = sessionStorage.getItem('grantee_student_profile');
                if (cachedProfile) {
                    const parsed = JSON.parse(cachedProfile);
                    studentId = parsed.id;
                }
            }

            const backendMessages = chatHistory
                .filter(m => !m.content.includes('typing-dots'))
                .slice(-8)
                .map(m => ({
                    role: m.role === 'bot' ? 'model' : 'user',
                    content: m.content
                }));

            const response = await fetch('https://grantee-backend-n5f4.onrender.com/api/student/ai-chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    studentId: studentId || 'guest_student',
                    messages: backendMessages
                })
            });

            const typingEl = document.getElementById(typingId);
            if (typingEl) typingEl.remove();

            if (response.ok) {
                const data = await response.json();
                chatHistory.push({
                    role: 'bot',
                    content: data.reply || "I'm here to help! Let me know if you have any questions.",
                    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                });
            } else {
                chatHistory.push({
                    role: 'bot',
                    content: "I'm having a little trouble connecting to the scholarship office server right now. 🌱 Please try asking again in a moment!",
                    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                });
            }
        } catch (e) {
            console.error("Rantee AI Error:", e);
            const typingEl = document.getElementById(typingId);
            if (typingEl) typingEl.remove();
            chatHistory.push({
                role: 'bot',
                content: "Oops! A network hiccup occurred. 🌱 Please check your connection or ask again in a moment.",
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
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
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // Initial render
    renderMessages();
    if (isChatOpen) {
        document.body.classList.add('rantee-open');
        widget.classList.add('open');
    }
});