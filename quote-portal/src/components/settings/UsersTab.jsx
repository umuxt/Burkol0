// Users Tab - User management interface for admin settings
import React from 'react';
import API from '../../lib/api.js'

const { useState, useEffect } = React;

export default function UsersTab({ t, showNotification }) {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(false)
  const [newUser, setNewUser] = useState({ email: '', password: '', role: 'admin' })
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingUser, setEditingUser] = useState(null)
  const [hoveredPassword, setHoveredPassword] = useState(null)
  const [activeView, setActiveView] = useState('users')
  const [sessions, setSessions] = useState([])
  const [sessionsLoading, setSessionsLoading] = useState(false)
  const [selectedSession, setSelectedSession] = useState(null)
  
  // Admin erişim kontrolü için
  const [showAccessModal, setShowAccessModal] = useState(false)
  const [accessCredentials, setAccessCredentials] = useState({ email: '', password: '' })
  const [isVerified, setIsVerified] = useState(false)

  useEffect(() => {
    // Admin panel erişimi için doğrulama gerekli
    if (!isVerified) {
      setShowAccessModal(true)
      return
    }
    if (activeView === 'sessions') {
      loadSessions()
    } else {
      loadUsers()
    }
  }, [isVerified, activeView])

  async function loadUsers() {
    try {
      setLoading(true)
      const userList = await API.listUsers()
      setUsers(userList)
    } catch (e) {
      console.error('Users load error:', e)
      showNotification(t.users_load_error || 'Kullanıcılar yüklenemedi', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function loadSessions(options = {}) {
    const silent = typeof options === 'object' && options !== null && options.silent === true
    try {
      if (!silent) setSessionsLoading(true)
      const sessionList = await API.listSessions()
      if (!Array.isArray(sessionList)) {
        setSessions([])
        return []
      }

      const uniqueSessionsMap = new Map()
      sessionList.forEach(item => {
        if (!item || !item.sessionId) return
        const existing = uniqueSessionsMap.get(item.sessionId)
        if (!existing) {
          uniqueSessionsMap.set(item.sessionId, item)
          return
        }

        const existingTime = new Date(existing.lastActivityAt || existing.loginTime || 0).getTime()
        const incomingTime = new Date(item.lastActivityAt || item.loginTime || 0).getTime()
        if (incomingTime > existingTime) {
          uniqueSessionsMap.set(item.sessionId, item)
        }
      })

      const sortedSessions = Array.from(uniqueSessionsMap.values()).sort((a, b) => {
        const aTime = new Date(a.lastActivityAt || a.loginTime || 0).getTime()
        const bTime = new Date(b.lastActivityAt || b.loginTime || 0).getTime()
        return bTime - aTime
      })

      setSessions(sortedSessions)
      return sortedSessions
    } catch (e) {
      console.error('Sessions load error:', e)
      showNotification(t.sessions_load_error || 'Oturumlar yüklenemedi', 'error')
      setSessions([])
      return []
    } finally {
      if (!silent) setSessionsLoading(false)
    }
  }

  // Admin erişim doğrulama fonksiyonu
  async function handleAdminAccess() {
    try {
      if (!accessCredentials.email || !accessCredentials.password) {
        showNotification(t.admin_access_required || 'Email ve şifre gerekli', 'error')
        return
      }

      setLoading(true)

      // Merkezi API istemcisini kullanarak login ol (token depolama dahil)
      const result = await API.login(accessCredentials.email, accessCredentials.password, true)

      if (!result || !result.user) {
        showNotification(t.admin_access_invalid || 'Geçersiz kullanıcı bilgileri', 'error')
        return
      }

      // Role kontrolü - sadece admin rolündeki kullanıcılar erişebilir
      if (result.user.role !== 'admin') {
        showNotification(t.admin_access_denied || 'Bu panele erişim yetkiniz yok. Sadece admin kullanıcıları bu bölüme erişebilir.', 'error')
        return
      }

      // Başarılı doğrulama
      setIsVerified(true)
      setShowAccessModal(false)
      setAccessCredentials({ email: '', password: '' })
      showNotification(t.admin_access_granted || 'Admin erişimi onaylandı', 'success')

      // Girişten sonra mevcut görünüm için verileri yenile
      if (activeView === 'sessions') {
        await loadSessions()
      } else {
        await loadUsers()
      }
      
    } catch (e) {
      console.error('Admin access error:', e)
      showNotification(t.admin_access_error || 'Erişim doğrulama hatası', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function handleAddUser() {
    try {
      if (!newUser.email || !newUser.password) {
        showNotification(t.users_email_required || 'Email ve şifre gerekli', 'error')
        return
      }
      
      if (newUser.password.length < 6) {
        showNotification(t.users_password_min || 'Şifre en az 6 karakter olmalı', 'error')
        return
      }
      
      setLoading(true)
      await API.addUser(newUser.email, newUser.password, newUser.role)
      setNewUser({ email: '', password: '', role: 'admin' })
      setShowAddForm(false)
      await loadUsers()
      showNotification(t.users_added || 'Kullanıcı eklendi', 'success')
    } catch (e) {
      console.error('Add user error:', e)
      showNotification(e.message || t.users_add_error || 'Kullanıcı eklenemedi', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function handleDeleteUser(email) {
    const user = users.find(u => u.email === email)
    const actionText = user && user.active 
      ? (t.users_deactivate || 'devre dışı bırakmak') 
      : (t.users_activate || 'aktifleştirmek')
    
    if (!confirm(`${email} ${t.users_confirm_action || 'kullanıcısını'} ${actionText} ${t.users_confirm_suffix || 'istediğinizden emin misiniz?'}`)) {
      return
    }
    
    try {
      setLoading(true)
      await API.deleteUser(email) // Backend'de soft delete yapıyor
      await loadUsers()
      const resultText = user && user.active 
        ? (t.users_deactivated || 'Kullanıcı devre dışı bırakıldı') 
        : (t.users_activated || 'Kullanıcı aktifleştirildi')
      showNotification(resultText, 'success')
    } catch (e) {
      console.error('Toggle user status error:', e)
      showNotification(e.message || t.users_toggle_error || 'Kullanıcı durumu değiştirilemedi', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function handleUpdateUser(email, updates) {
    try {
      setLoading(true)
      await API.updateUser(email, updates)
      setEditingUser(null)
      await loadUsers()
      showNotification(t.users_updated || 'Kullanıcı güncellendi', 'success')
    } catch (e) {
      console.error('Update user error:', e)
      showNotification(e.message || t.users_update_error || 'Kullanıcı güncellenemedi', 'error')
    } finally {
      setLoading(false)
    }
  }

  function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('tr-TR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  function formatDateTime(dateString) {
    if (!dateString) return '-'
    const date = new Date(dateString)
    if (isNaN(date.getTime())) return '-'
    return date.toLocaleString('tr-TR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  function isSessionActive(session) {
    if (!session?.expires) return false
    return new Date(session.expires) > new Date()
  }

  function getRoleLabel(role) {
    if (role === 'admin') return t.users_role_admin || 'Admin'
    if (role === 'user') return t.users_role_user || 'Kullanıcı'
    return role
  }

  function openSessionDetails(session) {
    setSelectedSession(session)
    loadSessions({ silent: true }).then(latestSessions => {
      const freshSession = Array.isArray(latestSessions)
        ? latestSessions.find(s => s.sessionId === session.sessionId)
        : null
      if (freshSession) {
        setSelectedSession(freshSession)
      }
    }).catch(() => {
      // Already notified in loadSessions, no extra handling needed here
    })
  }

  function closeSessionDetails() {
    setSelectedSession(null)
  }

  const isLogView = activeView === 'sessions'
  const sessionActivities = selectedSession && Array.isArray(selectedSession.activityLog)
    ? [...selectedSession.activityLog].sort((a, b) => {
        const aTime = new Date(a?.timestamp || a?.createdAt || 0).getTime()
        const bTime = new Date(b?.timestamp || b?.createdAt || 0).getTime()
        return bTime - aTime
      })
    : null

  function formatActivityMetadata(metadata) {
    if (!metadata || typeof metadata !== 'object') return []
    const items = []
    Object.entries(metadata).forEach(([key, value]) => {
      const label = String(key).replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').trim()
      if (value === null || value === undefined) return
      if (Array.isArray(value)) {
        if (value.length === 0) return
        items.push(`${label}: ${value.join(', ')}`)
      } else if (typeof value === 'object') {
        // Skip nested objects to keep output compact
        return
      } else {
        items.push(`${label}: ${value}`)
      }
    })
    return items
  }

  return React.createElement(React.Fragment, null,
    // Sadece doğrulanmış kullanıcılar ana içeriği görebilir
    isVerified && React.createElement(React.Fragment, null,
      React.createElement('div', {
        style: {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '20px'
        }
      },
        React.createElement('h3', null, isLogView ? (t.sessions_title || 'Log History') : (t.users_title || 'Kullanıcı Yönetimi')),
        React.createElement('div', { style: { display: 'flex', gap: '10px' } },
          !isLogView && React.createElement('button', {
            onClick: () => setShowAddForm(!showAddForm),
            className: 'btn btn-primary'
          }, showAddForm ? (t.users_cancel || 'İptal') : (t.users_new_user || 'Yeni Kullanıcı')),
          React.createElement('button', {
            onClick: () => {
              if (isLogView) {
                setActiveView('users')
              } else {
                setActiveView('sessions')
                setShowAddForm(false)
              }
            },
            className: 'btn btn-secondary'
          }, isLogView ? (t.sessions_back_to_users || 'Kullanıcı Yönetimi') : (t.sessions_log_history || 'Log History / Log Geçmişi'))
        )
      ),

      !isLogView && showAddForm && React.createElement('div', { style: { marginBottom: '20px', padding: '20px', border: '1px solid #ddd', borderRadius: '8px', backgroundColor: '#f9f9f9' } },
        React.createElement('h4', null, t.users_new_user || 'Yeni Kullanıcı Ekle'),
        React.createElement('div', { className: 'form-group' },
          React.createElement('label', null, t.users_email || 'Email'),
          React.createElement('input', {
            type: 'email',
            value: newUser.email,
            onChange: (e) => setNewUser({ ...newUser, email: e.target.value }),
            className: 'form-control',
            placeholder: t.users_email_placeholder || 'kullanici@domain.com'
          })
        ),
        React.createElement('div', { className: 'form-group' },
          React.createElement('label', null, t.users_password || 'Şifre'),
          React.createElement('input', {
            type: 'password',
            value: newUser.password,
            onChange: (e) => setNewUser({ ...newUser, password: e.target.value }),
            className: 'form-control',
            placeholder: t.users_password_placeholder || 'En az 6 karakter'
          })
        ),
        React.createElement('div', { className: 'form-group' },
          React.createElement('label', null, t.users_role || 'Rol'),
          React.createElement('select', {
            value: newUser.role,
            onChange: (e) => setNewUser({ ...newUser, role: e.target.value }),
            className: 'form-control'
          },
            React.createElement('option', { value: 'admin' }, t.users_role_admin || 'Admin'),
            React.createElement('option', { value: 'user' }, t.users_role_user || 'Kullanıcı')
          )
        ),
        React.createElement('button', {
          onClick: handleAddUser,
          className: 'btn btn-primary',
          disabled: !newUser.email || !newUser.password || loading
        }, t.users_add_user || 'Kullanıcı Ekle')
      ),

      isLogView
        ? (sessionsLoading
            ? React.createElement('p', null, t.loading || 'Yükleniyor...')
            : (sessions.length === 0
                ? React.createElement('p', null, t.sessions_empty || 'Henüz oturum kaydı yok.')
                : React.createElement('table', { style: { width: '100%', borderCollapse: 'collapse', border: '1px solid #ddd' } },
                    React.createElement('thead', null,
                      React.createElement('tr', { style: { backgroundColor: '#f5f5f5' } },
                        React.createElement('th', { style: { padding: '12px', textAlign: 'left', borderBottom: '1px solid #ddd' } }, t.sessions_session_id || 'Oturum ID'),
                        React.createElement('th', { style: { padding: '12px', textAlign: 'left', borderBottom: '1px solid #ddd' } }, t.sessions_user || 'Kullanıcı'),
                        React.createElement('th', { style: { padding: '12px', textAlign: 'left', borderBottom: '1px solid #ddd' } }, t.users_email || 'Email'),
                        React.createElement('th', { style: { padding: '12px', textAlign: 'left', borderBottom: '1px solid #ddd' } }, t.sessions_login || 'Giriş'),
                        React.createElement('th', { style: { padding: '12px', textAlign: 'left', borderBottom: '1px solid #ddd' } }, t.sessions_expires || 'Sona Erme'),
                        React.createElement('th', { style: { padding: '12px', textAlign: 'center', borderBottom: '1px solid #ddd' } }, t.users_status || 'Durum'),
                        React.createElement('th', { style: { padding: '12px', textAlign: 'center', borderBottom: '1px solid #ddd' } }, t.sessions_actions || 'İşlemler')
                      )
                    ),
                    React.createElement('tbody', null,
                      sessions.map(session =>
                        React.createElement('tr', { key: session.sessionId || session.token, style: { borderBottom: '1px solid #eee' } },
                          React.createElement('td', { style: { padding: '12px' } }, session.sessionId || '—'),
                          React.createElement('td', { style: { padding: '12px' } }, session.userName || '—'),
                          React.createElement('td', { style: { padding: '12px' } }, session.email || '—'),
                          React.createElement('td', { style: { padding: '12px' } }, formatDateTime(session.loginTime)),
                          React.createElement('td', { style: { padding: '12px' } }, formatDateTime(session.expires)),
                          React.createElement('td', { style: { padding: '12px', textAlign: 'center' } },
                            React.createElement('span', {
                              style: {
                                padding: '4px 8px',
                                borderRadius: '4px',
                                fontSize: '12px',
                                fontWeight: 'bold',
                                backgroundColor: isSessionActive(session) ? '#d4edda' : '#f8d7da',
                                color: isSessionActive(session) ? '#155724' : '#721c24'
                              }
                            }, isSessionActive(session) ? (t.users_active || 'Aktif') : (t.sessions_expired || 'Süresi Dolmuş'))
                          ),
                          React.createElement('td', { style: { padding: '12px', textAlign: 'center' } },
                            React.createElement('div', { style: { display: 'flex', justifyContent: 'center' } },
                              React.createElement('button', {
                                type: 'button',
                                className: 'btn btn-secondary',
                                style: { fontSize: '12px', padding: '4px 8px' },
                                disabled: sessionsLoading,
                                onClick: () => openSessionDetails(session)
                              }, t.sessions_details || 'Detaylar')
                            )
                          )
                        )
                      )
                    )
                  )
              ))
        : (users.length === 0 
            ? React.createElement('p', null, t.users_no_users || 'Henüz kullanıcı eklenmemiş.')
            : React.createElement('table', { style: { width: '100%', borderCollapse: 'collapse', border: '1px solid #ddd' } },
                React.createElement('thead', null,
                  React.createElement('tr', { style: { backgroundColor: '#f5f5f5' } },
                    React.createElement('th', { style: { padding: '12px', textAlign: 'left', borderBottom: '1px solid #ddd' } }, t.users_email || 'Email'),
                    React.createElement('th', { style: { padding: '12px', textAlign: 'left', borderBottom: '1px solid #ddd' } }, t.users_password || 'Şifre'),
                    React.createElement('th', { style: { padding: '12px', textAlign: 'left', borderBottom: '1px solid #ddd' } }, t.users_role || 'Rol'),
                    React.createElement('th', { style: { padding: '12px', textAlign: 'center', borderBottom: '1px solid #ddd' } }, t.users_status || 'Durum'),
                    React.createElement('th', { style: { padding: '12px', textAlign: 'center', borderBottom: '1px solid #ddd' } }, t.users_actions || 'İşlemler')
                  )
                ),
                React.createElement('tbody', null,
                  users.map(user => 
                    React.createElement('tr', { key: user.email, style: { borderBottom: '1px solid #eee' } },
                      React.createElement('td', { style: { padding: '12px' } }, user.email),
                      React.createElement('td', { style: { padding: '12px' } },
                        React.createElement('span', { 
                          style: { 
                            fontFamily: 'monospace',
                            backgroundColor: '#f0f0f0',
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '12px',
                            cursor: (user.hasPlainPassword && user.password !== '••••••••') ? 'pointer' : 'default',
                            userSelect: 'text',
                            transition: 'all 0.2s ease',
                            minWidth: '80px',
                            display: 'inline-block'
                          },
                          onMouseEnter: () => {
                            if (user.hasPlainPassword && user.password !== '••••••••') {
                              setHoveredPassword(user.email)
                            }
                          },
                          onMouseLeave: () => setHoveredPassword(null),
                          title: (user.hasPlainPassword && user.password !== '••••••••') 
                            ? 'Fare ile üzerine gelin ve kopyalayın' 
                            : 'Hashlenmiş şifre - görüntülenemez'
                        }, (hoveredPassword === user.email && user.hasPlainPassword && user.password !== '••••••••') 
                          ? user.password 
                          : '••••••••')
                      ),
                      React.createElement('td', { style: { padding: '12px' } }, getRoleLabel(user.role)),
                      React.createElement('td', { style: { padding: '12px', textAlign: 'center' } },
                        React.createElement('span', {
                          style: {
                            padding: '4px 8px',
                            borderRadius: '4px',
                            fontSize: '12px',
                            fontWeight: 'bold',
                            backgroundColor: user.active ? '#d4edda' : '#f8d7da',
                            color: user.active ? '#155724' : '#721c24'
                          }
                        }, user.active ? (t.users_active || 'Aktif') : (t.users_inactive || 'Pasif'))
                      ),
                      React.createElement('td', { style: { padding: '12px', textAlign: 'center' } },
                        React.createElement('div', { style: { display: 'flex', gap: '8px', justifyContent: 'center' } },
                          React.createElement('button', {
                            onClick: () => setEditingUser(user),
                            className: 'btn btn-warning',
                            style: { fontSize: '12px', padding: '4px 8px' },
                            disabled: loading
                          }, t.users_edit || 'Düzenle'),
                          React.createElement('button', {
                            onClick: () => handleDeleteUser(user.email),
                            className: user.active ? 'btn btn-warning' : 'btn btn-success',
                            style: { fontSize: '12px', padding: '4px 8px' },
                            disabled: loading
                          }, user.active ? (t.users_deactivate || 'Devre Dışı') : (t.users_activate || 'Aktifleştir'))
                        )
                      )
                    )
                  )
                )
              )),

      selectedSession && React.createElement('div', {
        style: {
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }
      },
        React.createElement('div', {
          style: {
            backgroundColor: '#fff',
            padding: '24px',
            borderRadius: '8px',
            width: '520px',
            maxWidth: '90vw',
            maxHeight: '80vh',
            overflowY: 'auto'
          }
        },
          React.createElement('h4', null, t.sessions_details_title || 'Log Detayları'),
          React.createElement('p', { style: { color: '#666', marginTop: '4px', marginBottom: '16px' } },
            selectedSession.userName || selectedSession.email || 'Oturum'),
          React.createElement('div', {
            style: {
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: '12px 16px',
              marginBottom: '20px'
            }
          },
            React.createElement('div', null,
              React.createElement('div', { style: { fontSize: '12px', color: '#888', textTransform: 'uppercase' } }, t.sessions_session_id || 'Oturum ID'),
              React.createElement('div', { style: { fontWeight: 'bold' } }, selectedSession.sessionId || '—')
            ),
            React.createElement('div', null,
              React.createElement('div', { style: { fontSize: '12px', color: '#888', textTransform: 'uppercase' } }, t.users_email || 'Email'),
              React.createElement('div', { style: { fontWeight: 'bold' } }, selectedSession.email || '—')
            ),
            React.createElement('div', null,
              React.createElement('div', { style: { fontSize: '12px', color: '#888', textTransform: 'uppercase' } }, t.sessions_login || 'Giriş'),
              React.createElement('div', null, formatDateTime(selectedSession.loginTime))
            ),
            React.createElement('div', null,
              React.createElement('div', { style: { fontSize: '12px', color: '#888', textTransform: 'uppercase' } }, t.sessions_expires || 'Sona Erme'),
              React.createElement('div', null, formatDateTime(selectedSession.expires))
            ),
            React.createElement('div', null,
              React.createElement('div', { style: { fontSize: '12px', color: '#888', textTransform: 'uppercase' } }, t.users_status || 'Durum'),
              React.createElement('div', null, isSessionActive(selectedSession) ? (t.users_active || 'Aktif') : (t.sessions_expired || 'Süresi Dolmuş'))
            ),
            selectedSession.token && React.createElement('div', null,
              React.createElement('div', { style: { fontSize: '12px', color: '#888', textTransform: 'uppercase' } }, t.sessions_token || 'Token'),
              React.createElement('div', { style: { fontFamily: 'monospace', fontSize: '12px', wordBreak: 'break-all' } }, selectedSession.token)
            )
          ),
          React.createElement('div', {
            style: {
              backgroundColor: '#f8f9fa',
              borderRadius: '6px',
              padding: '16px',
              border: '1px solid #e0e0e0'
            }
          },
            React.createElement('div', { style: { marginBottom: '12px', fontWeight: 'bold' } }, t.sessions_activity_title || 'Sistem Aktiviteleri'),
            sessionActivities && sessionActivities.length > 0
              ? React.createElement('ul', { style: { paddingLeft: '18px', margin: 0 } },
                  sessionActivities.map((activity, idx) => {
                    const performerLabel = activity?.performedBy?.email || activity?.performedBy?.userName || null
                    const metadataSummary = formatActivityMetadata(activity?.metadata || {}).slice(0, 3)
                    return React.createElement('li', { key: idx, style: { marginBottom: '8px' } },
                      React.createElement('div', { style: { fontWeight: 'bold' } }, activity.title || activity.type || t.sessions_activity_unknown || 'Aktivite'),
                      activity.timestamp && React.createElement('div', { style: { fontSize: '12px', color: '#666' } }, formatDateTime(activity.timestamp)),
                      performerLabel && React.createElement('div', { style: { fontSize: '12px', color: '#666' } }, performerLabel),
                      activity.description && React.createElement('div', { style: { marginTop: '4px', color: '#444' } }, activity.description),
                      metadataSummary.length > 0 && React.createElement('div', { style: { marginTop: '4px', color: '#555', fontSize: '12px' } }, metadataSummary.join(' • '))
                    )
                  })
                )
              : React.createElement('div', { style: { color: '#666', fontSize: '14px' } },
                  t.sessions_activity_placeholder || 'Bu oturum için sistem aktiviteleri yakında eklenecek.')
          ),
          React.createElement('div', { style: { marginTop: '24px', display: 'flex', justifyContent: 'flex-end' } },
            React.createElement('button', {
              onClick: closeSessionDetails,
              className: 'btn btn-secondary'
            }, t.sessions_close_details || 'Kapat')
          )
        )
      ),

      // Edit User Modal
      editingUser && React.createElement('div', {
        style: {
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }
      },
        React.createElement('div', {
          style: {
            backgroundColor: 'white',
            padding: '20px',
            borderRadius: '8px',
            width: '400px',
            maxWidth: '90vw'
          }
        },
          React.createElement('h4', null, t.users_edit_user || 'Kullanıcı Düzenle'),
          React.createElement('div', { className: 'form-group' },
            React.createElement('label', null, t.users_email || 'Email'),
            React.createElement('input', {
              type: 'email',
              value: editingUser.email,
              disabled: true,
              className: 'form-control',
              style: { backgroundColor: '#f5f5f5' }
            })
          ),
          React.createElement('div', { className: 'form-group' },
            React.createElement('label', null, t.users_new_password || 'Yeni Şifre (Boş bırakılırsa değişmez)'),
            React.createElement('input', {
              type: 'password',
              value: editingUser.newPassword || '',
              onChange: (e) => setEditingUser({ ...editingUser, newPassword: e.target.value }),
              className: 'form-control',
              placeholder: t.users_password_placeholder || 'En az 6 karakter'
            })
          ),
          React.createElement('div', { className: 'form-group' },
            React.createElement('label', null, t.users_role || 'Rol'),
            React.createElement('select', {
              value: editingUser.role,
              onChange: (e) => setEditingUser({ ...editingUser, role: e.target.value }),
              className: 'form-control'
            },
              React.createElement('option', { value: 'admin' }, t.users_role_admin || 'Admin'),
              React.createElement('option', { value: 'user' }, t.users_role_user || 'Kullanıcı')
            )
          ),
          React.createElement('div', { style: { display: 'flex', gap: '10px', marginTop: '20px' } },
            React.createElement('button', {
              onClick: () => {
                const updates = { role: editingUser.role }
                if (editingUser.newPassword && editingUser.newPassword.length >= 6) {
                  updates.password = editingUser.newPassword
                }
                handleUpdateUser(editingUser.email, updates)
              },
              className: 'btn btn-primary',
              disabled: loading || (editingUser.newPassword && editingUser.newPassword.length < 6)
            }, t.users_save || 'Kaydet'),
            React.createElement('button', {
              onClick: () => setEditingUser(null),
              className: 'btn btn-secondary'
            }, t.users_cancel || 'İptal')
          )
        )
      )
    ), // Ana içerik bloğunu kapat

    // Admin Erişim Modal
    showAccessModal && React.createElement('div', {
      style: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }
    },
      React.createElement('div', {
        style: {
          backgroundColor: 'white',
          padding: '30px',
          borderRadius: '8px',
          width: '400px',
          maxWidth: '90vw',
          textAlign: 'center'
        }
      },
        React.createElement('h3', { 
          style: { marginBottom: '20px', color: '#d32f2f' } 
        }, '🔐 ' + (t.admin_access_title || 'Admin Erişim Kontrolü')),
        
        React.createElement('p', { 
          style: { marginBottom: '20px', color: '#666' } 
        }, t.admin_access_desc || 'Kullanıcı yönetimi bölümüne erişmek için admin kimlik bilgilerinizi girin:'),
        
        React.createElement('div', { className: 'form-group', style: { marginBottom: '15px' } },
          React.createElement('label', null, t.users_email || 'Email'),
          React.createElement('input', {
            type: 'email',
            className: 'form-control',
            value: accessCredentials.email,
            onChange: (e) => setAccessCredentials({...accessCredentials, email: e.target.value}),
            placeholder: t.admin_access_email_placeholder || 'admin@example.com'
          })
        ),
        
        React.createElement('div', { className: 'form-group', style: { marginBottom: '20px' } },
          React.createElement('label', null, t.users_password || 'Şifre'),
          React.createElement('input', {
            type: 'password',
            className: 'form-control',
            value: accessCredentials.password,
            onChange: (e) => setAccessCredentials({...accessCredentials, password: e.target.value}),
            placeholder: t.admin_access_password_placeholder || 'Admin şifreniz',
            onKeyPress: (e) => e.key === 'Enter' && handleAdminAccess()
          })
        ),
        
        React.createElement('div', { style: { display: 'flex', gap: '10px', justifyContent: 'center' } },
          React.createElement('button', {
            onClick: handleAdminAccess,
            className: 'btn btn-primary',
            disabled: loading || !accessCredentials.email || !accessCredentials.password
          }, loading ? (t.loading || 'Yükleniyor...') : (t.admin_access_verify || 'Doğrula')),
          
          React.createElement('button', {
            onClick: () => setShowAccessModal(false),
            className: 'btn btn-secondary'
          }, t.users_cancel || 'İptal')
        )
      )
    )
  )
}
