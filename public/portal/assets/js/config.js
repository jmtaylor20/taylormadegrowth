// Client onboarding portal — configuration.
//
// Only the project URL and the publishable key. There is deliberately nothing
// else here: the publishable key grants no access on its own — `anon` holds no
// policy and no grant on any table — so every row a client sees is decided by
// their session and the policies in the database, never by this file.
export const SUPABASE_URL = 'https://buubrapkkqyalecwbhkh.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_h-KXdNNW7Tc_BFut25s_sQ_ypIidBJB';

// Length of the emailed sign-in code. This is a per-project Supabase setting
// (Authentication -> Providers -> Email -> Email OTP Length), not a fixed 6.
// Everything the client reads about length derives from CODE_LENGTH.
export const CODE_LENGTH = 8;
export const MIN_CODE_LENGTH = 6;
export const MAX_CODE_LENGTH = 10;

export const BRAND = {
  name: 'TaylorMade Brands',
  replyTo: 'josh@taylormadegrowth.com',
};

export const BUILD = 'p1';
