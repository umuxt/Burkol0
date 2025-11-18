import Users from './models/users.js'

async function createAdmin() {
  try {
    const user = await Users.createUser({
      email: 'umutyalcin8@gmail.com',
      password: 'beeplan123',
      name: 'Umut Yalçın',
      role: 'admin',
      active: true
    })
    
    console.log('✅ Admin kullanıcı oluşturuldu:')
    console.log('   Email:', user.email)
    console.log('   İsim:', user.name)
    console.log('   Rol:', user.role)
    console.log('   Aktif:', user.active)
    console.log('\n🔑 Giriş bilgileri:')
    console.log('   Email: umutyalcin8@gmail.com')
    console.log('   Şifre: beeplan123')
    
    process.exit(0)
  } catch (err) {
    console.error('❌ Hata:', err.message)
    process.exit(1)
  }
}

createAdmin()
