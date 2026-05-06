const getSavedLanguage = () => localStorage.getItem('siteLanguage') || 'ro';
const initialLanguage = getSavedLanguage();

document.documentElement.lang = initialLanguage;

const menuToggleLabels = {
  ro: { more: 'Mai mult', hide: 'Ascunde' },
  en: { more: 'More', hide: 'Hide' }
};

const siteSettings = {
  phone: {
    display: '0770 653 482',
    tel: '0770653482',
    whatsappUrl: 'https://wa.me/40770653482'
  },
  links: {
    wolt: '',
    glovo: '',
    instagram: '',
    facebook: ''
  },
  openingHours: [],
  menuCategories: []
};

const authEndpoint = 'api/auth.php';
const settingsEndpoint = 'api/settings.php';
const pendingScrollTargetKey = 'pendingScrollTarget';
const localMenuCategoriesKey = 'menuCategories';
const navLockDuration = 850;

let lockedNavTargetId = '';
let lockedNavTimerId = null;
let suppressNextGalleryClick = false;
let adminSession = {
  authenticated: false,
  admin: null
};

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function interpolateSiteSettings(value) {
  return value.replaceAll('{{phone}}', siteSettings.phone.display);
}

function loadLocalMenuCategories() {
  try {
    const categories = JSON.parse(localStorage.getItem(localMenuCategoriesKey) || '[]');
    return Array.isArray(categories) ? categories : [];
  } catch (error) {
    return [];
  }
}

function saveLocalMenuCategories(categories) {
  localStorage.setItem(localMenuCategoriesKey, JSON.stringify(categories));
}

function addLocalMenuCategory(category) {
  const nextCategory = {
    id: Date.now(),
    traditionalName: String(category.traditional_name || '').trim(),
    romanianName: String(category.romanian_name || '').trim(),
    englishName: String(category.english_name || '').trim()
  };

  siteSettings.menuCategories = [...siteSettings.menuCategories, nextCategory];
  saveLocalMenuCategories(siteSettings.menuCategories);
  return nextCategory;
}

async function readJsonResponse(response) {
  const text = await response.text();

  try {
    return text ? JSON.parse(text) : {};
  } catch (error) {
    throw new Error('Serverul nu a returnat JSON valid. Categoria a fost salvata local.');
  }
}

function getMenuCategoryParts(category) {
  return [
    category.traditionalName,
    category.romanianName,
    category.englishName
  ].map(value => String(value || '').trim()).filter(Boolean);
}

function getMenuCategoryTitle(category) {
  return getMenuCategoryParts(category).join(' | ');
}

function renderMenuCategories() {
  const container = document.querySelector('[data-menu-content]');
  if (!container) {
    return;
  }

  if (!siteSettings.menuCategories.length) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = siteSettings.menuCategories.map((category, index) => {
    const title = getMenuCategoryTitle(category);

    return `
      <section class="menu-category" id="${slugify(title) || `category-${index + 1}`}">
        <h2 class="category-title" data-ro="${escapeHtml(title)}" data-en="${escapeHtml(title)}">${escapeHtml(title)}</h2>
      </section>
    `;
  }).join('');
}

function renderAdminCategoryList() {
  const list = document.querySelector('[data-admin-category-list]');
  if (!list) {
    return;
  }

  if (!siteSettings.menuCategories.length) {
    list.innerHTML = `<p class="admin-category-empty">Nu exista categorii adaugate.</p>`;
    return;
  }

  list.innerHTML = siteSettings.menuCategories.map(category => `
    <div class="admin-category-item">
      <span>${escapeHtml(getMenuCategoryTitle(category))}</span>
    </div>
  `).join('');
}

function applySiteSettings() {
  document.querySelectorAll('[data-site-phone-text]').forEach(element => {
    element.textContent = siteSettings.phone.display;
  });

  document.querySelectorAll('[data-site-phone-tel]').forEach(element => {
    element.href = `tel:${siteSettings.phone.tel}`;
  });

  document.querySelectorAll('[data-site-phone-whatsapp]').forEach(element => {
    element.href = siteSettings.phone.whatsappUrl;
  });

  document.querySelectorAll('[data-site-wolt]').forEach(element => {
    if (siteSettings.links.wolt) {
      element.href = siteSettings.links.wolt;
    }
  });

  document.querySelectorAll('[data-site-glovo]').forEach(element => {
    if (siteSettings.links.glovo) {
      element.href = siteSettings.links.glovo;
    }
  });

  document.querySelectorAll('[data-site-instagram]').forEach(element => {
    element.href = siteSettings.links.instagram || '#';
    element.hidden = !siteSettings.links.instagram;
  });

  document.querySelectorAll('[data-site-facebook]').forEach(element => {
    element.href = siteSettings.links.facebook || '#';
    element.hidden = !siteSettings.links.facebook;
  });
}

async function loadSiteSettings() {
  try {
    const response = await fetch(settingsEndpoint, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' }
    });

    if (!response.ok) {
      throw new Error('Settings unavailable');
    }

    const data = await response.json();
    if (data.phone) {
      siteSettings.phone.display = data.phone.display || siteSettings.phone.display;
      siteSettings.phone.tel = data.phone.tel || siteSettings.phone.tel;
      siteSettings.phone.whatsappUrl = data.phone.whatsappUrl || siteSettings.phone.whatsappUrl;
    }

    if (data.links) {
      siteSettings.links.wolt = data.links.wolt || siteSettings.links.wolt;
      siteSettings.links.glovo = data.links.glovo || siteSettings.links.glovo;
      siteSettings.links.instagram = data.links.instagram || '';
      siteSettings.links.facebook = data.links.facebook || '';
    }

    if (Array.isArray(data.openingHours)) {
      siteSettings.openingHours = data.openingHours;
    }

    if (Array.isArray(data.menuCategories)) {
      siteSettings.menuCategories = data.menuCategories;
    }
  } catch (error) {
    // Keep static defaults when PHP is unavailable, for example when the file is opened directly.
  }

  if (!siteSettings.menuCategories.length) {
    siteSettings.menuCategories = loadLocalMenuCategories();
  }
}

function getOpeningHourByDay(dayIndex) {
  return siteSettings.openingHours.find(hour => Number(hour.dayIndex) === Number(dayIndex));
}

function formatHourLabel(hour) {
  if (!hour) {
    return '';
  }

  if (hour.isClosed) {
    return (document.documentElement.lang || 'ro') === 'en' ? 'Closed' : 'Inchis';
  }

  const openTime = String(hour.openTime || '').slice(0, 5);
  const closeTime = String(hour.closeTime || '').slice(0, 5);

  if (!openTime || !closeTime) {
    return '';
  }

  const clean = value => value.endsWith(':00') ? value.slice(0, 2) : value;
  return `${clean(openTime)}-${clean(closeTime)}`;
}

function applyOpeningHours() {
  document.querySelectorAll('[data-hours-row]').forEach(row => {
    const hour = getOpeningHourByDay(row.dataset.dayIndex);
    if (!hour) {
      return;
    }

    const dayLabel = row.querySelector('[data-ro][data-en]');
    const timeLabel = row.querySelector('[data-hours-time]');

    if (dayLabel) {
      dayLabel.dataset.ro = hour.dayNameRo || dayLabel.dataset.ro || '';
      dayLabel.dataset.en = hour.dayNameEn || dayLabel.dataset.en || '';
      dayLabel.textContent = dayLabel.dataset[document.documentElement.lang || 'ro'] || dayLabel.dataset.ro;
    }

    if (timeLabel) {
      timeLabel.textContent = formatHourLabel(hour);
    }

    row.classList.toggle('is-closed', Boolean(hour.isClosed));
  });
}

function updateContactHours() {
  const panel = document.querySelector('[data-hours-panel]');
  if (!panel) {
    return;
  }

  const todayIndex = new Date().getDay();
  const currentRow = panel.querySelector(`[data-hours-row][data-day-index="${todayIndex}"]`);
  const currentDay = panel.querySelector('[data-hours-current-day]');
  const currentTime = panel.querySelector('[data-hours-current-time]');

  if (!currentRow || !currentDay || !currentTime) {
    return;
  }

  const dayLabel = currentRow.querySelector('[data-ro][data-en]');
  const timeLabel = currentRow.querySelector('[data-hours-time]');

  currentDay.textContent = dayLabel?.textContent || '';
  currentTime.textContent = timeLabel?.textContent || '';

  panel.querySelectorAll('[data-hours-row]').forEach(row => {
    row.classList.toggle('is-current', row === currentRow);
  });
}

function initContactHours() {
  const panel = document.querySelector('[data-hours-panel]');
  if (!panel) {
    return;
  }

  const toggle = panel.querySelector('[data-hours-toggle]');
  const list = panel.querySelector('[data-hours-list]');
  const closeButton = panel.querySelector('[data-hours-close]');
  let closeTimerId = null;

  if (!toggle || !list) {
    return;
  }

  const openHours = () => {
    window.clearTimeout(closeTimerId);
    list.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    window.requestAnimationFrame(() => list.classList.add('is-open'));
  };

  const closeHours = () => {
    toggle.setAttribute('aria-expanded', 'false');
    list.classList.remove('is-open');
    window.clearTimeout(closeTimerId);
    closeTimerId = window.setTimeout(() => {
      list.hidden = true;
    }, 340);
  };

  toggle.addEventListener('click', () => {
    if (toggle.getAttribute('aria-expanded') === 'true') {
      closeHours();
    } else {
      openHours();
    }
  });

  closeButton?.addEventListener('click', closeHours);

  updateContactHours();
}

function setLanguage(lang) {
  document.documentElement.lang = lang;
  renderMenuCategories();
  renderAdminCategoryList();

  document.querySelectorAll('[data-ro-html][data-en-html]').forEach(element => {
    const value = element.dataset[`${lang}Html`];
    if (value === undefined) return;

    element.innerHTML = interpolateSiteSettings(value);
  });

  document.querySelectorAll('[data-ro][data-en]').forEach(element => {
    if (element.tagName === 'META') return;

    const rawValue = element.dataset[lang];
    if (rawValue === undefined) return;

    const value = interpolateSiteSettings(rawValue);

    if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
      element.value = value;
    } else {
      element.textContent = value;
    }
  });

  const pageTitle = document.querySelector('title');
  if (pageTitle?.dataset[lang]) {
    pageTitle.textContent = pageTitle.dataset[lang];
  }

  const metaDescription = document.querySelector('meta[name="description"]');
  if (metaDescription?.dataset[lang]) {
    metaDescription.content = interpolateSiteSettings(metaDescription.dataset[lang]);
  }

  document.querySelectorAll('.lang-btn').forEach(button => {
    button.classList.toggle('active', button.dataset.lang === lang);
  });

  document.querySelectorAll('.expand-btn').forEach(button => {
    const expanded = button.closest('.menu-card')?.dataset.expanded === 'true';
    button.textContent = expanded ? menuToggleLabels[lang].hide : menuToggleLabels[lang].more;
  });

  applyOpeningHours();
  updateContactHours();
  updateMenuJumpDropdown(lang);
  renderAdminDropdowns();

  localStorage.setItem('siteLanguage', lang);
}

function initLanguageSwitcher() {
  document.querySelectorAll('.lang-btn').forEach(button => {
    button.addEventListener('click', () => setLanguage(button.dataset.lang));
  });

  setLanguage(getSavedLanguage());
}

async function refreshAdminSession() {
  try {
    const response = await fetch(authEndpoint, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' }
    });

    if (!response.ok) {
      throw new Error('Auth status failed');
    }

    const data = await response.json();
    adminSession = {
      authenticated: Boolean(data.authenticated),
      admin: data.admin || null
    };
  } catch (error) {
    adminSession = {
      authenticated: false,
      admin: null
    };
  }

  renderAdminDropdowns();
  return adminSession;
}

function renderAdminDropdowns() {
  const lang = document.documentElement.lang || 'ro';
  const isRomanian = lang === 'ro';

  document.querySelectorAll('[data-admin-dropdown]').forEach(dropdown => {
    if (adminSession.authenticated) {
      const username = escapeHtml(adminSession.admin?.username || 'admin');
      dropdown.innerHTML = `
        <div class="admin-dropdown-header">
          <span>${isRomanian ? 'Conectat ca' : 'Signed in as'}</span>
          <strong>${username}</strong>
        </div>
        <a class="admin-dropdown-action" href="admin.html" data-admin-profile>${isRomanian ? 'Profil admin' : 'Admin profile'}</a>
        <button type="button" class="admin-dropdown-action admin-dropdown-logout" data-admin-logout>${isRomanian ? 'Logout' : 'Log out'}</button>
      `;
      return;
    }

    dropdown.innerHTML = `
      <div class="admin-dropdown-header">
        <span>${isRomanian ? 'Admin panel' : 'Admin panel'}</span>
        <strong>${isRomanian ? 'Autentificare necesara' : 'Login required'}</strong>
      </div>
      <a class="admin-dropdown-action admin-dropdown-login" href="admin-login.html">${isRomanian ? 'Login' : 'Log in'}</a>
    `;
  });
}

function closeAdminDropdowns(exceptWrapper = null) {
  document.querySelectorAll('[data-admin-menu]').forEach(wrapper => {
    if (wrapper === exceptWrapper) {
      return;
    }

    wrapper.classList.remove('open');
    wrapper.querySelector('[data-admin-trigger]')?.setAttribute('aria-expanded', 'false');
    const dropdown = wrapper.querySelector('[data-admin-dropdown]');
    if (dropdown) {
      dropdown.hidden = true;
    }
  });
}

function toggleAdminDropdown(wrapper) {
  const trigger = wrapper.querySelector('[data-admin-trigger]');
  const dropdown = wrapper.querySelector('[data-admin-dropdown]');
  const shouldOpen = !wrapper.classList.contains('open');

  closeAdminDropdowns(wrapper);
  wrapper.classList.toggle('open', shouldOpen);
  trigger?.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');

  if (dropdown) {
    dropdown.hidden = !shouldOpen;
  }

  if (shouldOpen) {
    renderAdminDropdowns();
    dropdown?.querySelector('input, button, a')?.focus();
  }
}

async function submitAdminLogin(form, options = {}) {
  const message = form.querySelector('[data-admin-login-message]');
  const submitButton = form.querySelector('button[type="submit"]');
  const formData = new FormData(form);

  if (message) {
    message.textContent = '';
  }

  if (submitButton) {
    submitButton.disabled = true;
  }

  try {
    const response = await fetch(authEndpoint, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        action: 'login',
        username: formData.get('username'),
        password: formData.get('password')
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Login failed');
    }

    adminSession = {
      authenticated: true,
      admin: data.admin || null
    };
    renderAdminDropdowns();

    if (options.redirectOnSuccess) {
      window.location.href = options.redirectOnSuccess;
    }
  } catch (error) {
    if (message) {
      message.textContent = error.message || 'Eroare la login.';
    }
  } finally {
    if (submitButton) {
      submitButton.disabled = false;
    }
  }
}

async function logoutAdmin() {
  await fetch(authEndpoint, {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ action: 'logout' })
  });

  adminSession = {
    authenticated: false,
    admin: null
  };
  renderAdminDropdowns();

  if (document.body.classList.contains('page-admin')) {
    window.location.href = 'index.html';
  }
}

function initAdminDropdown() {
  document.querySelectorAll('[data-admin-link]').forEach(link => {
    if (link.dataset.adminTrigger === 'true') {
      return;
    }

    const wrapper = document.createElement('div');
    wrapper.className = 'admin-nav';
    wrapper.dataset.adminMenu = 'true';
    link.parentNode.insertBefore(wrapper, link);
    wrapper.appendChild(link);

    link.classList.add('admin-nav-trigger');
    link.dataset.adminTrigger = 'true';
    link.setAttribute('aria-haspopup', 'true');
    link.setAttribute('aria-expanded', 'false');

    const dropdown = document.createElement('div');
    dropdown.className = 'admin-dropdown';
    dropdown.dataset.adminDropdown = 'true';
    dropdown.hidden = true;
    wrapper.appendChild(dropdown);

    link.addEventListener('click', event => {
      event.preventDefault();
      toggleAdminDropdown(wrapper);
    });

    dropdown.addEventListener('submit', event => {
      const form = event.target.closest('[data-admin-login-form]');
      if (!form) {
        return;
      }

      event.preventDefault();
      submitAdminLogin(form);
    });

    dropdown.addEventListener('click', event => {
      if (event.target.closest('[data-admin-logout]')) {
        event.preventDefault();
        logoutAdmin();
      }
    });
  });

  document.addEventListener('click', event => {
    if (!event.target.closest('[data-admin-menu]')) {
      closeAdminDropdowns();
    }
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      closeAdminDropdowns();
    }
  });

  refreshAdminSession();
}

function initAdminLoginPage() {
  const form = document.querySelector('[data-admin-login-page-form]');
  if (!form) {
    return;
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    submitAdminLogin(form, { redirectOnSuccess: 'admin.html' });
  });
}

function setAdminFormMessage(form, text, type = 'error') {
  const message = form.querySelector('[data-admin-form-message]');
  if (!message) {
    return;
  }

  message.textContent = text;
  message.dataset.state = type;
}

function formatTwoDigits(value) {
  return String(value).padStart(2, '0');
}

function buildTimeSelectOptions(max) {
  return Array.from({ length: max + 1 }, (_, value) => {
    const label = formatTwoDigits(value);
    return `<option value="${label}">${label}</option>`;
  }).join('');
}

function syncAdminTimePickerFromHidden(hiddenInput) {
  const picker = hiddenInput.closest('[data-admin-time-picker]');
  if (!picker) {
    return;
  }

  const [hours = '00', minutes = '00'] = String(hiddenInput.value || '00:00').split(':');
  const hourSelect = picker.querySelector('[data-time-hour]');
  const minuteSelect = picker.querySelector('[data-time-minute]');

  if (hourSelect) {
    hourSelect.value = formatTwoDigits(Number(hours) || 0);
  }

  if (minuteSelect) {
    minuteSelect.value = formatTwoDigits(Number(minutes) || 0);
  }
}

function enhanceAdminTimeInputs() {
  document.querySelectorAll('[data-admin-hours-row] input[type="time"]').forEach(input => {
    if (input.dataset.enhancedTime === 'true') {
      return;
    }

    const hiddenInput = document.createElement('input');
    hiddenInput.type = 'hidden';
    hiddenInput.name = input.name;
    hiddenInput.value = input.value || '00:00';

    const picker = document.createElement('div');
    picker.className = 'admin-time-picker';
    picker.dataset.adminTimePicker = 'true';
    picker.innerHTML = `
      <select aria-label="Ora" data-time-hour>${buildTimeSelectOptions(23)}</select>
      <span aria-hidden="true">:</span>
      <select aria-label="Minute" data-time-minute>${buildTimeSelectOptions(59)}</select>
    `;

    const syncHiddenValue = () => {
      const hour = picker.querySelector('[data-time-hour]')?.value || '00';
      const minute = picker.querySelector('[data-time-minute]')?.value || '00';
      hiddenInput.value = `${hour}:${minute}`;
    };

    picker.querySelectorAll('select').forEach(select => {
      select.addEventListener('change', syncHiddenValue);
    });

    input.dataset.enhancedTime = 'true';
    input.replaceWith(picker);
    picker.appendChild(hiddenInput);
    syncAdminTimePickerFromHidden(hiddenInput);
    syncHiddenValue();
  });
}

function fillAdminHoursForm() {
  document.querySelectorAll('[data-admin-hours-row]').forEach(row => {
    const dayIndex = Number(row.dataset.dayIndex);
    const hour = getOpeningHourByDay(dayIndex);
    if (!hour) {
      return;
    }

    const dayLabel = row.querySelector('.admin-hours-day');
    const openInput = row.querySelector(`input[name="open_time_${dayIndex}"]`);
    const closeInput = row.querySelector(`input[name="close_time_${dayIndex}"]`);
    const closedInput = row.querySelector(`input[name="is_closed_${dayIndex}"]`);

    if (dayLabel) {
      dayLabel.dataset.ro = hour.dayNameRo || dayLabel.dataset.ro || '';
      dayLabel.dataset.en = hour.dayNameEn || dayLabel.dataset.en || '';
      dayLabel.textContent = dayLabel.dataset[document.documentElement.lang || 'ro'] || dayLabel.dataset.ro;
    }

    if (openInput) {
      openInput.value = hour.openTime || '';
      syncAdminTimePickerFromHidden(openInput);
    }

    if (closeInput) {
      closeInput.value = hour.closeTime || '';
      syncAdminTimePickerFromHidden(closeInput);
    }

    if (closedInput) {
      closedInput.checked = Boolean(hour.isClosed);
    }
  });
}

function collectAdminHoursForm() {
  return [...document.querySelectorAll('[data-admin-hours-row]')].map(row => {
    const dayIndex = Number(row.dataset.dayIndex);
    const dayLabel = row.querySelector('.admin-hours-day');
    const openInput = row.querySelector(`input[name="open_time_${dayIndex}"]`);
    const closeInput = row.querySelector(`input[name="close_time_${dayIndex}"]`);
    const closedInput = row.querySelector(`input[name="is_closed_${dayIndex}"]`);

    return {
      dayIndex,
      dayNameRo: dayLabel?.dataset.ro || '',
      dayNameEn: dayLabel?.dataset.en || '',
      openTime: openInput?.value || '',
      closeTime: closeInput?.value || '',
      isClosed: Boolean(closedInput?.checked),
      row,
      openInput,
      closeInput,
      closedInput
    };
  });
}

function showHoursConflictModal(conflict) {
  const modal = document.querySelector('[data-hours-conflict-modal]');
  if (!modal) {
    return Promise.resolve('closed');
  }

  const text = modal.querySelector('[data-hours-conflict-text]');
  const keepSchedule = modal.querySelector('[data-hours-keep-schedule]');
  const keepClosed = modal.querySelector('[data-hours-keep-closed]');
  const lang = document.documentElement.lang || 'ro';
  const dayName = lang === 'en' ? conflict.dayNameEn : conflict.dayNameRo;

  if (text) {
    text.textContent = lang === 'en'
      ? `You selected both a time interval and Closed for ${dayName}. Which option should be kept?`
      : `Ai selectat si un interval orar, dar si magazinul inchis pentru ${dayName}. Ce doresti sa pastrezi?`;
  }

  modal.hidden = false;
  window.requestAnimationFrame(() => modal.classList.add('open'));
  keepClosed?.focus();

  return new Promise(resolve => {
    const cleanup = choice => {
      modal.classList.remove('open');
      window.setTimeout(() => {
        modal.hidden = true;
      }, 180);
      keepSchedule?.removeEventListener('click', onSchedule);
      keepClosed?.removeEventListener('click', onClosed);
      resolve(choice);
    };

    const onSchedule = () => cleanup('schedule');
    const onClosed = () => cleanup('closed');

    keepSchedule?.addEventListener('click', onSchedule);
    keepClosed?.addEventListener('click', onClosed);
  });
}

async function resolveHoursConflicts(hours) {
  for (const hour of hours) {
    const hasTimeInterval = Boolean(hour.openTime || hour.closeTime);
    if (!hour.isClosed || !hasTimeInterval) {
      continue;
    }

    const choice = await showHoursConflictModal(hour);

    if (choice === 'schedule') {
      hour.isClosed = false;
      if (hour.closedInput) {
        hour.closedInput.checked = false;
      }
    } else {
      hour.openTime = '';
      hour.closeTime = '';
      if (hour.openInput) {
        hour.openInput.value = '';
        syncAdminTimePickerFromHidden(hour.openInput);
      }
      if (hour.closeInput) {
        hour.closeInput.value = '';
        syncAdminTimePickerFromHidden(hour.closeInput);
      }
    }
  }

  return hours;
}

function openCategoryModal() {
  const modal = document.querySelector('[data-category-modal]');
  const form = document.querySelector('[data-admin-category-form]');
  if (!modal || !form) {
    return;
  }

  form.reset();
  setAdminFormMessage(form, '');
  modal.hidden = false;
  window.requestAnimationFrame(() => modal.classList.add('open'));
  form.querySelector('input')?.focus();
}

function closeCategoryModal() {
  const modal = document.querySelector('[data-category-modal]');
  if (!modal) {
    return;
  }

  modal.classList.remove('open');
  window.setTimeout(() => {
    modal.hidden = true;
  }, 180);
}

function setAdminCategoryMessage(text, type = 'error') {
  const message = document.querySelector('[data-admin-category-message]');
  if (!message) {
    return;
  }

  message.textContent = text;
  message.dataset.state = type;
}

function initAdminCategoryControls() {
  const openButtons = document.querySelectorAll('[data-add-category-open]');
  const modal = document.querySelector('[data-category-modal]');
  const form = document.querySelector('[data-admin-category-form]');
  const cancelButton = document.querySelector('[data-category-cancel]');

  if (!openButtons.length || !modal || !form || form.dataset.categoryControlsInitialized === 'true') {
    return;
  }

  form.dataset.categoryControlsInitialized = 'true';
  renderAdminCategoryList();

  openButtons.forEach(openButton => openButton.addEventListener('click', () => {
    setAdminCategoryMessage('');
    openCategoryModal();
  }));

  cancelButton?.addEventListener('click', closeCategoryModal);

  modal.addEventListener('click', event => {
    if (event.target === modal) {
      closeCategoryModal();
    }
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !modal.hidden) {
      closeCategoryModal();
    }
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();

    const formData = new FormData(form);
    const submitButton = form.querySelector('button[type="submit"]');
    const payload = {
      action: 'add_menu_category',
      traditional_name: formData.get('traditional_name'),
      romanian_name: formData.get('romanian_name'),
      english_name: formData.get('english_name')
    };
    const hasCategoryName = [
      payload.traditional_name,
      payload.romanian_name,
      payload.english_name
    ].some(value => String(value || '').trim());

    setAdminFormMessage(form, '');

    if (!hasCategoryName) {
      setAdminFormMessage(form, 'Completeaza cel putin un nume pentru categorie.');
      return;
    }

    if (submitButton) {
      submitButton.disabled = true;
    }

    try {
      const response = await fetch(settingsEndpoint, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      const data = await readJsonResponse(response);
      if (!response.ok) {
        throw new Error(data.error || 'Nu am putut salva categoria.');
      }

      siteSettings.menuCategories = Array.isArray(data.menuCategories) ? data.menuCategories : siteSettings.menuCategories;
      saveLocalMenuCategories(siteSettings.menuCategories);
      renderAdminCategoryList();
      renderMenuCategories();
      updateMenuJumpDropdown(document.documentElement.lang || 'ro');
      closeCategoryModal();
      setAdminCategoryMessage('Categoria a fost salvata.', 'success');
    } catch (error) {
      addLocalMenuCategory(payload);
      renderAdminCategoryList();
      renderMenuCategories();
      updateMenuJumpDropdown(document.documentElement.lang || 'ro');
      closeCategoryModal();
      setAdminCategoryMessage(error.message || 'Categoria a fost salvata local.', 'success');
    } finally {
      if (submitButton) {
        submitButton.disabled = false;
      }
    }
  });
}

async function initAdminPage() {
  if (!document.body.classList.contains('page-admin')) {
    return;
  }

  const session = await refreshAdminSession();
  if (!session.authenticated) {
    window.location.href = 'admin-login.html';
    return;
  }

  const phoneForm = document.querySelector('[data-admin-phone-form]');
  const phoneInput = phoneForm?.querySelector('[name="phone_display"]');
  const hoursForm = document.querySelector('[data-admin-hours-form]');
  const linksForm = document.querySelector('[data-admin-links-form]');

  initAdminCategoryControls();

  if (phoneForm && phoneInput) {
    phoneInput.value = siteSettings.phone.display;

    phoneForm.addEventListener('submit', async event => {
      event.preventDefault();

      const submitButton = phoneForm.querySelector('button[type="submit"]');
      setAdminFormMessage(phoneForm, '');

      if (submitButton) {
        submitButton.disabled = true;
      }

      try {
        const response = await fetch(settingsEndpoint, {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            action: 'update_phone',
            phone_display: phoneInput.value
          })
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Nu am putut salva numarul.');
        }

        siteSettings.phone.display = data.phone?.display || siteSettings.phone.display;
        siteSettings.phone.tel = data.phone?.tel || siteSettings.phone.tel;
        siteSettings.phone.whatsappUrl = data.phone?.whatsappUrl || siteSettings.phone.whatsappUrl;

        phoneInput.value = siteSettings.phone.display;
        applySiteSettings();
        setLanguage(document.documentElement.lang || 'ro');
        setAdminFormMessage(phoneForm, 'Numarul de telefon a fost salvat.', 'success');
      } catch (error) {
        setAdminFormMessage(phoneForm, error.message || 'Nu am putut salva numarul.');
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
        }
      }
    });
  }

  if (hoursForm) {
    enhanceAdminTimeInputs();
    fillAdminHoursForm();

    hoursForm.addEventListener('submit', async event => {
      event.preventDefault();

      const submitButton = hoursForm.querySelector('button[type="submit"]');
      setAdminFormMessage(hoursForm, '');

      if (submitButton) {
        submitButton.disabled = true;
      }

      try {
        const resolvedHours = await resolveHoursConflicts(collectAdminHoursForm());
        const payloadHours = resolvedHours.map(({ dayIndex, dayNameRo, dayNameEn, openTime, closeTime, isClosed }) => ({
          dayIndex,
          dayNameRo,
          dayNameEn,
          openTime,
          closeTime,
          isClosed
        }));

        const response = await fetch(settingsEndpoint, {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            action: 'update_hours',
            openingHours: payloadHours
          })
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Nu am putut salva programul.');
        }

        siteSettings.openingHours = Array.isArray(data.openingHours) ? data.openingHours : siteSettings.openingHours;
        fillAdminHoursForm();
        applyOpeningHours();
        updateContactHours();
        setAdminFormMessage(hoursForm, 'Programul a fost salvat.', 'success');
      } catch (error) {
        setAdminFormMessage(hoursForm, error.message || 'Nu am putut salva programul.');
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
        }
      }
    });
  }

  if (linksForm) {
    linksForm.querySelector('[name="wolt_url"]').value = siteSettings.links.wolt || '';
    linksForm.querySelector('[name="glovo_url"]').value = siteSettings.links.glovo || '';
    linksForm.querySelector('[name="instagram_url"]').value = siteSettings.links.instagram || '';
    linksForm.querySelector('[name="facebook_url"]').value = siteSettings.links.facebook || '';

    linksForm.addEventListener('submit', async event => {
      event.preventDefault();

      const submitButton = linksForm.querySelector('button[type="submit"]');
      const formData = new FormData(linksForm);
      setAdminFormMessage(linksForm, '');

      if (submitButton) {
        submitButton.disabled = true;
      }

      try {
        const response = await fetch(settingsEndpoint, {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            action: 'update_links',
            wolt_url: formData.get('wolt_url'),
            glovo_url: formData.get('glovo_url'),
            instagram_url: formData.get('instagram_url'),
            facebook_url: formData.get('facebook_url')
          })
        });

        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Nu am putut salva linkurile.');
        }

        siteSettings.links.wolt = data.links?.wolt || '';
        siteSettings.links.glovo = data.links?.glovo || '';
        siteSettings.links.instagram = data.links?.instagram || '';
        siteSettings.links.facebook = data.links?.facebook || '';

        linksForm.querySelector('[name="wolt_url"]').value = siteSettings.links.wolt;
        linksForm.querySelector('[name="glovo_url"]').value = siteSettings.links.glovo;
        linksForm.querySelector('[name="instagram_url"]').value = siteSettings.links.instagram;
        linksForm.querySelector('[name="facebook_url"]').value = siteSettings.links.facebook;

        applySiteSettings();
        setAdminFormMessage(linksForm, 'Linkurile au fost salvate.', 'success');
      } catch (error) {
        setAdminFormMessage(linksForm, error.message || 'Nu am putut salva linkurile.');
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
        }
      }
    });
  }
}

function initMenuCardToggles() {
  document.querySelectorAll('.expand-btn').forEach(button => {
    button.addEventListener('click', () => {
      const card = button.closest('.menu-card');
      if (!card) return;

      const nextState = card.dataset.expanded !== 'true';
      card.dataset.expanded = nextState ? 'true' : 'false';

      const currentLang = document.documentElement.lang || 'ro';
      button.textContent = nextState
        ? menuToggleLabels[currentLang].hide
        : menuToggleLabels[currentLang].more;
    });
  });
}

function animateScrollTo(targetY, duration = 720) {
  const startY = window.pageYOffset;
  const distance = targetY - startY;

  if (Math.abs(distance) < 2) {
    return;
  }

  const startTime = performance.now();

  const easeInOutCubic = progress => (
    progress < 0.5
      ? 4 * progress * progress * progress
      : 1 - Math.pow(-2 * progress + 2, 3) / 2
  );

  const step = currentTime => {
    const progress = Math.min((currentTime - startTime) / duration, 1);
    const nextY = startY + distance * easeInOutCubic(progress);

    window.scrollTo(0, nextY);

    if (progress < 1) {
      window.requestAnimationFrame(step);
    }
  };

  window.requestAnimationFrame(step);
}

function getScrollTargetPosition(targetId) {
  const headerHeight = document.querySelector('.site-header')?.offsetHeight ?? 0;
  const extraOffset = targetId === 'contact' ? 6 : 0;

  if (targetId === 'home') {
    return 0;
  }

  const target = document.getElementById(targetId);
  if (!target) {
    return null;
  }

  return Math.max(
    0,
    target.getBoundingClientRect().top + window.pageYOffset - headerHeight + extraOffset
  );
}

function scrollToHomeTarget(targetId) {
  const targetY = getScrollTargetPosition(targetId);
  if (targetY === null) {
    return;
  }

  animateScrollTo(targetY);
}

function setActiveHomeNavLink(targetId) {
  document.querySelectorAll('.site-nav a[data-scroll-target]').forEach(link => {
    const isActive = link.dataset.scrollTarget === targetId;
    link.classList.toggle('active', isActive);

    if (isActive) {
      link.setAttribute('aria-current', 'location');
    } else {
      link.removeAttribute('aria-current');
    }
  });
}

function getHomeNavSections() {
  return [
    { id: 'home', element: document.getElementById('home') || document.querySelector('.hero') },
    { id: 'reviews', element: document.getElementById('reviews') },
    { id: 'order', element: document.getElementById('order') },
    { id: 'contact', element: document.getElementById('contact') }
  ].filter(section => section.element);
}

function getCurrentHomeNavTarget() {
  const sections = getHomeNavSections();
  if (!sections.length) {
    return 'home';
  }

  const probeOffset = (document.querySelector('.site-header')?.offsetHeight ?? 0) + 28;
  const currentSection = sections.find(section => {
    const rect = section.element.getBoundingClientRect();
    return rect.top <= probeOffset && rect.bottom > probeOffset;
  });

  if (currentSection) {
    return currentSection.id;
  }

  const firstBelowProbeIndex = sections.findIndex(section => section.element.getBoundingClientRect().top > probeOffset);
  if (firstBelowProbeIndex === 0) {
    return sections[0].id;
  }

  if (firstBelowProbeIndex > 0) {
    return sections[firstBelowProbeIndex - 1].id;
  }

  if (window.innerHeight + window.pageYOffset >= document.documentElement.scrollHeight - 8) {
    const lastSection = sections[sections.length - 1];
    return lastSection ? lastSection.id : 'home';
  }

  const lastSection = sections[sections.length - 1];
  return lastSection ? lastSection.id : 'home';
}

function updateHomeNavActiveState() {
  if (!document.body.classList.contains('page-home')) {
    return;
  }

  if (lockedNavTargetId) {
    setActiveHomeNavLink(lockedNavTargetId);
    return;
  }

  setActiveHomeNavLink(getCurrentHomeNavTarget());
}

function lockHomeNavActiveState(targetId, duration = navLockDuration) {
  lockedNavTargetId = targetId;
  window.clearTimeout(lockedNavTimerId);
  setActiveHomeNavLink(targetId);

  lockedNavTimerId = window.setTimeout(() => {
    lockedNavTargetId = '';
    lockedNavTimerId = null;
    updateHomeNavActiveState();
  }, duration);
}

function initHomeNavActiveState() {
  if (!document.body.classList.contains('page-home')) {
    return;
  }

  let ticking = false;

  const syncActiveState = () => {
    ticking = false;
    updateHomeNavActiveState();
  };

  const requestSync = () => {
    if (ticking) {
      return;
    }

    ticking = true;
    window.requestAnimationFrame(syncActiveState);
  };

  requestSync();
  window.addEventListener('scroll', requestSync, { passive: true });
  window.addEventListener('resize', requestSync);
  window.addEventListener('load', requestSync, { once: true });
}

function initSmoothHomeNavigation() {
  const scrollLinks = document.querySelectorAll('[data-scroll-target]');
  const isHomePage = document.body.classList.contains('page-home');

  scrollLinks.forEach(link => {
    link.addEventListener('click', event => {
      const targetId = link.dataset.scrollTarget;
      if (!targetId) {
        return;
      }

      event.preventDefault();

      if (isHomePage) {
        lockHomeNavActiveState(targetId);
        scrollToHomeTarget(targetId);
        history.replaceState(null, '', window.location.pathname);
        return;
      }

      sessionStorage.setItem(pendingScrollTargetKey, targetId);
      window.location.href = 'index.html';
    });
  });

  if (!isHomePage) {
    return;
  }

  const runInitialScroll = () => {
    const pendingTarget = sessionStorage.getItem(pendingScrollTargetKey);

    if (!pendingTarget) {
      if (window.location.hash) {
        history.replaceState(null, '', window.location.pathname);
        window.scrollTo(0, 0);
        updateHomeNavActiveState();
      }
      return;
    }

    sessionStorage.removeItem(pendingScrollTargetKey);
    lockHomeNavActiveState(pendingTarget);
    window.scrollTo(0, 0);
    history.replaceState(null, '', window.location.pathname);
    window.setTimeout(() => scrollToHomeTarget(pendingTarget), 60);
  };

  if (document.readyState === 'complete') {
    runInitialScroll();
  } else {
    window.addEventListener('load', runInitialScroll, { once: true });
  }
}

function initPageScrollTargets() {
  document.querySelectorAll('[data-page-scroll-target]').forEach(link => {
    link.addEventListener('click', event => {
      const targetId = link.dataset.pageScrollTarget;
      if (!targetId) {
        return;
      }

      const targetY = getScrollTargetPosition(targetId);
      if (targetY === null) {
        return;
      }

      event.preventDefault();
      animateScrollTo(targetY);
      history.replaceState(null, '', `${window.location.pathname}#${targetId}`);
    });
  });
}

function slugify(value) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function ensureMenuCategoryIds() {
  document.querySelectorAll('.menu-category').forEach((section, index) => {
    if (section.id) {
      return;
    }

    const title = section.querySelector('.category-title');
    const source = title?.dataset.en || title?.dataset.ro || title?.textContent || `section-${index + 1}`;
    section.id = slugify(source) || `section-${index + 1}`;
  });
}

function updateMenuJumpDropdown(lang = document.documentElement.lang || 'ro') {
  const jump = document.querySelector('[data-menu-jump]');
  if (!jump) {
    return;
  }

  ensureMenuCategoryIds();

  const panel = jump.querySelector('.menu-jump-panel');
  if (!panel) {
    return;
  }

  const options = [...document.querySelectorAll('.menu-category')].map(section => {
    const title = section.querySelector('.category-title');
    if (!title) {
      return '';
    }

    const label = title.dataset[lang] || title.textContent;
    return `<button type="button" class="menu-jump-option" data-target-id="${section.id}">${label}</button>`;
  }).filter(Boolean);

  jump.hidden = options.length === 0;
  panel.innerHTML = options.join('');
}

function initMenuJumpDropdown() {
  const jump = document.querySelector('[data-menu-jump]');
  if (!jump) {
    return;
  }

  ensureMenuCategoryIds();
  updateMenuJumpDropdown();

  const trigger = jump.querySelector('.menu-jump-trigger');
  const panel = jump.querySelector('.menu-jump-panel');

  if (!trigger || !panel) {
    return;
  }

  const closeJump = () => {
    jump.classList.remove('open');
    trigger.setAttribute('aria-expanded', 'false');
    panel.hidden = true;
  };

  const openJump = () => {
    jump.classList.add('open');
    trigger.setAttribute('aria-expanded', 'true');
    panel.hidden = false;
  };

  trigger.addEventListener('click', event => {
    event.preventDefault();

    if (jump.classList.contains('open')) {
      closeJump();
    } else {
      openJump();
    }
  });

  panel.addEventListener('click', event => {
    const option = event.target.closest('.menu-jump-option');
    if (!option) {
      return;
    }

    const targetId = option.dataset.targetId;
    const targetY = getScrollTargetPosition(targetId);
    if (targetY === null) {
      return;
    }

    closeJump();
    animateScrollTo(targetY);
    history.replaceState(null, '', `${window.location.pathname}#${targetId}`);
  });

  document.addEventListener('click', event => {
    if (!jump.contains(event.target)) {
      closeJump();
    }
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      closeJump();
    }
  });
}

function initGallerySlider() {
  const sliders = document.querySelectorAll('[data-gallery-slider]');
  if (!sliders.length) {
    return;
  }

  sliders.forEach(slider => {
    const track = slider.querySelector('[data-gallery-track]');
    const cards = Array.from(slider.querySelectorAll('[data-gallery-card]'));
    const prevButton = slider.querySelector('[data-gallery-prev]');
    const nextButton = slider.querySelector('[data-gallery-next]');
    const dotsContainer = slider.querySelector('[data-gallery-dots]');

    if (!track || !cards.length || !prevButton || !nextButton || !dotsContainer) {
      return;
    }

    let activeIndex = 0;
    let pointerStartX = 0;
    let pointerStartY = 0;
    let isPointerDown = false;
    let activePointerId = null;
    const compactGalleryQuery = window.matchMedia('(max-width: 700px)');
    const getOffset = index => {
      const total = cards.length;
      let offset = index - activeIndex;

      if (offset > total / 2) {
        offset -= total;
      }

      if (offset < total / -2) {
        offset += total;
      }

      return offset;
    };

    const setActiveSlide = nextIndex => {
      const total = cards.length;
      activeIndex = (nextIndex + total) % total;

      cards.forEach((card, index) => {
        const offset = getOffset(index);
        const distance = Math.abs(offset);
        const isVisible = distance <= 3;
        const isActive = offset === 0;

        card.classList.toggle('is-active', isActive);
        card.classList.toggle('is-visible', isVisible);
        card.setAttribute('aria-current', isActive ? 'true' : 'false');
        card.style.setProperty('--slide-x', `calc(${offset} * ${compactGalleryQuery.matches ? 'clamp(54px, 15vw, 74px)' : 'clamp(92px, 16vw, 188px)'})`);
        card.style.setProperty('--slide-rotate', `${offset * (compactGalleryQuery.matches ? -3.5 : -5.5)}deg`);
        card.style.setProperty('--slide-scale', String(Math.max(compactGalleryQuery.matches ? 0.82 : 0.74, 1 - distance * (compactGalleryQuery.matches ? 0.06 : 0.08))));
        card.style.setProperty('--slide-opacity', String(Math.max(0.16, 1 - distance * 0.18)));
        card.style.zIndex = String(20 - distance);
        card.tabIndex = isVisible ? 0 : -1;
      });

      dotsContainer.querySelectorAll('.gallery-slider-dot').forEach((dot, index) => {
        dot.classList.toggle('is-active', index === activeIndex);
        dot.setAttribute('aria-current', index === activeIndex ? 'true' : 'false');
      });
    };

    cards.forEach((card, index) => {
      card.dataset.gallerySlideIndex = String(index);
      card.querySelector('img')?.setAttribute('draggable', 'false');
    });

    cards.forEach((_, index) => {
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = 'gallery-slider-dot';
      dot.setAttribute('aria-label', `Show image ${index + 1}`);
      dot.addEventListener('click', () => setActiveSlide(index));
      dotsContainer.appendChild(dot);
    });

    prevButton.addEventListener('click', () => setActiveSlide(activeIndex - 1));
    nextButton.addEventListener('click', () => setActiveSlide(activeIndex + 1));
    compactGalleryQuery.addEventListener?.('change', () => setActiveSlide(activeIndex));

    const endGalleryDrag = () => {
      isPointerDown = false;
      activePointerId = null;
      track.classList.remove('is-dragging');
    };

    track.addEventListener('pointerdown', event => {
      if (event.button !== 0) {
        return;
      }

      isPointerDown = true;
      activePointerId = event.pointerId;
      pointerStartX = event.clientX;
      pointerStartY = event.clientY;
      track.classList.add('is-dragging');
      track.setPointerCapture?.(event.pointerId);
    });

    track.addEventListener('pointermove', event => {
      if (!isPointerDown || event.pointerId !== activePointerId) {
        return;
      }

      const deltaX = event.clientX - pointerStartX;
      const deltaY = event.clientY - pointerStartY;

      if (Math.abs(deltaX) > 72 && Math.abs(deltaX) > Math.abs(deltaY)) {
        event.preventDefault();
        suppressNextGalleryClick = true;
        setActiveSlide(activeIndex + (deltaX < 0 ? 1 : -1));
        pointerStartX = event.clientX;
        pointerStartY = event.clientY;
        window.setTimeout(() => {
          suppressNextGalleryClick = false;
        }, 120);
      }
    });

    track.addEventListener('pointerup', endGalleryDrag);
    track.addEventListener('pointercancel', endGalleryDrag);
    track.addEventListener('dragstart', event => event.preventDefault());

    slider.addEventListener('keydown', event => {
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        setActiveSlide(activeIndex - 1);
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        setActiveSlide(activeIndex + 1);
      }
    });

    setActiveSlide(0);
  });
}

function initGalleryLightbox() {
  const lightbox = document.querySelector('[data-gallery-lightbox]');
  if (!lightbox) {
    return;
  }

  const dialog = lightbox.querySelector('.gallery-lightbox-dialog');
  const image = lightbox.querySelector('.gallery-lightbox-image');
  const title = lightbox.querySelector('.gallery-lightbox-title');
  const closeButton = lightbox.querySelector('[data-gallery-close]');
  const cards = document.querySelectorAll('[data-gallery-card]');

  if (!dialog || !image || !title || !closeButton || !cards.length) {
    return;
  }

  let lastTrigger = null;
  let closeTimerId = null;
  let scrollTopBeforeOpen = 0;

  const closeLightbox = () => {
    if (lightbox.hidden) {
      return;
    }

    lightbox.classList.remove('open');
    document.documentElement.classList.remove('lightbox-open');
    document.body.classList.remove('lightbox-open');
    document.body.style.removeProperty('top');
    window.clearTimeout(closeTimerId);
    closeTimerId = window.setTimeout(() => {
      lightbox.hidden = true;
      image.removeAttribute('src');
      image.removeAttribute('alt');
    }, 180);
    window.scrollTo(0, scrollTopBeforeOpen);

    if (lastTrigger) {
      lastTrigger.focus();
      lastTrigger = null;
    }
  };

  const openLightbox = card => {
    const previewImage = card.querySelector('img');
    if (!previewImage) {
      return;
    }

    lastTrigger = card;
    window.clearTimeout(closeTimerId);

    title.dataset.ro = card.dataset.titleRo || previewImage.alt;
    title.dataset.en = card.dataset.titleEn || title.dataset.ro;

    const currentLanguage = document.documentElement.lang || 'ro';
    title.textContent = title.dataset[currentLanguage] || previewImage.alt;
    image.src = previewImage.currentSrc || previewImage.src;
    image.alt = previewImage.alt;

    scrollTopBeforeOpen = window.scrollY || document.documentElement.scrollTop || 0;
    lightbox.hidden = false;
    document.documentElement.classList.add('lightbox-open');
    document.body.classList.add('lightbox-open');
    document.body.style.top = `-${scrollTopBeforeOpen}px`;
    window.requestAnimationFrame(() => lightbox.classList.add('open'));
    closeButton.focus();
  };

  cards.forEach(card => {
    card.addEventListener('click', () => {
      if (suppressNextGalleryClick) {
        suppressNextGalleryClick = false;
        return;
      }

      const slider = card.closest('[data-gallery-slider]');
      if (slider && !card.classList.contains('is-active')) {
        const slideIndex = Number(card.dataset.gallerySlideIndex);
        const dots = slider.querySelectorAll('.gallery-slider-dot');
        dots[slideIndex]?.click();
        return;
      }

      openLightbox(card);
    });
  });

  closeButton.addEventListener('click', closeLightbox);

  lightbox.addEventListener('click', event => {
    if (event.target === lightbox) {
      closeLightbox();
    }
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !lightbox.hidden) {
      closeLightbox();
    }
  });
}

async function initApp() {
  await loadSiteSettings();
  applySiteSettings();
  applyOpeningHours();
  initContactHours();
  initLanguageSwitcher();
  initAdminDropdown();
  initAdminLoginPage();
  initAdminCategoryControls();
  initAdminPage();
  initMenuCardToggles();
  initHomeNavActiveState();
  initSmoothHomeNavigation();
  initPageScrollTargets();
  initMenuJumpDropdown();
  initGallerySlider();
  initGalleryLightbox();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}
