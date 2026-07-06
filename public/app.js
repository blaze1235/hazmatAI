const messagesEl = document.getElementById('messages');
const form = document.getElementById('chat-form');
const textInput = document.getElementById('text-input');
const fileInput = document.getElementById('file-input');
const previewRow = document.getElementById('preview-row');
const sendBtn = document.getElementById('send-btn');

let pendingFiles = [];
let history = [];

function getSessionId() {
  let id = localStorage.getItem('placardbot_session_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('placardbot_session_id', id);
  }
  return id;
}
const sessionId = getSessionId();

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function isPdf(file) {
  return file.type === 'application/pdf';
}

fileInput.addEventListener('change', async () => {
  pendingFiles = Array.from(fileInput.files).slice(0, 6);
  previewRow.innerHTML = '';
  for (const file of pendingFiles) {
    if (isPdf(file)) {
      const badge = document.createElement('div');
      badge.className = 'file-badge';
      badge.textContent = `📄 ${file.name}`;
      previewRow.appendChild(badge);
    } else {
      const url = await fileToDataUrl(file);
      const img = document.createElement('img');
      img.src = url;
      previewRow.appendChild(img);
    }
  }
});

textInput.addEventListener('input', () => {
  textInput.style.height = 'auto';
  textInput.style.height = Math.min(textInput.scrollHeight, 140) + 'px';
});

textInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    form.requestSubmit();
  }
});

function addMessage(role, text, attachments = []) {
  const div = document.createElement('div');
  div.className = `msg ${role}`;
  div.textContent = text;
  for (const att of attachments) {
    if (att.kind === 'pdf') {
      const badge = document.createElement('div');
      badge.className = 'file-badge';
      badge.textContent = `📄 ${att.name}`;
      div.appendChild(badge);
    } else {
      const img = document.createElement('img');
      img.src = att.url;
      div.appendChild(img);
    }
  }
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return div;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = textInput.value.trim();
  if (!text && pendingFiles.length === 0) return;

  const attachments = [];
  const userParts = [];
  if (text) userParts.push({ text });

  for (const file of pendingFiles) {
    if (isPdf(file)) {
      attachments.push({ kind: 'pdf', name: file.name });
      userParts.push({ text: `[Attached PDF: ${file.name}]` });
    } else {
      const url = await fileToDataUrl(file);
      attachments.push({ kind: 'image', url });
      const [, mediaType, base64] = url.match(/^data:(.+);base64,(.*)$/);
      userParts.push({ inlineData: { mimeType: mediaType, data: base64 } });
    }
  }

  addMessage('user', text, attachments);

  const formData = new FormData();
  formData.append('message', text);
  formData.append('sessionId', sessionId);
  formData.append('history', JSON.stringify(history));
  for (const file of pendingFiles) formData.append('files', file);

  textInput.value = '';
  textInput.style.height = 'auto';
  fileInput.value = '';
  pendingFiles = [];
  previewRow.innerHTML = '';
  sendBtn.disabled = true;

  const loadingEl = addMessage('bot loading', 'PlacardBot is analyzing…');

  try {
    const res = await fetch('/api/chat', { method: 'POST', body: formData });
    const data = await res.json();
    loadingEl.remove();

    if (!res.ok) {
      addMessage('bot', `⚠️ ${data.error || 'Something went wrong.'}`);
      return;
    }

    addMessage('bot', data.reply);
    history.push({ role: 'user', parts: userParts });
    history.push({ role: 'model', parts: [{ text: data.reply }] });
  } catch (err) {
    loadingEl.remove();
    addMessage('bot', '⚠️ Network error. Please try again.');
  } finally {
    sendBtn.disabled = false;
  }
});

addMessage('bot', "👋 I'm PlacardBot, your DOT/PHMSA HAZMAT placarding assistant.\n\nSend me a Bill of Lading photo or PDF, or describe a shipment's UN number and quantity, and I'll tell you exactly which placards are required.");
