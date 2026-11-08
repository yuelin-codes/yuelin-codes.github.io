(function () {
  "use strict";

  // 可选管理口令。留空表示不启用。
  // 这不是安全功能：口令以明文写在本文件里，任何人查看源码都能绕过。
  var ADMIN_PASSPHRASE = "";

  var SESSION_KEY = "baike-admin";
  var PREVIEW_KEY = "baike-preview";

  var esc = NavModel.esc;
  var state = null;
  var dirty = false;
  var openCats = new Set([0]);
  var focusPath = "";

  var booting = document.getElementById("booting");
  var gate = document.getElementById("pass-gate");
  var editor = document.getElementById("editor");
  var studio = document.getElementById("studio");
  var statusEl = document.getElementById("status");
  var statsEl = document.getElementById("stats");
  var passForm = document.getElementById("pass-form");
  var passInput = document.getElementById("pass");
  var passError = document.getElementById("pass-error");

  NavModel.bindTheme();

  function fingerprint(value) {
    var hash = 0;
    var text = String(value);
    for (var i = 0; i < text.length; i += 1) {
      hash = (Math.imul(hash, 131) + text.charCodeAt(i)) >>> 0;
    }
    return String(hash);
  }

  function setStatus(message, isError) {
    statusEl.textContent = message || "";
    statusEl.classList.toggle("is-error", Boolean(isError));
  }

  function sessionOk() {
    if (!ADMIN_PASSPHRASE) return true;
    try {
      return sessionStorage.getItem(SESSION_KEY) === fingerprint(ADMIN_PASSPHRASE);
    } catch (err) {
      return false;
    }
  }

  function countLinks() {
    var total = 0;
    state.categories.forEach(function (cat) {
      total += cat.links.length;
      (cat.subcategories || []).forEach(function (sub) {
        total += sub.links.length;
      });
    });
    return total;
  }

  function updateStats() {
    if (!state) {
      statsEl.textContent = "";
      return;
    }
    statsEl.textContent =
      state.categories.length +
      " 个分类 · " +
      countLinks() +
      " 条链接 · " +
      state.friends.length +
      " 个友链" +
      (dirty ? " · 有未导出的修改" : "");
  }

  function setByPath(obj, path, value) {
    var parts = path.split(".");
    var cursor = obj;
    for (var i = 0; i < parts.length - 1; i += 1) {
      var key = /^\d+$/.test(parts[i]) ? Number(parts[i]) : parts[i];
      cursor = cursor[key];
    }
    var last = parts[parts.length - 1];
    cursor[/^\d+$/.test(last) ? Number(last) : last] = value;
  }

  function linksAt(catIndex, subIndex) {
    var cat = state.categories[catIndex];
    if (!cat) return null;
    if (subIndex === undefined || subIndex === null || subIndex === "") return cat.links;
    var sub = cat.subcategories[Number(subIndex)];
    return sub ? sub.links : null;
  }

  function moveItem(list, index, dir) {
    var next = index + dir;
    if (!list || next < 0 || next >= list.length) return;
    var item = list.splice(index, 1)[0];
    list.splice(next, 0, item);
  }

  function shiftOpen(from, dir) {
    var next = new Set();
    openCats.forEach(function (index) {
      if (dir < 0 && index === from) return;
      if (index > from) next.add(index + dir);
      else if (index !== from) next.add(index);
    });
    openCats = next;
  }

function field(label, path, value, extra) {
  var attrs = extra || "";
  var wide = attrs.indexOf("span-2") !== -1;
  attrs = attrs.replace(/\s*class="span-2"\s*/g, " ").trim();
  return (
    '<label class="stack' +
    (wide ? " span-2" : "") +
    '">' +
    esc(label) +
    '<input type="text" autocomplete="off" data-path="' +
    esc(path) +
    '" value="' +
    esc(value || "") +
    '"' +
    (attrs ? " " + attrs : "") +
    "></label>"
  );
}

  function area(label, path, value) {
    return (
      '<label class="stack span-2">' +
      esc(label) +
      '<textarea data-path="' +
      esc(path) +
      '" autocomplete="off">' +
      esc(value || "") +
      "</textarea></label>"
    );
  }

  function moveButtons(act, attrs, index, length) {
    return (
      '<button type="button" class="btn btn-tiny btn-ghost" data-act="' +
      act +
      '-up" ' +
      attrs +
      (index === 0 ? " disabled" : "") +
      ">上移</button>" +
      '<button type="button" class="btn btn-tiny btn-ghost" data-act="' +
      act +
      '-down" ' +
      attrs +
      (index === length - 1 ? " disabled" : "") +
      ">下移</button>"
    );
  }

  function linkEditor(link, catIndex, subIndex, linkIndex, length) {
    var path =
      subIndex === null
        ? "categories." + catIndex + ".links." + linkIndex
        : "categories." + catIndex + ".subcategories." + subIndex + ".links." + linkIndex;
    var attrs =
      'data-i="' +
      catIndex +
      '" data-j="' +
      (subIndex === null ? "" : subIndex) +
      '" data-k="' +
      linkIndex +
      '"';
    var mark = NavModel.stripes[catIndex % NavModel.stripes.length];
    return (
      '<article class="edit-card"><header><strong class="cat-title"><span class="mini-avatar" style="--mark:' +
      mark +
      '">' +
      esc(NavModel.initial(link.name)) +
      "</span>" +
      esc(link.name || "未命名链接") +
      '</strong><div class="row-actions">' +
      moveButtons("link", attrs, linkIndex, length) +
      '<button type="button" class="btn btn-tiny btn-danger" data-act="link-del" ' +
      attrs +
      ' aria-label="删除链接 ' +
      esc(link.name || "") +
      '">删除</button></div></header><div class="form-grid">' +
      field("名称", path + ".name", link.name) +
      field("地址", path + ".url", link.url, 'spellcheck="false" inputmode="url"') +
      field("图标地址", path + ".icon", link.icon, 'class="span-2" placeholder="留空则用字母头像" spellcheck="false"') +
      area("简介", path + ".description", link.description) +
      field("标签", path + ".tags", (link.tags || []).join("，"), 'class="span-2" data-kind="tags" placeholder="用逗号分隔"') +
      "</div></article>"
    );
  }

  function linkGroup(links, catIndex, subIndex) {
    if (!links.length) return '<p class="hint">还没有链接。</p>';
    return links
      .map(function (link, index) {
        return linkEditor(link, catIndex, subIndex, index, links.length);
      })
      .join("");
  }

  function render() {
    var y = window.scrollY;
    var site = state.site;
    var cats = state.categories
      .map(function (cat, index) {
        var open = openCats.has(index);
        var mark = NavModel.stripes[index % NavModel.stripes.length];
        var linkCount =
          cat.links.length +
          cat.subcategories.reduce(function (sum, sub) {
            return sum + sub.links.length;
          }, 0);
        var attrs = 'data-i="' + index + '"';
        var subs = cat.subcategories
          .map(function (sub, subIndex) {
            var subAttrs = 'data-i="' + index + '" data-j="' + subIndex + '"';
            return (
              '<div class="sub-block"><div class="block-head"><h3>' +
              esc(sub.name) +
              '</h3><div class="row-actions">' +
              moveButtons("sub", subAttrs, subIndex, cat.subcategories.length) +
              '<button type="button" class="btn btn-tiny btn-danger" data-act="sub-del" ' +
              subAttrs +
              ">删除子分类</button></div></div>" +
              field("子分类名称", "categories." + index + ".subcategories." + subIndex + ".name", sub.name) +
              '<p class="group-label">该子分类下的链接</p>' +
              linkGroup(sub.links, index, subIndex) +
              '<button type="button" class="btn btn-tiny btn-ghost" data-act="link-add" ' +
              subAttrs +
              ">添加链接</button></div>"
            );
          })
          .join("");
        return (
          '<section class="cat-block" style="--mark:' +
          mark +
          '"><div class="block-head"><div class="cat-title"><span class="mini-avatar" style="--mark:' +
          mark +
          '">' +
          String(index + 1).padStart(2, "0") +
          "</span><strong>" +
          esc(cat.name) +
          "</strong><span class=\"hint\">" +
          linkCount +
          ' 条</span></div><div class="row-actions">' +
          '<button type="button" class="btn btn-tiny btn-ghost" data-act="toggle-cat" ' +
          attrs +
          ' aria-expanded="' +
          (open ? "true" : "false") +
          '">' +
          (open ? "收起" : "展开") +
          "</button>" +
          moveButtons("cat", attrs, index, state.categories.length) +
          '<button type="button" class="btn btn-tiny btn-danger" data-act="cat-del" ' +
          attrs +
          ">删除</button></div></div>" +
          (open
            ? '<div class="form-grid">' +
              field("名称", "categories." + index + ".name", cat.name) +
              field("标识", "categories." + index + ".id", cat.id, 'spellcheck="false"') +
              area("简介", "categories." + index + ".blurb", cat.blurb) +
              '</div><p class="group-label">直属链接</p>' +
              linkGroup(cat.links, index, null) +
              '<button type="button" class="btn btn-tiny btn-ghost" data-act="link-add" data-i="' +
              index +
              '" data-j="">添加链接</button><p class="group-label">子分类</p>' +
              (subs || '<p class="hint">没有子分类也可以，链接会直接出现在这个分类下。</p>') +
              '<button type="button" class="btn btn-tiny btn-ghost" data-act="sub-add" data-i="' +
              index +
              '">添加子分类</button>'
            : "") +
          "</section>"
        );
      })
      .join("");

    var friends = state.friends.length
      ? state.friends
          .map(function (friend, index) {
            var attrs = 'data-i="' + index + '"';
            return (
              '<article class="friend-card"><div class="block-head"><strong>' +
              esc(friend.name || "未命名友链") +
              '</strong><div class="row-actions">' +
              moveButtons("friend", attrs, index, state.friends.length) +
              '<button type="button" class="btn btn-tiny btn-danger" data-act="friend-del" ' +
              attrs +
              ">删除</button></div></div><div class=\"form-grid\">" +
              field("名称", "friends." + index + ".name", friend.name) +
              field("地址", "friends." + index + ".url", friend.url, 'spellcheck="false"') +
              field("说明", "friends." + index + ".description", friend.description, 'class="span-2"') +
              "</div></article>"
            );
          })
          .join("")
      : '<p class="hint">还没有友情链接。</p>';

    function adFields(side, label) {
      var ad = state.ads[side];
      var base = "ads." + side;
      return (
        "<fieldset><legend>" +
        esc(label) +
        '</legend><label class="check"><input type="checkbox" data-path="' +
        base +
        '.enabled"' +
        (ad.enabled ? " checked" : "") +
        ">显示这个广告位</label><div class=\"form-grid\">" +
        field("标题", base + ".title", ad.title) +
        field("链接", base + ".url", ad.url, 'spellcheck="false"') +
        field("图片地址", base + ".image", ad.image, 'class="span-2" placeholder="可留空" spellcheck="false"') +
        area("文字", base + ".text", ad.text) +
        "</div></fieldset>"
      );
    }

    var passNote = ADMIN_PASSPHRASE
      ? "已要求先输入口令才能打开此页。口令写在脚本明文里，挡不住会看源码的人，不能当作真正的安全措施。"
      : "当前没有设置管理口令。知道网址的人都能打开此页。若要加一道很浅的门槛，可编辑 assets/js/admin.js 顶部的 ADMIN_PASSPHRASE。";

    studio.innerHTML =
      '<section class="panel" id="panel-site"><div class="panel-head"><h2>站点信息</h2></div><div class="form-grid">' +
      field("标题", "site.title", site.title) +
      field("副标题", "site.subtitle", site.subtitle) +
      area("简介", "site.description", site.description) +
      area("页脚说明", "site.footerNote", site.footerNote) +
      "</div></section>" +
      '<section class="panel" id="panel-cats"><div class="panel-head"><div><h2>分类与链接</h2><p>用上移、下移调整顺序。收起分类不会删掉里面的内容。</p></div><button type="button" class="btn btn-primary" data-act="cat-add">添加分类</button></div>' +
      (cats || '<p class="hint">还没有分类。</p>') +
      "</section>" +
      '<section class="panel" id="panel-friends"><div class="panel-head"><div><h2>友情链接</h2><p>显示在前台页脚。</p></div><button type="button" class="btn btn-ghost" data-act="friend-add">添加友链</button></div>' +
      friends +
      "</section>" +
      '<section class="panel" id="panel-ads"><div class="panel-head"><div><h2>广告位</h2><p>左右各一个。宽度不够时前台会把它们藏起来。</p></div><button type="button" class="btn btn-ghost" data-act="ads-swap">左右对调</button></div><div class="ad-edit-grid">' +
      adFields("left", "左侧") +
      adFields("right", "右侧") +
      '</div></section><p class="security-note">' +
      esc(passNote) +
      "</p>";

    updateStats();
    if (focusPath) {
      var target = studio.querySelector('[data-path="' + CSS.escape(focusPath) + '"]');
      focusPath = "";
      if (target) {
        target.focus();
        target.scrollIntoView({ block: "center" });
        return;
      }
    }
    window.scrollTo(0, y);
  }

  function onField(event) {
    var el = event.target;
    if (!el || !el.dataset || !el.dataset.path || !state) return;
    var value;
    if (el.type === "checkbox") value = el.checked;
    else if (el.dataset.kind === "tags") value = NavModel.parseTags(el.value);
    else value = el.value;
    setByPath(state, el.dataset.path, value);
    dirty = true;
    updateStats();
    setStatus("有修改尚未导出。");
  }

  studio.addEventListener("input", onField);
  studio.addEventListener("change", onField);

  studio.addEventListener("click", function (event) {
    var btn = event.target.closest("[data-act]");
    if (!btn || !state) return;
    var act = btn.dataset.act;
    var i = btn.dataset.i === undefined ? -1 : Number(btn.dataset.i);
    var j = btn.dataset.j;
    var k = btn.dataset.k === undefined ? -1 : Number(btn.dataset.k);
    var cat = state.categories[i];

    if (act === "toggle-cat") {
      if (openCats.has(i)) openCats.delete(i);
      else openCats.add(i);
    } else if (act === "cat-add") {
      state.categories.push({
        id: NavModel.uid("cat"),
        name: "新分类",
        blurb: "",
        links: [],
        subcategories: [],
      });
      openCats.add(state.categories.length - 1);
      focusPath = "categories." + (state.categories.length - 1) + ".name";
      dirty = true;
    } else if (act === "cat-del") {
      if (!cat) return;
      if (!window.confirm("删除分类「" + (cat.name || "未命名") + "」？里面的链接会一起去掉。")) return;
      state.categories.splice(i, 1);
      shiftOpen(i, -1);
      dirty = true;
    } else if (act === "cat-up" || act === "cat-down") {
      var dir = act === "cat-up" ? -1 : 1;
      var other = i + dir;
      if (other < 0 || other >= state.categories.length) return;
      moveItem(state.categories, i, dir);
      var was = openCats.has(i);
      var wasOther = openCats.has(other);
      openCats.delete(i);
      openCats.delete(other);
      if (was) openCats.add(other);
      if (wasOther) openCats.add(i);
      dirty = true;
    } else if (act === "sub-add") {
      if (!cat) return;
      cat.subcategories.push({ id: NavModel.uid("sub"), name: "新子分类", links: [] });
      openCats.add(i);
      focusPath = "categories." + i + ".subcategories." + (cat.subcategories.length - 1) + ".name";
      dirty = true;
    } else if (act === "sub-del") {
      if (!cat) return;
      var sub = cat.subcategories[Number(j)];
      if (!sub) return;
      if (!window.confirm("删除子分类「" + (sub.name || "未命名") + "」？")) return;
      cat.subcategories.splice(Number(j), 1);
      dirty = true;
    } else if (act === "sub-up" || act === "sub-down") {
      if (!cat) return;
      moveItem(cat.subcategories, Number(j), act === "sub-up" ? -1 : 1);
      dirty = true;
    } else if (act === "link-add") {
      var list = linksAt(i, j);
      if (!list) return;
      list.push({
        name: "新链接",
        url: "https://example.com",
        icon: "",
        description: "",
        tags: ["示例"],
      });
      var pathBase =
        j === ""
          ? "categories." + i + ".links." + (list.length - 1)
          : "categories." + i + ".subcategories." + j + ".links." + (list.length - 1);
      focusPath = pathBase + ".name";
      openCats.add(i);
      dirty = true;
    } else if (act === "link-del") {
      var linkList = linksAt(i, j);
      if (!linkList || !linkList[k]) return;
      if (!window.confirm("删除「" + (linkList[k].name || "未命名链接") + "」？")) return;
      linkList.splice(k, 1);
      dirty = true;
    } else if (act === "link-up" || act === "link-down") {
      moveItem(linksAt(i, j), k, act === "link-up" ? -1 : 1);
      dirty = true;
    } else if (act === "friend-add") {
      state.friends.push({ name: "新友链", url: "https://example.com", description: "" });
      focusPath = "friends." + (state.friends.length - 1) + ".name";
      dirty = true;
    } else if (act === "friend-del") {
      if (!state.friends[i]) return;
      state.friends.splice(i, 1);
      dirty = true;
    } else if (act === "friend-up" || act === "friend-down") {
      moveItem(state.friends, i, act === "friend-up" ? -1 : 1);
      dirty = true;
    } else if (act === "ads-swap") {
      var left = state.ads.left;
      state.ads.left = state.ads.right;
      state.ads.right = left;
      dirty = true;
    } else {
      return;
    }
    render();
  });

  function download(filename, text) {
    var blob = new Blob([text], { type: "application/json;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1500);
  }

  function exportJson() {
    if (!state) return;
    state = NavModel.normalize(state);
    dirty = false;
    render();
    download("sites.json", JSON.stringify(state, null, 2) + "\n");
    setStatus("已下载 sites.json。请用它覆盖服务器上的 data/sites.json，然后刷新前台。");
  }

  function preview() {
    if (!state) return;
    try {
      localStorage.setItem(PREVIEW_KEY, JSON.stringify(NavModel.normalize(state)));
    } catch (err) {
      setStatus("浏览器拒绝保存草稿，暂时无法预览。", true);
      return;
    }
    var popup = window.open("index.html?preview=1", "_blank");
    if (popup) popup.opener = null;
    else setStatus("浏览器拦截了预览窗口。请允许弹出窗口后再试。", true);
  }

  async function loadFromFile() {
    try {
      var response = await fetch("data/sites.json", { cache: "no-cache" });
      if (!response.ok) throw new Error("HTTP " + response.status);
      state = NavModel.normalize(await response.json());
      openCats = new Set(state.categories.length ? [0] : []);
      dirty = false;
      render();
      setStatus("已从 data/sites.json 读取。改完请导出并自行上传。");
    } catch (err) {
      studio.innerHTML =
        '<div class="notice">读不到 data/sites.json。请通过静态服务器打开 admin.html，例如 <code>python3 -m http.server</code>。</div>';
      setStatus("读取失败。", true);
    }
  }

  function importText(text) {
    var parsed = JSON.parse(String(text).replace(/^\uFEFF/, ""));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("根节点必须是 JSON 对象");
    }
    state = NavModel.normalize(parsed);
    openCats = new Set(state.categories.length ? [0] : []);
    dirty = true;
    render();
    setStatus("已导入到编辑器。它还没写回服务器，记得导出并覆盖 data/sites.json。");
  }

  document.getElementById("export").addEventListener("click", exportJson);
  document.getElementById("preview").addEventListener("click", preview);
  document.getElementById("reload").addEventListener("click", function () {
    if (dirty && !window.confirm("重新读取会丢掉还没导出的修改。继续？")) return;
    loadFromFile();
  });
  document.getElementById("import-btn").addEventListener("click", function () {
    document.getElementById("import-file").click();
  });
  document.getElementById("import-file").addEventListener("change", function (event) {
    var file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        importText(reader.result);
      } catch (err) {
        setStatus("导入失败：" + (err && err.message ? err.message : "无法解析"), true);
      }
    };
    reader.onerror = function () {
      setStatus("读取文件失败。", true);
    };
    reader.readAsText(file, "utf-8");
  });

  document.addEventListener("keydown", function (event) {
    if ((event.ctrlKey || event.metaKey) && (event.key === "s" || event.key === "S")) {
      if (editor.hidden) return;
      event.preventDefault();
      exportJson();
    }
  });

  passForm.addEventListener("submit", function (event) {
    event.preventDefault();
    if (passInput.value === ADMIN_PASSPHRASE) {
      try {
        sessionStorage.setItem(SESSION_KEY, fingerprint(ADMIN_PASSPHRASE));
      } catch (err) {
        /* continue for this view even if storage is blocked */
      }
      passError.hidden = true;
      showEditor();
    } else {
      passError.hidden = false;
      passInput.select();
    }
  });

  function showEditor() {
    gate.hidden = true;
    editor.hidden = false;
    booting.hidden = true;
    loadFromFile();
  }

  function showGate() {
    booting.hidden = true;
    editor.hidden = true;
    gate.hidden = false;
    passInput.focus();
  }

  if (ADMIN_PASSPHRASE && !sessionOk()) showGate();
  else showEditor();
})();
