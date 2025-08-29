let sessionId = null;
async function start() {
  const r = await fetch('/session/start', { method: 'POST' });
  const j = await r.json();
  sessionId = j.session_id;
  append('bot', "Pour commencer, puis-je avoir votre nom, société, email, téléphone et code postal ?");
}
function append(who, text){
  const log = document.getElementById('log');
  const div = document.createElement('div');
  div.className = 'msg ' + who;
  div.textContent = text;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
}
async function send(){
  const input = document.getElementById('msg');
  const message = input.value.trim();
  if(!message) return;
  append('user', message);
  input.value = '';
  const r = await fetch('/chat', {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ session_id: sessionId, message })
  });
  const j = await r.json();
  append('bot', j.message || JSON.stringify(j));
}
document.getElementById('send').addEventListener('click', send);
document.getElementById('msg').addEventListener('keydown', (e)=>{ if(e.key==='Enter') send(); });
start();
