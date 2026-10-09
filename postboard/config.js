// Post Board settings.
// To share one live board between computers, create a free Supabase project, run postboard/supabase.sql in it,
// then paste the project's URL and anon (public) key below. The anon key is meant to be public: the database
// refuses every call that doesn't carry the right PIN. Leave both empty to keep the board on each computer only.
window.PB_CONFIG = {
  supabaseUrl: "",
  supabaseAnonKey: "",
};
