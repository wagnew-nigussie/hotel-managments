try {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });

  // Read the response as text first to see what came back
  const textResponse = await res.text();
  
  let data;
  try {
    data = JSON.parse(textResponse); // Try converting text to JSON
  } catch (parseError) {
    console.error('Server sent non-JSON response:', textResponse);
    showAlert('Server error: The server returned an invalid response.', 'error');
    return;
  }

  if (res.ok) {
    window.location.href = '/dashboard.html';
  } else {
    showAlert(data.error || 'Login failed', 'error');
  }

} catch (networkError) {
  console.error('Network error:', networkError);
  showAlert('Could not connect to the server. Is it running?', 'error');
}