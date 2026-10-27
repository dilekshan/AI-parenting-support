export function validatePersonalDetails(values) {
  const name = values.name.trim();
  const email = values.email.replace(/[A-Z]/g, letter => letter.toLowerCase()).trimEnd();
  const phone = values.phone.trim();
  const errors = {};
  if (!name) errors.name = 'Please enter your full name';
  else if (name.length > 100) errors.name = 'Full name must be 100 characters or fewer';
  const parts = email.split('@');
  const local = parts[0];
  const domain = parts[1] || '';
  const labels = domain.split('.');
  if (!/^[a-z]/.test(email)) {
    errors.email = 'Email must start with an English letter (a-z), not a number, symbol or space';
  } else if (email.length > 100 || parts.length !== 2 || !local || local.length > 64 ||
      !/^[A-Za-z0-9!#$%&'*+/=?^_`{|}~.-]+$/.test(local) || local.startsWith('.') || local.endsWith('.') || local.includes('..') ||
      labels.length < 2 || !labels.every(label => /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label)) || !/^[A-Za-z]{2,63}$/.test(labels.at(-1))) {
    errors.email = 'Please enter a valid email address';
  }
  if (phone && !/^(?:(?:0|\+94|94)7[01245678][0-9]{7})$/.test(phone)) errors.phone = 'Please enter a valid Sri Lankan mobile number.';
  const normalizedPhone = !phone ? null : phone.startsWith('0') ? '+94' + phone.slice(1) : phone.startsWith('+') ? phone : '+' + phone;
  return { errors, valid: Object.keys(errors).length === 0, normalized: { name, email, phone: normalizedPhone } };
}

export function validateAccountSecurity({ password, confirm }) {
  const errors = {};
  const missing = [];
  if ([...password].length < 8) missing.push('at least 8 characters');
  if (!/[A-Z]/.test(password)) missing.push('an uppercase letter (A-Z)');
  if (!/[a-z]/.test(password)) missing.push('a lowercase letter (a-z)');
  if (!/[0-9]/.test(password)) missing.push('a number (0-9)');
  if (!/[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/.test(password)) missing.push('a special character (e.g. @, #, $, !)');
  if (missing.length) errors.password = 'Password must contain ' + missing.join(', ') + '.';
  else if ([...password].length > 1024) errors.password = 'Password must be 1024 characters or fewer.';
  if (!confirm) errors.confirm = 'Confirm your password.';
  else if (password !== confirm) errors.confirm = 'Passwords must match.';
  return errors;
}
