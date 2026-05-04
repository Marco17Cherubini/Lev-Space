# Report: Analisi e Progetto per la "Gestione Oraria" Admin

## 1. Analisi del Sistema di Prenotazione Attuale
Dopo aver effettuato una lettura profonda utilizzando gli strumenti a mia disposizione (Grep e Read file) sui file sorgente, ecco come è attualmente strutturata la concezione del tempo e delle prenotazioni:
- **Origine dei Dati:** Gli orari di lavoro (turni di mattina e pomeriggio) sono staticamente definiti all'interno di `config/config.js` (`businessHours`). Ad ogni giorno della settimana sono associati esplicitamente degli array con le stringhe degli **slot fissi disponibili** (es: `['08:30', '09:15', '10:00', ...]`).
- **Logica Core:** In `server/bookingService.js`, il calcolo della disponibilità si base interamente sull'iterazione di queste liste limitate.
- **Finestre VIP e Gestione Extra:** Attualmente le finestre VIP *non si trovano nei file di configurazione generali*, ma sono state cablate direttamente ("hardcoded") alla riga 38-42 di `server/bookingService.js` con i classici slot serali (es: `['18:00', '18:45', ...]`) e differenziate per il sabato (`['15:30', ...]`).

## 2. Contromisure Architetturali Strategiche (Soluzione a Lungo Termine)
Il sistema attuale premia la stabilità delle slot fisse. Anziché convertire il calcolo al ricalcolo dinamico su range `dal minuto A al minuto B` in backend (il che stravolgerebbe tutta la gestione degli storici e della disponibilità del vostro DB delle prenotazioni), le contromisure ottimali sono:
1. Svincolare le logiche su file locale (`config.js`) introducendo o un file `.json` su un percorso persistente protetto (come la directory `/data/` che immagazzina `database.sqlite`) oppure, preferibilmente, una **singola riga ad hoc per i `settings` direttamente dentro `database.sqlite`**. Ciò evita la rottura in fase di restart del container backend e centralizza il salvataggio.
2. Sulla **dashboard (Admin)**: Per evitare injection testuali, l'interfaccia si abbellirà con gli stili presentati allegando delle Dropdown `select` controllate. L'admin non inserirà "range arbitrari", ma selezionerà da elenchi "Tempo di Inizio" e "Tempo di Fine" per le singole giornate, oltre a un campo di switch per abilitare quel giorno.
3. Al momento della singola `POST` di salvataggio da parte dell'Admin, il nostro backend si occuperà di creare un "compilato" generando, tra l'inizio e la fine richiesti, gli appropriati elementi dell'Array in base al tempo standard dell'appuntamento (45 minuti o quello che sia) e le salverà di nuovo come **slot fissi**, onorando la logica esistente di `bookingService`.

## 3. Road-Map / Tasks per l'Implementazione
Di seguito lo schema su come implementare la funzionalità minimizzando qualsiasi interruzione o debito tecnico.

### **Task 1: Adeguamento Strutturale (Database e Migrazione) 🔥**
- In `server/database.js`: Creare la tabella persistente per i settaggi, se già non presente (es. `CREATE TABLE IF NOT EXISTS global_settings (key TEXT PRIMARY KEY, value_json TEXT)`).
- Creare una funzione nativa `getSettings()` e un seeder iniziale che legga per la prima e ultima volta il vecchio JSON da `config.js` e li sbatta permanentemente nel database.

### **Task 2: Progettazione e Routing (API Backend) ⚙️**
- Creazione API `GET /api/admin/settings/hours` per esporre la lettura delle impostazioni orarie, limitata solo da autenticazione con ruolo admin.
- Creazione API `POST /api/admin/settings/hours` contenente la logica cruciale: decodificazione della richiesta originata dai menu a tendina, ed **espansione in slot fissi validi**. Lo script ripopolerà sia i vettori globali standard sia quelli VIP.

### **Task 3: Refactoring delle logiche in `bookingService.js` 🔄**
- Sostituzione delle chiamate dipendenti dal costoso modulo `config.js` verso interrogazioni sincrone/Asincrone al modulo Database.
- Rimozione del codice "hardcoded" (`extraSlotsWeekday`) in favore del prelievo generico di tipo VIP direttamente dai record Database derivati dai nuovi settaggi configurati.

### **Task 4: Preparazione Skeleton User Interface (Frontend - Base) 🎨**
- Copia degli stili (buttons, typography, theme base) per preparare un layout compatibile basato sull'allegato senza cadere nel copia-incolla spudorato.
- Aggiunta della voce nel `menù laterale della rete admin` (insieme a Gestione Clienti, ecc.) del nuovo link alla pagina **Gestione Oraria**.
- Creazione file `frontend/admin-orari.html` dedicato al form di gestione (diviso in Turno Mattina, Turno Pomeriggio, Finestre Giorni Lavorativi, Finestre VIP).

### **Task 5: Lo-Fi Business Logic e Form Sicuro (Frontend - Scripting) 🛡️**
- Creazione in `frontend/js/admin-orari.js` di un polifill per automatizzare la creazione di tendine Select limitate (step da 15 minuti standardizzati).
- Nessun Input field testuale permesso: Solo combo-box controllati rigorosamente via iterazioni DOM pre-numerate.
- Integrazione delle Request asincrone (su Axios o Fetch nativo) per l'interscambio con i controller sviluppati nei Task 2 e 3.
