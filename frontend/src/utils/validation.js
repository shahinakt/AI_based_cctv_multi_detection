// frontend/src/utils/validation.js
// Shared input-validation helpers for name and phone fields.

const NAME_REGEX = /^[A-Za-z ]+$/;
const PHONE_REGEX = /^[0-9]{10}$/;

/**
 * Validate a full-name value.
 * @param {string} value
 * @returns {string|null} error message, or null if valid / empty (field is optional)
 */
export function validateName(value) {
  if (!value || value.trim() === "") return null; // optional field
  const v = value.trim();
  if (!NAME_REGEX.test(v)) return "Name must contain only letters.";
  if (v.length < 2) return "Name must be at least 2 characters.";
  if (v.length > 50) return "Name must be at most 50 characters.";
  return null;
}

/**
 * Validate a phone number value.
 * @param {string} value
 * @returns {string|null} error message, or null if valid / empty (field is optional)
 */
export function validatePhone(value) {
  if (!value || value.trim() === "") return null; // optional field
  if (!PHONE_REGEX.test(value.trim())) {
    return "Phone number must contain exactly 10 digits.";
  }
  return null;
}

/**
 * Validate a password value.
 * @param {string} value
 * @returns {string|null} error message, or null if valid
 */
export function validatePassword(value) {
  if (!value) return "Password is required.";
  if (value.length < 8) return "Password must be at least 8 characters.";
  return null;
}
