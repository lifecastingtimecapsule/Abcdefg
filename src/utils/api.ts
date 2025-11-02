import { projectId, publicAnonKey } from './supabase/info';

const BASE_URL = `https://${projectId}.supabase.co/functions/v1/make-server-fe84bde0`;

export async function apiRequest(endpoint: string, options: RequestInit = {}) {
  const token = localStorage.getItem('access_token');
  
  console.log(`[API Request] Endpoint: ${endpoint}`);
  console.log(`[API Request] Token exists: ${!!token}`);
  console.log(`[API Request] Token length: ${token?.length}`);
  
  if (!token) {
    console.error('No access token found in localStorage');
    console.error('Available localStorage keys:', Object.keys(localStorage));
    throw new Error('Unauthorized - Please login again');
  }
  
  const url = `${BASE_URL}${endpoint}`;
  console.log(`[API Request] Full URL: ${url}`);
  
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers,
    },
  });

  console.log(`[API Request] Response status: ${response.status}`);
  
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    console.error(`[API Error] Endpoint: ${endpoint}`, error);
    console.error(`[API Error] Status: ${response.status}`);
    
    // If unauthorized, clear token and redirect to login
    if (response.status === 401) {
      console.error('[API Error] Unauthorized - clearing token and reloading');
      localStorage.removeItem('access_token');
      window.location.reload();
    }
    
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  const data = await response.json();
  console.log(`[API Success] Endpoint: ${endpoint}`, data);
  return data;
}
