# Stato del lavoro, verifiche e limiti

Piano e difetti: [PLAN.md](PLAN.md) · direzione visiva: [../DESIGN.md](../DESIGN.md) · contesto: [../PRODUCT.md](../PRODUCT.md)

Tutte le prove sono state fatte su un database sintetico (`npm run seed`), con le email disattivate (`RESEND_API_KEY` vuota) e nessun accesso al servizio di produzione.

## 1. Controlli automatici

| Comando                | Prima (`eaa0bf4`) | Dopo (HEAD del branch) |
| ---------------------- | ----------------- | ---------------------- |
| `npm run lint`         | ✅                | ✅                     |
| `npm run format:check` | ✅                | ✅                     |
| `npm test`             | 75/75             | 102/102                |

I 27 test nuovi coprono i difetti B14-B29 e quelli emersi dalla revisione di sicurezza; i 19 relativi a B14-B27 sono stati scritti prima delle correzioni e fallivano sul codice di partenza.

## 2. Verifica integrata nel browser (Playwright, Chromium, backend reale)

Telefono emulato 390 × 844 (touch), salvo dove indicato.

| #   | Flusso                                    | Esito | Evidenza                                                                                              |
| --- | ----------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------- |
| 1   | Prenotazione ospite con doppio tocco      | ✅    | Prenotazione creata una volta, slot poi non disponibile                                               |
| 2   | Registrazione, login, recupero password   | ✅    | Accesso immediato dopo la registrazione; "Credenziali non valide"; token di reset falso rifiutato     |
| 3   | Prenotazione singola e di gruppo          | ✅    | Gruppo di 2: solo orari con 2 posti consecutivi, "fino alle 17:00"                                    |
| 4   | Conflitto di disponibilità                | ✅    | Slot preso da un altro durante la conferma → "Slot 08:30 già occupato", orari aggiornati              |
| 5   | "Il solito?"                              | ✅    | Dalla home, un tocco apre la conferma con giorno e ora già scelti                                     |
| 6   | Lungo periodo con conflitto               | ✅    | Settimana 3 presa da un altro → nessuna prenotazione creata (3 prima, 3 dopo), poi 4 confermate       |
| 7   | Sposta e cancella dal cliente             | ✅    | Timbro "Spostato"; cancellazione con conferma                                                         |
| 8   | Agenda: dettaglio e Sposta (telefono)     | ✅    | Spostamento senza trascinamento, anche su orario extra                                                |
| 8b  | Trascinamento nella settimana (1440 px)   | ✅    | Prenotazione trascinata su una cella libera e spostata                                                |
| 9   | Ricorrenza, ferie, orari                  | ✅    | Serie ogni 2 settimane per 2 mesi (4 creati); 2 orari chiusi e riaperti; anteprima del turno          |
| 10  | VIP e BAN                                 | ✅    | Sospensione con conferma → il cliente riceve "Account sospeso" al login                               |
| 11  | Report                                    | ✅    | 7 e 30 giorni, periodo precedente, tabella dei dati                                                   |
| 12  | Logout e accessi non autorizzati          | ✅    | Anonimo → login con ritorno alla pagina; cliente su /admin → home; API admin 403; token dopo logout 401 |
| —   | Rete lenta (1,5 s) e sessione scaduta     | ✅    | Pulsante "Confermo…" con `aria-busy`; senza sessione → login con `next`                               |

Stati vuoti, errori e caricamenti verificati a vista: agenda senza appuntamenti, giorno chiuso, nessun orario per un gruppo, errore di rete con "Riprova", settimana non compilabile in più settimane.

Accessibilità e uso da tastiera (oltre ai test):

- primo Tab sul link "Vai al contenuto"; giorno, orario e "Continua" usabili con Invio e Spazio;
- lo sheet riceve il focus, Esc lo chiude e il focus torna sul pulsante che l'aveva aperto; il tasto **Indietro** chiude lo sheet senza lasciare la pagina;
- nessun controllo senza nome accessibile e nessun target touch sotto 44 × 44 px su 9 pagine (link dentro il testo esclusi);
- testo al 200 %: nessuno scorrimento orizzontale su ingresso, prenotazione ospite, registrazione, agenda e clienti;
- 320 px e 390 px senza scorrimento orizzontale; 1440 px controllato su ingresso e agenda;
- contrasti calcolati sui token (testo ≥ 4,5:1, bordi dei campi ≥ 3:1) in entrambi i temi;
- `prefers-reduced-motion`: restano solo le dissolvenze; screenshot presi con movimento ridotto.

Non è stato eseguito un controllo automatico tipo axe (nessuno strumento installato); non sostituirebbe comunque le prove sopra.

## 3. Prestazioni (laboratorio, non dati reali degli utenti)

Stesse condizioni per prima e dopo: Chromium, 390 × 844, cache disattivata, rete simulata (150 ms di latenza, ~6,4 Mbit/s), CPU rallentata 4×. LCP in millisecondi, KB trasferiti.

| Pagina       | LCP prima | LCP dopo | CLS prima | CLS dopo | KB prima | KB dopo |
| ------------ | --------- | -------- | --------- | -------- | -------- | ------- |
| Ingresso     | 1156      | 904      | 0         | 0        | 207      | 222     |
| Accesso      | 1124      | 612      | 0         | 0        | 111      | 151     |
| Home cliente | 1024      | 492      | 0         | 0        | 111      | 182     |
| Prenota      | 1152      | 568      | 0         | 0        | 136      | 192     |
| I tuoi turni | 1120      | 1068     | 0         | 0        | 129      | 169     |
| Agenda       | 1168      | 476      | 0         | 0,006    | 218      | 208     |
| Report       | 1204      | 508      | 0         | 0,024    | 326      | 371     |

"Dopo" è il mondo finale "Il tuo turno". Il peso cresce per il carattere variabile Archivo (90 KB, larghezza e peso in un solo file, precaricato) e, sull'ingresso, per il logo mostrato più grande; Chart.js resta caricato solo nel Report. Durante il lavoro due regressioni misurate sono state corrette prima del commit: CLS 0,31 su Prenota e 0,08 su Home (contenuti che comparivano sopra elementi già visibili) e scorrimento orizzontale a testo 200 % su ingresso e Orari.

## 4. Strumenti e skill usati davvero

| Strumento                         | Uso concreto                                                                                                                                               |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ECC `/plan`                       | Struttura del piano (requisiti, rischi, fasi); il brief autorizzava a procedere senza attendere conferma                                                    |
| ECC TDD                           | Test di regressione scritti prima delle correzioni (19 RED → GREEN)                                                                                         |
| ECC `security-reviewer` (agente)  | Revisione indipendente del diff backend: 1 problema MEDIUM (dati di un ospite esposti dal retry) e 5 LOW, tutti corretti con test                          |
| Taste (`design-taste-frontend`)   | `draw.mjs` per la prima direzione (_The page is the object_, seed 640460717, poi abbandonata); regole di casa (niente eyebrow, gradienti, ombre a riposo, card a icone) applicate a entrambe le iterazioni |
| Impeccable                        | `context`, PRODUCT.md, craft floor; dopo il rifiuto della prima versione: calibrazione sui look tipici dell'IA, `concept-seed` (candidata 4 di 7: eliminacode, confermata dal proprietario), contratto di direzione in `.impeccable/surfaces/`, DESIGN.md scritto dall'agente `impeccable-documenter` sul risultato costruito |
| Emil Kowalski (`emil-design-eng`) | Curve e durate (pressione 120 ms, sheet 280 ms), `:active` scale su tasti e pulsanti, `@starting-style`, movimento a scatti `steps()` per la stampa del biglietto e l'accensione del display (88:88), nessuna animazione su azioni ripetute, hover solo con puntatore fine, movimento ridotto |
| Playwright MCP                    | Baseline, 15 flussi integrati, tastiera/focus/Indietro, target touch, zoom, LCP/CLS, screenshot prima/dopo                                                   |
| Figma MCP                         | Non usato: nessun file Figma del progetto; si è lavorato su un prototipo funzionante nel repository                                                         |

Conflitti tra skill e brief, risolti a favore del brief: Taste chiede almeno quattro fotografie e otto elementi animati per pagina; il brief vieta foto non autentiche del negozio e animazioni che rallentano il calendario. La direzione si regge sul logo reale, sul display a segmenti disegnato in SVG e su un unico momento animato forte (il biglietto che esce dalla fessura).

## 5. Limiti ancora presenti

- **WebKit / Safari non verificati**: Playwright WebKit non è installato in questo ambiente e non sono stati scaricati browser. Nessuna prova su un vero iPhone o telefono Android (vedi checklist).
- **Singola istanza**: sql.js tiene il database in memoria; niente cluster o repliche.
- **Email ospite non verificata**: invariato rispetto a prima.
- **Token emessi prima del rilascio** (senza `jti` o impronta password): non revocabili al logout, scadono entro 7 giorni.
- **Logo**: i file sono 1792 × 1976 px (~55 KB WebP) mostrati a ~240 px; mancano strumenti di conversione nell'ambiente per una versione ridotta.
- **Trascinamento** solo con il mouse nella vista settimana; su telefono si usa "Sposta appuntamento" (il long press precedente non è stato riportato, per avere un'unica via esplicita e accessibile).
- **Comportamenti cambiati da confermare** col barbiere: "Il solito?" basato sull'ultimo appuntamento già fatto; extra VIP spenti = nessun extra (PLAN.md, sezione "Comportamenti ambigui").
- Nel database di produzione potrebbero esistere slot doppi: con B16 l'avvio si ferma. Eseguire `npm run db:check` prima del deploy.

## 6. Checklist su dispositivi reali

Safari iOS (iPhone reale) e Chrome Android:

- [ ] Ingresso: il primo posto libero compare e "Prenota questo posto" apre la prenotazione con l'orario scelto.
- [ ] Prenotazione: con la tastiera aperta sui campi ospite, "Conferma prenotazione" resta raggiungibile (sheet scorrevole).
- [ ] Lo sheet si apre dal basso, si chiude toccando lo sfondo, con la ✕ e con il gesto/pulsante Indietro (Android).
- [ ] La barra in basso e la barra d'azione rispettano la "home indicator" (safe area) in verticale e in orizzontale.
- [ ] Nessuno zoom automatico toccando i campi (font a 16 px); lo zoom con due dita resta possibile.
- [ ] Il tema scuro segue la scelta fatta con il pulsante anche dopo la chiusura di Safari.
- [ ] Agenda: selettore dei giorni scorrevole con il pollice; "Sposta appuntamento" e "Ferie" usabili con una mano.
- [ ] Vista settimana su telefono: scorrimento orizzontale fluido, intestazioni leggibili.
- [ ] Link `tel:` e `mailto:` nel dettaglio dell'appuntamento aprono telefono ed email.
- [ ] VoiceOver / TalkBack: giorni annunciati come "giovedì 30 ottobre", orari come pulsanti premuti/non premuti, toast annunciati.

## 7. Fotografie che migliorerebbero il risultato

Nessuna immagine stock è stata usata. Scatti reali utili, se il negozio li fornisce (con liberatoria per le persone ritratte):

1. La poltrona e la postazione, luce naturale, inquadratura orizzontale (ingresso, a lato del cartellino su desktop).
2. Dettaglio degli strumenti sul banco (forbici, rasoio, pettine) dall'alto (stati vuoti e pagina "Più settimane").
3. L'insegna o la vetrina dalla strada (pagina d'ingresso, insieme agli orari).
4. Il barbiere al lavoro, di spalle o di tre quarti (eventuale sezione "chi siamo").

## 8. Anteprima e rilascio

```bash
npm install
cp .env.example .env    # imposta JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
npm run seed            # dati sintetici, solo su database vuoto
npm start               # http://localhost:3000
```

Rollback: il branch non tocca `main`; dopo un eventuale merge, `git revert` dei commit del branch riporta l'interfaccia precedente. L'unica modifica di schema (tabella `revoked_tokens`) è additiva e compatibile con il codice precedente.
