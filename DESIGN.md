# Design — Lev Space

Contesto di prodotto in [PRODUCT.md](PRODUCT.md). Questo file è la sola autorità visiva: token in `frontend/styles/app.css`, componenti descritti qui.

## Idea

> **Il cartellino dell'appuntamento e l'agenda del barbiere diventano l'interfaccia.**

Nel mondo della bottega esistono già due oggetti stampati: il cartellino che il cliente porta via (giorno, ora, nome) e l'agenda a righe del barbiere, una riga ogni 45 minuti. Lev Space li usa come struttura invece di inventare card e dashboard:

- **Cliente.** Il prossimo appuntamento è un cartellino di carta con la linea perforata; la conferma è il cartellino che riceve il **timbro** vermiglio. "Il solito?" è il cartellino della settimana scorsa ricopiato sette giorni dopo.
- **Barbiere.** L'agenda è una pagina a righe: colonna dell'ora in cifre tabellari, una riga per slot, stati riconoscibili a colpo d'occhio anche senza colore.
- **Ingresso pubblico.** Un solo cartellino con il logo, il motto e il **primo posto libero reale** (la cosa viva della pagina): un tocco e si prenota quel posto.

La metafora guida composizione e gerarchia, non la decorazione: nessuna linea diagonale, nessun "ritaglio" ripetuto. Gli unici ornamenti sono quelli dell'oggetto vero: la perforazione e il timbro.

Direzione dalla skill Taste: _The page is the object_ (seed 640460717), con palette mantenuta dal brief. Superfici pubbliche in modalità **Persuade** (ma brevi: la prenotazione è a un tocco), schermate cliente e admin in modalità **Operate**.

## Colore

Base inchiostro, grafite, avorio; **un solo accento: vermiglio "timbro"**, scelto perché il logo è in bianco e nero e il marchio usava già un corallo. Sostituisce la coppia corallo/lime del tema precedente.

| Ruolo       | Chiaro ("carta di giorno") | Scuro ("bottega di sera") | Uso                                           |
| ----------- | -------------------------- | ------------------------- | --------------------------------------------- |
| `--ground`  | `#ECE8DF` avorio grigio    | `#101013` inchiostro      | Fondo della pagina                            |
| `--paper`   | `#FAF8F3`                  | `#1B1B20`                 | Cartellini, sheet, righe dell'agenda          |
| `--paper-2` | `#E2DDD2`                  | `#26262D`                 | Gradino di tono: premuto, slot occupato       |
| `--ink`     | `#141418`                  | `#F1EDE4`                 | Testo, pulsante principale, slot prenotato    |
| `--ink-2`   | `#45454D` grafite          | `#B7B2A8`                 | Testo secondario                              |
| `--line`    | `#CBC5B8`                  | `#3A3A42`                 | Solo campi dei form e perforazione            |
| `--accent`  | `#B8321E`                  | `#FF7357`                 | Timbro, selezione, "oggi", azione distruttiva |

Il tema scuro non è un'inversione: il fondo è più profondo della carta, l'accento è più chiaro per restare AA sul nero e la carta resta leggermente calda. Contrasti verificati: testo ≥ 4,5:1, accento come testo ≥ 4,5:1 in entrambi i temi.

Gli stati dell'agenda non si affidano al solo colore: _Libero_ (carta, testo "Libero"), _Prenotato_ (inchiostro pieno, nome), _Ferie_ (gradino di tono con testo "Ferie"), _Serie_ (prenotato + etichetta "Serie"), _Extra_ (etichetta "Extra" sull'ora).

## Tipografia

Self-hosted in `frontend/fonts/` (OFL), niente richieste a Google a runtime.

- **Libre Franklin** (variabile 400–800): interfaccia, dati, titoli. Cifre tabellari per gli orari (`font-variant-numeric: tabular-nums`).
- **Source Serif 4** (400–600): poche frasi editoriali (motto, note del cartellino, stati vuoti).

Cinque passi: `--t-small` 14px · `--t-body` 17px · `--t-lead` 21px · `--t-head` 28–36px · `--t-display` fino a 112px solo per l'ora sul cartellino e il nome sull'ingresso. Titoli con tracking −0,02 em, maiuscolo solo per il marchio.

## Forma e spazio

- Angoli **quadrati** ovunque (carta), una sola eccezione: le tacche semicircolari della perforazione.
- Nessuna ombra a riposo; solo sheet e toast, che galleggiano davvero.
- Margini della pagina 16 px su telefono, 24 px da 600 px, 40 px da 1024 px. Scala di spazio 4-8-12-16-24-32-48-64.
- Target touch ≥ 44 × 44 px (pulsanti 48 px).

## Componenti (in `app.css`)

| Componente                                    | Note                                                                                             |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `.btn` / `--primary` / `--quiet` / `--danger` | Pieno inchiostro, contorno, testo; `:active` scale 0,97 in 120 ms; stato `aria-busy`             |
| `.field`                                      | Etichetta sopra, input 48 px, errore collegato con `aria-describedby`                            |
| `.segmented`                                  | Radio nativi stilizzati (persone, periodo, vista)                                                |
| `.ticket`                                     | Il cartellino: carta, perforazione a pallini, tacche                                             |
| `.stamp`                                      | Il timbro di conferma (unico momento animato "forte")                                            |
| `.sheet`                                      | `<dialog>` nativo: dal basso su telefono, centrato su desktop; Esc, focus, Indietro chiude       |
| `.calendar` / `.slots`                        | Mese a 7 colonne (celle ≥ 44 px), orari a 3 colonne                                              |
| `.agenda`                                     | Righe dell'agenda admin, vista giorno e settimana                                                |
| `.switch`                                     | `<input type="checkbox" role="switch">`                                                          |
| `.toast`                                      | Annunci `role="status"` / `role="alert"`                                                         |
| `.appbar` / `.tabbar`                         | Barra superiore e navigazione inferiore con safe area; da 900 px la navigazione sale nella barra |

## Movimento

`--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`, `--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1)`. Pressione 120 ms, sheet 280 ms in entrata, toast 200 ms. Il timbro è l'unico momento espressivo (scala 1,15 → 1 e rotazione in 220 ms). Calendario e agenda non animano. Con `prefers-reduced-motion` restano solo le dissolvenze.

## Immagini

Nessuna fotografia reale del negozio: la direzione si regge su tipografia, carta e logo. Le skill di design chiedevano almeno quattro foto; il brief vieta foto stock presentate come il negozio, quindi prevale il brief. Scatti reali che migliorerebbero il risultato sono elencati in `docs/STATO.md`.
