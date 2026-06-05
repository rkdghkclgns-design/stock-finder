// assets/config.js
// Public Supabase connection (publishable key is safe to expose — RLS allows read-only).
window.STOCK_FINDER_CONFIG = Object.freeze({
  SUPABASE_URL: "https://etasxbaorwgjoofdxean.supabase.co",
  SUPABASE_KEY: "sb_publishable_v9Hxgl906_7egC7Nim0MdQ_jN54qu5G",
  TABLE: "stock_finder_briefings",
  // Optional: set to enable the in-page "force refresh" button (must match the
  // ADMIN_SECRET edge-function secret). Leave empty to hide the button.
  ADMIN_SECRET: "",
});
