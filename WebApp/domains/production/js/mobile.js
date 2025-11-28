// Mobile sidebar controls

export function toggleMobileNav() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.querySelector('.mobile-overlay');
  sidebar.classList.toggle('mobile-open');
  overlay.classList.toggle('active');
}

export function closeMobileNav() {
  const sidebar = document.getElementById('sidebar');
  const overlay = document.querySelector('.mobile-overlay');
  sidebar.classList.remove('mobile-open');
  overlay.classList.remove('active');
}

