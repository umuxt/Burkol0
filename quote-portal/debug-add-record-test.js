// Admin Panel Kayıt Ekleme Debug Test Script
console.log('🔧 DEBUG: Starting admin add record test...');

// Test 1: API connection test
async function testAPI() {
    console.log('🔧 DEBUG: Testing API connection...');
    
    try {
        const response = await fetch('/api/quotes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: 'Debug Test User',
                email: 'debug@test.com',
                phone: '5551234567',
                company: 'Debug Company',
                proj: 'Debug Project',
                customFields: {}
            })
        });
        
        const result = await response.json();
        console.log('🔧 DEBUG: API test response:', result);
        
        if (result.success) {
            console.log('✅ API is working correctly!');
            return true;
        } else {
            console.error('❌ API returned error:', result);
            return false;
        }
    } catch (error) {
        console.error('❌ API test failed:', error);
        return false;
    }
}

// Test 2: Modal open test
function testModalOpen() {
    console.log('🔧 DEBUG: Testing modal functionality...');
    
    // Check if AddRecordModal exists
    const addButtons = document.querySelectorAll('button');
    let addRecordButton = null;
    
    addButtons.forEach(button => {
        if (button.textContent.includes('Kayıt Ekle')) {
            addRecordButton = button;
        }
    });
    
    if (addRecordButton) {
        console.log('✅ Add Record button found:', addRecordButton);
        console.log('🔧 DEBUG: Clicking Add Record button...');
        addRecordButton.click();
        
        // Check if modal opened
        setTimeout(() => {
            const modals = document.querySelectorAll('[style*="position: fixed"]');
            const addModal = Array.from(modals).find(modal => 
                modal.innerHTML.includes('Yeni Kayıt Ekle')
            );
            
            if (addModal) {
                console.log('✅ Add Record modal opened successfully!');
                console.log('🔧 Modal element:', addModal);
            } else {
                console.error('❌ Add Record modal not found!');
            }
        }, 1000);
        
    } else {
        console.error('❌ Add Record button not found!');
    }
}

// Test 3: Form submission test
function testFormSubmission() {
    console.log('🔧 DEBUG: Testing form submission...');
    
    // Find form inputs in the modal
    setTimeout(() => {
        const nameInput = document.querySelector('input[placeholder*="Müşteri"]');
        const emailInput = document.querySelector('input[type="email"]');
        const saveButton = Array.from(document.querySelectorAll('button')).find(btn => 
            btn.textContent.includes('Kaydet')
        );
        
        if (nameInput && emailInput && saveButton) {
            console.log('✅ Form elements found');
            
            // Fill form
            nameInput.value = 'Test Submit User';
            emailInput.value = 'testsubmit@test.com';
            
            // Trigger change events
            nameInput.dispatchEvent(new Event('change', { bubbles: true }));
            emailInput.dispatchEvent(new Event('change', { bubbles: true }));
            
            console.log('🔧 DEBUG: Form filled, clicking save...');
            saveButton.click();
            
            // Monitor for success/error notifications
            setTimeout(() => {
                const notifications = document.querySelectorAll('[style*="background"]');
                notifications.forEach(notif => {
                    if (notif.textContent.includes('başarıyla') || notif.textContent.includes('hata')) {
                        console.log('🔧 DEBUG: Notification found:', notif.textContent);
                    }
                });
            }, 2000);
            
        } else {
            console.error('❌ Form elements not found:', { nameInput, emailInput, saveButton });
        }
    }, 2000);
}

// Run tests sequentially
async function runDebugTests() {
    console.log('🚀 Starting debug tests...');
    
    // Test 1: API
    const apiOk = await testAPI();
    
    if (apiOk) {
        // Test 2: Modal
        testModalOpen();
        
        // Test 3: Form submission (after modal opens)
        testFormSubmission();
    }
}

// Run the tests
runDebugTests();

console.log('🔧 DEBUG: Test script loaded. Check console for results.');