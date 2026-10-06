export {};

// Custom claims added in Clerk dashboard → Sessions → Customize session token:
//   { "email": "{{user.primary_email_address}}" }
declare global {
  interface CustomJwtSessionClaims {
    email?: string;
  }
}
