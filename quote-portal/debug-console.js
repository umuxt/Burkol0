// Test script to check formData in browser console
// Copy-paste this into browser console to debug formData state

// Log current formData
console.log('Current formData from React component:', window.formDataState);

// Try to access React component's state (if exposed)
if (window.React && window.React._currentOwner) {
  console.log('React current owner:', window.React._currentOwner);
}

// Get form elements and check their values
const inputs = document.querySelectorAll('input, textarea, select');
console.log('Form inputs found:', inputs.length);

inputs.forEach((input, index) => {
  console.log(`Input ${index}:`, {
    id: input.id,
    name: input.name,
    type: input.type,
    value: input.value,
    readOnly: input.readOnly,
    disabled: input.disabled
  });
});