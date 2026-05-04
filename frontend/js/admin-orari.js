// slots ammessi, ogni 45 min tra 08:00 e 23:15
const ALL_SLOTS = [
    "08:00", "08:30", "09:15", "10:00", "10:45", "11:30", "12:15", "12:30", "13:00", "13:15", "14:00", "14:45", "15:30", "16:15", "17:00", "17:45", "18:00",
    "18:30", "18:45", "19:15", "19:30", "20:00", "20:15", "20:45", "21:00",
    "21:30", "21:45", "22:15", "22:30", "23:00", "23:15"
];

// Nomi dei giorni
const DAYS_INFO = {
    1: 'Lunedì',
    2: 'Martedì',
    3: 'Mercoledì',
    4: 'Giovedì',
    5: 'Venerdì',
    6: 'Sabato'
};

let currentSettings = null;

document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Check if user is admin
        const sessionRes = await apiRequest('/auth/me');
        if (!sessionRes || !sessionRes.success || !sessionRes.user.isAdmin) {
            window.location.href = '/login';
            return;
        }
        
        // Load config
        const res = await apiRequest('/admin/settings/hours');
        if (res && res.success) {
            currentSettings = res.businessHours;
            renderCards();
        } else {
            alert('Errore nel caricamento degli orari');
        }
    } catch(err) {
        console.error(err);
        // If unauthenticated or error, redirect or alert
        if(err.message.includes('Token non fornito') || err.message.includes('non valido')) {
            window.location.href = '/login';
        } else {
            alert('Errore di connessione o autenticazione.');
        }
    }

    const saveBtn = document.getElementById('save-orari-btn');
    if(saveBtn) saveBtn.addEventListener('click', saveSettings);

    const logoutBtn = document.getElementById('sidebar-logout');
    if(logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            try {
                await apiRequest('/auth/logout', { method: 'POST' });
                window.location.href = '/';
            } catch(e) {
                console.error(e);
            }
        });
    }
});

function calculateSlots(start, end) {
    if (!start || !end) return [];
    const startIndex = ALL_SLOTS.indexOf(start);
    let endIndex = ALL_SLOTS.indexOf(end);
    if (startIndex === -1 || endIndex === -1 || startIndex >= endIndex) return [];
    
    // Raccoglie tutti gli slot (di solito di 45 in 45, approssimati da ALL_SLOTS per come è sempre stato in Lev Space)
    // Non includiamo fine come slot giocabile per prenotare, ma l'inizio dello step sì
    let slots = [];
    for(let i = startIndex; i < endIndex; i++) {
        slots.push(ALL_SLOTS[i]);
    }
    return slots;
}

function getOptionsHTML(selectedValue, type) {
    let allowedSlots = [...ALL_SLOTS];
    
    if (type === 'm-start') {
        allowedSlots = allowedSlots.filter(slot => slot >= '08:30' && slot <= '12:30');
    } else if (type === 'm-end') {
        allowedSlots = allowedSlots.filter(slot => slot >= '09:15' && slot <= '13:15');
    } else if (type === 'a-start') {
        allowedSlots = allowedSlots.filter(slot => slot >= '14:00');
    } else if (type === 'a-end') {
        allowedSlots = allowedSlots.filter(slot => slot >= '14:45');
    }
    
    // Per rimuovere orari senza senso rimasti bloccati nel database per errore nei test precedenti
    // (come ad esempio le 08:00 o 23:00 nel mattino)
    // Non aggiungiamo più forzatamente il selectedValue se è fuori dal range del tipo.
    
    return allowedSlots.map(slot => 
        `<option value="${slot}" ${slot === selectedValue ? 'selected' : ''}>${slot}</option>`
    ).join('');
}

function createDayCard(dayNum, dayName, dayData, isOpen) {
    const isMorningObj = dayData.morning || null;
    const isAfternoonObj = dayData.afternoon || null;
    const isVipObj = dayData.vip || null;
    
    const morningEnabled = !!isMorningObj;
    const afternoonEnabled = !!isAfternoonObj;
    const vipEnabled = !!isVipObj;
    
    const mStart = isMorningObj ? isMorningObj.start : '08:30';
    const mEnd = isMorningObj ? isMorningObj.end : '13:15';
    const aStart = isAfternoonObj ? isAfternoonObj.start : '14:00';
    const aEnd = isAfternoonObj ? isAfternoonObj.end : '17:00';
    const vStart = isVipObj ? isVipObj.start : '18:00';
    const vEnd = isVipObj ? isVipObj.end : '23:15';

    return `
    <div class="day-card" data-day="${dayNum}">
        <div class="day-header">
            <h3>${dayName}</h3>
            <label class="switch">
                <input type="checkbox" class="day-toggle" ${isOpen ? 'checked' : ''}>
                <span class="slider"></span>
            </label>
        </div>
        
        <div class="day-content" style="${isOpen ? '' : 'opacity: 0.5; pointer-events: none;'}">
            
            <!-- MATTINA -->
            <div class="shift-row">
                <span class="shift-label">Mattino</span>
                <label class="switch">
                    <input type="checkbox" class="morning-toggle" ${morningEnabled ? 'checked' : ''}>
                    <span class="slider"></span>
                </label>
                <select class="time-select m-start" ${morningEnabled ? '' : 'disabled'}>
                    ${getOptionsHTML(mStart, 'm-start')}
                </select>
                <span>-</span>
                <select class="time-select m-end" ${morningEnabled ? '' : 'disabled'}>
                    ${getOptionsHTML(mEnd, 'm-end')}
                </select>
            </div>
            
            <!-- POMERIGGIO -->
            <div class="shift-row">
                <span class="shift-label">Pomeriggio</span>
                <label class="switch">
                    <input type="checkbox" class="afternoon-toggle" ${afternoonEnabled ? 'checked' : ''}>
                    <span class="slider"></span>
                </label>
                <select class="time-select a-start" ${afternoonEnabled ? '' : 'disabled'}>
                    ${getOptionsHTML(aStart, 'a-start')}
                </select>
                <span>-</span>
                <select class="time-select a-end" ${afternoonEnabled ? '' : 'disabled'}>
                    ${getOptionsHTML(aEnd, 'a-end')}
                </select>
            </div>
            
            <!-- VIP -->
            <div class="vip-section">
                <h4>Orari VIP</h4>
                <div class="shift-row">
                    <span class="shift-label">Extra (VIP)</span>
                    <label class="switch">
                        <input type="checkbox" class="vip-toggle" ${vipEnabled ? 'checked' : ''}>
                        <span class="slider"></span>
                    </label>
                    <select class="time-select v-start" ${vipEnabled ? '' : 'disabled'}>
                        ${getOptionsHTML(vStart, 'vip')}
                    </select>
                    <span>-</span>
                    <select class="time-select v-end" ${vipEnabled ? '' : 'disabled'}>
                        ${getOptionsHTML(vEnd, 'vip')}
                    </select>
                </div>
            </div>
            
        </div>
    </div>
    `;
}

function renderCards() {
    const list = document.getElementById('orari-list');
    let html = '';
    
    for (let d = 1; d <= 6; d++) {
        const isOpen = currentSettings.daysOpen.includes(d);
        const dayData = currentSettings.days[d] || { morning: null, afternoon: null, vip: null };
        html += createDayCard(d, DAYS_INFO[d], dayData, isOpen);
    }
    
    list.innerHTML = html;
    
    // Setup listeners
    document.querySelectorAll('.day-card').forEach(card => {
        const dayToggle = card.querySelector('.day-toggle');
        const content = card.querySelector('.day-content');
        
        dayToggle.addEventListener('change', (e) => {
            if(e.target.checked) {
                content.style.opacity = '1';
                content.style.pointerEvents = 'auto';
            } else {
                content.style.opacity = '0.5';
                content.style.pointerEvents = 'none';
            }
        });
        
        setupShiftToggle(card, '.morning-toggle', ['.m-start', '.m-end']);
        setupShiftToggle(card, '.afternoon-toggle', ['.a-start', '.a-end']);
        setupShiftToggle(card, '.vip-toggle', ['.v-start', '.v-end']);
    });
}

function setupShiftToggle(card, toggleSelector, selectSelectors) {
    const toggle = card.querySelector(toggleSelector);
    if (!toggle) return;
    toggle.addEventListener('change', (e) => {
        selectSelectors.forEach(sel => {
            const el = card.querySelector(sel);
            if (el) el.disabled = !e.target.checked;
        });
    });
}

async function saveSettings() {
    const btn = document.getElementById('save-orari-btn');
    btn.disabled = true;
    btn.textContent = 'Salvataggio...';
    
    const newSettings = {
        daysOpen: [],
        days: {}
    };
    
    document.querySelectorAll('.day-card').forEach(card => {
        const d = parseInt(card.dataset.day);
        const isDayOpen = card.querySelector('.day-toggle').checked;
        
        if (isDayOpen) {
            newSettings.daysOpen.push(d);
            
            const isM = card.querySelector('.morning-toggle').checked;
            const isA = card.querySelector('.afternoon-toggle').checked;
            const isV = card.querySelector('.vip-toggle').checked;
            
            let morning = null;
            if (isM) {
                const s = card.querySelector('.m-start').value;
                const e = card.querySelector('.m-end').value;
                morning = { start: s, end: e, slots: calculateSlots(s, e) };
            }
            
            let afternoon = null;
            if (isA) {
                const s = card.querySelector('.a-start').value;
                const e = card.querySelector('.a-end').value;
                afternoon = { start: s, end: e, slots: calculateSlots(s, e) };
            }
            
            let vip = null;
            if (isV) {
                const s = card.querySelector('.v-start').value;
                const e = card.querySelector('.v-end').value;
                vip = { start: s, end: e, slots: calculateSlots(s, e) };
            }
            
            newSettings.days[d] = { morning, afternoon, vip };
        } else {
            // Chiuso
            newSettings.days[d] = { morning: null, afternoon: null, vip: null };
        }
    });
    
    try {
        const res = await apiRequest('/admin/settings/hours', {
            method: 'POST',
            body: JSON.stringify(newSettings)
        });
        
        if (res.success) {
            alert('Orari salvati con successo!');
        } else {
            alert('Errore: ' + res.error);
        }
    } catch(e) {
        alert('Errore di comunicazione col server: ' + e);
    }
    
    btn.disabled = false;
    btn.textContent = 'Salva Impostazioni';
}
