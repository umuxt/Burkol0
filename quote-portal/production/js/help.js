// Help overlay and behavior

export function openHelp() {
  document.getElementById('help-overlay').classList.add('active');
  document.getElementById('help-panel').classList.add('active');
  document.body.style.overflow = 'hidden';
}

export function closeHelp() {
  document.getElementById('help-overlay').classList.remove('active');
  document.getElementById('help-panel').classList.remove('active');
  document.body.style.overflow = 'auto';
}

export function switchHelpTab(tabName) {
  document.querySelectorAll('.help-tab').forEach(tab => tab.classList.remove('active'));
  document.querySelectorAll('.help-section').forEach(section => section.classList.remove('active'));
  event.target.classList.add('active');
  document.getElementById('help-' + tabName).classList.add('active');
}

export function toggleFAQ(button) {
  const answer = button.nextElementSibling;
  const arrow = button.querySelector('span:last-child');
  if (answer.classList.contains('open')) {
    answer.classList.remove('open');
    arrow.textContent = '▼';
  } else {
    document.querySelectorAll('.help-faq-answer').forEach(item => item.classList.remove('open'));
    document.querySelectorAll('.help-faq-question span:last-child').forEach(arr => { arr.textContent = '▼'; });
    answer.classList.add('open');
    arrow.textContent = '▲';
  }
}

export function initHelp() {
  document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') closeHelp();
  });
  // Optional: log
  try { console.log('🆘 Help system initialized'); } catch {}
}

