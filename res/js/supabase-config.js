window.SUPABASE_CONFIG = {
  url: 'https://iaewobmdruabgqwmcytw.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlhZXdvYm1kcnVhYmdxd21jeXR3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyMDM4NjYsImV4cCI6MjA4OTc3OTg2Nn0.hLMBDDrrNryg3W9cdCRYm5WASfGPOOm6oN10gIwdGqQ'
};

// Create shared client instance
window.SUPABASE_CLIENT = window.supabase.createClient(
  window.SUPABASE_CONFIG.url,
  window.SUPABASE_CONFIG.anonKey
);
