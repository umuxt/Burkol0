// Basic utility functions for styling
export function cn(...inputs) {
  return inputs.filter(Boolean).join(' ');
}

// Alternative utility function 
export function classNames(...classes) {
  return classes.filter(Boolean).join(' ');
}