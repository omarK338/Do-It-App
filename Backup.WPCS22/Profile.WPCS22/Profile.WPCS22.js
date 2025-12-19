const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/;

let passwordChanged = false;
let isEditMode = false;
let isForcedPasswordChange = false;
let googleUserEmail = null;
let codeClient = null; // GIS code client

// Prevent leaving during forced password change
window.addEventListener('beforeunload', (e) => {
    if (isForcedPasswordChange && !passwordChanged) {
        e.preventDefault();
        e.returnValue = 'You must change your password before leaving this page!';
    }
});

document.addEventListener('DOMContentLoaded', async () => {
    const userId = localStorage.getItem('userId');
    if (!userId) {
        window.location.href = '../Login.WPCS22.html';
        return;
    }

    const bypassPassword = localStorage.getItem('bypassProfilePassword') === 'true';
    const forcePasswordChange = localStorage.getItem('forcePasswordChange') === 'true';
    
    if (bypassPassword || forcePasswordChange) {
        localStorage.removeItem('bypassProfilePassword');
        if (forcePasswordChange) isForcedPasswordChange = true;
        await loadProfile(forcePasswordChange);
    } else {
        document.getElementById('password-prompt').style.display = 'block';
        document.getElementById('profile-content').style.display = 'none';
    }

    // Load GIS library and initialize
    loadAndInitGIS();
});

function loadAndInitGIS() {
    // Load GIS script if not loaded
    if (!window.google || !window.google.accounts || !window.google.accounts.oauth2) {
        const script = document.createElement('script');
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.defer = true;
        script.onload = initializeGIS;
        document.head.appendChild(script);
    } else {
        initializeGIS();
    }
}

function initializeGIS() {
    // Initialize code client for OAuth2 code flow
    codeClient = window.google.accounts.oauth2.initCodeClient({
        client_id: '232380579632-12ocsk6043kmbn3qeciau8ie91he0qkf.apps.googleusercontent.com',
        scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email',
        ux_mode: 'redirect',
        redirect_uri: window.location.origin + '/Profile.WPCS22/Profile.WPCS22.html', // EXACT match
        state: 'drive_connect_state'
    });

    // Load gapi.client for Drive API
    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.onload = () => {
        gapi.load('client', () => {
            gapi.client.setApiKey('AIzaSyBHAAaBqIXvTQh0MDkTGJnLV4bVXiZWQAE');
            gapi.client.load('drive', 'v3');
        });
    };
    document.head.appendChild(script);

    checkDriveConnection();
}

async function connectGoogleDrive() {
    if (!codeClient) {
        alert('Google library not loaded. Please refresh the page.');
        return;
    }

    try {
        // Check if just returned from Google redirect (code in URL)
        const urlParams = new URLSearchParams(window.location.search);
        const code = urlParams.get('code');
        const state = urlParams.get('state');

        if (code && state === 'drive_connect_state') {
            // We have the code — exchange it
            console.log('Received auth code, exchanging...');
            await exchangeCodeForTokens(code);
            return;
        }

        // No code → start auth flow
        console.log('Starting Google sign-in...');
        codeClient.requestCode();

    } catch (err) {
        console.error('Auth error:', err);
        alert('Sign-in failed. Try again or check console.');
    }
}

async function exchangeCodeForTokens(code) {
    try {
        const tokenRes = await fetch('/api/google/exchange-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code })
        });

        if (!tokenRes.ok) {
            const err = await tokenRes.json();
            throw new Error(err.error || 'Token exchange failed');
        }

        const tokens = await tokenRes.json();
        const accessToken = tokens.access_token;
        googleUserEmail = tokens.email || 'unknown@gmail.com';

        // Create folders
        const rootId = await findOrCreateFolder(accessToken, 'Do-It App');
        const dailiesId = await findOrCreateFolder(accessToken, 'Dailies', rootId);
        const tasksId = await findOrCreateFolder(accessToken, 'Tasks', rootId);

        // Save to your server
        const saveRes = await fetch(`/api/users/${localStorage.getItem('userId')}/drive`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: googleUserEmail,
                refreshToken: tokens.refresh_token || null,
                dailiesFolderId: dailiesId,
                tasksFolderId: tasksId
            })
        });

        if (!saveRes.ok) throw new Error('Failed to save connection');

        // Clean URL and show success
        history.replaceState(null, '', window.location.pathname);
        alert(`Google Drive connected!\nAccount: ${googleUserEmail}`);
        checkDriveConnection();

    } catch (err) {
        console.error('Token exchange failed:', err);
        alert('Connection failed: ' + err.message);
    }
}

async function switchGoogleAccount() {
    if (!confirm('Switch Google Account? This affects new media storage.\nOld files remain in the previous account.')) return;
    connectGoogleDrive(); // Triggers re-auth
}

async function findOrCreateFolder(token, name, parentId = null) {
    // Find existing
    const query = `name='${name}' and mimeType='application/vnd.google-apps.folder' and trashed=false` + (parentId ? ` and '${parentId}' in parents` : '');
    const response = await gapi.client.drive.files.list({ q: query, fields: 'files(id,name)' });
    if (response.result.files && response.result.files.length > 0) {
        console.log(`Found folder: ${name}`);
        return response.result.files[0].id;
    }

    // Create new
    const metadata = {
        name: name,
        mimeType: 'application/vnd.google-apps.folder',
        parents: parentId ? [parentId] : []
    };
    const createRes = await gapi.client.drive.files.create({
        resource: metadata,
        fields: 'id,name'
    });
    console.log(`Created folder: ${name}`);
    return createRes.result.id;
}

async function checkDriveConnection() {
    const userId = localStorage.getItem('userId');
    const res = await fetch(`/api/users/${userId}/drive`);
    if (!res.ok) return;

    const data = await res.json();
    if (data.connected && data.email) {
        googleUserEmail = data.email;
        document.getElementById('drive-status-text').textContent = `Connected: ${data.email}`;
        document.getElementById('drive-status-text').className = 'drive-connected';
        document.getElementById('connect-drive-btn').style.display = 'none';
        document.getElementById('switch-drive-btn').style.display = 'inline-block';
        document.getElementById('drive-info').innerHTML = `
            <strong>Do-It App</strong> folder created in your Drive.<br>
            All media saved to: <em>Dailies</em> and <em>Tasks</em> folders.
        `;
    }
}

async function verifyProfilePassword() {
    const password = document.getElementById('profile-password').value;
    const username = localStorage.getItem('username');

    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        if (!res.ok) {
            alert("Wrong password. Please try again.");
            return;
        }

        document.getElementById('password-prompt').style.display = 'none';
        await loadProfile(false);
    } catch (err) {
        alert("Connection error. Please try again.");
    }
}

async function loadProfile(forcePasswordChangeMode = false) {
    const userId = localStorage.getItem('userId');

    try {
        const userRes = await fetch(`/api/users/${userId}`);
        if (!userRes.ok) throw new Error('Failed to load user data');
        const userData = await userRes.json();

        const tasksRes = await fetch(`/api/tasks/${userId}`);
        const tasks = tasksRes.ok ? await tasksRes.json() : [];
        
        const dailiesRes = await fetch(`/api/dailies/${userId}`);
        const dailies = dailiesRes.ok ? await dailiesRes.json() : [];

        document.getElementById('profile-content').style.display = 'block';

        document.getElementById('profile-username').value = userData.username || '';
        document.getElementById('profile-email').value = userData.email || '';
        document.getElementById('login-times').textContent = userData.login_times || 0;
        document.getElementById('tasks-count').textContent = tasks.length || 0;
        document.getElementById('tasks-done').textContent = tasks.filter(t => t.status === 'Completed').length || 0;
        document.getElementById('dailies-count').textContent = dailies.length || 0;

        // Fill security questions
        if (userData.question1) document.getElementById('security-question1').value = userData.question1;
        if (userData.answer1) document.getElementById('security-answer1').value = userData.answer1;
        if (userData.question2) document.getElementById('security-question2').value = userData.question2;
        if (userData.answer2) document.getElementById('security-answer2').value = userData.answer2;
        if (userData.question3) document.getElementById('security-question3').value = userData.question3;
        if (userData.answer3) document.getElementById('security-answer3').value = userData.answer3;

        // Check Drive connection
        checkDriveConnection();

        // Handle forced password change
        if (forcePasswordChangeMode) {
            isForcedPasswordChange = true;
            document.getElementById('profile-error').textContent = "You recovered your account. Please set a new strong password now.";
            document.getElementById('profile-error').style.color = "#ff9900";
            document.getElementById('profile-error').style.fontWeight = "bold";
            
            document.getElementById('profile-password-field').disabled = false;
            document.getElementById('profile-password-field').focus();
            document.getElementById('update-profile').textContent = "Save New Password";
            
            document.getElementById('update-profile').onclick = async () => {
                const newPass = document.getElementById('profile-password-field').value.trim();
                
                if (!strongPasswordRegex.test(newPass)) {
                    document.getElementById('profile-error').textContent = "Password must be at least 8 characters with uppercase, lowercase, number, and special character!";
                    return;
                }

                try {
                    const res = await fetch('/api/complete-recovery', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ userId, newPassword: newPass })
                    });

                    if (res.ok) {
                        passwordChanged = true;
                        alert('Password updated! You can now logout safely.');
                        document.getElementById('update-profile').onclick = toggleProfileEdit;
                    } else {
                        alert('Failed to update password.');
                    }
                } catch (err) {
                    alert('Network error. Try again.');
                }
            };
        } else {
            document.getElementById('update-profile').onclick = toggleProfileEdit;
        }

    } catch (err) {
        console.error('Error loading profile:', err);
        alert("Failed to load profile. Please try again.");
    }
}

async function toggleProfileEdit() {
    const usernameInput = document.getElementById('profile-username');
    const emailInput = document.getElementById('profile-email');
    const passwordInput = document.getElementById('profile-password-field');
    const btn = document.getElementById('update-profile');
    
    if (!isEditMode) {
        usernameInput.disabled = false;
        emailInput.disabled = false;
        passwordInput.disabled = false;
        passwordInput.placeholder = "Enter new password (optional)";
        btn.textContent = 'Save Changes';
        isEditMode = true;
    } else {
        const username = usernameInput.value.trim();
        const email = emailInput.value.trim();
        const newPassword = passwordInput.value.trim();
        
        if (!username || !email) {
            alert("Username and email are required.");
            return;
        }
        
        if (newPassword && !strongPasswordRegex.test(newPassword)) {
            alert("Password must be at least 8 characters with uppercase, lowercase, number, and special character!");
            return;
        }

        try {
            const res = await fetch(`/api/users/${localStorage.getItem('userId')}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username: username,
                    email: email,
                    password: newPassword || undefined
                })
            });

            if (!res.ok) {
                const err = await res.json();
                alert(err.error || "Failed to update profile.");
                return;
            }

            if (username !== localStorage.getItem('username')) {
                localStorage.setItem('username', username);
            }

            alert("Profile updated successfully!");
            
            usernameInput.disabled = true;
            emailInput.disabled = true;
            passwordInput.disabled = true;
            passwordInput.value = '';
            btn.textContent = 'Edit Account';
            isEditMode = false;
            
        } catch (err) {
            alert("Connection error. Please try again.");
        }
    }
}

async function updateSecurityQuestions() {
    const currentPassword = document.getElementById('security-current-password').value;
    const q1 = document.getElementById('security-question1').value.trim();
    const a1 = document.getElementById('security-answer1').value.trim();
    const q2 = document.getElementById('security-question2').value.trim();
    const a2 = document.getElementById('security-answer2').value.trim();
    const q3 = document.getElementById('security-question3').value.trim();
    const a3 = document.getElementById('security-answer3').value.trim();
    const errorDiv = document.getElementById('security-error');

    if (!currentPassword) {
        errorDiv.textContent = "Current password is required.";
        return;
    }
    
    if (!q1 || !a1 || !q2 || !a2 || !q3 || !a3) {
        errorDiv.textContent = "All security questions and answers are required.";
        return;
    }

    const userId = localStorage.getItem('userId');
    
    try {
        const res = await fetch(`/api/users/${userId}/security`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                currentPassword: currentPassword,
                question1: q1,
                answer1: a1,
                question2: q2,
                answer2: a2,
                question3: q3,
                answer3: a3
            })
        });

        if (!res.ok) {
            const err = await res.json();
            errorDiv.textContent = err.error || "Failed to update security questions.";
            return;
        }

        errorDiv.textContent = "Security questions updated successfully!";
        errorDiv.style.color = "green";
        
        document.getElementById('security-current-password').value = '';
        
        setTimeout(() => {
            errorDiv.textContent = '';
            errorDiv.style.color = '';
        }, 3000);
        
    } catch (err) {
        errorDiv.textContent = "Connection error. Please try again.";
    }
}

function logout() {
    if (isForcedPasswordChange && !passwordChanged) {
        const confirmLeave = confirm("You must change your password first. If you logout now, you'll need to go through recovery again. Logout anyway?");
        if (!confirmLeave) return;
    }
    
    localStorage.clear();
    window.location.href = '../Login.WPCS22.html';
}