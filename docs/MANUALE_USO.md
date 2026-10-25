# Manuale d'uso — Lev Space

Guida rapida per chi usa l'app ogni giorno: clienti e titolare del salone.

## Per i clienti

### Registrazione e accesso

- **Registrazione** (`/register`): nome, cognome, email, telefono e password di almeno 8 caratteri. Se in passato hai prenotato come ospite con la stessa email, ritrovi quelle prenotazioni nel tuo account.
- **Accesso** (`/login`): email e password. Dopo 20 tentativi in 15 minuti l'accesso si blocca per qualche minuto.
- **Password dimenticata** (`/reset-password`): ricevi via email un link valido un'ora e utilizzabile una sola volta. Cambiando password, le sessioni aperte su altri dispositivi vengono chiuse.

### Prenotare un appuntamento

1. Dalla home scegli **Prenota**: indica quante persone verranno (da 1 a 3).
2. Nel calendario sono selezionabili solo i giorni con almeno un orario libero.
3. Scegli l'orario: per i gruppi compaiono solo gli orari con abbastanza posti consecutivi (mai a cavallo della pausa pranzo).
4. Conferma dal riepilogo: arriva un'email di conferma.

**"Il solito?"** — se la settimana successiva al tuo ultimo appuntamento lo stesso giorno e orario sono liberi, l'app te li propone appena apri il calendario: basta confermare.

### Gestire le prenotazioni

Da **Gestione Prenotazioni** (menu ☰) vedi gli appuntamenti futuri e puoi:

- **Modificare**: scegli il nuovo giorno e orario; la vecchia prenotazione resta valida finché la nuova non è confermata.
- **Cancellare**: per un gruppo si liberano tutti i posti prenotati insieme.

### Prenotazioni di lungo periodo

Da **Prenotazioni di lungo periodo** prenoti un appuntamento a settimana per 4, 8 o 12 settimane, scegliendo giorno e orario di ogni settimana.

### Prenotare senza account

Da **Prenotazione rapida** (`/guest-booking`) bastano nome, cognome ed email. Se l'email appartiene già a un account registrato, viene chiesto di accedere.

## Per il titolare (admin)

### Calendario settimanale (`/admin`)

- **Aggiungere** un appuntamento: clic su una cella libera; basta il cognome, l'autocompletamento propone i clienti registrati.
- **Prenotazione ricorrente**: nella stessa finestra scegli "ogni settimana", "ogni 2" o "ogni 3 settimane" e per quanti mesi (1–12). Le date già occupate o in ferie vengono saltate, mai sovrascritte.
- **Spostare**: trascina l'appuntamento su un'altra cella (su telefono tieni premuto), oppure aprilo e usa **Sposta** scegliendo giorno e orario.
- **Cancellare**: apri l'appuntamento e scegli **Cancella**; per le ricorrenti puoi cancellare solo quella data o tutta la serie.
- **Orari extra**: prima dell'apertura e la sera il calendario admin mostra slot non prenotabili online, utili per i clienti VIP.
- **Ferie**: clicca sulla legenda "Ferie", seleziona le celle (anche trascinando) e salva. Gli slot in ferie spariscono dal calendario dei clienti.

### Gestione Clienti (`/admin/clienti`)

Cerca un cliente e spunta **VIP** o **BAN**, poi conferma. Un cliente bannato non può più accedere né prenotare, nemmeno come ospite.

### Gestione Orari (`/admin/orari`)

Per ogni giorno: aperto/chiuso, turno di mattina e pomeriggio con inizio e fine. Gli slot (ogni 45 minuti) si aggiornano subito nel calendario dei clienti.

### Report (`/admin/reports`)

Prenotazioni per giorno nell'ultima settimana o negli ultimi 30 giorni, con totale, media giornaliera e giorno migliore. Le frecce mostrano i periodi precedenti.

### Backup

`npm run backup` copia il database in `BACKUP_DIR` e conserva gli ultimi 4 backup. Conviene pianificarlo (per esempio una volta a settimana) e salvarlo su un disco diverso da quello del database.
