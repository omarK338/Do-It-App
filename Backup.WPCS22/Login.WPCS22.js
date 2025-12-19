let loginAttempts = 0;
let recoveryAttempts = 0;

function showForm(formId) {
    document.querySelectorAll('.form-section').forEach(s => s.style.display = 'none');
    const form = document.getElementById(`${formId}-form`);
    if (form) form.style.display = 'flex';

    document.getElementById('login-error').textContent = '';
    document.getElementById('recovery-error').textContent = '';

    if (formId === 'register' || formId === 'recovery') {
        document.getElementById('login-username').value = '';
        document.getElementById('login-password').value = '';
        loginAttempts = 0;
    }
}

function showSecurityQuestions() {
    const username = document.getElementById('recovery-username').value.trim();
    const errorDiv = document.getElementById('recovery-error');
    const questionsDiv = document.getElementById('security-questions-div');

    if (!username) {
        errorDiv.textContent = 'Please enter your username or email.';
        return;
    }

    errorDiv.textContent = 'Loading your security questions...';
    questionsDiv.style.display = 'none';

    fetch(`/api/recover?username=${encodeURIComponent(username)}`)
        .then(async res => {
            const data = await res.json();
            if (!res.ok) {
                errorDiv.textContent = data.error || 'User not found.';
                if (data.type === 'user_not_found') {
                    setTimeout(() => showForm('login'), 3000);
                }
                return;
            }

            document.getElementById('question1-text').textContent = data.questions[0];
            document.getElementById('question2-text').textContent = data.questions[1];
            document.getElementById('question3-text').textContent = data.questions[2];
            questionsDiv.style.display = 'block';
            errorDiv.textContent = '';
        })
        .catch(() => {
            errorDiv.textContent = 'Failed to load questions.';
        });
}

async function verifySecurityAnswers() {
    const username = document.getElementById('recovery-username').value.trim();
    const a1 = document.getElementById('security-answer1-input').value.trim();
    const a2 = document.getElementById('security-answer2-input').value.trim();
    const a3 = document.getElementById('security-answer3-input').value.trim();
    const errorDiv = document.getElementById('recovery-error');

    if (!a1 || !a2 || !a3) {
        errorDiv.textContent = 'Please fill all answers.';
        return;
    }

    try {
        // Step 1: Verify answers
        const res = await fetch('/api/recover', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                username: username, 
                answer1: a1, 
                answer2: a2, 
                answer3: a3 
            })
        });

        const data = await res.json();

        if (!res.ok) {
            recoveryAttempts++;
            if (recoveryAttempts >= 3) {
                errorDiv.innerHTML = `Too many attempts. <button class="btn-primary" style="margin-top:10px;" onclick="location.href='mailto:iti.202320291@thebes.edu.eg'">Contact Admin</button>`;
            } else {
                errorDiv.textContent = `${data.error || 'Wrong answers'} (${recoveryAttempts}/3)`;
            }
            return;
        }

        // Set user data and flags, then redirect to profile
        localStorage.setItem('userId', data.id);
        localStorage.setItem('username', data.username);
        localStorage.setItem('bypassProfilePassword', 'true');
        localStorage.setItem('forcePasswordChange', 'true');

        window.location.href = '../Profile.WPCS22/Profile.WPCS22.html';

    } catch (err) {
        errorDiv.textContent = 'Connection failed.';
    }
}

// Login Handler
document.getElementById('login').addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = document.getElementById('login-username').value.trim();
    const password = document.getElementById('login-password').value;
    const errorDiv = document.getElementById('login-error');

    try {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await res.json();

        if (!res.ok) {
            if (data.type === 'user_not_found') {
                errorDiv.textContent = data.error;
                loginAttempts = 0;
                return;
            }
            if (data.type === 'wrong_password') {
                loginAttempts = (data.attempts || 0);
                errorDiv.textContent = `${data.error} (Attempt ${loginAttempts}/3)`;

                if (loginAttempts >= 3) {
                    document.getElementById('recovery-username').value = username;
                    showForm('recovery');
                    showSecurityQuestions();
                }
                return;
            }
            throw new Error(data.error);
        }

        // Normal login success
        localStorage.setItem('userId', data.id);
        localStorage.setItem('username', data.username);
        localStorage.removeItem('bypassProfilePassword');
        localStorage.removeItem('forcePasswordChange');
        window.location.href = './Home.WPCS22.html';

    } catch (err) {
        errorDiv.textContent = 'Connection error.';
    }
});

// Register Handler
document.getElementById('register').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const username = document.getElementById('register-username').value.trim();
    const email = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value;
    
    // Basic password strength check
    const minLength = 8;
    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasNumber = /\d/.test(password);
    const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
    
    if (password.length < minLength || !hasUpper || !hasLower || !hasNumber || !hasSpecial) {
        alert("Password must be at least 8 characters and contain uppercase, lowercase, number, and special character.");
        return;
    }

    const user = {
        username: username,
        email: email,
        password: password,
        question1: document.getElementById('security-question1').value.trim(),
        answer1: document.getElementById('security-answer1').value.trim(),
        question2: document.getElementById('security-question2').value.trim(),
        answer2: document.getElementById('security-answer2').value.trim(),
        question3: document.getElementById('security-question3').value.trim(),
        answer3: document.getElementById('security-answer3').value.trim()
    };

    if (!user.question1 || !user.answer1 || !user.question2 || !user.answer2 || !user.question3 || !user.answer3) {
        alert("Please fill all security questions and answers.");
        return;
    }

    // Check if answers are the same as password
    if ([user.answer1, user.answer2, user.answer3].includes(password)) {
        alert("Security answers cannot be the same as password.");
        return;
    }

    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(user)
        });

        if (!response.ok) {
            const err = await response.json();
            alert(err.error || 'Registration failed');
            return;
        }

        alert('Registration successful! Please login.');
        showForm('login');
    } catch (err) {
        alert('Connection error. Please try again.');
    }
});

// Initialize forms
document.addEventListener('DOMContentLoaded', () => {
    // Clear any existing flags
    localStorage.removeItem('bypassProfilePassword');
    localStorage.removeItem('forcePasswordChange');
    
    // Show login form by default
    showForm('login');
});