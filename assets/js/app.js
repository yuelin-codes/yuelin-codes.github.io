(function () {
  "use strict";

  var ENGINE_KEY = "baike-engine";
  var PREVIEW_KEY = "baike-preview";

  var ENGINES = {
    google: function (q) {
      return "https://www.google.com/search?q=" + encodeURIComponent(q);
    },
    bing: function (q) {
      return "https://www.bing.com/search?q=" + encodeURIComponent(q);
    },
    baidu: function (q) {
      return "https://www.baidu.com/s?wd=" + encodeURIComponent(q);
    },
    duckduckgo: function (q) {
      return "https://duckduckgo.com/?q=" + encodeURIComponent(q);
    },
  };

  var esc = NavModel.esc;
  var menu = document.getElementById("menu");
  var sectionsEl = document.getElementById("sections");
  var catalog = document.getElementById("catalog");
  var shell = document.getElementById("shell");
  var lead = document.getElementById("lead");
  var meta = document.getElementById("result-meta");
  var empty = document.getElementById("empty");
  var form = document.getElementById("search-form");
  var queryInput = document.getElementById("q");
  var engine = document.getElementById("engine");
  var clearBtn = document.getElementById("clear-q");
  var toTop = document.getElementById("to-top");

  var sectionObserver = null;
  var visible = new Map();
  var scrollLock = false;
  var filtering = false;
  var composing = false;

  NavModel.bindTheme();

  function syncTopbar() {
    var bar = document.querySelector(".topbar");
    if (!bar) return;
    document.documentElement.style.setProperty("--topbar-h", bar.offsetHeight + "px");
  }

  syncTopbar();
  window.addEventListener("resize", syncTopbar);
  if ("ResizeObserver" in window && document.querySelector(".topbar")) {
    new ResizeObserver(syncTopbar).observe(document.querySelector(".topbar"));
  }

  function hashId() {
    try {
      return decodeURIComponent((location.hash || "").slice(1));
    } catch (err) {
      return "";
    }
  }

  try {
    var savedEngine = localStorage.getItem(ENGINE_KEY);
    if (savedEngine && ENGINES[savedEngine]) engine.value = savedEngine;
  } catch (err) {
    /* ignore */
  }

  engine.addEventListener("change", function () {
    try {
      localStorage.setItem(ENGINE_KEY, engine.value);
    } catch (err) {
      /* ignore */
    }
  });

  function openExternal(q) {
    var build = ENGINES[engine.value] || ENGINES.google;
    var popup = window.open(build(q), "_blank");
    if (popup) popup.opener = null;
    return Boolean(popup);
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var q = queryInput.value.trim();
    if (!q) {
      queryInput.focus();
      return;
    }
    if (!openExternal(q)) {
      meta.hidden = false;
      meta.textContent = "浏览器拦截了弹出窗口。允许之后可以再用外部搜索。";
    }
  });

  queryInput.addEventListener("compositionstart", function () {
    composing = true;
  });
  queryInput.addEventListener("compositionend", function () {
    composing = false;
    applyFilter(queryInput.value);
  });
  queryInput.addEventListener("input", function () {
    if (!composing) applyFilter(queryInput.value);
    clearBtn.hidden = !queryInput.value;
  });
  clearBtn.addEventListener("click", function () {
    queryInput.value = "";
    clearBtn.hidden = true;
    applyFilter("");
    queryInput.focus();
  });

  window.addEventListener(
    "scroll",
    function () {
      toTop.hidden = window.scrollY < 480;
    },
    { passive: true }
  );
  toTop.addEventListener("click", function () {
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  catalog.addEventListener("click", function (event) {
    if (event.target.id === "retry") boot();
  });

  function haystack(link) {
    return [link.name, link.description, (link.tags || []).join(" "), link.url]
      .join(" ")
      .toLowerCase();
  }

  function cardHTML(link, mark) {
    var href = NavModel.safeUrl(link.url);
    var icon = NavModel.safeUrl(link.icon);
    var letter = esc(NavModel.initial(link.name));
    var tags = (link.tags || [])
      .map(function (tag) {
        return '<span class="tag">' + esc(tag) + "</span>";
      })
      .join("");
    var inner =
      '<span class="card-top"><span class="avatar" style="--mark:' +
      esc(mark) +
      '"' +
      (icon ? ' data-icon="' + esc(icon) + '"' : "") +
      '><span class="avatar-letter">' +
      letter +
      "</span>" +
      '</span><span class="card-name">' +
      esc(link.name || "未命名") +
      "</span></span>" +
      (link.description ? '<span class="card-desc">' + esc(link.description) + "</span>" : "") +
      (tags ? '<span class="tags">' + tags + "</span>" : "");
    var attrs =
      ' class="card" data-hay="' +
      esc(haystack(link)) +
      '" style="--mark:' +
      esc(mark) +
      '"';
    if (!href) return "<div" + attrs + ">" + inner + "</div>";
    return (
      '<a' +
      attrs +
      ' href="' +
      esc(href) +
      '" target="_blank" rel="noopener noreferrer">' +
      inner +
      "</a>"
    );
  }

  function cardsHTML(links, mark) {
    if (!links.length) return "";
    return (
      '<div class="cards">' +
      links
        .map(function (link) {
          return cardHTML(link, mark);
        })
        .join("") +
      "</div>"
    );
  }

  function renderMenu(categories) {
    var html = '<div class="nav-label">分类</div>';
    categories.forEach(function (cat) {
      html +=
        '<a href="#sec-' +
        esc(cat.id) +
        '" data-target="sec-' +
        esc(cat.id) +
        '">' +
        esc(cat.name) +
        "</a>";
      (cat.subcategories || []).forEach(function (sub) {
        if (!sub.links.length) return;
        html +=
          '<a class="sub" href="#sec-' +
          esc(sub.id) +
          '" data-target="sec-' +
          esc(sub.id) +
          '" data-parent="sec-' +
          esc(cat.id) +
          '">' +
          esc(sub.name) +
          "</a>";
      });
    });
    menu.innerHTML = html;
  }

  function renderCatalog(data) {
    var html = "";
    data.categories.forEach(function (cat, index) {
      var mark = NavModel.stripes[index % NavModel.stripes.length];
      var subs = (cat.subcategories || [])
        .filter(function (sub) {
          return sub.links.length;
        })
        .map(function (sub) {
          return (
            '<div class="sub" data-group id="sec-' +
            esc(sub.id) +
            '"><h3 class="sub-head">' +
            esc(sub.name) +
            "</h3>" +
            cardsHTML(sub.links, mark) +
            "</div>"
          );
        })
        .join("");
      var direct = cardsHTML(cat.links, mark);
      var emptyNote =
        !cat.links.length && !subs
          ? '<p class="empty-inline">这个分类还没有链接。</p>'
          : "";
      html +=
        '<section class="section" data-group id="sec-' +
        esc(cat.id) +
        '"><header class="section-head"><span class="idx">' +
        String(index + 1).padStart(2, "0") +
        "</span><div><h2>" +
        esc(cat.name) +
        "</h2>" +
        (cat.blurb ? "<p>" + esc(cat.blurb) + "</p>" : "") +
        "</div></header>" +
        direct +
        emptyNote +
        subs +
        "</section>";
    });
    if (!data.categories.length) {
      html = '<div class="empty">目录还是空的。打开管理页就能添加分类和链接。</div>';
    }
    sectionsEl.innerHTML = html;
  }

  function renderAd(ad, el) {
    var show = ad && ad.enabled && (ad.title || ad.text || ad.image);
    if (!show) {
      el.hidden = true;
      el.innerHTML = "";
      return false;
    }
    var image = NavModel.safeUrl(ad.image);
    var href = NavModel.safeUrl(ad.url);
    var img = image ? '<span class="ad-media" data-icon="' + esc(image) + '"></span>' : "";
    var body =
      '<span class="ad-kicker">广告</span>' +
      img +
      (ad.title ? "<strong>" + esc(ad.title) + "</strong>" : "") +
      (ad.text ? "<p>" + esc(ad.text) + "</p>" : "");
    el.hidden = false;
    el.innerHTML = href
      ? '<a class="ad" href="' +
        esc(href) +
        '" target="_blank" rel="sponsored noopener noreferrer">' +
        body +
        "</a>"
      : '<div class="ad">' + body + "</div>";
    return true;
  }

  function renderFriends(friends) {
    var block = document.getElementById("friend-block");
    var list = document.getElementById("friend-list");
    if (!friends.length) {
      block.hidden = true;
      list.innerHTML = "";
      return;
    }
    block.hidden = false;
    list.innerHTML = friends
      .map(function (friend) {
        var href = NavModel.safeUrl(friend.url);
        var name = esc(friend.name || href || "未命名");
        var desc = friend.description ? "<span>" + esc(friend.description) + "</span>" : "";
        var label = href
          ? '<a href="' + hrefEsc(href) + '" target="_blank" rel="noopener noreferrer">' + name + "</a>"
          : "<span>" + name + "</span>";
        return "<li>" + label + desc + "</li>";
      })
      .join("");
  }

  function hrefEsc(url) {
    return esc(url);
  }

  function lazyImages(root) {
    var nodes = Array.prototype.slice.call(root.querySelectorAll("[data-icon]"));
    if (!nodes.length) return;
    function load(node) {
      var url = node.getAttribute("data-icon");
      node.removeAttribute("data-icon");
      if (!url) return;
      var img = document.createElement("img");
      img.className = node.classList.contains("avatar") ? "avatar-img" : "ad-img";
      img.alt = "";
      img.referrerPolicy = "no-referrer";
      img.decoding = "async";
      img.addEventListener(
        "error",
        function () {
          img.remove();
        },
        { once: true }
      );
      img.src = url;
      node.appendChild(img);
    }
    if (!("IntersectionObserver" in window)) {
      nodes.forEach(load);
      return;
    }
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          load(entry.target);
          io.unobserve(entry.target);
        });
      },
      { rootMargin: "160px" }
    );
    nodes.forEach(function (node) {
      io.observe(node);
    });
  }

  function setActive(id) {
    var links = menu.querySelectorAll("a[data-target]");
    var parent = "";
    links.forEach(function (link) {
      var on = link.dataset.target === id;
      link.classList.toggle("is-active", on);
      if (on) {
        link.setAttribute("aria-current", "location");
        parent = link.dataset.parent || "";
      } else {
        link.removeAttribute("aria-current");
      }
    });
    links.forEach(function (link) {
      link.classList.toggle("is-parent", Boolean(parent) && link.dataset.target === parent);
    });
  }

  function scrollToId(id, smooth) {
    var el = document.getElementById(id);
    if (!el) return;
    scrollLock = true;
    setActive(id);
    el.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
    window.setTimeout(function () {
      scrollLock = false;
    }, smooth ? 800 : 50);
  }

  function watchSections() {
    if (sectionObserver) sectionObserver.disconnect();
    visible = new Map();
    var nodes = Array.prototype.slice.call(document.querySelectorAll(".section[id], .sub[id]"));
    if (!("IntersectionObserver" in window)) {
      if (nodes[0]) setActive(nodes[0].id);
      return;
    }
    sectionObserver = new IntersectionObserver(
      function (entries) {
        if (scrollLock || filtering) return;
        entries.forEach(function (entry) {
          if (entry.isIntersecting) visible.set(entry.target.id, entry.boundingClientRect.top);
          else visible.delete(entry.target.id);
        });
        var best = "";
        var bestTop = Infinity;
        visible.forEach(function (top, id) {
          var score = Math.abs(top - 90);
          if (score < bestTop) {
            bestTop = score;
            best = id;
          }
        });
        if (best) setActive(best);
      },
      { rootMargin: "-12% 0px -55% 0px", threshold: [0.15, 0.4, 0.7] }
    );
    nodes.forEach(function (node) {
      sectionObserver.observe(node);
    });
  }

  menu.addEventListener("click", function (event) {
    var link = event.target.closest("a[data-target]");
    if (!link) return;
    event.preventDefault();
    var id = link.dataset.target;
    if (!document.getElementById(id)) return;
    history.replaceState(null, "", "#" + encodeURIComponent(id));
    scrollToId(id, true);
  });

  window.addEventListener("hashchange", function () {
    var id = hashId();
    if (id) scrollToId(id, true);
  });

  function applyFilter(raw) {
    var query = String(raw || "").trim().toLowerCase();
    filtering = Boolean(query);
    var count = 0;
    document.querySelectorAll(".card").forEach(function (card) {
      var ok = !query || String(card.dataset.hay || "").indexOf(query) !== -1;
      card.hidden = !ok;
      if (ok) count += 1;
    });
    document.querySelectorAll("[data-group]").forEach(function (group) {
      var any = group.querySelector(".card:not([hidden])");
      group.hidden = Boolean(query) && !any;
    });
    if (query && count === 0) {
      empty.hidden = false;
      empty.textContent = "没有找到与「" + String(raw).trim() + "」相关的条目。";
    } else {
      empty.hidden = true;
      empty.textContent = "";
    }
    meta.hidden = !query;
    meta.textContent = query ? "找到 " + count + " 条" : "";
    if (lead.textContent) lead.hidden = Boolean(query);
    clearBtn.hidden = !queryInput.value;
  }

  function showPreviewBanner() {
    if (document.querySelector(".preview-banner")) return;
    var banner = document.createElement("div");
    banner.className = "preview-banner";
    banner.innerHTML =
      "正在预览还没导出的草稿。正式页面不会显示这些改动。<a href=\"index.html\">查看已发布版本</a>";
    document.getElementById("app").prepend(banner);
  }

  async function loadData() {
    var preview = new URLSearchParams(location.search).get("preview") === "1";
    if (preview) {
      try {
        var raw = localStorage.getItem(PREVIEW_KEY);
        if (raw) return { data: NavModel.normalize(JSON.parse(raw)), preview: true };
      } catch (err) {
        /* fall through to the published file */
      }
    }
    var response = await fetch("data/sites.json", { cache: "no-cache" });
    if (!response.ok) throw new Error("status " + response.status);
    return { data: NavModel.normalize(await response.json()), preview: false };
  }

  function paint(payload) {
    var data = payload.data;
    document.title = (payload.preview ? "预览 · " : "") + (data.site.title || "百科导航");
    var desc = document.querySelector('meta[name="description"]');
    if (desc && data.site.description) desc.setAttribute("content", data.site.description);
    document.getElementById("site-title").textContent = data.site.title || "百科导航";
    document.getElementById("site-sub").textContent = data.site.subtitle || "";
    document.getElementById("foot-title").textContent = data.site.title || "百科导航";
    document.getElementById("foot-note").textContent = data.site.footerNote || "";
    document.getElementById("year").textContent = String(new Date().getFullYear());
    lead.textContent = data.site.description || "";
    lead.hidden = !data.site.description;
    if (payload.preview) showPreviewBanner();
    renderMenu(data.categories);
    renderCatalog(data);
    var leftOn = renderAd(data.ads.left, document.getElementById("rail-left"));
    var rightOn = renderAd(data.ads.right, document.getElementById("rail-right"));
    shell.classList.add("is-ready");
    shell.classList.toggle("has-left", leftOn);
    shell.classList.toggle("has-right", rightOn);
    renderFriends(data.friends);
    lazyImages(document);
    watchSections();
    if (data.categories[0]) setActive("sec-" + data.categories[0].id);
    syncTopbar();
    applyFilter(queryInput.value);
    var id = hashId();
    if (id) scrollToId(id, false);
  }

  async function boot() {
    sectionsEl.innerHTML = '<p class="loading">正在读取目录…</p>';
    try {
      paint(await loadData());
    } catch (err) {
      sectionsEl.innerHTML =
        '<div class="notice"><p>没有读到 data/sites.json。</p><p>请用静态服务器打开这个目录，不要直接双击文件。例如运行 <code>python3 -m http.server</code>。</p><p><button type="button" class="btn btn-ghost" id="retry">重试</button></p></div>';
    }
  }

  boot();
})();
