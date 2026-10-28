# Piano — evoluzione del backend e redesign mobile first

Branch: `claude/lev-space-backend-mobile-4d96c8` · base: `main` @ `eaa0bf4`
Sequenza seguita: **baseline mobile → backend → redesign frontend → verifica integrata**.
Gradi: D1 contenuti/dettagli · D2 componenti/layout · D3 flussi/servizi · D4 autorizzazioni, concorrenza, persistenza, calendario · D5 architettura e verifica complessiva.

Stato: ✅ fatto · 📝 documentato senza modifica · ⚠️ comportamento cambiato da confermare col barbiere

Esito delle verifiche, limiti e checklist per dispositivi reali: [STATO.md](STATO.md).

## 0. Baseline (2026-10-28, prima di ogni modifica)

| Controllo              | Risultato                                                         |
| ---------------------- | ----------------------------------------------------------------- |
| `npm run lint`         | ✅ nessun errore                                                  |
| `npm run format:check` | ✅                                                                |
| `npm test`             | ✅ 75/75                                                          |
| Screenshot 390 × 844   | 15 schermate (anonimo, cliente, admin) su database seed sintetico |

Difetti osservati da telefono nella baseline (screenshot in `docs/images/before/`):

- `/dashboard`: il calendario è dietro una modale "Quanti si presenteranno?" che compare a ogni visita; subito dopo, "Il solito?" proponeva il 4 febbraio 2027 (una settimana dopo l'ultima prenotazione _futura_ della serie).
- `/admin`: settimana a 7 colonne compressa in 390 px (nomi troncati a 6 lettere, scroll in due direzioni); la legenda occupa metà schermo.
- `/admin/clienti`: la barra "0 modifiche in attesa di conferma" è sempre visibile e copre l'ultima riga.
- Ovunque: pulsanti grigi tutti uguali, nessuna gerarchia tra azione principale e secondarie; il pulsante del tema galleggia sopra i contenuti.

## 1. Backend — difetti verificati e corretti

Ogni voce ha un test di regressione che falliva sul codice di partenza (19 test RED prima delle correzioni di B14-B27).

| ID  | D   | Problema → conseguenza                                                                                                                                         | Correzione                                                                                                                                  | Prova                                                                |
| --- | --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| B14 | D4  | Se la rinomina atomica fallisce, `saveDatabase` riscriveva il file direttamente → un crash a metà tronca il database                                           | Brevi tentativi di rinomina, poi errore; mai scrittura diretta                                                                              | `persistence.test.js`                                                |
| B15 | D4  | Salvataggio dopo il `COMMIT` fallito → `ROLLBACK` senza transazione che nasconde l'errore; memoria con la prenotazione, disco senza                             | Snapshot dell'ultimo stato salvato: la memoria torna allo stato su disco e l'errore originale arriva al gestore centrale (500)               | `persistence.test.js` (3 casi)                                       |
| B16 | D4  | Indice univoco degli slot non creabile → l'avvio proseguiva senza il vincolo "un appuntamento per slot"                                                        | Avvio rifiutato con l'elenco dei doppioni, nessuna cancellazione; `npm run db:check` in sola lettura                                        | `startup.test.js`                                                    |
| B17 | D3  | Migrazioni con `try/catch` vuoti → app avviata con schema incoerente                                                                                           | Colonne verificate con `PRAGMA table_info`; gli errori veri fermano l'avvio                                                                | `startup.test.js`                                                    |
| B18 | D3  | `globalSettingsDB.set` inghiottiva gli errori → "Orari aggiornati" anche senza salvataggio                                                                     | Errori propagati                                                                                                                            | `persistence.test.js`                                                |
| B19 | D4  | Doppio invio o retry dopo una risposta persa → 409 "già occupato" per una prenotazione propria                                                                 | Idempotenza: stessi slot dello stesso gruppo del cliente → 200 con la prenotazione esistente, senza seconda email                           | `hardening.test.js`                                                  |
| B20 | D4  | Lungo periodo creato settimana per settimana dal browser → successi parziali non recuperabili (il retry dava 409 sulla prima)                                  | `POST /api/bookings/series`: tutte o nessuna, con l'elenco delle settimane in conflitto                                                    | `hardening.test.js`, scenario Playwright 6                           |
| B21 | D3  | VIP/BAN come toggle → doppio clic o retry invertivano lo stato                                                                                                 | Valore esplicito nel corpo; toggle solo per compatibilità                                                                                   | `hardening.test.js`                                                  |
| B22 | D3  | Spostamento admin senza validazione di data e ora di destinazione                                                                                              | Validazione come per l'inserimento                                                                                                          | `hardening.test.js`                                                  |
| B23 | D3  | Il cliente poteva cancellare o modificare appuntamenti passati → storico e report cambiavano                                                                   | 400 per appuntamenti iniziati (l'admin mantiene il controllo)                                                                               | `hardening.test.js`                                                  |
| B24 | D4  | CSRF difeso solo da `SameSite=Lax` + parser JSON; rotte senza corpo e siti "same-site" scoperti                                                                | Metodi non sicuri rifiutati da altre origini (`Origin` / `Sec-Fetch-Site`), corpi non JSON → 415                                            | `hardening.test.js`                                                  |
| B25 | D4  | Il logout cancellava solo il cookie: il JWT restava valido 7 giorni                                                                                            | `jti` nei token e tabella `revoked_tokens`                                                                                                  | `hardening.test.js`, scenario Playwright 12                          |
| B26 | D5  | Il calendario admin ricalcolava gli slot nel browser (seconda fonte di verità, con gli extra "legacy" duplicati)                                               | `GET /api/admin/schedule`: giorni, slot (anche `standardSlots`), prenotazioni e ferie dal server                                            | `hardening.test.js`                                                  |
| B27 | D2  | Orari reali non disponibili per la pagina pubblica                                                                                                              | `GET /api/hours` senza extra VIP                                                                                                            | `hardening.test.js`                                                  |
| B28 | D3  | Gestione Orari generava gli slot da una lista fissa irregolare (`18:00, 18:30, 18:45…`) → appuntamenti da 45 minuti sovrapposti                                | Slot calcolati sul server da inizio e fine a passi di 45 minuti; turni più corti rifiutati                                                  | `admin.test.js`                                                      |
| B29 | D3  | Con gli extra VIP **spenti**, il server ripiegava sugli extra predefiniti (08:00, 18:00–23:15), domenica compresa → spegnerli li faceva comparire ⚠️          | Il ripiego vale solo per orari mai salvati dalla pagina                                                                                     | `slots.test.js`                                                      |
| R1  | D4  | (revisione di sicurezza) Retry sull'endpoint ospite → restituiva nome, telefono e token della prenotazione di quell'email a chiunque la conoscesse             | Su un retry ospite si restituiscono solo giorno e ora                                                                                       | `hardening.test.js`                                                  |
| R2  | D3  | (revisione) Disco pieno durante la scrittura del file temporaneo → `.tmp` a metà e memoria non ripristinata; ripristino che poteva lasciare il DB chiuso       | Scrittura ed export nel `try`; si apre la copia prima di chiudere l'attuale                                                                 | lettura del codice + `persistence.test.js`                           |
| R3  | D3  | (revisione) Parametri malformati in `/admin/schedule` e doppia decodifica dell'email nelle rotte VIP/BAN → 500                                                 | 400 / 404                                                                                                                                   | `hardening.test.js`                                                  |

Verificati senza difetti: separazione ospite/cliente/admin, proprietà delle prenotazioni, ban su sessioni aperte, reset password monouso e a scadenza, gruppi contigui senza scavalcare pause, ferie nelle serie, cancellazione singola o di serie, spostamento atomico, extra solo per l'admin, fuso `Europe/Rome` e cambio dell'ora legale (test aggiunto), `trust proxy` solo in produzione.

### Comportamenti ambigui resi espliciti

| Tema                     | Prima                                                                                         | Ora                                                                                                                                                 | Stato |
| ------------------------ | --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| "Il solito?"             | Ultima prenotazione (anche futura) + 7 giorni; nulla se quella data era passata               | Ultimo appuntamento **già fatto**, stesso giorno e ora, nella prima delle prossime 3 settimane libera e senza un altro appuntamento del cliente      | ⚠️    |
| Extra VIP spenti         | Comparivano gli extra predefiniti (B29)                                                       | Nessun extra; per riaverli: Orari → Extra VIP                                                                                                       | ⚠️    |
| Cancellazione della serie | Elimina tutte le occorrenze, anche passate (incide sui report)                               | Invariato; la conferma ora lo dice esplicitamente                                                                                                   | 📝    |
| Giorno chiuso            | La vecchia pagina Orari azzerava i turni chiudendo un giorno                                  | I turni restano salvati e tornano quando il giorno riapre                                                                                           | ✅    |
| Gruppi nello spostamento admin | Si sposta un solo slot del gruppo                                                       | Invariato (documentato)                                                                                                                             | 📝    |

📝 Lasciati documentati: enumerazione degli account (registrazione e checkout ospite dicono già se l'email esiste: scelta di prodotto); token emessi prima dell'impronta password e del `jti` (non revocabili al logout, scadono entro 7 giorni dal rilascio); singola istanza sql.js.

## 2. Redesign

Due iterazioni. La prima ("il cartellino e l'agenda": carta avorio, serif, accento vermiglio) è stata respinta dal proprietario perché ancora troppo "da IA": in effetti ricadeva in uno dei look tipici delle interfacce generate. La seconda, **"Il tuo turno"**, nasce dall'eliminacode, il rituale che l'app sostituisce (vedi DESIGN.md). I task sotto valgono per la versione finale.

Direzione e sistema in [DESIGN.md](../DESIGN.md), contesto in [PRODUCT.md](../PRODUCT.md).

| ID  | D   | Task                                                                                                       | Stato |
| --- | --- | ---------------------------------------------------------------------------------------------------------- | ----- |
| F1  | D2  | Token, tipografia self-hosted, temi chiaro e scuro progettati separatamente                                | ✅    |
| F2  | D2  | Componenti: pulsanti, campi, segmented, switch, sheet su `<dialog>`, toast, cartellino, timbro              | ✅    |
| F3  | D3  | Shell: barra superiore + navigazione inferiore con safe area; da 900 px navigazione nella barra            | ✅    |
| F4  | D3  | Picker di giorno e orario condiviso (cliente, ospite, più settimane)                                       | ✅    |
| F5  | D3  | Ingresso con primo posto libero reale, accesso, registrazione (con accesso immediato), recupero password   | ✅    |
| F6  | D3  | Home cliente, prenotazione in una pagina con conferma in sheet, "Il solito?"                               | ✅    |
| F7  | D3  | Appuntamenti per mese con Sposta/Cancella; più settimane con ripetizione e conferma atomica                | ✅    |
| F8  | D4  | Agenda: vista giorno + selettore settimanale, vista settimana, Sposta esplicito, trascinamento su desktop  | ✅    |
| F9  | D3  | Clienti (VIP/BAN espliciti, conferma per la sospensione), Orari con anteprima, Report con tabella          | ✅    |
| F10 | D5  | Verifica integrata Playwright, screenshot prima/dopo, README                                               | ✅    |

## 3. Comandi di verifica

```bash
npm run lint && npm run format:check && npm test
npm run db:check      # doppioni sugli slot, sola lettura
```

## 4. Rilascio e rollback

Il lavoro è su un branch dedicato; `main` (deploy Railway) non cambia finché la PR non viene unita. Prima del deploy: `npm run db:check` sul database di produzione (B16 rifiuta l'avvio se esistono doppioni). Schema solo additivo (tabella `revoked_tokens`): tornare al commit precedente non richiede migrazioni inverse; le sessioni restano valide in entrambe le direzioni.
