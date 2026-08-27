/**
 * ClockHost Security Utilities
 * Input sanitization, XSS prevention, SQL injection protection, CSP headers.
 */

/**
 * Sanitize a string to prevent XSS attacks.
 * Strips HTML tags and encodes special characters.
 */
export function sanitizeHtml(input) {
  if (typeof input !== "string") return input;

  return input
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/\//g, "&#x2F;");
}

/**
 * Strip all HTML tags from a string.
 */
export function stripHtml(input) {
  if (typeof input !== "string") return input;
  return input.replace(/<[^>]*>/g, "");
}

/**
 * Sanitize user input for database queries.
 * While Supabase uses parameterized queries, this adds defense in depth.
 */
export function sanitizeInput(input) {
  if (typeof input !== "string") return input;

  return input
    .trim()
    .replace(/'/g, "''") // Escape single quotes for SQL
    .replace(/\\/g, "\\\\") // Escape backslashes
    .replace(/%/g, "\\%") // Escape LIKE wildcards
    .replace(/_/g, "\\_"); // Escape LIKE wildcards
}

/**
 * Validate and sanitize a URL.
 * Only allows http/https protocols.
 */
export function sanitizeUrl(url) {
  if (typeof url !== "string") return null;

  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return null;
    }
    // Remove any hash or sensitive query params
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * Sanitize an email address.
 */
export function sanitizeEmail(email) {
  if (typeof email !== "string") return null;
  const trimmed = email.trim().toLowerCase();
  // Basic email validation
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return null;
  }
  return trimmed;
}

/**
 * Sanitize a phone number (Nigerian format).
 */
export function sanitizePhone(phone) {
  if (typeof phone !== "string") return null;
  // Remove all non-digits
  const digits = phone.replace(/\D/g, "");
  // Nigerian numbers: 234 + 10 digits, or 0 + 10 digits
  if (digits.startsWith("234") && digits.length === 13) {
    return "+" + digits;
  }
  if (digits.startsWith("0") && digits.length === 11) {
    return "+234" + digits.slice(1);
  }
  return null;
}

/**
 * Generate a Content Security Policy header.
 */
export function generateCSP() {
  const directives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.paystack.co https://www.googletagmanager.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https://*.supabase.co https://api.paystack.co https://www.google-analytics.com",
    "frame-src 'self' https://js.paystack.co",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests",
  ];

  return directives.join("; ");
}

/**
 * Security headers for API responses.
 */
export const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(self)",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
};

/**
 * Apply security headers to a response.
 */
export function withSecurityHeaders(response) {
  const headers = new Headers(response.headers);

  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    headers.set(key, value);
  }

  headers.set("Content-Security-Policy", generateCSP());

  return new NextResponse(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Detect common attack patterns in input.
 */
export function detectAttacks(input) {
  if (typeof input !== "string") return { safe: true, threats: [] };

  const threats = [];

  // SQL injection patterns
  if (/(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE|EXEC|EXECUTE)\b)/i.test(input)) {
    threats.push("sql_injection");
  }

  // XSS patterns
  if (/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/i.test(input)) {
    threats.push("xss_script");
  }

  if (/javascript:/i.test(input)) {
    threats.push("xss_javascript");
  }

  if (/on\w+\s*=/i.test(input)) {
    threats.push("xss_event_handler");
  }

  // Path traversal
  if (/\.\.[\/\\]/.test(input)) {
    threats.push("path_traversal");
  }

  // Command injection
  if (/[;&|`$]/.test(input)) {
    threats.push("command_injection");
  }

  // LDAP injection
  if (/[()&|!]/.test(input) && /ldap/i.test(input)) {
    threats.push("ldap_injection");
  }

  return {
    safe: threats.length === 0,
    threats,
  };
}

/**
 * Validate input against a schema.
 * Returns sanitized data or throws with validation errors.
 */
export function validateInput(data, schema) {
  const errors = [];
  const sanitized = {};

  for (const [field, rules] of Object.entries(schema)) {
    let value = data[field];

    // Required check
    if (rules.required && (value === undefined || value === null || value === "")) {
      errors.push({ field, message: `${field} is required` });
      continue;
    }

    // Skip further validation if not required and empty
    if (!rules.required && (value === undefined || value === null || value === "")) {
      continue;
    }

    // Type checks
    if (rules.type === "string" && typeof value !== "string") {
      errors.push({ field, message: `${field} must be a string` });
      continue;
    }

    if (rules.type === "number" && typeof value !== "number") {
      errors.push({ field, message: `${field} must be a number` });
      continue;
    }

    // String validations
    if (rules.type === "string" && typeof value === "string") {
      value = value.trim();

      if (rules.minLength && value.length < rules.minLength) {
        errors.push({ field, message: `${field} must be at least ${rules.minLength} characters` });
      }

      if (rules.maxLength && value.length > rules.maxLength) {
        errors.push({ field, message: `${field} must be at most ${rules.maxLength} characters` });
      }

      if (rules.pattern && !rules.pattern.test(value)) {
        errors.push({ field, message: `${field} format is invalid` });
      }

      if (rules.enum && !rules.enum.includes(value)) {
        errors.push({ field, message: `${field} must be one of: ${rules.enum.join(", ")}` });
      }

      // Sanitize HTML
      if (rules.sanitize !== false) {
        value = stripHtml(value);
      }
    }

    // Number validations
    if (rules.type === "number" && typeof value === "number") {
      if (rules.min !== undefined && value < rules.min) {
        errors.push({ field, message: `${field} must be at least ${rules.min}` });
      }

      if (rules.max !== undefined && value > rules.max) {
        errors.push({ field, message: `${field} must be at most ${rules.max}` });
      }
    }

    // Attack detection
    if (typeof value === "string") {
      const { safe, threats } = detectAttacks(value);
      if (!safe) {
        errors.push({ field, message: `${field} contains potentially malicious content`, threats });
      }
    }

    sanitized[field] = value;
  }

  if (errors.length > 0) {
    throw { type: "validation", errors };
  }

  return sanitized;
}

/**
 * Common validation schemas.
 */
export const schemas = {
  listing: {
    title: { type: "string", required: true, minLength: 3, maxLength: 200 },
    description: { type: "string", required: true, minLength: 10, maxLength: 5000 },
    city: { type: "string", required: true, minLength: 2, maxLength: 100 },
    address: { type: "string", required: true, minLength: 5, maxLength: 500 },
    category: { type: "string", required: true, enum: ["event_space", "meeting_room", "studio", "coworking", "other"] },
    price_kobo: { type: "number", required: true, min: 100, max: 100000000 },
    capacity: { type: "number", required: true, min: 1, max: 10000 },
  },

  booking: {
    listing_id: { type: "string", required: true },
    start_date: { type: "string", required: true, pattern: /^\d{4}-\d{2}-\d{2}$/ },
    end_date: { type: "string", required: true, pattern: /^\d{4}-\d{2}-\d{2}$/ },
    headcount: { type: "number", required: true, min: 1, max: 10000 },
  },

  review: {
    rating: { type: "number", required: true, min: 1, max: 5 },
    comment: { type: "string", required: true, minLength: 10, maxLength: 2000 },
  },

  profile: {
    full_name: { type: "string", required: true, minLength: 2, maxLength: 200 },
    email: { type: "string", required: true, pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/ },
    phone: { type: "string", required: false, pattern: /^\+?[\d\s-]{10,}$/ },
  },
};
