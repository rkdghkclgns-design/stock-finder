// assets/favorites.js
// User's favorited companies, persisted in localStorage. Immutable updates.

(function () {
  "use strict";

  const KEY = "stock_finder:favorites";

  function favKey(name, ticker) {
    return `${(ticker || "").trim()}|${(name || "").trim()}`.toLowerCase();
  }

  function read() {
    try {
      const v = JSON.parse(localStorage.getItem(KEY));
      return Array.isArray(v) ? v : [];
    } catch {
      return [];
    }
  }

  function write(list) {
    try {
      localStorage.setItem(KEY, JSON.stringify(list));
    } catch {
      /* storage unavailable; ignore */
    }
  }

  function getFavorites() {
    return read();
  }

  function isFavorite(key) {
    return read().some((f) => f.key === key);
  }

  /** item: { key, name, ticker, market } */
  function addFavorite(item) {
    const list = read();
    if (!item.key || list.some((f) => f.key === item.key)) return list;
    const next = [...list, item];
    write(next);
    return next;
  }

  function removeFavorite(key) {
    const next = read().filter((f) => f.key !== key);
    write(next);
    return next;
  }

  function toggleFavorite(item) {
    return isFavorite(item.key) ? removeFavorite(item.key) : addFavorite(item);
  }

  window.StockFinderFav = Object.freeze({
    favKey,
    getFavorites,
    isFavorite,
    addFavorite,
    removeFavorite,
    toggleFavorite,
  });
})();
