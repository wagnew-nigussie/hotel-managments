
function showAlert(message, type = 'error') {
  const alertBox = document.getElementById('alert-box');

  if (!alertBox) {
    console.log(message);
    return;
  }

  alertBox.textContent = message;
  alertBox.className = `alert alert-${type}`;
  alertBox.style.display = 'block';
}

async function checkAuth() {
  try {
    const response = await fetch('/api/auth/me');

    if (!response.ok) {
      window.location.replace('/login.html');
      return;
    }

    const user = await response.json();

    // Keep the current user's role available to the page.
    window.currentUser = user;
  } catch (error) {
    console.error('Authentication check failed:', error);
    window.location.replace('/login.html');
  }
}

function setupSidebar(activePage) {
  const container = document.getElementById('sidebar-container');

  if (!container) return;

  const links = [
    ['dashboard', 'Dashboard', '/dashboard.html'],
    ['rooms', 'Rooms', '/rooms.html'],
    ['guests', 'Guests', '/guests.html'],
    ['bookings', 'Bookings', '/bookings.html'],
    ['checkin', 'Check-in / Check-out', '/checkin.html'],
    ['billing', 'Billing', '/billing.html'],
    ['housekeeping', 'Housekeeping', '/housekeeping.html'],
    ['reports', 'Reports', '/reports.html'],
    ['staff', 'Staff Management', '/staff.html']
  ];

  container.innerHTML = `
    <aside class="sidebar">
      <h2>GrandHotel</h2>
      <nav>
        ${links.map(([id, label, url]) => `
          <a href="${url}" class="${id === activePage ? 'active' : ''}">
            ${label}
          </a>
        `).join('')}
      </nav>
      <div class="sidebar-footer">
        <button type="button" id="logout-button">Logout</button>
      </div>
    </aside>
  `;

  document.getElementById('logout-button').addEventListener('click', async () => {
    try {
      const response = await fetch('/api/auth/logout', {
        method: 'POST'
      });

      if (response.ok) {
        window.location.replace('/login.html');
      } else {
        showAlert('Could not log out. Please try again.', 'error');
      }
    } catch (error) {
      console.error('Logout failed:', error);
      showAlert('Could not connect to the server.', 'error');
    }
  });
}
