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

  function formatDate(dateString) {
    return new Date(dateString).toLocaleDateString('tr-TR', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  function getRoleLabel(role) {
    const roleLabels = {
      admin: 'Admin',
      user: 'Kullanıcı'
    }
    return roleLabels[role] || role
  }

  return React.createElement(React.Fragment, null,
      React.createElement('h3', null, 'Kullanıcı Yönetimi'),
      React.createElement('button', {
        onClick: () => setShowAddForm(!showAddForm),
        className: 'btn btn-primary',
        style: { marginBottom: '20px' }
      }, showAddForm ? 'İptal' : 'Yeni Kullanıcı'),

      showAddForm && React.createElement('div', { style: { marginBottom: '20px' } },
        React.createElement('h4', null, 'Yeni Kullanıcı Ekle'),
        React.createElement('div', { className: 'form-group' },
          React.createElement('label', null, 'Email'),
          React.createElement('input', {
            type: 'email',
            value: newUser.email,
            onChange: (e) => setNewUser({ ...newUser, email: e.target.value }),
            className: 'form-control',
            placeholder: 'kullanici@domain.com'
          })
        ),
        React.createElement('div', { className: 'form-group' },
          React.createElement('label', null, 'Şifre'),
          React.createElement('input', {
            type: 'password',
            value: newUser.password,
            onChange: (e) => setNewUser({ ...newUser, password: e.target.value }),
            className: 'form-control',
            placeholder: 'En az 6 karakter'
          })
        ),
        React.createElement('div', { className: 'form-group' },
          React.createElement('label', null, 'Rol'),
          React.createElement('select', {
            value: newUser.role,
            onChange: (e) => setNewUser({ ...newUser, role: e.target.value }),
            className: 'form-control'
          },
            React.createElement('option', { value: 'admin' }, 'Admin'),
            React.createElement('option', { value: 'user' }, 'Kullanıcı')
          )
        ),
        React.createElement('button', {
          onClick: handleAddUser,
          className: 'btn btn-primary',
          disabled: !newUser.email || !newUser.password
        }, 'Kullanıcı Ekle')
      ),

      users.length === 0 
        ? React.createElement('p', null, 'Henüz kullanıcı eklenmemiş.')
        : React.createElement('table', { style: { width: '100%', borderCollapse: 'collapse' } },
            React.createElement('thead', null,
              React.createElement('tr', null,
                React.createElement('th', { style: { padding: '12px', textAlign: 'left' } }, 'Email'),
                React.createElement('th', { style: { padding: '12px', textAlign: 'left' } }, 'Rol'),
                React.createElement('th', { style: { padding: '12px', textAlign: 'center' } }, 'İşlemler')
              )
            ),
            React.createElement('tbody', null,
              users.map(user => 
                React.createElement('tr', { key: user.email },
                  React.createElement('td', { style: { padding: '12px' } }, user.email),
                  React.createElement('td', { style: { padding: '12px' } }, getRoleLabel(user.role)),
                  React.createElement('td', { style: { padding: '12px', textAlign: 'center' } },
                    React.createElement('button', {
                      onClick: () => handleDeleteUser(user.email),
                      className: 'btn btn-danger'
                    }, 'Sil')
                  )
                )
              )
            )
          )
  )
}
