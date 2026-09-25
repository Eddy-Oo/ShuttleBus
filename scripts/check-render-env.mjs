for (const key of ['VITE_API_URL', 'VITE_SOCKET_URL']) {
  let url;
  try { url = new URL(process.env[key] || ''); } catch { throw new Error(`Set ${key} to the deployed HTTPS API origin before building the Render website`); }
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash || ['localhost', '127.0.0.1'].includes(url.hostname)) {
    throw new Error(`${key} must be a public HTTPS origin without credentials, a path, query or fragment`);
  }
}
console.info('Render frontend API and Socket.IO configuration validated.');
