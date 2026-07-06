const messagesEl = document.getElementById('messages');
const form = document.getElementById('chat-form');
const textInput = document.getElementById('text-input');
const fileInput = document.getElementById('file-input');
const previewRow = document.getElementById('preview-row');
const sendBtn = document.getElementById('send-btn');

let pendingFiles = [];
let history = [];

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

fileInput.addEventListener('change', async () => {
  pendingFiles = Array.from(fileInput.files).slice(0, 6);
  previewRow.innerHTML = '';
  for (const file of pendingFiles) {
    const url = await fileToDataUrl(file);
    const img = document.createElement('img');
    img.src = url;
    previewRow.appendChild(img);
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

function addMessage(role, text, imageUrls = []) {
  const div = document.createElement('div');
  div.className = `msg ${role}`;
  div.textContent = text;
  for (const url of imageUrls) {
    const img = document.createElement('img');
    img.src = url;
    div.appendChild(img);
  }
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return div;
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = textInput.value.trim();
  if (!text && pendingFiles.length === 0) return;

  const imageUrls = await Promise.all(pendingFiles.map(fileToDataUrl));
  addMessage('user', text, imageUrls);

  const formData = new FormData();
  formData.append('message', text);
  formData.append('history', JSON.stringify(history));
  for (const file of pendingFiles) formData.append('images', file);

  const userContent = [];
  if (text) userContent.push({ type: 'text', text });
  for (let i = 0; i < pendingFiles.length; i++) {
    const dataUrl = imageUrls[i];
    const [, mediaType, base64] = dataUrl.match(/^data:(.+);base64,(.*)$/);
    userContent.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } });
  }

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
    history.push({ role: 'user', content: userContent });
    history.push({ role: 'assistant', content: [{ type: 'text', text: data.reply }] });
  } catch (err) {
    loadingEl.remove();
    addMessage('bot', '⚠️ Network error. Please try again.');
  } finally {
    sendBtn.disabled = false;
  }
});

addMessage('bot', "👋 I'm PlacardBot, your DOT/PHMSA HAZMAT placarding assistant.\n\nSend me a Bill of Lading photo, or describe a shipment's UN number and quantity, and I'll tell you exactly which placards are required.");
