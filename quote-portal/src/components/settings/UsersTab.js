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
    loadUsers()
  }, [isVerified])

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

  // Admin erişim doğrulama fonksiyonu
  async function handleAdminAccess() {
    try {
      if (!accessCredentials.email || !accessCredentials.password) {
        showNotification(t.admin_access_required || 'Email ve şifre gerekli', 'error')
        return
      }

      setLoading(true)
      
      // Login API'si ile kullanıcıyı doğrula
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: accessCredentials.email,
          password: accessCredentials.password
        })
      })

      const result = await response.json()

      if (!response.ok) {
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

  function getRoleLabel(role) {
    if (role === 'admin') return t.users_role_admin || 'Admin'
    if (role === 'user') return t.users_role_user || 'Kullanıcı'
    return role
  }

  return React.createElement(React.Fragment, null,
    // Sadece doğrulanmış kullanıcılar ana içeriği görebilir
    isVerified && React.createElement(React.Fragment, null,
      React.createElement('h3', null, t.users_title || 'Kullanıcı Yönetimi'),
      React.createElement('button', {
        onClick: () => setShowAddForm(!showAddForm),
        className: 'btn btn-primary',
        style: { marginBottom: '20px' }
      }, showAddForm ? (t.users_cancel || 'İptal') : (t.users_new_user || 'Yeni Kullanıcı')),

      showAddForm && React.createElement('div', { style: { marginBottom: '20px', padding: '20px', border: '1px solid #ddd', borderRadius: '8px', backgroundColor: '#f9f9f9' } },
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

      users.length === 0 
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
