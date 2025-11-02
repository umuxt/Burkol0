// Authentication utilities

export const getAuthToken = () => {
  try {
    const token = localStorage.getItem('bk_admin_token')
    // Development mode: use dev token if no real token exists
    if (!token && window.location.hostname === 'localhost') {
      return 'dev-admin-token'
    }
    return token
  } catch {
    // If localStorage fails, return dev token in development
    if (window.location.hostname === 'localhost') {
      return 'dev-admin-token'
    }
    return null
  }
}

export const isAuthenticated = () => {
  const token = getAuthToken()
  return token && token.length > 0
}

export const redirectToLogin = () => {
  console.log('🔒 Redirecting to login - no valid token found')
  // Remove invalid token
  localStorage.removeItem('bk_admin_token')
  
  // Redirect to login page
  window.location.href = '/login.html'
}

export const checkAuthAndRedirect = () => {
  if (!isAuthenticated()) {
    redirectToLogin()
    return false
  }
  return true
}

// Fetch with automatic auth handling
export const authenticatedFetch = async (url, options = {}) => {
  const token = getAuthToken()
  
  console.log('🔑 authenticatedFetch:', {
    url,
    token: token ? `${token.substring(0, 10)}...` : 'NO TOKEN',
    timestamp: new Date().toISOString()
  })
  
  if (!token) {
    throw new Error('No authentication token found')
  }
  
  const authOptions = {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  }
  
  try {
    const response = await fetch(url, authOptions)
    
    console.log('📡 authenticatedFetch response:', {
      url,
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries(response.headers.entries())
    })
    
    // If 401, redirect to login
    if (response.status === 401) {
      redirectToLogin()
      throw new Error('Authentication failed')
    }
    
    return response
  } catch (error) {
    console.error('❌ authenticatedFetch error:', {
      url,
      error: error.message,
      stack: error.stack
    })
    throw error
  }
}