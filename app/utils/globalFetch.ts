/**
 * Global fetch override to automatically handle /diy base path for API calls
 * This ensures all API calls work correctly without modifying every individual call
 */

// Store the original fetch function for export
let originalFetch: typeof fetch;

// Only run this in the browser environment
if (typeof window !== 'undefined') {
  console.log('🔧 Initializing global fetch override for /diy base path');

  // Store the original fetch function
  originalFetch = window.fetch;

  // Override the global fetch function
  window.fetch = function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    // Convert input to URL if it's a string
    let url: URL;

    if (typeof input === 'string') {
      // Only modify relative URLs that start with /api
      if (input.startsWith('/api')) {
        console.log('🔄 Redirecting API call:', input, '→', '/diy' + input);
        url = new URL(input, window.location.origin);
        url.pathname = '/diy' + url.pathname;
      } else {
        url = new URL(input, window.location.origin);
      }
    } else if (input instanceof URL) {
      url = new URL(input);

      // Only modify relative URLs that start with /api
      if (url.pathname.startsWith('/api')) {
        console.log('🔄 Redirecting API call:', url.pathname, '→', '/diy' + url.pathname);
        url.pathname = '/diy' + url.pathname;
      }
    } else {
      // For Request objects, we need to handle them differently
      return originalFetch(input, init);
    }

    // Call the original fetch with the modified URL
    return originalFetch(url.toString(), init);
  };

  console.log('✅ Global fetch override initialized successfully');
}

// Export the original fetch for cases where we need it
export { originalFetch };
