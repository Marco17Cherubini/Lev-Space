---
name: Lev Space
description: Prenotazioni del barbiere nel mondo dell'eliminacode, "Il tuo turno".
colors:
  led: '#ff4a1f'
  on-led: '#121214'
  panel: '#121214'
  panel-2: '#1f1f23'
  on-panel: '#ededea'
  on-panel-2: '#9a9aa0'
  accent-ink: '#c2320e'
  ground: '#efefec'
  paper: '#fafaf8'
  paper-2: '#e2e2de'
  ink: '#161618'
  ink-2: '#4a4a50'
  line: '#c9c9c4'
  field-line: '#85858a'
  dark-ground: '#0b0b0c'
  dark-paper: '#18181b'
  dark-paper-2: '#26262b'
  dark-ink: '#ededea'
  dark-ink-2: '#a3a3a9'
  dark-line: '#34343a'
  dark-accent-ink: '#ff6a45'
  dark-panel: '#050506'
  dark-panel-2: '#17171a'
typography:
  display:
    fontFamily: 'Archivo, Arial Narrow, Arial, sans-serif'
    fontSize: 'clamp(2rem, 1.5rem + 2.4vw, 3rem)'
    fontWeight: 800
    lineHeight: 1
    letterSpacing: '-0.01em'
    fontVariation: "'wdth' 72"
  headline:
    fontFamily: 'Archivo, Arial Narrow, Arial, sans-serif'
    fontSize: '1.375rem'
    fontWeight: 800
    lineHeight: 1
    fontVariation: "'wdth' 72"
  body:
    fontFamily: 'Archivo, Arial Narrow, Arial, sans-serif'
    fontSize: '1.0625rem'
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: 'Archivo, Arial Narrow, Arial, sans-serif'
    fontSize: '0.875rem'
    fontWeight: 750
    fontVariation: "'wdth' 86"
rounded:
  none: '0'
spacing:
  s1: '4px'
  s2: '8px'
  s3: '12px'
  s4: '16px'
  s5: '24px'
  s6: '32px'
  s7: '48px'
  s8: '72px'
  key-gap: '3px'
components:
  button-turn:
    backgroundColor: '{colors.led}'
    textColor: '{colors.on-led}'
    rounded: '{rounded.none}'
    height: '64px'
  button-primary:
    backgroundColor: '{colors.ink}'
    textColor: '{colors.paper}'
    rounded: '{rounded.none}'
    height: '48px'
    padding: '0 24px'
  key:
    backgroundColor: '{colors.paper-2}'
    textColor: '{colors.ink}'
    rounded: '{rounded.none}'
    height: '64px'
  key-lit:
    backgroundColor: '{colors.panel}'
    textColor: '{colors.on-panel}'
  ticket:
    backgroundColor: '{colors.paper}'
    textColor: '{colors.ink}'
    padding: '24px'
  tag-led:
    backgroundColor: '{colors.panel}'
    textColor: '{colors.on-panel}'
    padding: '2px 8px'
---

# Design System: Lev Space

Contesto di prodotto in [PRODUCT.md](PRODUCT.md). Token vivi in `frontend/styles/app.css`; superfici in `pages.css` (ingresso, cliente) e `admin.css` (operatore).

## Overview

**Creative North Star: "Il tuo turno"**

Lev Space esiste per sostituire la coda in bottega e le chiamate al telefono. Il suo mondo è quindi l'oggetto che da sempre governa la coda: l'**eliminacode**. Corpo nero, display a 7 segmenti, un grande tasto rosso, una fessura da cui esce un biglietto di carta termica. L'appuntamento è il tuo turno: lo prendi dal distributore invece di aspettarlo.

La metafora regge la struttura, non la decorazione. Il primo posto libero reale compare sul display; la giornata è una fila di tasti divisa in mattina e pomeriggio; la conferma è un biglietto che esce dalla fessura. L'agenda del barbiere è il pannello dell'operatore, dove gli stati si leggono dalla forma. Il rischio dichiarato è il kitsch retrò: niente bagliori, niente finto metallo, segmenti piatti.

**Key Characteristics:**

- Pannello nero + carta termica + un solo rosso LED.
- Una famiglia (Archivo variabile) in tre larghezze.
- Angoli vivi, tasti separati da fessure di 3px, piatto a riposo.
- Lo stato si legge da forma e testo, mai dal solo colore.

## Colors

Due materiali (carta e pannello) e una sola luce. Tema chiaro "carta termica" (bianco freddo, stampa grafite); tema scuro "pannello" (tutto diventa pannello, la carta diventa grafite), via `data-theme="dark"`.

### Primary

- **Rosso LED** (`led`): la luce del distributore. Riservato a: azione principale (Prendi il turno, Conferma), selezione accesa (spie di tasti, giorni, segmentati, levette), "adesso", focus ring, extra. Testo sopra: `on-led`.
- **Inchiostro rosso** (`accent-ink`; scuro `dark-accent-ink`): la versione del rosso che si legge come testo sulla carta: errori di campo, azioni distruttive a contorno, etichetta "Extra", oggi nella settimana.

### Neutral

- **Pannello** (`panel`, `panel-2`; scuro `dark-panel`, `dark-panel-2`): corpo del distributore. Barra superiore, tabbar, display, actionbar, toast, tasti accesi, blocchi prenotati. Testo `on-panel`, secondario `on-panel-2`.
- **Fondo** (`ground`) e **carta** (`paper`): pagina e superfici stampate (biglietto, scontrini, calendario, righe agenda).
- **Carta 2** (`paper-2`): il tasto a riposo, il gradino di tono.
- **Grafite** (`ink`, `ink-2`): stampa principale e secondaria.
- **Linea** (`line`, `field-line`): tratteggi della carta e bordi dei campi.

### Named Rules

**The Panel Is an Object Rule.** Il display resta nero in entrambi i temi: è un oggetto, non una superficie che segue il tema. Nel tema scuro il fondo (`dark-ground`) è più profondo della carta, e il pannello (`dark-panel`) più profondo ancora.

**The One Light Rule.** Il rosso LED compare solo per azione principale, selezione, adesso ed extra. Mai come decorazione, mai su due azioni concorrenti nella stessa schermata.

Contrasti verificati: LED su pannello 5,6:1 (6,3:1 sul nero del display); testo pannello su LED 5,6:1; `accent-ink` 4,9:1 sul fondo e 5,4:1 sulla carta; `dark-accent-ink` su carta scura 6,2:1; `on-panel-2` su pannello 6,7:1.

## Typography

**Font unico:** Archivo variabile (con Arial Narrow, Arial), self-hosted in `frontend/fonts/` (OFL), `font-display: swap`, nessuna richiesta esterna.

**Character:** la segnaletica condensata del distributore. Una sola famiglia; la gerarchia viene dalla larghezza (`font-stretch`), dal peso e dal maiuscolo.

### Hierarchy

- **Segnaletica / titoli** (800-900, larghezza 72%, interlinea 1): h1 `clamp(2rem, 1.5rem + 2.4vw, 3rem)`, h2 1.375rem, motto e tasto rosso in maiuscolo.
- **Comandi** (750-800, larghezza 86%): pulsanti, label dei campi, segmentati, levette, termini delle liste.
- **Testo** (400-700, larghezza 100%, 1.0625rem, interlinea 1.5, misura 34rem).
- **Etichette** (800, 72%, 0.875rem, maiuscolo, +0.02em): tag, nomi dei turni, giorni della settimana.
- **Cifre**: orari e numeri importanti sono cifre a 7 segmenti (vedi Components), il resto usa `tabular-nums`.

### Named Rules

**The Three Widths Rule.** 72% per segnaletica e titoli, 86% per i comandi, 100% per il testo. Le date in maiuscolo solo alla prima lettera ("Sabato 31 ottobre").

## Layout

Mobile first (base 360-390px). Gutter 16 → 24px (600px) → 40px (1024px); larghezza massima 76rem, agenda 90rem. Scala di spazi 4-8-12-16-24-32-48-72px. Bersagli tattili minimi 48px (44px nei pulsanti piccoli e nei giorni). Sotto 900px navigazione in tabbar fissa da 64px in fondo; da 900px la navigazione passa nella barra superiore. Le griglie di tasti (giorni, slot, settimana, agenda) usano fessure da 3px, non margini. Ingresso da 900px: logo e motto a sinistra, la macchina a destra.

## Elevation & Depth

Piatto a riposo. La profondità è tonale: carta sopra fondo, pannello nero come corpo. Ombra solo per ciò che galleggia davvero.

### Shadow Vocabulary

- **Float** (`0 18px 40px rgb(18 18 20 / 0.22), 0 2px 6px rgb(18 18 20 / 0.12)`; più densa nel tema scuro): sheet, toast, lista della ricerca cliente.
- **Ombre inset** non sono elevazione ma disegno: contorno dei tasti spenti, anello "adesso", doppia riga della serie, fondo della fessura.

## Shapes

Angoli vivi ovunque (raggio 0), anche spie e punti LED, che sono quadrati. Bordi di 2px. I tratteggi da 2px separano righe di carta (scontrini, testata e piede del biglietto). L'unica silhouette non rettangolare è il bordo strappato a denti del biglietto (maschera SVG di 16 × 10px).

## Components

### Display a 7 segmenti

Cifre disegnate in SVG (`display.js`): ogni cifra ha sempre tutti i segmenti, accesi pieni e spenti appena visibili (opacità 0.11; 0.07 in versione inchiostro sulla carta), leggero corsivo (-6°). I due punti restano accesi. Testo leggibile in `aria-label`. Nelle liste dense (agenda) i segmenti spenti si nascondono.

### Pannello e display

Il display è un riquadro nero con etichetta in maiuscolo `on-panel-2`, orario a segmenti LED, giorno e azioni. All'arrivo del dato si accende una volta su 88:88 (180ms), poi mostra il valore.

### Distributore (ingresso)

Pannello nero a tutta larghezza: logo e motto, display del primo turno libero reale, tasto rosso "Prendi il turno" (72px), e sotto la fessura nera.

### Tasti e file di tasti

Tasto a riposo: `paper-2`, 64px, spia quadrata da 7px spenta in alto a destra. Acceso (scelto, o i tasti successivi accesi da un gruppo di 2-3 persone): pannello nero, spia LED. Non disponibile: trasparente con contorno 2px e orario barrato. La giornata è divisa in file per turno (mattina | pomeriggio), ciascuna con nome e intervallo.

### Matrice dei giorni

Calendario a 7 colonne, fessure da 3px. Giorno con posti: tasto con punto LED in basso; pieno o chiuso: spento (opacità 0.4); oggi: contorno inset da 2px; scelto: pannello nero con cifra LED.

### Pulsanti

Rettangoli da 48px, bordo 2px. Principale inchiostro pieno; secondario a contorno; quieto sottolineato; distruttivo in `accent-ink`. Il tasto rosso del turno (64px, 72% maiuscolo) è uno per schermata. Occupato: quadratino lampeggiante a scatti.

### Segmentato e levetta

Segmentato: tasti affiancati con fessura 2px, il premuto è pannello nero con spia LED. Levetta 56 × 32px: spenta grigia; accesa nera con spia LED (VIP, BAN, turni, giorni aperti).

### Biglietto e fessura

Carta termica, testata e piede tratteggiati, orario grande a segmenti inchiostro, bordo inferiore strappato. Alla conferma esce dalla fessura nera.

### Scontrini, sheet, actionbar, toast, tag

- **Scontrino:** liste su carta, righe separate dal tratteggio (turni, clienti, report).
- **Sheet:** `dialog` nativo dal basso (mobile) o centrato (da 600px), testata nera da 8px, scrim scuro.
- **Actionbar:** striscia di pannello appiccicata sopra la tabbar con riepilogo e azione LED.
- **Toast:** pannello con quadratino (bianco; LED se errore).
- **Tag:** testo maiuscolo stretto su `paper-2`; variante pannello con spia LED.

### Agenda dell'operatore

Gli stati si leggono dalla forma: **prenotato** blocco pieno nero con nome; **libero** contorno tratteggiato con "Aggiungi"; **ferie** a righe diagonali con testo "Ferie"; **serie** doppia riga in testa al blocco; **adesso** anello LED da 3px; **extra** etichetta "Extra" in `accent-ink`. I numeri del report sono cifre LED su pannello.

### Movimento

Pressione: scala 0.92-0.97 in 120ms. Sheet 280ms (`cubic-bezier(0.32, 0.72, 0, 1)`). Stampa del biglietto 900ms `steps(9)`. Accensione 88:88 una volta. Salita d'ingresso (520ms, a cascata di 70ms) solo sulla pagina d'ingresso. Con `prefers-reduced-motion` tutto questo è rimosso; restano solo cambi di colore e opacità.

### Immagini

Solo il logo reale (pixel art bianco e nero, nato sul nero del pannello). Nessuna foto stock o generata presentata come il negozio.

## Do's and Don'ts

### Do:

- **Do** usare il pannello nero per ciò che è "la macchina" (barre, display, tasti accesi, blocchi prenotati) e la carta per ciò che è stampato.
- **Do** mostrare orari e numeri chiave con le cifre a 7 segmenti, segmenti spenti visibili.
- **Do** separare i tasti con fessure da 3px e tenere angoli vivi.
- **Do** dare a ogni stato una forma e un testo (pieno, tratteggiato, a righe, doppia riga, barrato, spia).
- **Do** rimuovere pressione, stampa, accensione e salita sotto `prefers-reduced-motion`.

### Don't:

- **Don't** aggiungere glow, bagliori o ombre colorate ai LED e ai segmenti.
- **Don't** usare gradienti; `linear-gradient` compare solo come tecnica di maschera del biglietto.
- **Don't** affidare uno stato al solo colore.
- **Don't** usare il rosso LED fuori da azione principale, selezione, adesso ed extra.
- **Don't** arrotondare angoli o aggiungere ombre a riposo.
- **Don't** usare foto che non siano del negozio, né una seconda famiglia di caratteri.
