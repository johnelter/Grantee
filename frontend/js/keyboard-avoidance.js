document.addEventListener('DOMContentLoaded', () => {
    // Check if the device is a mobile device (typically width <= 768px)
    if (window.innerWidth <= 768) {
        // Select all input fields that trigger the virtual keyboard
        const inputs = document.querySelectorAll('input[type="text"], input[type="email"], input[type="password"], input[type="number"], input[type="tel"], textarea');
        
        inputs.forEach(input => {
            input.addEventListener('focus', () => {
                // Set a short timeout to wait for the virtual keyboard to slide up 
                // which changes the viewport height before scrolling.
                setTimeout(() => {
                    input.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }, 300);
            });
        });
    }
});
