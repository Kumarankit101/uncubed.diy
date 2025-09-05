/**
 * Global API utility for making requests with the correct base path
 * This ensures all API calls work correctly with the /diy base path
 */

const API_BASE = '/diy/api';

/**
 * Make an API request with the correct base path
 * @param endpoint - The API endpoint (without /api prefix)
 * @param options - Fetch options
 * @returns Promise<Response>
 */
export async function apiRequest(endpoint: string, options?: RequestInit): Promise<Response> {
  const url = `${API_BASE}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  return fetch(url, options);
}

/**
 * Make a GET request to an API endpoint
 * @param endpoint - The API endpoint (without /api prefix)
 * @param params - URL search parameters
 * @returns Promise<Response>
 */
export async function apiGet(endpoint: string, params?: Record<string, string>): Promise<Response> {
  let url = `${API_BASE}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  if (params) {
    const searchParams = new URLSearchParams(params);
    url += `?${searchParams.toString()}`;
  }

  return fetch(url);
}

/**
 * Make a POST request to an API endpoint
 * @param endpoint - The API endpoint (without /api prefix)
 * @param data - Request body data
 * @param options - Additional fetch options
 * @returns Promise<Response>
 */
export async function apiPost(endpoint: string, data?: any, options?: RequestInit): Promise<Response> {
  const url = `${API_BASE}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  return fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    body: data ? JSON.stringify(data) : undefined,
    ...options,
  });
}

/**
 * Make a PUT request to an API endpoint
 * @param endpoint - The API endpoint (without /api prefix)
 * @param data - Request body data
 * @param options - Additional fetch options
 * @returns Promise<Response>
 */
export async function apiPut(endpoint: string, data?: any, options?: RequestInit): Promise<Response> {
  const url = `${API_BASE}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  return fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    body: data ? JSON.stringify(data) : undefined,
    ...options,
  });
}

/**
 * Make a DELETE request to an API endpoint
 * @param endpoint - The API endpoint (without /api prefix)
 * @param options - Additional fetch options
 * @returns Promise<Response>
 */
export async function apiDelete(endpoint: string, options?: RequestInit): Promise<Response> {
  const url = `${API_BASE}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  return fetch(url, {
    method: 'DELETE',
    ...options,
  });
}
