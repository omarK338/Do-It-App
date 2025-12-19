const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const bcrypt = require('bcrypt');
const app = express();

// Ensure database and sound directories exist
const dbDir = path.join(__dirname, 'SysMain.WPCS22/DB.WPCS22/Database.WPCS22');
const defaultSoundsDir = path.join(__dirname, 'SysMain.WPCS22/DB.WPCS22/AlarmsTrack.WPCS22/DefaultsTracks.WPCS22');
const userSoundsDir = path.join(__dirname, 'SysMain.WPCS22/DB.WPCS22/AlarmsTrack.WPCS22/User\'sTracks.WPCS22');

for (const dir of [dbDir, defaultSoundsDir, userSoundsDir]) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

// Initialize SQLite database
const db = new sqlite3.Database(path.join(dbDir, 'DB.WPCS22.db'), (err) => {
    if (err) {
        console.error('Database connection error:', err);
    } else {
        console.log('Connected to SQLite database at SysMain.WPCS22/DB.WPCS22/Database.WPCS22/DB.WPCS22.db');
        db.serialize(() => {
            db.run(`
                CREATE TABLE IF NOT EXISTS Users (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    username TEXT NOT NULL UNIQUE,
                    email TEXT NOT NULL UNIQUE,
                    password TEXT NOT NULL,
                    question1 TEXT NOT NULL,
                    answer1 TEXT NOT NULL,
                    question2 TEXT NOT NULL,
                    answer2 TEXT NOT NULL,
                    question3 TEXT NOT NULL,
                    answer3 TEXT NOT NULL,
                    GoogleDriveEmail TEXT,
                    GoogleRefreshToken TEXT,
                    DriveDailiesFolderID TEXT,
                    DriveTasksFolderID TEXT,
                    login_times INTEGER DEFAULT 0
                )
            `);
            db.run(`
                CREATE TABLE IF NOT EXISTS Tasks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    title TEXT NOT NULL,
                    priority TEXT,
                    reminder TEXT,
                    notes TEXT,
                    media TEXT,
                    sound TEXT,
                    status TEXT DEFAULT 'Pending',
                    created_date TEXT DEFAULT CURRENT_TIMESTAMP,
                    DriveFileID TEXT,
                    DriveOwnerEmail TEXT,
                    FOREIGN KEY (user_id) REFERENCES Users(id)
                )
            `);
            db.run(`
                CREATE TABLE IF NOT EXISTS Dailies (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL,
                    title TEXT NOT NULL,
                    note TEXT,
                    time TEXT,
                    reminder TEXT,
                    media TEXT,
                    DriveFileID TEXT,
                    DriveOwnerEmail TEXT,
                    FOREIGN KEY (user_id) REFERENCES Users(id)
                )
            `);
        });
    }
});

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const fieldName = file.fieldname;
        const dir = fieldName === 'sound' ? userSoundsDir : userSoundsDir;
        cb(null, dir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        // Only allow audio files for alarm sounds
        if (file.fieldname === 'sound' && file.mimetype.startsWith('audio/')) {
            cb(null, true);
        } else {
            cb(new Error('Only audio files are allowed for alarm sounds'));
        }
    }
});

// Middleware
app.use(express.json());
app.use(express.static(__dirname));
app.use('/sounds/defaults', express.static(defaultSoundsDir));

// Password strength validation function
function isStrongPassword(password) {
    const minLength = 8;
    const hasUpper = /[A-Z]/.test(password);
    const hasLower = /[a-z]/.test(password);
    const hasNumber = /\d/.test(password);
    const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);
    return password.length >= minLength && hasUpper && hasLower && hasNumber && hasSpecial;
}

// API Endpoints

// === Google Drive Endpoints ===
app.post('/api/users/:id/drive', (req, res) => {
    const { email, refreshToken, dailiesFolderId, tasksFolderId } = req.body;
    const userId = req.params.id;

    db.run(
        `UPDATE Users SET 
         GoogleDriveEmail = ?, GoogleRefreshToken = ?, DriveDailiesFolderID = ?, DriveTasksFolderID = ? 
         WHERE id = ?`,
        [email, refreshToken || null, dailiesFolderId, tasksFolderId, userId],
        (err) => {
            if (err) {
                console.error('Error saving Drive info:', err);
                return res.status(500).json({ error: 'Failed to save Drive connection' });
            }
            res.json({ success: true, message: 'Drive connected successfully' });
        }
    );
});

app.get('/api/users/:id/drive', (req, res) => {
    const userId = req.params.id;

    db.get(
        `SELECT GoogleDriveEmail as email, DriveDailiesFolderID as dailiesFolderId, DriveTasksFolderID as tasksFolderId 
         FROM Users WHERE id = ?`,
        [userId],
        (err, row) => {
            if (err) {
                console.error('Error fetching Drive info:', err);
                return res.status(500).json({ error: 'Server error' });
            }
            if (!row) return res.status(404).json({ error: 'User not found' });
            res.json({
                connected: !!row.email,
                email: row.email,
                dailiesFolderId: row.dailiesFolderId,
                tasksFolderId: row.tasksFolderId
            });
        }
    );
});

// Token exchange endpoint (fixes HTML/JSON error)
app.post('/api/google/exchange-code', async (req, res) => {
    const { code } = req.body;

    if (!code) {
        return res.status(400).json({ error: 'No code provided' });
    }

    try {
        // Exchange code for tokens (use YOUR real client_secret from Google Console)
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: '232380579632-12ocsk6043kmbn3qeciau8ie91he0qkf.apps.googleusercontent.com', // Your Client ID
                client_secret: 'GOCSPX-your-client-secret-here', // REPLACE with your real Client Secret from Console
                code: code,
                grant_type: 'authorization_code',
                redirect_uri: 'http://localhost:8080/Profile.WPCS22/Profile.WPCS22.html' // Exact match
            })
        });

        if (!tokenResponse.ok) {
            const err = await tokenResponse.text(); // Use .text() for error details
            console.error('Google token error:', err);
            return res.status(400).json({ error: 'Token exchange failed', details: err });
        }

        const tokens = await tokenResponse.json();
        res.json({
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token,
            email: tokens.email || 'unknown' // Fallback
        });
    } catch (err) {
        console.error('Exchange error:', err);
        res.status(500).json({ error: 'Internal exchange error' });
    }
});

app.get('/api/sounds/defaults', (req, res) => {
    fs.readdir(defaultSoundsDir, (err, files) => {
        if (err) {
            return res.status(500).json({ error: 'Error reading default sounds.' });
        }
        const soundFiles = files.filter(f => f.match(/\.(mp3|wav)$/i));
        res.json(soundFiles.map(f => ({
            name: f,
            URL: `/sounds/defaults/${f}`
        })));
    });
});

app.post('/api/register', async (req, res) => {
    const { username, email, password, question1, answer1, question2, answer2, question3, answer3 } = req.body;
    
    // Basic validation
    if (!username || !email || !password || !question1 || !answer1 || !question2 || !answer2 || !question3 || !answer3) {
        return res.status(400).json({ error: 'All fields are required.' });
    }
    
    // Password strength check
    if (!isStrongPassword(password)) {
        return res.status(400).json({
            error: 'Password must be at least 8 characters and contain uppercase, lowercase, number, and special character.'
        });
    }
    
    // Check if answers are the same as password
    if ([answer1.toLowerCase(), answer2.toLowerCase(), answer3.toLowerCase()].includes(password.toLowerCase())) {
        return res.status(400).json({ error: 'Security answers cannot be the same as password.' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        // Hash answers for security
        const hashedA1 = await bcrypt.hash(answer1.trim().toLowerCase(), 10);
        const hashedA2 = await bcrypt.hash(answer2.trim().toLowerCase(), 10);
        const hashedA3 = await bcrypt.hash(answer3.trim().toLowerCase(), 10);
        
        db.run(
            `INSERT INTO Users (username, email, password, question1, answer1, question2, answer2, question3, answer3, login_times)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
            [username, email, hashedPassword, question1, hashedA1, question2, hashedA2, question3, hashedA3],
            function (err) {
                if (err) {
                    if (err.message.includes('UNIQUE constraint failed')) {
                        return res.status(400).json({ error: 'Username or email already exists.' });
                    }
                    return res.status(500).json({ error: 'Server error.' });
                }
                res.json({ id: this.lastID, username, email });
            }
        );
    } catch (err) {
        console.error('Registration error:', err);
        res.status(500).json({ error: 'Server error.' });
    }
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Please fill in all fields.' });
    }

    db.get(
        `SELECT id, username, email, password, login_times FROM Users WHERE username = ? OR email = ?`,
        [username, username],
        async (err, user) => {
            if (err) {
                console.error('DB error:', err);
                return res.status(500).json({ error: 'Server error.' });
            }

            if (!user) {
                return res.status(401).json({
                    error: 'This username/Email doesn\'t exist!',
                    type: 'user_not_found'
                });
            }

            const match = await bcrypt.compare(password, user.password);
            if (!match) {
                const attempts = (user.login_times || 0) + 1;
                db.run(`UPDATE Users SET login_times = ? WHERE id = ?`, [attempts, user.id]);
                return res.status(401).json({
                    error: 'This Password is incorrect!',
                    type: 'wrong_password',
                    attempts: attempts
                });
            }

            // Reset login attempts on success
            db.run(`UPDATE Users SET login_times = 0 WHERE id = ?`, [user.id]);
            res.json({ id: user.id, username: user.username, email: user.email });
        }
    );
});

app.get('/api/recover', (req, res) => {
    const { username } = req.query;
    if (!username) return res.status(400).json({ error: 'Username required' });

    db.get(
        `SELECT id, question1, question2, question3 FROM Users WHERE username = ? OR email = ?`,
        [username, username],
        (err, user) => {
            if (err || !user) {
                return res.status(404).json({
                    error: 'No account found with that username/email.',
                    type: 'user_not_found'
                });
            }
            res.json({ 
                id: user.id,
                questions: [user.question1, user.question2, user.question3] 
            });
        }
    );
});

app.post('/api/recover', async (req, res) => {
    const { username, answer1, answer2, answer3 } = req.body;
    
    if (!username || !answer1 || !answer2 || !answer3) {
        return res.status(400).json({ error: 'All fields are required.' });
    }

    db.get(
        `SELECT * FROM Users WHERE username = ? OR email = ?`,
        [username, username],
        async (err, user) => {
            if (err || !user) {
                return res.status(400).json({ error: 'User not found.' });
            }

            try {
                // Compare hashed answers
                const match1 = await bcrypt.compare(answer1.trim().toLowerCase(), user.answer1);
                const match2 = await bcrypt.compare(answer2.trim().toLowerCase(), user.answer2);
                const match3 = await bcrypt.compare(answer3.trim().toLowerCase(), user.answer3);
                
                if (match1 && match2 && match3) {
                    res.json({ 
                        message: 'Recovery successful', 
                        id: user.id,
                        username: user.username,
                        questions: [user.question1, user.question2, user.question3] 
                    });
                } else {
                    res.status(400).json({ 
                        error: 'Security answers are incorrect. Please try again.',
                        type: 'wrong_answers'
                    });
                }
            } catch (hashErr) {
                console.error('Hash comparison error:', hashErr);
                res.status(500).json({ error: 'Server error.' });
            }
        }
    );
});

// === Security Questions ===
app.put('/api/users/:id/security', async (req, res) => {
    const userId = req.params.id;
    const { currentPassword, question1, answer1, question2, answer2, question3, answer3 } = req.body;

    if (!currentPassword || !question1 || !answer1 || !question2 || !answer2 || !question3 || !answer3) {
        return res.status(400).json({ error: 'All fields are required.' });
    }

    try {
        // First verify current password
        const user = await new Promise((resolve, reject) => {
            db.get(`SELECT id, password FROM Users WHERE id = ?`, [userId], (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

        if (!user) {
            return res.status(404).json({ error: 'User not found.' });
        }

        const passwordMatch = await bcrypt.compare(currentPassword, user.password);
        if (!passwordMatch) {
            return res.status(401).json({ error: 'Current password is incorrect.' });
        }

        // Hash the new answers
        const hashedA1 = await bcrypt.hash(answer1.trim().toLowerCase(), 10);
        const hashedA2 = await bcrypt.hash(answer2.trim().toLowerCase(), 10);
        const hashedA3 = await bcrypt.hash(answer3.trim().toLowerCase(), 10);

        // Update security questions
        db.run(`
            UPDATE Users 
            SET question1 = ?, answer1 = ?, question2 = ?, answer2 = ?, question3 = ?, answer3 = ?
            WHERE id = ?
        `, [question1, hashedA1, question2, hashedA2, question3, hashedA3, userId], (err) => {
            if (err) {
                console.error('Error updating security questions:', err);
                return res.status(500).json({ error: 'Failed to update security questions.' });
            }
            res.json({ success: true, message: 'Security questions updated successfully.' });
        });
    } catch (err) {
        console.error('Error in security questions update:', err);
        res.status(500).json({ error: 'Server error.' });
    }
});

// === Forced Password Change on Complete Recovery ===
app.post('/api/complete-recovery', async (req, res) => {
    const { userId, newPassword } = req.body;

    if (!userId || !newPassword) {
        return res.status(400).json({ error: 'Missing data.' });
    }

    if (!isStrongPassword(newPassword)) {
        return res.status(400).json({ 
            error: 'Password must be at least 8 characters and contain uppercase, lowercase, number, and special character.' 
        });
    }

    try {
        const hashed = await bcrypt.hash(newPassword, 10);
        db.run(`UPDATE Users SET password = ? WHERE id = ?`, [hashed, userId], function(err) {
            if (err) {
                console.error('Error updating password in recovery:', err);
                return res.status(500).json({ error: 'Failed to update password.' });
            }
            res.json({ success: true, message: 'Password updated successfully.' });
        });
    } catch (err) {
        console.error('Error in complete-recovery:', err);
        res.status(500).json({ error: 'Server error.' });
    }
});

app.get('/api/users/:id', (req, res) => {
    db.get(`
        SELECT id, username, email, question1, question2, question3, login_times 
        FROM Users WHERE id = ?
    `, [req.params.id], (err, user) => {
        if (err || !user) {
            return res.status(404).json({ error: 'User not found.' });
        }
        res.json(user);
    });
});

app.get('/api/tasks/:userId', (req, res) => {
    db.all(`SELECT * FROM Tasks WHERE user_id = ?`, [req.params.userId], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: 'Server error.' });
        }
        res.json(rows);
    });
});

app.post('/api/tasks', upload.fields([{ name: 'media' }, { name: 'sound' }]), (req, res) => {
    const { user_id, title, priority, reminder, notes, status, sound } = req.body;
    const mediaPath = req.files && req.files['media']?.[0]?.filename ? 
        path.join('SysMain.WPCS22/DB.WPCS22/AlarmsTrack.WPCS22/User\'sTracks.WPCS22', req.files['media'][0].filename) : null;
    const soundPath = req.files && req.files['sound']?.[0]?.filename ? 
        path.join('SysMain.WPCS22/DB.WPCS22/AlarmsTrack.WPCS22/User\'sTracks.WPCS22', req.files['sound'][0].filename) : 
        (sound && sound !== 'user-defined' ? sound : null);
    db.run(
        `INSERT INTO Tasks (user_id, title, priority, reminder, notes, media, sound, status, created_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [user_id, title, priority, reminder, notes, mediaPath, soundPath, status],
        function (err) {
            if (err) {
                console.error('Error creating task:', err);
                return res.status(400).json({ error: 'Error creating task: ' + err.message });
            }
            res.json({ id: this.lastID });
        }
    );
});

app.put('/api/tasks/:id', upload.fields([{ name: 'media' }, { name: 'sound' }]), (req, res) => {
    const { title, priority, reminder, notes, status, sound } = req.body;
    const mediaPath = req.files && req.files['media']?.[0]?.filename ? 
        path.join('SysMain.WPCS22/DB.WPCS22/AlarmsTrack.WPCS22/User\'sTracks.WPCS22', req.files['media'][0].filename) : null;
    const soundPath = req.files && req.files['sound']?.[0]?.filename ? 
        path.join('SysMain.WPCS22/DB.WPCS22/AlarmsTrack.WPCS22/User\'sTracks.WPCS22', req.files['sound'][0].filename) : 
        (sound && sound !== 'user-defined' ? sound : null);
    db.run(
        `UPDATE Tasks SET title = ?, priority = ?, reminder = ?, notes = ?, media = COALESCE(?, media), sound = COALESCE(?, sound), status = ?
         WHERE id = ?`,
        [title, priority, reminder, notes, mediaPath, soundPath, status, req.params.id],
        (err) => {
            if (err) {
                console.error('Error updating task:', err);
                return res.status(400).json({ error: 'Error updating task: ' + err.message });
            }
            res.json({ message: 'Task updated.' });
        }
    );
});

app.put('/api/tasks/:id/status', (req, res) => {
    const { status } = req.body;
    db.run(
        `UPDATE Tasks SET status = ? WHERE id = ?`,
        [status, req.params.id],
        (err) => {
            if (err) {
                console.error('Error updating task status:', err);
                return res.status(400).json({ error: 'Error updating task status: ' + err.message });
            }
            res.json({ message: 'Task status updated.' });
        }
    );
});

app.delete('/api/tasks/:id', (req, res) => {
    db.run(`DELETE FROM Tasks WHERE id = ?`, [req.params.id], (err) => {
        if (err) {
            return res.status(400).json({ error: 'Error deleting task.' });
        }
        res.json({ message: 'Task deleted.' });
    });
});

app.get('/api/dailies/:userId', (req, res) => {
    db.all(`SELECT * FROM Dailies WHERE user_id = ?`, [req.params.userId], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: 'Server error.' });
        }
        res.json(rows);
    });
});

app.post('/api/dailies', (req, res) => {
    const { user_id, title, note, time, reminder, media } = req.body;
    
    const mediaPath = media || null;
    
    db.run(
        `INSERT INTO Dailies (user_id, title, note, time, reminder, media)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [user_id, title, note, time, reminder, mediaPath],
        function (err) {
            if (err) {
                console.error('Error creating daily:', err);
                return res.status(400).json({ error: 'Error creating daily: ' + err.message });
            }
            res.json({ id: this.lastID });
        }
    );
});

app.put('/api/dailies/:id', (req, res) => {
    const { title, note, time, reminder, media } = req.body;
    
    // media should be a local file path string
    const mediaPath = media || null;
    
    db.run(
        `UPDATE Dailies SET title = ?, note = ?, time = ?, reminder = ?, media = COALESCE(?, media)
         WHERE id = ?`,
        [title, note, time, reminder, mediaPath, req.params.id],
        (err) => {
            if (err) {
                console.error('Error updating daily:', err);
                return res.status(400).json({ error: 'Error updating daily: ' + err.message });
            }
            res.json({ message: 'Daily updated.' });
        }
    );
});

app.delete('/api/dailies/:id', (req, res) => {
    db.run(`DELETE FROM Dailies WHERE id = ?`, [req.params.id], (err) => {
        if (err) {
            return res.status(400).json({ error: 'Error deleting daily.' });
        }
        res.json({ message: 'Daily deleted.' });
    });
});

app.put('/api/users/:id', async (req, res) => {
    const { username, email, password } = req.body;
    
    try {
        let hashedPassword = undefined;
        if (password && password.trim() !== '') {
            if (!isStrongPassword(password)) {
                return res.status(400).json({ 
                    error: 'Password must be at least 8 characters and contain uppercase, lowercase, number, and special character.' 
                });
            }
            hashedPassword = await bcrypt.hash(password, 10);
        }
        
        db.run(
            `UPDATE Users SET username = ?, email = ?, password = COALESCE(?, password)
             WHERE id = ?`,
            [username, email, hashedPassword, req.params.id],
            (err) => {
                if (err) {
                    if (err.message.includes('UNIQUE constraint failed')) {
                        return res.status(400).json({ error: 'Username or email already exists.' });
                    }
                    return res.status(400).json({ error: 'Error updating profile.' });
                }
                res.json({ message: 'Profile updated successfully.' });
            }
        );
    } catch (err) {
        console.error('Error updating user profile:', err);
        res.status(500).json({ error: 'Server error.' });
    }
});

app.get('/api/export/:userId', (req, res) => {
    const userId = req.params.userId;
    db.all(`SELECT * FROM Tasks WHERE user_id = ?`, [userId], (err, tasks) => {
        if (err) return res.status(500).json({ error: 'Error fetching tasks.' });
        db.all(`SELECT * FROM Dailies WHERE user_id = ?`, [userId], (err, dailies) => {
            if (err) return res.status(500).json({ error: 'Error fetching dailies.' });
            const data = { tasks, dailies };
            res.json(data);
        });
    });
});

app.post('/api/upload-alarm-sound', upload.single('sound'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    
    // Only allow audio files for alarm sounds
    if (!req.file.mimetype.startsWith('audio/')) {
        return res.status(400).json({ error: 'Only audio files are allowed for alarm sounds' });
    }
    
    const filePath = `/sounds/user/${req.file.filename}`;
    res.json({ 
        success: true, 
        path: filePath,
        filename: req.file.filename,
        type: req.file.mimetype
    });
});

const PORT = 8080;
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}/Login.WPCS22.html`);
});
