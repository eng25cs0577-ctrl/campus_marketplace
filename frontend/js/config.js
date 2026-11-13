// Where the API lives.
// After deploying the backend to Render, replace the URL below with yours
// (Render dashboard → your service → the URL under the service name).
const RENDER_API_URL = 'https://campus-marketplace-api-nkyy.onrender.com';

const isLocal = ['localhost', '127.0.0.1', ''].includes(window.location.hostname);

// Running the frontend locally (Live Server on :5500 or a file:// page) → talk to the local API.
window.API_BASE_URL = isLocal ? 'http://localhost:3000' : RENDER_API_URL;
