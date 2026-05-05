window.Auth = {
    login: (username, password) => {
        if (username === 'admin@novalogistics.com' && password === 'admin123') {
            localStorage.setItem('currentUser', JSON.stringify({ role: 'admin', username: username }));
            return { success: true, role: 'admin' };
        } else if (username === 'admin' && password === 'admin') {
            localStorage.setItem('currentUser', JSON.stringify({ role: 'admin', username: 'admin' }));
            return { success: true, role: 'admin' };
        } else if (username === 'user' && password === 'user') {
            localStorage.setItem('currentUser', JSON.stringify({ role: 'user', username: 'user' }));
            return { success: true, role: 'user' };
        }
        return { success: false, message: 'Invalid credentials' };
    },

    logout: () => {
        localStorage.removeItem('currentUser');
        window.location.href = 'index.html';
    },

    getCurrentUser: () => {
        return JSON.parse(localStorage.getItem('currentUser'));
    },

    requireAuth: (role) => {
        const user = Auth.getCurrentUser();
        if (!user) {
            window.location.href = 'login.html';
            return;
        }
        if (role && user.role !== role) {
            alert('Unauthorized access');
            window.location.href = 'index.html';
            return;
        }
        return user;
    }
};

document.addEventListener('DOMContentLoaded', () => {
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            Auth.logout();
        });
    }
});
