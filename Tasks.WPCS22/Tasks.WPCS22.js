let tasks = [];
let editingTaskId = null;
let currentSort = { column: null, direction: 'asc' };
let originalTasks = [];
let selectedTaskId = null;
let lastRightClickedRow = null;
let googleUserEmail = null;
let tasksFolderId = null;
let defaultSounds = [];
let reminderAudio = null;

// === Load Google API ===
const script = document.createElement('script');
script.src = 'https://apis.google.com/js/api.js';
script.onload = () => gapi.load('client:auth2', initGoogleClient);
document.head.appendChild(script);

async function initGoogleClient() {
    await gapi.client.init({
        apiKey: '',                                 
        clientId: '',
        discoveryDocs: [''],
        scope: ''
    });

    const auth = gapi.auth2.getAuthInstance();
    if (auth.isSignedIn.get()) {
        googleUserEmail = auth.currentUser.get().getBasicProfile().getEmail();
        await loadUserDriveInfo();
    }
}

async function loadUserDriveInfo() {
    const res = await fetch(`/api/users/${localStorage.getItem('userId')}/drive`);
    if (res.ok) {
        const data = await res.json();
        if (data.connected) {
            googleUserEmail = data.email;
            tasksFolderId = data.tasksFolderId;
        }
    }
}

async function attachMediaToTask() {
    if (!googleUserEmail) {
        alert("No Google Drive Account to save media.\n\nPlease go to Profile → Connect Google Drive first.");
        return;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,video/*,audio/*';
    input.onchange = async e => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 50 * 1024 * 1024) {
            alert("File exceeds 50 MB limit.");
            return;
        }

        const token = gapi.auth2.getAuthInstance().currentUser.get().getAuthResponse().access_token;
        const folderId = tasksFolderId || await ensureDoItAppFolders(token);
        const fileId = await uploadFileToDrive(token, file, folderId);

        if (fileId) {
            document.getElementById('hidden-drive-id').value = fileId;
            document.getElementById('hidden-drive-email').value = googleUserEmail;
            showMediaPreview(file, fileId);
            alert(`"${file.name}" uploaded to your Google Drive!`);
        }
    };
    input.click();
}

async function attachSoundToTask() {
    if (!googleUserEmail) {
        alert("No Google Drive Account to save sound.\n\nPlease go to Profile → Connect Google Drive first.");
        return;
    }

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'audio/*';
    input.onchange = async e => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 50 * 1024 * 1024) {
            alert("File exceeds 50 MB limit.");
            return;
        }

        const token = gapi.auth2.getAuthInstance().currentUser.get().getAuthResponse().access_token;
        const folderId = tasksFolderId || await ensureDoItAppFolders(token);
        const fileId = await uploadFileToDrive(token, file, folderId);

        if (fileId) {
            document.getElementById('hidden-sound-drive-id').value = fileId;
            document.getElementById('hidden-sound-drive-email').value = googleUserEmail;
            showSoundPreview(file, fileId);
            alert(`"${file.name}" uploaded to your Google Drive!`);
        }
    };
    input.click();
}

async function ensureDoItAppFolders(token) {
    const rootId = await findFolder(token, "Do-It App") || await createFolder(token, "Do-It App", "root");
    return await findFolder(token, "Tasks", rootId) || await createFolder(token, "Tasks", rootId);
}

async function findFolder(token, name, parent = 'root') {
    const q = `mimeType='application/vnd.google-apps.folder' and name='${name}' and '${parent}' in parents and trashed=false`;
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=files(id)`, {
        headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    return data.files?.[0]?.id || null;
}

async function createFolder(token, name, parent) {
    const res = await fetch('https://www.googleapis.com/drive/v3/files', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [parent] })
    });
    const file = await res.json();
    return file.id;
}

async function uploadFileToDrive(token, file, parentFolderId) {
    const metadata = { name: `DoItApp_Task_${Date.now()}_${file.name}`, parents: [parentFolderId] };
    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', file);

    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form
    });
    const result = await res.json();
    if (!result.id) { alert("Upload failed"); return null; }

    // Make publicly viewable
    await fetch(`https://www.googleapis.com/drive/v3/files/${result.id}/permissions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'reader', type: 'anyone' })
    });

    return result.id;
}

function showMediaPreview(file, fileId) {
    const container = document.getElementById('media-preview-container');
    container.innerHTML = '';
    container.style.display = 'block';
    const url = URL.createObjectURL(file);
    let preview;
    if (file.type.startsWith('image/')) {
        preview = document.createElement('img');
        preview.src = url;
        preview.style.maxWidth = '200px';
    } else if (file.type.startsWith('video/')) {
        preview = document.createElement('video');
        preview.src = url;
        preview.controls = true;
        preview.style.maxWidth = '200px';
    } else if (file.type.startsWith('audio/')) {
        preview = document.createElement('audio');
        preview.src = url;
        preview.controls = true;
    }
    container.appendChild(preview);
}

function showSoundPreview(file, fileId) {
    const container = document.getElementById('sound-preview-container');
    container.innerHTML = '';
    container.style.display = 'block';
    const url = URL.createObjectURL(file);
    const preview = document.createElement('audio');
    preview.src = url;
    preview.controls = true;
    container.appendChild(preview);
}

async function saveTask() {
    const title = document.getElementById('task-title').value.trim();
    if (!title) return alert("Title required!");

    const reminder = document.getElementById('reminder-datetime').value;
    const soundSelect = document.getElementById('reminder-sound').value;
    let soundURL = '';
    let soundFileID = '';
    let soundOwnerEmail = '';
    if (soundSelect && soundSelect !== 'user-defined') {
        soundURL = soundSelect;
    } else if (soundSelect === 'user-defined') {
        soundFileID = document.getElementById('hidden-sound-drive-id').value;
        soundOwnerEmail = document.getElementById('hidden-sound-drive-email').value;
    }

    const data = {
        user_id: localStorage.getItem('userId'),
        title,
        priority: document.getElementById('task-priority').value.trim(),
        reminder: reminder || null,
        notes: document.getElementById('task-notes').value.trim(),
        DriveFileID: document.getElementById('hidden-drive-id').value || null,
        DriveOwnerEmail: document.getElementById('hidden-drive-email').value || null,
        soundURL,
        soundFileID,
        soundOwnerEmail,
        status: 'Pending'
    };

    const url = editingTaskId ? `/api/tasks/${editingTaskId}` : '/api/tasks';
    const method = editingTaskId ? 'PUT' : 'POST';

    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (!res.ok) return alert("Failed to save");

    // Calendar check
    if (reminder) {
        const today = new Date().toISOString().split('T')[0];
        const reminderDate = reminder.split('T')[0];
        if (reminderDate !== today) {
            addToCalendar(`Reminder: ${title}`, data.notes, reminder, reminder);
        }
    }

    resetTaskForm();
    await fetchTasks();
    alert("Saved successfully!");
}

function resetTaskForm() {
    document.getElementById('task-title').value = '';
    document.getElementById('task-priority').value = '';
    document.getElementById('reminder-datetime').value = '';
    document.getElementById('task-notes').value = '';
    document.getElementById('hidden-drive-id').value = '';
    document.getElementById('hidden-drive-email').value = '';
    document.getElementById('hidden-sound-drive-id').value = '';
    document.getElementById('hidden-sound-drive-email').value = '';
    document.getElementById('reminder-sound').value = '';
    document.getElementById('attach-sound-btn').style.display = 'none';
    document.getElementById('media-preview-container').style.display = 'none';
    document.getElementById('sound-preview-container').style.display = 'none';
    editingTaskId = null;
    document.getElementById('add-new-task').style.display = 'none';
    document.getElementById('save-task').textContent = 'Add Task';
}

function cancelTask() {
    resetTaskForm();
}

function addToCalendar(title, description, startTime, endTime) {
    const dtstamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const dtstart = new Date(startTime).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const dtend = new Date(endTime).toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const uid = Date.now() + '@doitapp.com';

    const ics = `BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Do-It App//EN\nBEGIN:VEVENT\nUID:${uid}\nDTSTAMP:${dtstamp}\nDTSTART:${dtstart}\nDTEND:${dtend}\nSUMMARY:${title}\nDESCRIPTION:${description}\nEND:VEVENT\nEND:VCALENDAR`;

    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'reminder.ics';
    a.click();
    URL.revokeObjectURL(url);
}

async function loadDefaultSounds() {
    try {
        const response = await fetch('/api/sounds/defaults');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        defaultSounds = await response.json();
        const soundSelect = document.getElementById('reminder-sound');
        soundSelect.innerHTML = '<option value="">Select Sound</option>';
        defaultSounds.forEach(sound => {
            const option = document.createElement('option');
            option.value = sound.URL;
            option.textContent = sound.name;
            soundSelect.appendChild(option);
        });
        const userDefined = document.createElement('option');
        userDefined.value = 'user-defined';
        userDefined.textContent = 'User Defined';
        soundSelect.appendChild(userDefined);
    } catch (err) {
        console.error('Error loading default sounds:', err);
    }
}

function handleSoundChange(value) {
    const btn = document.getElementById('attach-sound-btn');
    const hiddenId = document.getElementById('hidden-sound-drive-id');
    const hiddenEmail = document.getElementById('hidden-sound-drive-email');
    const preview = document.getElementById('sound-preview-container');
    if (value === 'user-defined') {
        btn.style.display = 'block';
    } else {
        btn.style.display = 'none';
        hiddenId.value = '';
        hiddenEmail.value = '';
        preview.style.display = 'none';
    }
}

async function fetchTasks() {
    try {
        const userId = localStorage.getItem('userId');
        const response = await fetch(`/api/tasks/${userId}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        tasks = await response.json();
        originalTasks = [...tasks];
        showTasks();
        scheduleReminders();
    } catch (err) {
        console.error('Error fetching tasks:', err);
    }
}

function showTasks() {
    const tbody = document.getElementById('task-table-body');
    tbody.innerHTML = '';
    tasks.forEach((task, index) => {
        const truncatedNotes = truncateText(task.notes || '-', 250);
        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${index + 1}</td>
            <td><input type="checkbox" class="task-selector" data-id="${task.id}"></td>
            <td>${task.title}</td>
            <td>${task.reminder || '-'}</td>
            <td class="content-truncated" onmouseover="showFullContent(event, '${escapeHtml(task.notes || '-')}')" onmouseout="hideFullContent()">${truncatedNotes}</td>
            <td>${getMediaContent(task)}</td>
            <td>${task.reminder ? 'Set' : '-'}</td>
            <td>${task.status}</td>
            <td><input type="checkbox" class="mark-selector" data-id="${task.id}" ${task.status === 'Completed' ? 'checked' : ''}></td>
            <td>${task.created_date}</td>
        `;
        row.addEventListener('contextmenu', showContextMenu);
        tbody.appendChild(row);
    });

    document.querySelectorAll('.mark-selector').forEach(checkbox => {
        checkbox.addEventListener('change', async (e) => {
            const taskId = e.target.dataset.id;
            const newStatus = e.target.checked ? 'Completed' : 'Pending';
            await updateTaskStatus(taskId, newStatus);
        });
    });
}

function truncateText(text, maxLength) {
    if (text.length <= maxLength) return text;
    return text.slice(0, maxLength) + '...';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

let fullContentDiv = null;
function showFullContent(event, fullText) {
    fullContentDiv = document.createElement('div');
    fullContentDiv.className = 'content-full';
    fullContentDiv.textContent = fullText;
    fullContentDiv.style.left = `${event.pageX + 10}px`;
    fullContentDiv.style.top = `${event.pageY + 10}px`;
    document.body.appendChild(fullContentDiv);
    fullContentDiv.style.display = 'block';
}

function hideFullContent() {
    if (fullContentDiv) {
        fullContentDiv.remove();
        fullContentDiv = null;
    }
}

function getMediaContent(daily) {
    if (!daily.DriveFileID) return '-';
    const url = `https://drive.google.com/uc?id=${daily.DriveFileID}&export=view`;
    const badge = `<span class="drive-badge" title="Google Drive">G</span>`;
    return `${badge}<img src="${url}" class="media-preview" onclick="previewMedia('${url}','image')" style="cursor:pointer;">`;
}

function determineFileType(task) {
    // Logic based on file name or API data; for example:
    const text = (task.title + ' ' + (task.notes || '')).toLowerCase();
    if (/\.(jpe?g|png|gif|webp|bmp)$/i.test(text)) return 'image';
    if (/\.(mp4|webm|ogg|mov|avi)$/i.test(text)) return 'video';
    if (/\.(mp3|wav|ogg|m4a|flac)$/i.test(text)) return 'audio';
    return 'file';
}

function previewMedia(url, type = 'image') {
    const container = document.getElementById('media-container');
    container.innerHTML = `<img src="${url}" class="modal-media">`;
    document.getElementById('media-modal').style.display = 'block';
}

function closeMediaModal() {
    document.getElementById('media-modal').style.display = 'none';
}

function scheduleReminders() {
    tasks.forEach(task => {
        if (task.reminder && (task.soundURL || task.soundFileID) && task.status !== 'Completed') {
            const today = new Date().toISOString().split('T')[0];
            const reminderDate = task.reminder.split('T')[0];
            if (reminderDate === today) {
                const reminderTime = new Date(task.reminder).getTime();
                const now = new Date().getTime();
                const timeUntilReminder = reminderTime - now;
                if (timeUntilReminder > 0) {
                    setTimeout(() => {
                        const soundUrl = task.soundURL || `https://drive.google.com/uc?id=${task.soundFileID}&export=download`;
                        reminderAudio = new Audio(soundUrl);
                        reminderAudio.loop = true;
                        reminderAudio.play().then(() => {
                            showReminderModal(task);
                        }).catch(err => {
                            console.error('Error playing sound:', err);
                            showReminderModal(task);
                        });
                    }, timeUntilReminder);
                }
            }
        }
    });
}

function showReminderModal(task) {
    document.getElementById('reminder-title').textContent = `Reminder: ${task.title}`;
    document.getElementById('reminder-notes').textContent = task.notes || '';
    document.getElementById('reminder-modal').dataset.taskId = task.id;
    document.getElementById('reminder-modal').style.display = 'block';
}

function closeReminderModal() {
    document.getElementById('reminder-modal').style.display = 'none';
    if (reminderAudio) {
        reminderAudio.pause();
        reminderAudio = null;
    }
}

async function markAsDoneFromModal() {
    const taskId = document.getElementById('reminder-modal').dataset.taskId;
    await updateTaskStatus(taskId, 'Completed');
    closeReminderModal();
}

async function updateTaskStatus(taskId, status) {
    try {
        const response = await fetch(`/api/tasks/${taskId}/status`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status })
        });
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        await fetchTasks();
    } catch (err) {
        console.error('Error updating status:', err);
        alert('Error updating status.');
    }
}

function sortTable(column) {
    if (currentSort.column === column) {
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.column = column;
        currentSort.direction = 'asc';
    }

    // Clear previous indicators
    const headers = document.querySelectorAll('th[data-column]');
    headers.forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
    });

    // Add indicator to clicked header
    const activeHeader = document.querySelector(`th[data-column="${column}"]`);
    if (activeHeader) {
        activeHeader.classList.add(`sort-${currentSort.direction}`);
    }

    tasks.sort((a, b) => {
        let aValue = getSortValue(a, column);
        let bValue = getSortValue(b, column);

        // Handle null/undefined/'-'
        if (aValue === null || aValue === undefined || aValue === '-') aValue = (currentSort.direction === 'asc') ? Infinity : -Infinity;
        if (bValue === null || bValue === undefined || bValue === '-') bValue = (currentSort.direction === 'asc') ? Infinity : -Infinity;

        if (typeof aValue === 'string' && typeof bValue === 'string') {
            return currentSort.direction === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
        } else if (typeof aValue === 'number' && typeof bValue === 'number') {
            return currentSort.direction === 'asc' ? aValue - bValue : bValue - aValue;
        } else if (aValue instanceof Date && bValue instanceof Date) {
            return currentSort.direction === 'asc' ? aValue - bValue : bValue - aValue;
        }
        return 0;
    });

    showTasks();
}

function getSortValue(task, column) {
    switch (column) {
        case 'series': return tasks.indexOf(task);
        case 'name': return task.title || '';
        case 'reminder': return task.reminder ? new Date(task.reminder) : null;
        case 'notes': return (task.notes || '').length;
        case 'reminderSet': return task.reminder ? 1 : 0;
        case 'status': return task.status === 'Completed' ? 1 : 0;
        case 'mark': return task.status === 'Completed' ? 1 : 0;
        case 'time': return task.created_date ? new Date(task.created_date) : null;
        default: return null;
    }
}

function searchTasks() {
    const searchTerm = document.getElementById('search-box').value.toLowerCase().trim();
    if (!searchTerm) {
        tasks = [...originalTasks];
        showTasks();
        return;
    }
    tasks = originalTasks.filter(task => {
        return Object.keys(task).some(key => {
            const val = task[key];
            return val !== null && val !== undefined && String(val).toLowerCase().includes(searchTerm);
        });
    });
    showTasks();
}

function selectAll() {
    const checkboxes = document.querySelectorAll('.task-selector');
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    checkboxes.forEach(cb => cb.checked = !allChecked);
}

function selectUpper10() {
    const checkboxes = document.querySelectorAll('.task-selector');
    const checkedIndex = Array.from(checkboxes).findIndex(cb => cb.checked);
    if (checkedIndex !== -1) {
        const start = Math.max(0, checkedIndex - 10);
        const end = checkedIndex;
        const rangeCheckboxes = Array.from(checkboxes).slice(start, end + 1);
        const allChecked = rangeCheckboxes.every(cb => cb.checked);
        rangeCheckboxes.forEach(cb => cb.checked = !allChecked);
    }
}

function selectLower10() {
    const checkboxes = document.querySelectorAll('.task-selector');
    const checkedIndex = Array.from(checkboxes).findIndex(cb => cb.checked);
    if (checkedIndex !== -1) {
        const start = checkedIndex;
        const end = Math.min(checkboxes.length - 1, checkedIndex + 10);
        const rangeCheckboxes = Array.from(checkboxes).slice(start, end + 1);
        const allChecked = rangeCheckboxes.every(cb => cb.checked);
        rangeCheckboxes.forEach(cb => cb.checked = !allChecked);
    }
}

function editTask() {
    const selected = document.querySelector('.task-selector:checked');
    if (!selected) {
        alert('Please select a task to edit.');
        return;
    }
    const taskId = parseInt(selected.dataset.id);
    editSelectedTask(taskId);
}

function editSelectedTask(id = null) {
    const taskId = id || getSelectedTaskId();
    if (!taskId) return;
    const task = tasks.find(t => t.id === taskId);
    document.getElementById('task-title').value = task.title;
    document.getElementById('task-priority').value = task.priority || '';
    document.getElementById('reminder-datetime').value = task.reminder || '';
    document.getElementById('task-notes').value = task.notes || '';
    const soundSelect = document.getElementById('reminder-sound');
    if (task.soundURL) {
        soundSelect.value = task.soundURL;
    } else if (task.soundFileID) {
        soundSelect.value = 'user-defined';
        document.getElementById('hidden-sound-drive-id').value = task.soundFileID;
        document.getElementById('hidden-sound-drive-email').value = task.soundOwnerEmail;
        document.getElementById('attach-sound-btn').style.display = 'block';
        // Preview if possible, but since saved, use drive url
        const soundUrl = `https://drive.google.com/uc?id=${task.soundFileID}&export=download`;
        showSoundPreview({type: 'audio/mpeg'}, task.soundFileID);  // Dummy file
    }
    document.getElementById('hidden-drive-id').value = task.DriveFileID || '';
    document.getElementById('hidden-drive-email').value = task.DriveOwnerEmail || '';
    if (task.DriveFileID) {
        // Show preview from drive
        const mediaUrl = `https://drive.google.com/uc?id=${task.DriveFileID}&export=view`;
        showMediaPreview({type: determineFileType(task)}, task.DriveFileID);
    }
    editingTaskId = taskId;
    document.getElementById('add-new-task').style.display = 'block';
    document.getElementById('save-task').textContent = 'Save Task';
}

async function deleteTasks() {
    const selected = document.querySelectorAll('.task-selector:checked');
    if (selected.length === 0) {
        alert('Please select tasks to delete.');
        return;
    }
    if (confirm(`Are you sure you want to delete ${selected.length} task(s)?`)) {
        try {
            const ids = Array.from(selected).map(cb => parseInt(cb.dataset.id));
            for (const id of ids) {
                await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
            }
            await fetchTasks();
        } catch (err) {
            console.error('Error deleting tasks:', err);
            alert('Error deleting tasks.');
        }
    }
}

function deleteSelectedTask() {
    const taskId = getSelectedTaskId();
    if (!taskId) return;
    if (confirm('Are you sure you want to delete this task?')) {
        fetch(`/api/tasks/${taskId}`, { method: 'DELETE' }).then(() => fetchTasks()).catch(err => alert('Error deleting task.'));
    }
    hideContextMenu();
}

function viewSelectedTask() {
    const taskId = getSelectedTaskId();
    if (!taskId) return;
    const task = tasks.find(t => t.id === taskId);
    document.getElementById('view-task-name').value = task.title;
    document.getElementById('view-task-priority').value = task.priority || '-';
    document.getElementById('view-task-reminder').value = task.reminder || '-';
    document.getElementById('view-task-notes').value = task.notes || '-';
    document.getElementById('view-task-status').value = task.status;
    document.getElementById('view-task-time').value = task.created_date;
    const mediaContainer = document.getElementById('view-task-media');
    mediaContainer.innerHTML = '';
    if (task.DriveFileID) {
        const url = `https://drive.google.com/uc?id=${task.DriveFileID}&export=view`;
        const item = document.createElement('div');
        item.className = 'view-media-item';
        let element;
        const type = determineFileType(task);
        if (type === 'image') {
            element = `<img src="${url}">`;
        } else if (type === 'video') {
            element = `<video src="${url}" controls></video>`;
        } else if (type === 'audio') {
            element = `<audio src="${url}" controls></audio>`;
        }
        item.innerHTML = element;
        mediaContainer.appendChild(item);
    }
    document.getElementById('view-task-modal').style.display = 'block';
    hideContextMenu();
}

function closeViewTaskModal() {
    document.getElementById('view-task-modal').style.display = 'none';
}

function previewSelectedMedia() {
    const taskId = getSelectedTaskId();
    if (!taskId) return;
    const task = tasks.find(t => t.id === taskId);
    if (!task.DriveFileID) {
        alert('No media attached.');
        return;
    }
    const url = `https://drive.google.com/uc?id=${task.DriveFileID}&export=view`;
    const type = determineFileType(task);
    previewMedia(url, type);
    hideContextMenu();
}

function getSelectedTaskId() {
    if (lastRightClickedRow) {
        return parseInt(lastRightClickedRow.querySelector('.task-selector').dataset.id);
    }
    const selected = document.querySelector('.task-selector:checked');
    return selected ? parseInt(selected.dataset.id) : null;
}

function showContextMenu(e) {
    e.preventDefault();
    lastRightClickedRow = this;
    const contextMenu = document.getElementById('context-menu');
    contextMenu.style.left = `${e.pageX}px`;
    contextMenu.style.top = `${e.pageY}px`;
    contextMenu.style.display = 'block';
    this.classList.add('context-menu-active');
}

function hideContextMenu() {
    const contextMenu = document.getElementById('context-menu');
    contextMenu.style.display = 'none';
    if (lastRightClickedRow) {
        lastRightClickedRow.classList.remove('context-menu-active');
        lastRightClickedRow = null;
    }
}

// Close context menu when clicking elsewhere
document.addEventListener('click', (e) => {
    const contextMenu = document.getElementById('context-menu');
    if (contextMenu.style.display === 'block' && !contextMenu.contains(e.target)) {
        hideContextMenu();
    }
});

// Close modals with Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeMediaModal();
        closeViewTaskModal();
        closeReminderModal();
        hideContextMenu();
    }
});

document.addEventListener('DOMContentLoaded', async () => {
    if (!localStorage.getItem('userId')) {
        window.location.href = '../Login.WPCS22.html';
        return;
    }

    const reminderInput = document.getElementById('reminder-datetime');
    const soundSelect = document.getElementById('reminder-sound');
    const soundBtn = document.getElementById('attach-sound-btn');
    soundSelect.style.display = 'none';
    soundBtn.style.display = 'none';

    reminderInput.addEventListener('change', (e) => {
        soundSelect.style.display = e.target.value ? 'block' : 'none';
        if (!e.target.value) {
            soundBtn.style.display = 'none';
        }
    });

    soundSelect.addEventListener('change', (e) => handleSoundChange(e.target.value));

    await loadDefaultSounds();
    await fetchTasks();
});

function logout() {
    localStorage.removeItem('userId');
    localStorage.removeItem('username');
    localStorage.removeItem('bypassProfilePassword');
    localStorage.removeItem('forcePasswordChange');
    window.location.href = '../Login.WPCS22.html';
}
