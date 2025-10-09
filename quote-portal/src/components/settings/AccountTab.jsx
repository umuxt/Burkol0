// Account Settings Tab - Company and account information management
import React, { useState, useEffect } from 'react';
import UsersTab from './UsersTab.jsx';
import API from '../../lib/api.js';

const AccountTab = ({ t, showNotification }) => {
  // Company information state
  const [companyInfo, setCompanyInfo] = useState({
    name: '',
    taxNumber: '',
    address: '',
    phone: '',
    email: '',
    website: ''
  });

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Şirket bilgileri kilit state'leri
  const [isCompanyInfoLocked, setIsCompanyInfoLocked] = useState(true);
  const [showCompanyAccessModal, setShowCompanyAccessModal] = useState(false);
  const [companyAccessCredentials, setCompanyAccessCredentials] = useState({ email: '', password: '' });
  const [isVerifyingCompanyAccess, setIsVerifyingCompanyAccess] = useState(false);
  
  // Kullanıcı yönetimi state'leri
  const [showUsersPanel, setShowUsersPanel] = useState(false);
  const [showAccessModal, setShowAccessModal] = useState(false);
  const [accessCredentials, setAccessCredentials] = useState({ email: '', password: '' });
  const [isVerifyingAccess, setIsVerifyingAccess] = useState(false);

  // Load existing company information
  useEffect(() => {
    loadCompanyInfo();
  }, []);

  const loadCompanyInfo = async () => {
    setLoading(true);
    try {
      // TODO: API çağrısı ile şirket bilgilerini yükle
      // const response = await fetch('/api/company-info');
      // const data = await response.json();
      // setCompanyInfo(data);
      
      // Şimdilik demo data
      setCompanyInfo({
        name: 'Burkol Metal',
        taxNumber: '1234567890',
        address: 'Örnek Mahallesi, Örnek Sokak No: 1, İstanbul',
        phone: '+90 212 555 0123',
        email: 'info@burkol.com',
        website: 'www.burkol.com'
      });
    } catch (error) {
      console.error('Şirket bilgileri yüklenirken hata:', error);
      showNotification('Şirket bilgileri yüklenirken hata oluştu', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field, value) => {
    setCompanyInfo(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSave = async () => {
    if (isCompanyInfoLocked) {
      setShowCompanyAccessModal(true);
      return;
    }

    setSaving(true);
    try {
      // TODO: API çağrısı ile şirket bilgilerini kaydet
      // const response = await fetch('/api/company-info', {
      //   method: 'PUT',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(companyInfo)
      // });
      
      // Şimdilik başarılı kaydet simülasyonu
      await new Promise(resolve => setTimeout(resolve, 1000)); // Simüle loading
      showNotification('Şirket bilgileri başarıyla güncellendi', 'success');
      
      // Kaydetme başarılı olduktan sonra kilidi tekrar aç ve alanları readonly yap
      setIsCompanyInfoLocked(true);
    } catch (error) {
      console.error('Şirket bilgileri kaydedilirken hata:', error);
      showNotification('Şirket bilgileri kaydedilirken hata oluştu', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Şirket bilgileri erişim fonksiyonları
  const handleCompanyAccessVerification = async () => {
    if (!companyAccessCredentials.email || !companyAccessCredentials.password) {
      showNotification('E-posta ve şifre gerekli', 'error');
      return;
    }

    setIsVerifyingCompanyAccess(true);
    try {
      // UsersTab'deki aynı API metodunu kullan
      const result = await API.verifyAdminAccess(companyAccessCredentials.email, companyAccessCredentials.password);

      if (!result || !result.success) {
        showNotification('Geçersiz kullanıcı bilgileri', 'error');
        return;
      }

      // Role kontrolü - sadece admin rolündeki kullanıcılar erişebilir
      if (result.user && result.user.role !== 'admin') {
        showNotification('Bu bilgileri düzenlemek için admin yetkisi gerekli', 'error');
        return;
      }

      // Başarılı doğrulama
      setShowCompanyAccessModal(false);
      setIsCompanyInfoLocked(false);
      setCompanyAccessCredentials({ email: '', password: '' });
      showNotification('Şirket bilgileri düzenleme erişimi sağlandı', 'success');
      
    } catch (error) {
      console.error('Admin doğrulama hatası:', error);
      if (error.message === 'verification_failed') {
        showNotification('Geçersiz kullanıcı bilgileri', 'error');
      } else if (error.message === 'network_error') {
        showNotification('Ağ hatası oluştu', 'error');
      } else {
        showNotification('Doğrulama sırasında hata oluştu', 'error');
      }
    } finally {
      setIsVerifyingCompanyAccess(false);
    }
  };

  const closeCompanyAccessModal = () => {
    setShowCompanyAccessModal(false);
    setCompanyAccessCredentials({ email: '', password: '' });
  };

  // Kullanıcı yönetimi erişim fonksiyonları
  const handleUsersAccess = () => {
    setShowAccessModal(true);
  };

  const handleAccessVerification = async () => {
    if (!accessCredentials.email || !accessCredentials.password) {
      showNotification('E-posta ve şifre gerekli', 'error');
      return;
    }

    setIsVerifyingAccess(true);
    try {
      // UsersTab'deki aynı API metodunu kullan
      const result = await API.verifyAdminAccess(accessCredentials.email, accessCredentials.password);

      if (!result || !result.success) {
        showNotification('Geçersiz kullanıcı bilgileri', 'error');
        return;
      }

      // Role kontrolü - sadece admin rolündeki kullanıcılar erişebilir
      if (result.user && result.user.role !== 'admin') {
        showNotification('Bu panele erişim yetkiniz yok. Sadece admin kullanıcıları bu bölüme erişebilir.', 'error');
        return;
      }

      // Başarılı doğrulama
      setShowAccessModal(false);
      setShowUsersPanel(true);
      setAccessCredentials({ email: '', password: '' });
      showNotification('Kullanıcı yönetimine erişim sağlandı', 'success');
      
    } catch (error) {
      console.error('Admin doğrulama hatası:', error);
      if (error.message === 'verification_failed') {
        showNotification('Geçersiz kullanıcı bilgileri', 'error');
      } else if (error.message === 'network_error') {
        showNotification('Ağ hatası oluştu', 'error');
      } else {
        showNotification('Doğrulama sırasında hata oluştu', 'error');
      }
    } finally {
      setIsVerifyingAccess(false);
    }
  };

  const closeAccessModal = () => {
    setShowAccessModal(false);
    setAccessCredentials({ email: '', password: '' });
  };

  const closeUsersPanel = () => {
    setShowUsersPanel(false);
  };

  if (loading) {
    return React.createElement('div', { 
      style: { 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        minHeight: '300px' 
      } 
    },
      React.createElement('div', { className: 'spinner' }),
      React.createElement('span', null, 'Hesap bilgileri yükleniyor...')
    );
  }

  return React.createElement('div', { className: 'account-settings' },
    // Şirket Bilgileri Kartı
    React.createElement('div', { className: 'card' },
      React.createElement('h3', null,
        React.createElement('i', { className: 'fas fa-building', style: { marginRight: '8px' } }),
        'Şirket Bilgileri'
      ),
      
      React.createElement('div', { style: { display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' } },
        // Şirket Adı
        React.createElement('div', { className: 'form-group' },
          React.createElement('label', { className: 'form-label' }, 'Şirket Adı'),
          React.createElement('input', {
            type: 'text',
            className: 'form-control',
            value: companyInfo.name,
            onChange: (e) => handleInputChange('name', e.target.value),
            placeholder: 'Şirket adını giriniz',
            disabled: isCompanyInfoLocked,
            style: isCompanyInfoLocked ? { backgroundColor: 'var(--surface)', cursor: 'not-allowed' } : {}
          })
        ),

        // Vergi Numarası
        React.createElement('div', { className: 'form-group' },
          React.createElement('label', { className: 'form-label' }, 'Vergi Numarası'),
          React.createElement('input', {
            type: 'text',
            className: 'form-control',
            value: companyInfo.taxNumber,
            onChange: (e) => handleInputChange('taxNumber', e.target.value),
            placeholder: 'Vergi numarasını giriniz',
            disabled: isCompanyInfoLocked,
            style: isCompanyInfoLocked ? { backgroundColor: 'var(--surface)', cursor: 'not-allowed' } : {}
          })
        ),

        // Telefon
        React.createElement('div', { className: 'form-group' },
          React.createElement('label', { className: 'form-label' }, 'Telefon'),
          React.createElement('input', {
            type: 'tel',
            className: 'form-control',
            value: companyInfo.phone,
            onChange: (e) => handleInputChange('phone', e.target.value),
            placeholder: '+90 212 555 0123',
            disabled: isCompanyInfoLocked,
            style: isCompanyInfoLocked ? { backgroundColor: 'var(--surface)', cursor: 'not-allowed' } : {}
          })
        ),

        // E-posta
        React.createElement('div', { className: 'form-group' },
          React.createElement('label', { className: 'form-label' }, 'E-posta'),
          React.createElement('input', {
            type: 'email',
            className: 'form-control',
            value: companyInfo.email,
            onChange: (e) => handleInputChange('email', e.target.value),
            placeholder: 'info@burkol.com',
            disabled: isCompanyInfoLocked,
            style: isCompanyInfoLocked ? { backgroundColor: 'var(--surface)', cursor: 'not-allowed' } : {}
          })
        ),

        // Web sitesi
        React.createElement('div', { className: 'form-group' },
          React.createElement('label', { className: 'form-label' }, 'Web Sitesi'),
          React.createElement('input', {
            type: 'url',
            className: 'form-control',
            value: companyInfo.website,
            onChange: (e) => handleInputChange('website', e.target.value),
            placeholder: 'www.burkol.com',
            disabled: isCompanyInfoLocked,
            style: isCompanyInfoLocked ? { backgroundColor: 'var(--surface)', cursor: 'not-allowed' } : {}
          })
        )
      ),

      // Adres - Tam genişlikte
      React.createElement('div', { className: 'form-group', style: { marginTop: '0.75rem' } },
        React.createElement('label', { className: 'form-label' }, 'Adres'),
        React.createElement('textarea', {
          className: 'form-control',
          value: companyInfo.address,
          onChange: (e) => handleInputChange('address', e.target.value),
          placeholder: 'Şirket adresini giriniz',
          rows: 3,
          style: isCompanyInfoLocked ? 
            { resize: 'vertical', minHeight: '60px', backgroundColor: 'var(--surface)', cursor: 'not-allowed' } : 
            { resize: 'vertical', minHeight: '60px' },
          disabled: isCompanyInfoLocked
        })
      ),

      // Kaydet Butonu
      React.createElement('div', { style: { marginTop: '1rem', display: 'flex', justifyContent: 'flex-end' } },
        React.createElement('button', {
          className: `btn ${isCompanyInfoLocked ? 'btn-secondary' : 'btn-primary'}`,
          onClick: handleSave,
          disabled: saving,
          style: isCompanyInfoLocked ? { cursor: 'pointer' } : {}
        },
          saving && React.createElement('div', { className: 'spinner', style: { width: '16px', height: '16px', marginRight: '8px' } }),
          React.createElement('i', { 
            className: isCompanyInfoLocked ? 'fas fa-lock' : 'fas fa-save', 
            style: { marginRight: '6px' } 
          }),
          saving ? 'Kaydediliyor...' : (isCompanyInfoLocked ? 'Düzenle' : 'Kaydet')
        )
      )
    ),

    // Kullanıcı Yönetimi Bölümü
    React.createElement('div', { className: 'card', style: { marginTop: '0.75rem' } },
      React.createElement('div', { 
        style: { 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          cursor: 'default'
        }
      },
        React.createElement('h3', { style: { margin: 0 } },
          React.createElement('i', { className: 'fas fa-users', style: { marginRight: '8px' } }),
          'Kullanıcı Yönetimi'
        ),
        React.createElement('button', {
          className: 'btn btn-secondary',
          style: { 
            padding: '2.5px 0.8rem',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '0.9rem'
          },
          onClick: showUsersPanel ? closeUsersPanel : handleUsersAccess
        },
          React.createElement('i', { className: showUsersPanel ? 'fas fa-times' : 'fas fa-chevron-down' }),
          showUsersPanel ? 'Kapat' : 'Erişim'
        )
      ),
      
      showUsersPanel && React.createElement('div', { style: { marginTop: '0.75rem' } },
        React.createElement(UsersTab, {
          t,
          showNotification,
          isEmbedded: true // Embedded mode flag
        })
      )
    ),

    // Company Access Modal
    showCompanyAccessModal && React.createElement('div', {
      style: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 9999
      },
      onClick: (e) => {
        if (e.target === e.currentTarget) closeCompanyAccessModal();
      }
    },
      React.createElement('div', {
        style: {
          background: 'var(--card-bg)',
          padding: '1.5rem',
          borderRadius: '12px',
          boxShadow: '0 8px 25px rgba(0, 0, 0, 0.15)',
          maxWidth: '380px',
          width: '90%'
        }
      },
        React.createElement('h3', { 
          style: { 
            marginBottom: '1rem', 
            textAlign: 'center',
            color: 'var(--text)',
            fontSize: '1.3rem'
          } 
        },
          React.createElement('i', { className: 'fas fa-lock', style: { marginRight: '8px' } }),
          'Şirket Bilgileri Düzenleme'
        ),
        
        React.createElement('p', { 
          style: { 
            marginBottom: '1rem', 
            textAlign: 'center',
            color: 'var(--muted)',
            fontSize: '0.9rem'
          } 
        },
          'Şirket bilgilerini düzenlemek için yönetici kimlik bilgilerinizi giriniz.'
        ),

        React.createElement('div', { className: 'form-group' },
          React.createElement('label', { className: 'form-label' }, 'E-posta'),
          React.createElement('input', {
            type: 'email',
            className: 'form-control',
            value: companyAccessCredentials.email,
            onChange: (e) => setCompanyAccessCredentials(prev => ({ ...prev, email: e.target.value })),
            placeholder: 'admin@burkol.com',
            autoFocus: true
          })
        ),

        React.createElement('div', { className: 'form-group' },
          React.createElement('label', { className: 'form-label' }, 'Şifre'),
          React.createElement('input', {
            type: 'password',
            className: 'form-control',
            value: companyAccessCredentials.password,
            onChange: (e) => setCompanyAccessCredentials(prev => ({ ...prev, password: e.target.value })),
            placeholder: '••••••••',
            onKeyPress: (e) => {
              if (e.key === 'Enter') handleCompanyAccessVerification();
            }
          })
        ),

        React.createElement('div', { 
          style: { 
            display: 'flex', 
            gap: '0.75rem', 
            marginTop: '1rem' 
          } 
        },
          React.createElement('button', {
            className: 'btn btn-secondary',
            onClick: closeCompanyAccessModal,
            style: { flex: 1 },
            disabled: isVerifyingCompanyAccess
          }, 'İptal'),
          
          React.createElement('button', {
            className: 'btn btn-primary',
            onClick: handleCompanyAccessVerification,
            style: { flex: 1 },
            disabled: isVerifyingCompanyAccess
          },
            isVerifyingCompanyAccess && React.createElement('div', { 
              className: 'spinner', 
              style: { width: '16px', height: '16px', marginRight: '8px' } 
            }),
            isVerifyingCompanyAccess ? 'Doğrulanıyor...' : 'Düzenle'
          )
        )
      )
    ),

    // Access Modal
    showAccessModal && React.createElement('div', {
      style: {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 9999
      },
      onClick: (e) => {
        if (e.target === e.currentTarget) closeAccessModal();
      }
    },
      React.createElement('div', {
        style: {
          background: 'var(--card-bg)',
          padding: '1.5rem',
          borderRadius: '12px',
          boxShadow: '0 8px 25px rgba(0, 0, 0, 0.15)',
          maxWidth: '380px',
          width: '90%'
        }
      },
        React.createElement('h3', { 
          style: { 
            marginBottom: '1rem', 
            textAlign: 'center',
            color: 'var(--text)',
            fontSize: '1.3rem'
          } 
        },
          React.createElement('i', { className: 'fas fa-shield-alt', style: { marginRight: '8px' } }),
          'Kullanıcı Yönetimi Erişimi'
        ),
        
        React.createElement('p', { 
          style: { 
            marginBottom: '1rem', 
            textAlign: 'center',
            color: 'var(--muted)',
            fontSize: '0.9rem'
          } 
        },
          'Bu bölüme erişmek için yönetici kimlik bilgilerinizi giriniz.'
        ),

        React.createElement('div', { className: 'form-group' },
          React.createElement('label', { className: 'form-label' }, 'E-posta'),
          React.createElement('input', {
            type: 'email',
            className: 'form-control',
            value: accessCredentials.email,
            onChange: (e) => setAccessCredentials(prev => ({ ...prev, email: e.target.value })),
            placeholder: 'admin@burkol.com',
            autoFocus: true
          })
        ),

        React.createElement('div', { className: 'form-group' },
          React.createElement('label', { className: 'form-label' }, 'Şifre'),
          React.createElement('input', {
            type: 'password',
            className: 'form-control',
            value: accessCredentials.password,
            onChange: (e) => setAccessCredentials(prev => ({ ...prev, password: e.target.value })),
            placeholder: '••••••••',
            onKeyPress: (e) => {
              if (e.key === 'Enter') handleAccessVerification();
            }
          })
        ),

        React.createElement('div', { 
          style: { 
            display: 'flex', 
            gap: '0.75rem', 
            marginTop: '1rem' 
          } 
        },
          React.createElement('button', {
            className: 'btn btn-secondary',
            onClick: closeAccessModal,
            style: { flex: 1 },
            disabled: isVerifyingAccess
          }, 'İptal'),
          
          React.createElement('button', {
            className: 'btn btn-primary',
            onClick: handleAccessVerification,
            style: { flex: 1 },
            disabled: isVerifyingAccess
          },
            isVerifyingAccess && React.createElement('div', { 
              className: 'spinner', 
              style: { width: '16px', height: '16px', marginRight: '8px' } 
            }),
            isVerifyingAccess ? 'Doğrulanıyor...' : 'Erişim'
          )
        )
      )
    )
  );
};

export default AccountTab;