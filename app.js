(() => {
  const form = document.querySelector('#patient-form');
  const rows = document.querySelector('#patient-rows');
  const count = document.querySelector('#patient-count');
  const showing = document.querySelector('#showing-count');
  const empty = document.querySelector('#empty-state');
  const search = document.querySelector('#patient-search');
  const priorityFilter = document.querySelector('#priority-filter');
  const message = document.querySelector('#form-message');
  const priorityError = document.querySelector('#priority-error');
  const submitButton = document.querySelector('#submit-button');
  const cancelEdit = document.querySelector('#cancel-edit');
  const toast = document.querySelector('#toast');
  const csvFile = document.querySelector('#csv-file');
  const importButton = document.querySelector('#import-csv-button');
  let activeEdit = null;
  let toastTimer;
  let currentUser = null;
  const get = (selector) => document.querySelector(selector);

  const loginScreen = get('#login-screen');
  const appMain = get('#inicio');
  const loginForm = get('#login-form');
  const quickConsultDialog = get('#quick-consult-dialog');
  const quickConsultForm = get('#quick-consult-form');
  const quickConsultResult = get('#quick-consult-result');

  const deleteDialog = get('#delete-dialog');
  const deleteForm = get('#delete-form');
  const deletePatientName = get('#delete-patient-name');
  const deletePatientDocHint = get('#delete-patient-doc-hint');
  const deleteConfirmInput = get('#delete-confirm-input');
  const deleteReason = get('#delete-reason');
  const deleteDialogError = get('#delete-dialog-error');
  const deleteDialogSubmit = get('#delete-dialog-submit');
  const deleteDialogClose = get('#delete-dialog-close');
  const deleteDialogCancel = get('#delete-dialog-cancel');
  let patientPendingDelete = null;

  function openDeleteModal(patient) {
    patientPendingDelete = patient;
    deletePatientName.textContent = patient.name;
    deletePatientDocHint.textContent = patient.document;
    deleteConfirmInput.value = '';
    deleteReason.value = '';
    deleteDialogError.textContent = '';
    deleteDialogSubmit.disabled = true;
    deleteDialog.showModal();
    deleteReason.focus();
  }

  function closeDeleteModal() {
    deleteDialog.close();
    patientPendingDelete = null;
    deleteForm.reset();
    deleteDialogError.textContent = '';
  }

  deleteDialogClose.addEventListener('click', closeDeleteModal);
  deleteDialogCancel.addEventListener('click', closeDeleteModal);
  deleteDialog.addEventListener('click', (event) => {
    if (event.target === deleteDialog) closeDeleteModal();
  });

  function validateDeleteInput() {
    if (!patientPendingDelete) return;
    const typed = deleteConfirmInput.value.trim().toLowerCase();
    const expected = patientPendingDelete.document.toLowerCase();
    const reasonSelected = Boolean(deleteReason.value);
    const matches = typed === expected;
    deleteDialogSubmit.disabled = !(matches && reasonSelected);
    if (!typed) {
      deleteDialogError.textContent = '';
    } else if (!matches) {
      deleteDialogError.textContent = 'El documento ingresado no coincide con el del paciente.';
    } else if (!reasonSelected) {
      deleteDialogError.textContent = 'Selecciona un motivo de eliminación.';
    } else {
      deleteDialogError.textContent = '';
    }
  }

  deleteConfirmInput.addEventListener('input', validateDeleteInput);
  deleteReason.addEventListener('change', validateDeleteInput);

  deleteForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!patientPendingDelete) return;
    const typed = deleteConfirmInput.value.trim().toLowerCase();
    const expected = patientPendingDelete.document.toLowerCase();
    if (typed !== expected) {
      deleteDialogError.textContent = 'El documento no coincide con el del paciente.';
      return;
    }
    if (!deleteReason.value) {
      deleteDialogError.textContent = 'Selecciona el motivo de la eliminación.';
      return;
    }
    const id = patientPendingDelete.id;
    try {
      await apiRequest(`/api/patients/${encodeURIComponent(id)}`, { method: 'DELETE' });
      patients = patients.filter((item) => item.id !== id);
      if (activeEdit === id) resetForm();
      closeDeleteModal();
      render();
      showToast('Registro eliminado de MongoDB.');
    } catch (error) {
      deleteDialogError.textContent = error.message;
    }
  });

  async function enterRole(user) {
    currentUser = user;
    loginScreen.hidden = true;
    appMain.hidden = false;
    get('#session-controls').hidden = false;
    get('#session-label').textContent = `${currentUser.fullName} · ${currentUser.roleName}`;
    get('#role-title').textContent = currentUser.roleName;
    const roleDescriptions = {
      admin: 'Administra cuentas, roles y registros del prototipo.',
      nurse: 'Registra pacientes y actualiza la información del proceso de triaje.',
      doctor: 'Consulta los registros y actualiza la atención médica.',
      patient: 'Consulta únicamente la información vinculada a su registro.'
    };
    get('#role-description').textContent = roleDescriptions[currentUser.role];
    get('#role-avatar').textContent = currentUser.roleName.charAt(0);
    const roleHeadings = {
      admin: ['Administración del sistema', 'Consulta los usuarios, roles y registros del prototipo.'],
      nurse: ['Registro y consulta de pacientes', 'Registra los datos del proceso de triaje y consulta la lista.'],
      doctor: ['Consulta y atención de pacientes', 'Revisa la información registrada y actualiza el estado de atención.'],
      patient: ['Consulta de estado', 'Consulta el estado vinculado a tu registro de triaje.']
    };
    get('#page-title').textContent = roleHeadings[currentUser.role][0];
    get('#page-description').textContent = roleHeadings[currentUser.role][1];
    document.body.dataset.role = currentUser.role;
    document.body.classList.remove('landing-mode');
    get('.topbar')?.classList.remove('is-floating');
    if (typeof window.scrollTo === 'function') window.scrollTo({ top: 0, behavior: 'auto' });

    const patientMode = currentUser.role === 'patient';
    get('#workspace').hidden = patientMode;
    get('#patient-view').hidden = !patientMode;
    get('#form-panel').hidden = !['admin', 'nurse'].includes(currentUser.role);
    get('#import-csv-button').hidden = !['admin', 'nurse'].includes(currentUser.role);
    get('#clear-records').hidden = currentUser.role !== 'admin';
    get('#list-panel').hidden = patientMode;
    get('#admin-users-panel').hidden = currentUser.role !== 'admin';
    render();
    try {
      await refreshPatients();
      if (currentUser.role === 'admin') await loadAdminDirectory();
    } catch (error) { showToast(error.message); }
  }

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const username = get('#login-user').value.trim();
    const password = get('#login-password').value;
    try {
      const user = await apiRequest('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
      get('#login-error').textContent = '';
      await enterRole(user);
    } catch (error) { get('#login-error').textContent = error.message; }
  });

  document.querySelectorAll('.account-choice').forEach((button) => {
    button.addEventListener('click', () => {
      get('#login-user').value = button.dataset.user;
      get('#login-password').value = button.dataset.password;
      get('#login-error').textContent = '';
      get('#login-password').focus();
    });
  });

  get('.brand').addEventListener('click', (event) => {
    if (!document.body.classList.contains('landing-mode')) return;
    event.preventDefault();
    get('.hero')?.scrollIntoView();
  });

  get('#logout-button').addEventListener('click', async () => {
    try { await apiRequest('/api/auth/logout', { method: 'POST' }); } catch { /* cerrar la vista local de todas formas */ }
    currentUser = null;
    delete document.body.dataset.role;
    document.body.classList.add('landing-mode');
    appMain.hidden = true;
    loginScreen.hidden = false;
    window.requestAnimationFrame(positionHeroMonitor);
    get('#session-controls').hidden = true;
    loginForm.reset();
    get('#login-error').textContent = '';
    resetForm();
    if (typeof window.scrollTo === 'function') window.scrollTo({ top: 0, behavior: 'auto' });
    window.requestAnimationFrame(updateLandingState);
  });

  // La demostración inicia vacía; los registros existen solo en memoria mientras esta pestaña está abierta.
  let patients = [];

  const safe = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
  const display = (value, fallback = '—') => value ? safe(value) : fallback;

  function quickConsultMarkup(patient) {
    const isPending = patient.careStatus === 'Pendiente';
    const cupoHtml = isPending
      ? `<div class="quick-cupo-banner">
          <div class="quick-cupo-number">Cupo #${patient.queuePosition ?? '—'}</div>
          <div class="quick-cupo-text">
            <strong>Turno de atención en espera</strong>
            <span>Nivel ${safe(patient.priority)} de triaje ${patient.totalWaiting ? `· Puesto ${patient.queuePosition} de ${patient.totalWaiting} pacientes en espera` : ''}</span>
          </div>
        </div>`
      : `<div class="quick-cupo-banner cupo-atendido">
          <div class="quick-cupo-number">✓ Atendido</div>
          <div class="quick-cupo-text">
            <strong>Atención médica completada</strong>
            <span>Médico: ${safe(patient.attendedBy?.name || patient.doctor || 'Asignado')}</span>
          </div>
        </div>`;

    const formatDate = (value) => value ? new Date(value).toLocaleString('es-CO') : '—';
    const showValue = (value) => value === 0 ? '0' : display(value);
    const details = [
      ['Documento', patient.document],
      ['Edad', patient.age == null ? '—' : `${patient.age} años`],
      ['Género', patient.gender],
      ['Nivel de triaje', `Nivel ${patient.priority}`],
      ['Estado de atención', patient.careStatus],
      ['Cupo en la fila', isPending ? (patient.queuePosition ? `Puesto #${patient.queuePosition} en espera` : 'En espera') : 'Atención finalizada'],
      ['Motivo o condición', patient.condition],
      ['Observaciones', patient.description],
      ['Presión arterial', patient.bloodPressure],
      ['Pulso', patient.pulse ? `${patient.pulse} lpm` : '—'],
      ['Frecuencia respiratoria', patient.respiratoryRate ? `${patient.respiratoryRate} rpm` : '—'],
      ['Temperatura', patient.temperature ? `${patient.temperature} °C` : '—'],
      ['Oxígeno', patient.oxygen ? `${patient.oxygen}%` : '—'],
      ['Médico', patient.attendedBy?.name || patient.doctor],
      ['Registró', patient.registeredBy?.name],
      ['Fecha de ingreso', formatDate(patient.createdAt)],
      ['Última actualización', formatDate(patient.updatedAt)]
    ];
    return `<article class="quick-result-card">
      <div class="quick-result-heading">
        <div>
          <p class="eyebrow">RESULTADO DE LA CONSULTA</p>
          <h3>${safe(patient.name)}</h3>
        </div>
        <span class="priority-badge">Nivel ${safe(patient.priority)}</span>
      </div>
      ${cupoHtml}
      <dl class="quick-detail-grid">${details.map(([label, value]) => `<div><dt>${safe(label)}</dt><dd>${showValue(value)}</dd></div>`).join('')}</dl>
      <button id="quick-consult-again" class="button button-outline" type="button" style="margin-top:10px">Consultar otro documento</button>
    </article>`;
  }

  get('#quick-consult-open').addEventListener('click', () => {
    quickConsultDialog.showModal();
    const docInput = get('#quick-consult-document');
    if (docInput) docInput.focus();
  });
  get('#quick-consult-close').addEventListener('click', () => quickConsultDialog.close());
  quickConsultDialog.addEventListener('click', (event) => {
    if (event.target === quickConsultDialog) quickConsultDialog.close();
  });
  quickConsultDialog.addEventListener('close', () => {
    quickConsultForm.reset();
    quickConsultForm.hidden = false;
    quickConsultResult.hidden = true;
    quickConsultResult.replaceChildren();
    get('#quick-consult-error').textContent = '';
  });
  quickConsultResult.addEventListener('click', (event) => {
    if (!event.target.closest('#quick-consult-again')) return;
    quickConsultResult.hidden = true;
    quickConsultResult.replaceChildren();
    quickConsultForm.hidden = false;
    const docInput = get('#quick-consult-document');
    if (docInput) {
      docInput.value = '';
      docInput.focus();
    }
  });
  quickConsultForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    get('#quick-consult-error').textContent = '';
    try {
      const patient = await apiRequest('/api/patients/quick-consult', {
        method: 'POST', body: JSON.stringify(data)
      });
      quickConsultResult.innerHTML = quickConsultMarkup(patient);
      quickConsultResult.hidden = false;
      quickConsultForm.hidden = true;
    } catch (error) {
      get('#quick-consult-error').textContent = error.message;
    }
  });

  async function apiRequest(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
    const payload = response.status === 204 ? null : await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload?.error || `Error de conexión (${response.status}).`);
    return payload;
  }

  async function refreshPatients() {
    if (currentUser?.role === 'patient') {
      const ownPatient = await apiRequest('/api/patients/mine');
      patients = ownPatient ? [ownPatient] : [];
    } else patients = await apiRequest('/api/patients');
    render();
  }

  async function loadAdminDirectory() {
    const [users, roles] = await Promise.all([apiRequest('/api/users'), apiRequest('/api/roles')]);
    get('#user-total').textContent = `${users.length} cuenta${users.length === 1 ? '' : 's'}`;
    get('#user-rows').innerHTML = users.map((user) => `<tr><td>${safe(user.fullName)}</td><td>${safe(user.username)}</td><td><span class="role-chip">${safe(user.roleName)}</span></td><td>${user.patientDocument ? safe(user.patientDocument) : '—'}</td></tr>`).join('');
    get('#role-cards').innerHTML = roles.map((role) => `<article class="role-card"><strong>${safe(role.name)}</strong><span>${safe(role.description)}</span></article>`).join('');
  }

  get('#new-user-role').addEventListener('change', (event) => {
    const patientRole = event.target.value === 'patient';
    get('#patient-link-field').hidden = !patientRole;
    get('#patient-link-field input').required = patientRole;
  });

  get('#create-user-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    if (currentUser?.role !== 'admin') return;
    const data = Object.fromEntries(new FormData(event.currentTarget).entries());
    try {
      await apiRequest('/api/users', { method: 'POST', body: JSON.stringify(data) });
      event.currentTarget.reset();
      get('#patient-link-field').hidden = true;
      get('#patient-link-field input').required = false;
      get('#create-user-message').textContent = 'Cuenta guardada en MongoDB.';
      await loadAdminDirectory();
    } catch (error) {
      get('#create-user-message').textContent = error.message;
      get('#create-user-message').style.color = '#b54746';
    }
  });

  function vitalMarkup(patient) {
    const vitals = [
      patient.bloodPressure && `TA ${patient.bloodPressure}`,
      patient.pulse && `Pulso ${patient.pulse} lpm`,
      patient.respiratoryRate && `FR ${patient.respiratoryRate} rpm`,
      patient.temperature && `${patient.temperature} °C`,
      patient.oxygen && `O₂ ${patient.oxygen}%`
    ].filter(Boolean);
    return vitals.length ? `<span class="vital-list">${vitals.map((v) => `<span>${safe(v)}</span>`).join('')}</span>` : '<span class="cell-secondary">Sin datos</span>';
  }

  function render() {
    const term = search.value.trim().toLocaleLowerCase('es');
    const selectedPriority = priorityFilter.value;
    const filtered = patients.filter((patient) => {
      const matchesTerm = !term || `${patient.name} ${patient.document}`.toLocaleLowerCase('es').includes(term);
      const matchesPriority = !selectedPriority || Number(patient.priority) === Number(selectedPriority);
      return matchesTerm && matchesPriority;
    }).sort((a, b) => Number(a.priority) - Number(b.priority) || a.name.localeCompare(b.name, 'es'));
    count.textContent = patients.length;
    get('#patient-count-label').textContent = patients.length === 1 ? 'paciente' : 'pacientes';
    showing.textContent = `Mostrando ${filtered.length} de ${patients.length} registros`;
    const canEdit = currentUser && ['admin', 'nurse'].includes(currentUser.role);
    const canDelete = currentUser && ['admin', 'nurse'].includes(currentUser.role);
    const canChangeStatus = currentUser && ['admin', 'nurse', 'doctor'].includes(currentUser.role);
    rows.innerHTML = filtered.map((patient) => `
      <tr data-id="${safe(patient.id)}">
        <td><span class="patient-name">${display(patient.name)}</span><span class="patient-sub">Registro de triaje</span></td>
        <td>${display(patient.document)}</td>
        <td>${display(patient.age)} años<span class="cell-secondary">${display(patient.gender)}</span></td>
        <td><span class="priority-badge">Nivel ${safe(patient.priority)}</span></td>
        <td><span class="cell-main">${display(patient.condition, 'Sin condición reportada')}</span><span class="cell-secondary">${display(patient.description, 'Sin observaciones')}</span><span class="cell-secondary">Registró: ${display(patient.registeredBy?.name, 'Sin dato')}</span></td>
        <td>${vitalMarkup(patient)}</td>
        <td>${canChangeStatus ? `<select class="status-select" data-status="${safe(patient.id)}" aria-label="Estado de atención de ${safe(patient.name)}"><option${patient.careStatus === 'Pendiente' ? ' selected' : ''}>Pendiente</option><option${patient.careStatus === 'Atendido' ? ' selected' : ''}>Atendido</option></select>` : `<span class="status-readonly">${safe(patient.careStatus)}</span>`}<span class="doctor-cell">Médico: ${display(patient.attendedBy?.name || patient.doctor, 'Por asignar')}</span></td>
        <td><div class="row-actions">${canEdit ? `<button class="icon-button edit" type="button" data-edit="${safe(patient.id)}" aria-label="Editar a ${safe(patient.name)}" title="Editar"><svg viewBox="0 0 24 24"><path d="m4 16.5-.8 4.3 4.3-.8L19.9 7.6a2 2 0 0 0-2.8-2.8L4 16.5Z"/><path d="m15.7 6.2 2.8 2.8"/></svg></button>` : ''}${canDelete ? `<button class="icon-button delete" type="button" data-delete="${safe(patient.id)}" aria-label="Eliminar a ${safe(patient.name)}" title="Eliminar"><svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></button>` : ''}</div></td>
      </tr>`).join('');
    empty.hidden = filtered.length > 0;
    if (filtered.length === 0) {
      get('#empty-state h3').textContent = patients.length ? 'Sin coincidencias' : 'No hay pacientes registrados';
      get('#empty-state p').textContent = patients.length ? 'Ajusta la búsqueda o el filtro de nivel.' : 'Agrega uno desde el formulario o importa varios desde un archivo CSV.';
    }
    document.querySelector('#table-wrap table').hidden = filtered.length === 0;
    if (currentUser?.role === 'patient') renderPatientTicket();
  }

  function renderPatientTicket() {
    const ownPatient = patients[0] || (currentUser?.patientDocument ? patients.find((p) => p.document.toLowerCase() === currentUser.patientDocument.toLowerCase()) : null);
    const ticket = get('#patient-ticket');
    if (!ownPatient) {
      ticket.innerHTML = '<div class="ticket-empty"><span class="ticket-icon">…</span><h3>Aún no hay un registro clínico asociado</h3><p>Tu cuenta de paciente está activa, pero no se encontró un registro de triaje con el documento ' + safe(currentUser?.patientDocument || currentUser?.username) + '.</p></div>';
      return;
    }

    const isPending = ownPatient.careStatus === 'Pendiente';
    const position = ownPatient.queuePosition;
    const cupoBanner = isPending
      ? `<div class="quick-cupo-banner" style="margin: 0 0 18px;">
          <div class="quick-cupo-number">Cupo #${position ?? '—'}</div>
          <div class="quick-cupo-text">
            <strong>Turno de atención en espera</strong>
            <span>Nivel ${safe(ownPatient.priority)} de triaje ${ownPatient.totalWaiting ? `· Puesto ${position} de ${ownPatient.totalWaiting} pacientes en espera` : ''}</span>
          </div>
        </div>`
      : `<div class="quick-cupo-banner cupo-atendido" style="margin: 0 0 18px;">
          <div class="quick-cupo-number">✓ Atendido</div>
          <div class="quick-cupo-text">
            <strong>Atención médica completada</strong>
            <span>Médico: ${safe(ownPatient.attendedBy?.name || ownPatient.doctor || 'Asignado')}</span>
          </div>
        </div>`;

    const vitalsList = [
      ownPatient.bloodPressure && `TA: ${ownPatient.bloodPressure}`,
      ownPatient.pulse && `Pulso: ${ownPatient.pulse} lpm`,
      ownPatient.respiratoryRate && `FR: ${ownPatient.respiratoryRate} rpm`,
      ownPatient.temperature && `Temp: ${ownPatient.temperature} °C`,
      ownPatient.oxygen && `O₂: ${ownPatient.oxygen}%`
    ].filter(Boolean);

    ticket.innerHTML = `
      <div class="ticket-card" style="width: min(100%, 640px);">
        <div class="ticket-top">
          <span class="ticket-icon">✓</span>
          <span class="priority-badge">Nivel ${safe(ownPatient.priority)}</span>
        </div>
        <p class="eyebrow">PACIENTE REGISTRADO</p>
        <h3 style="margin-bottom: 12px;">${safe(ownPatient.name)}</h3>
        ${cupoBanner}
        <div class="ticket-details" style="grid-template-columns: repeat(2, 1fr); gap: 12px 18px;">
          <div><span>Documento</span><strong>${display(ownPatient.document)}</strong></div>
          <div><span>Edad y Género</span><strong>${display(ownPatient.age)} años (${display(ownPatient.gender)})</strong></div>
          <div><span>Estado de atención</span><strong>${safe(ownPatient.careStatus)}</strong></div>
          <div><span>Médico asignado</span><strong>${display(ownPatient.attendedBy?.name || ownPatient.doctor, 'Por asignar')}</strong></div>
          <div style="grid-column: 1 / -1;"><span>Condición o motivo</span><strong>${display(ownPatient.condition, 'Sin motivo especificado')}</strong></div>
          <div style="grid-column: 1 / -1;"><span>Observaciones clínicas</span><strong>${display(ownPatient.description, 'Sin observaciones adicionales')}</strong></div>
          <div style="grid-column: 1 / -1;"><span>Signos vitales</span><strong>${vitalsList.length ? vitalsList.join(' · ') : 'Sin datos'}</strong></div>
        </div>
      </div>`;
  }

  function valuesFromForm() {
    const data = new FormData(form);
    return {
      id: activeEdit ?? `p-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: data.get('patientName').trim(), document: data.get('patientId').trim(),
      age: data.get('age'), gender: data.get('gender'), condition: data.get('condition').trim(),
      description: data.get('description').trim(), priority: data.get('priority'),
      bloodPressure: data.get('bloodPressure').trim(), pulse: data.get('pulse'),
      respiratoryRate: data.get('respiratoryRate'), temperature: data.get('temperature'),
      oxygen: data.get('oxygen'), careStatus: data.get('careStatus'),
      doctor: data.get('doctorName').trim() || 'Por asignar'
    };
  }

  function showToast(text) {
    toast.textContent = text;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2500);
  }

  function resetForm() {
    form.reset();
    get('#record-id').value = '';
    get('#form-title').textContent = 'Datos del paciente';
    activeEdit = null;
    submitButton.innerHTML = '<span class="button-plus" aria-hidden="true">+</span> Registrar paciente';
    cancelEdit.hidden = true;
    message.textContent = '';
    priorityError.textContent = '';
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!currentUser || !['admin', 'nurse'].includes(currentUser.role)) return;
    message.textContent = '';
    priorityError.textContent = '';
    if (!form.reportValidity()) return;
    const selectedPriority = form.querySelector('input[name="priority"]:checked');
    if (!selectedPriority) {
      priorityError.textContent = 'Selecciona el nivel asignado por el personal de salud.';
      form.querySelector('input[name="priority"]').focus();
      return;
    }
    const patient = valuesFromForm();
    const duplicate = patients.some((item) => item.document.toLowerCase() === patient.document.toLowerCase() && item.id !== activeEdit);
    if (duplicate) {
      message.textContent = 'Ya existe un registro con ese documento. Revisa la identificación.';
      message.style.color = '#b54746';
      get('#patient-id').focus();
      return;
    }
    message.style.color = '#12805f';
    try {
      if (activeEdit) {
        const updated = await apiRequest(`/api/patients/${encodeURIComponent(activeEdit)}`, { method: 'PUT', body: JSON.stringify(patient) });
        patients = patients.map((item) => item.id === activeEdit ? updated : item);
        showToast('Registro actualizado en MongoDB.');
      } else {
        const created = await apiRequest('/api/patients', { method: 'POST', body: JSON.stringify(patient) });
        patients.unshift(created);
        showToast('Paciente guardado en MongoDB.');
      }
      render();
      resetForm();
    } catch (error) {
      message.style.color = '#b54746';
      message.textContent = error.message;
    }
  });

  cancelEdit.addEventListener('click', resetForm);
  search.addEventListener('input', render);
  priorityFilter.addEventListener('change', render);

  rows.addEventListener('click', async (event) => {
    const editButton = event.target.closest('[data-edit]');
    const deleteButton = event.target.closest('[data-delete]');
    if (editButton) {
      if (!currentUser || !['admin', 'nurse'].includes(currentUser.role)) return;
      const patient = patients.find((item) => item.id === editButton.dataset.edit);
      if (!patient) return;
      activeEdit = patient.id;
      get('#patient-name').value = patient.name;
      get('#patient-id').value = patient.document;
      get('#patient-age').value = patient.age;
      get('#patient-gender').value = patient.gender;
      get('#patient-condition').value = patient.condition;
      get('#patient-description').value = patient.description;
      const radio = form.querySelector(`input[name="priority"][value="${patient.priority}"]`);
      if (radio) radio.checked = true;
      get('#vital-bp').value = patient.bloodPressure;
      get('#vital-pulse').value = patient.pulse;
      get('#vital-resp').value = patient.respiratoryRate;
      get('#vital-temp').value = patient.temperature;
      get('#vital-oxygen').value = patient.oxygen;
      get('#care-status').value = patient.careStatus;
      get('#doctor-name').value = patient.doctor === 'Por asignar' ? '' : patient.doctor;
      get('#record-id').value = patient.id;
      submitButton.innerHTML = 'Guardar cambios';
      cancelEdit.hidden = false;
      get('#form-title').textContent = 'Editar paciente';
      get('#patient-name').focus();
      return;
    }
    if (deleteButton) {
      if (!currentUser || !['admin', 'nurse'].includes(currentUser.role)) return;
      const patient = patients.find((item) => item.id === deleteButton.dataset.delete);
      if (!patient) return;
      openDeleteModal(patient);
      return;
    }
  });

  rows.addEventListener('change', async (event) => {
    const select = event.target.closest('[data-status]');
    if (!select) return;
    if (!currentUser || !['admin', 'nurse', 'doctor'].includes(currentUser.role)) return;
    const patient = patients.find((item) => item.id === select.dataset.status);
    if (!patient) return;
    const previousStatus = patient.careStatus;
    try {
      const updated = await apiRequest(`/api/patients/${encodeURIComponent(patient.id)}/status`, { method: 'PATCH', body: JSON.stringify({ careStatus: select.value }) });
      patients = patients.map((item) => item.id === patient.id ? updated : item);
      render();
      showToast('Estado de atención guardado en MongoDB.');
    } catch (error) {
      patient.careStatus = previousStatus;
      render();
      showToast(error.message);
    }
  });


  function parseCsv(text) {
    const clean = text.replace(/^\uFEFF/, '');
    const firstLine = clean.split(/\r?\n/, 1)[0] || '';
    const delimiter = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
    const records = [];
    let record = [], field = '', quoted = false;
    for (let i = 0; i < clean.length; i += 1) {
      const char = clean[i];
      if (quoted) {
        if (char === '"' && clean[i + 1] === '"') { field += '"'; i += 1; }
        else if (char === '"') quoted = false;
        else field += char;
      } else if (char === '"' && field.length === 0) quoted = true;
      else if (char === delimiter) { record.push(field.trim()); field = ''; }
      else if (char === '\n' || char === '\r') {
        if (char === '\r' && clean[i + 1] === '\n') i += 1;
        record.push(field.trim());
        if (record.some((value) => value !== '')) records.push(record);
        record = []; field = '';
      } else field += char;
    }
    record.push(field.trim());
    if (record.some((value) => value !== '')) records.push(record);
    return records;
  }

  function normalizeHeader(value) {
    return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  }

  const csvAliases = {
    name: ['nombre', 'nombre_paciente', 'paciente', 'patient_name'],
    document: ['documento', 'documento_cc', 'cc', 'identificacion', 'id', 'document_number'],
    age: ['edad', 'age'],
    gender: ['genero', 'sexo', 'gender'],
    condition: ['condicion', 'condicion_reportada', 'enfermedad', 'enfermedades_comunes', 'motivo', 'motivo_de_consulta'],
    description: ['descripcion', 'observaciones', 'description'],
    priority: ['nivel', 'nivel_de_triaje', 'nivel_de_emergencia', 'prioridad', 'priority', 'triage_level'],
    bloodPressure: ['tension', 'tension_arterial', 'presion_arterial', 'blood_pressure'],
    pulse: ['pulso', 'pulse'],
    respiratoryRate: ['frecuencia_respiratoria', 'fr', 'respiratory_rate'],
    temperature: ['temperatura', 'temperature'],
    oxygen: ['oxigeno', 'saturacion', 'saturacion_de_oxigeno', 'oxygen'],
    careStatus: ['estado_atencion', 'atencion', 'patient_attended', 'care_status'],
    doctor: ['medico', 'nombre_medico', 'doctor', 'doctor_name']
  };

  function importCsvFile(file) {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const rows = parseCsv(String(reader.result || ''));
        if (rows.length < 2) { showToast('El CSV no contiene filas de pacientes.'); return; }
        const headers = rows[0].map(normalizeHeader);
        const indexes = {};
        for (const [field, aliases] of Object.entries(csvAliases)) {
          indexes[field] = headers.findIndex((header) => aliases.includes(header));
        }
        const required = ['name', 'document', 'age', 'gender', 'priority'];
        const missing = required.filter((field) => indexes[field] < 0);
        if (missing.length) {
          showToast(`Faltan columnas obligatorias: ${missing.map((key) => ({name:'nombre',document:'documento',age:'edad',gender:'género',priority:'nivel'}[key])).join(', ')}.`);
          return;
        }
        const knownDocuments = new Set(patients.map((patient) => patient.document.toLowerCase()));
        const imported = [];
        let skipped = 0;
        rows.slice(1).forEach((row, rowIndex) => {
          const getValue = (key) => indexes[key] < 0 ? '' : String(row[indexes[key]] ?? '').trim();
          const age = Number(getValue('age'));
          const priority = Number(getValue('priority').replace(/^nivel\s*/i, ''));
          const document = getValue('document');
          const name = getValue('name');
          const gender = getValue('gender');
          if (!name || !document || !gender || !Number.isInteger(age) || age < 0 || age > 120 || !Number.isInteger(priority) || priority < 1 || priority > 5 || knownDocuments.has(document.toLowerCase())) {
            skipped += 1;
            return;
          }
          knownDocuments.add(document.toLowerCase());
          const status = getValue('careStatus').toLocaleLowerCase('es');
          imported.push({
            id: `csv-${Date.now()}-${rowIndex}-${Math.random().toString(36).slice(2, 6)}`,
            name, document, age: String(age), gender,
            condition: getValue('condition'), description: getValue('description'), priority: String(priority),
            bloodPressure: getValue('bloodPressure'), pulse: getValue('pulse'),
            respiratoryRate: getValue('respiratoryRate'), temperature: getValue('temperature'), oxygen: getValue('oxygen'),
            careStatus: ['atendido', 'si', 'sí', 'true'].includes(status) ? 'Atendido' : 'Pendiente',
            doctor: getValue('doctor') || 'Por asignar'
          });
        });
        const result = imported.length
          ? await apiRequest('/api/patients/import', { method: 'POST', body: JSON.stringify({ patients: imported }) })
          : { inserted: 0, skipped: 0 };
        await refreshPatients();
        const skippedTotal = skipped + result.skipped;
        const summary = result.inserted ? `Se guardaron ${result.inserted} pacientes en MongoDB${skippedTotal ? `; se omitieron ${skippedTotal} filas inválidas o duplicadas` : ''}.` : `No se guardaron pacientes; ${skippedTotal} filas inválidas o duplicadas.`;
        showToast(summary);
      } catch (error) {
        showToast('No se pudo leer el archivo. Revisa que sea un CSV válido.');
      } finally {
        csvFile.value = '';
      }
    };
    reader.onerror = () => showToast('No se pudo abrir el archivo CSV.');
    reader.readAsText(file, 'UTF-8');
  }

  importButton.addEventListener('click', () => {
    if (currentUser && ['admin', 'nurse'].includes(currentUser.role)) csvFile.click();
  });
  csvFile.addEventListener('change', () => {
    const file = csvFile.files && csvFile.files[0];
    if (file) importCsvFile(file);
  });

  document.querySelector('#clear-records').addEventListener('click', async () => {
    if (!currentUser || currentUser.role !== 'admin') return;
    if (!patients.length) { showToast('La lista ya está vacía.'); return; }
    if (!window.confirm('¿Limpiar todos los registros de esta demostración?')) return;
    try {
      await apiRequest('/api/patients', { method: 'DELETE' });
      patients = [];
      resetForm();
      render();
      showToast('Registros eliminados de MongoDB.');
    } catch (error) { showToast(error.message); }
  });

  // Coloca el panel de monitoreo sobre la pantalla del computador del fondo.
  const heroSection = get('.hero');
  const heroVisual = get('#panel-demostracion.hero-visual');
  const heroDesktop = window.matchMedia('(min-width: 1201px)');

  function solveHomography(source, target) {
    const a = [];
    const b = [];
    for (let i = 0; i < 4; i += 1) {
      const [x, y] = source[i];
      const [u, v] = target[i];
      a.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
      b.push(u);
      a.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
      b.push(v);
    }
    for (let col = 0; col < 8; col += 1) {
      let pivot = col;
      for (let row = col + 1; row < 8; row += 1) {
        if (Math.abs(a[row][col]) > Math.abs(a[pivot][col])) pivot = row;
      }
      if (Math.abs(a[pivot][col]) < 1e-9) return null;
      [a[col], a[pivot]] = [a[pivot], a[col]];
      [b[col], b[pivot]] = [b[pivot], b[col]];
      const divisor = a[col][col];
      for (let k = col; k < 8; k += 1) a[col][k] /= divisor;
      b[col] /= divisor;
      for (let row = 0; row < 8; row += 1) {
        if (row === col) continue;
        const factor = a[row][col];
        if (!factor) continue;
        for (let k = col; k < 8; k += 1) a[row][k] -= factor * a[col][k];
        b[row] -= factor * b[col];
      }
    }
    return b;
  }

  function positionHeroMonitor() {
    if (!heroSection || !heroVisual) return;
    if (!heroDesktop.matches) {
      heroVisual.classList.remove('is-positioned');
      heroVisual.style.transform = '';
      return;
    }
    const heroWidth = heroSection.clientWidth;
    const heroHeight = heroSection.clientHeight;
    if (!heroWidth || !heroHeight) return;
    // Mismas medidas y encuadre que background-size: cover / right center.
    const imageWidth = 1672;
    const imageHeight = 941;
    const scale = Math.max(heroWidth / imageWidth, heroHeight / imageHeight);
    const offsetX = heroWidth - imageWidth * scale;
    const offsetY = (heroHeight - imageHeight * scale) / 2;
    // Esquina de la pantalla del monitor dentro de la fotografía.
    const screen = [
      [1076, 348],
      [1652, 268],
      [1621, 789],
      [1023, 733]
    ].map(([x, y]) => [x * scale + offsetX, y * scale + offsetY]);
    const source = [[0, 0], [560, 0], [560, 460], [0, 460]];
    const h = solveHomography(source, screen);
    if (!h) return;
    const matrix = [h[0], h[3], 0, h[6], h[1], h[4], 0, h[7], 0, 0, 1, 0, h[2], h[5], 0, 1];
    heroVisual.style.transform = `matrix3d(${matrix.map((value) => Number(value.toFixed(8))).join(',')})`;
    heroVisual.classList.add('is-positioned');
  }

  if (heroVisual) {
    positionHeroMonitor();
    window.addEventListener('resize', positionHeroMonitor);
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(positionHeroMonitor).catch(() => {});
    }
    if (window.ResizeObserver && heroSection) {
      new ResizeObserver(positionHeroMonitor).observe(heroSection);
    }
  }

  // Portada: navegación suave, estado del topbar y formulario de contacto.
  const topbar = get('.topbar');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const landingSections = ['hero-inicio', 'caracteristicas', 'beneficios', 'acceso', 'contacto'];

  function updateLandingState() {
    if (!topbar || !document.body.classList.contains('landing-mode')) return;
    topbar.classList.toggle('is-floating', window.scrollY > 36);
    let current = 'hero-inicio';
    for (const id of landingSections) {
      const section = document.getElementById(id);
      if (section && section.getBoundingClientRect().top <= 132) current = id;
    }
    document.querySelectorAll('.public-nav a').forEach((link) => {
      link.classList.toggle('is-active', link.getAttribute('href') === `#${current}`);
    });
    const loginLink = document.querySelector('.public-login');
    if (loginLink) loginLink.classList.toggle('is-active', current === 'acceso');
  }

  function goToSection(target, focusLogin) {
    if (!target) return;
    target.scrollIntoView({ behavior: reduceMotion.matches ? 'auto' : 'smooth', block: 'start' });
    if (focusLogin) {
      window.setTimeout(() => {
        const input = get('#login-user');
        if (input) input.focus({ preventScroll: true });
      }, reduceMotion.matches ? 40 : 700);
    }
  }

  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener('click', (event) => {
      const hash = link.getAttribute('href');
      const target = hash && hash.length > 1 ? document.querySelector(hash) : null;
      if (!target) return;
      event.preventDefault();
      goToSection(target, hash === '#acceso');
      if (window.history && window.history.replaceState) window.history.replaceState(null, '', hash);
    });
  });

  window.addEventListener('scroll', updateLandingState, { passive: true });
  window.addEventListener('resize', updateLandingState);

  const contactForm = get('#contact-form');
  if (contactForm) {
    contactForm.addEventListener('submit', (event) => {
      event.preventDefault();
      const name = get('#contact-name').value.trim();
      const email = get('#contact-email').value.trim();
      const message = get('#contact-message').value.trim();
      const error = get('#contact-error');
      const status = get('#contact-status');
      error.textContent = '';
      status.textContent = '';
      if (!name || !email || !message) {
        error.textContent = 'Completa tu nombre, correo y mensaje para continuar.';
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
        error.textContent = 'Escribe un correo electrónico válido.';
        return;
      }
      const subject = encodeURIComponent(`Contacto trIAje · ${name}`);
      const body = encodeURIComponent(`${message}\n\n${name} · ${email}`);
      status.textContent = `Gracias, ${name}. Abrimos tu cliente de correo con el mensaje listo para enviar.`;
      showToast('Mensaje preparado en tu cliente de correo.');
      const mail = document.createElement('a');
      mail.href = `mailto:contacto@triaje.example?subject=${subject}&body=${body}`;
      mail.click();
      contactForm.reset();
    });
  }

  updateLandingState();

  render();
  (async () => {
    const state = get('#db-state');
    try {
      await apiRequest('/api/health');
      state.textContent = 'MongoDB local conectado';
      try {
        const user = await apiRequest('/api/auth/me');
        await enterRole(user);
      } catch (error) {
        if (!error.message.includes('sesión activa')) throw error;
      }
    } catch (error) {
      state.textContent = 'Base de datos desconectada';
      state.title = 'Inicia MongoDB y abre la página desde npm start.';
      console.error('No se pudo cargar la lista desde MongoDB:', error);
      showToast('No se pudo conectar con MongoDB. Revisa que el servidor esté iniciado.');
    }
  })();
})();
