let dailies = [];
let editingDailyId = null;
let currentSort = { column: null, direction: 'asc' };
let originalDailies = [];
let selectedDailyId = null;
let lastRightClickedRow = null;
let googleUserEmail = null;
let dailiesFolderId = null;

// === Load Google API ===
const script = document.createElement('script');
script.src = 'https://apis.google.com/js/api.js';
script.onload = () => gapi.load('client:auth2', initGoogleClient);
document.head.appendChild(script);

async function initGoogleClient() {
    await gapi.client.init({
        apiKey: 'AIzaSyBHAAaBqIXvTQh0MDkTGJnLV4bVXiZWQAE',                                 
        clientId: '232380579632-12ocsk6043kmbn3qeciau8ie91he0qkf.apps.googleusercontent.com',
        discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
        scope: 'https://www.googleapis.com/auth/drive.file'
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
            dailiesFolderId = data.dailiesFolderId;
        }
    }
}

async function attachMediaToDaily() {
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

        const token = gapi.auth2.getAuthInstance().currentUser.get().getAuthResponse().access_token;
        const folderId = dailiesFolderId || await ensureDoItAppFolders(token);
        const fileId = await uploadFileToDrive(token, file, folderId);

        if (fileId) {
            document.getElementById('hidden-drive-id').value = fileId;
            document.getElementById('hidden-drive-email').value = googleUserEmail;
            alert(`"${file.name}" uploaded to your Google Drive!`);
        }
    };
    input.click();
}

async function ensureDoItAppFolders(token) {
    const rootId = await findFolder(token, "Do-It App") || await createFolder(token, "Do-It App", "root");
    return await findFolder(token, "Dailies", rootId) || await createFolder(token, "Dailies", rootId);
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
    const metadata = { name: `DoItApp_Daily_${Date.now()}_${file.name}`, parents: [parentFolderId] };
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

    await fetch(`https://www.googleapis.com/drive/v3/files/${result.id}/permissions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'reader', type: 'anyone' })
    });

    return result.id;
}

async function saveDaily() {
    const title = document.getElementById('daily-title').value.trim();
    if (!title) return alert("Title required!");

    const data = {
        user_id: localStorage.getItem('userId'),
        title,
        note: document.getElementById('daily-note').value.trim(),
        time: document.getElementById('daily-time').value || null,
        reminder: document.getElementById('daily-reminder').value || null,
        DriveFileID: document.getElementById('hidden-drive-id').value || null,
        DriveOwnerEmail: document.getElementById('hidden-drive-email').value || null
    };

    const url = editingDailyId ? `/api/dailies/${editingDailyId}` : '/api/dailies';
    const method = editingDailyId ? 'PUT' : 'POST';

    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (!res.ok) return alert("Failed to save");

    resetDailyForm();
    await fetchDailies();
    alert("Saved successfully!");
}

function resetDailyForm() {
    document.getElementById('daily-title').value = '';
    document.getElementById('daily-note').value = '';
    document.getElementById('daily-time').value = '';
    document.getElementById('daily-reminder').value = '';
    document.getElementById('hidden-drive-id').value = '';
    document.getElementById('hidden-drive-email').value = '';
    editingDailyId = null;
    const addNewBtn = document.getElementById('add-new-daily');
    if (addNewBtn) addNewBtn.style.display = 'none';
    document.getElementById('save-note').textContent = 'Save Note';
}

function cancelDaily() {
    if (confirm('Are you sure you want to cancel? All unsaved changes will be lost.')) {
        resetDailyForm();
    }
}

async function fetchDailies() {
    try {
        const userId = localStorage.getItem('userId');
        const response = await fetch(`/api/dailies/${userId}`);
        if (!response.ok) throw new Error('Fetch failed');
        dailies = await response.json();
        originalDailies = [...dailies];
        showDailies();
    } catch (err) {
        console.error(err);
    }
}

function showDailies() {
    const tbody = document.getElementById('daily-table-body');
    tbody.innerHTML = '';
    dailies.forEach((daily, index) => {
        const truncated = (daily.note || '').substring(0, 100) + ((daily.note || '').length > 100 ? '...' : '');
        const row = document.createElement('tr');
        row.setAttribute("data-id", daily.id);
        row.innerHTML = `
            <td>${index + 1}</td>
            <td><input type="checkbox" class="daily-selector" data-id="${daily.id}"></td>
            <td>${daily.title}</td>
            <td>${daily.time || '-'}</td>
            <td class="content-truncated" title="${escapeHtml(daily.note || '')}">${truncated || '-'}</td>
            <td>${getMediaContent(daily)}</td>
            <td>${daily.reminder || '-'}</td>
        `;
        row.addEventListener('contextmenu', (e) => showContextMenu(e, daily.id));
        tbody.appendChild(row);
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function getMediaContent(daily) {
    if (!daily.DriveFileID) return '-';

    const url = `https://drive.google.com/uc?id=${daily.DriveFileID}&export=view`;
    const owner = daily.DriveOwnerEmail || 'Drive';
    const badge = `<span class="drive-badge" title="Google Drive: ${owner}">G</span>`;

    const text = (daily.title + ' ' + (daily.note || '')).toLowerCase();
    if (/\.(jpe?g|png|gif|webp|bmp)$/i.test(text)) {
        return `${badge}<img src="${url}" class="media-preview" onerror="this.style.display='none';this.nextElementSibling.style.display='block'" onclick="previewMedia('${url}','image')"><span style="display:none;color:#ff4444;font-size:12px">Missing</span>`;
    }
    if (/\.(mp4|webm|ogg|mov|avi)$/i.test(text)) {
        return `${badge}<div class="media-icon" onclick="previewMedia('${url}','video')">Play Video</div>`;
    }
    if (/\.(mp3|wav|ogg|m4a|flac)$/i.test(text)) {
        return `${badge}<div class="media-icon" onclick="previewMedia('${url}','audio')">Play Audio</div>`;
    }
    return `${badge}<span>File</span>`;
}

function previewMedia(url, type = 'image') {
    const container = document.getElementById('media-container');
    container.innerHTML = '';
    let element;
    if (type === 'image') {
        element = document.createElement('img');
        element.src = url;
        element.className = 'modal-media';
    } else if (type === 'video') {
        element = document.createElement('video');
        element.src = url;
        element.controls = true;
        element.className = 'modal-media';
    } else if (type === 'audio') {
        element = document.createElement('audio');
        element.src = url;
        element.controls = true;
        element.style.width = '100%';
    }
    if (element) container.appendChild(element);
    document.getElementById('media-modal').style.display = 'block';
}

function closeMediaModal() {
    document.getElementById('media-modal').style.display = 'none';
    document.getElementById('media-container').innerHTML = '';
}

function closeViewDailyModal() {
    document.getElementById('view-daily-modal').style.display = 'none';
}

function sortTable(column) {
    if (currentSort.column === column) {
        currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.column = column;
        currentSort.direction = 'asc';
    }

    // Clear previous sort indicators
    document.querySelectorAll('th').forEach(th => {
        th.classList.remove('sort-asc', 'sort-desc');
    });

    // Add indicator to the correct header using data-column (if you add it) or fallback
    const header = document.querySelector(`th[onclick*="sortTable('${column}')"]`);
    if (header) {
        header.classList.add(`sort-${currentSort.direction}`);
    }

    dailies.sort((a, b) => {
        let aVal = a[column] || '';
        let bVal = b[column] || '';

        if (column === 'note') {
            aVal = (a.note || '').length;
            bVal = (b.note || '').length;
        }

        if (column === 'time' || column === 'reminder') {
            aVal = aVal ? new Date(aVal) : new Date(0);
            bVal = bVal ? new Date(bVal) : new Date(0);
        }

        if (column === 'series') {
            aVal = dailies.indexOf(a);
            bVal = dailies.indexOf(b);
        }

        const order = currentSort.direction === 'asc' ? 1 : -1;
        return (aVal > bVal ? 1 : -1) * order;
    });

    showDailies();
}

function searchDailies() {
    const searchTerm = document.getElementById('search-box').value.toLowerCase().trim();
    
    if (!searchTerm) {
        dailies = [...originalDailies];
        showDailies();
        return;
    }
    
    dailies = originalDailies.filter(daily => {
        return (
            (daily.title && daily.title.toLowerCase().includes(searchTerm)) ||
            (daily.note && daily.note.toLowerCase().includes(searchTerm)) ||
            (daily.time && String(daily.time).toLowerCase().includes(searchTerm)) ||
            (daily.reminder && String(daily.reminder).toLowerCase().includes(searchTerm))
        );
    });
    
    showDailies();
}

function selectAll() {
    const checkboxes = document.querySelectorAll('.daily-selector');
    const allChecked = Array.from(checkboxes).every(cb => cb.checked);
    checkboxes.forEach(cb => cb.checked = !allChecked);
}

function selectUpper10() {
    const checkboxes = Array.from(document.querySelectorAll('.daily-selector'));
    const checkedIndex = checkboxes.findIndex(cb => cb.checked);
    if (checkedIndex === -1) return;
    const start = Math.max(0, checkedIndex - 10);
    const range = checkboxes.slice(start, checkedIndex + 1);
    const allChecked = range.every(cb => cb.checked);
    range.forEach(cb => cb.checked = !allChecked);
}

function selectLower10() {
    const checkboxes = Array.from(document.querySelectorAll('.daily-selector'));
    const checkedIndex = checkboxes.findIndex(cb => cb.checked);
    if (checkedIndex === -1) return;
    const end = Math.min(checkboxes.length, checkedIndex + 11);
    const range = checkboxes.slice(checkedIndex, end);
    const allChecked = range.every(cb => cb.checked);
    range.forEach(cb => cb.checked = !allChecked);
}

function editDaily() {
    const selected = document.querySelector('.daily-selector:checked');
    if (!selected) {
        alert('Please select a daily to edit.');
        return;
    }
    const dailyId = parseInt(selected.dataset.id);
    const daily = dailies.find(d => d.id === dailyId);
    document.getElementById('daily-title').value = daily.title;
    document.getElementById('daily-note').value = daily.note || '';
    document.getElementById('daily-time').value = daily.time || '';
    document.getElementById('daily-reminder').value = daily.reminder || '';
    editingDailyId = dailyId;
    document.getElementById('add-new-daily').style.display = 'block';
}

async function deleteDailies() {
    const selected = document.querySelectorAll('.daily-selector:checked');
    if (selected.length === 0) {
        alert('Please select dailies to delete.');
        return;
    }
    if (confirm(`Are you sure you want to delete ${selected.length} daily(ies)?`)) {
        try {
            const ids = Array.from(selected).map(cb => parseInt(cb.dataset.id));
            for (const id of ids) {
                await fetch(`/api/dailies/${id}`, { method: 'DELETE' });
            }
            await fetchDailies();
        } catch (err) {
            console.error('Error deleting dailies:', err);
            alert('Error deleting dailies.');
        }
    }
}

function showContextMenu(e, dailyId) {
    e.preventDefault();
    selectedDailyId = dailyId;
    if (lastRightClickedRow) lastRightClickedRow.classList.remove('context-menu-active');
    const row = e.target.closest('tr');
    if (row) {
        row.classList.add('context-menu-active');
        lastRightClickedRow = row;
    }
    const menu = document.getElementById('context-menu');
    menu.style.left = `${e.pageX}px`;
    menu.style.top = `${e.pageY}px`;
    menu.style.display = 'block';
}

function hideContextMenu() {
    const menu = document.getElementById('context-menu');
    menu.style.display = 'none';
    if (lastRightClickedRow) {
        lastRightClickedRow.classList.remove('context-menu-active');
        lastRightClickedRow = null;
    }
}

function viewSelectedDaily() {
    if (!selectedDailyId) return;
    const daily = dailies.find(d => d.id === selectedDailyId);
    if (!daily) return;
    document.getElementById('view-daily-name').value = daily.title;
    document.getElementById('view-daily-time').value = daily.time || 'Not set';
    document.getElementById('view-daily-text').value = daily.note || 'No content';
    document.getElementById('view-daily-reminder').value = daily.reminder ? new Date(daily.reminder).toLocaleString() : 'Not set';
    const container = document.getElementById('view-daily-media');
    container.innerHTML = daily.DriveFileID ? `<img src="https://drive.google.com/uc?id=${daily.DriveFileID}&export=view" style="max-width:100%">` : '<em>No media attached</em>';
    document.getElementById('view-daily-modal').style.display = 'block';
    hideContextMenu();
}

function previewSelectedMedia() {
    if (!selectedDailyId) return;
    const daily = dailies.find(d => d.id === selectedDailyId);
    if (!daily || !daily.DriveFileID) {
        alert('No media attached');
        return;
    }
    const url = `https://drive.google.com/uc?id=${daily.DriveFileID}&export=view`;
    previewMedia(url);
    hideContextMenu();
}

function editSelectedDaily() {
    if (!selectedDailyId) return;
    const checkbox = document.querySelector(`.daily-selector[data-id="${selectedDailyId}"]`);
    if (checkbox) checkbox.checked = true;
    editDaily();
    hideContextMenu();
}

function deleteSelectedDaily() {
    if (!selectedDailyId) return;
    if (confirm('Are you sure you want to delete this daily?')) {
        fetch(`/api/dailies/${selectedDailyId}`, { method: 'DELETE' })
            .then(() => fetchDailies())
            .catch(() => alert('Error deleting daily.'));
    }
    hideContextMenu();
}

// Event Listeners
document.addEventListener('click', (e) => {
    const contextMenu = document.getElementById('context-menu');
    if (contextMenu && contextMenu.style.display === 'block' && !contextMenu.contains(e.target)) {
        hideContextMenu();
    }
});

window.onclick = function(event) {
    const mediaModal = document.getElementById('media-modal');
    const viewModal = document.getElementById('view-daily-modal');
    if (event.target === mediaModal) closeMediaModal();
    if (event.target === viewModal) closeViewDailyModal();
};

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeMediaModal();
        closeViewDailyModal();
        hideContextMenu();
    }
});

document.addEventListener('DOMContentLoaded', async () => {
    if (!localStorage.getItem('userId')) {
        window.location.href = '../Login.WPCS22.html';
        return;
    }
    await fetchDailies();
});

function logout() {
    localStorage.removeItem('userId');
    localStorage.removeItem('username');
    localStorage.removeItem('bypassProfilePassword');
    localStorage.removeItem('forcePasswordChange');
    window.location.href = '../Login.WPCS22.html';
}