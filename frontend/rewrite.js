const fs = require('fs');

let html = fs.readFileSync('student-announcements.html', 'utf8');
const startIdx = html.indexOf('<div class=\"announcements-grid\">');
const endIdx = html.indexOf('</div>\r\n            </div>\r\n\r\n            <div class=\"chat-widget\" id=\"ai-chat-widget\">');

if (startIdx !== -1 && endIdx !== -1) {
    let newGrid = `
                <div class="three-column-grid">
                    <div class="feed-column">
                        <div class="tabs-nav">
                            <button class="tab-btn active">All</button>
                            <button class="tab-btn">General</button>
                            <button class="tab-btn">Educational Assistance</button>
                            <button class="tab-btn">Reminder</button>
                            <button class="tab-btn">Event</button>
                        </div>
                        <div class="search-filter-row" style="display:flex; gap:10px; margin-bottom:15px;">
                            <div class="search-box" style="flex:1; display:flex; background:#fff; border:1px solid #e2e8f0; border-radius:8px; padding:0 15px; align-items:center;">
                                <i class="fa-solid fa-magnifying-glass" style="color:#94a3b8;"></i>
                                <input type="text" id="search-input" placeholder="Search announcements..." style="border:none; padding:10px; flex:1; outline:none; background:transparent;">
                            </div>
                        </div>
                        <div class="feed-list" id="announcements-list-container">
                            <div class="text-center text-muted" style="padding: 40px;"><i class="fa-solid fa-circle-notch fa-spin"></i> Loading...</div>
                        </div>
                    </div>

                    <div class="detail-column">
                        <div class="detail-pane" id="detail-pane" style="display: none; padding:20px;">
                            <div id="detail-content-container"></div>
                        </div>
                        <div class="detail-pane" id="empty-pane" style="display: flex; align-items: center; justify-content: center; text-align: center; color: #94a3b8; height:100%;">
                            <div>
                                <div style="font-size: 40px; margin-bottom: 10px;">📢</div>
                                <p>Select an announcement to view details.</p>
                            </div>
                        </div>
                    </div>

                    <div class="detail-column">
                        <div class="detail-pane" style="display:flex; flex-direction:column; height: 100%; padding:0;">
                            <div style="padding: 20px; border-bottom: 1px solid var(--border-color);">
                                <h3 id="comments-count-header" style="margin:0; font-size: 16px; font-weight: 700;">Comments (0)</h3>
                            </div>
                            <div class="feed-list" id="comments-list-container" style="flex:1; padding: 20px;">
                                <div class="text-center text-muted"><i class="fa-solid fa-circle-notch fa-spin"></i> Loading...</div>
                            </div>
                            <div id="comment-input-area" style="padding: 15px; border-top: 1px solid var(--border-color); display:flex; gap: 10px; background: #f8fafc;">
                                <input type="text" id="student-comment-input" placeholder="Write a comment..." style="flex:1; border: 1px solid #cbd5e1; border-radius: 20px; padding: 10px 15px; font-size:13px; outline:none;">
                                <button id="btn-send-comment" style="background: var(--primary-color); color: white; border:none; width: 40px; height:40px; border-radius:50%; cursor:pointer; display:flex; align-items:center; justify-content:center;">
                                    <i class="fa-solid fa-paper-plane"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
`;
    html = html.substring(0, startIdx) + newGrid + html.substring(endIdx);
    fs.writeFileSync('student-announcements.html', html);
    console.log('Replaced');
} else {
    console.log('Not found');
}
