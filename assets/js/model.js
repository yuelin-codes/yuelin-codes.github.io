(function (global) {
  "use strict";

  var THEME_KEY = "baike-theme";
  var STRIPES = ["#e25b45", "#d4a574", "#6f8f72", "#c9846a", "#7f97ab", "#b56b84"];

  var ICONS = {
    sun:
      '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8">' +
      '<circle cx="12" cy="12" r="4"></circle>' +
      '<path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6" stroke-linecap="round"></path>' +
      "</svg>",
    moon:
      '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8">' +
      '<path d="M20.5 14.8A8.2 8.2 0 1 1 9.2 3.5a6.6 6.6 0 0 0 11.3 11.3z" stroke-linejoin="round"></path>' +
      "</svg>",
  };

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[ch];
    });
  }

  function asText(value) {
    if (typeof value === "string") return value;
    if (value == null) return "";
    return String(value);
  }

  function parseTags(value) {
    if (Array.isArray(value)) {
      return value
        .map(function (tag) {
          return asText(tag).trim();
        })
        .filter(Boolean);
    }
    return asText(value)
      .split(/[,，]/)
      .map(function (tag) {
        return tag.trim();
      })
      .filter(Boolean);
  }

  function uid(prefix) {
    return prefix + "-" + Math.random().toString(36).slice(2, 8);
  }

  function initial(name) {
    var chars = Array.from(asText(name).trim());
    return chars.length ? chars[0] : "·";
  }

  function uniqueId(raw, fallback, seen) {
    var base = asText(raw)
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^\w\-\u4e00-\u9fff]/g, "");
    if (!base) base = fallback;
    var id = base;
    var n = 2;
    while (seen.has(id)) {
      id = base + "-" + n;
      n += 1;
    }
    seen.add(id);
    return id;
  }

  function safeUrl(url) {
    var u = asText(url).trim();
    if (!u || /[\u0000-\u0020<>\\]/.test(u)) return "";
    if (u.indexOf("//") === 0) return "";
    var schemeMatch = /^([a-z][a-z0-9+.-]*):/i.exec(u);
    if (schemeMatch) {
      return /^https?$/i.test(schemeMatch[1]) ? u : "";
    }
    if (u.indexOf("/") === 0 || u.indexOf("./") === 0 || u.indexOf("../") === 0) return u;
    var pathOnly = u.split(/[?#]/)[0];
    var first = pathOnly.split("/")[0];
    if (first.indexOf(".") !== -1) return "https://" + u;
    if (/^[\w./~-]+$/.test(pathOnly)) return u;
    return "";
  }

  function normalizeLink(raw) {
    var link = raw && typeof raw === "object" ? raw : {};
    return {
      name: asText(link.name).trim(),
      url: asText(link.url).trim(),
      icon: asText(link.icon).trim(),
      description: asText(link.description).trim(),
      tags: parseTags(link.tags),
    };
  }

  function normalizeSub(raw, index, seen) {
    var sub = raw && typeof raw === "object" ? raw : {};
    return {
      id: uniqueId(sub.id, "sub-" + (index + 1), seen),
      name: asText(sub.name).trim() || "未命名子分类",
      links: Array.isArray(sub.links) ? sub.links.map(normalizeLink) : [],
    };
  }

  function normalizeCat(raw, index, seen) {
    var cat = raw && typeof raw === "object" ? raw : {};
    return {
      id: uniqueId(cat.id, "cat-" + (index + 1), seen),
      name: asText(cat.name).trim() || "未命名分类",
      blurb: asText(cat.blurb).trim(),
      links: Array.isArray(cat.links) ? cat.links.map(normalizeLink) : [],
      subcategories: Array.isArray(cat.subcategories)
        ? cat.subcategories.map(function (sub, subIndex) {
            return normalizeSub(sub, subIndex, seen);
          })
        : [],
    };
  }

  function normalizeAd(raw) {
    var ad = raw && typeof raw === "object" ? raw : {};
    return {
      enabled: ad.enabled !== false && ad.enabled !== "false",
      title: asText(ad.title).trim(),
      text: asText(ad.text).trim(),
      image: asText(ad.image).trim(),
      url: asText(ad.url).trim(),
    };
  }

  function normalizeFriend(raw) {
    var friend = raw && typeof raw === "object" ? raw : {};
    return {
      name: asText(friend.name).trim(),
      url: asText(friend.url).trim(),
      description: asText(friend.description).trim(),
    };
  }

  function normalize(raw) {
    var data = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    var site = data.site && typeof data.site === "object" ? data.site : {};
    var ads = data.ads && typeof data.ads === "object" ? data.ads : {};
    var seen = new Set();
    return {
      site: {
        title: asText(site.title).trim() || "百科导航",
        subtitle: asText(site.subtitle).trim(),
        description: asText(site.description).trim(),
        footerNote: asText(site.footerNote).trim(),
      },
      categories: Array.isArray(data.categories)
        ? data.categories.map(function (cat, index) {
            return normalizeCat(cat, index, seen);
          })
        : [],
      friends: Array.isArray(data.friends)
        ? data.friends.map(normalizeFriend).filter(function (friend) {
            return friend.name || friend.url;
          })
        : [],
      ads: {
        left: normalizeAd(ads.left),
        right: normalizeAd(ads.right),
      },
    };
  }

  function applyTheme(theme, persist) {
    var next = theme === "light" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", next === "light" ? "#f3efe6" : "#10120f");
    var dark = next !== "light";
    document.querySelectorAll("[data-theme-toggle]").forEach(function (btn) {
      btn.setAttribute("aria-label", dark ? "切换到浅色主题" : "切换到深色主题");
      btn.innerHTML = dark ? ICONS.sun : ICONS.moon;
    });
    if (persist) {
      try {
        localStorage.setItem(THEME_KEY, next);
      } catch (err) {
        /* ignore quota / private mode */
      }
    }
  }

  function bindTheme() {
    applyTheme(document.documentElement.getAttribute("data-theme"), false);
    document.addEventListener("click", function (event) {
      var btn = event.target.closest("[data-theme-toggle]");
      if (!btn) return;
      var current = document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
      applyTheme(current === "light" ? "dark" : "light", true);
    });
  }

  global.NavModel = {
    stripes: STRIPES,
    icons: ICONS,
    esc: esc,
    uid: uid,
    initial: initial,
    parseTags: parseTags,
    safeUrl: safeUrl,
    normalize: normalize,
    applyTheme: applyTheme,
    bindTheme: bindTheme,
  };
})(typeof window !== "undefined" ? window : globalThis);
