import { clsx } from "clsx"
import { twMerge } from "tailwindcss-merge"

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

// If clsx is not available, fallback
export function classNames(...classes) {
  return classes.filter(Boolean).join(' ')
}