document.addEventListener('DOMContentLoaded', async () => {
    const userId = localStorage.getItem('userId');
    if (!userId) {
        window.location.href = 'Login.WPCS22.html';
        return;
    }

    try {
        const response = await fetch(`/api/users/${userId}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const user = await response.json();
        document.getElementById('username').textContent = user.username || 'Guest';
    } catch (err) {
        console.error('Error fetching user:', err);
    }
});
function logout() {
    localStorage.removeItem('userId');
    localStorage.removeItem('username');
    window.location.href = './Login.WPCS22.html';
}