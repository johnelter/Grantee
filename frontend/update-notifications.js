const fs = require('fs');
const path = require('path');

const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.html'));

files.forEach(f => {
    if (f.includes('admin-') || f.includes('login') || f.includes('register')) return;
    
    let html = fs.readFileSync(f, 'utf8');
    
    if (html.includes('id="notification-bell"')) {
        html = html.replace(/<button[^>]*id="notification-bell"[^>]*>/g, '<button class="btn-notification" id="notification-bell" type="button">');
        
        html = html.replace(/<span[^>]*id="notification-badge"[^>]*>.*?<\/span>/g, '<span class="badge" id="notification-badge" style="display:none;">0</span>');
        
        let count = (html.match(/src="js\/components\/student-notifications\.js"/g) || []).length;
        if (count > 1) {
            html = html.replace('<script src="js/components/student-notifications.js"></script>', '');
        }
        
        if (f === 'student-announcements.html' && !html.includes('student-notifications.js')) {
            html = html.replace('</body>', '    <script src="js/components/student-notifications.js"></script>\n</body>');
        }
        
        fs.writeFileSync(f, html);
        console.log('Updated ' + f);
    }
});
