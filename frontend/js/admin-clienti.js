// Clienti: ricerca, filtri e stato VIP / sospensione (BAN). Ogni interruttore invia
// il valore esplicito (PUT { vip: true }): un doppio tocco o un retry non invertono lo
// stato. La sospensione chiede conferma, la riattivazione no.
(async function () {
  if (!(await requireAuth({ admin: true }))) return;

  const list = document.querySelector('[data-clients]');
  const search = document.getElementById('client-search');
  const result = document.querySelector('[data-result]');
  let users = [];

  const isOn = value => value === true || value === '1' || value === 1;
  const filterValue = () => document.querySelector('[data-filter] input:checked').value;

  async function load() {
    try {
      users = (await apiRequest('/admin/users', { sessionRequired: true })).users.map(u => ({
        ...u,
        vip: isOn(u.vip),
        banned: isOn(u.banned),
        guest: isOn(u.isGuest)
      }));
      users.sort((a, b) => `${a.cognome} ${a.nome}`.localeCompare(`${b.cognome} ${b.nome}`, 'it'));
      render();
    } catch (error) {
      list.innerHTML = `<li class="state"><p>${escapeHtml(error.message)}</p></li>`;
    }
  }

  function counts() {
    const vip = users.filter(u => u.vip).length;
    const banned = users.filter(u => u.banned).length;
    const guests = users.filter(u => u.guest).length;
    const n = (count, one, many) => `${count} ${count === 1 ? one : many}`;
    document.querySelector('[data-counts]').textContent = [
      n(users.length, 'cliente', 'clienti'),
      `${vip} VIP`,
      n(banned, 'sospeso', 'sospesi'),
      n(guests, 'ospite senza account', 'ospiti senza account')
    ].join(' · ');
  }

  function render() {
    counts();
    const q = search.value.trim().toLowerCase();
    const filter = filterValue();
    const shown = users.filter(u => {
      const text = `${u.nome} ${u.cognome} ${u.cognome} ${u.nome} ${u.email}`.toLowerCase();
      if (q && !text.includes(q)) return false;
      if (filter === 'vip') return u.vip;
      if (filter === 'banned') return u.banned;
      if (filter === 'guest') return u.guest;
      return true;
    });
    result.textContent = q || filter !== 'all' ? `${shown.length} risultati` : '';
    if (shown.length === 0) {
      list.innerHTML = '<li class="state"><p>Nessun cliente corrisponde alla ricerca.</p></li>';
      return;
    }
    list.innerHTML = shown
      .map(u => {
        const id = encodeURIComponent(u.email);
        const tags = [
          u.guest ? '<span class="tag">Ospite</span>' : '',
          u.banned ? '<span class="tag tag--accent">Sospeso</span>' : ''
        ].join('');
        return `<li class="client${u.banned ? ' is-banned' : ''}">
            <div class="client__who">
              <p class="client__name">${escapeHtml(`${u.cognome} ${u.nome}`)} ${tags}</p>
              <p class="client__contact muted">${escapeHtml(u.email)}${u.telefono ? ` · <a href="tel:${escapeHtml(u.telefono.replace(/\s/g, ''))}">${escapeHtml(u.telefono)}</a>` : ''}</p>
            </div>
            <div class="client__flags">
              <label class="switch"><input type="checkbox" role="switch" data-flag="vip" data-email="${id}" ${u.vip ? 'checked' : ''} />VIP</label>
              <label class="switch switch--danger"><input type="checkbox" role="switch" data-flag="banned" data-email="${id}" ${u.banned ? 'checked' : ''} />Sospeso</label>
            </div>
          </li>`;
      })
      .join('');
  }

  list.addEventListener('change', async event => {
    const input = event.target.closest('[data-flag]');
    if (!input) return;
    const email = decodeURIComponent(input.dataset.email);
    const flag = input.dataset.flag;
    const value = input.checked;
    const user = users.find(u => u.email === email);
    const name = `${user.nome} ${user.cognome}`;

    if (flag === 'banned' && value) {
      const ok = await Sheet.confirm({
        title: `Sospendere ${name}?`,
        message:
          'Non potrà più accedere né prenotare, nemmeno come ospite con questa email. Le sessioni aperte si chiudono subito. Gli appuntamenti già fissati restano in agenda.',
        confirmLabel: 'Sì, sospendi'
      });
      if (!ok) {
        input.checked = false;
        return;
      }
    }

    input.disabled = true;
    try {
      const response = await apiRequest(`/admin/users/${encodeURIComponent(email)}/${flag}`, {
        ...jsonBody('PUT', { [flag]: value }),
        sessionRequired: true
      });
      user[flag] = response[flag];
      const labels = {
        vip: value ? `${name} è VIP` : `${name} non è più VIP`,
        banned: value ? `${name} è sospeso` : `${name} può di nuovo prenotare`
      };
      showToast(labels[flag], 'success');
      render();
    } catch (error) {
      input.checked = !value;
      input.disabled = false;
      showToast(error.message);
    }
  });

  search.addEventListener('input', render);
  document
    .querySelectorAll('[data-filter] input')
    .forEach(r => r.addEventListener('change', render));
  load();
})();
