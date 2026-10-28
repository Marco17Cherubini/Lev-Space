# Product

<!-- impeccable:product-schema 1 -->

> Scritto dal brief del proprietario (2026-10-28) e dal codice, senza intervista: il brief chiedeva di procedere in autonomia. Le voci segnate _(inferito)_ vanno confermate.

## Platform

web

## Users

- **Cliente abituale** di una barberia italiana a una poltrona: prenota dal telefono, spesso in pausa o la sera, con una mano. Torna a ritmo fisso (ogni 1-3 settimane) e vuole rifare "il solito" in pochi tocchi.
- **Cliente nuovo / ospite**: prenota senza account con nome, cognome ed email.
- **Il barbiere (admin)**: gestisce agenda, clienti, orari, ferie e report dal telefono tra un taglio e l'altro, con le mani spesso occupate; su desktop a fine giornata _(inferito)_.

## Product Purpose

Togliere al barbiere il lavoro di centralino: circa 30 richieste al giorno via messaggio o telefono e almeno 3 ore di organizzazione oltre alle 8 di taglio. Successo: il cliente prenota, sposta e cancella da solo; il barbiere controlla la giornata senza rispondere a nessuno.

## Positioning

Non è un widget generico di prenotazione: codifica le regole di questa bottega (slot da 45 minuti, turni diversi per giorno, gruppi fino a 3 persone su slot contigui, orari extra solo per i VIP inseriti dal barbiere, BAN, ricorrenze, "Il solito?").

## Operating Context

- Il cliente vede solo gli slot davvero liberi; la conferma arriva via email (Resend).
- Il barbiere usa l'agenda in piedi, al banco o alla poltrona: azioni rapide, riconoscimento immediato di occupato / libero / ferie / ricorrente / extra.
- Una sola istanza su Railway, database SQLite (sql.js) in un file.

## Capabilities and Constraints

Prenotazione cliente e ospite · gruppi 1-3 · "Il solito?" · lungo periodo 4/8/12 settimane · modifica e cancellazione · agenda admin con inserimento, spostamento (drag e azione esplicita), ricorrenze 1/2/3 settimane fino a 12 mesi, cancellazione singola o serie, ferie per slot · orari per giorno con turni ed extra VIP · clienti con VIP e BAN · report settimanali e mensili con storico · temi chiaro e scuro · reset password via email.

Vincoli: HTML/CSS/JS senza build, CSP senza script inline, nessuna migrazione di stack; interfaccia in italiano.

## Brand Commitments

- Nome: **Lev Space**. Logo pixel-art (UFO e scritta "LEV SPACE"), bianco e nero, in due varianti: `frontend/images/off_w_Lev_webp.webp`, `frontend/images/off_b_Lev_webp.webp`.
- Concetto del brief: **"Il tuo spazio. Il tuo momento."** Precisione e cultura del taglio, composizione editoriale, contrasto e ritmo, cura del dettaglio. Base inchiostro, grafite, avorio e un solo accento controllato.
- Riferimento citato (Josh Lamonaca / MENSPIRE) solo come cultura del mestiere: nessuna pagina, logo, foto o testo di altri marchi.

## Evidence on Hand

- Risultati storici reali nel README (155 clienti, 12 VIP, 197 e 210 tagli nei mesi di punta): restano nel README, non vanno ripetuti come promessa commerciale nell'app.
- **Nessuna fotografia del negozio o dello staff.** Non usare foto stock o generate presentandole come il negozio.
- **Nessun indirizzo o telefono reale nel repository** (`config.js` contiene segnaposto): non mostrarli finché il proprietario non li fornisce.
- Nessuna recensione, prezzo, premio o statistica da mostrare: non inventarli.

## Product Principles

1. La prenotazione viene prima di tutto: dall'ingresso a "confermato" senza attraversare una landing page.
2. Il server decide disponibilità e permessi; l'interfaccia lo riflette senza ricalcolare le regole.
3. Il telefono è il dispositivo principale per entrambi i ruoli.
4. Nessuna azione dipende solo da gesti (drag, long press, hover).
5. Gli errori non lasciano mai una prenotazione a metà né un dubbio su cosa è successo.

## Accessibility & Inclusion

WCAG 2.2 AA (impegno già preso nel progetto): contrasto AA in entrambi i temi, tastiera, focus visibile, target touch ≥ 44 px, `prefers-reduced-motion`, zoom consentito.
