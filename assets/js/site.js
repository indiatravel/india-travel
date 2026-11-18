(() => {
  'use strict';

  const STORAGE_KEY = 'fieldindia.v1';
  const validPollChoices = new Set(['mountains', 'water', 'cities']);
  const validReactions = new Set(['joy', 'calm', 'curious']);
  const pageSlug = (document.body && document.body.dataset.page) || window.location.pathname || 'page';
  const pageKey = pageSlug.slice(0, 240);
  let storageAvailable = true;
  let storageNoticeShown = false;
  let toastTimer;

  const emptyState = () => ({
    saved: [],
    ratings: Object.create(null),
    votes: Object.create(null),
    reactions: Object.create(null),
    polls: Object.create(null),
    notes: Object.create(null)
  });

  function cleanText(value, maxLength) {
    return typeof value === 'string' ? value.slice(0, maxLength) : '';
  }

  function cleanMap(value, validator) {
    const result = Object.create(null);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return result;
    for (const [key, entry] of Object.entries(value)) {
      const safeKey = cleanText(key, 240);
      const safeValue = validator(entry);
      if (safeKey && safeValue !== undefined) result[safeKey] = safeValue;
    }
    return result;
  }

  function normalizeState(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return emptyState();
    const state = emptyState();
    if (Array.isArray(value.saved)) {
      state.saved = value.saved.slice(0, 500).map((record) => {
        if (!record || typeof record !== 'object') return null;
        const id = cleanText(record.id, 240);
        if (!id) return null;
        return {
          id,
          title: cleanText(record.title, 500),
          url: cleanText(record.url, 2000),
          image: cleanText(record.image, 2000)
        };
      }).filter(Boolean);
    }
    state.ratings = cleanMap(value.ratings, (entry) => Number.isInteger(entry) && entry >= 1 && entry <= 5 ? entry : undefined);
    state.votes = cleanMap(value.votes, (entry) => entry === 'like' || entry === 'dislike' ? entry : undefined);
    state.reactions = cleanMap(value.reactions, (entry) => validReactions.has(entry) ? entry : undefined);
    state.polls = cleanMap(value.polls, (entry) => validPollChoices.has(entry) ? entry : undefined);
    state.notes = cleanMap(value.notes, (entries) => {
      if (!Array.isArray(entries)) return undefined;
      return entries.slice(0, 500).map((note) => {
        if (!note || typeof note !== 'object' || typeof note.text !== 'string') return null;
        return { id: cleanText(note.id, 240), text: note.text.slice(0, 600), createdAt: cleanText(note.createdAt, 40) };
      }).filter((note) => note && note.id && note.text);
    });
    return state;
  }

  let state = emptyState();
  try {
    const storage = window.localStorage;
    const raw = storage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        state = normalizeState(JSON.parse(raw));
      } catch (error) {
        storage.removeItem(STORAGE_KEY);
      }
    }
  } catch (error) {
    storageAvailable = false;
  }

  function persistState() {
    if (!storageAvailable) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (error) {
      storageAvailable = false;
      announceStorageLimitation();
    }
  }

  function announceStorageLimitation() {
    if (storageNoticeShown) return;
    storageNoticeShown = true;
    showToast('Browser storage is unavailable; personal choices will not persist after you leave this page.');
  }

  function showToast(message) {
    let toast = document.getElementById('toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'toast';
      toast.hidden = true;
      toast.style.position = 'fixed';
      toast.style.left = '1rem';
      toast.style.right = '1rem';
      toast.style.bottom = '1rem';
      toast.style.zIndex = '1000';
      toast.style.maxWidth = '36rem';
      toast.style.marginInline = 'auto';
      toast.style.padding = '0.85rem 1rem';
      toast.style.background = '#173b35';
      toast.style.color = '#fff';
      toast.style.borderRadius = '0.5rem';
      document.body.append(toast);
    }
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    toast.textContent = message;
    toast.hidden = false;
    toast.classList.add('is-visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toast.hidden = true;
      toast.classList.remove('is-visible');
    }, 3600);
  }

  function setStatus(selector, message) {
    const target = document.querySelector(selector);
    if (target) target.textContent = message;
  }

  function persistencePhrase() {
    return storageAvailable ? 'Stored on this device only.' : 'This choice will not persist after you leave this page.';
  }

  function safeWebURL(value) {
    if (!value) return '';
    try {
      const parsed = new URL(value, window.location.href);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : '';
    } catch (error) {
      return '';
    }
  }

  function setPressed(element, pressed) {
    element.setAttribute('aria-pressed', pressed ? 'true' : 'false');
    element.classList.toggle('is-selected', pressed);
  }

  function syncMenu() {
    const button = document.querySelector('[data-menu]');
    const nav = document.querySelector('[data-nav]');
    if (!button || !nav) return;
    const opened = nav.classList.contains('is-open');
    button.setAttribute('aria-expanded', opened ? 'true' : 'false');
    button.addEventListener('click', () => {
      const nextOpened = !nav.classList.contains('is-open');
      nav.classList.toggle('is-open', nextOpened);
      button.setAttribute('aria-expanded', nextOpened ? 'true' : 'false');
    });
  }

  function syncSavedButtons() {
    document.querySelectorAll('[data-save]').forEach((button) => {
      const recordId = button.dataset.id;
      const isSaved = state.saved.some((record) => record.id === recordId);
      setPressed(button, isSaved);
      const title = button.dataset.title || 'this place';
      button.setAttribute('aria-label', isSaved ? `Remove ${title} from saved places` : `Save ${title}`);
    });
  }

  function renderSavedList() {
    document.querySelectorAll('[data-saved-count]').forEach((counter) => {
      counter.textContent = String(state.saved.length);
    });
    const list = document.getElementById('saved-list');
    if (!list) return;
    list.replaceChildren();
    list.classList.toggle('is-empty', state.saved.length === 0);
    if (state.saved.length === 0) {
      const empty = document.createElement(list.matches('ul, ol') ? 'li' : 'p');
      empty.className = 'saved-empty';
      empty.textContent = 'No saved places yet.';
      list.append(empty);
      return;
    }
    for (const record of state.saved) {
      const item = document.createElement(list.matches('ul, ol') ? 'li' : 'article');
      item.className = 'saved-item';
      if (record.image) {
        const imageURL = safeWebURL(record.image);
        if (imageURL) {
          const image = document.createElement('img');
          image.src = imageURL;
          image.alt = record.title;
          image.title = record.title || 'Saved travel image';
          image.loading = 'lazy';
          item.append(image);
        }
      }
      const linkURL = safeWebURL(record.url);
      if (linkURL) {
        const titleLink = document.createElement('a');
        titleLink.href = linkURL;
        titleLink.textContent = record.title || 'Saved place';
        item.append(titleLink);
      } else {
        const title = document.createElement('span');
        title.textContent = record.title || 'Saved place';
        item.append(title);
      }
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.dataset.removeSaved = record.id;
      remove.textContent = 'Remove';
      remove.setAttribute('aria-label', `Remove ${record.title || 'saved place'}`);
      item.append(remove);
      list.append(item);
    }
  }

  function savePlace(button) {
    const id = cleanText(button.dataset.id, 240) || safeWebURL(button.dataset.url) || cleanText(button.dataset.title, 240);
    if (!id) return;
    const existingIndex = state.saved.findIndex((record) => record.id === id);
    if (existingIndex >= 0) {
      const [removed] = state.saved.splice(existingIndex, 1);
      persistState();
      syncSavedButtons();
      renderSavedList();
      showToast(`${removed.title || 'Place'} removed from your saved list.`);
      return;
    }
    state.saved.push({
      id,
      title: cleanText(button.dataset.title, 500) || 'Saved place',
      url: safeWebURL(button.dataset.url) || safeWebURL(window.location.href),
      image: safeWebURL(button.dataset.image)
    });
    persistState();
    syncSavedButtons();
    renderSavedList();
    showToast('Saved to your on-device list.');
  }

  function syncRatings() {
    const rating = state.ratings[pageKey];
    document.querySelectorAll('[data-rating]').forEach((button) => {
      const value = Number(button.dataset.rating);
      setPressed(button, Number.isInteger(value) && value === rating);
    });
    setStatus('#rating-status', Number.isInteger(rating)
      ? `Your rating: ${rating} of 5. ${persistencePhrase()}`
      : 'No rating yet. Ratings stay on this device.');
  }

  function syncVotes() {
    const vote = state.votes[pageKey];
    document.querySelectorAll('[data-vote]').forEach((button) => setPressed(button, button.dataset.vote === vote));
    setStatus('#vote-status', vote ? `Your response: ${vote}. ${persistencePhrase()}` : 'No response yet.');
  }

  function syncReactions() {
    const reaction = state.reactions[pageKey];
    document.querySelectorAll('[data-reaction]').forEach((button) => setPressed(button, button.dataset.reaction === reaction));
    setStatus('#reaction-status', reaction ? `Your reaction: ${reaction}. ${persistencePhrase()}` : 'No reaction yet.');
  }

  function syncPoll() {
    const choice = state.polls[pageKey];
    document.querySelectorAll('[data-poll]').forEach((button) => setPressed(button, button.dataset.poll === choice));
    setStatus('#poll-status', choice ? `Your choice: ${choice}. ${persistencePhrase()}` : 'No choice yet. Your selection stays on this device.');
  }

  function noteId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }

  function renderNotes() {
    const list = document.getElementById('notes-list');
    if (!list) return;
    list.replaceChildren();
    const notes = state.notes[pageKey] || [];
    list.classList.toggle('is-empty', notes.length === 0);
    if (notes.length === 0) {
      const empty = document.createElement(list.matches('ul, ol') ? 'li' : 'p');
      empty.className = 'notes-empty';
      empty.textContent = 'No private notes on this page yet.';
      list.append(empty);
      return;
    }
    for (const note of notes) {
      const item = document.createElement(list.matches('ul, ol') ? 'li' : 'article');
      item.className = 'private-note';
      const text = document.createElement('p');
      text.textContent = note.text;
      item.append(text);
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.dataset.deleteNote = note.id;
      remove.textContent = 'Delete note';
      remove.setAttribute('aria-label', 'Delete this private note');
      item.append(remove);
      list.append(item);
    }
  }

  function syncSearchAndFilters() {
    const stories = Array.from(document.querySelectorAll('[data-story]'));
    if (stories.length === 0) return;
    const search = document.querySelector('[data-search]');
    const filterButtons = Array.from(document.querySelectorAll('[data-filter]'));
    const status = document.getElementById('search-status');
    let activeFilter = filterButtons.find((button) => button.getAttribute('aria-pressed') === 'true')?.dataset.filter || 'all';

    function applyFilters() {
      const query = (search ? search.value : '').trim().toLocaleLowerCase();
      let visibleCount = 0;
      for (const story of stories) {
        const title = story.dataset.title || '';
        const category = story.dataset.category || '';
        const matchesQuery = `${title} ${category}`.toLocaleLowerCase().includes(query);
        const matchesFilter = activeFilter === 'all' || category.toLocaleLowerCase() === activeFilter;
        const visible = matchesQuery && matchesFilter;
        story.hidden = !visible;
        if (visible) visibleCount += 1;
      }
      if (status) status.textContent = `Showing ${visibleCount} of ${stories.length} stories.`;
    }

    if (search) search.addEventListener('input', applyFilters);
    for (const button of filterButtons) {
      setPressed(button, button.dataset.filter === activeFilter);
      button.addEventListener('click', () => {
        const value = button.dataset.filter;
        if (!['all', 'culture', 'nature', 'coast', 'slow'].includes(value)) return;
        activeFilter = value;
        for (const filterButton of filterButtons) setPressed(filterButton, filterButton === button);
        applyFilters();
      });
    }
    applyFilters();
  }

  function revealURLFallback(message) {
    const field = document.getElementById('share-url');
    if (field) {
      field.value = window.location.href;
      field.hidden = false;
      field.focus();
      field.select();
    }
    setStatus('#share-status', message);
  }

  async function copyCurrentURL() {
    const currentURL = window.location.href;
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try {
        await navigator.clipboard.writeText(currentURL);
        setStatus('#share-status', 'Page link copied.');
        return true;
      } catch (error) {
        return copyWithSelection(currentURL);
      }
    }
    return copyWithSelection(currentURL);
  }

  function copyWithSelection(currentURL) {
    let field = document.getElementById('share-url');
    let temporary = false;
    if (!field) {
      field = document.createElement('textarea');
      field.setAttribute('aria-hidden', 'true');
      field.style.position = 'fixed';
      field.style.opacity = '0';
      document.body.append(field);
      temporary = true;
    }
    field.value = currentURL;
    field.hidden = false;
    field.focus();
    field.select();
    let copied = false;
    try {
      copied = document.execCommand('copy');
    } catch (error) {
      copied = false;
    }
    if (temporary) field.remove();
    if (copied) {
      setStatus('#share-status', 'Page link copied.');
      return Promise.resolve(true);
    }
    revealURLFallback('Copy the selected page link.');
    return Promise.resolve(false);
  }

  function bindSharing() {
    document.querySelectorAll('[data-share]').forEach((button) => {
      button.addEventListener('click', async () => {
        if (navigator.share) {
          try {
            await navigator.share({ title: document.title, url: window.location.href });
            setStatus('#share-status', 'Share sheet opened.');
          } catch (error) {
            if (error && error.name === 'AbortError') return;
            await copyCurrentURL();
          }
          return;
        }
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
          try {
            await navigator.clipboard.writeText(window.location.href);
            setStatus('#share-status', 'Page link copied.');
            return;
          } catch (error) {
            revealURLFallback('Copy or share this page link.');
            return;
          }
        }
        revealURLFallback('Copy or share this page link.');
      });
    });
    document.querySelectorAll('[data-copy]').forEach((button) => {
      button.addEventListener('click', () => copyCurrentURL());
    });
  }

  function bindNewsletter() {
    const form = document.getElementById('letter-form');
    if (!form) return;
    const emailField = form.querySelector('[name="email"]');
    const consentField = form.querySelector('[name="consent"]');
    if (emailField) {
      emailField.type = 'email';
      emailField.required = true;
    }
    if (consentField) consentField.required = true;
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const email = form.querySelector('[name="email"]');
      const consent = form.querySelector('[name="consent"]');
      if (!form.reportValidity()) return;
      if (!email || !consent || !consent.checked || !email.validity.valid) {
        if (consent && !consent.checked) consent.focus();
        return;
      }
      const body = [
        'Please choose and enter your own recipient in your email app before sending.',
        '',
        `Email address you supplied: ${email.value.trim()}`,
        '',
        'This website does not collect your email address or provide a subscription service.'
      ].join('\n');
      const mailto = `mailto:?subject=${encodeURIComponent('India Travel Blog newsletter enquiry')}&body=${encodeURIComponent(body)}`;
      const draft = document.getElementById('letter-draft');
      if (draft) {
        draft.href = mailto;
        draft.textContent = 'Open the email draft';
        draft.hidden = false;
      }
      setStatus('#letter-status', 'Email draft prepared. Choose a recipient in your email app; no subscription or email collection happens on this website.');
      window.location.href = mailto;
    });
  }

  function clearPersonalData() {
    if (!window.confirm('Clear your saved places, ratings, choices, reactions, and private notes from this device?')) return;
    state = emptyState();
    let cleared = true;
    try {
      const storage = window.localStorage;
      const keysToRemove = [];
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (key === STORAGE_KEY || (key && key.startsWith(`${STORAGE_KEY}.`))) keysToRemove.push(key);
      }
      for (const key of keysToRemove) storage.removeItem(key);
      storage.removeItem(STORAGE_KEY);
      storageAvailable = true;
    } catch (error) {
      storageAvailable = false;
      cleared = false;
    }
    syncSavedButtons();
    renderSavedList();
    syncRatings();
    syncVotes();
    syncReactions();
    syncPoll();
    renderNotes();
    if (cleared) {
      setStatus('#note-status', 'Private notes and other personal choices cleared from this device.');
      showToast('Personal data cleared from this device.');
    } else {
      setStatus('#note-status', 'Choices were cleared for this visit, but browser storage could not be cleared.');
      showToast('Choices cleared for this visit; browser storage could not be cleared.');
    }
  }

  function bindDelegatedActions() {
    document.addEventListener('click', (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      const saveButton = target.closest('[data-save]');
      if (saveButton) {
        savePlace(saveButton);
        return;
      }
      const removeSaved = target.closest('[data-remove-saved]');
      if (removeSaved) {
        const id = removeSaved.dataset.removeSaved;
        const index = state.saved.findIndex((record) => record.id === id);
        if (index >= 0) {
          state.saved.splice(index, 1);
          persistState();
          syncSavedButtons();
          renderSavedList();
          showToast('Removed from your saved list.');
        }
        return;
      }
      const removeNote = target.closest('[data-delete-note]');
      if (removeNote) {
        const notes = state.notes[pageKey] || [];
        const remaining = notes.filter((note) => note.id !== removeNote.dataset.deleteNote);
        if (remaining.length !== notes.length) {
          if (remaining.length) state.notes[pageKey] = remaining;
          else delete state.notes[pageKey];
          persistState();
          renderNotes();
          setStatus('#note-status', `Private note deleted. ${persistencePhrase()}`);
        }
        return;
      }
      if (target.closest('[data-clear-data]')) clearPersonalData();
    });
  }

  function bindPersonalChoices() {
    document.querySelectorAll('[data-rating]').forEach((button) => {
      button.addEventListener('click', () => {
        const value = Number(button.dataset.rating);
        if (!Number.isInteger(value) || value < 1 || value > 5) return;
        state.ratings[pageKey] = value;
        persistState();
        syncRatings();
      });
    });
    document.querySelectorAll('[data-vote]').forEach((button) => {
      button.addEventListener('click', () => {
        const value = button.dataset.vote;
        if (value !== 'like' && value !== 'dislike') return;
        if (state.votes[pageKey] === value) delete state.votes[pageKey];
        else state.votes[pageKey] = value;
        persistState();
        syncVotes();
      });
    });
    document.querySelectorAll('[data-reaction]').forEach((button) => {
      button.addEventListener('click', () => {
        const value = button.dataset.reaction;
        if (!validReactions.has(value)) return;
        if (state.reactions[pageKey] === value) delete state.reactions[pageKey];
        else state.reactions[pageKey] = value;
        persistState();
        syncReactions();
      });
    });
    document.querySelectorAll('[data-poll]').forEach((button) => {
      button.addEventListener('click', () => {
        const value = button.dataset.poll;
        if (!validPollChoices.has(value)) return;
        state.polls[pageKey] = value;
        persistState();
        syncPoll();
      });
    });

    const form = document.getElementById('note-form');
    if (form) {
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const textarea = form.querySelector('textarea[name="note"]');
        if (!textarea || !form.reportValidity()) return;
        const text = textarea.value.trim();
        if (!text || text.length > 600) {
          setStatus('#note-status', 'Enter a private note of up to 600 characters.');
          textarea.focus();
          return;
        }
        if (!state.notes[pageKey]) state.notes[pageKey] = [];
        state.notes[pageKey].push({ id: noteId(), text, createdAt: new Date().toISOString() });
        persistState();
        renderNotes();
        textarea.value = '';
        setStatus('#note-status', `Private note saved on this device. ${storageAvailable ? '' : 'It will not persist after you leave this page.'}`.trim());
      });
    }
  }

  function initialize() {
    document.querySelectorAll('fieldset[data-enhance-form]').forEach((fieldset) => {
      fieldset.disabled = false;
    });
    syncMenu();
    syncSavedButtons();
    renderSavedList();
    syncRatings();
    syncVotes();
    syncReactions();
    syncPoll();
    renderNotes();
    syncSearchAndFilters();
    bindSharing();
    bindNewsletter();
    bindDelegatedActions();
    bindPersonalChoices();
    if (!storageAvailable) announceStorageLimitation();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();
