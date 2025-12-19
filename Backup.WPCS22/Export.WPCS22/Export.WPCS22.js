async function populateExportLists() {
    try {
        const userId = localStorage.getItem('userId');
        const tasksResponse = await fetch(`/api/tasks/${userId}`);
        if (!tasksResponse.ok) throw new Error(`HTTP error! status: ${tasksResponse.status}`);
        const tasks = await tasksResponse.json();
        const dailiesResponse = await fetch(`/api/dailies/${userId}`);
        if (!dailiesResponse.ok) throw new Error(`HTTP error! status: ${dailiesResponse.status}`);
        const dailies = await dailiesResponse.json();

        const tasksList = document.getElementById('tasks-export-list');
        const dailiesList = document.getElementById('dailies-export-list');
        if (tasksList) {
            tasksList.innerHTML = tasks.map(task => `
                <label><input type="checkbox" class="task-export" data-id="${task.id}"> ${task.title}</label>
            `).join('');
        }
        if (dailiesList) {
            dailiesList.innerHTML = dailies.map(daily => `
                <label><input type="checkbox" class="daily-export" data-id="${daily.id}"> ${daily.title}</label>
            `).join('');
        }
    } catch (err) {
        console.error('Error populating export lists:', err);
    }
}

function exportToPDF() {
    const { jsPDF } = window.jspdf;
    if (!jsPDF) {
        alert('jsPDF library not loaded. Please include the jsPDF CDN.');
        return;
    }

    const doc = new jsPDF();
    const userId = localStorage.getItem('userId');
    const selectedTasks = Array.from(document.querySelectorAll('.task-export:checked')).map(cb => parseInt(cb.dataset.id));
    const selectedDailies = Array.from(document.querySelectorAll('.daily-export:checked')).map(cb => parseInt(cb.dataset.id));

    if (selectedTasks.length === 0 && selectedDailies.length === 0) {
        alert('Please select at least one task or daily to export.');
        return;
    }

    fetch(`/api/users/${userId}`)
        .then(res => {
            if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);
            return res.json();
        })
        .then(async user => {
            let y = 10;
            doc.setFontSize(18);
            doc.text('Do It App Data Export', 10, y);
            y += 10;
            doc.setFontSize(14);
            doc.text(`Username: ${user.username || 'Guest'}`, 10, y);
            y += 10;
            doc.text(`Email: ${user.email || 'N/A'}`, 10, y);
            y += 20;

            if (selectedTasks.length > 0) {
                const tasksResponse = await fetch(`/api/tasks/${userId}`);
                if (!tasksResponse.ok) throw new Error(`HTTP error! status: ${tasksResponse.status}`);
                const tasks = await tasksResponse.json();
                doc.text('Tasks:', 10, y);
                y += 10;
                doc.autoTable({
                    startY: y,
                    head: [['Series', 'Title', 'Priority', 'Reminder', 'Notes', 'Status', 'Created Date']],
                    body: tasks.filter(t => selectedTasks.includes(t.id)).map((t, i) => [
                        i + 1,
                        t.title,
                        t.priority || '-',
                        t.reminder || '-',
                        t.notes || '-',
                        t.status || 'Pending',
                        t.created_date || '-'
                    ]),
                    theme: 'grid',
                    styles: { fontSize: 10, cellPadding: 2 },
                    columnStyles: { 4: { cellWidth: 50 } } // Wider notes column
                });
                y = doc.lastAutoTable.finalY + 10;
            }

            if (selectedDailies.length > 0) {
                const dailiesResponse = await fetch(`/api/dailies/${userId}`);
                if (!dailiesResponse.ok) throw new Error(`HTTP error! status: ${dailiesResponse.status}`);
                const dailies = await dailiesResponse.json();
                doc.text('Dailies:', 10, y);
                y += 10;
                doc.autoTable({
                    startY: y,
                    head: [['Series', 'Title', 'Time', 'Note', 'Reminder']],
                    body: dailies.filter(d => selectedDailies.includes(d.id)).map((d, i) => [
                        i + 1,
                        d.title,
                        d.time || '-',
                        d.note || '-',
                        d.reminder ? 'Set' : '-'
                    ]),
                    theme: 'grid',
                    styles: { fontSize: 10, cellPadding: 2 },
                    columnStyles: { 3: { cellWidth: 50 } } // Wider note column
                });
            }

            doc.save('DoItApp_Export.pdf');
        })
        .catch(err => {
            console.error('Error exporting to PDF:', err);
            alert('Error generating PDF.');
        });
}

document.addEventListener('DOMContentLoaded', () => {
    if (!localStorage.getItem('userId')) {
        window.location.href = '../Login.WPCS22.html';
        return;
    }
    populateExportLists();
});

function logout() {
    localStorage.removeItem('userId');
    localStorage.removeItem('username');
    window.location.href = '../Login.WPCS22.html';
}