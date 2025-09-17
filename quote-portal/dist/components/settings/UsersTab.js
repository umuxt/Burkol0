// Users Tab - User management interface for admin settings
import API from '../../lib/api.js'

const { useState, useEffect } = React

export default function UsersTab({ t, showNotification }) {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(false)
  const [newUser, setNewUser] = useState({ email: '', password: '', role: 'admin' })
  const [showAddForm, setShowAddForm] = useState(false)

  useEffect(() => {
    loadUsers()
  }, [])

  async function loadUsers() {
    try {
      setLoading(true)
      const userList = await API.listUsers()
      setUsers(userList)
    } catch (e) {
      console.error('Users load error:', e)
      showNotification('Kullanıcılar yüklenemedi', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function handleAddUser() {
    try {
      if (!newUser.email || !newUser.password) {
        showNotification('Email ve şifre gerekli', 'error')
        return
      }
      
      if (newUser.password.length < 6) {
        showNotification('Şifre en az 6 karakter olmalı', 'error')
        return
      }
      
      setLoading(true)
      await API.addUser(newUser.email, newUser.password, newUser.role)
      setNewUser({ email: '', password: '', role: 'admin' })
      setShowAddForm(false)
      await loadUsers()
      showNotification('Kullanıcı eklendi', 'success')
    } catch (e) {
      console.error('Add user error:', e)
      showNotification(e.message || 'Kullanıcı eklenemedi', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function handleDeleteUser(email) {
    if (!confirm(`${email} kullanıcısını silmek istediğinizden emin misiniz?`)) {
      return
    }
    
    try {
      setLoading(true)
      await API.deleteUser(email)
      await loadUsers()
      showNotification('Kullanıcı silindi', 'success')
    } catch (e) {
      console.error('Delete user error:', e)
      showNotification(e.message || 'Kullanıcı silinemedi', 'error')
    } finally {
      setLoading(false)
    }
  }

  return React.createElement('div', { className: 'users-tab' },
    React.createElement('div', { className: 'users-header', style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' } },
      React.createElement('h3', { style: { margin: 0 } }, 'Kullanıcı Yönetimi'),
      React.createElement('button', {
        onClick: () => setShowAddForm(!showAddForm),
        className: 'btn',
        style: {
          backgroundColor: '#28a745',
          color: 'white',
          border: 'none',
          padding: '8px 16px',
          borderRadius: '4px',
          cursor: 'pointer'
        },
        disabled: loading
      }, showAddForm ? 'İptal' : 'Yeni Kullanıcı')
    ),

    // Add User Form
    showAddForm && React.createElement('div', { 
      className: 'add-user-form',
      style: {
        background: '#f8f9fa',
        padding: '20px',
        borderRadius: '8px',
        marginBottom: '20px',
        border: '1px solid #dee2e6'
      }
    },
      React.createElement('h4', { style: { marginTop: 0 } }, 'Yeni Kullanıcı Ekle'),
      React.createElement('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' } },
        React.createElement('div', null,
          React.createElement('label', { style: { display: 'block', marginBottom: '5px', fontWeight: '500' } }, 'Email'),
          React.createElement('input', {
            type: 'email',
            value: newUser.email,
            onChange: (e) => setNewUser({ ...newUser, email: e.target.value }),
            placeholder: 'kullanici@domain.com',
            style: {
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #ced4da',
              borderRadius: '4px',
              fontSize: '14px'
            },
            disabled: loading
          })
        ),
        React.createElement('div', null,
          React.createElement('label', { style: { display: 'block', marginBottom: '5px', fontWeight: '500' } }, 'Şifre'),
          React.createElement('input', {
            type: 'password',
            value: newUser.password,
            onChange: (e) => setNewUser({ ...newUser, password: e.target.value }),
            placeholder: 'En az 6 karakter',
            style: {
              width: '100%',
              padding: '8px 12px',
              border: '1px solid #ced4da',
              borderRadius: '4px',
              fontSize: '14px'
            },
            disabled: loading
          })
        )
      ),
      React.createElement('div', { style: { marginBottom: '15px' } },
        React.createElement('label', { style: { display: 'block', marginBottom: '5px', fontWeight: '500' } }, 'Rol'),
        React.createElement('select', {
          value: newUser.role,
          onChange: (e) => setNewUser({ ...newUser, role: e.target.value }),
          style: {
            padding: '8px 12px',
            border: '1px solid #ced4da',
            borderRadius: '4px',
            fontSize: '14px'
          },
          disabled: loading
        },
          React.createElement('option', { value: 'admin' }, 'Admin'),
          React.createElement('option', { value: 'editor' }, 'Editor'),
          React.createElement('option', { value: 'viewer' }, 'Viewer')
        )
      ),
      React.createElement('button', {
        onClick: handleAddUser,
        className: 'btn',
        style: {
          backgroundColor: '#007bff',
          color: 'white',
          border: 'none',
          padding: '10px 20px',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '14px'
        },
        disabled: loading || !newUser.email || !newUser.password
      }, loading ? 'Ekleniyor...' : 'Kullanıcı Ekle')
    ),

    // Users List
    React.createElement('div', { className: 'users-list' },
      loading && !showAddForm ? React.createElement('div', { style: { textAlign: 'center', padding: '20px' } }, 'Yükleniyor...') :
      users.length === 0 ? React.createElement('div', { style: { textAlign: 'center', padding: '20px', color: '#6c757d' } }, 'Henüz kullanıcı bulunmuyor') :
      React.createElement('div', { style: { overflowX: 'auto' } },
        React.createElement('table', { 
          style: { 
            width: '100%', 
            borderCollapse: 'collapse',
            backgroundColor: 'white',
            borderRadius: '8px',
            overflow: 'hidden',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
          }
        },
          React.createElement('thead', null,
            React.createElement('tr', { style: { backgroundColor: '#f8f9fa' } },
              React.createElement('th', { style: { padding: '12px', textAlign: 'left', borderBottom: '1px solid #dee2e6' } }, 'Email'),
              React.createElement('th', { style: { padding: '12px', textAlign: 'left', borderBottom: '1px solid #dee2e6' } }, 'Rol'),
              React.createElement('th', { style: { padding: '12px', textAlign: 'left', borderBottom: '1px solid #dee2e6' } }, 'Oluşturulma'),
              React.createElement('th', { style: { padding: '12px', textAlign: 'center', borderBottom: '1px solid #dee2e6' } }, 'İşlemler')
            )
          ),
          React.createElement('tbody', null,
            users.map((user, index) => 
              React.createElement('tr', { 
                key: user.email,
                style: { 
                  borderBottom: index < users.length - 1 ? '1px solid #f1f3f4' : 'none',
                  transition: 'background-color 0.2s'
                },
                onMouseOver: (e) => e.currentTarget.style.backgroundColor = '#f8f9fa',
                onMouseOut: (e) => e.currentTarget.style.backgroundColor = 'transparent'
              },
                React.createElement('td', { style: { padding: '12px' } }, user.email),
                React.createElement('td', { style: { padding: '12px' } }, 
                  React.createElement('span', {
                    style: {
                      padding: '4px 8px',
                      borderRadius: '12px',
                      fontSize: '12px',
                      fontWeight: '500',
                      backgroundColor: user.role === 'admin' ? '#dc3545' : user.role === 'editor' ? '#fd7e14' : '#6c757d',
                      color: 'white'
                    }
                  }, user.role)
                ),
                React.createElement('td', { style: { padding: '12px', fontSize: '14px', color: '#6c757d' } }, 
                  user.createdAt ? new Date(user.createdAt).toLocaleDateString('tr-TR') : '-'
                ),
                React.createElement('td', { style: { padding: '12px', textAlign: 'center' } },
                  React.createElement('button', {
                    onClick: () => handleDeleteUser(user.email),
                    className: 'btn',
                    style: {
                      backgroundColor: '#dc3545',
                      color: 'white',
                      border: 'none',
                      padding: '6px 12px',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px'
                    },
                    disabled: loading
                  }, 'Sil')
                )
              )
            )
          )
        )
      )
    )
  )
}